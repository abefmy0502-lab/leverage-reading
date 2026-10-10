-- ⏱ 読書の時間（集中モード・2026-10-09 オーナー「時間を決めて読書する」）
--
-- 集中モード（タイマー／計測）でおわったときに 1 回分を 1 行残す。画面に出すのは
-- 「今日この本を何分読んだか」と「この本で これまで何分」だけ（連続日数・目標・順位は作らない）。
-- 書き手はアプリ（src/lib/readingSessions.js・本人の行だけ・RLS）。
-- 未適用でも壊れない: 表が無いエラーなら端末の localStorage（orime.readingSessions.v1）に控える（ほかの端末には出ない）。
-- 本を消すと、その本の行も消える（ON DELETE CASCADE）。退会・データの初期化はアプリが本人の行を消す。データの書き出しの対象。
-- 冪等（何度流しても同じ）。Supabase の SQL Editor に貼って実行する。

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  seconds integer not null,
  mode text not null,
  created_at timestamptz not null default now()
);

-- 値の決まり（制約名で冪等に足す）。1 回は 6 時間まで（アプリも 6 時間で止める）。
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reading_sessions_seconds_check') then
    alter table public.reading_sessions add constraint reading_sessions_seconds_check check (seconds >= 0 and seconds <= 21600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reading_sessions_mode_check') then
    alter table public.reading_sessions add constraint reading_sessions_mode_check check (mode in ('timer', 'count'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reading_sessions_range_check') then
    alter table public.reading_sessions add constraint reading_sessions_range_check check (ended_at >= started_at);
  end if;
end $$;

-- 一覧（本人の新しい順）と、本ごとの合計。
create index if not exists reading_sessions_user_started_idx on public.reading_sessions (user_id, started_at desc);
create index if not exists reading_sessions_book_idx on public.reading_sessions (book_id);

-- RLS: 本人の行だけ。書くときは、その本も本人のものであること。
alter table public.reading_sessions enable row level security;

drop policy if exists "reading_sessions_select_own" on public.reading_sessions;
create policy "reading_sessions_select_own" on public.reading_sessions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "reading_sessions_insert_own" on public.reading_sessions;
create policy "reading_sessions_insert_own" on public.reading_sessions
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
  );

drop policy if exists "reading_sessions_update_own" on public.reading_sessions;
-- 書き換えても、ほかの人の本につけ替えられない（insert と同じ確かめ・2026-10-10）。
create policy "reading_sessions_update_own" on public.reading_sessions
  for update to authenticated using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
  );

drop policy if exists "reading_sessions_delete_own" on public.reading_sessions;
create policy "reading_sessions_delete_own" on public.reading_sessions
  for delete to authenticated using (auth.uid() = user_id);
