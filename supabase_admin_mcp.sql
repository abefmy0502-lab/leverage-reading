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

-- ── 自動で動く Claude Code と SNS の投稿（2026-11-08 オーナー「やることを載せておいたら自動的に Claude Code が常に動く」「SNS の投稿も自動で」）────
-- ops_tasks に 担当（me＝自分・claude＝Claude Code が取りに来る）・状態（todo / doing / done / blocked）・結果 を足す。done（真偽）は状態と同期。
alter table if exists public.ops_tasks add column if not exists assignee text not null default 'me';
alter table if exists public.ops_tasks add column if not exists status text not null default 'todo';
alter table if exists public.ops_tasks add column if not exists result text;
alter table if exists public.ops_tasks add column if not exists started_at timestamptz;
alter table if exists public.ops_tasks add column if not exists finished_at timestamptz;
do $$ begin
  if to_regclass('public.ops_tasks') is not null then
    if not exists (select 1 from pg_constraint where conname = 'ops_tasks_assignee_chk') then
      alter table public.ops_tasks add constraint ops_tasks_assignee_chk check (assignee in ('me', 'claude'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ops_tasks_status_chk') then
      alter table public.ops_tasks add constraint ops_tasks_status_chk check (status in ('todo', 'doing', 'done', 'blocked'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ops_tasks_result_len') then
      alter table public.ops_tasks add constraint ops_tasks_result_len check (result is null or char_length(result) <= 4000);
    end if;
    update public.ops_tasks set status = 'done' where done = true and status <> 'done';
  end if;
end $$;

-- SNS の投稿の予定と記録。書くのは MCP の道具 ops_post（管理者だけ・service_role）。RLS 有効・ポリシー無し。
create table if not exists public.ops_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('x', 'threads', 'instagram')),
  text text not null check (char_length(text) <= 4000),
  image_url text check (image_url is null or char_length(image_url) <= 1000),
  scheduled_at timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('scheduled', 'posted', 'failed', 'canceled')),
  posted_id text,
  posted_url text,
  error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops_posts_due_idx on public.ops_posts(status, scheduled_at);
alter table public.ops_posts enable row level security;

-- 投稿の画像の置き場（公開・Threads と Instagram は公開 URL の画像しか受け取らない）。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ops-media', 'ops-media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

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
    select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'due_date', k.due_date, 'dept', k.dept, 'title', k.title, 'done', k.done, 'assignee', k.assignee, 'status', k.status, 'result', left(k.result, 400), 'started_at', k.started_at, 'finished_at', k.finished_at) order by k.due_date, k.created_at), '[]'::jsonb)
      into part from (select * from public.ops_tasks where user_id = p_user_id and (done = false or coalesce(finished_at, created_at) >= now() - interval '7 days') and due_date <= (now() at time zone 'Asia/Tokyo')::date + 14 order by due_date limit 200) k;
  exception when others then part := null; end;
  v := v || jsonb_build_object('tasks', part);
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'platform', q.platform, 'text', left(q.text, 300), 'image_url', q.image_url, 'scheduled_at', q.scheduled_at, 'status', q.status, 'posted_url', q.posted_url, 'error', left(q.error, 200), 'posted_at', q.posted_at) order by q.scheduled_at desc), '[]'::jsonb)
      into part from (select * from public.ops_posts where user_id = p_user_id and (status = 'scheduled' or scheduled_at >= now() - interval '14 days') order by scheduled_at desc limit 100) q;
  exception when others then part := null; end;
  v := v || jsonb_build_object('posts', part);
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
      select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'due_date', k.due_date, 'dept', k.dept, 'title', k.title, 'done', k.done, 'assignee', k.assignee, 'status', k.status, 'result', k.result, 'started_at', k.started_at, 'finished_at', k.finished_at, 'created_at', k.created_at) order by k.due_date, k.created_at), '[]'::jsonb)
        into out from (select * from public.ops_tasks where user_id = p_user_id
                        and (coalesce((a->>'include_done')::boolean, false) or done = false)
                        and ((a->>'assignee') is null or assignee = (a->>'assignee'))
                        and ((a->>'status') is null or status = (a->>'status'))
                       order by due_date, created_at limit 300) k;
    when 'task_add' then
      insert into public.ops_tasks (user_id, due_date, dept, title, assignee)
      values (p_user_id, coalesce((a->>'due_date')::date, (now() at time zone 'Asia/Tokyo')::date), left(a->>'dept', 40), left(coalesce(nullif(trim(a->>'title'), ''), '(無題)'), 200), coalesce(a->>'assignee', 'me'))
      returning id into new_id;
      out := jsonb_build_object('ok', true, 'id', new_id);
    when 'task_done' then
      update public.ops_tasks
         set done = coalesce((a->>'done')::boolean, true),
             status = case when coalesce((a->>'done')::boolean, true) then 'done' else 'todo' end,
             finished_at = case when coalesce((a->>'done')::boolean, true) then now() else null end,
             result = coalesce(left(a->>'result', 4000), result)
       where id = (a->>'id')::uuid and user_id = p_user_id;
      out := jsonb_build_object('ok', found);
    when 'task_update' then
      -- Claude Code が「取りかかった・終わった・止まった」を書く。状態・結果・題・期日・担当のどれでも。
      if (a->>'status') is not null and (a->>'status') not in ('todo', 'doing', 'done', 'blocked') then raise exception 'invalid status'; end if;
      update public.ops_tasks
         set status = coalesce(a->>'status', status),
             done = case when coalesce(a->>'status', status) = 'done' then true else false end,
             result = coalesce(left(a->>'result', 4000), result),
             title = coalesce(left(nullif(trim(a->>'title'), ''), 200), title),
             due_date = coalesce((a->>'due_date')::date, due_date),
             dept = coalesce(left(a->>'dept', 40), dept),
             assignee = coalesce(a->>'assignee', assignee),
             started_at = case when (a->>'status') = 'doing' and started_at is null then now() else started_at end,
             finished_at = case when (a->>'status') in ('done', 'blocked') then now() when (a->>'status') in ('todo', 'doing') then null else finished_at end
       where id = (a->>'id')::uuid and user_id = p_user_id;
      out := jsonb_build_object('ok', found);
    when 'task_claim' then
      -- 担当 claude・todo の中で期日の早い 1 つを doing にして返す（同時に 2 つのセッションが取っても 1 つだけ）。
      update public.ops_tasks set status = 'doing', started_at = now()
       where id = (select id from public.ops_tasks where user_id = p_user_id and assignee = 'claude' and status = 'todo' order by due_date, created_at limit 1 for update skip locked)
       returning jsonb_build_object('id', id, 'title', title, 'due_date', due_date, 'dept', dept, 'created_at', created_at) into out;
    when 'post_list' then
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'platform', q.platform, 'text', q.text, 'image_url', q.image_url, 'scheduled_at', q.scheduled_at, 'status', q.status, 'posted_url', q.posted_url, 'error', q.error, 'posted_at', q.posted_at) order by q.scheduled_at), '[]'::jsonb)
        into out from (select * from public.ops_posts where user_id = p_user_id and ((a->>'status') is null or status = (a->>'status')) order by scheduled_at limit 200) q;
    when 'post_add' then
      if (a->>'platform') not in ('x', 'threads', 'instagram') then raise exception 'invalid platform'; end if;
      insert into public.ops_posts (user_id, platform, text, image_url, scheduled_at)
      values (p_user_id, a->>'platform', left(a->>'text', 4000), left(a->>'image_url', 1000), coalesce((a->>'scheduled_at')::timestamptz, now()))
      returning id into new_id;
      out := jsonb_build_object('ok', true, 'id', new_id);
    when 'post_update' then
      if (a->>'status') is not null and (a->>'status') not in ('scheduled', 'posted', 'failed', 'canceled') then raise exception 'invalid status'; end if;
      update public.ops_posts
         set text = coalesce(left(a->>'text', 4000), text), image_url = coalesce(left(a->>'image_url', 1000), image_url),
             scheduled_at = coalesce((a->>'scheduled_at')::timestamptz, scheduled_at), status = coalesce(a->>'status', status),
             posted_id = coalesce(a->>'posted_id', posted_id), posted_url = coalesce(left(a->>'posted_url', 1000), posted_url),
             error = case when (a->>'status') = 'posted' then null else coalesce(left(a->>'error', 1000), error) end,
             posted_at = case when (a->>'status') = 'posted' then now() else posted_at end, updated_at = now()
       where id = (a->>'id')::uuid and user_id = p_user_id;
      out := jsonb_build_object('ok', found);
    when 'post_due' then
      -- 出す時刻が来た予定を 1 回につき 5 つまで。読むだけ（出せたかは post_update で書く）。
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'platform', q.platform, 'text', q.text, 'image_url', q.image_url, 'scheduled_at', q.scheduled_at) order by q.scheduled_at), '[]'::jsonb)
        into out from (select * from public.ops_posts where user_id = p_user_id and status = 'scheduled' and scheduled_at <= now() order by scheduled_at limit 5) q;
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
