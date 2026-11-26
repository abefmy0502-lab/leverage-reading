-- 📈🏆 AI 選書の推薦の理由を厚くする：売れ方の時系列と、賞・年間ベストの印（2026-11-18 オーナー「3 の 2 つを進めて」・
--    company/research/reports/ビジネス書 データ源 連携の可能性.md の案 A・B）。
--
-- 何を:
--   1. advisor_book_ranks … 楽天ブックスの売上順の一覧（分野・言葉・出版社）で、その本が何位だったかを日付つきで残す。
--      他人のランキングの写しではなく、毎日の Cron（api/_advisorBooks.js の collectStep）が見た順位の自前の記録。
--      3 年より古い記録は refresh_advisor_book_trends が消す。
--   2. advisor_books に 売れ方 trend（'' ／ 'new'＝出て 1 年以内で、いま分野の売上順 100 位以内 ／
--      'steady'＝出て 3 年以上たっても、いま分野の売上順 100 位以内）・ranked_weeks（直近 1 年に分野の 100 位以内に入った週の数）・
--      first_ranked_on（はじめて記録した日）。refresh_advisor_book_trends が決める（毎日の Cron の最後）。
--   3. advisor_book_marks … 賞・年間ベスト・選出の印（事実だけ: 出典・年・部門や順位・URL）。書くのは運営（MCP の ops_books の mark）。
--      ISBN が分からない本は「書名 / 著者」で入れ、同じ本を待ち行列（advisor_books_queue）が楽天の書誌で確かめたあと
--      link_advisor_book_marks が ISBN を付ける。主催者の選評・紹介の文章は持たない。
--   4. search_advisor_books を作り直す … 印の数（2 つまで）× 2 点を足し、売れ方と印（新しい年の順・同じ年は入れた順に 3 つまで）も返す。
--      （supabase_advisor_books_ext.sql から移した。2 か所に置くと、後から流した方の形に戻ってしまうため）
-- RLS: 表は有効・ポリシーなし（service_role と下の関数だけ）。
-- 先に supabase_advisor_books.sql と supabase_advisor_books_ext.sql。何度流しても壊れない（冪等）。

-- 1. 売上順の記録
create table if not exists public.advisor_book_ranks (
  isbn        text not null check (isbn ~ '^97[89][0-9]{10}$'),
  list        text not null check (char_length(list) between 1 and 60),
  observed_on date not null,
  rank        integer not null check (rank between 1 and 10000),
  primary key (isbn, list, observed_on)
);
create index if not exists advisor_book_ranks_observed_idx on public.advisor_book_ranks (observed_on);
alter table public.advisor_book_ranks enable row level security;

-- 2. 売れ方
alter table public.advisor_books add column if not exists trend text not null default '';
alter table public.advisor_books add column if not exists ranked_weeks integer not null default 0;
alter table public.advisor_books add column if not exists first_ranked_on date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'advisor_books_trend_chk') then
    alter table public.advisor_books add constraint advisor_books_trend_chk check (trend in ('', 'new', 'steady'));
  end if;
end $$;

-- 3. 賞・年間ベストの印
create table if not exists public.advisor_book_marks (
  id          bigserial primary key,
  given_isbn  text check (given_isbn is null or given_isbn ~ '^97[89][0-9]{10}$'),
  title       text not null default '' check (char_length(title) <= 300),
  author      text not null default '' check (char_length(author) <= 200),
  isbn        text check (isbn is null or isbn ~ '^97[89][0-9]{10}$'),
  kind        text not null default 'award' check (kind in ('award', 'annual', 'selection')),
  source      text not null check (char_length(source) between 1 and 60),
  year        smallint not null check (year between 1950 and 2100),
  label       text not null default '' check (char_length(label) <= 40),
  url         text not null default '' check (char_length(url) <= 300),
  created_at  timestamptz not null default now(),
  -- 待ち行列（advisor_books_queue.dedupe_key）と同じ作り方＝同じ本の行どうしで突き合わせられる
  book_key    text generated always as (coalesce(given_isbn, '') || '|' || lower(title) || '|' || lower(author)) stored,
  check (given_isbn is not null or char_length(title) >= 1)
);
create unique index if not exists advisor_book_marks_key on public.advisor_book_marks (book_key, source, year, label);
create index if not exists advisor_book_marks_isbn_idx on public.advisor_book_marks (isbn);
alter table public.advisor_book_marks enable row level security;

-- 書名で入れた印に、待ち行列が確かめた ISBN を付ける（毎日の Cron と ops_books の process が呼ぶ）。付けた数を返す。
create or replace function public.link_advisor_book_marks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.advisor_book_marks m
     set isbn = q.result_isbn
    from public.advisor_books_queue q
   where m.isbn is null
     and q.status = 'done'
     and q.result_isbn is not null
     and q.dedupe_key = m.book_key;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.link_advisor_book_marks() from public;
grant execute on function public.link_advisor_book_marks() to service_role;
-- Supabase は public スキーマの新しい関数に anon・authenticated の実行権を名前で付けるので、明示して外す（2026-11-26 点検）。
revoke all on function public.link_advisor_book_marks() from anon;
revoke all on function public.link_advisor_book_marks() from authenticated;

