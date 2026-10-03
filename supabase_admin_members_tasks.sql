-- 🧩 操縦席の強化: ①会員内訳（有料/無料期間/解約の分離）②日次タスク。
-- ※ 先に supabase_admin_metrics.sql / _ops / _growth / _exclude_admins を適用済みであること。
-- 冪等。

-- ── ① subscriptions に「無料期間」を区別する period_type を追加 ──────────────
-- RevenueCat / App Store の period_type を保持する想定:
--   'trial' = 無料期間（売上0）、'normal'（または null）・'intro'（有料の初回価格＝創業メンバー価格「1 年目 ¥9,800」）= 有料。
--   （2026-10-02 に 'intro' を有料へ。RevenueCat の period_type は TRIAL＝無料・INTRO＝有料の初回価格。再適用で反映）
-- Webhook（RevenueCat→subscriptions）がこの列に書けば、ダッシュボードが自動で
-- 有料と無料期間を分離する。未設定（null）は有料(normal)扱い。
alter table public.subscriptions
  add column if not exists period_type text;

-- ── ② 日次タスク（今やるべきことの日次分解） ──────────────────────────────
create table if not exists public.ops_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  due_date   date not null,
  dept       text,                 -- 経営 / マーケ営業 / 開発 / 経理
  title      text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ops_tasks_user_date_idx on public.ops_tasks(user_id, due_date);
alter table public.ops_tasks alter column user_id set default auth.uid();
alter table public.ops_tasks enable row level security;
-- 既存の ops_advisor_messages にも default を補填（user_id 無し insert を許容）。存在時のみ。
do $$ begin
  if to_regclass('public.ops_advisor_messages') is not null then
    alter table public.ops_advisor_messages alter column user_id set default auth.uid();
  end if;
end $$;
drop policy if exists "ops_tasks_all_own" on public.ops_tasks;
create policy "ops_tasks_all_own" on public.ops_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── ③ 売上 / 課金（会員内訳：有料 / 無料期間 / 解約。管理者除外） ────────────
-- active = 有料（status='active' かつ無料期間でない）→ MRR はこれだけで計算。
-- trial  = 無料期間（status='active' かつ period_type が trial）= 売上0。intro（有料の初回価格）は有料に数える。
-- founding = active のうち period_type='intro'（創業メンバー価格・内訳。2026-10-02 追加。無い古い定義でもアプリは 0 として動く）。
-- canceled = 解約（status が active 以外）→ 会員数に含めない。
create or replace function public.admin_revenue()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'active', (select count(*) from public.subscriptions
      where status = 'active' and coalesce(period_type, 'normal') <> 'trial'
        and user_id not in (select user_id from public.app_admins)),
    -- founding = 有料のうち、有料の初回価格（period_type 'intro'＝創業メンバー価格「1 年目 ¥9,800」）の人。
    -- active に含まれる（内訳）。ダッシュボードの MRR は、この人数だけ ¥9,800 ÷ 12 で数える（2026-10-02）。
    'founding', (select count(*) from public.subscriptions
      where status = 'active' and period_type = 'intro'
        and user_id not in (select user_id from public.app_admins)),
    'trial', (select count(*) from public.subscriptions
      where status = 'active' and coalesce(period_type, 'normal') = 'trial'
        and user_id not in (select user_id from public.app_admins)),
    'canceled', (select count(*) from public.subscriptions
      where status is not null and status <> 'active'
        and user_id not in (select user_id from public.app_admins)),
    'by_status', coalesce((select jsonb_object_agg(coalesce(status, '?'), c)
      from (select status, count(*) c from public.subscriptions
        where user_id not in (select user_id from public.app_admins) group by status) t), '{}'::jsonb),
    'expiring_30d', (select count(*) from public.subscriptions
      where status = 'active' and coalesce(period_type, 'normal') <> 'trial'
        and current_period_end is not null and current_period_end < now() + interval '30 days'
        and user_id not in (select user_id from public.app_admins))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_revenue() to authenticated;
