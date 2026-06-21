-- 📖 読書進捗（現在ページ / 総ページ）用カラム
--
-- 「読書中」の本に、現在ページ・総ページから控えめな進捗バーを出すための列。
-- 反ゲーミフィケーション方針のため、目標・ノルマ・連続記録などは持たせない。
-- 単純に「今どのあたりを読んでいるか」を視覚化するだけの 2 列。
--
-- - current_page: 現在読んでいるページ（任意。null / 0 で未設定扱い）
-- - total_pages : 本の総ページ数（任意。null / 0 だと進捗バーは非表示）
-- - クライアントは schema-error fallback で対応しているので、このマイグレーションが
--   未適用の DB でも壊れない（この 2 列を落として保存・読込が継続する）。
--   進捗バー機能を使いたい場合のみ実行する。
-- - books の RLS は既存のまま（列追加のみ。ポリシー変更なし）。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS current_page integer;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS total_pages integer;

COMMENT ON COLUMN public.books.current_page IS
  '読書中の本の現在ページ（任意。total_pages と合わせて進捗バーを描画）。';
COMMENT ON COLUMN public.books.total_pages IS
  '本の総ページ数（任意。未設定 / 0 なら進捗バーは非表示）。';
