-- 📈 運営ダッシュボード — 成長・継続率の集計（admin_metrics の上に乗る）。
-- ※ 先に supabase_admin_metrics.sql を適用すること（_require_admin 依存）。
-- 冪等（CREATE OR REPLACE）。データが無い間は 0 / 空配列を返す（壊れない）。

-- コホート継続率（D1/D7/D30）＋ 新規有料の月次推移 ＋ 解約数。
--   - 継続率は analytics_events から: 各ユーザーの初回イベント日を基準に、
--     N 日後以降にも活動があったユーザーの割合（「N日後も残っている率」）。
--     分母は「初回から N 日以上経過したユーザー」（評価機会のある人だけ）。
--   - 新規有料は subscriptions.created_at の月次件数。
create or replace function public.admin_growth()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();

  with firsts as (
    select user_id, min(created_at) as f
    from public.analytics_events
    group by user_id
  ),
  ret as (
    select
      count(*) filter (where f <= now() - interval '1 day')  as den1,
      count(*) filter (where f <= now() - interval '1 day' and exists (
        select 1 from public.analytics_events e
        where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '1 day')) as num1,
      count(*) filter (where f <= now() - interval '7 day')  as den7,
      count(*) filter (where f <= now() - interval '7 day' and exists (
        select 1 from public.analytics_events e
        where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '7 day')) as num7,
      count(*) filter (where f <= now() - interval '30 day') as den30,
      count(*) filter (where f <= now() - interval '30 day' and exists (
        select 1 from public.analytics_events e
        where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '30 day')) as num30
    from firsts
  ),
  paid_series as (
    select to_char(date_trunc('month', created_at), 'YYYY-MM') as m, count(*)::int as c
    from public.subscriptions
    group by 1
    order by 1 desc
    limit 12
  )
  select jsonb_build_object(
    'retention', (select jsonb_build_object(
      'd1_num', num1, 'd1_den', den1,
      'd7_num', num7, 'd7_den', den7,
      'd30_num', num30, 'd30_den', den30) from ret),
    'paid_new_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m) from paid_series
    ), '[]'::jsonb),
    'subs_total', (select count(*) from public.subscriptions),
    'subs_active', (select count(*) from public.subscriptions where status = 'active'),
    'subs_canceled', (select count(*) from public.subscriptions where status is not null and status <> 'active'),
    -- 当月に獲得した有料数（CAC 計算の分母に使う）。
    'paid_new_this_month', (
      select count(*) from public.subscriptions
      where created_at >= date_trunc('month', now())
    )
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_growth() to authenticated;
