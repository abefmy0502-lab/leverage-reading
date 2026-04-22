-- ============================================================
-- Migration: add memo_texts array column to collections
-- Run this in the Supabase SQL editor (or via CLI).
-- Safe to re-run: uses IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS memo_texts text[] NOT NULL DEFAULT '{}';

-- Backfill existing rows (default already applies, but make explicit for any nulls
-- that may exist if the column was added via a different path).
UPDATE public.collections
SET memo_texts = COALESCE(memo_texts, '{}')
WHERE memo_texts IS NULL;

-- Optional: ensure updated_at bumps automatically when memo_texts changes.
-- (Only enable if the rest of the collections table relies on a similar trigger;
-- otherwise leave commented out.)
--
-- CREATE OR REPLACE FUNCTION public.set_updated_at()
-- RETURNS trigger AS $$
-- BEGIN
--   NEW.updated_at := NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- DROP TRIGGER IF EXISTS trg_collections_updated_at ON public.collections;
-- CREATE TRIGGER trg_collections_updated_at
--   BEFORE UPDATE ON public.collections
--   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
