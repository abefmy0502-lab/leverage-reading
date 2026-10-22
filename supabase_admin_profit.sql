-- 💰 今月の売上と推定の粗利（2026-10-22 オーナー「現在の売り上げと推定の粗利がわかったりもしたい」「めっちゃいいものにガンガン進化させて」）
--   運営ダッシュボードの概況（admin/ProfitCard.jsx・src/lib/adminProfit.js）。
--
-- 依存（先に流す）: supabase_admin_metrics.sql（app_admins / _require_admin）・supabase_subscriptions.sql（subscriptions）・
--   supabase_admin_members_tasks.sql（subscriptions.period_type）・supabase_ai_usage.sql + supabase_ai_cost.sql（ai_usage.cost_mjpy）。
--   読むだけの表（無くても壊れない＝有無を確かめてから読む）: ai_token_lots（追加トークンの購入）・book_field_ai_daily（分野の AI）・
--   subscription_events（契約の履歴＝月ごとの推移）・ai_usage.purpose_mjpy（用途ごとの原価）。
-- 冪等。管理者（app_admins）は全部の数から除く。サンドボックス（TestFlight・審査）の購入・出来事は除く。
--
-- ① admin_profit(p_month) … p_month は日本時間の月 'YYYY-MM'（null なら今月）。返り値（jsonb）:
--   { month, generated_at,
--     paid: { monthly, annual, founding, trial },            -- 今の契約（status='active'）の人数。founding＝創業メンバー価格（period_type 'intro'）
--     packs: { 'orime_tokens_300': n, … },                   -- その月に買われた追加トークン（本番の購入だけ・取引の件数）
--     ai_cost_mjpy,                                           -- その月の AI の原価（1/1000 円・有料 'YYYY-MM'＋無料 'free-YYYY-MM'＋その月に終わる無料期間 'trial-YYYY-MM-DD'）
--     purpose_mjpy: { consult: mjpy, … },                     -- その月の用途ごとの原価（ai_usage.purpose_mjpy の合計・列が無ければ {}）
--     fields_ai_calls,                                        -- その月に AI で分野を決めた本の数（1 冊 約 ¥0.13・book_field_ai_daily）
--     paid_users_ai: { users, over_half, top_mjpy } }        -- 有料の行のうち原価のある人の数・枠（¥240）の半分を超えた人・いちばん多い人の原価（1 人は特定しない）
-- ② admin_profit_series(p_months) … 直近 p_months か月（今月を含む・古い順）の同じ材料。人数は各月の末（今月は今）の契約の状態
--   （subscription_events から・無ければ今月だけ subscriptions から）。[{ month, paid:{…}, packs:{…}, ai_cost_mjpy, fields_ai_calls, churned }]
-- ③ admin_renewals(p_months) … 次の p_months か月の更新の見込み（今の契約の current_period_end の月ごと）。
--   [{ month, annual, founding, monthly }]（人数。金額は画面で）。monthly は毎月の更新＝今の月額の人数をそのまま各月に。
-- 金額の計算（価格・手数料・税）は画面側 src/lib/adminProfit.js（価格の真実はストア）。

