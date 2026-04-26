-- =============================================================================
-- 🛡️ アカウント削除リクエスト — Supabase migration
-- =============================================================================
-- このファイルは Supabase の SQL Editor で 1 回実行してください。
--
-- 仕様:
--   * クライアントから auth.users を直接削除するには service_role key が必要
--     なため、ユーザーが「削除」をタップしたら以下を実行する設計:
--       1. クライアント側で本人の books / book_memos / book_tags / actions /
--          chat_messages / Storage 上の写真をすべて削除
--       2. account_deletion_requests に「削除済み」レコードを INSERT
--       3. 管理者が定期的にこのテーブルを確認し、auth.users を service_role で
--          削除する (もしくは Edge Function で自動化)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email    text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_user_id_idx
  ON public.account_deletion_requests(user_id);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- 利用者は自分のレコードを INSERT のみ可能。SELECT/UPDATE/DELETE は service_role のみ。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_deletion_requests'
      AND policyname = 'deletion_request_insert_own'
  ) THEN
    CREATE POLICY "deletion_request_insert_own"
      ON public.account_deletion_requests
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- =============================================================================
-- 管理者の作業 (Supabase Dashboard で定期的に実施):
--   SELECT * FROM public.account_deletion_requests ORDER BY requested_at;
--   -- 該当 user_id を確認したら:
--   -- (Supabase Dashboard → Authentication → Users で削除)
--   -- もしくは service_role で:
--   -- SELECT auth.users.email FROM auth.users WHERE id = '<user_id>';
-- =============================================================================
