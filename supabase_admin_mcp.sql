-- 🛰️🔌 運営ダッシュボードを AI と連携（MCP）から 1 回で読む（2026-11-08 オーナー「運営ダッシュボードをアーティファクトにしたい」）
--
-- Claude の会話の中のダッシュボード（アーティファクト）は、「Orime」コネクタの道具 ops_dashboard を 1 回呼んで数字を描く。
-- 道具の中身は api/_mcp.js → この関数。既存の集計関数（admin_overview / admin_revenue / admin_growth / admin_launch_kpis /
-- admin_goal_plan / admin_goal_weekly / admin_profit / admin_profit_series / admin_renewals）は auth.uid() で管理者を確かめるので、
-- service_role から呼ぶときは、このラッパーが「その利用者としての JWT の claims」を同じトランザクションの中だけ置いてから呼ぶ。
--
-- 守り: 実行できるのは service_role だけ（REVOKE/GRANT）。p_user_id が app_admins に無ければ例外。無い関数は null（未適用の SQL があっても壊れない）。
-- 依存: supabase_admin_metrics.sql（app_admins）。ほかの admin_* は有無を確かめてから呼ぶ。冪等。

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
  begin select public.admin_feedback('open') into part; exception when others then part := null; end;
  v := v || jsonb_build_object('feedback_open', part);

  return v || jsonb_build_object('generated_at', now());
end;
$$;

revoke all on function public.admin_snapshot_for(uuid) from public;
revoke all on function public.admin_snapshot_for(uuid) from anon;
revoke all on function public.admin_snapshot_for(uuid) from authenticated;
grant execute on function public.admin_snapshot_for(uuid) to service_role;
