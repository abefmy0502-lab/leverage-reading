-- 💴 AI の原価を「円」で数えて、1 人・1 か月の上限を守る（2026-09-27）
--
-- 目的: 有料会員 1 人から、App Store の手数料と消費税を引いたあとに毎月 ¥1,000 が
--       手元に残るようにする。月額 ¥1,480 → 税抜 ¥1,345 → Apple の手数料
--       （日本・小規模事業者プログラム 10%＋App 内課金の決済 5%＝15%）を引いて約 ¥1,144。
--       ここから ¥1,000 を残すと、AI に使えるのは 1 人・月 約 ¥143 まで。
--       api/claude.js が実際に使ったトークン数から円の原価を出し、この行に積む。
--
-- 仕組み:
--   - ai_usage に cost_mjpy（その月に使った AI の原価。単位は 1/1000 円）を足す。
--   - reserve_ai_cost: AI を呼ぶ前に「この 1 回の最大の原価」を予約する。予約後の合計が
--     上限を超えるなら予約せず -1 を返す（＝呼ばない）。1 文の UPDATE なので、同時に
--     何本来ても上限を超えない。
--   - adjust_ai_cost: 呼んだあとに「実際の原価 − 予約した額」を足し戻す（ほとんどは減る）。
--     失敗して AI が答えなかったときは、予約した額をまるごと戻す。
--
-- 先に supabase_ai_usage.sql を適用しておくこと（ai_usage 表が要る）。
-- 未適用の DB では api/claude.js は回数の上限（AI_MONTHLY_CALL_LIMIT）だけで守る。
-- 冪等: 何度実行しても安全。

alter table public.ai_usage
  add column if not exists cost_mjpy bigint not null default 0;

create or replace function public.reserve_ai_cost(
  p_user_id uuid,
  p_period_month text,
  p_amount bigint,
  p_budget bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  insert into public.ai_usage (user_id, period_month, calls, cost_mjpy, updated_at)
  values (p_user_id, p_period_month, 0, 0, now())
  on conflict (user_id, period_month) do nothing;

  update public.ai_usage
     set cost_mjpy = cost_mjpy + greatest(p_amount, 0),
         updated_at = now()
   where user_id = p_user_id
     and period_month = p_period_month
     and cost_mjpy + greatest(p_amount, 0) <= p_budget
  returning cost_mjpy into v_total;

  if v_total is null then
    return -1; -- 上限を超えるので予約しない
  end if;
  return v_total;
end;
$$;

create or replace function public.adjust_ai_cost(
  p_user_id uuid,
  p_period_month text,
  p_delta bigint
)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set cost_mjpy = greatest(cost_mjpy + p_delta, 0),
         updated_at = now()
   where user_id = p_user_id
     and period_month = p_period_month
  returning cost_mjpy;
$$;

revoke all on function public.reserve_ai_cost(uuid, text, bigint, bigint) from public;
revoke all on function public.reserve_ai_cost(uuid, text, bigint, bigint) from anon;
revoke all on function public.reserve_ai_cost(uuid, text, bigint, bigint) from authenticated;
grant execute on function public.reserve_ai_cost(uuid, text, bigint, bigint) to service_role;

revoke all on function public.adjust_ai_cost(uuid, text, bigint) from public;
revoke all on function public.adjust_ai_cost(uuid, text, bigint) from anon;
revoke all on function public.adjust_ai_cost(uuid, text, bigint) from authenticated;
grant execute on function public.adjust_ai_cost(uuid, text, bigint) to service_role;

-- 確認用（管理者が SQL Editor で）: 今月、上限に近い人
-- select user_id, calls, round(cost_mjpy / 1000.0, 1) as cost_jpy
--   from ai_usage where period_month = to_char(now() at time zone 'utc', 'YYYY-MM')
--   order by cost_mjpy desc limit 20;
