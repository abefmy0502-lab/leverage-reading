-- 🔁 AI 選書 → セットアップシート引き継ぎ用カラム
--
-- AI 選書アドバイザーで入力したユーザーの課題（例: "営業成績を上げたい"）を
-- そのまま「読書前」の投資目的にプレフィルできるよう、本テーブルに紐づけて保存する。
--
-- - source_query: AI 選書で本を提案させた際にユーザーが入力した最後のメッセージ。
--   セットアップシート側 (invest_purpose) が空なら、UI で source_query を初期値として表示する。
-- - クライアントは schema-error fallback で対応しているので、このマイグレーションが
--   未適用の DB でも壊れない (列なしモードで保存される)。新機能を使いたい場合のみ実行。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS source_query text;

COMMENT ON COLUMN public.books.source_query IS
  'AI 選書アドバイザーで本を提案させた際の元クエリ。セットアップシートの投資目的に引き継ぐ。';
