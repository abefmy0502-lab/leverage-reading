-- 📚 同じ本の重複登録を防ぐ UNIQUE 制約
--
-- 同じユーザーが同じ ISBN の本を 2 度以上登録できないようにする最終防衛線。
-- アプリ側 (src/lib/checkDuplicate.js) で大半は止めるが、競合 / 古いクライアント /
-- 直接 SQL で挿入されるケースに備えて DB レベルでも弾く。
--
-- ⚠ 注意: 既に重複が残っている本がある DB にこの SQL を流すと UNIQUE 制約の
-- 作成自体が失敗する。先に手動で重複を整理してから実行すること。
--
-- 重複確認:
--   SELECT user_id, isbn, count(*) AS dup_count, array_agg(id) AS book_ids
--   FROM books
--   WHERE isbn IS NOT NULL
--   GROUP BY user_id, isbn
--   HAVING count(*) > 1;
--
-- ISBN 無し (タイトル+著者) 重複確認:
--   SELECT user_id, lower(title), lower(coalesce(author, '')), count(*) AS dup_count
--   FROM books
--   WHERE isbn IS NULL
--   GROUP BY user_id, lower(title), lower(coalesce(author, ''))
--   HAVING count(*) > 1;

-- ISBN ベースのユニーク (NULL は対象外、ISBN ありの行だけ重複防止)
CREATE UNIQUE INDEX IF NOT EXISTS books_user_isbn_unique
  ON public.books(user_id, isbn)
  WHERE isbn IS NOT NULL;

-- ISBN なし (自費出版・古書など) は title+author の正規化キーで重複防止
CREATE UNIQUE INDEX IF NOT EXISTS books_user_title_author_unique
  ON public.books(user_id, lower(title), lower(coalesce(author, '')))
  WHERE isbn IS NULL;
