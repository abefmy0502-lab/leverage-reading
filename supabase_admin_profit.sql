-- 💰 今月の売上と推定の粗利（2026-10-22 オーナー「現在の売り上げと推定の粗利がわかったりもしたい」）— 運営ダッシュボードの概況
--
-- 依存（先に流す）: supabase_admin_metrics.sql（app_admins / _require_admin）・supabase_subscriptions.sql（subscriptions）・
--   supabase_admin_members_tasks.sql（subscriptions.period_type）・supabase_ai_usage.sql + supabase_ai_cost.sql（ai_usage.cost_mjpy）。
--   読むだけの表（無くても壊れない＝有無を確かめてから読む）: ai_token_lots（追加トークンの購入）・book_field_ai_daily（分野の AI）。
-- 冪等。管理者（app_admins）は全部の数から除く。サンドボックス（TestFlight・審査）の購入は除く。
--
-- admin_profit(p_month) … p_month は日本時間の月 'YYYY-MM'（null なら今月）。返り値（jsonb）:
--   { month, generated_at,
--     paid: { monthly, annual, founding, trial },            -- 今の契約（status='active'）の人数。founding＝創業メンバー価格（period_type 'intro'）
--     packs: { 'orime_tokens_300': n, … },                   -- その月に買われた追加トークン（本番の購入だけ・取引の件数）
--     ai_cost_mjpy,                                           -- その月の AI の原価（1/1000 円・有料 'YYYY-MM'＋無料 'free-YYYY-MM'＋その月に終わる無料期間 'trial-YYYY-MM-DD'）
--     fields_ai_calls }                                       -- その月に AI で分野を決めた本の数（1 冊 約 ¥0.13・book_field_ai_daily）
-- 金額の計算（価格・手数料・税）は画面側 src/lib/adminProfit.js（価格の真実はストア）。
create or replace function public.admin_profit(p_month text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_month text;
  v_from timestamptz;
  v_to timestamptz;
  v_packs jsonb := '{}'::jsonb;
  v_fields int := 0;
  v_cost bigint := 0;
  v_paid jsonb;
begin
  perform public._require_admin();
  v_month := coalesce(nullif(trim(p_month), ''), to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM'));
  if v_month !~ '^\d{4}-\d{2}$' then raise exception 'bad month'; end if;
  v_from := (v_month || '-01')::date::timestamp at time zone 'Asia/Tokyo';
  v_to := ((v_month || '-01')::date + interval '1 month')::timestamp at time zone 'Asia/Tokyo';

  select jsonb_build_object(
    'monthly', count(*) filter (where coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(price_id, '') !~* '(annual|year)'),
    'annual', count(*) filter (where coalesce(period_type, 'normal') not in ('trial', 'intro') and coalesce(price_id, '') ~* '(annual|year)'),
    'founding', count(*) filter (where period_type = 'intro'),
    'trial', count(*) filter (where period_type = 'trial'))
    into v_paid
  from public.subscriptions
  where status = 'active' and user_id not in (select user_id from public.app_admins);

  if to_regclass('public.ai_usage') is not null then
    begin
      execute $q$
        select coalesce(sum(cost_mjpy), 0)::bigint from public.ai_usage
         where user_id not in (select user_id from public.app_admins)
           and (period_month = $1 or period_month = 'free-' || $1 or period_month like 'trial-' || $1 || '-%')
      $q$ into v_cost using v_month;
    exception when undefined_column then v_cost := 0; -- supabase_ai_cost.sql 未適用
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
    $q$ into v_fields using (v_month || '-01');
  end if;

  return jsonb_build_object(
    'month', v_month, 'generated_at', now(),
    'paid', v_paid, 'packs', v_packs, 'ai_cost_mjpy', v_cost, 'fields_ai_calls', v_fields);
end $$;

revoke all on function public.admin_profit(text) from public;
grant execute on function public.admin_profit(text) to authenticated;
