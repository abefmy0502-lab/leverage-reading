-- 💳 RevenueCat Webhook の冪等化（stripe_events と同一パターン）。
-- RevenueCat も at-least-once 配信＝同じイベントが複数回届きうる。TRANSFER
-- イベントは処理自体が「旧アカウントを canceled に書き換えてから、その行を
-- 読んで新アカウントへ引き継ぐ」構造のため、再送されると 1 回目の書き込み結果
-- を 2 回目が読んでしまい、引き継ぎ判定が狂う（有効な購読者が誤って canceled
-- になりうる）。処理済み event.id を記録し、二度目以降はスキップする。
--
-- 書き込みは Webhook（service_role）のみ。RLS 有効＋ポリシー無し＝クライアント
-- からは一切不可。未適用でも api/revenuecat-webhook.js は fail-open で従来どおり
-- 処理するので壊れない（ただし TRANSFER の再送耐性は未適用の間は無い）。
-- Supabase SQL Editor にコピペで実行（冪等）。

create table if not exists public.revenuecat_events (
  event_id   text primary key,
  type       text,
  created_at timestamptz not null default now()
);

alter table public.revenuecat_events enable row level security;
-- ポリシー無し＝ authenticated/anon は不可。service_role のみ（RLS バイパス）が書く。

-- 任意: 90 日より古い記録は不要（容量管理）。定期実行する場合のサンプル。
-- delete from public.revenuecat_events where created_at < now() - interval '90 days';
