-- ⏳ 読む時間の目安（2026-10-18）: 本ごとに「この本にかける時間」（分）。
-- books.read_target_min integer（null＝決めていない・30〜6000 分）。画面は読書の時間と目安を並べるだけ（%・残り・達成は出さない）。
-- 書くのはアプリの useBooks.saveReadTarget（この列だけを update）。RLS は books の既存のポリシーのまま。
-- 未適用でも壊れない（列が無いエラーなら端末の localStorage `orime.readTarget.v1:<本の id>` に控える）。冪等。

alter table public.books add column if not exists read_target_min integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_read_target_min_check') then
    alter table public.books add constraint books_read_target_min_check check (read_target_min is null or (read_target_min between 30 and 6000));
  end if;
end $$;
