-- 🧠 AI 参謀（作戦会議）の会話履歴 — 運営ダッシュボードの対話相談役。
--
-- 元帥（運営者）と AI 参謀の対話を時系列で保存する。RLS は本人のみ（自分の行を
-- insert / select / delete 可）。クライアントから直接読み書きする（DEFINER RPC 不要）。
-- 運営ダッシュボードは管理者しか開けないので実質管理者専用だが、RLS 自体は
-- 「自分の行のみ」で十分（他人の会話は見えない）。冪等（DROP POLICY IF EXISTS）。

create table if not exists public.ops_advisor_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
-- 既存テーブル向け: user_id を入れずに insert できるよう default を補填（冪等）。
alter table public.ops_advisor_messages alter column user_id set default auth.uid();

create index if not exists ops_advisor_messages_user_idx
  on public.ops_advisor_messages(user_id, created_at);

alter table public.ops_advisor_messages enable row level security;

drop policy if exists "ops_advisor_select_own" on public.ops_advisor_messages;
create policy "ops_advisor_select_own" on public.ops_advisor_messages
  for select using (auth.uid() = user_id);

drop policy if exists "ops_advisor_insert_own" on public.ops_advisor_messages;
create policy "ops_advisor_insert_own" on public.ops_advisor_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "ops_advisor_delete_own" on public.ops_advisor_messages;
create policy "ops_advisor_delete_own" on public.ops_advisor_messages
  for delete using (auth.uid() = user_id);
