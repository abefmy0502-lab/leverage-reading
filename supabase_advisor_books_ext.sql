-- 📚➕ AI 選書の推薦を一段上げる：外部の書評データと本の難しさ（2026-11-17 オーナー「外部のデータをうまく使い高レベルな判断が
--    できるようにしたい」「読書初心者に難しい本を進めても微妙だし。そこも調整できるようにしたい」）。
--
-- 何を:
--   1. advisor_book_ext … 書評サイト（いまは bookvinegar）が出している、本ごとの推薦の事実（推薦ポイント・推薦者の名前と肩書き・
--      その書評サイトのテーマ）と要約の文（オーナー裁定で文ごと持つ・推薦の AI の参考にだけ使う・アプリの画面には出さない）。
--      書くのはサーバー（MCP の ops_books の ext・scripts/bookvinegar-sync.mjs が送る）。
--   2. advisor_books に 難しさ difficulty（0＝まだ・1 入門・2 中級・3 上級）・前提知識 prereq・出版社の分類コード c_code（openBD の
--      Cコード）・ページ数 pages。整えるとき（api/_advisorBooks.js の summarizeStep）に AI が紹介文・書評の要約・分類コード・
--      ページ数から決める。
--   3. search_advisor_books を作り直す … p_level（この人の読書の慣れ 1〜3・0＝見ない）で難しさの離れた本を下げ、推薦ポイントの
--      多い本を少し上げる。推薦の AI の材料として、難しさ・前提知識・推薦ポイント・推薦者（5 人まで）・書評の要約（500 字まで）も返す。
-- RLS: advisor_book_ext は有効・ポリシーなし（service_role と下の関数だけ）。
-- 先に supabase_advisor_books.sql。何度流しても壊れない（冪等）。

create table if not exists public.advisor_book_ext (
  isbn        text primary key check (isbn ~ '^97[89][0-9]{10}$'),
  source      text not null default 'bookvinegar' check (char_length(source) <= 40),
  url         text not null default '' check (char_length(url) <= 300),
  rec_points  integer check (rec_points is null or rec_points between 0 and 1000),
  endorsers   jsonb not null default '[]'::jsonb check (jsonb_typeof(endorsers) = 'array' and pg_column_size(endorsers) < 8192),
  tags        text[] not null default '{}',
  summary     text not null default '' check (char_length(summary) <= 4000),
  fetched_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.advisor_book_ext enable row level security;

alter table public.advisor_books add column if not exists difficulty smallint not null default 0;
alter table public.advisor_books add column if not exists prereq text not null default '';
alter table public.advisor_books add column if not exists c_code text not null default '';
alter table public.advisor_books add column if not exists pages integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'advisor_books_difficulty_chk') then
    alter table public.advisor_books add constraint advisor_books_difficulty_chk check (difficulty between 0 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'advisor_books_prereq_chk') then
    alter table public.advisor_books add constraint advisor_books_prereq_chk check (char_length(prereq) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'advisor_books_c_code_chk') then
    alter table public.advisor_books add constraint advisor_books_c_code_chk check (char_length(c_code) <= 8);
  end if;
end $$;

-- 前の形（引数 3 つ・返す列が少ない）を消してから作り直す（返す列が変わると create or replace できないため）。
drop function if exists public.search_advisor_books(text[], text[], integer);
drop function if exists public.search_advisor_books(text[], text[], integer, smallint);

-- AI 選書の候補を引く（ログインした人・出版社の紹介文は返さない）。
--   言葉ごとに: 探す言葉に含まれる 4 点・書名 3 点・こんな悩みの人に 2 点・概要と学べること 1 点。
--   言葉が 1 つも当たらない本は出さない。当たった本は、推薦ポイント（20 まで）を 4 で割った点を足し、
--   p_level（1〜3）があれば難しさの差 × 3 点を引く（難しさがまだの本は引かない）。点の高い順 → 運営が選んだ本 → 売上順。
create or replace function public.search_advisor_books(p_terms text[], p_exclude text[] default '{}', p_limit integer default 16, p_level smallint default 0)
returns table (
  isbn text, title text, subtitle text, author text, publisher text, pub_date text, cover text,
  summary text, points text[], for_whom text[], reason text, fields text[], level text, score integer,
  difficulty smallint, prereq text, rec_points integer, endorsers text[], ext_summary text
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select distinct replace(replace(replace(lower(btrim(x)), '\', '\\'), '%', '\%'), '_', '\_') as term
    from unnest(coalesce(p_terms, '{}')) as x
    where char_length(btrim(x)) between 2 and 20
    limit 6
  ),
  scored as (
    select b.*,
      (select coalesce(sum(
          (case when exists (select 1 from unnest(b.keywords) k where lower(k) like '%' || t.term || '%') then 4 else 0 end)
        + (case when lower(b.title || ' ' || b.subtitle) like '%' || t.term || '%' then 3 else 0 end)
        + (case when lower(array_to_string(b.for_whom, ' ')) like '%' || t.term || '%' then 2 else 0 end)
        + (case when lower(b.summary || ' ' || array_to_string(b.points, ' ')) like '%' || t.term || '%' then 1 else 0 end)
      ), 0) from t)::integer as base
    from public.advisor_books b
    where b.status = 'ready'
      and not (b.isbn = any (coalesce(p_exclude, '{}')))
  ),
  joined as (
    select s.*, e.rec_points as e_points, e.endorsers as e_endorsers, e.summary as e_summary,
      (s.base
        + (least(coalesce(e.rec_points, 0), 20) / 4)
        - (case when coalesce(p_level, 0) between 1 and 3 and s.difficulty between 1 and 3
                then abs(s.difficulty - p_level) * 3 else 0 end))::integer as adj
    from scored s
    left join public.advisor_book_ext e on e.isbn = s.isbn
    where s.base > 0
  )
  select j.isbn, j.title, j.subtitle, j.author, j.publisher, j.pub_date, j.cover,
         j.summary, j.points, j.for_whom, j.reason, j.fields, j.level, j.adj as score,
         j.difficulty, j.prereq, j.e_points as rec_points,
         coalesce((select array_agg(x->>'name') from (select x from jsonb_array_elements(coalesce(j.e_endorsers, '[]'::jsonb)) as x limit 5) y), '{}') as endorsers,
         left(coalesce(j.e_summary, ''), 500) as ext_summary
  from joined j
  order by j.adj desc, j.curated desc, j.sales_rank asc nulls last, j.review_count desc
  limit least(greatest(coalesce(p_limit, 16), 1), 40);
$$;

revoke all on function public.search_advisor_books(text[], text[], integer, smallint) from public;
grant execute on function public.search_advisor_books(text[], text[], integer, smallint) to authenticated, service_role;