-- ── 共通: ある月の材料（人数は引数で受ける）────────────────────────────────────────
create or replace function public._admin_profit_month(p_month text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_packs jsonb := '{}'::jsonb;
  v_fields int := 0;
  v_cost bigint := 0;
  v_purpose jsonb := '{}'::jsonb;
  v_dist jsonb := jsonb_build_object('users', 0, 'over_half', 0, 'top_mjpy', 0);
begin
  v_from := (p_month || '-01')::date::timestamp at time zone 'Asia/Tokyo';
  v_to := ((p_month || '-01')::date + interval '1 month')::timestamp at time zone 'Asia/Tokyo';

  if to_regclass('public.ai_usage') is not null then
    begin
      execute $q$
        select coalesce(sum(cost_mjpy), 0)::bigint from public.ai_usage
         where user_id not in (select user_id from public.app_admins)
           and (period_month = $1 or period_month = 'free-' || $1 or period_month like 'trial-' || $1 || '-%')
      $q$ into v_cost using p_month;
      execute $q$
        select jsonb_build_object(
          'users', count(*),
          'over_half', count(*) filter (where cost_mjpy > 120000),
          'top_mjpy', coalesce(max(cost_mjpy), 0))
          from public.ai_usage
         where period_month = $1 and coalesce(cost_mjpy, 0) > 0
           and user_id not in (select user_id from public.app_admins)
      $q$ into v_dist using p_month;
    exception when undefined_column then v_cost := 0; -- supabase_ai_cost.sql 未適用
    end;
    begin
      execute $q$
        select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
          select e.key as k, sum((e.value)::numeric)::bigint as v
            from public.ai_usage u, jsonb_each_text(coalesce(u.purpose_mjpy, '{}'::jsonb)) e
           where u.user_id not in (select user_id from public.app_admins)
             and (u.period_month = $1 or u.period_month = 'free-' || $1 or u.period_month like 'trial-' || $1 || '-%')
           group by e.key) t
      $q$ into v_purpose using p_month;
    exception when undefined_column then v_purpose := '{}'::jsonb; -- supabase_ai_usage_purpose.sql 未適用
    end;
  end if;

  if to_regclass('public.ai_token_lots') is not null then
    execute $q$
      select coalesce(jsonb_object_agg(product_id, n), '{}'::jsonb)
        from (select product_id, count(*)::int as n from public.ai_token_lots
               where environment = 'production' and purchased_at >= $1 and purchased_at < $2
                 and user_id not in (select user_id from public.app_admins)
               group by product_id) t
    $q$ into v_packs using v_from, v_to;
  end if;

  if to_regclass('public.book_field_ai_daily') is not null then
    execute $q$
      select coalesce(sum(calls), 0)::int from public.book_field_ai_daily
       where day >= $1::date and day < ($1::date + interval '1 month')
    $q$ into v_fields using (p_month || '-01');
  end if;

  return jsonb_build_object('month', p_month, 'packs', v_packs, 'ai_cost_mjpy', v_cost, 'purpose_mjpy', v_purpose,
                            'fields_ai_calls', v_fields, 'paid_users_ai', v_dist);
end $$;
revoke all on function public._admin_profit_month(text) from public;

-- 今の契約の人数（subscriptions から）。
create or replace function public._admin_profit_paid_now()
returns jsonb
language sql security definer set search_path = public
as $$
  select jsonb_build_object(
    'monthly', count(*) filter (where coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(price_id, '') !~* '(annual|year)'),
    'annual', count(*) filter (where coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(price_id, '') ~* '(annual|year)'),
    'founding', count(*) filter (where period_type = 'intro'),
    'trial', count(*) filter (where period_type = 'trial'))
  from public.subscriptions
  where status = 'active' and user_id not in (select user_id from public.app_admins);
$$;
revoke all on function public._admin_profit_paid_now() from public;