-- 売れ方を決め直す（毎日の Cron の最後）。変えた本の数を返す。
--   「いま」＝直近 21 日に分野の売上順（list が genre: で始まる一覧）の 100 位以内で見た。
--   new＝出版が直近 1 年・steady＝出版の年が 3 年以上前。どちらでもなければ ''。
create or replace function public.refresh_advisor_book_trends()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  delete from public.advisor_book_ranks where observed_on < today - 1100;
  with r as (
    select isbn,
      count(distinct date_trunc('week', observed_on)) filter (where observed_on >= today - 365) as weeks,
      min(observed_on) as first_on,
      bool_or(observed_on >= today - 21) as recent
    from public.advisor_book_ranks
    where list like 'genre:%' and rank <= 100
    group by isbn
  ),
  calc as (
    select b.isbn,
      coalesce(r.weeks, 0)::integer as weeks,
      r.first_on,
      case
        when coalesce(r.recent, false) and b.pub_date ~ '^[0-9]{4}' and left(b.pub_date, 4)::integer <= extract(year from today)::integer - 3 then 'steady'
        when coalesce(r.recent, false) and b.pub_date ~ '^[0-9]{4}-[0-9]{2}' and left(b.pub_date, 7) >= to_char(today - 365, 'YYYY-MM') then 'new'
        else ''
      end as trend
    from public.advisor_books b
    left join r on r.isbn = b.isbn
  )
  update public.advisor_books b
     set trend = c.trend, ranked_weeks = c.weeks, first_ranked_on = c.first_on
    from calc c
   where c.isbn = b.isbn
     and (b.trend is distinct from c.trend or b.ranked_weeks is distinct from c.weeks or b.first_ranked_on is distinct from c.first_on);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.refresh_advisor_book_trends() from public;
grant execute on function public.refresh_advisor_book_trends() to service_role;
-- Supabase は public スキーマの新しい関数に anon・authenticated の実行権を名前で付けるので、明示して外す（2026-11-26 点検）。
revoke all on function public.refresh_advisor_book_trends() from anon;
revoke all on function public.refresh_advisor_book_trends() from authenticated;

-- 4. AI 選書の候補を引く（ログインした人・出版社の紹介文は返さない）。
--   言葉ごとに: 探す言葉に含まれる 4 点・書名 3 点・こんな悩みの人に 2 点・概要と学べること 1 点。
--   言葉が 1 つも当たらない本は出さない。当たった本は、推薦ポイント（20 まで）を 4 で割った点と、賞・年間ベストの印の数（2 つまで）× 2 点を足し、
--   p_level（1〜3）があれば難しさの差 × 3 点を引く（難しさがまだの本は引かない）。点の高い順 → 運営が選んだ本 → 売上順。
--   返す列が前の形と違うので、消してから作る。
drop function if exists public.search_advisor_books(text[], text[], integer);
drop function if exists public.search_advisor_books(text[], text[], integer, smallint);
create or replace function public.search_advisor_books(p_terms text[], p_exclude text[] default '{}', p_limit integer default 16, p_level smallint default 0)
returns table (
  isbn text, title text, subtitle text, author text, publisher text, pub_date text, cover text,
  summary text, points text[], for_whom text[], reason text, fields text[], level text, score integer,
  difficulty smallint, prereq text, rec_points integer, endorsers text[], ext_summary text,
  trend text, marks text[]
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
      (select array_agg(m.lbl order by m.year desc, m.id asc)
         from (select mk.id, mk.year, btrim(mk.source || ' ' || mk.year || ' ' || mk.label) as lbl
                 from public.advisor_book_marks mk where mk.isbn = s.isbn
                 order by mk.year desc, mk.id asc limit 3) m) as m_labels,
      (select count(distinct (mk.source, mk.year)) from public.advisor_book_marks mk where mk.isbn = s.isbn) as m_count
    from scored s
    left join public.advisor_book_ext e on e.isbn = s.isbn
    where s.base > 0
  ),
  adjusted as (
    select j.*,
      (j.base
        + (least(coalesce(j.e_points, 0), 20) / 4)
        + (least(j.m_count, 2) * 2)
        - (case when coalesce(p_level, 0) between 1 and 3 and j.difficulty between 1 and 3
                then abs(j.difficulty - p_level) * 3 else 0 end))::integer as adj
    from joined j
  )
  select a.isbn, a.title, a.subtitle, a.author, a.publisher, a.pub_date, a.cover,
         a.summary, a.points, a.for_whom, a.reason, a.fields, a.level, a.adj as score,
         a.difficulty, a.prereq, a.e_points as rec_points,
         coalesce((select array_agg(x->>'name') from (select x from jsonb_array_elements(coalesce(a.e_endorsers, '[]'::jsonb)) as x limit 5) y), '{}') as endorsers,
         left(coalesce(a.e_summary, ''), 500) as ext_summary,
         a.trend,
         coalesce(a.m_labels, '{}') as marks
  from adjusted a
  order by a.adj desc, a.curated desc, a.sales_rank asc nulls last, a.review_count desc
  limit least(greatest(coalesce(p_limit, 16), 1), 40);
$$;

revoke all on function public.search_advisor_books(text[], text[], integer, smallint) from public;
grant execute on function public.search_advisor_books(text[], text[], integer, smallint) to authenticated, service_role;
