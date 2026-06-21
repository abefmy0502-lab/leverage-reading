-- 🤖 AI 利用量メータリング（KGI 原価ガード）
--
-- 用途:
-- - Claude API のコストを「月次の累積上限」で守るためのカウンタテーブル。
--   現状 api/claude.js はメモリ内 10 回/分のレート制限しか無く、月次の累積
--   上限が無いため、1 ユーザーがマイ読書脳等を連打すると Claude API コストが
--   青天井になる。経理算定の AI 原価ガードレールは ≤45 円/人・月（黒字化の
--   前提）、ハード床は 234 円/人・月。
-- - このテーブルは「暴走（連打）を止めるランナウェイガード」の真実の源。
--   通常利用を妨げない寛容な月次上限（api/claude.js の AI_MONTHLY_CALL_LIMIT）の
--   判定に使う。ローンチ後に実データで上限を調整する前提。
--
-- 設計方針:
-- - 1 ユーザー × 1 月 = 1 行（PK は (user_id, period_month)）。period_month は
--   'YYYY-MM'（UTC 基準の当月文字列）。月をまたぐと別行になり、自動でリセット
--   される（過去の行は監査用に残す）。
-- - SELECT は本人のみ（auth.uid() = user_id）。自分の利用量は読めるが他人の
--   行は見えない。
-- - INSERT / UPDATE / DELETE のポリシーは「敢えて作らない」。
--   → 一般ユーザー（anon / authenticated ロール）は書き込み不可。
--     カウンタをクライアントから改ざんできない（サーバー権威）。
--   → 書き込みは api/claude.js が service_role キーで RLS をバイパスして行う。
--     service_role キーはサーバー専用環境変数（SUPABASE_SERVICE_ROLE_KEY）で
--     のみ使用し、絶対にクライアントへ露出しないこと。
-- - 堅牢性最優先: api/claude.js 側は fail-open（usage 取得/加算がエラー or
--   このテーブル未適用なら、ブロックせず通す）。このテーブルが無くても AI は
--   止まらない（schema-fallback）。
--
-- idempotent: 何度実行しても安全。

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month text        NOT NULL,                 -- 'YYYY-MM'（UTC 当月）
  calls        integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_month)
);

-- 当月分の絞り込みを速くする（period_month 単位の集計・掃除に使う）。
CREATE INDEX IF NOT EXISTS ai_usage_period_idx
  ON public.ai_usage (period_month);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の利用量のみ閲覧可。
DROP POLICY IF EXISTS "ai_usage_select_own" ON public.ai_usage;
CREATE POLICY "ai_usage_select_own" ON public.ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT / UPDATE / DELETE: 一切ポリシーを作らない。
-- → 一般ユーザーは書き込めない（利用量カウンタの改ざん防止）。
-- → 書き込みは api/claude.js が service_role キーで RLS をバイパスして行う。

-- 原子的なインクリメント用 RPC（service_role が呼ぶ）。
-- upsert を 1 文で原子的に行い、同時実行でもカウントが取りこぼされない。
-- SECURITY DEFINER で RLS をバイパスするが、関数の実行権限は service_role のみ
-- に絞る（下の REVOKE / GRANT）。クライアント（anon / authenticated）からは
-- 呼べないので、SELECT ポリシーと合わせて「読めるが書けない」を担保する。
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id uuid,
  p_period_month text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ai_usage (user_id, period_month, calls, updated_at)
  VALUES (p_user_id, p_period_month, 1, now())
  ON CONFLICT (user_id, period_month)
  DO UPDATE SET calls = public.ai_usage.calls + 1,
                updated_at = now()
  RETURNING calls;
$$;

-- 実行権限を絞る: 一般ロールからは呼べないようにする。
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text) TO service_role;

-- CLAUDE.md「SQL マイグレーション」表への追記候補:
-- | `supabase_ai_usage.sql` | 🤖 AI 利用量メータリング（KGI 原価ガード）— `ai_usage(user_id, period_month 'YYYY-MM', calls)` 新規 + 原子的 increment RPC。SELECT は本人のみ、書き込みは api/claude.js の service_role 経由（増分は `increment_ai_usage` RPC）。月次の累積上限（`AI_MONTHLY_CALL_LIMIT`、既定 120）超過で 429。fail-open / schema-fallback（未適用でも AI は止まらない） |
