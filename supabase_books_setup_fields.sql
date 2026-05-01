-- 🤖 AI 選書 → セットアップシート構造化引き継ぎ
--
-- AI 選書アドバイザーとの会話を構造化要約し、本を追加した瞬間に投資目的だけでなく
-- 「現在の課題」「仮説」「AI の選書理由」までセットアップシートにプレフィルできる
-- ようカラムを追加する。
--
-- - current_challenge: 今直面している具体的な課題（編集可）
-- - hypothesis:        この本を読むことで生まれる変化の仮説（編集可）
-- - book_reason:       AI 選書アドバイザーがこの本を選んだ理由（読み取り専用 / 履歴）
--
-- クライアントは schema-error fallback を備えているので、未適用の DB でも保存は
-- 失敗しない（該当列を payload から落として再試行）。新機能を有効にしたい場合のみ実行。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS current_challenge text,
  ADD COLUMN IF NOT EXISTS hypothesis        text,
  ADD COLUMN IF NOT EXISTS book_reason       text;

COMMENT ON COLUMN public.books.current_challenge IS '今直面している具体的な課題（AI 選書要約からプレフィル / ユーザー編集可）';
COMMENT ON COLUMN public.books.hypothesis        IS 'この本を読むことで生まれる変化の仮説（AI 選書要約からプレフィル / ユーザー編集可）';
COMMENT ON COLUMN public.books.book_reason       IS 'AI 選書アドバイザーがこの本を選んだ理由（読み取り専用、履歴として保持）';
