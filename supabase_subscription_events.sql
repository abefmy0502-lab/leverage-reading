-- 💳📜 契約の履歴（subscription_events）— 追記だけの記録（2026-10-02・ローンチの 4 つの数字）。
--
-- なぜ要るか:
--   subscriptions は 1 人 1 行。7 日間無料 → 有料に進むと、同じ行の period_type が
--   'trial' → 'normal' に上書きされ、「無料期間を始めた人」「有料に進んだ人」が
--   あとから分からない（7 日間無料 → 有料の割合が数えられない）。
--   revenuecat_events / stripe_events は二重処理を防ぐための表で、イベント ID と
--   種類しか持たない（誰の・どの期間かが無い）ので、別に追記だけの表を作る。
--
-- 書き手: api/revenuecat-webhook.js / api/stripe-webhook.js（service_role・api/_subscriptionEvents.js）。
--   契約のイベントを受けるたびに 1 行足す。同じイベントの再送は (provider, source_event_id) で 1 行。
--   表が無い（この SQL が未適用）ときは、Webhook は警告を出すだけで今までどおり動く。
-- 読み手: admin_launch_kpis()（supabase_admin_launch_kpis.sql）。
--
-- 中身は契約の種類と日時だけ（メール・金額・レシートは入れない）。
-- RLS 有効＋ポリシー無し＝クライアントからは読めない・書けない（service_role と
-- SECURITY DEFINER の集計関数だけ）。
-- 冪等（IF NOT EXISTS・既存の行があれば初回の写しは足さない）。Supabase の SQL Editor にコピペで実行。
--
-- ⚠️ 過去の分は戻らない: この SQL を流す前に終わった「無料期間 → 有料」は記録に無い。
--    下の「初回の写し」で、いま無料期間中の人だけは「無料期間を始めた」として残す。

create table if not exists public.subscription_events (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  provider            text not null check (provider in ('revenuecat', 'stripe', 'backfill')),
  source_event_id     text,                 -- RevenueCat の event.id / Stripe の event.id（写しは null）
  event_type          text,                 -- INITIAL_PURCHASE / RENEWAL / customer.subscription.updated / snapshot など
  status              text,                 -- その時点で subscriptions に書いた status（active / canceled / past_due / trialing）
  period_type         text check (period_type is null or period_type in ('trial', 'intro', 'normal')),
  product_id          text,
  store               text,
  environment         text,                 -- 'production' / 'sandbox'
  is_trial_conversion boolean,              -- RevenueCat の RENEWAL が無料期間からの切り替わりに付ける印
  event_at            timestamptz not null default now(),  -- 出来事の時刻（RevenueCat event_timestamp_ms / Stripe event.created）
  created_at          timestamptz not null default now()
);

create unique index if not exists subscription_events_source_uidx
  on public.subscription_events (provider, source_event_id)
  where source_event_id is not null;
create index if not exists subscription_events_user_idx
  on public.subscription_events (user_id, event_at);
create index if not exists subscription_events_period_idx
  on public.subscription_events (period_type, event_at);

alter table public.subscription_events enable row level security;
-- ポリシー無し＝ authenticated / anon は不可。service_role（RLS バイパス）だけが書く。

-- ── 初回の写し（この SQL を流した時点の subscriptions を 1 人 1 行で残す） ──────────
-- いま無料期間中の人（period_type が trial / intro）は、行を作った時刻（≒無料期間を始めた時刻）を
-- event_at にして「無料期間を始めた」記録になる。これからの RENEWAL で有料に進んだかが分かる。
-- 有料（normal / null）の人は「前に無料期間があったか」が分からないので、7 日間無料 → 有料の分母には入らない。
-- period_type / store 列が無い DB（未適用の SQL がある）でも動くように、列の有無を見て組み立てる。
do $$
declare
  has_period boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'period_type');
  has_store boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'store');
begin
  if to_regclass('public.subscriptions') is null then
    return;
  end if;
  execute format($q$
    insert into public.subscription_events
      (user_id, provider, source_event_id, event_type, status, period_type, product_id, store, environment, event_at)
    select s.user_id, 'backfill', null, 'snapshot', s.status,
           %s,
           s.price_id,
           %s,
           'production',
           coalesce(s.created_at, now())
    from public.subscriptions s
    where not exists (
      select 1 from public.subscription_events e
      where e.user_id = s.user_id and e.provider = 'backfill'
    )
  $q$,
    case when has_period
      then $p$case when lower(s.period_type) in ('trial', 'intro', 'normal') then lower(s.period_type) else null end$p$
      else 'null' end,
    case when has_store then 's.store' else 'null' end
  );
end $$;

-- 確認:
--   select provider, period_type, status, count(*) from public.subscription_events group by 1, 2, 3 order by 1, 2, 3;
