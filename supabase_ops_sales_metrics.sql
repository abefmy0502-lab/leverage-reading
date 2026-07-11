-- 📣 営業ウィークリー計測 — 営業戦略（company/sales-strategy-2026-2027.md §7）の
-- 週次KPI（新規課金/インストール/LPクリック/note PV/Xプロフクリック）を記録する。
-- App Store Connect / note / X アナリティクスの数字は自動取得できないため、
-- 週次レビュー（日曜）に操縦席の 📣 営業タブから手入力する。
-- RLS は ops_floor_reports と同じ二層ゲート（本人 AND is_app_admin()）。
-- 依存: supabase_admin_metrics.sql（is_app_admin()）。冪等。

create table if not exists public.ops_sales_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,              -- その週の月曜日
  new_paid integer,                      -- 新規課金者数
  installs integer,                      -- App インストール数
  lp_clicks integer,                     -- LP クリック（UTM 集計）
  note_pv integer,                       -- note 週間PV
  x_profile_clicks integer,              -- X プロフィールクリック
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  constraint osm_memo_len check (memo is null or char_length(memo) <= 500)
);

alter table public.ops_sales_metrics enable row level security;

drop policy if exists osm_all on public.ops_sales_metrics;
create policy osm_all on public.ops_sales_metrics
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());

create index if not exists ops_sales_metrics_user_week_idx
  on public.ops_sales_metrics (user_id, week_start desc);
