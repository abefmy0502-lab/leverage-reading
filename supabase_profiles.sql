-- 👤 プロフィール（2026-11-21 オーナー「アカウント作成ができるようになりたい・ニックネームと好きな本とその本のおすすめの 1 行」）
--
-- ニックネーム・好きな本（書名・著者・ISBN・表紙）・おすすめの 1 行。本人が「公開する」をオンにしたときだけ、
-- 共有リンクのページ（/u/<id>・api/_profilePage.js）でほかの人が見られる。既定はオフ（公開しない）。
-- <id> は本人が選ばない無作為の 10 字（名前の取り合い・なりすましを防ぐ）。
--
-- 書き手:
--   - アプリ（本人・RLS）: 作る・直す・消す・読む（src/lib/profile.js）
--   - サーバー（service_role）: 公開のページを描く（public_profile）・通報を残す（profile_reports）・
--     運営が隠す（hidden=true＝公開していても出さない）
-- 退会はアプリが本人の行を消す（auth.users の削除でも ON DELETE CASCADE で消える）。
-- 未適用でも壊れない: アプリは端末にだけ控え、公開のページは「見つかりません」になる。
-- 冪等（何度流しても同じ）。Supabase の SQL Editor に貼って実行する。

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  public_id text not null,
  nickname text not null default '',
  fav_title text not null default '',
  fav_author text not null default '',
  fav_isbn text not null default '',
  fav_cover text not null default '',
  fav_line text not null default '',
  is_public boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_public_id_check') then
    alter table public.profiles add constraint profiles_public_id_check check (public_id ~ '^[a-z0-9]{10}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_lengths_check') then
    alter table public.profiles add constraint profiles_lengths_check check (
      char_length(nickname) <= 20 and char_length(fav_title) <= 120 and char_length(fav_author) <= 80
      and char_length(fav_isbn) <= 13 and char_length(fav_cover) <= 500 and char_length(fav_line) <= 80
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_cover_check') then
    -- 表紙は https の画像の URL だけ（空も可）。
    alter table public.profiles add constraint profiles_cover_check check (fav_cover = '' or fav_cover ~ '^https://');
  end if;
end $$;

create unique index if not exists profiles_public_id_uq on public.profiles (public_id);

-- RLS: 本人の行だけ。hidden（運営が隠した印）は本人が外せない＝update で変えられない（下のトリガー）。
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id and hidden = false);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

-- 本人の update では hidden と public_id を変えさせない（service_role は変えられる）・updated_at を今に。
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  -- 利用者（ログインした人）の更新のときだけ守る。service_role と SQL Editor（運営が隠すとき）は auth.uid() が無い。
  if auth.uid() is not null then
    new.hidden := old.hidden;
    new.public_id := old.public_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- 通報（公開のページの「通報する」・api/_profilePage.js が service_role で入れる）。
-- 通報した人の情報は残さない（IP も保存しない・理由の文だけ）。
create table if not exists public.profile_reports (
  id bigint generated always as identity primary key,
  public_id text not null,
  reason text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_reports_check') then
    alter table public.profile_reports add constraint profile_reports_check check (
      public_id ~ '^[a-z0-9]{10}$' and char_length(reason) <= 500 and status in ('open', 'hidden', 'dismissed')
    );
  end if;
end $$;

create index if not exists profile_reports_open_idx on public.profile_reports (status, created_at desc);
alter table public.profile_reports enable row level security;
-- ポリシーなし＝クライアントからは読み書きできない（service_role だけ）。
