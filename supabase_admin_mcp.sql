-- 🛰️🔌 運営ダッシュボードを AI と連携（MCP）から 1 回で読む（2026-11-08 オーナー「運営ダッシュボードをアーティファクトにしたい」）
--
-- Claude の会話の中のダッシュボード（アーティファクト）は、「Orime」コネクタの道具 ops_dashboard を 1 回呼んで数字を描く。
-- 道具の中身は api/_mcp.js → この関数。既存の集計関数（admin_overview / admin_revenue / admin_growth / admin_launch_kpis /
-- admin_goal_plan / admin_goal_weekly / admin_profit / admin_profit_series / admin_renewals）は auth.uid() で管理者を確かめるので、
-- service_role から呼ぶときは、このラッパーが「その利用者としての JWT の claims」を同じトランザクションの中だけ置いてから呼ぶ。
--
-- フィードバックの本文（名前・メール）は渡さない＝件数だけ（admin_overview の feedback_open）。
-- 守り: 実行できるのは service_role だけ（REVOKE/GRANT）。p_user_id が app_admins に無ければ例外。無い関数は null（未適用の SQL があっても壊れない）。
-- 依存: supabase_admin_metrics.sql（app_admins）・admin_ops（ops_tickets）・admin_members_tasks（ops_tasks）・admin_goal（ops_weekly_reviews）・ops_sales_metrics。ほかの admin_* は有無を確かめてから呼ぶ。冪等。

create or replace function public.admin_snapshot_for(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  part jsonb;
begin
  if p_user_id is null or not exists (select 1 from public.app_admins where user_id = p_user_id) then
    raise exception 'not authorized';
  end if;
  -- このトランザクションの中だけ、本人として auth.uid() が返るようにする（is_app_admin / _require_admin が通る）。
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);

  begin select public.admin_overview() into part; exception when others then part := null; end;
  v := v || jsonb_build_object('overview', part);
  begin select public.admin_revenue() into part; exception when others then part := null; end;
  v := v || jsonb_build_object('revenue', part);
  begin select public.admin_growth() into part; exception when others then part := null; end;
  v := v || jsonb_build_object('growth', part);
  begin select public.admin_launch_kpis(8) into part; exception when others then part := null; end;
  v := v || jsonb_build_object('launch', part);
  begin select public.admin_goal_plan() into part; exception when others then part := null; end;
  v := v || jsonb_build_object('goal', part);
  begin select public.admin_goal_weekly(12) into part; exception when others then part := null; end;
  v := v || jsonb_build_object('weekly', part);
  begin select public.admin_profit(null) into part; exception when others then part := null; end;
  v := v || jsonb_build_object('profit', part);
  begin select public.admin_profit_series(12) into part; exception when others then part := null; end;
  v := v || jsonb_build_object('profit_series', part);
  begin select public.admin_renewals(12) into part; exception when others then part := null; end;
  v := v || jsonb_build_object('renewals', part);
  begin select public.admin_active_series(30) into part; exception when others then part := null; end;
  v := v || jsonb_build_object('active_series', part);

  -- 運営のやること（名前・メールは渡さない。フィードバックは本文 300 字まで・開いているものだけ・50 件）
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'category', f.category, 'content', left(f.content, 300), 'status', f.status, 'admin_note', f.admin_note, 'created_at', f.created_at) order by f.created_at desc), '[]'::jsonb)
      into part from (select * from public.feedback where status in ('open', 'in_progress') order by created_at desc limit 50) f;
  exception when others then part := null; end;
  v := v || jsonb_build_object('feedback', part);
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'kind', t.kind, 'priority', t.priority, 'status', t.status, 'created_at', t.created_at, 'updated_at', t.updated_at) order by t.priority, t.created_at desc), '[]'::jsonb)
      into part from (select * from public.ops_tickets where status in ('open', 'in_progress') order by priority, created_at desc limit 100) t;
  exception when others then part := null; end;
  v := v || jsonb_build_object('tickets', part);
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'due_date', k.due_date, 'dept', k.dept, 'title', k.title, 'done', k.done) order by k.due_date, k.created_at), '[]'::jsonb)
      into part from (select * from public.ops_tasks where user_id = p_user_id and (done = false or due_date >= (now() at time zone 'Asia/Tokyo')::date - 7) and due_date <= (now() at time zone 'Asia/Tokyo')::date + 14 order by due_date limit 200) k;
  exception when others then part := null; end;
  v := v || jsonb_build_object('tasks', part);
  begin
    select coalesce(jsonb_agg(jsonb_build_object('week_start', r.week_start, 'numbers', r.numbers, 'actions', r.actions, 'weakest', r.weakest, 'memo', r.memo, 'updated_at', r.updated_at) order by r.week_start desc), '[]'::jsonb)
      into part from (select * from public.ops_weekly_reviews where user_id = p_user_id order by week_start desc limit 8) r;
  exception when others then part := null; end;
  v := v || jsonb_build_object('weekly_reviews', part);
  begin
    select coalesce(jsonb_agg(to_jsonb(m) - 'user_id' - 'id' order by m.week_start desc), '[]'::jsonb)
      into part from (select * from public.ops_sales_metrics where user_id = p_user_id order by week_start desc limit 12) m;
  exception when others then part := null; end;
  v := v || jsonb_build_object('sales_metrics', part);

  return v || jsonb_build_object('generated_at', now());
