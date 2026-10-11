-- 🎯 2027 年中に有料ユーザー 1,000 人（2026-10-11 オーナー決定）— 運営ダッシュボードの「目標の進み具合」と毎週の見直し。
--
-- ※ 依存（先に流す）: supabase_admin_metrics.sql（app_admins / is_app_admin / _require_admin）・
--    supabase_admin_ops.sql（ops_goals）・supabase_ops_sales_metrics.sql（ops_sales_metrics）。
--    読むだけの表（無くても壊れない＝有無を確かめてから動的 SQL で読む）:
--    subscription_events（契約の履歴）・lp_events（紹介ページの記録）・subscriptions・analytics_events。
-- 冪等（IF NOT EXISTS・CREATE OR REPLACE・DROP POLICY IF EXISTS）。管理者（app_admins）は全部の数から除く。
-- 画面の読み方と毎週の見直しの手順は docs/goal-1000.md。
--
-- 作るもの:
--   ① ops_goals に道しるべ（milestones）と公開日（launch_date）の列 ＋ admin_goal_plan() / admin_set_goal_plan()
--   ② ops_sales_metrics に「App Store のページの表示」（store_page_views）の列（手入力・ストアのページ → 入手の率）
--   ③ ops_weekly_reviews ＝ 毎週の見直しの記録（数字のかたまり＋選んだ打ち手＋メモ）。本人 AND 管理者だけ
--   ④ admin_goal_weekly(p_weeks) ＝ 週ごとの流れ（紹介ページ → 登録 → 7 日間無料 → 有料 → 解約 → 純増）と
--      今の有料・年額・創業メンバーの更新・共有した人

-- ── ① 目標の道しるべ ─────────────────────────────────────────────────────────
alter table if exists public.ops_goals add column if not exists milestones jsonb;
alter table if exists public.ops_goals add column if not exists launch_date date;
do $$ begin
  if to_regclass('public.ops_goals') is not null and not exists (
    select 1 from pg_constraint where conname = 'ops_goals_milestones_check'
  ) then
    alter table public.ops_goals add constraint ops_goals_milestones_check
      check (milestones is null or (jsonb_typeof(milestones) = 'array' and jsonb_array_length(milestones) <= 24
                                    and pg_column_size(milestones) < 4096));
  end if;
end $$;

-- 返り値: { metric, target, deadline, milestones: [{ d: 'YYYY-MM-DD', n }], launch_date } か null（未設定）
create or replace function public.admin_goal_plan()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object('metric', metric, 'target', target, 'deadline', deadline,
                            'milestones', milestones, 'launch_date', launch_date, 'updated_at', updated_at)
    into result from public.ops_goals where user_id = auth.uid();
  return result;
end;
$$;
grant execute on function public.admin_goal_plan() to authenticated;

-- 有料ユーザーの目標（人数・期限・道しるべ・公開日）を保存する。metric は paid_users に固定。
create or replace function public.admin_set_goal_plan(
  p_target numeric, p_deadline date, p_milestones jsonb default null, p_launch date default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_admin();
  if p_milestones is not null and (jsonb_typeof(p_milestones) <> 'array' or jsonb_array_length(p_milestones) > 24) then
    raise exception 'invalid milestones';
  end if;
  insert into public.ops_goals (user_id, metric, target, deadline, milestones, launch_date, updated_at)
  values (auth.uid(), 'paid_users', greatest(coalesce(p_target, 0), 0), p_deadline, p_milestones, p_launch, now())
  on conflict (user_id) do update
    set metric = 'paid_users', target = excluded.target, deadline = excluded.deadline,
        milestones = excluded.milestones, launch_date = excluded.launch_date, updated_at = now();
end;
$$;
grant execute on function public.admin_set_goal_plan(numeric, date, jsonb, date) to authenticated;

-- ── ② 手入力の週の数字に「ストアのページの表示」 ─────────────────────────────────
alter table if exists public.ops_sales_metrics add column if not exists store_page_views integer;

-- ── ③ 毎週の見直し ────────────────────────────────────────────────────────────
create table if not exists public.ops_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  numbers jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  weakest text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  constraint owr_numbers_size check (pg_column_size(numbers) < 4096),
  constraint owr_actions_size check (pg_column_size(actions) < 4096),
  constraint owr_weakest_len check (weakest is null or char_length(weakest) <= 40),
  constraint owr_memo_len check (memo is null or char_length(memo) <= 1000)
);

alter table public.ops_weekly_reviews enable row level security;

