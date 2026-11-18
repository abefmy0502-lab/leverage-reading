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
--   3. （2026-11-18 に supabase_advisor_books_signals.sql へ移した）search_advisor_books を作り直す … p_level（この人の読書の慣れ 1〜3・0＝見ない）で難しさの離れた本を下げ、推薦ポイントの
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

-- AI 選書の候補を引く関数 search_advisor_books は supabase_advisor_books_signals.sql にある（2026-11-18 に売れ方と賞・年間ベストの印を
--   足して移した。ここにも置くと、後から流した方の形に戻ってしまうため）。
