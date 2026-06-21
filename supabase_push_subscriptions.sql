-- 🔔 Web Push 購読情報 + 通知設定（想起プッシュ通知）。
--
-- RLS: 本人は自分の購読を SELECT/INSERT/UPDATE/DELETE 可（自分でオン/オフできる）。
--      送信は api/push-cron.js が service_role で全件読む（RLS バイパス・追加ポリシー不要）。
-- 流儀: supabase_advisor_sessions.sql / supabase_ai_usage.sql と同じ。冪等（DROP POLICY IF EXISTS）。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    Vercel デプロイでは自動実行されない（元帥の環境作業）。

-- updated_at の自動更新ヘルパー（既にあれば置換。advisor_sessions と共有）。
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint       text        NOT NULL,                  -- プッシュサービスの一意 URL
  p256dh         text        NOT NULL,                  -- subscription.keys.p256dh
  auth           text        NOT NULL,                  -- subscription.keys.auth
  -- 通知設定（思想ガード: 低頻度デフォルト）
  enabled        boolean     NOT NULL DEFAULT true,
  frequency      text        NOT NULL DEFAULT 'weekly', -- 'off' | 'weekly' | 'twice_weekly'
  preferred_hour smallint    NOT NULL DEFAULT 8,        -- 0-23, ユーザーのローカル目安
  tz_offset_min  smallint    NOT NULL DEFAULT 540,      -- 端末の -getTimezoneOffset()（JST=+540）
  last_sent_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)                            -- 同一端末の重複登録防止 + upsert キー
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_enabled_idx
  ON public.push_subscriptions (enabled) WHERE enabled = true;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 本人は自分の行を全操作可（クライアントから直接 upsert / オフ設定できる）。
DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_update_own" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
-- 送信側（api/push-cron）は service_role で全行読むため追加ポリシー不要。
