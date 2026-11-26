-- 📖 どこまで読んだか（ページ・％）と 🗄 アーカイブ（2026-11-26 オーナー）
--
-- 1. current_page / total_pages（前の supabase_books_reading_progress.sql と同じ列・無ければ足す）に、単位の列 progress_unit を足す。
--    'page'＝ページ（current_page は現在のページ・total_pages は総ページ）／'percent'＝％（電子書籍は画面の大きさでページが
--    変わるので・current_page に 0〜100 を入れ、total_pages は使わない）。null は 'page' と同じ。
-- 2. archived_at（アーカイブにした時刻・null＝アーカイブしていない）。4 つの状態とは別の印で、状態はそのまま残す。
--    アプリはホーム・すべての本の一覧（「アーカイブ」で見る）・積読の提案から外す。メモは消さない。
-- books の RLS は既存のまま（列を足すだけ）。未適用でもアプリは壊れない（端末に控える＝ほかの端末には出ない）。冪等。

alter table public.books add column if not exists current_page integer;
alter table public.books add column if not exists total_pages integer;
alter table public.books add column if not exists progress_unit text;
alter table public.books add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_progress_unit_chk') then
    alter table public.books add constraint books_progress_unit_chk
      check (progress_unit is null or progress_unit in ('page', 'percent')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_current_page_range') then
    alter table public.books add constraint books_current_page_range
      check (current_page is null or (current_page >= 0 and current_page <= 20000)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_total_pages_range') then
    alter table public.books add constraint books_total_pages_range
      check (total_pages is null or (total_pages > 0 and total_pages <= 20000)) not valid;
  end if;
end $$;

comment on column public.books.progress_unit is 'どこまで読んだかの単位（page＝ページ／percent＝％・null は page）';
comment on column public.books.archived_at is 'アーカイブにした時刻（null＝していない）。状態は変えずに一覧から外す';
