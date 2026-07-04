-- 🔔📱 想起プッシュ通知の「ネイティブ(iOS/APNs)対応」列追加。
--
-- 背景:
--   supabase_push_subscriptions.sql は Web Push(VAPID)前提で、endpoint/p256dh/auth を
--   NOT NULL で持つ。App Store 配信(Capacitor)では Web Push が WKWebView で動かないため、
--   ネイティブは APNs(Apple Push Notification service)で送る。ネイティブ端末は
--   endpoint/p256dh/auth を持たず、代わりに「APNs デバイストークン」を持つ。
--   1 テーブルで web(VAPID) と ios(APNs) を併存させるための最小拡張。
--
-- 追加/変更:
--   - platform text NOT NULL DEFAULT 'web'  … 'web'(VAPID) | 'ios'(APNs)
--   - apns_token text                       … iOS のデバイストークン（platform='ios' 行のみ）
--   - p256dh / auth を NULL 許容に           … ネイティブ行は Web Push 鍵を持たない
--   （ネイティブ行は endpoint='apns:<token>' として UNIQUE(user_id,endpoint) を満たす。
--     クライアント src/lib/nativePush.js が upsert する。）
--
-- 流儀: ADD COLUMN IF NOT EXISTS / DROP NOT NULL は冪等。RLS/ポリシーは
--       supabase_push_subscriptions.sql のまま（本人が自分の行を全操作可）で不変。
--       送信側(api/push-cron.js)は service_role で platform/apns_token も読む。
--
-- ⚠️ Supabase SQL Editor にコピペで 1 回実行する想定。先に
--    supabase_push_subscriptions.sql を適用済みであること。

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS apns_token text;

-- ネイティブ(APNs)行は Web Push 鍵を持たないので NULL を許容する。
ALTER TABLE public.push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN auth   DROP NOT NULL;

-- 配信 Cron は platform で送信経路(VAPID / APNs)を分けるため index を張る。
CREATE INDEX IF NOT EXISTS push_subscriptions_platform_idx
  ON public.push_subscriptions (platform) WHERE enabled = true;
