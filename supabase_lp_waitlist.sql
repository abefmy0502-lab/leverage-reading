-- ✉️ 公開のお知らせの登録（LP・2026-10-05）— App Store の URL が無い間、LP の入口は「公開の日にメールで知らせる」。
--
-- 書き手: api/lp-waitlist.js（service_role・未ログインの訪問者から受け取り、メールの形と長さを確かめてから upsert）。
-- 読み手: 管理者が SQL Editor（service_role）で読み、公開の日に 1 通だけ送る（送ったら notified_at を入れる）。
-- クライアントからの直接アクセスは不可（RLS 有効・ポリシー無し＝anon / authenticated は読めず書けない）。
--
-- 使い道は「公開のお知らせ」だけ（LP の欄の下とプライバシーポリシーに書く）。宣伝のメールには使わない。
-- 頼まれたら消す・公開から 3 か月以内に全部消す（プライバシーポリシーと同じ約束）。
-- ⚠️ 送るメール（特定電子メール法）: 本文に送信者の名前（Orime・運営 阿部文哉）と連絡先（問い合わせのメールアドレス）、
--   「このアドレスは LP で公開のお知らせを希望された方に送っています」を必ず書く。送るのは公開の日の 1 通だけ。
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
