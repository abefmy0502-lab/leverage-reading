-- 📷 book-covers バケット + RLS — 手動アップロードした表紙を public で配信。
-- 既に supabase_added_via.sql で同じ bucket は作成済みのため、この SQL は
-- idempotent (= 重複実行しても安全)。policy のみ更新したい時にも使える。

insert into storage.buckets (id, name, public)
values ('book-covers', 'book-covers', true)
on conflict (id) do nothing;

drop policy if exists "book_covers_insert_own" on storage.objects;
create policy "book_covers_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'book-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "book_covers_update_own" on storage.objects;
create policy "book_covers_update_own" on storage.objects
  for update using (
    bucket_id = 'book-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "book_covers_delete_own" on storage.objects;
create policy "book_covers_delete_own" on storage.objects
  for delete using (
    bucket_id = 'book-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 読み取りは public バケットのため select policy は不要。
