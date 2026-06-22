-- 📊 利用状況の記録（製品改善のためのファーストパーティ計測）
--
-- ローンチ後の「磨きの優先順位」を実データで決めるための最小限の計測基盤。
-- 外部トラッカーは一切使わず、自前 Supabase にだけ書く（CSP 変更不要）。
--
-- 設計の肝（プライバシー最優先）:
--   - 送るのは「イベント名（enum 想定）＋ 小さな数値/真偽/短い enum 文字列」だけ。
--   - メモ本文・書名・著者・メール・検索語・自由入力などの PII は構造的に入らない
--     （クライアント側 src/lib/analytics.js の props サニタイズで弾く）。
--   - 設定でいつでもオフにできる（クライアントの opt-out で no-op）。
--
-- RLS:
--   - INSERT  : 本人のみ（自分の user_id 行だけ書ける）
--   - SELECT  : 本人のみ（自分の行だけ読める）
--   - UPDATE/DELETE : ポリシー無し（誰も更新・削除できない＝改ざん防止の監査ログ）
--   - 管理者は service_role（RLS バイパス）で集計クエリを実行する。
--
-- supabase_advisor_sessions.sql と同じ流儀。冪等（DROP POLICY IF EXISTS）。

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event       text NOT NULL,
  props       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 集計は「イベント名 × 期間」と「ユーザー × 期間」が主。2 本の複合 index で両方をカバー。
CREATE INDEX IF NOT EXISTS analytics_events_event_idx
  ON public.analytics_events(event, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_user_idx
  ON public.analytics_events(user_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- INSERT は本人のみ（自分の user_id でしか書けない）。
DROP POLICY IF EXISTS "analytics_events_insert_own" ON public.analytics_events;
CREATE POLICY "analytics_events_insert_own" ON public.analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- SELECT は本人のみ（自分の行だけ。エクスポート等で本人が確認できるように）。
DROP POLICY IF EXISTS "analytics_events_select_own" ON public.analytics_events;
CREATE POLICY "analytics_events_select_own" ON public.analytics_events
  FOR SELECT USING (auth.uid() = user_id);

-- UPDATE / DELETE のポリシーは敢えて定義しない。
--   → 一般ユーザーからは更新・削除できない（追記専用の監査ログ）。
--   → 管理者は service_role（RLS バイパス）で集計・保守を行う。
DROP POLICY IF EXISTS "analytics_events_update_own" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_events_delete_own" ON public.analytics_events;
