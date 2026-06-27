-- 🎛️ 運営オペレーション層（Founder Cockpit）— 目標 ＋ チケット。
--
-- supabase_admin_metrics.sql の上に乗る（is_app_admin() / _require_admin() に依存）。
-- 必ず supabase_admin_metrics.sql を先に適用すること。
--
--   - ops_goals : 創業者の売上/利用目標（MRR・有料会員数・総ユーザー数 ＋ 締切）。
--     ダッシュボードが現在地との差分から「達成ペース」を逆算し、やることを軌道修正する。
--   - ops_tickets: 顧客フィードバックから起票するバグ/要望チケット＋手動タスク。
--     「FB をもとにバグ修正チケットが作られる」を実現する作業ボード。
--
-- どちらも管理者専用（RLS 有効＋クライアントポリシー無し＝DEFINER RPC 経由のみ）。
-- 冪等（IF NOT EXISTS / CREATE OR REPLACE）。

-- ── 目標 ───────────────────────────────────────────────────────────────────
create table if not exists public.ops_goals (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  metric     text not null default 'mrr' check (metric in ('mrr', 'paid_users', 'users', 'gross_profit')),
  target     numeric not null default 0,
  deadline   date,
  updated_at timestamptz not null default now()
);
alter table public.ops_goals enable row level security;
-- 既存DB向け: metric の許容値に gross_profit（月次粗利）を追加（冪等）。
alter table public.ops_goals drop constraint if exists ops_goals_metric_check;
alter table public.ops_goals add constraint ops_goals_metric_check
  check (metric in ('mrr', 'paid_users', 'users', 'gross_profit'));

-- ── チケット（作業ボード） ─────────────────────────────────────────────────
create table if not exists public.ops_tickets (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  body               text,
  kind               text not null default 'task' check (kind in ('bug', 'feature', 'task')),
  priority           int  not null default 2,  -- 1=高 / 2=中 / 3=低
  status             text not null default 'open' check (status in ('open', 'in_progress', 'done', 'wont_fix')),
  source_feedback_id uuid references public.feedback(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.ops_tickets enable row level security;
create index if not exists ops_tickets_status_idx on public.ops_tickets(status, priority, created_at desc);

-- ── 目標 RPC ───────────────────────────────────────────────────────────────
create or replace function public.admin_get_goal()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object('metric', metric, 'target', target, 'deadline', deadline, 'updated_at', updated_at)
    into result from public.ops_goals where user_id = auth.uid();
  return result; -- 未設定なら null
end;
$$;
grant execute on function public.admin_get_goal() to authenticated;

create or replace function public.admin_set_goal(p_metric text, p_target numeric, p_deadline date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_admin();
  if p_metric not in ('mrr', 'paid_users', 'users', 'gross_profit') then raise exception 'invalid metric'; end if;
  insert into public.ops_goals (user_id, metric, target, deadline, updated_at)
  values (auth.uid(), p_metric, greatest(coalesce(p_target, 0), 0), p_deadline, now())
  on conflict (user_id) do update
    set metric = excluded.metric, target = excluded.target, deadline = excluded.deadline, updated_at = now();
end;
$$;
grant execute on function public.admin_set_goal(text, numeric, date) to authenticated;

-- ── チケット RPC ───────────────────────────────────────────────────────────
create or replace function public.admin_tickets()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select coalesce(jsonb_agg(row_to_json(t) order by
            (case t.status when 'open' then 0 when 'in_progress' then 1 else 2 end),
            t.priority, t.created_at desc), '[]'::jsonb)
    into result
  from (
    select id, title, body, kind, priority, status, source_feedback_id, created_at, updated_at
    from public.ops_tickets
    order by created_at desc
    limit 500
  ) t;
  return result;
end;
$$;
grant execute on function public.admin_tickets() to authenticated;

create or replace function public.admin_ticket_create(
  p_title text, p_body text default null, p_kind text default 'task',
  p_priority int default 2, p_source_feedback uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  perform public._require_admin();
  if coalesce(p_kind, 'task') not in ('bug', 'feature', 'task') then raise exception 'invalid kind'; end if;
  insert into public.ops_tickets (title, body, kind, priority, source_feedback_id)
  values (left(coalesce(nullif(trim(p_title), ''), '(無題)'), 200), p_body,
          coalesce(p_kind, 'task'), coalesce(p_priority, 2), p_source_feedback)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.admin_ticket_create(text, text, text, int, uuid) to authenticated;

create or replace function public.admin_ticket_update(p_id uuid, p_status text default null, p_priority int default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status is not null and p_status not in ('open', 'in_progress', 'done', 'wont_fix') then
    raise exception 'invalid status';
  end if;
  update public.ops_tickets
     set status = coalesce(p_status, status),
         priority = coalesce(p_priority, priority),
         updated_at = now()
   where id = p_id;
end;
$$;
grant execute on function public.admin_ticket_update(uuid, text, int) to authenticated;

-- フィードバック1件からチケットを起票（カテゴリでバグ/要望/タスクに振り分け）。
-- 起票と同時に元フィードバックを in_progress にして二重対応を防ぐ。
create or replace function public.admin_ticket_from_feedback(p_feedback_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare fb record; new_id uuid; t_kind text;
begin
  perform public._require_admin();
  select * into fb from public.feedback where id = p_feedback_id;
  if not found then raise exception 'feedback not found'; end if;
  t_kind := case fb.category when 'bug' then 'bug' when 'feature' then 'feature' else 'task' end;
  insert into public.ops_tickets (title, body, kind, priority, source_feedback_id)
  values (left(coalesce(nullif(trim(fb.content), ''), '(無題)'), 200), fb.content, t_kind,
          case when t_kind = 'bug' then 1 else 2 end, fb.id)
  returning id into new_id;
  update public.feedback set status = 'in_progress' where id = p_feedback_id and status = 'open';
  return new_id;
end;
$$;
grant execute on function public.admin_ticket_from_feedback(uuid) to authenticated;
