-- 👥 フォロー（2026-11-21 オーナー「その人をフォロー、フォロワーにすることができるようにして、フォロー認証をされたら常に見ることができるように」）
--
-- 決まり（オーナー裁定）:
--   - 相手を見つけるのは、相手が渡したリンク（/u/<public_id>）か ID だけ。名前で探す機能は作らない。
--   - フォローは申し込み → 相手が「承認」したときだけ成り立つ。承認された人は、相手の本棚と「この本のまとめ」を
--     いつでも見られる（公開するがオフでも・本人が公開の本棚から外した本は出さない）。
--   - ブロックすると、その人とのフォローは両方向とも消え、申し込みも見ることもできなくなる。
--   - 登録せずに始めた人（匿名のアカウント）とニックネームの無い人は、申し込めない（なりすまし・使い捨てを防ぐ）。
-- 読み書きはすべて下の関数（SECURITY DEFINER・ログインした人だけ）。表はクライアントから直接は書けない。
-- 依存: supabase_profiles.sql（profiles・public_id）。books（書名・表紙・状態・評価・leverage_memo＝この本のまとめ）。
-- 退会は auth.users の削除で ON DELETE CASCADE で消える。
-- 未適用でも壊れない（アプリはフォローの画面で「まだ使えません」と出す）。冪等。

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, followee_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'follows_check') then
    alter table public.follows add constraint follows_check check (
      status in ('pending', 'accepted') and follower_id <> followee_id
    );
  end if;
end $$;

create index if not exists follows_followee_idx on public.follows (followee_id, status);
alter table public.follows enable row level security;
drop policy if exists "follows_select_own" on public.follows;
create policy "follows_select_own" on public.follows
  for select to authenticated using (auth.uid() = follower_id or auth.uid() = followee_id);
-- 書き込みのポリシーは無い＝関数だけが書く。

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own" on public.user_blocks
  for select to authenticated using (auth.uid() = blocker_id);

-- ─── 小さな助け ───────────────────────────────────────────
-- 呼んだ人（匿名でない・ログインしている）。
create or replace function public._follow_me()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return auth.uid();
end;
$$;

-- 匿名のアカウントか（auth.users の今の値・supabase_profiles.sql の _auth_is_anonymous・2026-11-22）。
create or replace function public._is_anonymous()
returns boolean
language sql
stable
as $$ select public._auth_is_anonymous() $$;

