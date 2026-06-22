-- 🛡️ セキュリティ堅牢化マイグレーション（RLS 再保証 + Storage バケット防御）
--
-- 監査で判明した 4 点を、冪等な単一 SQL で固める:
--   1. コアテーブル（books / book_memos / actions / book_tags）の RLS 定義が
--      リポジトリ外にあり、版管理されていなかった → ここで再保証する。
--   2. private 写真バケット（book-memo-photos）の定義がリポジトリに無かった
--      → public=false で作成し、user-folder ベースの所有権ポリシーを張る。
--   3. book-covers バケットの書き込みポリシーに TO authenticated が無く、
--      anon でも user-folder 名を詐称すれば書ける余地があった → 作り直す。
--   4. analytics_events の props（jsonb）にサイズ上限が無く、巨大 PII を
--      流し込まれ得た → CHECK で上限を付ける。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    Vercel デプロイでは自動実行されない。
--
-- 冪等性: 本番が既に正しく設定済みでも安全に再適用できる。
--   - テーブル/バケット作成は IF NOT EXISTS / ON CONFLICT DO NOTHING。
--   - ポリシーは DROP POLICY IF EXISTS → CREATE で常に最新定義へ置換。
--   - ENABLE ROW LEVEL SECURITY は既に有効でも no-op。
--   - CHECK 制約は制約名の存在確認で多重追加を防ぐ（Postgres は CHECK 制約に
--     ADD CONSTRAINT IF NOT EXISTS が使えないため DO ブロックで冪等化）。


-- =====================================================================
-- 1. コアテーブル RLS 再保証
-- =====================================================================
-- books / book_memos / actions はいずれも user_id 列を持つ
-- （src/hooks/useBooks.js / src/hooks/useBookMemos.js で確認）。
-- 所有権は一貫して auth.uid() = user_id。

-- ---- books ----
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "books_select_own" ON public.books;
CREATE POLICY "books_select_own" ON public.books
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "books_insert_own" ON public.books;
CREATE POLICY "books_insert_own" ON public.books
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "books_update_own" ON public.books;
CREATE POLICY "books_update_own" ON public.books
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "books_delete_own" ON public.books;
CREATE POLICY "books_delete_own" ON public.books
  FOR DELETE USING (auth.uid() = user_id);

-- ---- book_memos ----
ALTER TABLE public.book_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_memos_select_own" ON public.book_memos;
CREATE POLICY "book_memos_select_own" ON public.book_memos
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_memos_insert_own" ON public.book_memos;
CREATE POLICY "book_memos_insert_own" ON public.book_memos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_memos_update_own" ON public.book_memos;
CREATE POLICY "book_memos_update_own" ON public.book_memos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_memos_delete_own" ON public.book_memos;
CREATE POLICY "book_memos_delete_own" ON public.book_memos
  FOR DELETE USING (auth.uid() = user_id);

-- ---- actions ----
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actions_select_own" ON public.actions;
CREATE POLICY "actions_select_own" ON public.actions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_insert_own" ON public.actions;
CREATE POLICY "actions_insert_own" ON public.actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_update_own" ON public.actions;
CREATE POLICY "actions_update_own" ON public.actions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_delete_own" ON public.actions;
CREATE POLICY "actions_delete_own" ON public.actions
  FOR DELETE USING (auth.uid() = user_id);

-- ---- book_tags ----
-- 前提: book_tags は user_id 列を持つ（src/hooks/useBooks.js の INSERT が
--   { book_id, user_id, tag_name } を書き込み、AccountSettings.jsx の退会処理が
--   .delete().eq('user_id', user.id) で消していることから確認）。
--   万一この前提（user_id 列）が当該 DB と異なる場合は、下の所有権式を
--   book_id 経由（EXISTS (select 1 from public.books b
--   where b.id = book_tags.book_id and b.user_id = auth.uid())）へ
--   差し替えること。推測で列を壊さないため、ここでは確認済みの user_id を採用。
ALTER TABLE public.book_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_tags_select_own" ON public.book_tags;
CREATE POLICY "book_tags_select_own" ON public.book_tags
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_tags_insert_own" ON public.book_tags;
CREATE POLICY "book_tags_insert_own" ON public.book_tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_tags_update_own" ON public.book_tags;
CREATE POLICY "book_tags_update_own" ON public.book_tags
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_tags_delete_own" ON public.book_tags;
CREATE POLICY "book_tags_delete_own" ON public.book_tags
  FOR DELETE USING (auth.uid() = user_id);


-- =====================================================================
-- 2. private 写真バケット（book-memo-photos）+ user-folder 所有権
-- =====================================================================
-- パス構造は userId/<book_id>/<file>（src/hooks/useBookMemos.js uploadPhoto）。
-- → (storage.foldername(name))[1] が所有者の auth.uid()。
-- public=false で署名 URL 経由のみアクセス可（直接 getPublicUrl は不可）。
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-memo-photos', 'book-memo-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "book_memo_photos_select_own" ON storage.objects;
CREATE POLICY "book_memo_photos_select_own" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_memo_photos_insert_own" ON storage.objects;
CREATE POLICY "book_memo_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_memo_photos_update_own" ON storage.objects;
CREATE POLICY "book_memo_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  ) WITH CHECK (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_memo_photos_delete_own" ON storage.objects;
CREATE POLICY "book_memo_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- =====================================================================
-- 3. book-covers の anon 書き込み封じ（TO authenticated で作り直し）
-- =====================================================================
-- 既存ポリシー（supabase_book_covers_bucket.sql / supabase_added_via.sql）は
-- TO authenticated を欠いており、anon ロールにも書き込みが評価され得た。
-- public read は維持しつつ、書き込みは authenticated + user-folder 所有権に限定。
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "book_covers_insert_own" ON storage.objects;
CREATE POLICY "book_covers_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_covers_update_own" ON storage.objects;
CREATE POLICY "book_covers_update_own" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  ) WITH CHECK (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_covers_delete_own" ON storage.objects;
CREATE POLICY "book_covers_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
-- 読み取りは public バケットのため SELECT ポリシーは不要（既定で public read）。


-- =====================================================================
-- 4. analytics_events.props のサイズ上限（PII 流し込み防止の二重防衛）
-- =====================================================================
-- クライアント（src/lib/analytics.js）でサニタイズ済みだが、DB 側でも
-- pg_column_size(props) < 2048 バイトを強制し、巨大ペイロード（=PII 疑い）を
-- 構造的に弾く。CHECK 制約は IF NOT EXISTS が使えないため、制約名の存在確認で
-- 冪等化する。テーブル未適用（supabase_analytics_events.sql 未実行）の環境では
-- スキップする。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'analytics_events'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analytics_events_props_size_chk'
      AND conrelid = 'public.analytics_events'::regclass
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_props_size_chk
      CHECK (pg_column_size(props) < 2048);
  END IF;
END $$;
