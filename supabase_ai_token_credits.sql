-- 🪙➕ 追加トークン（買い足し）— 2026-09-27 オーナー裁定
--
-- 目的: プランの人（有料・7 日間無料）が、その月のトークンを使い切ったときに、App Store の
--       消耗型（consumable）の App 内課金でトークンを買い足せるようにする。
--       商品: orime_tokens_300（300 トークン・¥300）/ orime_tokens_1000（1,000 トークン・¥800）。
--
-- 決まり:
--   - 使う順は「その月（無料期間はその期間）のトークン → 追加分」。追加分は期限の近いものから（FIFO）。
--   - 期限は購入から 180 日（資金決済法: 有効期限 6 か月以内の前払いは前払式支払手段の義務の対象外）。
--   - 追加分はプランをやめても期限までは相談に使える（無料プランは相談だけ）。
--
-- 仕組み:
--   - ai_token_lots: 買ったまとまり（ロット）ごとに 1 行。transaction_id UNIQUE で二重に足さない。
--     本人は SELECT だけできる（残りと期限の表示）。書くのは service_role（webhook・api/claude.js）だけ。
--   - ai_usage.lot_tokens: その期間（行）で、もう追加分から払ったトークン。
--   - credit_token_lot: webhook（api/revenuecat-webhook.js）が購入を記録する（同じ取引は 0 を返す）。
--   - consume_token_lots: 期限内のロットから期限の近い順に差し引き、差し引けた量を返す（負にしない）。
--   - settle_token_overflow: 精算のあとに api/claude.js が呼ぶ。その期間に使ったトークン（切り上げ）が
--     その月の分を超えた分のうち、まだ払っていない分を追加分から差し引く（行をロックして 1 回ずつ）。
--     足りない分（「最後の 1 回」のはみ出し）は、あとで買った分から取らない（払ったことにして進める）。
--
-- 先に supabase_ai_usage.sql と supabase_ai_cost.sql を適用しておくこと（ai_usage・cost_mjpy が要る）。
-- 未適用の DB では、api/claude.js は追加分が無いものとして今までどおり動く（fail-safe）。
-- 冪等: 何度実行しても安全。

create table if not exists public.ai_token_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tokens_total integer not null check (tokens_total > 0),
  tokens_left integer not null check (tokens_left >= 0),
  source text not null default 'iap' check (source in ('iap')),
  transaction_id text not null unique,
  product_id text not null,
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ai_token_lots_left_le_total check (tokens_left <= tokens_total),
  constraint ai_token_lots_expiry_le_180d check (expires_at <= purchased_at + interval '180 days')
);

create index if not exists ai_token_lots_user_active_idx
  on public.ai_token_lots (user_id, expires_at)
  where tokens_left > 0;

alter table public.ai_token_lots enable row level security;

drop policy if exists "ai_token_lots_select_own" on public.ai_token_lots;
create policy "ai_token_lots_select_own" on public.ai_token_lots
  for select to authenticated
  using (auth.uid() = user_id);
-- INSERT / UPDATE / DELETE のポリシーは作らない（service_role だけが書く）。

alter table public.ai_usage
  add column if not exists lot_tokens integer not null default 0;

-- 購入を記録する（webhook）。戻り値: 足したトークン（同じ取引なら 0）。
create or replace function public.credit_token_lot(
  p_user_id uuid,
  p_transaction_id text,
  p_product_id text,
  p_tokens integer,
  p_purchased_at timestamptz,
  p_environment text default 'production'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := coalesce(p_purchased_at, now());
  v_id uuid;
begin
  if p_tokens is null or p_tokens <= 0 or p_transaction_id is null or p_transaction_id = '' then
    return 0;
  end if;
  insert into public.ai_token_lots (user_id, tokens_total, tokens_left, source, transaction_id, product_id, environment, purchased_at, expires_at)
  values (p_user_id, p_tokens, p_tokens, 'iap', p_transaction_id, p_product_id,
          case when p_environment = 'sandbox' then 'sandbox' else 'production' end,
          v_at, v_at + interval '180 days')
  on conflict (transaction_id) do nothing
  returning id into v_id;
  if v_id is null then
    return 0; -- 同じ取引はもう足してある
  end if;
  return p_tokens;
end;
$$;

-- 期限内のロットから、期限の近い順に差し引く。戻り値: 差し引けた量（0 以上・p_tokens 以下）。
create or replace function public.consume_token_lots(
  p_user_id uuid,
  p_tokens integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need integer := greatest(coalesce(p_tokens, 0), 0);
  v_taken integer := 0;
  v_take integer;
  r record;
begin
  if v_need = 0 then
    return 0;
  end if;
  for r in
    select id, tokens_left
      from public.ai_token_lots
     where user_id = p_user_id
       and tokens_left > 0
       and expires_at > now()
     order by expires_at, purchased_at, id
     for update
  loop
    exit when v_need <= 0;
    v_take := least(r.tokens_left, v_need);
    update public.ai_token_lots set tokens_left = tokens_left - v_take where id = r.id;
    v_need := v_need - v_take;
    v_taken := v_taken + v_take;
  end loop;
  return v_taken;
end;
$$;

-- 精算のあと（api/claude.js）。その期間に使ったトークン（切り上げ）がその月の分を超えた分のうち、
-- まだ払っていない分を追加分から差し引く。戻り値: 今回差し引けた量。
create or replace function public.settle_token_overflow(
  p_user_id uuid,
  p_period_month text,
  p_allowance_tokens integer,
  p_token_mjpy integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost bigint;
  v_charged integer;
  v_used integer;
  v_need integer;
  v_taken integer;
begin
  if p_token_mjpy is null or p_token_mjpy <= 0 then
    return 0;
  end if;
  select cost_mjpy, lot_tokens into v_cost, v_charged
    from public.ai_usage
   where user_id = p_user_id and period_month = p_period_month
   for update;
  if not found then
    return 0;
  end if;
  v_used := ceil(v_cost::numeric / p_token_mjpy)::integer;
  v_need := greatest(v_used - greatest(coalesce(p_allowance_tokens, 0), 0), 0) - coalesce(v_charged, 0);
  if v_need <= 0 then
    return 0;
  end if;
  v_taken := public.consume_token_lots(p_user_id, v_need);
  -- 足りなかった分（最後の 1 回のはみ出し）も「払った」ことにする＝あとで買った分から取らない。
  update public.ai_usage
     set lot_tokens = coalesce(lot_tokens, 0) + v_need,
         updated_at = now()
   where user_id = p_user_id and period_month = p_period_month;
  return v_taken;
end;
$$;

revoke all on function public.credit_token_lot(uuid, text, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.credit_token_lot(uuid, text, text, integer, timestamptz, text) to service_role;
revoke all on function public.consume_token_lots(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_token_lots(uuid, integer) to service_role;
revoke all on function public.settle_token_overflow(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.settle_token_overflow(uuid, text, integer, integer) to service_role;

-- 確認用（任意）:
--   select product_id, environment, count(*), sum(tokens_total), sum(tokens_left)
--     from public.ai_token_lots group by 1, 2;