-- ── ① 今月 ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_profit(p_month text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_month text; v_body jsonb;
begin
  perform public._require_admin();
  v_month := coalesce(nullif(trim(p_month), ''), to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM'));
  if v_month !~ '^\d{4}-\d{2}$' then raise exception 'bad month'; end if;
  v_body := public._admin_profit_month(v_month);
  return v_body || jsonb_build_object('generated_at', now(), 'paid', public._admin_profit_paid_now());
end $$;
revoke all on function public.admin_profit(text) from public;
grant execute on function public.admin_profit(text) to authenticated;

-- ── ② 月ごとの推移 ──────────────────────────────────────────────────────────────────
create or replace function public.admin_profit_series(p_months int default 12)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_n int := greatest(1, least(coalesce(p_months, 12), 36));
  v_this date := (date_trunc('month', now() at time zone 'Asia/Tokyo'))::date;
  v_out jsonb := '[]'::jsonb;
  v_m date;
  v_month text;
  v_end timestamptz;
  v_paid jsonb;
  v_churn int;
  v_has_events boolean := to_regclass('public.subscription_events') is not null;
  i int;
begin
  perform public._require_admin();
  for i in reverse (v_n - 1)..0 loop
    v_m := (v_this - (i || ' months')::interval)::date;
    v_month := to_char(v_m, 'YYYY-MM');
    v_end := least(now(), ((v_m + interval '1 month')::timestamp at time zone 'Asia/Tokyo'));
    v_churn := 0;
    if i = 0 then
      v_paid := public._admin_profit_paid_now();
    elsif v_has_events then
      -- その月の末の時点で、人ごとのいちばん新しい出来事。
      execute $q$
        with ev as (
          select user_id, status, period_type, product_id, event_at
            from public.subscription_events
           where event_at < $1 and coalesce(environment, 'production') <> 'sandbox'
             and user_id not in (select user_id from public.app_admins)
        ), last as (
          select distinct on (user_id) user_id, status, period_type, product_id from ev order by user_id, event_at desc
        )
        select jsonb_build_object(
          'monthly', count(*) filter (where status = 'active' and coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(product_id, '') !~* '(annual|year)'),
          'annual', count(*) filter (where status = 'active' and coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(product_id, '') ~* '(annual|year)'),
          'founding', count(*) filter (where status = 'active' and period_type = 'intro'),
          'trial', count(*) filter (where status = 'active' and period_type = 'trial'))
        from last
      $q$ into v_paid using v_end;
    else
      v_paid := jsonb_build_object('monthly', 0, 'annual', 0, 'founding', 0, 'trial', 0, 'unknown', true);
    end if;
    if v_has_events then
      -- その月に解約した人（有料 → canceled）。
      execute $q$
        with ev as (
          select user_id, status, period_type, event_at,
                 lag(status) over (partition by user_id order by event_at) as prev_status,
                 lag(period_type) over (partition by user_id order by event_at) as prev_type
            from public.subscription_events
           where coalesce(environment, 'production') <> 'sandbox'
             and user_id not in (select user_id from public.app_admins)
        )
        select count(distinct user_id)::int from ev
         where status = 'canceled' and prev_status = 'active' and coalesce(prev_type, 'normal') <> 'trial'
           and event_at >= $1 and event_at < $2
      $q$ into v_churn using ((v_m)::timestamp at time zone 'Asia/Tokyo'), ((v_m + interval '1 month')::timestamp at time zone 'Asia/Tokyo');
    end if;
    v_out := v_out || jsonb_build_array(public._admin_profit_month(v_month) || jsonb_build_object('paid', v_paid, 'churned', v_churn));
  end loop;
  return v_out;
end $$;
revoke all on function public.admin_profit_series(int) from public;
grant execute on function public.admin_profit_series(int) to authenticated;

-- ── ③ 更新の見込み（次の 12 か月）────────────────────────────────────────────────
create or replace function public.admin_renewals(p_months int default 12)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_n int := greatest(1, least(coalesce(p_months, 12), 24));
  v_this date := (date_trunc('month', now() at time zone 'Asia/Tokyo'))::date;
  v_monthly int;
  v_out jsonb;
begin
  perform public._require_admin();
  select count(*) into v_monthly from public.subscriptions
   where status = 'active' and coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(price_id, '') !~* '(annual|year)'
     and user_id not in (select user_id from public.app_admins);
  select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'monthly', v_monthly,
           'annual', coalesce(a.annual, 0), 'founding', coalesce(a.founding, 0)) order by m.month), '[]'::jsonb)
    into v_out
  from (select to_char(v_this + (g || ' months')::interval, 'YYYY-MM') as month from generate_series(0, v_n - 1) g) m
  left join (
    select to_char(current_period_end at time zone 'Asia/Tokyo', 'YYYY-MM') as month,
           count(*) filter (where coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(price_id, '') ~* '(annual|year)')::int as annual,
           count(*) filter (where period_type = 'intro')::int as founding
      from public.subscriptions
     where status = 'active' and current_period_end is not null
       and user_id not in (select user_id from public.app_admins)
     group by 1
  ) a on a.month = m.month;
  return v_out;
end $$;
revoke all on function public.admin_renewals(int) from public;
grant execute on function public.admin_renewals(int) to authenticated;
