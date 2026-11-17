-- 📚 AI 選書の推薦用の本のデータ（2026-11-17 オーナー「推薦できる本を徹底的に集めて、概要やおすすめする理由をデータとして整えて」
--    「1 週間に 1 回くらい新しい本のデータを出していきたい」）。
--
-- 何を: 楽天ブックスの売上順（分野ごと・言葉ごと）から集めた実在の本と、出版社の紹介文だけを材料に AI（Gemini Flash-Lite）が
--   書いた「概要・学べること・こんな悩みの人に・おすすめする理由・探す言葉・分野・段階」。
-- 誰が書く: サーバー（api/_advisorBooks.js・毎日の Cron＝api/keepalive.js が少しずつ・全部集めたら 7 日ごとに集め直す）。
-- 誰が読む: AI 選書（アプリ）が search_advisor_books で候補を引く（紹介文そのものは返さない）。運営は MCP の ops_books。
-- RLS: 有効・ポリシーなし＝表を直接は読めない（service_role と下の関数だけ）。
-- 何度流しても壊れない（冪等）。

create table if not exists public.advisor_books (
  isbn          text primary key check (isbn ~ '^97[89][0-9]{10}$'),
  title         text not null check (char_length(title) between 1 and 300),
  subtitle      text not null default '' check (char_length(subtitle) <= 300),
  author        text not null default '' check (char_length(author) <= 300),
  publisher     text not null default '' check (char_length(publisher) <= 100),
  pub_date      text not null default '' check (char_length(pub_date) <= 20),
  cover         text not null default '' check (char_length(cover) <= 500),
  genre_ids     text[] not null default '{}',
  sales_rank    integer,
  review_count  integer not null default 0,
  review_avg    numeric(3, 2),
  -- 出版社の紹介文（AI の材料・アプリには返さない・800 字まで）
  description   text not null default '' check (char_length(description) <= 1200),
  -- AI が書いたもの
  summary       text not null default '' check (char_length(summary) <= 300),
  points        text[] not null default '{}',
  for_whom      text[] not null default '{}',
  reason        text not null default '' check (char_length(reason) <= 200),
  keywords      text[] not null default '{}',
  fields        text[] not null default '{}',
  level         text not null default '' check (level in ('', '入門', '実践', '深掘り', '物語')),
  status        text not null default 'pending' check (status in ('pending', 'ready', 'thin', 'failed', 'hidden')),
  attempts      integer not null default 0,
  model         text not null default '',
  prompt_version integer not null default 0,
  source        text not null default '' check (char_length(source) <= 60),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  summarized_at timestamptz,
  updated_at    timestamptz not null default now()
);

create index if not exists advisor_books_status_rank_idx on public.advisor_books (status, sales_rank);
create index if not exists advisor_books_first_seen_idx on public.advisor_books (first_seen_at desc);
create index if not exists advisor_books_keywords_gin on public.advisor_books using gin (keywords);

alter table public.advisor_books enable row level security;

-- 集め方の進み具合（1 行だけ）。
create table if not exists public.advisor_books_state (
  id              integer primary key default 1 check (id = 1),
  plan_version    integer not null default 0,
  cursor          integer not null default 0,
  pass_started_at timestamptz,
  pass_done_at    timestamptz,
  last_run_at     timestamptz,
  last_result     jsonb not null default '{}'::jsonb check (pg_column_size(last_result) < 8192)
);
alter table public.advisor_books_state enable row level security;
insert into public.advisor_books_state (id) values (1) on conflict (id) do nothing;

-- 運営が選んで足す本（MCP の ops_books の add・2026-11-17）。書名か ISBN の一覧をここに入れ、毎晩の処理（api/_advisorBooks.js の
--   queueStep）が楽天の書誌で確かめてから advisor_books に足す（curated=true）。見つからない本は notfound。
alter table public.advisor_books add column if not exists curated boolean not null default false;

create table if not exists public.advisor_books_queue (
  id           bigserial primary key,
  isbn         text check (isbn is null or isbn ~ '^97[89][0-9]{10}$'),
  title        text not null default '' check (char_length(title) <= 300),
  author       text not null default '' check (char_length(author) <= 200),
  note         text not null default '' check (char_length(note) <= 60),
  status       text not null default 'queued' check (status in ('queued', 'done', 'notfound', 'failed')),
  attempts     integer not null default 0,
  result_isbn  text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  -- 同じ本を二重に入れない（ISBN、無ければ書名＋著者・MCP は on conflict (dedupe_key) do nothing で入れる）
  dedupe_key   text generated always as (coalesce(isbn, '') || '|' || lower(title) || '|' || lower(author)) stored,
  check (isbn is not null or char_length(title) >= 1)
);
create unique index if not exists advisor_books_queue_key on public.advisor_books_queue (dedupe_key);
create index if not exists advisor_books_queue_status_idx on public.advisor_books_queue (status, id);
alter table public.advisor_books_queue enable row level security;

-- AI 選書の候補を引く関数 search_advisor_books は supabase_advisor_books_ext.sql にある（2026-11-17 に難しさ・推薦者を足して移した。
--   ここで前の形を作ると、新しい形と 2 つ並んで呼び分けられなくなるため）。

