-- =============================================================================
-- 🧠 マイ読書脳 — Supabase migration
-- =============================================================================
-- このファイルは Supabase の SQL Editor にコピペして 1 回実行してください。
-- (該当ユーザー側の作業 — Vercel デプロイには影響しません)
--
-- 変更点:
--   1. chat_messages テーブルを新規作成（マイ読書脳の対話履歴を保存）
--   2. book_memos.book_id を nullable に変更（学びログ = 本に紐づかないメモ用）
--   3. book_memos.source_type 列を追加（'book' | 'personal'）
--
-- 既存データはすべて source_type='book' になり、影響ありません。
-- =============================================================================

-- ----- 1. chat_messages テーブル -----------------------------------------
-- "references" は SQL の予約語のため、コラム名は refs にしています。
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  refs        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx
  ON public.chat_messages(user_id, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
      AND policyname = 'chat_messages_select_own'
  ) THEN
    CREATE POLICY "chat_messages_select_own" ON public.chat_messages
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
      AND policyname = 'chat_messages_insert_own'
  ) THEN
    CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
      AND policyname = 'chat_messages_delete_own'
  ) THEN
    CREATE POLICY "chat_messages_delete_own" ON public.chat_messages
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- ----- 2. book_memos: book_id を nullable に -----------------------------
ALTER TABLE public.book_memos
  ALTER COLUMN book_id DROP NOT NULL;

-- ----- 3. book_memos.source_type を追加 ----------------------------------
ALTER TABLE public.book_memos
  ADD COLUMN IF NOT EXISTS source_type text
  DEFAULT 'book'
  CHECK (source_type IN ('book', 'personal'));

-- 整合性: 'book' なら book_id は必須、'personal' なら book_id は NULL であるべき。
-- 既存データはすべて book_id を持つので 'book' のままで問題ありません。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'book_memos_source_book_id_check'
  ) THEN
    ALTER TABLE public.book_memos
      ADD CONSTRAINT book_memos_source_book_id_check
      CHECK (
        (source_type = 'book' AND book_id IS NOT NULL)
        OR (source_type = 'personal' AND book_id IS NULL)
      );
  END IF;
END
$$;

-- =============================================================================
-- 確認:
--   SELECT * FROM public.chat_messages LIMIT 1;
--   SELECT column_name, is_nullable, data_type FROM information_schema.columns
--     WHERE table_name = 'book_memos' AND column_name IN ('book_id', 'source_type');
-- =============================================================================
