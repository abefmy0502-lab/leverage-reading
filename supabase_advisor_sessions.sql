-- 🕒 AI 選書アドバイザーの会話履歴
--
-- ユーザーと AI の会話を 1 セッション = 1 行で永続化する。最初のメッセージ送信時に
-- 行を作り、以降のターンごとに UPDATE で messages を上書きしていく。本棚に追加した
-- 本の id は added_book_ids にプッシュ。
--
-- - messages          : Claude API 形式 [{ role, content }]
-- - recommended_books : AI 提案カードの配列 (parsed RECOMMENDATIONS_END JSON のまま)
-- - added_book_ids    : 本棚に「読みたい」追加した本の UUID 配列

-- updated_at の自動更新ヘルパー (まだ無ければ作る、あれば置換)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public.advisor_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages          jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_books jsonb NOT NULL DEFAULT '[]'::jsonb,
  added_book_ids    uuid[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisor_sessions_user_idx
  ON public.advisor_sessions(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_advisor_sessions_updated_at ON public.advisor_sessions;
CREATE TRIGGER trg_advisor_sessions_updated_at
  BEFORE UPDATE ON public.advisor_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.advisor_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advisor_sessions_select_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_select_own" ON public.advisor_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "advisor_sessions_insert_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_insert_own" ON public.advisor_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "advisor_sessions_update_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_update_own" ON public.advisor_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "advisor_sessions_delete_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_delete_own" ON public.advisor_sessions
  FOR DELETE USING (auth.uid() = user_id);
