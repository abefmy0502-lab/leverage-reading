-- 表紙取得時に「どの ISBN（エディション）で画像が見つかったか」を記録
-- する任意カラム。書誌情報の主 ISBN (books.isbn) が表紙不在で、別エ
-- ディション ISBN で表紙が取れた時に、トレースとして保存する。
--
-- 任意カラム — クライアント側 (useBooks.js) は cover_isbn が無くても
-- 動くように schema-error fallback を実装している。

alter table public.books
  add column if not exists cover_isbn text;

create index if not exists books_cover_isbn_idx
  on public.books (cover_isbn)
  where cover_isbn is not null and cover_isbn <> '';
