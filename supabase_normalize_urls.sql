-- =============================================================================
-- 🔒 Mixed Content 解消 — 既存データの URL 正規化
-- =============================================================================
-- このファイルは Supabase の SQL Editor で 1 回実行してください。
-- 既存の本データに http:// で保存された表紙画像があれば、すべて https:// に
-- 一括書き換えします。新規保存分はクライアント側で常に https:// 化されるため、
-- このマイグレーションは「過去データを掃除する」用途です。
--
-- 実行前後の確認:
--   SELECT count(*) FROM public.books WHERE cover LIKE 'http://%';
-- =============================================================================

UPDATE public.books
SET cover = REPLACE(cover, 'http://', 'https://')
WHERE cover LIKE 'http://%';

-- 完了確認 (0 件であれば OK):
-- SELECT id, title, cover FROM public.books WHERE cover LIKE 'http://%';