drop policy if exists owr_all on public.ops_weekly_reviews;
create policy owr_all on public.ops_weekly_reviews
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());

create index if not exists ops_weekly_reviews_user_week_idx
  on public.ops_weekly_reviews (user_id, week_start desc);

-- ── ④ 週ごとの流れ ────────────────────────────────────────────────────────────
-- 週は日本時間の月曜はじまり。新しい週が先。
-- 有料（paid）: 契約の履歴の 1 行が status が active / past_due で、7 日間無料（period_type='trial'）でないもの
--   （is_trial_conversion の行も有料）。'intro'（創業メンバー価格）は有料。
-- 新規の有料: 人ごとの履歴で「有料でない → 有料」に変わった行（解約から戻った人も入る）。
-- 解約: 「有料 → status が canceled」に変わった行（7 日間無料のまま終わった人は入れない）。
-- 年額: product_id に annual / year が入る（App Store の orime_annual）。Stripe の price_… は月額に数える。
-- 週の終わりの有料（paid_end）: その週の終わりより前の最後の行が有料の人。
-- サンドボックス（TestFlight・審査）は除く。
-- 返り値（jsonb）:
--   { generated_at, weeks, sources: { subscription_events, lp_events, subscriptions },
--     now: { paid, paid_annual, trial }, founding: { count, renew_from, renew_to, by_month: { 'YYYY-MM': n } },
--     share_users_28d,
--     rows: [ { week, lp_views, lp_views_by_variant, lp_clicks, lp_clicks_by_variant, signups,
--               trial_starts, trial_paid: { num, den, pending },
--               new_paid, new_paid_annual, churned, churned_annual, paid_end, paid_annual_end } ] }
--   （月額＝全体 − 年額。7 日間無料・有料・解約の数は、契約の履歴が無ければ null）
create or replace function public.admin_goal_weekly(p_weeks int default 12)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  v_now timestamptz := now();
  v_week0 date;
  v_from timestamptz;
  v_has_ev boolean := to_regclass('public.subscription_events') is not null;
  v_has_lp boolean := to_regclass('public.lp_events') is not null;
  v_has_subs boolean := to_regclass('public.subscriptions') is not null;
  v_has_period boolean := exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'period_type');
  v_weeks jsonb := '[]'::jsonb;  -- [{ week, from, to }]
  v_lp jsonb := '{}'::jsonb;     -- week → { views, views_by, clicks, clicks_by }
  v_subs jsonb := '{}'::jsonb;   -- week → { trial_starts, trial_num, trial_den, trial_pending, new_*, churned_*, paid_end, paid_annual_end }
  v_signups jsonb := '{}'::jsonb;
  v_now_paid jsonb := jsonb_build_object('paid', 0, 'paid_annual', 0, 'trial', 0);
  v_founding jsonb := jsonb_build_object('count', 0, 'renew_from', null, 'renew_to', null, 'by_month', '{}'::jsonb);
  v_share int := 0;
  v_rows jsonb;
  v_trial_expr text;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_weeks, 12), 26));
  v_week0 := (date_trunc('week', v_now at time zone 'Asia/Tokyo'))::date - (n - 1) * 7;
  v_from := v_week0::timestamp at time zone 'Asia/Tokyo';

  select coalesce(jsonb_agg(jsonb_build_object(
           'week', to_char(w, 'YYYY-MM-DD'),
           'from', (w::timestamp at time zone 'Asia/Tokyo'),
           'to', ((w + 7)::timestamp at time zone 'Asia/Tokyo')) order by w), '[]'::jsonb)
    into v_weeks
  from (select (v_week0 + i * 7) as w from generate_series(0, n - 1) as i) x;

  -- 登録（管理者を除く）
  select coalesce(jsonb_object_agg(wk, c), '{}'::jsonb) into v_signups
  from (
    select to_char((date_trunc('week', u.created_at at time zone 'Asia/Tokyo'))::date, 'YYYY-MM-DD') as wk, count(*) as c
    from auth.users u
    where u.created_at >= v_from and u.id not in (select user_id from public.app_admins)
    group by 1
  ) s;

  -- 紹介ページ（訪問＝lp_view のタブの数・押下＝cta_click の回数。variant ごとも）
  if v_has_lp then
    execute $q$
      with e as (
        select to_char((date_trunc('week', created_at at time zone 'Asia/Tokyo'))::date, 'YYYY-MM-DD') as wk,
               event, coalesce(variant, 'none') as v, session_id
        from public.lp_events
        where created_at >= $1 and event in ('lp_view', 'cta_click')
      ),
      per_v as (
        select wk, v,
               count(distinct session_id) filter (where event = 'lp_view') as views,
               count(*) filter (where event = 'cta_click') as clicks
        from e group by wk, v
      ),
      tot as (
        select wk, count(distinct session_id) filter (where event = 'lp_view') as views,
               count(*) filter (where event = 'cta_click') as clicks
        from e group by wk
      )
      select coalesce(jsonb_object_agg(t.wk, jsonb_build_object(
        'views', t.views, 'clicks', t.clicks,
        'views_by', (select coalesce(jsonb_object_agg(p.v, p.views), '{}'::jsonb) from per_v p where p.wk = t.wk),
        'clicks_by', (select coalesce(jsonb_object_agg(p.v, p.clicks), '{}'::jsonb) from per_v p where p.wk = t.wk)
      )), '{}'::jsonb)
      from tot t
    $q$ into v_lp using v_from;
  end if;

  -- 契約の履歴から、7 日間無料・新規の有料・解約・週の終わりの有料
  if v_has_ev then
    execute $q$
      with ev as (
        select e.user_id, e.event_at, e.created_at, e.status, e.period_type,
               ((coalesce(e.status, '') in ('active', 'past_due') and coalesce(e.period_type, 'normal') <> 'trial')
                 or e.is_trial_conversion is true) as paid,
               (coalesce(e.product_id, '') ~* '(annual|year)') as annual
        from public.subscription_events e
        where coalesce(e.environment, 'production') <> 'sandbox'
          and e.user_id not in (select user_id from public.app_admins)
      ),
      seq as (
        select ev.*,
               coalesce(lag(paid) over (partition by user_id order by event_at, created_at), false) as was_paid,
               coalesce(lag(annual) over (partition by user_id order by event_at, created_at), false) as was_annual
        from ev
      ),
      tr as (
        select user_id, min(event_at) as t from ev where period_type = 'trial' group by user_id
      ),
      trc as (
        select tr.user_id, tr.t,
               (select min(x.event_at) from ev x where x.user_id = tr.user_id and x.event_at > tr.t and x.paid) as c
        from tr
      ),
      weeks as (
        select (w->>'week') as wk, (w->>'from')::timestamptz as f, (w->>'to')::timestamptz as t
        from jsonb_array_elements($1) w
      )
      select coalesce(jsonb_object_agg(w.wk, jsonb_build_object(
        'trial_starts', (select count(*) from trc where trc.t >= w.f and trc.t < w.t),
        'trial_den', (select count(*) from trc where trc.t >= w.f and trc.t < w.t and trc.t <= $2 - interval '8 days'),
        'trial_num', (select count(*) from trc where trc.t >= w.f and trc.t < w.t and trc.t <= $2 - interval '8 days'
                        and trc.c is not null and trc.c < trc.t + interval '8 days'),
        'trial_pending', (select count(*) from trc where trc.t >= w.f and trc.t < w.t and trc.t > $2 - interval '8 days'),
        'new_paid', (select count(*) from seq s where s.paid and not s.was_paid and s.event_at >= w.f and s.event_at < w.t),
        'new_paid_annual', (select count(*) from seq s where s.paid and not s.was_paid and s.annual and s.event_at >= w.f and s.event_at < w.t),
        'churned', (select count(*) from seq s where s.was_paid and not s.paid and s.status = 'canceled' and s.event_at >= w.f and s.event_at < w.t),
        'churned_annual', (select count(*) from seq s where s.was_paid and not s.paid and s.status = 'canceled' and s.was_annual and s.event_at >= w.f and s.event_at < w.t),
        'paid_end', (select count(*) filter (where l.paid) from (
            select distinct on (user_id) user_id, paid from ev where event_at < least(w.t, $2)
            order by user_id, event_at desc, created_at desc) l),
        'paid_annual_end', (select count(*) filter (where l.paid and l.annual) from (
            select distinct on (user_id) user_id, paid, annual from ev where event_at < least(w.t, $2)
            order by user_id, event_at desc, created_at desc) l)
      )), '{}'::jsonb)
      from weeks w
    $q$ into v_subs using v_weeks, v_now;
  end if;

  -- 今の有料（subscriptions・7 日間無料を除く）・年額・創業メンバー（2026-11〜12 に始めた年額）の更新
  if v_has_subs then
    v_trial_expr := case when v_has_period then 'coalesce(s.period_type, ''normal'')' else '''normal''' end;
    execute format($q$
      select jsonb_build_object(
        'paid', count(*) filter (where s.status = 'active' and %1$s <> 'trial'),
        'paid_annual', count(*) filter (where s.status = 'active' and %1$s <> 'trial' and coalesce(s.price_id, '') ~* '(annual|year)'),
        'trial', count(*) filter (where s.status = 'active' and %1$s = 'trial'))
      from public.subscriptions s
      where s.user_id not in (select user_id from public.app_admins)
    $q$, v_trial_expr) into v_now_paid;

    execute format($q$
      with f as (
        select s.current_period_end as r
        from public.subscriptions s
        where s.status = 'active'
          and s.user_id not in (select user_id from public.app_admins)
          and (%1$s = 'intro'
               or (coalesce(s.price_id, '') ~* '(annual|year)' and %1$s <> 'trial'
                   and s.created_at >= timestamp '2026-11-01 00:00' at time zone 'Asia/Tokyo'
                   and s.created_at <  timestamp '2027-01-01 00:00' at time zone 'Asia/Tokyo'))
      )
      select jsonb_build_object(
        'count', (select count(*) from f),
        'renew_from', (select to_char(min(r) at time zone 'Asia/Tokyo', 'YYYY-MM-DD') from f),
        'renew_to', (select to_char(max(r) at time zone 'Asia/Tokyo', 'YYYY-MM-DD') from f),
        'by_month', (select coalesce(jsonb_object_agg(m, c), '{}'::jsonb) from (
            select to_char(r at time zone 'Asia/Tokyo', 'YYYY-MM') as m, count(*) as c from f where r is not null group by 1) z))
    $q$, v_trial_expr) into v_founding;
  end if;

  -- 共有の画像を作った人（直近 28 日・⑨ 広がる）
  if to_regclass('public.analytics_events') is not null then
    select count(distinct user_id) into v_share
    from public.analytics_events
    where event = 'share_card' and created_at > v_now - interval '28 days'
      and user_id not in (select user_id from public.app_admins);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'week', w->>'week',
    'lp_views', case when v_has_lp then coalesce((v_lp -> (w->>'week') ->> 'views')::int, 0) end,
    'lp_views_by_variant', coalesce(v_lp -> (w->>'week') -> 'views_by', '{}'::jsonb),
    'lp_clicks', case when v_has_lp then coalesce((v_lp -> (w->>'week') ->> 'clicks')::int, 0) end,
    'lp_clicks_by_variant', coalesce(v_lp -> (w->>'week') -> 'clicks_by', '{}'::jsonb),
    'signups', coalesce((v_signups ->> (w->>'week'))::int, 0),
    'trial_starts', case when v_has_ev then coalesce((v_subs -> (w->>'week') ->> 'trial_starts')::int, 0) end,
    'trial_paid', case when v_has_ev then jsonb_build_object(
        'num', coalesce((v_subs -> (w->>'week') ->> 'trial_num')::int, 0),
        'den', coalesce((v_subs -> (w->>'week') ->> 'trial_den')::int, 0),
        'pending', coalesce((v_subs -> (w->>'week') ->> 'trial_pending')::int, 0)) end,
    'new_paid', case when v_has_ev then coalesce((v_subs -> (w->>'week') ->> 'new_paid')::int, 0) end,
    'new_paid_annual', case when v_has_ev then coalesce((v_subs -> (w->>'week') ->> 'new_paid_annual')::int, 0) end,
    'churned', case when v_has_ev then coalesce((v_subs -> (w->>'week') ->> 'churned')::int, 0) end,
    'churned_annual', case when v_has_ev then coalesce((v_subs -> (w->>'week') ->> 'churned_annual')::int, 0) end,
    'paid_end', case when v_has_ev then coalesce((v_subs -> (w->>'week') ->> 'paid_end')::int, 0) end,
    'paid_annual_end', case when v_has_ev then coalesce((v_subs -> (w->>'week') ->> 'paid_annual_end')::int, 0) end
  ) order by (w->>'week') desc), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(v_weeks) w;

  return jsonb_build_object(
    'generated_at', v_now,
    'weeks', n,
    'sources', jsonb_build_object('subscription_events', v_has_ev, 'lp_events', v_has_lp, 'subscriptions', v_has_subs),
    'now', v_now_paid,
    'founding', v_founding,
    'share_users_28d', v_share,
    'rows', v_rows
  );
end;
$$;
grant execute on function public.admin_goal_weekly(int) to authenticated;
