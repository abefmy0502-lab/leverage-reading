-- 💳 subscriptions.provider のバックフィル（冪等・1 回実行）
--
-- 背景: api/stripe-webhook.js が provider='stripe' を書き始める前に作られた
-- Stripe 行は provider が NULL のまま。revenuecat-webhook.js の「Stripe active
-- 保護ガード」はコード側で stripe_subscription_id による後方互換判定を持つが、
-- データも正しておくと将来の集計・判定が単純になる。
--
-- 依存: supabase_subscriptions.sql → supabase_subscriptions_provider.sql の後に実行。
update public.subscriptions
   set provider = 'stripe'
 where provider is null
   and stripe_subscription_id is not null;
