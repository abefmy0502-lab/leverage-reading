-- 🪙📊 トークンの使い道（用途ごとの内訳・2026-10-11 オーナー「現在のトークン利用料の可視化をしたい」）
--
-- 目的: 設定・相談から開く「トークンの使い方」のシートで、今月（7 日間無料はその期間）に
--       どの機能（相談・AI 選書・読書計画シート・この本で学べること・写真から書き起こし …）に
--       何トークン使ったかを見せる。
--
-- 仕組み:
--   - ai_usage に purpose_mjpy jsonb（用途 → その期間の原価。単位は 1/1000 円＝cost_mjpy と同じ）を足す。
--     トークンではなく原価で積む（1 回ごとに切り上げたトークンを足すと、合計が「使ったトークン」より大きくなる）。
--     画面はこの割合で「使ったトークン」（cost_mjpy から）を分ける＝足すと使ったトークンと同じ（src/lib/tokenUsage.js）。
--   - add_ai_purpose_cost: api/claude.js が精算（adjust_ai_cost）のあとに、その 1 回の実際の原価を用途に足す。
--     1 文の UPDATE なので、同時に何本来ても足し漏れない（行のロックのあとに最新の値から足す）。
--     用途の名前は英小文字と _ だけ（それ以外は 'other'）。用途は 24 種類まで（超えたら 'other' に足す）。
--   - 本人は自分の行を読める（ai_usage の既存の SELECT のポリシーのまま）。書くのは service_role だけ。
--
-- 先に supabase_ai_usage.sql・supabase_ai_cost.sql を適用しておくこと。
-- 未適用の DB では、api/claude.js は内訳を足さず（警告だけ・AI は止めない）、画面は内訳の段を出さない。
-- 冪等: 何度実行しても安全。

alter table public.ai_usage
  add column if not exists purpose_mjpy jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_purpose_mjpy_object') then
    alter table public.ai_usage
      add constraint ai_usage_purpose_mjpy_object
      check (jsonb_typeof(purpose_mjpy) = 'object' and pg_column_size(purpose_mjpy) < 4096);
  end if;
end;
$$;

create or replace function public.add_ai_purpose_cost(
  p_user_id uuid,
  p_period_month text,
  p_purpose text,
  p_mjpy bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := coalesce(p_purpose, '');
  v_cur jsonb;
begin
  if p_user_id is null or p_period_month is null or p_mjpy is null or p_mjpy <= 0 then
    return;
  end if;
  if v_key !~ '^[a-z_]{1,32}$' then
    v_key := 'other';
  end if;
  -- 用途の数の上限（24）。数えるのはロックの前（同時に新しい用途が 2 つ来て 25 になっても害はない）。
  select coalesce(purpose_mjpy, '{}'::jsonb) into v_cur
    from public.ai_usage
   where user_id = p_user_id and period_month = p_period_month;
  if v_cur is null then
    return; -- 行が無い（原価を予約していない）ときは足さない
  end if;
  if not (v_cur ? v_key) and (select count(*) from jsonb_object_keys(v_cur)) >= 24 then
    v_key := 'other';
  end if;

  -- 足すのは 1 文の UPDATE（行のロックのあとの最新の値に足す＝同時でも足し漏れない）。
  update public.ai_usage
     set purpose_mjpy = jsonb_set(
           coalesce(purpose_mjpy, '{}'::jsonb),
           array[v_key],
           to_jsonb(coalesce((purpose_mjpy ->> v_key)::bigint, 0) + p_mjpy),
           true
         ),
         updated_at = now()
   where user_id = p_user_id
     and period_month = p_period_month;
end;
$$;

revoke all on function public.add_ai_purpose_cost(uuid, text, text, bigint) from public;
grant execute on function public.add_ai_purpose_cost(uuid, text, text, bigint) to service_role;
