-- 🏢 作戦司令室（社員フロア）の報告ログ — AI 企業の「記憶」。
-- 各社員（member_id）の報告と CEO室の統合ブリーフ（member_id='__integration__'）を
-- 追記していく。最新行 = その社員の現在の状態、過去行 = 履歴。
-- 管理者（元帥）本人の行のみ RLS で読み書き可（他人は一切見えない）。
-- さらに is_app_admin() ゲートで「管理者以外は自分の行すら作れない」ようにする
-- （UI 入口は AdminDashboard 内だが、anon キー + 自分の JWT で直接 INSERT する
--  ストレージ濫用ベクトルをテーブル側でも封じる = UI とテーブルの二層ゲート）。
-- 未適用でもクライアントは localStorage にフォールバックするため機能は壊れない。
--
-- 依存: supabase_admin_metrics.sql（is_app_admin() 関数）を先に適用すること。
-- 冪等（IF NOT EXISTS / DROP POLICY IF EXISTS）。

create table if not exists public.ops_floor_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id text not null,          -- aiCompany.js の社員 id、または '__integration__'
  kind text not null default 'report',  -- 'report' | 'integration'
  status text,                      -- フロア表示用の一言（integration は null）
  body text,                        -- 成果物 / 統合ブリーフ本体（Markdown）
  created_at timestamptz not null default now(),
  constraint ops_floor_reports_member_len check (char_length(member_id) <= 64),
  constraint ops_floor_reports_status_len check (status is null or char_length(status) <= 120),
  constraint ops_floor_reports_body_len check (body is null or char_length(body) <= 8000)
);

alter table public.ops_floor_reports enable row level security;

drop policy if exists ofr_all on public.ops_floor_reports;
create policy ofr_all on public.ops_floor_reports
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());

-- 最新行・履歴の取得を速くする（user × member × 新しい順）。
create index if not exists ops_floor_reports_user_member_idx
  on public.ops_floor_reports (user_id, member_id, created_at desc);
