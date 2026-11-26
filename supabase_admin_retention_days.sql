-- 🧭 無料ユーザーの継続を 8 つの日 × 3 つの型で数える（2026-11-26 オーナー「無料ユーザー（読書習慣なし・少し読む・結構読む）が
--   1・3・5・7・30・90・180・365 日目に使い続ける仕組みになれているか」）。
--
-- admin_retention_days() → jsonb
--   { days: [1,3,5,7,30,90,180,365],
--     rows: [{ segment: 'all'|'none'|'little'|'lot', day, den, num }] ,
--     return_moment: { shown, open, dismiss }, invite: n, review_link: n }
--   - 対象は無料ユーザー（いま有効な契約の無い人）。管理者（app_admins）は数えない。
--   - はじまりの日＝その人の最初の記録（analytics_events）。
--   - N 日目に使った＝はじまりから N−1 日後〜N+1 日後（3 日の幅）に記録がある（N が 30 以上は ±3 日）。
--     分母は、はじまりから N+1 日（30 以上は N+3 日）たった人だけ。
--   - 型（はじめの 30 日に書いたメモの数）: none＝0 件（読書の習慣がない人に多い）・little＝1〜9 件・lot＝10 件以上。
--   - 数は事実だけ（画面は MCP の ops_dashboard＝Claude のアーティファクト）。
-- 依存: supabase_admin_metrics.sql（_require_admin・app_admins）。subscriptions / book_memos が無くても動く（無い表は数えない）。
-- 冪等（CREATE OR REPLACE）。読むだけ。

create or replace function public.admin_retention_days()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  has_subs boolean := to_regclass('public.subscriptions') is not null;
  has_memos boolean := to_regclass('public.book_memos') is not null;
begin
  perform public._require_admin();

  create temp table if not exists _rd_users (user_id uuid primary key, f timestamptz, seg text) on commit drop;
  delete from _rd_users;

  insert into _rd_users (user_id, f, seg)
  select e.user_id, min(e.created_at), 'none'
  from public.analytics_events e
  where e.user_id is not null
    and e.user_id not in (select user_id from public.app_admins)
  group by e.user_id;

  if has_subs then
    execute 'delete from _rd_users u using public.subscriptions s where s.user_id = u.user_id and s.status = ''active''';
  end if;

  if has_memos then
    execute $q$
      update _rd_users u set seg = case when c.n >= 10 then 'lot' when c.n >= 1 then 'little' else 'none' end
      from (
        select u2.user_id, count(m.id) as n
        from _rd_users u2
        left join public.book_memos m on m.user_id = u2.user_id and m.created_at < u2.f + interval '30 day'
        group by u2.user_id
      ) c
      where c.user_id = u.user_id
    $q$;
  end if;

  with days(d) as (values (1), (3), (5), (7), (30), (90), (180), (365)),
  segs(s) as (values ('all'), ('none'), ('little'), ('lot')),
  grid as (
    select s.s as segment, d.d as day,
      case when d.d >= 30 then 3 else 1 end as w
    from segs s cross join days d
  ),
  counted as (
    select g.segment, g.day,
      count(u.user_id) filter (where u.f <= now() - make_interval(days => g.day + g.w)) as den,
      count(u.user_id) filter (where u.f <= now() - make_interval(days => g.day + g.w) and exists (
        select 1 from public.analytics_events e
        where e.user_id = u.user_id
          and e.created_at >= u.f + make_interval(days => greatest(g.day - g.w, 0))
          and e.created_at <  u.f + make_interval(days => g.day + g.w)
      )) as num
    from grid g
    left join _rd_users u on (g.segment = 'all' or u.seg = g.segment)
    group by g.segment, g.day
  )
  select jsonb_build_object(
    'days', jsonb_build_array(1, 3, 5, 7, 30, 90, 180, 365),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('segment', segment, 'day', day, 'den', den, 'num', num) order by segment, day) from counted), '[]'::jsonb),
    'return_moment', jsonb_build_object(
      'shown', (select count(*) from public.analytics_events where event = 'return_moment' and props->>'action' = 'shown'),
      'open', (select count(*) from public.analytics_events where event = 'return_moment' and props->>'action' = 'open'),
      'dismiss', (select count(*) from public.analytics_events where event = 'return_moment' and props->>'action' = 'dismiss')
    ),
    'invite', (select count(*) from public.analytics_events where event = 'invite_share'),
    'advisor_share', (select count(*) from public.analytics_events where event = 'advisor_share'),
    'review_link', (select count(*) from public.analytics_events where event = 'review_link')
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_retention_days() from public, anon;
grant execute on function public.admin_retention_days() to authenticated;
