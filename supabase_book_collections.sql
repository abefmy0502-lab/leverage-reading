-- 🗂 フォルダ分け（コレクション）— 本を自由なグループに整理する任意機能。
-- 構造は book_tags と同型（本に対する複数ラベル）。1 本が複数フォルダに所属可。
-- クライアント（useBooks.js）は book_collections 未作成でも staged schema-error
-- fallback で本の保存・読込が壊れないため、適用は任意・後追いで OK。
-- Supabase SQL Editor にコピペで実行する想定（冪等）。

create table if not exists public.book_collections (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  collection_name text not null,
  created_at    timestamptz not null default now()
);

-- 同じ本に同じフォルダ名を二重登録しない。
create unique index if not exists book_collections_unique
  on public.book_collections (book_id, collection_name);
create index if not exists book_collections_book_idx on public.book_collections (book_id);
create index if not exists book_collections_user_idx on public.book_collections (user_id);

alter table public.book_collections enable row level security;

-- 自分の行のみ全操作可（auth.uid() = user_id）。
drop policy if exists "book_collections_select_own" on public.book_collections;
create policy "book_collections_select_own" on public.book_collections
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "book_collections_insert_own" on public.book_collections;
create policy "book_collections_insert_own" on public.book_collections
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "book_collections_update_own" on public.book_collections;
create policy "book_collections_update_own" on public.book_collections
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "book_collections_delete_own" on public.book_collections;
create policy "book_collections_delete_own" on public.book_collections
  for delete to authenticated using (auth.uid() = user_id);
