-- 💳 Stripe サブスクリプション状態テーブル
--
-- 用途:
-- - 全機能有料（フリーミアム無し・無料トライアル無し）の課金モデルにおける
--   entitlement 判定の真実の源。月額 ¥1,000（税込・内税）1 プランのみ。
-- - 1 ユーザー = 1 行（user_id を PRIMARY KEY にする）。Stripe Webhook が
--   service_role キーで upsert / update する。クライアントは SELECT のみ。
--
-- 設計方針:
-- - SELECT は本人のみ（auth.uid() = user_id）。自分の課金状態は読めるが、
--   他人の行は見えない。
-- - INSERT / UPDATE / DELETE のポリシーは「敢えて作らない」。
--   → 一般ユーザー（anon / authenticated ロール）は書き込み不可。
--   → Webhook は service_role キーを使うため RLS をバイパスして書ける。
--     service_role キーはサーバー専用環境変数（SUPABASE_SERVICE_ROLE_KEY）で
--     のみ使用し、絶対にクライアントへ露出しないこと。
-- - status は Stripe の subscription.status をそのまま保持
--   （active / past_due / canceled / unpaid / incomplete など）。
--   entitlement は基本 status = 'active' のみ許可（useSubscription.js 参照）。
--   past_due を猶予として許可したくなった場合はこのテーブルではなく
--   クライアント / サーバーの判定側を拡張する（列の意味は変えない）。

-- updated_at の自動更新ヘルパー（まだ無ければ作る、あれば置換）。
-- 既存の他マイグレーション（supabase_advisor_sessions.sql 等）と共用。
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text,
  price_id               text,
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Webhook は customer / subscription id から行を引くことがあるので index を張る。
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx
  ON public.subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_subscription_idx
  ON public.subscriptions (stripe_subscription_id);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の課金状態のみ閲覧可。
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT / UPDATE / DELETE: 一切ポリシーを作らない。
-- → 一般ユーザーは書き込めない（課金状態の改ざん防止）。
-- → 書き込みは Stripe Webhook (api/stripe-webhook.js) が service_role キーで
--   RLS をバイパスして行う。

-- CLAUDE.md「SQL マイグレーション」表への追記候補:
-- | `supabase_subscriptions.sql` | 💳 Stripe 課金 — `subscriptions` テーブル新規（user_id PK / status / current_period_end 等）。SELECT は本人のみ、書き込みは Webhook の service_role 経由。entitlement は status='active' で判定 |
