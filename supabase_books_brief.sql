-- 📖 この本で学べること（2026-10-08）
--
-- 読みたい・積読の本の詳細の「この本について」から作る、AI の短いまとめ（概要・学べること・仮説の例）を本に保存する。
-- 材料は出版社・書店が公開している紹介文と目次だけ（src/lib/bookBrief.js・purpose 'book_brief'）。
-- 一度作ったら開くたびに AI を呼ばない（作り直しは押したときだけ）。
--
-- - ai_brief: 決まった 3 つの見出し（## 概要 / ## 学べること / ## 仮説の例）の Markdown。600 字ほど（上限 2,000 字）
--
-- RLS: books の既存のポリシー（自分の行だけ・supabase_security_hardening.sql）がそのまま効く。新しいポリシーは要らない。
-- クライアントは未適用でも壊れない: 書き込みが「列が無い」で失敗したら端末（localStorage）に控えて見せる
-- （src/hooks/useBooks.js の saveBookBrief）。本の保存（saveBook）はこの列を書かないので、ほかの保存は影響を受けない。
-- 冪等（何度流しても同じ）。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS ai_brief text;

COMMENT ON COLUMN public.books.ai_brief IS 'この本で学べること（公開の紹介文と目次から AI が作った概要・学べること・仮説の例。Markdown）';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'books_ai_brief_len'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_ai_brief_len CHECK (ai_brief IS NULL OR char_length(ai_brief) <= 2000);
  END IF;
END $$;
