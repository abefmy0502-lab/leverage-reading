-- 🛰️ 運営ダッシュボード（KGI/KPI 管制塔）— 管理者だけが見る集計 RPC 群。
--
-- 設計:
--   - 集計対象テーブル（analytics_events / subscriptions / ai_usage / feedback /
--     books / book_memos / actions / auth.users）は RLS で「本人の行」しか読めない。
--     管理者が全体を集計するには RLS をバイパスする必要があるため、SECURITY
--     DEFINER 関数（= 所有者 postgres 権限で実行）で集計し、関数の冒頭で
--     is_app_admin() ゲートをかける（管理者以外は例外）。
--   - 生の行（特に feedback の本文/メール = PII）は管理者にのみ返す。一般
--     ユーザーは関数を呼んでも is_app_admin() が false で弾かれる。
--   - 冪等（IF NOT EXISTS / CREATE OR REPLACE）。本番に再適用しても安全。
--
-- ⚠️ 適用後、最後の「管理者シード」を必ず 1 回実行すること（自分を app_admins
--    に登録しないと、自分でもダッシュボードが見えない）。

-- ── 管理者テーブル ─────────────────────────────────────────────────────────
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- RLS 有効＋ポリシー無し＝クライアントからは直接読めない（is_app_admin 経由のみ）。
alter table public.app_admins enable row level security;

-- ── ゲート関数 ─────────────────────────────────────────────────────────────
-- 呼び出し元（auth.uid()）が管理者かどうか。クライアントからも呼べる（自分が
-- 管理者かの判定にのみ使う。他人の情報は返さない）。
create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_app_admin() to authenticated;

-- 各集計関数の冒頭で使う共通ガード。
create or replace function public._require_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'not authorized';
  end if;
end;
$$;

-- ── ① 概況スナップショット ─────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'users_total',   (select count(*) from auth.users),
    'new_users_7d',  (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'dau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '1 day'),
    'wau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '7 days'),
    'mau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '30 days'),
    'books_total',   (select count(*) from public.books),
    'memos_total',   (select count(*) from public.book_memos),
    'actions_total', (select count(*) from public.actions),
    'actions_done',  (select count(*) from public.actions where done = true),
    'subs_active',   (select count(*) from public.subscriptions where status = 'active'),
    'feedback_open', (select count(*) from public.feedback where status = 'open')
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_overview() to authenticated;

-- ── ② アクティブ人数 / 新規本の日次推移 ────────────────────────────────────
create or replace function public.admin_active_series(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    where created_at >= current_date - (n - 1)
    group by 1
  ),
  bk as (
    select created_at::date as d, count(*) as c
    from public.analytics_events
    where event = 'book_added' and created_at >= current_date - (n - 1)
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'd', to_char(days.d, 'MM/DD'),
    'active', coalesce(act.c, 0),
    'new_books', coalesce(bk.c, 0)
  ) order by days.d)
  into result
  from days
  left join act on act.d = days.d
  left join bk on bk.d = days.d;
  return coalesce(result, '[]'::jsonb);
end;
$$;
grant execute on function public.admin_active_series(int) to authenticated;

-- ── ③ 機能別の利用状況 ─────────────────────────────────────────────────────
-- どの機能がどれくらい使われているか。イベント名 / AI 機能内訳 / 本の追加経路。
create or replace function public.admin_feature_usage(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_days, 30), 365));
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_object_agg(event, c)
      from (select event, count(*) c from public.analytics_events
            where created_at >= now() - (n || ' days')::interval
            group by event order by count(*) desc) t
    ), '{}'::jsonb),
    'ai_features', coalesce((
      select jsonb_object_agg(f, c)
      from (select coalesce(props->>'feature', '?') f, count(*) c from public.analytics_events
            where event = 'ai_used' and created_at >= now() - (n || ' days')::interval
            group by 1 order by count(*) desc) t
    ), '{}'::jsonb),
    'book_via', coalesce((
      select jsonb_object_agg(v, c)
      from (select coalesce(props->>'via', '?') v, count(*) c from public.analytics_events
            where event = 'book_added' and created_at >= now() - (n || ' days')::interval
            group by 1 order by count(*) desc) t
    ), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_feature_usage(int) to authenticated;

-- ── ④ AI コスト / API 消費（月次） ─────────────────────────────────────────
create or replace function public.admin_ai_usage(p_months int default 6)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_months, 6), 36));
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', period_month, 'calls', total_calls, 'users', users
  ) order by period_month desc), '[]'::jsonb)
  into result
  from (
    select period_month, sum(calls)::int as total_calls, count(*)::int as users
    from public.ai_usage
    group by period_month
    order by period_month desc
    limit n
  ) t;
  return result;
end;
$$;
grant execute on function public.admin_ai_usage(int) to authenticated;

-- ── ⑤ 売上 / 課金 ─────────────────────────────────────────────────────────
create or replace function public.admin_revenue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'active', (select count(*) from public.subscriptions where status = 'active'),
    'by_status', coalesce((
      select jsonb_object_agg(coalesce(status, '?'), c)
      from (select status, count(*) c from public.subscriptions group by status) t
    ), '{}'::jsonb),
    'expiring_30d', (
      select count(*) from public.subscriptions
      where status = 'active' and current_period_end is not null
        and current_period_end < now() + interval '30 days'
    )
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_revenue() to authenticated;

-- ── ⑥ 問い合わせ / フィードバック（一本化された受信箱） ────────────────────
-- 管理者の「サポート受信箱」。PII（本文 / 名前 / メール）を含むが管理者専用。
create or replace function public.admin_feedback(p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select coalesce(jsonb_agg(row_to_json(f) order by f.created_at desc), '[]'::jsonb)
  into result
  from (
    select id, category, content, name, email, status, admin_note, created_at
    from public.feedback
    where (p_status is null or status = p_status)
    order by created_at desc
    limit 300
  ) f;
  return result;
end;
$$;
grant execute on function public.admin_feedback(text) to authenticated;

-- 問い合わせのトリアージ（ステータス更新 / メモ追記）。
create or replace function public.admin_feedback_update(p_id uuid, p_status text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status is not null and p_status not in ('open', 'in_progress', 'resolved', 'wont_fix') then
    raise exception 'invalid status';
  end if;
  update public.feedback
     set status = coalesce(p_status, status),
         admin_note = coalesce(p_note, admin_note)
   where id = p_id;
end;
$$;
grant execute on function public.admin_feedback_update(uuid, text, text) to authenticated;

-- ── 管理者シード（必ず 1 回実行） ─────────────────────────────────────────
-- 自分（オーナー）の auth.users 行を app_admins に登録する。メールは実アドレスに。
-- ※ このメールの account でアプリにサインイン済みであること（auth.users に行が要る）。
insert into public.app_admins (user_id)
select id from auth.users where email = 'leverage.book0502@gmail.com'
on conflict (user_id) do nothing;
