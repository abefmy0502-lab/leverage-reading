-- 🧹 運営ダッシュボードの集計から「管理者（app_admins）」を除外する。
--
-- 創業者/運営者が自分でアプリを使う（テスト・ドッグフーディング）と、ユーザー数・
-- アクティブ・課金・継続率が水増しされる。顧客指標から自分（チーム）を外すのは
-- 標準的な運用。supabase_admin_metrics.sql / supabase_admin_growth.sql の集計
-- 関数を「app_admins を除外する版」で create or replace する（後勝ち・冪等）。
--
-- ※ 先に supabase_admin_metrics.sql と supabase_admin_growth.sql を適用済みであること。

-- ① 概況スナップショット（管理者除外）
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'users_total',   (select count(*) from auth.users u where u.id not in (select user_id from public.app_admins)),
    'new_users_7d',  (select count(*) from auth.users u where u.created_at > now() - interval '7 days' and u.id not in (select user_id from public.app_admins)),
    'new_users_30d', (select count(*) from auth.users u where u.created_at > now() - interval '30 days' and u.id not in (select user_id from public.app_admins)),
    'dau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '1 day'  and user_id not in (select user_id from public.app_admins)),
    'wau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '7 days' and user_id not in (select user_id from public.app_admins)),
    'mau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '30 days' and user_id not in (select user_id from public.app_admins)),
    'books_total',   (select count(*) from public.books      where user_id not in (select user_id from public.app_admins)),
    'memos_total',   (select count(*) from public.book_memos where user_id not in (select user_id from public.app_admins)),
    'actions_total', (select count(*) from public.actions    where user_id not in (select user_id from public.app_admins)),
    'actions_done',  (select count(*) from public.actions    where done = true and user_id not in (select user_id from public.app_admins)),
    'subs_active',   (select count(*) from public.subscriptions where status = 'active' and user_id not in (select user_id from public.app_admins)),
    'feedback_open', (select count(*) from public.feedback where status = 'open' and (user_id is null or user_id not in (select user_id from public.app_admins)))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_overview() to authenticated;

-- ② アクティブ/新規本の日次推移（管理者除外）
create or replace function public.admin_active_series(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_days, 30), 180));
  with days as (
    select generate_series(current_date - (n - 1), current_date, interval '1 day')::date as d
  ),
  act as (
    select created_at::date as d, count(distinct user_id) as c
    from public.analytics_events
    where created_at >= current_date - (n - 1) and user_id not in (select user_id from public.app_admins)
    group by 1
  ),
  bk as (
    select created_at::date as d, count(*) as c
    from public.analytics_events
    where event = 'book_added' and created_at >= current_date - (n - 1) and user_id not in (select user_id from public.app_admins)
    group by 1
  )
  select jsonb_agg(jsonb_build_object('d', to_char(days.d, 'MM/DD'), 'active', coalesce(act.c, 0), 'new_books', coalesce(bk.c, 0)) order by days.d)
  into result
  from days left join act on act.d = days.d left join bk on bk.d = days.d;
  return coalesce(result, '[]'::jsonb);
end; $$;
grant execute on function public.admin_active_series(int) to authenticated;

-- ③ 機能別の利用状況（管理者除外）
create or replace function public.admin_feature_usage(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_days, 30), 365));
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_object_agg(event, c) from (
        select event, count(*) c from public.analytics_events
        where created_at >= now() - (n || ' days')::interval and user_id not in (select user_id from public.app_admins)
        group by event order by count(*) desc) t), '{}'::jsonb),
    'ai_features', coalesce((
      select jsonb_object_agg(f, c) from (
        select coalesce(props->>'feature', '?') f, count(*) c from public.analytics_events
        where event = 'ai_used' and created_at >= now() - (n || ' days')::interval and user_id not in (select user_id from public.app_admins)
        group by 1 order by count(*) desc) t), '{}'::jsonb),
    'book_via', coalesce((
      select jsonb_object_agg(v, c) from (
        select coalesce(props->>'via', '?') v, count(*) c from public.analytics_events
        where event = 'book_added' and created_at >= now() - (n || ' days')::interval and user_id not in (select user_id from public.app_admins)
        group by 1 order by count(*) desc) t), '{}'::jsonb)
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_feature_usage(int) to authenticated;

-- ④ AI コスト（管理者除外）
create or replace function public.admin_ai_usage(p_months int default 6)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_months, 6), 36));
  select coalesce(jsonb_agg(jsonb_build_object('month', period_month, 'calls', total_calls, 'users', users) order by period_month desc), '[]'::jsonb)
  into result
  from (
    select period_month, sum(calls)::int as total_calls, count(*)::int as users
    from public.ai_usage
    where user_id not in (select user_id from public.app_admins)
    group by period_month order by period_month desc limit n
  ) t;
  return result;
end; $$;
grant execute on function public.admin_ai_usage(int) to authenticated;

-- ⑤ 売上 / 課金（管理者除外）
create or replace function public.admin_revenue()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'active', (select count(*) from public.subscriptions where status = 'active' and user_id not in (select user_id from public.app_admins)),
    'by_status', coalesce((
      select jsonb_object_agg(coalesce(status, '?'), c)
      from (select status, count(*) c from public.subscriptions where user_id not in (select user_id from public.app_admins) group by status) t), '{}'::jsonb),
    'expiring_30d', (
      select count(*) from public.subscriptions
      where status = 'active' and current_period_end is not null
        and current_period_end < now() + interval '30 days'
        and user_id not in (select user_id from public.app_admins))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_revenue() to authenticated;

-- ⑥ 成長 / 継続率（管理者除外）
create or replace function public.admin_growth()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  with firsts as (
    select user_id, min(created_at) as f
    from public.analytics_events
    where user_id not in (select user_id from public.app_admins)
    group by user_id
  ),
  ret as (
    select
      count(*) filter (where f <= now() - interval '1 day')  as den1,
      count(*) filter (where f <= now() - interval '1 day' and exists (
        select 1 from public.analytics_events e where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '1 day')) as num1,
      count(*) filter (where f <= now() - interval '7 day')  as den7,
      count(*) filter (where f <= now() - interval '7 day' and exists (
        select 1 from public.analytics_events e where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '7 day')) as num7,
      count(*) filter (where f <= now() - interval '30 day') as den30,
      count(*) filter (where f <= now() - interval '30 day' and exists (
        select 1 from public.analytics_events e where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '30 day')) as num30
    from firsts
  ),
  paid_series as (
    select to_char(date_trunc('month', created_at), 'YYYY-MM') as m, count(*)::int as c
    from public.subscriptions
    where user_id not in (select user_id from public.app_admins)
    group by 1 order by 1 desc limit 12
  )
  select jsonb_build_object(
    'retention', (select jsonb_build_object('d1_num', num1, 'd1_den', den1, 'd7_num', num7, 'd7_den', den7, 'd30_num', num30, 'd30_den', den30) from ret),
    'paid_new_by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m) from paid_series), '[]'::jsonb),
    'subs_total', (select count(*) from public.subscriptions where user_id not in (select user_id from public.app_admins)),
    'subs_active', (select count(*) from public.subscriptions where status = 'active' and user_id not in (select user_id from public.app_admins)),
    'subs_canceled', (select count(*) from public.subscriptions where status is not null and status <> 'active' and user_id not in (select user_id from public.app_admins)),
    'paid_new_this_month', (select count(*) from public.subscriptions where created_at >= date_trunc('month', now()) and user_id not in (select user_id from public.app_admins))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_growth() to authenticated;
