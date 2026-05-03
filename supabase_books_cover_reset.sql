-- 誤表紙のリセット — 旧バージョンで保存された「プライマリ ISBN と異なる
-- cover_isbn を持つ本」の cover を NULL にする。次回アプリ起動時に
-- fullyResolveCover (primary-ISBN 優先 + 厳格マッチ済み候補) で再解決
-- される。
--
-- 背景:
--   - 旧バージョンは AI 選書追加時に `searchBooksAPIFlat` の 1 件目を
--     盲信して ISBN を採用していた。たとえば「エッセンシャル思考」で
--     検索すると「思考法の必読書 50 冊」が先に返ることがあり、誤った
--     ISBN を `books.isbn` に保存 → primary-ISBN cover lookup が誤表紙を
--     返していた。
--   - クライアント修正 (isStrictMatch + fullyResolveCover の primary 優先)
--     で新規追加は守られるが、既に DB に保存された誤表紙はクライアントから
--     の reset 経路が無いため SQL で一括クリア。
--
-- 実行前確認 (削除対象を見たい場合):
--   SELECT id, title, isbn, cover_isbn, cover
--     FROM public.books
--    WHERE cover IS NOT NULL
--      AND cover_isbn IS NOT NULL
--      AND cover_isbn != 'manual'        -- 手動アップロードは保護
--      AND isbn IS NOT NULL
--      AND cover_isbn != isbn;            -- primary ISBN と違う表紙ソース
--
-- リセット (上の SELECT で内容を確認してから実行):
UPDATE public.books
   SET cover = NULL,
       cover_isbn = NULL
 WHERE cover_isbn IS NOT NULL
   AND cover_isbn != 'manual'
   AND isbn IS NOT NULL
   AND cover_isbn != isbn;

-- 念のためクリア後の状態確認:
--   SELECT count(*) FROM public.books WHERE cover IS NULL;