-- public_id → user_id（運営が隠した人は見つからない）。
create or replace function public._user_by_public_id(p_public_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.profiles
   where public_id = lower(trim(coalesce(p_public_id, ''))) and hidden = false
   limit 1
$$;

create or replace function public._blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_blocks
                  where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- 人の短い見え方（一覧に出すもの）。
create or replace function public._person(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('public_id', p.public_id, 'nickname', p.nickname, 'avatar', p.avatar)
    from public.profiles p where p.user_id = p_user
$$;

-- ─── 申し込む・答える・やめる ─────────────────────────────
-- 戻り値: 'pending'（申し込んだ）・'accepted'（もう承認されている）・'self'・'not_found'・'no_profile'・'anonymous'
create or replace function public.follow_request(p_public_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  target uuid;
  st text;
begin
  if public._is_anonymous() then return 'anonymous'; end if;
  if not exists (select 1 from public.profiles where user_id = me and nickname <> '' and hidden = false) then
    return 'no_profile';
  end if;
  target := public._user_by_public_id(p_public_id);
  if target is null then return 'not_found'; end if;
  if target = me then return 'self'; end if;
  -- ブロックの有無は明かさない（見つからないのと同じ答え）。
  if public._blocked_between(me, target) then return 'not_found'; end if;
  -- 申し込みは 1 人 1 日 50 件まで（いたずらの大量の申し込みを止める）。
  if (select count(*) from public.follows where follower_id = me and created_at > now() - interval '1 day') >= 50 then
    return 'too_many';
  end if;
  insert into public.follows (follower_id, followee_id) values (me, target)
    on conflict (follower_id, followee_id) do nothing;
  select status into st from public.follows where follower_id = me and followee_id = target;
  return st;
end;
$$;

-- 自分あての申し込みに答える（承認／断る＝消す）。戻り値 'accepted'・'declined'・'not_found'
create or replace function public.follow_respond(p_public_id text, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  other uuid := public._user_by_public_id(p_public_id);
begin
  if other is null then return 'not_found'; end if;
  if p_accept then
    update public.follows set status = 'accepted', accepted_at = now()
     where follower_id = other and followee_id = me and status = 'pending';
    if found then return 'accepted'; end if;
    return 'not_found';
  end if;
  delete from public.follows where follower_id = other and followee_id = me;
  return 'declined';
end;
$$;

-- やめる: p_as='following'＝自分がフォローをやめる（申し込みの取り消しも）／'follower'＝相手をフォロワーから外す。
create or replace function public.follow_remove(p_public_id text, p_as text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  other uuid := public._user_by_public_id(p_public_id);
begin
  if other is null then return false; end if;
  if p_as = 'follower' then
    delete from public.follows where follower_id = other and followee_id = me;
  else
    delete from public.follows where follower_id = me and followee_id = other;
  end if;
  return found;
end;
$$;

-- ブロック（フォローは両方向とも消す）・ブロックを外す。
create or replace function public.block_user(p_public_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  other uuid := (select user_id from public.profiles where public_id = lower(trim(coalesce(p_public_id, ''))) limit 1);
begin
  if other is null or other = me then return false; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
  delete from public.follows where (follower_id = me and followee_id = other) or (follower_id = other and followee_id = me);
  return true;
end;
$$;

create or replace function public.unblock_user(p_public_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  other uuid := (select user_id from public.profiles where public_id = lower(trim(coalesce(p_public_id, ''))) limit 1);
begin
  if other is null then return false; end if;
  delete from public.user_blocks where blocker_id = me and blocked_id = other;
  return found;
end;
$$;

-- ─── 読む ────────────────────────────────────────────────
-- 自分のフォローの一覧（フォロー中・フォロワー・届いた申し込み・送った申し込み・ブロック中）。
create or replace function public.my_follows()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
begin
  return jsonb_build_object(
    'following', coalesce((select jsonb_agg(public._person(f.followee_id) || jsonb_build_object('since', f.accepted_at) order by f.accepted_at desc)
                             from public.follows f join public.profiles p on p.user_id = f.followee_id and p.hidden = false
                            where f.follower_id = me and f.status = 'accepted'), '[]'::jsonb),
    'sent',      coalesce((select jsonb_agg(public._person(f.followee_id) || jsonb_build_object('since', f.created_at) order by f.created_at desc)
                             from public.follows f join public.profiles p on p.user_id = f.followee_id and p.hidden = false
                            where f.follower_id = me and f.status = 'pending'), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(public._person(f.follower_id) || jsonb_build_object('since', f.accepted_at) order by f.accepted_at desc)
                             from public.follows f join public.profiles p on p.user_id = f.follower_id and p.hidden = false
                            where f.followee_id = me and f.status = 'accepted'), '[]'::jsonb),
    'requests',  coalesce((select jsonb_agg(public._person(f.follower_id) || jsonb_build_object('since', f.created_at) order by f.created_at desc)
                             from public.follows f join public.profiles p on p.user_id = f.follower_id and p.hidden = false
                            where f.followee_id = me and f.status = 'pending'), '[]'::jsonb),
    'blocked',   coalesce((select jsonb_agg(public._person(b.blocked_id) || jsonb_build_object('since', b.created_at) order by b.created_at desc)
                             from public.user_blocks b where b.blocker_id = me), '[]'::jsonb)
  );
end;
$$;

-- 人の様子（リンクを開いたとき・申し込む前）。ニックネームとアイコンはいつも、自己紹介と好きな本は公開しているか承認済みのときだけ。
-- relation: 'self'・'accepted'・'pending'・'none'
create or replace function public.profile_preview(p_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  other uuid := public._user_by_public_id(p_public_id);
  rel text;
  p public.profiles%rowtype;
begin
  if other is null or public._blocked_between(me, other) then return null; end if;
  select * into p from public.profiles where user_id = other;
  if other = me then rel := 'self';
  else rel := coalesce((select status from public.follows where follower_id = me and followee_id = other), 'none');
  end if;
  return jsonb_build_object('public_id', p.public_id, 'nickname', p.nickname, 'avatar', p.avatar, 'relation', rel)
    || case when p.is_public or rel in ('accepted', 'self') then
         jsonb_build_object('bio', p.bio, 'fav_title', p.fav_title, 'fav_author', p.fav_author, 'fav_cover', p.fav_cover, 'fav_line', p.fav_line)
       else '{}'::jsonb end;
end;
$$;

-- 承認されたフォロー先の本棚（本の書名・著者・表紙・状態・評価・この本のまとめ）。承認されていなければ null。
-- 本人が公開の本棚から外した本（shelf_hidden）は出さない。まとめは 4,000 字まで。
create or replace function public.followee_shelf(p_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  other uuid := public._user_by_public_id(p_public_id);
  p public.profiles%rowtype;
begin
  if other is null or public._blocked_between(me, other) then return null; end if;
  if not exists (select 1 from public.follows where follower_id = me and followee_id = other and status = 'accepted') then
    return null;
  end if;
  select * into p from public.profiles where user_id = other;
  return jsonb_build_object(
    'profile', jsonb_build_object('public_id', p.public_id, 'nickname', p.nickname, 'avatar', p.avatar, 'bio', p.bio,
                                  'fav_title', p.fav_title, 'fav_author', p.fav_author, 'fav_cover', p.fav_cover, 'fav_line', p.fav_line),
    'books', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'title', b.title, 'author', coalesce(b.author, ''), 'cover', coalesce(b.cover, ''),
               'isbn', coalesce(b.isbn, ''), 'status', b.status, 'rating', coalesce(b.rating, 0),
               'summary', left(coalesce(b.leverage_memo, ''), 4000)
             ) order by b.updated_at desc)
        from (select * from public.books where user_id = other and not (id = any (coalesce(p.shelf_hidden, '{}')))
               order by updated_at desc limit 1000) b
    ), '[]'::jsonb)
  );
end;
$$;

-- ─── 通報（アプリのフォローの画面から・2026-11-22 App 審査 1.2） ─────────
-- アプリは別のオリジンなので公開のページの窓口（/api/profile-report）の答えを読めない。ここで受けて、届いたかを返す。
-- 通報した人の id は残さない。同じ人が同じ相手を何度通報しても 1 つに数えるための目印（id と相手から作った
-- 1 方向のハッシュ・reporter_key）だけを残す。
-- 自動で隠すのは、登録した（匿名でない）・ニックネームのあるプロフィールを 3 日より前に作った、別々の 3 人から
-- 開いている通報が届いたときだけ（counted・2026-11-22: 作ったばかりのアカウント 3 つで、だれでも隠せないように）。
-- 公開のページの通報（ログインなし）は運営が確かめるだけで、自動では隠さない（1 人でだれでも隠せないように）。
alter table public.profile_reports add column if not exists reporter_key text;
alter table public.profile_reports add column if not exists counted boolean not null default false;
create unique index if not exists profile_reports_reporter_uq
  on public.profile_reports (public_id, reporter_key) where reporter_key is not null and status = 'open';

-- 戻り値: 'ok'（受け付けた・もう受け付けていた）・'not_found'・'self'
create or replace function public.report_profile(p_public_id text, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public._follow_me();
  pid text := lower(trim(coalesce(p_public_id, '')));
  other uuid := (select user_id from public.profiles where public_id = pid limit 1);
  why text := left(regexp_replace(coalesce(p_reason, ''), '[\x00-\x08\x0b\x0c\x0e-\x1f]', '', 'g'), 500);
  key text;
  n integer;
begin
  if other is null then return 'not_found'; end if;
  if other = me then return 'self'; end if;
  key := encode(sha256(convert_to(me::text || ':' || pid, 'UTF8')), 'hex');
  insert into public.profile_reports (public_id, reason, reporter_key, counted)
    values (pid, trim(why), key, not public._is_anonymous() and exists (
      select 1 from public.profiles where user_id = me and nickname <> '' and created_at < now() - interval '3 days'))
    on conflict (public_id, reporter_key) where reporter_key is not null and status = 'open' do nothing;
  select count(*) into n from public.profile_reports where public_id = pid and status = 'open' and counted;
  if n >= 3 then update public.profiles set hidden = true where public_id = pid and hidden = false; end if;
  return 'ok';
end;
$$;

-- 実行できるのはログインした人だけ（匿名のアカウントもログインはしているが、申し込みは関数の中で断る）。
do $$
declare f text;
begin
  foreach f in array array[
    'follow_request(text)', 'follow_respond(text, boolean)', 'follow_remove(text, text)', 'block_user(text)',
    'unblock_user(text)', 'my_follows()', 'profile_preview(text)', 'followee_shelf(text)', 'report_profile(text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['_follow_me()', '_user_by_public_id(text)', '_blocked_between(uuid, uuid)', '_person(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
