-- ⚡ コアテーブル（books / book_memos）のインデックス補強。
--
-- この 2 テーブルは元の CREATE TABLE がリポジトリ内に無く（RLS 定義のみが
-- supabase_security_hardening.sql に版管理下として存在）、支持インデックスが
-- 実際にあるかどうかコードからは確認できない。ほぼ全ての画面・AI 機能
-- （本棚一覧 / メモ一覧 / 🔄振り返り / 🧠マイ読書脳・📊テーマレポートの RAG
-- コンテキスト取得 gatherKnowledge 等）がこの 2 テーブルへの
-- `user_id` 絞り込み + created_at/updated_at ソート、または `book_id` 絞り込み
-- に依存しているため、インデックス欠落があれば全リクエストの遅延に直結する。
-- CREATE INDEX IF NOT EXISTS なので、既に存在する場合は no-op（副作用なし）。
-- Supabase SQL Editor にコピペで実行。

create index if not exists book_memos_user_created_idx
  on public.book_memos (user_id, created_at desc);

create index if not exists book_memos_book_id_idx
  on public.book_memos (book_id);

create index if not exists books_user_updated_idx
  on public.books (user_id, updated_at desc);
