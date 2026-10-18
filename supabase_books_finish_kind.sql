-- 📗 読み終え方（2026-10-18）: 必要なところまで読んで「ここまでで読み終える」を選んだ本の印。
-- books.finish_kind text（null＝ふつう / 'partial'＝途中まで）。状態は読了のまま（4 つの状態は変えない）。
-- 書くのはアプリの useBooks.saveFinishKind（この列だけを update）。RLS は books の既存のポリシーのまま。
-- 未適用でも壊れない（列が無いエラーなら端末の localStorage `orime.finishKind.v1:<本の id>` に控える）。冪等。

alter table public.books add column if not exists finish_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_finish_kind_check') then
    alter table public.books add constraint books_finish_kind_check check (finish_kind is null or finish_kind in ('partial'));
  end if;
end $$;
