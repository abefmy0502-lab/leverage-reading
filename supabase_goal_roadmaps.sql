-- 🧭 目標のロードマップと読書計画（2026-11-15 オーナー「1 年後・3 年後・5 年後の目標を、達成するには？で深掘りしてロードマップに・本棚の本で読書計画カレンダーに」）
--
-- 1 人・1 つの目標（horizon＝'y1' / 'y3' / 'y5'）に 1 行。data（jsonb）に 深掘りの問いと答え・受け取ったまとめ・
-- ロードマップ（必要なこと・今の課題・区切りごとにやること・読む本の id・本棚に無いテーマ）・読書計画（1 日の分・始めた日）を持つ。
-- 目標の文そのものは Supabase Auth の user_metadata.app_goals（lib/goals.js）。ここの goal_text は作ったときの写し。
--
-- 書き手はアプリ（本人・RLS・lib/goalRoadmap.js の saveRoadmap＝upsert）。
-- 未適用でも壊れない（表が無ければ端末の localStorage `orime.goalRoadmaps.v1:<利用者>` に控える＝ほかの端末には出ない）。
-- 退会・データの初期化はアプリが本人の行を消す（auth.users の削除でも ON DELETE CASCADE で消える）。
-- 冪等（何度流しても同じ）。Supabase の SQL Editor に貼って実行する。

create table if not exists public.goal_roadmaps (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  horizon text not null,
  goal_text text not null default '',
  goal_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, horizon)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goal_roadmaps_horizon_check') then
    alter table public.goal_roadmaps add constraint goal_roadmaps_horizon_check check (horizon in ('y1', 'y3', 'y5'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'goal_roadmaps_text_check') then
    alter table public.goal_roadmaps add constraint goal_roadmaps_text_check check (char_length(goal_text) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'goal_roadmaps_data_check') then
    -- ロードマップ 1 つは数 KB。大きすぎる書き込みを止める。
    alter table public.goal_roadmaps add constraint goal_roadmaps_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 32768);
  end if;
end $$;

alter table public.goal_roadmaps enable row level security;

drop policy if exists "goal_roadmaps_select_own" on public.goal_roadmaps;
create policy "goal_roadmaps_select_own" on public.goal_roadmaps
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "goal_roadmaps_insert_own" on public.goal_roadmaps;
create policy "goal_roadmaps_insert_own" on public.goal_roadmaps
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "goal_roadmaps_update_own" on public.goal_roadmaps;
create policy "goal_roadmaps_update_own" on public.goal_roadmaps
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goal_roadmaps_delete_own" on public.goal_roadmaps;
create policy "goal_roadmaps_delete_own" on public.goal_roadmaps
  for delete to authenticated using (auth.uid() = user_id);
