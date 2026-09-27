-- 📊 LP（紹介ページ）の閲覧状況の記録 — ダウンロードにつながる導線を数字で決めるため。
--
-- 書き手: api/lp-event.js（service_role・未ログインの訪問者から受け取り、検証してから insert）。
-- 読み手: 管理者が SQL Editor（service_role）で集計する（集計例は docs/lp-measurement.md）。
-- クライアントからの直接アクセスは不可（RLS 有効・ポリシー無し）。
--
-- 個人を特定しない: IP・入力文・Cookie は持たない。session_id は閲覧タブごとの無作為な文字列。
-- props は小さな区分値だけ（サイズ上限 1KB）。プライバシーポリシー第 9 条③に記載。
-- 冪等（何度流しても安全）。

create table if not exists public.lp_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) between 8 and 40),
  event text not null check (event in (
    'lp_view', 'cta_click', 'demo_pick', 'demo_ask', 'demo_add', 'scroll_depth', 'faq_open', 'hero_3d'
  )),
  variant text check (variant in ('3d', 'photo')),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 1024),
  device text check (device in ('mobile', 'desktop')),
  ref_host text check (char_length(ref_host) <= 100),
  utm_source text check (char_length(utm_source) <= 64),
  utm_medium text check (char_length(utm_medium) <= 64),
  utm_campaign text check (char_length(utm_campaign) <= 64)
);

create index if not exists lp_events_created_idx on public.lp_events (created_at desc);
create index if not exists lp_events_event_idx on public.lp_events (event, created_at desc);
create index if not exists lp_events_session_idx on public.lp_events (session_id);

alter table public.lp_events enable row level security;
-- ポリシーは作らない（= anon / authenticated からは読めず書けない。service_role のみ）。

-- 古い記録の掃除（任意・手動）: 400 日より前を消す
-- delete from public.lp_events where created_at < now() - interval '400 days';