end;
$$;

revoke all on function public.admin_snapshot_for(uuid) from public;
revoke all on function public.admin_snapshot_for(uuid) from anon;
revoke all on function public.admin_snapshot_for(uuid) from authenticated;
grant execute on function public.admin_snapshot_for(uuid) to service_role;

-- ── 指示を受ける（2026-11-08 オーナー「このダッシュボードから様々な指示を出せれば最高」）────────────────
-- Claude の会話から「Orime」コネクタの道具（ops_feedback / ops_tickets / ops_tasks / ops_goal / ops_week）で呼ぶ。
-- 決まった動作だけ（p_action の一覧）。中身は既存の admin_* 関数と ops_* の表。本人として動く（上と同じ claims の置き方）。
create or replace function public.admin_act_for(p_user_id uuid, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  out jsonb;
  new_id uuid;
  wk date;
begin
  if p_user_id is null or not exists (select 1 from public.app_admins where user_id = p_user_id) then
    raise exception 'not authorized';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);

  case p_action
    when 'feedback_list' then
      select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'category', f.category, 'content', left(f.content, 600), 'status', f.status, 'admin_note', f.admin_note, 'created_at', f.created_at) order by f.created_at desc), '[]'::jsonb)
        into out from (select * from public.feedback where (a->>'status') is null or status = (a->>'status') order by created_at desc limit 100) f;
    when 'feedback_update' then
      perform public.admin_feedback_update((a->>'id')::uuid, a->>'status', a->>'note');
      out := jsonb_build_object('ok', true);
    when 'ticket_list' then
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'body', left(t.body, 600), 'kind', t.kind, 'priority', t.priority, 'status', t.status, 'created_at', t.created_at, 'updated_at', t.updated_at) order by t.priority, t.created_at desc), '[]'::jsonb)
        into out from (select * from public.ops_tickets where (a->>'status') is null or status = (a->>'status') order by priority, created_at desc limit 200) t;
    when 'ticket_create' then
      new_id := public.admin_ticket_create(a->>'title', a->>'body', coalesce(a->>'kind', 'task'), coalesce((a->>'priority')::int, 2), null);
      out := jsonb_build_object('ok', true, 'id', new_id);
    when 'ticket_update' then
      perform public.admin_ticket_update((a->>'id')::uuid, a->>'status', (a->>'priority')::int);
      out := jsonb_build_object('ok', true);
    when 'task_list' then
      select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'due_date', k.due_date, 'dept', k.dept, 'title', k.title, 'done', k.done) order by k.due_date, k.created_at), '[]'::jsonb)
        into out from (select * from public.ops_tasks where user_id = p_user_id and (coalesce((a->>'include_done')::boolean, false) or done = false) order by due_date limit 300) k;
    when 'task_add' then
      insert into public.ops_tasks (user_id, due_date, dept, title)
      values (p_user_id, coalesce((a->>'due_date')::date, (now() at time zone 'Asia/Tokyo')::date), left(a->>'dept', 40), left(coalesce(nullif(trim(a->>'title'), ''), '(無題)'), 200))
      returning id into new_id;
      out := jsonb_build_object('ok', true, 'id', new_id);
    when 'task_done' then
      update public.ops_tasks set done = coalesce((a->>'done')::boolean, true) where id = (a->>'id')::uuid and user_id = p_user_id;
      out := jsonb_build_object('ok', found);
    when 'task_delete' then
      delete from public.ops_tasks where id = (a->>'id')::uuid and user_id = p_user_id;
      out := jsonb_build_object('ok', found);
    when 'goal_get' then
      begin select public.admin_goal_plan() into out; exception when others then out := null; end;
    when 'goal_set' then
      perform public.admin_set_goal_plan((a->>'target')::numeric, (a->>'deadline')::date, a->'milestones', (a->>'launch_date')::date);
      out := jsonb_build_object('ok', true);
    when 'week_review_save' then
      wk := coalesce((a->>'week_start')::date, date_trunc('week', (now() at time zone 'Asia/Tokyo'))::date);
      insert into public.ops_weekly_reviews (user_id, week_start, numbers, actions, weakest, memo, updated_at)
      values (p_user_id, wk, coalesce(a->'numbers', '{}'::jsonb), coalesce(a->'actions', '[]'::jsonb), left(a->>'weakest', 40), left(a->>'memo', 1000), now())
      on conflict (user_id, week_start) do update
        set numbers = excluded.numbers, actions = excluded.actions, weakest = excluded.weakest, memo = excluded.memo, updated_at = now();
      out := jsonb_build_object('ok', true, 'week_start', wk);
    when 'sales_week_save' then
      wk := coalesce((a->>'week_start')::date, date_trunc('week', (now() at time zone 'Asia/Tokyo'))::date);
      insert into public.ops_sales_metrics (user_id, week_start, new_paid, installs, lp_clicks, note_pv, x_profile_clicks, store_page_views, memo, updated_at)
      values (p_user_id, wk, (a->>'new_paid')::int, (a->>'installs')::int, (a->>'lp_clicks')::int, (a->>'note_pv')::int, (a->>'x_profile_clicks')::int, (a->>'store_page_views')::int, left(a->>'memo', 500), now())
      on conflict (user_id, week_start) do update
        set new_paid = coalesce(excluded.new_paid, ops_sales_metrics.new_paid), installs = coalesce(excluded.installs, ops_sales_metrics.installs),
            lp_clicks = coalesce(excluded.lp_clicks, ops_sales_metrics.lp_clicks), note_pv = coalesce(excluded.note_pv, ops_sales_metrics.note_pv),
            x_profile_clicks = coalesce(excluded.x_profile_clicks, ops_sales_metrics.x_profile_clicks), store_page_views = coalesce(excluded.store_page_views, ops_sales_metrics.store_page_views),
            memo = coalesce(excluded.memo, ops_sales_metrics.memo), updated_at = now();
      out := jsonb_build_object('ok', true, 'week_start', wk);
    else
      raise exception 'unknown action';
  end case;
  return coalesce(out, 'null'::jsonb);
end;
$$;

revoke all on function public.admin_act_for(uuid, text, jsonb) from public;
revoke all on function public.admin_act_for(uuid, text, jsonb) from anon;
revoke all on function public.admin_act_for(uuid, text, jsonb) from authenticated;
grant execute on function public.admin_act_for(uuid, text, jsonb) to service_role;
