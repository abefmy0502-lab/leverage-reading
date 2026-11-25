-- ✍️ お気に入りの著者（2026-11-25 オーナー「著者をお気に入り登録できるようにして・新作が出たらおすすめする」）
--
-- 1 人・1 著者に 1 行。name_key は名前を比べるための形（NFKC・空白なし・小文字＝アプリの lib/favoriteAuthors.js の authorKey）。
-- dismissed_isbns＝ホームの「新しい本」の知らせを閉じた本・読みたいに入れた本（もう知らせない・200 冊まで）。
-- 新しい本かどうかは、お気に入りに入れた日（created_at）より後に出る本（予約を含む）で決める＝アプリが楽天の著者の本
--   （/api/cover?author_books=）と比べる。サーバーは利用者の情報を使わない。
--
-- 書き手はアプリ（本人・RLS）。
-- 未適用でも壊れない（表が無ければ端末の localStorage `orime.favAuthors.v1:<利用者>` に控える＝ほかの端末には出ない）。
-- 退会・データの初期化はアプリが本人の行を消す（auth.users の削除でも ON DELETE CASCADE で消える）。
-- 冪等（何度流しても同じ）。Supabase の SQL Editor に貼って実行する。

create table if not exists public.favorite_authors (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name_key text not null,
  name text not null,
  dismissed_isbns text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, name_key)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'favorite_authors_name_check') then
    alter table public.favorite_authors add constraint favorite_authors_name_check
      check (char_length(name) between 1 and 80 and char_length(name_key) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'favorite_authors_dismissed_check') then
    alter table public.favorite_authors add constraint favorite_authors_dismissed_check
      check (coalesce(array_length(dismissed_isbns, 1), 0) <= 200);
  end if;
end $$;

alter table public.favorite_authors enable row level security;

drop policy if exists "favorite_authors_select_own" on public.favorite_authors;
create policy "favorite_authors_select_own" on public.favorite_authors
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "favorite_authors_insert_own" on public.favorite_authors;
create policy "favorite_authors_insert_own" on public.favorite_authors
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "favorite_authors_update_own" on public.favorite_authors;
create policy "favorite_authors_update_own" on public.favorite_authors
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favorite_authors_delete_own" on public.favorite_authors;
create policy "favorite_authors_delete_own" on public.favorite_authors
  for delete to authenticated using (auth.uid() = user_id);
