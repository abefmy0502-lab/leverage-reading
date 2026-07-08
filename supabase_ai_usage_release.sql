-- 🧾 AI 月次利用量の払い戻し RPC + reserve の GRANT 補修（冪等）
--
-- 背景 2 点:
--   1) supabase_ai_usage_atomic.sql の reserve_ai_usage は upstream (Anthropic)
--      呼び出し【前】に calls を +1 する。upstream が 4xx/5xx で失敗した場合
--      （課金されないコールが多い）に払い戻しが無く、障害時間帯の再試行だけで
--      月次上限 (既定 120) が消費される非対称があった。release_ai_usage で
--      原子的に -1 して対称にする（api/claude.js が失敗経路で呼ぶ）。
--   2) 同ファイルは reserve_ai_usage を REVOKE ALL FROM public しているが、
--      増分側 increment_ai_usage と違い service_role への GRANT が無い。
--      Postgres では REVOKE FROM public で service_role が PUBLIC 経由で
--      継承していた EXECUTE も剥がれるため、環境によっては reserve が
--      permission denied → fail-open に落ち、せっかくの原子的ガードが
--      静かに無効化される。ここで明示 GRANT して補修する。
--
-- 適用順: supabase_ai_usage.sql → supabase_ai_usage_atomic.sql → 本ファイル。
-- 未適用でも api/claude.js は fail-open（従来挙動のまま）で壊れない。

-- ① reserve_ai_usage の GRANT 補修（既に付与済みでも冪等）
grant execute on function public.reserve_ai_usage(uuid, text, int) to service_role;

-- ② 払い戻し RPC: 該当行の calls を 0 未満にならない範囲で -1 する。
--    行が無い場合は何もしない（reserve 前に失敗した経路から呼ばれても安全）。
create or replace function public.release_ai_usage(
  p_user_id uuid,
  p_period_month text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set calls = greatest(calls - 1, 0)
   where user_id = p_user_id
     and period_month = p_period_month;
$$;

revoke all on function public.release_ai_usage(uuid, text) from public;
revoke all on function public.release_ai_usage(uuid, text) from anon;
revoke all on function public.release_ai_usage(uuid, text) from authenticated;
grant execute on function public.release_ai_usage(uuid, text) to service_role;
