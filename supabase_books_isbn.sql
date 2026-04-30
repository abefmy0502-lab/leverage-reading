-- Adds ISBN / ASIN columns to books so Amazon Associate links can route
-- straight to the product page instead of a title search.
--
-- ISBN comes from the search pipeline (NDL / openBD / Google Books) and is
-- captured on save. ASIN is reserved for future manual entry — Amazon
-- doesn't expose it via a free API, so for now it stays nullable.

alter table public.books
  add column if not exists isbn text,
  add column if not exists asin text;

-- Helpful index for any future "find duplicate by ISBN" check. Filtered
-- so only rows with a non-empty ISBN are indexed.
create index if not exists books_isbn_idx
  on public.books (isbn)
  where isbn is not null and isbn <> '';
