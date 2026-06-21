-- 💳 subscriptions に決済プロバイダ（Stripe / RevenueCat）を識別する列を追加
--
-- 用途:
-- - App 決済（IAP / RevenueCat）と Web 決済（Stripe）を 1 テーブルで併存させる。
--   どちらの経路で得た entitlement かを記録できるようにする。
-- - entitlement 判定（useSubscription.js の isActive = status==='active'）は無改修。
--   status の語彙は両プロバイダで揃えてある（active / canceled / past_due 等）。
--
-- 設計方針:
-- - すべて idempotent（ADD COLUMN IF NOT EXISTS）。既存の subscriptions テーブル
--   （supabase_subscriptions.sql）に後付けで安全に当てられる。
-- - 既存の `stripe_*` 列は NULL 許容のまま温存する。RevenueCat 経由の行では
--   stripe_customer_id / stripe_subscription_id は NULL のまま、provider='revenuecat'
--   / rc_app_user_id / store に値が入る。Stripe 経由は従来どおり。
--
-- 追加する列:
-- - provider        : 'stripe' | 'revenuecat'（どの決済経路で得た行か）
-- - rc_app_user_id  : RevenueCat の app_user_id（= Supabase user.id を logIn で揃える前提）
-- - store           : 'app_store' | 'play_store' | 'stripe' 等（IAP のストア種別）

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider       text,
  ADD COLUMN IF NOT EXISTS rc_app_user_id text,
  ADD COLUMN IF NOT EXISTS store          text;

-- RevenueCat の Webhook が app_user_id から行を引くことがあるので index を張る。
CREATE INDEX IF NOT EXISTS subscriptions_rc_app_user_idx
  ON public.subscriptions (rc_app_user_id);

-- CLAUDE.md「SQL マイグレーション」表への追記候補:
-- | `supabase_subscriptions_provider.sql` | 💳 App 決済（IAP / RevenueCat）対応 — `subscriptions` に `provider` / `rc_app_user_id` / `store` 列を idempotent 追加。Stripe（Web）と RevenueCat（IAP）を 1 テーブルで併存。`stripe_*` 列は NULL 許容のまま温存。entitlement は status='active' で無改修流用 |
