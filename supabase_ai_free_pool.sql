-- 🧯 無料プランの AI の「全体の予算」（2026-11-25 オーナー「無料会員の割合がめっちゃ増えたら無料 AI 枠で赤字になる可能性もあるので、いい形で調整したい」）
--
-- 1 人ずつの上限（毎月 30 トークン・はじめの 2 か月 130・写真から書き起こし 10 回）は今までどおり。それに加えて、
-- 無料プランの全員の AI の原価を、日本時間の月ごとに 1 か所で数え、予算を超える 1 回は呼ばない（＝赤字にならない）。
-- 予算はサーバーが決める（api/_freePool.js: 基本 ¥10,000 ＋ 有料会員 1 人あたり ¥300・env で変えられる）。
-- 尽きたら、その月の残りは無料の AI を止める（相談はアプリが AI を使わずに自分のメモから答える）。翌月 1 日に戻る。
--
--   ai_free_pool(period_month PK 'YYYY-MM', cost_mjpy 1/1000 円, calls, updated_at)
--   reserve_ai_free_pool(p_period_month, p_amount, p_budget) → 予約後の合計（mjpy）／超えるなら -1（予約しない）
--   adjust_ai_free_pool(p_period_month, p_delta)            → 実際の原価との差を戻す（0 未満にしない）
-- どちらも 1 文の UPDATE で、同時に何本来ても予算を超えない。service_role だけが実行できる。
-- RLS 有効・ポリシーなし＝利用者からは読めない（運営ダッシュボードはサーバー経由で読む）。
-- 未適用なら、中継は今までどおり 1 人ずつの上限だけで守る（fail-open・警告のログだけ）。冪等。

create table if not exists public.ai_free_pool (
  period_month text primary key check (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  cost_mjpy bigint not null default 0,
  calls integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ai_free_pool enable row level security;

create or replace function public.reserve_ai_free_pool(p_period_month text, p_amount bigint, p_budget bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  insert into public.ai_free_pool (period_month) values (p_period_month)
  on conflict (period_month) do nothing;
  update public.ai_free_pool
     set cost_mjpy = cost_mjpy + greatest(p_amount, 0),
         calls = calls + 1,
         updated_at = now()
   where period_month = p_period_month
     and cost_mjpy + greatest(p_amount, 0) <= p_budget
  returning cost_mjpy into v_total;
  return coalesce(v_total, -1);
end;
$$;

create or replace function public.adjust_ai_free_pool(p_period_month text, p_delta bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_free_pool
     set cost_mjpy = greatest(cost_mjpy + p_delta, 0),
         updated_at = now()
   where period_month = p_period_month;
end;
$$;

revoke all on function public.reserve_ai_free_pool(text, bigint, bigint) from public;
revoke all on function public.adjust_ai_free_pool(text, bigint) from public;
grant execute on function public.reserve_ai_free_pool(text, bigint, bigint) to service_role;
grant execute on function public.adjust_ai_free_pool(text, bigint) to service_role;
