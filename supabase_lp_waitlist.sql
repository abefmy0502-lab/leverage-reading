-- ✉️ 公開のお知らせの登録（LP・2026-10-05）— App Store の URL が無い間、LP の入口は「公開の日にメールで知らせる」。
--
-- 書き手: api/lp-waitlist.js（service_role・未ログインの訪問者から受け取り、メールの形と長さを確かめてから upsert）。
-- 読み手: 管理者が SQL Editor（service_role）で読み、公開の日に 1 通だけ送る（送ったら notified_at を入れる）。
-- クライアントからの直接アクセスは不可（RLS 有効・ポリシー無し＝anon / authenticated は読めず書けない）。
--
-- 使い道は「公開のお知らせ」だけ（LP の欄の下とプライバシーポリシーに書く）。宣伝のメールには使わない。
-- 頼まれたら消す・公開から 3 か月以内に全部消す（プライバシーポリシーと同じ約束）。
-- ⚠️ 送るメール（特定電子メール法）: 本文に送信者の名前（Orime・運営 阿部文哉）と連絡先（問い合わせのメールアドレス）、
--   「このアドレスは LP で公開のお知らせを希望された方に送っています」と配信停止の方法（返信で登録を消す等）を必ず書く。
--   送るのは公開の日の 1 通だけ（確認の一覧は docs/lp-measurement.md §④）。
-- 同じメールは 1 行（UNIQUE・api は on conflict do nothing＝2 回目は何もしない）。IP は持たない。
-- 冪等（何度流しても安全）。

create table if not exists public.lp_waitlist (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null check (char_length(email) between 6 and 254 and email = lower(email) and position('@' in email) > 1),
  variant text check (variant in ('3d', 'photo')),
  utm_source text check (char_length(utm_source) <= 64),
  utm_medium text check (char_length(utm_medium) <= 64),
  utm_campaign text check (char_length(utm_campaign) <= 64),
  notified_at timestamptz -- 公開のお知らせを送った日時（送ったら管理者が入れる。null＝まだ）
);

create unique index if not exists lp_waitlist_email_key on public.lp_waitlist (email);
create index if not exists lp_waitlist_created_idx on public.lp_waitlist (created_at desc);

alter table public.lp_waitlist enable row level security;
-- ポリシーは作らない（= anon / authenticated からは読めず書けない。service_role のみ）。

-- 集計例:
--   select count(*), count(*) filter (where notified_at is null) as not_yet from public.lp_waitlist;
--   select coalesce(utm_source, '(direct)') as source, variant, count(*) from public.lp_waitlist group by 1, 2 order by 3 desc;
-- 公開の日に送ったあと（送った人に印を付ける）:
--   update public.lp_waitlist set notified_at = now() where notified_at is null;
-- 頼まれたら、その人の行を消す:
--   delete from public.lp_waitlist where email = lower('…');
-- 公開から 3 か月以内に、全部消す（約束・忘れないようにカレンダーへ）:
--   delete from public.lp_waitlist;

-- ─────────────────────────────────────────────────────────────────────
-- 🚦 同じ IP からの連打を DB で数える（2026-10-11 リリース前点検 中3）
-- ─────────────────────────────────────────────────────────────────────
-- api/lp-waitlist.js の 1 分 5 回はインスタンスの中だけ（Vercel は何台にも分かれるので素通りしうる）。
-- ここでは 1 つの IP から 1 日（日本時間）5 回まで。IP そのものは持たず、サーバーの秘密の鍵と日付で
-- 作ったハッシュ（HMAC-SHA256・api/_clientIp.js の ipHash）だけを入れる＝日が変わると別の値になり、つなげて追えない。
-- 2 日より古い行は呼ばれたときに消す。RLS 有効・ポリシー無し（service_role のみ・RPC も service_role だけ）。
-- 未適用ならインスタンスの中の制限だけで動く（登録は止めない）。冪等。
create table if not exists public.lp_waitlist_rate (
  ip_hash text not null check (char_length(ip_hash) between 16 and 128),
  day date not null,
  n integer not null default 0,
  primary key (ip_hash, day)
);
alter table public.lp_waitlist_rate enable row level security;

-- 上限未満なら 1 足して true、上限に届いていれば足さずに false（1 文の UPSERT で同時でも超えない）。
create or replace function public.take_lp_waitlist_slot(p_ip_hash text, p_day date, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 16 or p_limit is null or p_limit < 1 then
    return false;
  end if;
  delete from public.lp_waitlist_rate where day < p_day - 1;
  insert into public.lp_waitlist_rate as r (ip_hash, day, n)
  values (p_ip_hash, p_day, 1)
  on conflict (ip_hash, day) do update set n = r.n + 1 where r.n < p_limit
  returning n into v_n;
  return v_n is not null;
end;
$$;

revoke all on function public.take_lp_waitlist_slot(text, date, integer) from public;
grant execute on function public.take_lp_waitlist_slot(text, date, integer) to service_role;
