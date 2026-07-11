-- 💳 解約時刻の記録 — チャーン率（月次解約÷月初active）の正確な算出に必須。
-- これまで status='canceled' への遷移時刻が残らず、「いつ解約したか」を後から
-- 復元できなかった（current_period_end は満了予定であって解約操作の時刻ではない）。
-- 書くのは api/stripe-webhook.js / api/revenuecat-webhook.js（service_role）のみ。
-- 未適用でも両 webhook は schema-error fallback で canceled_at 抜きで保存する。冪等。

alter table public.subscriptions
  add column if not exists canceled_at timestamptz;

comment on column public.subscriptions.canceled_at is
  'status が canceled に遷移した時刻（webhook が记録）。チャーン率の月次集計用';
