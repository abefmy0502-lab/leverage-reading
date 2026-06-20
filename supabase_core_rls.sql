-- ============================================================================
-- 🛡️ コアテーブルの Row Level Security (RLS) — books / book_memos / book_tags /
--    actions と book-memo-photos ストレージバケット
-- ============================================================================
--
-- 背景:
--   アプリの中核データ (本・メモ・タグ・行動・写真) のアクセス制御は、これまで
--   リポジトリ上に SQL として明文化されていなかった。クライアントは anon key
--   (ブラウザに露出する正規の鍵) で直接これらのテーブルを叩くため、RLS が無い /
--   甘いと、任意の認証ユーザーが他人の id を推測・列挙して他人のデータを
--   読み書き・削除できてしまう (= 致命的な情報漏洩)。
--
--   このマイグレーションは、各テーブルに RLS を有効化し「自分の行
--   (auth.uid() = user_id) だけ」を読み書きできる owner-only ポリシーを定義する。
--   写真バケットも private + ユーザーフォルダ単位のポリシーにする。
--
-- 適用方法:
--   Supabase ダッシュボード → SQL Editor にコピペで実行 (service_role 権限)。
--   何度実行しても同じ結果になる (idempotent) ように DROP POLICY IF EXISTS →
--   CREATE の順で書いている。
--
-- 前提カラム (コードと一致):
--   books      : id (uuid pk), user_id (uuid)
--   book_memos : id, user_id, book_id (nullable)
--   book_tags  : book_id, user_id
--   actions    : id, book_id, user_id
--   写真パス    : book-memo-photos/{user_id}/{book_id}/{file}  (先頭フォルダ = user_id)
--
-- 確認クエリ (適用後に全テーブルの RLS 状態を点検):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- ============================================================================

-- ---------- books ----------
alter table public.books enable row level security;

drop policy if exists "books_select_own" on public.books;
create policy "books_select_own" on public.books
  for select using (auth.uid() = user_id);

drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own" on public.books
  for insert with check (auth.uid() = user_id);

drop policy if exists "books_update_own" on public.books;
create policy "books_update_own" on public.books
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own" on public.books
  for delete using (auth.uid() = user_id);

-- ---------- book_memos ----------
alter table public.book_memos enable row level security;

drop policy if exists "book_memos_select_own" on public.book_memos;
create policy "book_memos_select_own" on public.book_memos
  for select using (auth.uid() = user_id);

drop policy if exists "book_memos_insert_own" on public.book_memos;
create policy "book_memos_insert_own" on public.book_memos
  for insert with check (auth.uid() = user_id);

drop policy if exists "book_memos_update_own" on public.book_memos;
create policy "book_memos_update_own" on public.book_memos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "book_memos_delete_own" on public.book_memos;
create policy "book_memos_delete_own" on public.book_memos
  for delete using (auth.uid() = user_id);

-- ---------- book_tags ----------
alter table public.book_tags enable row level security;

drop policy if exists "book_tags_select_own" on public.book_tags;
create policy "book_tags_select_own" on public.book_tags
  for select using (auth.uid() = user_id);

drop policy if exists "book_tags_insert_own" on public.book_tags;
create policy "book_tags_insert_own" on public.book_tags
  for insert with check (auth.uid() = user_id);

drop policy if exists "book_tags_update_own" on public.book_tags;
create policy "book_tags_update_own" on public.book_tags
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "book_tags_delete_own" on public.book_tags;
create policy "book_tags_delete_own" on public.book_tags
  for delete using (auth.uid() = user_id);

-- ---------- actions ----------
alter table public.actions enable row level security;

drop policy if exists "actions_select_own" on public.actions;
create policy "actions_select_own" on public.actions
  for select using (auth.uid() = user_id);

drop policy if exists "actions_insert_own" on public.actions;
create policy "actions_insert_own" on public.actions
  for insert with check (auth.uid() = user_id);

drop policy if exists "actions_update_own" on public.actions;
create policy "actions_update_own" on public.actions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "actions_delete_own" on public.actions;
create policy "actions_delete_own" on public.actions
  for delete using (auth.uid() = user_id);

-- ---------- book-memo-photos ストレージバケット ----------
-- private バケットを作成 (既にあれば何もしない)。
insert into storage.buckets (id, name, public)
values ('book-memo-photos', 'book-memo-photos', false)
on conflict (id) do nothing;

-- パスの先頭フォルダ (= user_id) が自分の uid と一致する時だけ
-- 読み書き・削除を許可する。
drop policy if exists "book_memo_photos_select_own" on storage.objects;
create policy "book_memo_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'book-memo-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "book_memo_photos_insert_own" on storage.objects;
create policy "book_memo_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'book-memo-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "book_memo_photos_update_own" on storage.objects;
create policy "book_memo_photos_update_own" on storage.objects
  for update using (
    bucket_id = 'book-memo-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "book_memo_photos_delete_own" on storage.objects;
create policy "book_memo_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'book-memo-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
