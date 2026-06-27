-- 💳 Stripe Webhook の冪等化（M1 是正）。
-- Stripe は at-least-once 配信＝同じイベントが複数回／順序前後で届く。冪等性が
-- 無いと、古い invoice.payment_failed が後から再配信されて課金 active を past_due
-- に倒す等の事故が起きうる。処理済み event.id を記録し、二度目以降はスキップする。
--
-- 書き込みは Webhook（service_role）のみ。RLS 有効＋ポリシー無し＝クライアント
-- からは一切不可。未適用でも api/stripe-webhook.js は fail-open で従来どおり処理
-- するので壊れない。Supabase SQL Editor にコピペで実行（冪等）。

create table if not exists public.stripe_events (
  event_id   text primary key,
  type       text,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- ポリシー無し＝ authenticated/anon は不可。service_role のみ（RLS バイパス）が書く。

-- 任意: 90 日より古い記録は不要（容量管理）。定期実行する場合のサンプル。
-- delete from public.stripe_events where created_at < now() - interval '90 days';
