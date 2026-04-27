-- supabase_added_via.sql
--
-- Two related changes for the search-first add flow:
--   1. books.added_via column — distinguishes 'search' (Google Books / openBD
--      result) from 'manual' so AI features can adjust prompts accordingly.
--   2. book-covers public Storage bucket — holds cover images uploaded by
--      users when they pick the manual entry path. Public bucket so the URL
--      can be saved straight into books.cover and rendered without signing.
--
-- Run this in the Supabase SQL Editor once. Idempotent — safe to re-run.

-- ============================================================
-- 1. added_via column
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS added_via text DEFAULT 'search';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_added_via_check'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_added_via_check
      CHECK (added_via IN ('search', 'manual'));
  END IF;
END $$;

-- Backfill any pre-existing rows so they default to 'search'.
UPDATE public.books SET added_via = 'search' WHERE added_via IS NULL;


-- ============================================================
-- 2. book-covers public Storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload into their own user-id-prefixed folder.
-- (Public read is implicit because the bucket is public; no SELECT policy needed.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'book_covers_user_insert'
  ) THEN
    CREATE POLICY book_covers_user_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'book-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'book_covers_user_delete'
  ) THEN
    CREATE POLICY book_covers_user_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'book-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'book_covers_user_update'
  ) THEN
    CREATE POLICY book_covers_user_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'book-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
