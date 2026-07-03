-- 🛡️ feedback テーブルの堅牢化（anon スパム封じ + 長さ CHECK）
--
-- 監査で判明した 2 点を冪等な単一 SQL で固める:
--   1. 既存の INSERT ポリシー（supabase_feedback.sql の "feedback_insert_anyone"）
--      に TO authenticated が無く、`user_id is null` 分岐が anon ロールにも
--      評価されていた → 公開 anon キーだけで無認証・無制限のスパム投入が可能。
--      ログインユーザー限定（TO authenticated）で作り直す。
--      ※ クライアント（src/hooks/useFeedback.js）は `user_id: user?.id || null`
--        を送る＝「ログイン中だが user_id null」の匿名パスがコード上存在するため、
--        WITH CHECK は `auth.uid() = user_id OR user_id IS NULL` を維持する
--        （匿名性は保ちつつ、未認証ロールからの書き込みだけを封じる）。
--   2. content / name / email / user_agent に長さ CHECK が無く、巨大行を
--      投入され得た → クライアント側の clamp 値（useFeedback.js の
--      FEEDBACK_LIMITS: content 2000 / name 60 / email 254 / user_agent 500）
--      と矛盾しない余裕を見た上限で CHECK を付ける。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    supabase_feedback.sql は本番適用済みの可能性があるため編集せず、
--    この上書き用ファイルで是正する（このリポジトリの流儀）。
--
-- 冪等性:
--   - ポリシーは DROP POLICY IF EXISTS → CREATE で常に最新定義へ置換。
--   - CHECK 制約は ADD CONSTRAINT IF NOT EXISTS が使えないため、
--     制約名の存在確認つき DO ブロックで多重追加を防ぐ。
--
-- ⚠ 注意: 既にスパム等で上限超過の行が存在すると CHECK の追加自体が失敗する。
--   事前確認:
--     SELECT id, char_length(content) AS len FROM public.feedback
--     WHERE char_length(content) > 4000
--        OR char_length(coalesce(name, ''))       > 200
--        OR char_length(coalesce(email, ''))      > 320
--        OR char_length(coalesce(user_agent, '')) > 1000;
--   超過行があれば（スパムなら）削除してから実行:
--     -- DELETE FROM public.feedback WHERE id IN ('<該当ID>', ...);


-- =====================================================================
-- 1. INSERT ポリシーを authenticated 限定で作り直す
-- =====================================================================
DROP POLICY IF EXISTS "feedback_insert_anyone" ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert_authenticated" ON public.feedback;
CREATE POLICY "feedback_insert_authenticated" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);


-- =====================================================================
-- 2. テキスト列の長さ CHECK（巨大行の投入防止）
-- =====================================================================
-- 上限はクライアント（src/hooks/useFeedback.js FEEDBACK_LIMITS）の 2 倍程度:
--   content 2000 → 4000 / name 60 → 200 / email 254 → 320 / user_agent 500 → 1000
-- 古いクライアントや clamp 前の余白も考慮しつつ、DDoS 級の巨大行は構造的に弾く。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_content_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_content_len_chk
      CHECK (char_length(content) <= 4000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_name_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_name_len_chk
      CHECK (name IS NULL OR char_length(name) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_email_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_email_len_chk
      CHECK (email IS NULL OR char_length(email) <= 320);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_user_agent_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_user_agent_len_chk
      CHECK (user_agent IS NULL OR char_length(user_agent) <= 1000);
  END IF;
END $$;

-- admin_note は管理者が service_role（SQL Editor）で書く運用列のため、
-- あえて CHECK を付けない（クライアントからは UPDATE ポリシー無しで書けない）。
