-- 🛡️ account_deletion_requests の堅牢化（メール偽装封じ + 二重リクエスト防止）
--
-- 監査で判明した 2 点を冪等な単一 SQL で固める:
--   1. INSERT で user_email がクライアント任意入力のまま保存されていた。
--      他人のメールを入れて INSERT できるため、管理者が「メール基準」で
--      auth.users を削除する運用だと無関係ユーザーが削除され得る
--      （社会工学ベクトル）。→ WITH CHECK で user_email を本人の JWT の
--      email クレームと一致（または NULL）に強制し、TO authenticated 付きで
--      作り直す。クライアント（src/components/AccountSettings.jsx）は
--      `user_email: user.email || null`（= auth セッションのメール）を送る
--      ため、正規の送信はこのチェックを常に通る。
--   2. UNIQUE(user_id) が無く、同一ユーザーが二重リクエストを積めた。
--      → 部分でない UNIQUE INDEX を冪等に追加。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    supabase_account_deletion.sql は本番適用済みの可能性があるため編集せず、
--    この上書き用ファイルで是正する（このリポジトリの流儀）。
--
-- 🚨 管理者の削除運用は必ず user_id 基準に統一すること。
--    user_email は「表示・連絡用の参考情報」に格下げする。メールを手掛かりに
--    照合する場合も、削除実行前に必ず
--      SELECT id, email FROM auth.users WHERE id = '<リクエスト行の user_id>';
--    で user_id と突き合わせ、auth.users 側のメールと一致することを確認してから
--    削除する（リクエスト行の user_email 単独を根拠に削除しない）。
--
-- ⚠ 注意: 既に同一 user_id の重複行がある DB に流すと UNIQUE INDEX の作成
--   自体が失敗する。先に手動で重複を整理してから実行すること。
--
-- 重複確認:
--   SELECT user_id, count(*) AS dup_count, array_agg(id) AS request_ids
--   FROM public.account_deletion_requests
--   GROUP BY user_id
--   HAVING count(*) > 1;
--
-- 重複削除サンプル（最古のリクエストだけ残す）:
--   DELETE FROM public.account_deletion_requests a
--   USING public.account_deletion_requests b
--   WHERE a.user_id = b.user_id
--     AND a.requested_at > b.requested_at;


-- =====================================================================
-- 1. INSERT ポリシーを作り直す（本人 user_id + 本人メール強制）
-- =====================================================================
-- 旧ポリシー（supabase_account_deletion.sql）は TO 指定なし +
-- user_email 無検証だった。authenticated 限定 + JWT email 一致で置換。
DROP POLICY IF EXISTS "deletion_request_insert_own" ON public.account_deletion_requests;
CREATE POLICY "deletion_request_insert_own"
  ON public.account_deletion_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (user_email IS NULL OR user_email = (auth.jwt() ->> 'email'))
  );


-- =====================================================================
-- 2. UNIQUE(user_id) — 二重リクエスト防止
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_user_id_unique
  ON public.account_deletion_requests(user_id);


-- =====================================================================
-- 3. notes / user_email の長さ CHECK（巨大行の投入防止・二重防衛）
-- =====================================================================
-- notes はクライアントが削除時の警告概要を書き込む列（AccountSettings.jsx）。
-- 正常系では数百文字以下。CHECK 制約は IF NOT EXISTS が使えないため、
-- 制約名の存在確認つき DO ブロックで冪等化。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_deletion_requests_notes_len_chk'
      AND conrelid = 'public.account_deletion_requests'::regclass
  ) THEN
    ALTER TABLE public.account_deletion_requests
      ADD CONSTRAINT account_deletion_requests_notes_len_chk
      CHECK (notes IS NULL OR char_length(notes) <= 4000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_deletion_requests_email_len_chk'
      AND conrelid = 'public.account_deletion_requests'::regclass
  ) THEN
    ALTER TABLE public.account_deletion_requests
      ADD CONSTRAINT account_deletion_requests_email_len_chk
      CHECK (user_email IS NULL OR char_length(user_email) <= 320);
  END IF;
END $$;
