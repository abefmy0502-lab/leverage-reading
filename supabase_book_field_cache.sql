-- 🏷 本の分野を、本ごとに 1 回だけ決めて全員で使う（2026-10-11 オーナー「この本以外の精度が上がるように仕組みを根本的に修正してね」）
--
-- 分野（lib/bookFields.js の 20 の一覧）は、利用者ではなく「本」で決まる。サーバーが本の公開の書誌（書名・副題・著者・
-- 出版社・紹介文・目次・楽天ブックスのジャンル）から 1 回だけ決め、ここに残す。次にだれかが同じ本を足したときは、ここから返す。
--   book_field_cache  … 本ごとの分野（book_key＝ISBN13 か、書名＋著者を整えた鍵）。source＝genre（書店のジャンルだけで決まった）
--                       / ai（AI が一覧から選んだ）/ keywords（AI が使えなかったときの言葉の仕分け＝あとでもう一度）。
--                       version は決め方の版（api/_bookFields.js の BOOK_FIELDS_VERSION）。古い版・0（直してほしいの声が多い）は決め直す。
--   book_field_votes  … 利用者が自動の分野を選び直したときの声（だれかは残さない・本と分野と +1/-1 だけ）。
--                       同じ本で、残っている分野に -1 が 3 つたまったら、その本の分野を決め直す（version を 0 に）。
--   book_field_ai_daily … 1 日に AI で決める本の数（env BOOK_FIELDS_DAILY_LIMIT・既定 2000）を数える。
-- 書き手・読み手はサーバー（/api/cover?fields=1・service_role）だけ。RLS 有効・ポリシー無し＝アプリから直接は読めない。
-- 利用者のメモ・個人の情報は入らない（本の公開の書誌から決めた分野だけ）。
-- 未適用でも壊れない: サーバーはその場で決めて返すだけ（覚えない・AI は 1 日の上限を数えられないので呼ばない）。
-- 冪等（何度流しても同じ）。Supabase の SQL Editor に貼って実行する。

create table if not exists public.book_field_cache (
  book_key text primary key,
  isbn text,
  fields text[] not null default '{}',
  source text not null default 'keywords',
  genre_ids text[] not null default '{}',
  model text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'book_field_cache_source_check') then
    alter table public.book_field_cache add constraint book_field_cache_source_check check (source in ('genre', 'ai', 'keywords'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'book_field_cache_fields_check') then
    alter table public.book_field_cache add constraint book_field_cache_fields_check check (cardinality(fields) between 1 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'book_field_cache_key_check') then
    alter table public.book_field_cache add constraint book_field_cache_key_check check (char_length(book_key) between 3 and 120);
  end if;
end $$;

create index if not exists book_field_cache_isbn_idx on public.book_field_cache (isbn);

alter table public.book_field_cache enable row level security;

create table if not exists public.book_field_votes (
  id bigserial primary key,
  book_key text not null,
  field text not null,
  delta smallint not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'book_field_votes_delta_check') then
    alter table public.book_field_votes add constraint book_field_votes_delta_check check (delta in (-1, 1));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'book_field_votes_field_check') then
    alter table public.book_field_votes add constraint book_field_votes_field_check check (char_length(field) between 1 and 30);
  end if;
end $$;

create index if not exists book_field_votes_key_idx on public.book_field_votes (book_key, created_at desc);

alter table public.book_field_votes enable row level security;

create table if not exists public.book_field_ai_daily (
  day date primary key,
  calls integer not null default 0
);

alter table public.book_field_ai_daily enable row level security;

-- 1 日の上限の内側なら +1 して新しい回数を、届いていれば -1 を返す（同時に呼ばれても超えない・1 文の UPDATE）。
create or replace function public.reserve_book_field_ai(p_day date, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls integer;
begin
  insert into public.book_field_ai_daily as d (day, calls) values (p_day, 1)
  on conflict (day) do update set calls = d.calls + 1 where d.calls < p_limit
  returning calls into v_calls;
  return coalesce(v_calls, -1);
end;
$$;

revoke all on function public.reserve_book_field_ai(date, integer) from public;
grant execute on function public.reserve_book_field_ai(date, integer) to service_role;
