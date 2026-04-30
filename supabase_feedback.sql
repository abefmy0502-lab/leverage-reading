-- 📩 ユーザーフィードバック・要望テーブル。
--
-- 設計方針:
-- - user_id は ON DELETE SET NULL — 退会後もフィードバック自体は残し、
--   匿名フィードバックとして読めるようにする。
-- - RLS により利用者は自分の投稿しか SELECT できない。管理者は SQL Editor
--   (service_role 相当) で全件読む想定。
-- - status / admin_note は管理者がトリアージ用に直接書き換える列。
--   ユーザーには触らせない (UPDATE ポリシーを敢えて作らない)。

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  category    text not null check (category in ('bug', 'feature', 'ui', 'question', 'thanks', 'other')),
  content     text not null,
  name        text,
  email       text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  status      text default 'open' check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),
  admin_note  text
);

create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx  on public.feedback (status);

alter table public.feedback enable row level security;

-- INSERT: ログイン中なら user_id は本人と一致、未ログインなら user_id null。
drop policy if exists "feedback_insert_anyone" on public.feedback;
create policy "feedback_insert_anyone" on public.feedback
  for insert
  with check (auth.uid() = user_id or user_id is null);

-- SELECT: 自分の投稿のみ閲覧可。管理者は service_role 経由で全件アクセス。
drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select
  using (auth.uid() = user_id);

-- UPDATE / DELETE: 一切ポリシーを作らない。
-- → 一般ユーザーは投稿後に編集・削除できない (運営側が確認した後の改ざん防止)。
-- → 管理者は SQL Editor / service_role で個別対応する。
