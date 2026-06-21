-- 📊 テーマレポート（Theme Report）の保存先。
--
-- ユーザーが特定テーマ（例: 営業）について生成した統合レポートを保存し、
-- AI タブ →「📊 テーマレポート」→「🕒 履歴」から見返せるようにする。
--
-- 任意マイグレーション: 未適用でも機能は動く（生成・コピーはその場で可能、
-- 履歴の保存/表示だけが無効になる）。クライアントの ai.js
-- saveThemeReport / loadThemeReports / deleteThemeReport は schema-error 時に
-- graceful degradation する（保存は no-op、履歴は availability:false で非表示）。
--
-- Supabase の SQL Editor にコピペで実行する想定。

create table if not exists public.theme_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  theme         text not null,
  content       text not null,
  generated_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 履歴一覧（新しい順）用のインデックス。
create index if not exists theme_reports_user_idx
  on public.theme_reports(user_id, generated_at desc);

-- Row Level Security: 自分の行だけ読み書きできる。
alter table public.theme_reports enable row level security;

-- 冪等性のため既存ポリシーを drop してから作り直す。
drop policy if exists "theme_reports_select_own" on public.theme_reports;
drop policy if exists "theme_reports_insert_own" on public.theme_reports;
drop policy if exists "theme_reports_update_own" on public.theme_reports;
drop policy if exists "theme_reports_delete_own" on public.theme_reports;

create policy "theme_reports_select_own" on public.theme_reports
  for select using (auth.uid() = user_id);

create policy "theme_reports_insert_own" on public.theme_reports
  for insert with check (auth.uid() = user_id);

create policy "theme_reports_update_own" on public.theme_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "theme_reports_delete_own" on public.theme_reports
  for delete using (auth.uid() = user_id);
