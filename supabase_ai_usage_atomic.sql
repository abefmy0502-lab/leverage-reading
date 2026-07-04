-- 🧮 AI 月次利用上限の「原子的な予約（check-and-increment）」RPC。
--
-- 背景（M 是正）:
--   api/claude.js は従来 checkMonthlyUsage(読み) → 上限判定 → 後で
--   incrementMonthlyUsage(加算) の 2 段構えだった。並行リクエストが同じ
--   pre-increment 値を読んで全て通過し、実効上限を超過しうる TOCTOU があった
--   （per-minute レート制限が overrun を抑えるため実害は小さいが、原価ガードとしては緩い）。
--
-- 本 RPC は「上限未満のときだけ +1 して新カウントを返す」を単一 UPDATE で原子的に行う。
--   - 上限に達していれば加算せず -1 を返す（= 拒否。カウントは水増ししない）。
--   - 初回（行なし）は INSERT で calls=1 を作り 1 を返す。
--   同一 (user, month) 行は行ロックで直列化されるため、並行でも超過しない。
--
-- 流儀: supabase_ai_usage.sql（ai_usage テーブル + increment_ai_usage）に乗る。
--   先に supabase_ai_usage.sql を適用済みであること。SECURITY DEFINER・service_role のみ
--   （api/claude.js がサーバーから呼ぶ）。未適用なら claude.js は fail-open で
--   従来の check+increment に委譲するため、無くても AI は止まらない。冪等。
--
-- ⚠️ Supabase SQL Editor にコピペで 1 回実行する想定。

create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_period_month text,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calls int;
begin
  -- 上限未満のときだけ +1。conflict の DO UPDATE に WHERE を付けることで、
  -- 既に上限到達の行は更新されず（RETURNING が行を返さない）→ v_calls = null。
  insert into public.ai_usage (user_id, period_month, calls)
    values (p_user_id, p_period_month, 1)
  on conflict (user_id, period_month) do update
    set calls = public.ai_usage.calls + 1
    where public.ai_usage.calls < p_limit
  returning calls into v_calls;

  if v_calls is null then
    return -1; -- 上限到達（加算せず拒否）
  end if;
  return v_calls;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, int) from public, anon, authenticated;
