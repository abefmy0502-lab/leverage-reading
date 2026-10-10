-- ============================================================
-- Orime: Supabase に流す SQL をすべて、流す順に 1 本にまとめたもの（自動で作る・手で直さない）
-- 作り方: node scripts/sql-bundle.mjs ／ 手順と注意: docs/sql-runbook.md
-- 何度流しても壊れない（前に流したものが混ざっていてもよい）。
-- Supabase → SQL Editor に全部貼って Run。途中で失敗したら、そこまでの変更も入らない。
-- ============================================================

-- ############################################################
-- 01. supabase_books_isbn.sql — 本の ISBN・ASIN
-- ############################################################
-- Adds ISBN / ASIN columns to books so Amazon Associate links can route
-- straight to the product page instead of a title search.
--
-- ISBN comes from the search pipeline (NDL / openBD / Google Books) and is
-- captured on save. ASIN is reserved for future manual entry — Amazon
-- doesn't expose it via a free API, so for now it stays nullable.

alter table public.books
  add column if not exists isbn text,
  add column if not exists asin text;

-- Helpful index for any future "find duplicate by ISBN" check. Filtered
-- so only rows with a non-empty ISBN are indexed.
create index if not exists books_isbn_idx
  on public.books (isbn)
  where isbn is not null and isbn <> '';


-- ############################################################
-- 02. supabase_added_via.sql — 本の追加のしかた＋表紙の置き場
-- ############################################################
-- supabase_added_via.sql
--
-- Two related changes for the search-first add flow:
--   1. books.added_via column — distinguishes 'search' (Google Books / openBD
--      result) from 'manual' so AI features can adjust prompts accordingly.
--   2. book-covers public Storage bucket — holds cover images uploaded by
--      users when they pick the manual entry path. Public bucket so the URL
--      can be saved straight into books.cover and rendered without signing.
--
-- Run this in the Supabase SQL Editor once. Idempotent — safe to re-run.

-- ============================================================
-- 1. added_via column
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS added_via text DEFAULT 'search';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_added_via_check'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_added_via_check
      CHECK (added_via IN ('search', 'manual'));
  END IF;
END $$;

-- Backfill any pre-existing rows so they default to 'search'.
UPDATE public.books SET added_via = 'search' WHERE added_via IS NULL;


-- ============================================================
-- 2. book-covers public Storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload into their own user-id-prefixed folder.
-- (Public read is implicit because the bucket is public; no SELECT policy needed.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'book_covers_user_insert'
  ) THEN
    CREATE POLICY book_covers_user_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'book-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'book_covers_user_delete'
  ) THEN
    CREATE POLICY book_covers_user_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'book-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'book_covers_user_update'
  ) THEN
    CREATE POLICY book_covers_user_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'book-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;


-- ############################################################
-- 03. supabase_book_covers_bucket.sql — 表紙の置き場の権限
-- ############################################################
-- 📷 book-covers バケット + RLS — 手動アップロードした表紙を public で配信。
-- 既に supabase_added_via.sql で同じ bucket は作成済みのため、この SQL は
-- idempotent (= 重複実行しても安全)。policy のみ更新したい時にも使える。

insert into storage.buckets (id, name, public)
values ('book-covers', 'book-covers', true)
on conflict (id) do nothing;

drop policy if exists "book_covers_insert_own" on storage.objects;
create policy "book_covers_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'book-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "book_covers_update_own" on storage.objects;
create policy "book_covers_update_own" on storage.objects
  for update using (
    bucket_id = 'book-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "book_covers_delete_own" on storage.objects;
create policy "book_covers_delete_own" on storage.objects
  for delete using (
    bucket_id = 'book-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 読み取りは public バケットのため select policy は不要。


-- ############################################################
-- 04. supabase_books_cover_isbn.sql — 表紙を取った ISBN
-- ############################################################
-- 表紙取得時に「どの ISBN（エディション）で画像が見つかったか」を記録
-- する任意カラム。書誌情報の主 ISBN (books.isbn) が表紙不在で、別エ
-- ディション ISBN で表紙が取れた時に、トレースとして保存する。
--
-- 任意カラム — クライアント側 (useBooks.js) は cover_isbn が無くても
-- 動くように schema-error fallback を実装している。

alter table public.books
  add column if not exists cover_isbn text;

create index if not exists books_cover_isbn_idx
  on public.books (cover_isbn)
  where cover_isbn is not null and cover_isbn <> '';


-- ############################################################
-- 05. supabase_normalize_urls.sql — 表紙の http を https に
-- ############################################################
-- =============================================================================
-- 🔒 Mixed Content 解消 — 既存データの URL 正規化
-- =============================================================================
-- このファイルは Supabase の SQL Editor で 1 回実行してください。
-- 既存の本データに http:// で保存された表紙画像があれば、すべて https:// に
-- 一括書き換えします。新規保存分はクライアント側で常に https:// 化されるため、
-- このマイグレーションは「過去データを掃除する」用途です。
--
-- 実行前後の確認:
--   SELECT count(*) FROM public.books WHERE cover LIKE 'http://%';
-- =============================================================================

UPDATE public.books
SET cover = REPLACE(cover, 'http://', 'https://')
WHERE cover LIKE 'http://%';

-- 完了確認 (0 件であれば OK):
-- SELECT id, title, cover FROM public.books WHERE cover LIKE 'http://%';


-- ############################################################
-- 06. supabase_books_source_query.sql — AI 選書の相談を本に引き継ぐ
-- ############################################################
-- 🔁 AI 選書 → セットアップシート引き継ぎ用カラム
--
-- AI 選書アドバイザーで入力したユーザーの課題（例: "営業成績を上げたい"）を
-- そのまま「読書前」の投資目的にプレフィルできるよう、本テーブルに紐づけて保存する。
--
-- - source_query: AI 選書で本を提案させた際にユーザーが入力した最後のメッセージ。
--   セットアップシート側 (invest_purpose) が空なら、UI で source_query を初期値として表示する。
-- - クライアントは schema-error fallback で対応しているので、このマイグレーションが
--   未適用の DB でも壊れない (列なしモードで保存される)。新機能を使いたい場合のみ実行。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS source_query text;

COMMENT ON COLUMN public.books.source_query IS
  'AI 選書アドバイザーで本を提案させた際の元クエリ。セットアップシートの投資目的に引き継ぐ。';


-- ############################################################
-- 07. supabase_books_setup_fields.sql — 課題・仮説・選書理由
-- ############################################################
-- 🤖 AI 選書 → セットアップシート構造化引き継ぎ
--
-- AI 選書アドバイザーとの会話を構造化要約し、本を追加した瞬間に投資目的だけでなく
-- 「現在の課題」「仮説」「AI の選書理由」までセットアップシートにプレフィルできる
-- ようカラムを追加する。
--
-- - current_challenge: 今直面している具体的な課題（編集可）
-- - hypothesis:        この本を読むことで生まれる変化の仮説（編集可）
-- - book_reason:       AI 選書アドバイザーがこの本を選んだ理由（読み取り専用 / 履歴）
--
-- クライアントは schema-error fallback を備えているので、未適用の DB でも保存は
-- 失敗しない（該当列を payload から落として再試行）。新機能を有効にしたい場合のみ実行。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS current_challenge text,
  ADD COLUMN IF NOT EXISTS hypothesis        text,
  ADD COLUMN IF NOT EXISTS book_reason       text;

COMMENT ON COLUMN public.books.current_challenge IS '今直面している具体的な課題（AI 選書要約からプレフィル / ユーザー編集可）';
COMMENT ON COLUMN public.books.hypothesis        IS 'この本を読むことで生まれる変化の仮説（AI 選書要約からプレフィル / ユーザー編集可）';
COMMENT ON COLUMN public.books.book_reason       IS 'AI 選書アドバイザーがこの本を選んだ理由（読み取り専用、履歴として保持）';


-- ############################################################
-- 08. supabase_books_reading_progress.sql — ページ数（裏で使う）
-- ############################################################
-- 📖 読書進捗（現在ページ / 総ページ）用カラム
--
-- 「読書中」の本に、現在ページ・総ページから控えめな進捗バーを出すための列。
-- 反ゲーミフィケーション方針のため、目標・ノルマ・連続記録などは持たせない。
-- 単純に「今どのあたりを読んでいるか」を視覚化するだけの 2 列。
--
-- - current_page: 現在読んでいるページ（任意。null / 0 で未設定扱い）
-- - total_pages : 本の総ページ数（任意。null / 0 だと進捗バーは非表示）
-- - クライアントは schema-error fallback で対応しているので、このマイグレーションが
--   未適用の DB でも壊れない（この 2 列を落として保存・読込が継続する）。
--   進捗バー機能を使いたい場合のみ実行する。
-- - books の RLS は既存のまま（列追加のみ。ポリシー変更なし）。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS current_page integer;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS total_pages integer;

COMMENT ON COLUMN public.books.current_page IS
  '読書中の本の現在ページ（任意。total_pages と合わせて進捗バーを描画）。';
COMMENT ON COLUMN public.books.total_pages IS
  '本の総ページ数（任意。未設定 / 0 なら進捗バーは非表示）。';


-- ############################################################
-- 09. supabase_books_brief.sql — この本で学べること
-- ############################################################
-- 📖 この本で学べること（2026-10-08）
--
-- 読みたい・積読の本の詳細の「この本について」から作る、AI の短いまとめ（概要・学べること・仮説の例）を本に保存する。
-- 材料は出版社・書店が公開している紹介文と目次だけ（src/lib/bookBrief.js・purpose 'book_brief'）。
-- 一度作ったら開くたびに AI を呼ばない（作り直しは押したときだけ）。
--
-- - ai_brief: 決まった 3 つの見出し（## 概要 / ## 学べること / ## 仮説の例）の Markdown。600 字ほど（上限 2,000 字）
--
-- RLS: books の既存のポリシー（自分の行だけ・supabase_security_hardening.sql）がそのまま効く。新しいポリシーは要らない。
-- クライアントは未適用でも壊れない: 書き込みが「列が無い」で失敗したら端末（localStorage）に控えて見せる
-- （src/hooks/useBooks.js の saveBookBrief）。本の保存（saveBook）はこの列を書かないので、ほかの保存は影響を受けない。
-- 冪等（何度流しても同じ）。

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS ai_brief text;

COMMENT ON COLUMN public.books.ai_brief IS 'この本で学べること（公開の紹介文と目次から AI が作った概要・学べること・仮説の例。Markdown）';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'books_ai_brief_len'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_ai_brief_len CHECK (ai_brief IS NULL OR char_length(ai_brief) <= 2000);
  END IF;
END $$;


-- ############################################################
-- 10. supabase_book_collections.sql — 本棚のフォルダ
-- ############################################################
-- 🗂 フォルダ分け（コレクション）— 本を自由なグループに整理する任意機能。
-- 構造は book_tags と同型（本に対する複数ラベル）。1 本が複数フォルダに所属可。
-- クライアント（useBooks.js）は book_collections 未作成でも staged schema-error
-- fallback で本の保存・読込が壊れないため、適用は任意・後追いで OK。
-- Supabase SQL Editor にコピペで実行する想定（冪等）。

create table if not exists public.book_collections (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  collection_name text not null,
  created_at    timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.book_collections ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.book_collections ADD COLUMN IF NOT EXISTS book_id uuid references public.books(id) on delete cascade;
ALTER TABLE public.book_collections ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;
ALTER TABLE public.book_collections ADD COLUMN IF NOT EXISTS collection_name text;
ALTER TABLE public.book_collections ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

-- 同じ本に同じフォルダ名を二重登録しない。
create unique index if not exists book_collections_unique
  on public.book_collections (book_id, collection_name);
create index if not exists book_collections_book_idx on public.book_collections (book_id);
create index if not exists book_collections_user_idx on public.book_collections (user_id);

alter table public.book_collections enable row level security;

-- 自分の行のみ全操作可（auth.uid() = user_id）。
drop policy if exists "book_collections_select_own" on public.book_collections;
create policy "book_collections_select_own" on public.book_collections
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "book_collections_insert_own" on public.book_collections;
create policy "book_collections_insert_own" on public.book_collections
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "book_collections_update_own" on public.book_collections;
create policy "book_collections_update_own" on public.book_collections
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "book_collections_delete_own" on public.book_collections;
create policy "book_collections_delete_own" on public.book_collections
  for delete to authenticated using (auth.uid() = user_id);


-- ############################################################
-- 11. supabase_chat_messages.sql — 相談の会話
-- ############################################################
-- =============================================================================
-- 🧠 マイ読書脳 — Supabase migration
-- =============================================================================
-- このファイルは Supabase の SQL Editor にコピペして 1 回実行してください。
-- (該当ユーザー側の作業 — Vercel デプロイには影響しません)
--
-- 変更点:
--   1. chat_messages テーブルを新規作成（マイ読書脳の対話履歴を保存）
--   2. book_memos.book_id を nullable に変更（学びログ = 本に紐づかないメモ用）
--   3. book_memos.source_type 列を追加（'book' | 'personal'）
--
-- 既存データはすべて source_type='book' になり、影響ありません。
-- =============================================================================

-- ----- 1. chat_messages テーブル -----------------------------------------
-- "references" は SQL の予約語のため、コラム名は refs にしています。
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  refs        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS role text CHECK (role IN ('user', 'assistant'));
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS refs jsonb;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx
  ON public.chat_messages(user_id, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
      AND policyname = 'chat_messages_select_own'
  ) THEN
    CREATE POLICY "chat_messages_select_own" ON public.chat_messages
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
      AND policyname = 'chat_messages_insert_own'
  ) THEN
    CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
      AND policyname = 'chat_messages_delete_own'
  ) THEN
    CREATE POLICY "chat_messages_delete_own" ON public.chat_messages
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- ----- 2. book_memos: book_id を nullable に -----------------------------
ALTER TABLE public.book_memos
  ALTER COLUMN book_id DROP NOT NULL;

-- ----- 3. book_memos.source_type を追加 ----------------------------------
ALTER TABLE public.book_memos
  ADD COLUMN IF NOT EXISTS source_type text
  DEFAULT 'book'
  CHECK (source_type IN ('book', 'personal'));

-- 整合性: 'book' なら book_id は必須、'personal' なら book_id は NULL であるべき。
-- 既存データはすべて book_id を持つので 'book' のままで問題ありません。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'book_memos_source_book_id_check'
  ) THEN
    ALTER TABLE public.book_memos
      ADD CONSTRAINT book_memos_source_book_id_check
      CHECK (
        (source_type = 'book' AND book_id IS NOT NULL)
        OR (source_type = 'personal' AND book_id IS NULL)
      );
  END IF;
END
$$;

-- =============================================================================
-- 確認:
--   SELECT * FROM public.chat_messages LIMIT 1;
--   SELECT column_name, is_nullable, data_type FROM information_schema.columns
--     WHERE table_name = 'book_memos' AND column_name IN ('book_id', 'source_type');
-- =============================================================================


-- ############################################################
-- 12. supabase_recall_memory.sql — 思い出しカードの間隔
-- ############################################################
-- 🔄 想起（recall）の間隔反復（spaced repetition）用カラム
--
-- 狙い:
--   Orime の看板価値は「読んだ本のメモを"忘れた頃"に呼び戻す」こと。従来の
--   pickRecallMemo は記憶モデルの無いシード付き純ランダムだったため、忘却曲線に
--   沿った再想起（Readwise / Glasp 的な spaced repetition）ができていなかった。
--   本マイグレーションで book_memos に「いつ最後に想起したか」「何回定着したか」を
--   持たせ、SM-2 lite の間隔スケジュール（1,3,7,16,35,70,140 日）で due 判定できるようにする。
--
-- 列の意味:
--   - last_recalled_at: 最後に想起カードで見せた / フィードバックした時刻。
--                       null = まだ一度も想起していないメモ（＝作成からの経過で due 判定）。
--   - recall_count    : 「覚えた」で +1 される定着回数。間隔スケジュールの index に使う
--                       （count が大きいほど次の想起までの間隔が伸びる）。
--
-- 未適用でも壊れない:
--   クライアント（src/lib/recall.js を使う Review.jsx / HomeRecall.jsx）と
--   サーバー（api/push-cron.js）は schema-error fallback で、この 2 列が無い DB では
--   last_recalled_at=undefined / recall_count=undefined を null / 0 として扱う。
--   つまり本ファイル未適用でも「作成経過ベースの想起」は従来どおり動く。間隔反復の
--   再想起スケジュールを有効化したい場合のみ、この SQL を実行する。
--
-- 流儀: supabase_books_reading_progress.sql / supabase_actions_full.sql と同じく
--       ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS で冪等。
--       books / book_memos の RLS は既存のまま（列追加のみ・ポリシー変更なし）。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    Vercel デプロイでは自動実行されない。

ALTER TABLE public.book_memos
  ADD COLUMN IF NOT EXISTS last_recalled_at timestamptz;

ALTER TABLE public.book_memos
  ADD COLUMN IF NOT EXISTS recall_count integer NOT NULL DEFAULT 0;

-- 想起の due 判定は user_id で絞って last_recalled_at を見るため、複合 index を張る。
CREATE INDEX IF NOT EXISTS book_memos_recall_idx
  ON public.book_memos (user_id, last_recalled_at);

COMMENT ON COLUMN public.book_memos.last_recalled_at IS
  '最後に想起カードで見せた / フィードバックした時刻。null=未想起（作成経過で due 判定）。';
COMMENT ON COLUMN public.book_memos.recall_count IS
  '定着回数（「覚えた」で +1）。SM-2 lite の間隔スケジュール index に使う。';


-- ############################################################
-- 13. supabase_core_indexes.sql — 本・メモの読み込みを速く
-- ############################################################
-- ⚡ コアテーブル（books / book_memos）のインデックス補強。
--
-- この 2 テーブルは元の CREATE TABLE がリポジトリ内に無く（RLS 定義のみが
-- supabase_security_hardening.sql に版管理下として存在）、支持インデックスが
-- 実際にあるかどうかコードからは確認できない。ほぼ全ての画面・AI 機能
-- （本棚一覧 / メモ一覧 / 🔄振り返り / 🧠マイ読書脳・📊テーマレポートの RAG
-- コンテキスト取得 gatherKnowledge 等）がこの 2 テーブルへの
-- `user_id` 絞り込み + created_at/updated_at ソート、または `book_id` 絞り込み
-- に依存しているため、インデックス欠落があれば全リクエストの遅延に直結する。
-- CREATE INDEX IF NOT EXISTS なので、既に存在する場合は no-op（副作用なし）。
-- Supabase SQL Editor にコピペで実行。

create index if not exists book_memos_user_created_idx
  on public.book_memos (user_id, created_at desc);

create index if not exists book_memos_book_id_idx
  on public.book_memos (book_id);

create index if not exists books_user_updated_idx
  on public.books (user_id, updated_at desc);


-- ############################################################
-- 14. supabase_advisor_sessions.sql — 過去の AI 選書
-- ############################################################
-- 🕒 AI 選書アドバイザーの会話履歴
--
-- ユーザーと AI の会話を 1 セッション = 1 行で永続化する。最初のメッセージ送信時に
-- 行を作り、以降のターンごとに UPDATE で messages を上書きしていく。本棚に追加した
-- 本の id は added_book_ids にプッシュ。
--
-- - messages          : Claude API 形式 [{ role, content }]
-- - recommended_books : AI 提案カードの配列 (parsed RECOMMENDATIONS_END JSON のまま)
-- - added_book_ids    : 本棚に「読みたい」追加した本の UUID 配列

-- updated_at の自動更新ヘルパー (まだ無ければ作る、あれば置換)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public.advisor_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages          jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_books jsonb NOT NULL DEFAULT '[]'::jsonb,
  added_book_ids    uuid[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.advisor_sessions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.advisor_sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.advisor_sessions ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.advisor_sessions ADD COLUMN IF NOT EXISTS recommended_books jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.advisor_sessions ADD COLUMN IF NOT EXISTS added_book_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.advisor_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.advisor_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS advisor_sessions_user_idx
  ON public.advisor_sessions(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_advisor_sessions_updated_at ON public.advisor_sessions;
CREATE TRIGGER trg_advisor_sessions_updated_at
  BEFORE UPDATE ON public.advisor_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.advisor_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advisor_sessions_select_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_select_own" ON public.advisor_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "advisor_sessions_insert_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_insert_own" ON public.advisor_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "advisor_sessions_update_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_update_own" ON public.advisor_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "advisor_sessions_delete_own" ON public.advisor_sessions;
CREATE POLICY "advisor_sessions_delete_own" ON public.advisor_sessions
  FOR DELETE USING (auth.uid() = user_id);


-- ############################################################
-- 15. supabase_theme_reports.sql — （廃止した機能の保存先・書き出し用に残す）
-- ############################################################
-- 📊 テーマレポート（Theme Report）の保存先。
--
-- ユーザーが特定テーマ（例: 営業）について生成した統合レポートを保存し、
-- AI タブ →「📊 テーマレポート」→「🕒 履歴」から見返せるようにする。
--
-- 任意マイグレーション: 未適用でも機能は動く（生成・コピーはその場で可能、
-- 履歴の保存/表示だけが無効になる）。クライアントの ai.js
-- saveThemeReport / loadThemeReports / deleteThemeReport は schema-error 時に
-- graceful degradation する（保存は no-op、履歴は availability:false で非表示）。
--
-- Supabase の SQL Editor にコピペで実行する想定。

create table if not exists public.theme_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  theme         text not null,
  content       text not null,
  generated_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.theme_reports ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.theme_reports ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;
ALTER TABLE public.theme_reports ADD COLUMN IF NOT EXISTS theme text;
ALTER TABLE public.theme_reports ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.theme_reports ADD COLUMN IF NOT EXISTS generated_at timestamptz not null default now();
ALTER TABLE public.theme_reports ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- 履歴一覧（新しい順）用のインデックス。
create index if not exists theme_reports_user_idx
  on public.theme_reports(user_id, generated_at desc);

-- Row Level Security: 自分の行だけ読み書きできる。
alter table public.theme_reports enable row level security;

-- 冪等性のため既存ポリシーを drop してから作り直す。
drop policy if exists "theme_reports_select_own" on public.theme_reports;
drop policy if exists "theme_reports_insert_own" on public.theme_reports;
drop policy if exists "theme_reports_update_own" on public.theme_reports;
drop policy if exists "theme_reports_delete_own" on public.theme_reports;

create policy "theme_reports_select_own" on public.theme_reports
  for select using (auth.uid() = user_id);

create policy "theme_reports_insert_own" on public.theme_reports
  for insert with check (auth.uid() = user_id);

create policy "theme_reports_update_own" on public.theme_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "theme_reports_delete_own" on public.theme_reports
  for delete using (auth.uid() = user_id);


-- ############################################################
-- 16. supabase_reading_sessions.sql — 読む（集中モード）の読書の時間
-- ############################################################
-- ⏱ 読書の時間（集中モード・2026-10-09 オーナー「時間を決めて読書する」）
--
-- 集中モード（タイマー／計測）でおわったときに 1 回分を 1 行残す。画面に出すのは
-- 「今日この本を何分読んだか」と「この本で これまで何分」だけ（連続日数・目標・順位は作らない）。
-- 書き手はアプリ（src/lib/readingSessions.js・本人の行だけ・RLS）。
-- 未適用でも壊れない: 表が無いエラーなら端末の localStorage（orime.readingSessions.v1）に控える（ほかの端末には出ない）。
-- 本を消すと、その本の行も消える（ON DELETE CASCADE）。退会・データの初期化はアプリが本人の行を消す。データの書き出しの対象。
-- 冪等（何度流しても同じ）。Supabase の SQL Editor に貼って実行する。

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  seconds integer not null,
  mode text not null,
  created_at timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS book_id uuid references public.books(id) on delete cascade;
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS seconds integer;
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS mode text;
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

-- 値の決まり（制約名で冪等に足す）。1 回は 6 時間まで（アプリも 6 時間で止める）。
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reading_sessions_seconds_check') then
    alter table public.reading_sessions add constraint reading_sessions_seconds_check check (seconds >= 0 and seconds <= 21600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reading_sessions_mode_check') then
    alter table public.reading_sessions add constraint reading_sessions_mode_check check (mode in ('timer', 'count'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reading_sessions_range_check') then
    alter table public.reading_sessions add constraint reading_sessions_range_check check (ended_at >= started_at);
  end if;
end $$;

-- 一覧（本人の新しい順）と、本ごとの合計。
create index if not exists reading_sessions_user_started_idx on public.reading_sessions (user_id, started_at desc);
create index if not exists reading_sessions_book_idx on public.reading_sessions (book_id);

-- RLS: 本人の行だけ。書くときは、その本も本人のものであること。
alter table public.reading_sessions enable row level security;

drop policy if exists "reading_sessions_select_own" on public.reading_sessions;
create policy "reading_sessions_select_own" on public.reading_sessions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "reading_sessions_insert_own" on public.reading_sessions;
create policy "reading_sessions_insert_own" on public.reading_sessions
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
  );

drop policy if exists "reading_sessions_update_own" on public.reading_sessions;
-- 書き換えても、ほかの人の本につけ替えられない（insert と同じ確かめ・2026-10-10）。
create policy "reading_sessions_update_own" on public.reading_sessions
  for update to authenticated using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
  );

drop policy if exists "reading_sessions_delete_own" on public.reading_sessions;
create policy "reading_sessions_delete_own" on public.reading_sessions
  for delete to authenticated using (auth.uid() = user_id);


-- ############################################################
-- 17. supabase_actions_full.sql — 行動の期限・繰り返し・ふりかえり
-- ############################################################
-- 🎯 行動タブをフル機能のタスク管理に進化させる
--
-- 既存の actions テーブルに「優先度・繰り返し・ソース引用・振り返り・完了日時」を追加。
-- クライアントは schema-error fallback を備えるので、未適用 DB でも保存は失敗しない
-- (該当列を payload から落として再試行)。
--
-- - priority      : 'high' / 'medium' / 'low'。デフォルト 'medium'。チェック制約あり
-- - recurrence    : 'weekly' / 'monthly' / NULL。NULL = 繰り返さない
-- - source_page   : 引用元のページ番号（任意）
-- - source_memo_id: 引用元のメモ ID（任意、book_memos との外部キー）
-- - reflection    : 完了後の「やってみてどうだったか」テキスト
-- - completed_at  : 完了日時。週次/月次の達成率計算に使う
-- - notify_at     : 次回通知予定（将来の PWA Push 対応用、現時点では予約のみ）

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS priority       text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS recurrence     text,
  ADD COLUMN IF NOT EXISTS source_memo_id uuid,
  ADD COLUMN IF NOT EXISTS source_page    integer,
  ADD COLUMN IF NOT EXISTS reflection     text,
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS notify_at      timestamptz;

-- CHECK 制約は ALTER TABLE で重複 ADD ができないので NOT VALID で安全に追加。
-- 既存行は priority/recurrence が NULL or 'medium' なので問題なし。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'actions'
      AND constraint_name = 'actions_priority_check'
  ) THEN
    ALTER TABLE public.actions
      ADD CONSTRAINT actions_priority_check
      CHECK (priority IN ('high','medium','low'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'actions'
      AND constraint_name = 'actions_recurrence_check'
  ) THEN
    ALTER TABLE public.actions
      ADD CONSTRAINT actions_recurrence_check
      CHECK (recurrence IN ('weekly','monthly') OR recurrence IS NULL);
  END IF;
END $$;

-- 期限フィルタ・ソート用 index (未完了のみ)
CREATE INDEX IF NOT EXISTS actions_user_deadline_idx
  ON public.actions(user_id, deadline)
  WHERE done = false;

-- 優先度ソート用 index
CREATE INDEX IF NOT EXISTS actions_user_priority_idx
  ON public.actions(user_id, priority);

-- 完了率計算用 index
CREATE INDEX IF NOT EXISTS actions_completed_at_idx
  ON public.actions(user_id, completed_at DESC)
  WHERE done = true;

-- source_memo_id は book_memos に紐づくが、メモが先に消えても行動は残したい
-- ので ON DELETE SET NULL の外部キーを追加 (任意、列があるだけでも動作可)。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'actions'
      AND constraint_name = 'actions_source_memo_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.actions
        ADD CONSTRAINT actions_source_memo_fkey
        FOREIGN KEY (source_memo_id) REFERENCES public.book_memos(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      -- book_memos が無い環境などでは黙ってスキップ。
      RAISE NOTICE 'actions_source_memo_fkey: skipped (%) ', SQLERRM;
    END;
  END IF;
END $$;


-- ############################################################
-- 18. supabase_actions_id_default.sql — 行動の id
-- ############################################################
-- 🩹 actions.id に gen_random_uuid() の DEFAULT が設定されていない環境で、
-- INSERT 時に「null value in column "id" of relation "actions" violates
-- not-null constraint」が発生するのを防ぐ。
--
-- 本来 actions テーブル作成時に DEFAULT を入れていたつもりが入っていない
-- 環境があるため、idempotent な ALTER で安全に補填する。
--
-- クライアント側 (useBooks.js) でも crypto.randomUUID() を使って事前に
-- UUID を生成するようにしているので、この SQL は二重防衛。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'actions'
      AND column_name = 'id'
      AND (column_default IS NULL OR column_default NOT LIKE '%gen_random_uuid%')
  ) THEN
    ALTER TABLE public.actions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    RAISE NOTICE 'actions.id default set to gen_random_uuid()';
  ELSE
    RAISE NOTICE 'actions.id already has gen_random_uuid() default';
  END IF;
END $$;


-- ############################################################
-- 19. supabase_actions_completed_at_backfill.sql — 昔の完了日を埋める
-- ############################################################
-- 行動 (actions) の completed_at バックフィル。
--
-- 背景:
--   supabase_actions_full.sql で `completed_at timestamptz` を追加する以前、
--   完了タスクは `done = true` のみでフラグ管理されていた。後から完了
--   タイムスタンプ列を追加したため、レガシー行は `done = true` /
--   `completed_at = NULL` という不整合が残っている。
--
-- 症状:
--   useAllActions の期間別統計 (今週 / 今月) は
--     `a.done && inRange(a.completedAt, periodStart, periodEnd)`
--   で count するため、completedAt が NULL の完了タスクは「いつ完了
--   したか分からない」扱いになり期間統計に含まれない → ユーザーから
--   見ると「完了済み表示なのに 0%」になる。
--
-- 修正:
--   `done = true AND completed_at IS NULL` のレガシー行に対して
--   updated_at (なければ created_at) を completed_at として埋める。
--
-- 確認:
--   SELECT count(*) FROM public.actions
--    WHERE done = true AND completed_at IS NULL;
--
-- 実行:
UPDATE public.actions
   SET completed_at = COALESCE(updated_at, created_at, now())
 WHERE done = true
   AND completed_at IS NULL;

-- 念のためクリーンアップ後の確認:
--   SELECT count(*) FROM public.actions
--    WHERE done = true AND completed_at IS NULL;
--   → 0 になっていれば成功。


-- ############################################################
-- 20. supabase_actions_scheduled.sql — 繰り返しの次回分
-- ############################################################
-- 行動 (actions) の繰り返しタスク無限生成バグ対策。
--
-- 旧挙動: 完了するたびに次回分を「即座に visible なタスクとして」生成し
--         てしまうので、ユーザーが何週間先まで先取り完了でき、母数が
--         無限に膨張して達成率が下がり続ける。
-- 新挙動: 次回分は scheduled_for (= 表示開始日時) を持って INSERT する。
--         クライアントは scheduled_for が未来の行を非表示にする。これに
--         よって「先取り完了」が物理的にできなくなる。
--
-- (a) actions テーブルに scheduled_for 列を追加
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

-- 表示開始日が未来の未完了行を高速に弾くための部分インデックス
CREATE INDEX IF NOT EXISTS actions_user_scheduled_idx
  ON public.actions(user_id, scheduled_for)
  WHERE done = false;

COMMENT ON COLUMN public.actions.scheduled_for IS
  'タスクを表示開始する日時。これより前は隠す(繰り返しタスクの先取り防止)';

-- (b) 既存の暴走タスクをクリーンアップ。
-- 旧バージョンで作られた「未来の繰り返しタスク」を一掃する。
-- 削除前に確認したい場合は下の SELECT を先に実行 (DELETE はコメントアウト
-- を外して実行)。
--
-- 確認:
--   SELECT id, text, deadline, recurrence, created_at
--     FROM public.actions
--    WHERE recurrence IS NOT NULL
--      AND done = false
--      AND deadline > current_date
--    ORDER BY deadline;
--
-- 削除（2026-10-10 にコメントアウト: 今のアプリは次回分を「未来の期限＋scheduled_for」で作るので、
-- 流し直すと正しい次回分まで消してしまう。旧バージョンの暴走タスクを消したいときだけ、確認してから手で流す）:
--   DELETE FROM public.actions
--    WHERE recurrence IS NOT NULL
--      AND done = false
--      AND deadline > current_date
--      AND scheduled_for IS NULL
--      AND created_at < (current_date - interval '1 day');


-- ############################################################
-- 21. supabase_push_subscriptions.sql — 通知の登録
-- ############################################################
-- 🔔 Web Push 購読情報 + 通知設定（想起プッシュ通知）。
--
-- RLS: 本人は自分の購読を SELECT/INSERT/UPDATE/DELETE 可（自分でオン/オフできる）。
--      送信は api/push-cron.js が service_role で全件読む（RLS バイパス・追加ポリシー不要）。
-- 流儀: supabase_advisor_sessions.sql / supabase_ai_usage.sql と同じ。冪等（DROP POLICY IF EXISTS）。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    Vercel デプロイでは自動実行されない（元帥の環境作業）。

-- updated_at の自動更新ヘルパー（既にあれば置換。advisor_sessions と共有）。
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint       text        NOT NULL,                  -- プッシュサービスの一意 URL
  p256dh         text        NOT NULL,                  -- subscription.keys.p256dh
  auth           text        NOT NULL,                  -- subscription.keys.auth
  -- 通知設定（思想ガード: 低頻度デフォルト）
  enabled        boolean     NOT NULL DEFAULT true,
  frequency      text        NOT NULL DEFAULT 'weekly', -- 'off' | 'weekly' | 'twice_weekly'
  preferred_hour smallint    NOT NULL DEFAULT 8,        -- 0-23, ユーザーのローカル目安
  tz_offset_min  smallint    NOT NULL DEFAULT 540,      -- 端末の -getTimezoneOffset()（JST=+540）
  last_sent_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)                            -- 同一端末の重複登録防止 + upsert キー
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS endpoint text;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS p256dh text;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS auth text;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'weekly';
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS preferred_hour smallint NOT NULL DEFAULT 8;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS tz_offset_min smallint NOT NULL DEFAULT 540;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_id_endpoint_bundle_uq ON public.push_subscriptions (user_id, endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_enabled_idx
  ON public.push_subscriptions (enabled) WHERE enabled = true;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 本人は自分の行を全操作可（クライアントから直接 upsert / オフ設定できる）。
DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_update_own" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
-- 送信側（api/push-cron）は service_role で全行読むため追加ポリシー不要。


-- ############################################################
-- 22. supabase_push_native.sql — iPhone の通知
-- ############################################################
-- 🔔📱 想起プッシュ通知の「ネイティブ(iOS/APNs)対応」列追加。
--
-- 背景:
--   supabase_push_subscriptions.sql は Web Push(VAPID)前提で、endpoint/p256dh/auth を
--   NOT NULL で持つ。App Store 配信(Capacitor)では Web Push が WKWebView で動かないため、
--   ネイティブは APNs(Apple Push Notification service)で送る。ネイティブ端末は
--   endpoint/p256dh/auth を持たず、代わりに「APNs デバイストークン」を持つ。
--   1 テーブルで web(VAPID) と ios(APNs) を併存させるための最小拡張。
--
-- 追加/変更:
--   - platform text NOT NULL DEFAULT 'web'  … 'web'(VAPID) | 'ios'(APNs)
--   - apns_token text                       … iOS のデバイストークン（platform='ios' 行のみ）
--   - p256dh / auth を NULL 許容に           … ネイティブ行は Web Push 鍵を持たない
--   （ネイティブ行は endpoint='apns:<token>' として UNIQUE(user_id,endpoint) を満たす。
--     クライアント src/lib/nativePush.js が upsert する。）
--
-- 流儀: ADD COLUMN IF NOT EXISTS / DROP NOT NULL は冪等。RLS/ポリシーは
--       supabase_push_subscriptions.sql のまま（本人が自分の行を全操作可）で不変。
--       送信側(api/push-cron.js)は service_role で platform/apns_token も読む。
--
-- ⚠️ Supabase SQL Editor にコピペで 1 回実行する想定。先に
--    supabase_push_subscriptions.sql を適用済みであること。

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS apns_token text;

-- ネイティブ(APNs)行は Web Push 鍵を持たないので NULL を許容する。
ALTER TABLE public.push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN auth   DROP NOT NULL;

-- 配信 Cron は platform で送信経路(VAPID / APNs)を分けるため index を張る。
CREATE INDEX IF NOT EXISTS push_subscriptions_platform_idx
  ON public.push_subscriptions (platform) WHERE enabled = true;


-- ############################################################
-- 23. supabase_push_deadline.sql — 行動の期限の通知
-- ############################################################
-- 🎯🔔 行動の期限の通知（2026-09-29 オーナー裁定）— 1 日 1 回のガード列。
--
-- 背景:
--   api/push-cron.js は、思い出しの通知（多くても週に 1 回）に加えて、期限の日の朝に
--   「今日が期限の行動」を 1 回だけ知らせる（複数は 1 通にまとめる）。
--   思い出しの通知のガード（last_sent_at・6.5 日）とは別に、期限の通知を「その端末のローカルの
--   今日」もう送ったかを覚える列が要る（同じ列を使うと、期限の通知を送った日から 1 週間
--   思い出しの通知が止まってしまう。逆も同じ）。
--
-- 追加:
--   - push_subscriptions.last_deadline_sent_on date … 期限の通知を最後に送った日（端末のローカル日付・tz_offset_min）。
--     Cron は送る前に `update … set last_deadline_sent_on = 今日 where (null or < 今日)` で今日の分を取り、
--     取れたときだけ送る（Cron の多重発火・再実行でも二重に送らない）。一時的な失敗は元の値に戻す。
--
-- 未適用の DB: api/push-cron.js は列が無いことを検知して、期限の通知だけ送らない
--   （思い出しの通知はそのまま・fail-safe）。
-- RLS: 変更なし（supabase_push_subscriptions.sql のまま。本人が自分の行を全操作可・Cron は service_role）。
-- 先に supabase_push_subscriptions.sql（と iOS なら supabase_push_native.sql）を適用しておくこと。
-- 冪等: 何度実行しても安全。

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_deadline_sent_on date;

-- Cron が期限の行動を読むときの絞り込み（未完了・期限あり）は supabase_actions_full.sql の
-- actions_user_deadline_idx (user_id, deadline) WHERE done = false を使う。無い環境向けに同じものを冪等に張る。
CREATE INDEX IF NOT EXISTS actions_user_deadline_idx
  ON public.actions (user_id, deadline)
  WHERE done = false;


-- ############################################################
-- 24. supabase_subscriptions.sql — 契約
-- ############################################################
-- 💳 Stripe サブスクリプション状態テーブル
--
-- 用途:
-- - 全機能有料（フリーミアム無し・無料トライアル無し）の課金モデルにおける
--   entitlement 判定の真実の源。月額 ¥1,000（税込・内税）1 プランのみ。
-- - 1 ユーザー = 1 行（user_id を PRIMARY KEY にする）。Stripe Webhook が
--   service_role キーで upsert / update する。クライアントは SELECT のみ。
--
-- 設計方針:
-- - SELECT は本人のみ（auth.uid() = user_id）。自分の課金状態は読めるが、
--   他人の行は見えない。
-- - INSERT / UPDATE / DELETE のポリシーは「敢えて作らない」。
--   → 一般ユーザー（anon / authenticated ロール）は書き込み不可。
--   → Webhook は service_role キーを使うため RLS をバイパスして書ける。
--     service_role キーはサーバー専用環境変数（SUPABASE_SERVICE_ROLE_KEY）で
--     のみ使用し、絶対にクライアントへ露出しないこと。
-- - status は Stripe の subscription.status をそのまま保持
--   （active / past_due / canceled / unpaid / incomplete など）。
--   entitlement は基本 status = 'active' のみ許可（useSubscription.js 参照）。
--   past_due を猶予として許可したくなった場合はこのテーブルではなく
--   クライアント / サーバーの判定側を拡張する（列の意味は変えない）。

-- updated_at の自動更新ヘルパー（まだ無ければ作る、あれば置換）。
-- 既存の他マイグレーション（supabase_advisor_sessions.sql 等）と共用。
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text,
  price_id               text,
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS price_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Webhook は customer / subscription id から行を引くことがあるので index を張る。
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx
  ON public.subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_subscription_idx
  ON public.subscriptions (stripe_subscription_id);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の課金状態のみ閲覧可。
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT / UPDATE / DELETE: 一切ポリシーを作らない。
-- → 一般ユーザーは書き込めない（課金状態の改ざん防止）。
-- → 書き込みは Stripe Webhook (api/stripe-webhook.js) が service_role キーで
--   RLS をバイパスして行う。

-- CLAUDE.md「SQL マイグレーション」表への追記候補:
-- | `supabase_subscriptions.sql` | 💳 Stripe 課金 — `subscriptions` テーブル新規（user_id PK / status / current_period_end 等）。SELECT は本人のみ、書き込みは Webhook の service_role 経由。entitlement は status='active' で判定 |


-- ############################################################
-- 25. supabase_subscriptions_provider.sql — App Store の契約
-- ############################################################
-- 💳 subscriptions に決済プロバイダ（Stripe / RevenueCat）を識別する列を追加
--
-- 用途:
-- - App 決済（IAP / RevenueCat）と Web 決済（Stripe）を 1 テーブルで併存させる。
--   どちらの経路で得た entitlement かを記録できるようにする。
-- - entitlement 判定（useSubscription.js の isActive = status==='active'）は無改修。
--   status の語彙は両プロバイダで揃えてある（active / canceled / past_due 等）。
--
-- 設計方針:
-- - すべて idempotent（ADD COLUMN IF NOT EXISTS）。既存の subscriptions テーブル
--   （supabase_subscriptions.sql）に後付けで安全に当てられる。
-- - 既存の `stripe_*` 列は NULL 許容のまま温存する。RevenueCat 経由の行では
--   stripe_customer_id / stripe_subscription_id は NULL のまま、provider='revenuecat'
--   / rc_app_user_id / store に値が入る。Stripe 経由は従来どおり。
--
-- 追加する列:
-- - provider        : 'stripe' | 'revenuecat'（どの決済経路で得た行か）
-- - rc_app_user_id  : RevenueCat の app_user_id（= Supabase user.id を logIn で揃える前提）
-- - store           : 'app_store' | 'play_store' | 'stripe' 等（IAP のストア種別）

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider       text,
  ADD COLUMN IF NOT EXISTS rc_app_user_id text,
  ADD COLUMN IF NOT EXISTS store          text;

-- RevenueCat の Webhook が app_user_id から行を引くことがあるので index を張る。
CREATE INDEX IF NOT EXISTS subscriptions_rc_app_user_idx
  ON public.subscriptions (rc_app_user_id);

-- CLAUDE.md「SQL マイグレーション」表への追記候補:
-- | `supabase_subscriptions_provider.sql` | 💳 App 決済（IAP / RevenueCat）対応 — `subscriptions` に `provider` / `rc_app_user_id` / `store` 列を idempotent 追加。Stripe（Web）と RevenueCat（IAP）を 1 テーブルで併存。`stripe_*` 列は NULL 許容のまま温存。entitlement は status='active' で無改修流用 |


-- ############################################################
-- 26. supabase_subscriptions_provider_backfill.sql — 昔の契約の種類を埋める
-- ############################################################
-- 💳 subscriptions.provider のバックフィル（冪等・1 回実行）
--
-- 背景: api/stripe-webhook.js が provider='stripe' を書き始める前に作られた
-- Stripe 行は provider が NULL のまま。revenuecat-webhook.js の「Stripe active
-- 保護ガード」はコード側で stripe_subscription_id による後方互換判定を持つが、
-- データも正しておくと将来の集計・判定が単純になる。
--
-- 依存: supabase_subscriptions.sql → supabase_subscriptions_provider.sql の後に実行。
update public.subscriptions
   set provider = 'stripe'
 where provider is null
   and stripe_subscription_id is not null;


-- ############################################################
-- 27. supabase_subscriptions_canceled_at.sql — 解約した日
-- ############################################################
-- 💳 解約時刻の記録 — チャーン率（月次解約÷月初active）の正確な算出に必須。
-- これまで status='canceled' への遷移時刻が残らず、「いつ解約したか」を後から
-- 復元できなかった（current_period_end は満了予定であって解約操作の時刻ではない）。
-- 書くのは api/stripe-webhook.js / api/revenuecat-webhook.js（service_role）のみ。
-- 未適用でも両 webhook は schema-error fallback で canceled_at 抜きで保存する。冪等。

alter table public.subscriptions
  add column if not exists canceled_at timestamptz;

comment on column public.subscriptions.canceled_at is
  'status が canceled に遷移した時刻（webhook が记録）。チャーン率の月次集計用';


-- ############################################################
-- 28. supabase_stripe_events.sql — Web の決済の二重処理を防ぐ
-- ############################################################
-- 💳 Stripe Webhook の冪等化（M1 是正）。
-- Stripe は at-least-once 配信＝同じイベントが複数回／順序前後で届く。冪等性が
-- 無いと、古い invoice.payment_failed が後から再配信されて課金 active を past_due
-- に倒す等の事故が起きうる。処理済み event.id を記録し、二度目以降はスキップする。
--
-- 書き込みは Webhook（service_role）のみ。RLS 有効＋ポリシー無し＝クライアント
-- からは一切不可。未適用でも api/stripe-webhook.js は fail-open で従来どおり処理
-- するので壊れない。Supabase SQL Editor にコピペで実行（冪等）。

create table if not exists public.stripe_events (
  event_id   text primary key,
  type       text,
  created_at timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

alter table public.stripe_events enable row level security;
-- ポリシー無し＝ authenticated/anon は不可。service_role のみ（RLS バイパス）が書く。

-- 任意: 90 日より古い記録は不要（容量管理）。定期実行する場合のサンプル。
-- delete from public.stripe_events where created_at < now() - interval '90 days';


-- ############################################################
-- 29. supabase_revenuecat_events.sql — App Store の決済の二重処理を防ぐ
-- ############################################################
-- 💳 RevenueCat Webhook の冪等化（stripe_events と同一パターン）。
-- RevenueCat も at-least-once 配信＝同じイベントが複数回届きうる。TRANSFER
-- イベントは処理自体が「旧アカウントを canceled に書き換えてから、その行を
-- 読んで新アカウントへ引き継ぐ」構造のため、再送されると 1 回目の書き込み結果
-- を 2 回目が読んでしまい、引き継ぎ判定が狂う（有効な購読者が誤って canceled
-- になりうる）。処理済み event.id を記録し、二度目以降はスキップする。
--
-- 書き込みは Webhook（service_role）のみ。RLS 有効＋ポリシー無し＝クライアント
-- からは一切不可。未適用でも api/revenuecat-webhook.js は fail-open で従来どおり
-- 処理するので壊れない（ただし TRANSFER の再送耐性は未適用の間は無い）。
-- Supabase SQL Editor にコピペで実行（冪等）。

create table if not exists public.revenuecat_events (
  event_id   text primary key,
  type       text,
  created_at timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.revenuecat_events ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE public.revenuecat_events ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.revenuecat_events ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

alter table public.revenuecat_events enable row level security;
-- ポリシー無し＝ authenticated/anon は不可。service_role のみ（RLS バイパス）が書く。

-- 任意: 90 日より古い記録は不要（容量管理）。定期実行する場合のサンプル。
-- delete from public.revenuecat_events where created_at < now() - interval '90 days';


-- ############################################################
-- 30. supabase_subscription_events.sql — 契約の履歴（7 日間無料 → 有料）
-- ############################################################
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
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS provider text check (provider in ('revenuecat', 'stripe', 'backfill'));
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS source_event_id text;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS period_type text check (period_type is null or period_type in ('trial', 'intro', 'normal'));
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS store text;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS environment text;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS is_trial_conversion boolean;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS event_at timestamptz not null default now();
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

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
-- いま無料期間中の人（period_type が trial。'intro' は有料の初回価格＝創業メンバー価格で無料期間ではない）は、行を作った時刻（≒無料期間を始めた時刻）を
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


-- ############################################################
-- 31. supabase_ai_usage.sql — AI の利用回数
-- ############################################################
-- 🤖 AI 利用量メータリング（KGI 原価ガード）
--
-- 用途:
-- - Claude API のコストを「月次の累積上限」で守るためのカウンタテーブル。
--   現状 api/claude.js はメモリ内 10 回/分のレート制限しか無く、月次の累積
--   上限が無いため、1 ユーザーがマイ読書脳等を連打すると Claude API コストが
--   青天井になる。経理算定の AI 原価ガードレールは ≤45 円/人・月（黒字化の
--   前提）、ハード床は 234 円/人・月。
-- - このテーブルは「暴走（連打）を止めるランナウェイガード」の真実の源。
--   通常利用を妨げない寛容な月次上限（api/claude.js の AI_MONTHLY_CALL_LIMIT）の
--   判定に使う。ローンチ後に実データで上限を調整する前提。
--
-- 設計方針:
-- - 1 ユーザー × 1 月 = 1 行（PK は (user_id, period_month)）。period_month は
--   'YYYY-MM'（UTC 基準の当月文字列）。月をまたぐと別行になり、自動でリセット
--   される（過去の行は監査用に残す）。
-- - SELECT は本人のみ（auth.uid() = user_id）。自分の利用量は読めるが他人の
--   行は見えない。
-- - INSERT / UPDATE / DELETE のポリシーは「敢えて作らない」。
--   → 一般ユーザー（anon / authenticated ロール）は書き込み不可。
--     カウンタをクライアントから改ざんできない（サーバー権威）。
--   → 書き込みは api/claude.js が service_role キーで RLS をバイパスして行う。
--     service_role キーはサーバー専用環境変数（SUPABASE_SERVICE_ROLE_KEY）で
--     のみ使用し、絶対にクライアントへ露出しないこと。
-- - 堅牢性最優先: api/claude.js 側は fail-open（usage 取得/加算がエラー or
--   このテーブル未適用なら、ブロックせず通す）。このテーブルが無くても AI は
--   止まらない（schema-fallback）。
--
-- idempotent: 何度実行しても安全。

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month text        NOT NULL,                 -- 'YYYY-MM'（UTC 当月）
  calls        integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_month)
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS period_month text;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS calls integer NOT NULL DEFAULT 0;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 当月分の絞り込みを速くする（period_month 単位の集計・掃除に使う）。
CREATE INDEX IF NOT EXISTS ai_usage_period_idx
  ON public.ai_usage (period_month);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の利用量のみ閲覧可。
DROP POLICY IF EXISTS "ai_usage_select_own" ON public.ai_usage;
CREATE POLICY "ai_usage_select_own" ON public.ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT / UPDATE / DELETE: 一切ポリシーを作らない。
-- → 一般ユーザーは書き込めない（利用量カウンタの改ざん防止）。
-- → 書き込みは api/claude.js が service_role キーで RLS をバイパスして行う。

-- 原子的なインクリメント用 RPC（service_role が呼ぶ）。
-- upsert を 1 文で原子的に行い、同時実行でもカウントが取りこぼされない。
-- SECURITY DEFINER で RLS をバイパスするが、関数の実行権限は service_role のみ
-- に絞る（下の REVOKE / GRANT）。クライアント（anon / authenticated）からは
-- 呼べないので、SELECT ポリシーと合わせて「読めるが書けない」を担保する。
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id uuid,
  p_period_month text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ai_usage (user_id, period_month, calls, updated_at)
  VALUES (p_user_id, p_period_month, 1, now())
  ON CONFLICT (user_id, period_month)
  DO UPDATE SET calls = public.ai_usage.calls + 1,
                updated_at = now()
  RETURNING calls;
$$;

-- 実行権限を絞る: 一般ロールからは呼べないようにする。
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text) TO service_role;

-- CLAUDE.md「SQL マイグレーション」表への追記候補:
-- | `supabase_ai_usage.sql` | 🤖 AI 利用量メータリング（KGI 原価ガード）— `ai_usage(user_id, period_month 'YYYY-MM', calls)` 新規 + 原子的 increment RPC。SELECT は本人のみ、書き込みは api/claude.js の service_role 経由（増分は `increment_ai_usage` RPC）。月次の累積上限（`AI_MONTHLY_CALL_LIMIT`、既定 120）超過で 429。fail-open / schema-fallback（未適用でも AI は止まらない） |


-- ############################################################
-- 32. supabase_ai_usage_atomic.sql — AI の上限を同時に超えない
-- ############################################################
-- 🧮 AI 月次利用上限の「原子的な予約（check-and-increment）」RPC。
--
-- 背景（M 是正）:
--   api/claude.js は従来 checkMonthlyUsage(読み) → 上限判定 → 後で
--   incrementMonthlyUsage(加算) の 2 段構えだった。並行リクエストが同じ
--   pre-increment 値を読んで全て通過し、実効上限を超過しうる TOCTOU があった
--   （per-minute レート制限が overrun を抑えるため実害は小さいが、原価ガードとしては緩い）。
--
-- 本 RPC は「上限未満のときだけ +1 して新カウントを返す」を単一 UPDATE で原子的に行う。
--   - 上限に達していれば加算せず -1 を返す（= 拒否。カウントは水増ししない）。
--   - 初回（行なし）は INSERT で calls=1 を作り 1 を返す。
--   同一 (user, month) 行は行ロックで直列化されるため、並行でも超過しない。
--
-- 流儀: supabase_ai_usage.sql（ai_usage テーブル + increment_ai_usage）に乗る。
--   先に supabase_ai_usage.sql を適用済みであること。SECURITY DEFINER・service_role のみ
--   （api/claude.js がサーバーから呼ぶ）。未適用なら claude.js は fail-open で
--   従来の check+increment に委譲するため、無くても AI は止まらない。冪等。
--
-- ⚠️ Supabase SQL Editor にコピペで 1 回実行する想定。

create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_period_month text,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calls int;
begin
  -- 上限未満のときだけ +1。conflict の DO UPDATE に WHERE を付けることで、
  -- 既に上限到達の行は更新されず（RETURNING が行を返さない）→ v_calls = null。
  insert into public.ai_usage (user_id, period_month, calls)
    values (p_user_id, p_period_month, 1)
  on conflict (user_id, period_month) do update
    set calls = public.ai_usage.calls + 1
    where public.ai_usage.calls < p_limit
  returning calls into v_calls;

  if v_calls is null then
    return -1; -- 上限到達（加算せず拒否）
  end if;
  return v_calls;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, int) from public, anon, authenticated;


-- ############################################################
-- 33. supabase_ai_usage_release.sql — 答えられなかった回を返す
-- ############################################################
-- 🧾 AI 月次利用量の払い戻し RPC + reserve の GRANT 補修（冪等）
--
-- 背景 2 点:
--   1) supabase_ai_usage_atomic.sql の reserve_ai_usage は upstream (Anthropic)
--      呼び出し【前】に calls を +1 する。upstream が 4xx/5xx で失敗した場合
--      （課金されないコールが多い）に払い戻しが無く、障害時間帯の再試行だけで
--      月次上限 (既定 120) が消費される非対称があった。release_ai_usage で
--      原子的に -1 して対称にする（api/claude.js が失敗経路で呼ぶ）。
--   2) 同ファイルは reserve_ai_usage を REVOKE ALL FROM public しているが、
--      増分側 increment_ai_usage と違い service_role への GRANT が無い。
--      Postgres では REVOKE FROM public で service_role が PUBLIC 経由で
--      継承していた EXECUTE も剥がれるため、環境によっては reserve が
--      permission denied → fail-open に落ち、せっかくの原子的ガードが
--      静かに無効化される。ここで明示 GRANT して補修する。
--
-- 適用順: supabase_ai_usage.sql → supabase_ai_usage_atomic.sql → 本ファイル。
-- 未適用でも api/claude.js は fail-open（従来挙動のまま）で壊れない。

-- ① reserve_ai_usage の GRANT 補修（既に付与済みでも冪等）
grant execute on function public.reserve_ai_usage(uuid, text, int) to service_role;

-- ② 払い戻し RPC: 該当行の calls を 0 未満にならない範囲で -1 する。
--    行が無い場合は何もしない（reserve 前に失敗した経路から呼ばれても安全）。
create or replace function public.release_ai_usage(
  p_user_id uuid,
  p_period_month text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set calls = greatest(calls - 1, 0)
   where user_id = p_user_id
     and period_month = p_period_month;
$$;

revoke all on function public.release_ai_usage(uuid, text) from public;
revoke all on function public.release_ai_usage(uuid, text) from anon;
revoke all on function public.release_ai_usage(uuid, text) from authenticated;
grant execute on function public.release_ai_usage(uuid, text) to service_role;


-- ############################################################
-- 34. supabase_ai_rate_limit.sql — AI の連打を止める
-- ############################################################
-- 🚦 AI 中継の「インスタンス横断」レート制限（H3 是正）。
-- 旧実装は api/claude.js の in-memory Map で、Vercel の各 lambda インスタンス
-- ごとにカウントが独立＝実効上限が「10/分 × インスタンス数」に膨らみ、
-- コールドスタートでリセットもされた。共有の DB カウンタに置き換えて、
-- ユーザー単位の固定ウィンドウ上限を全インスタンスで一貫させる。
--
-- 書き込みは service_role の SECURITY DEFINER RPC 経由のみ（RLS バイパス）。
-- 未適用でも api 側は in-memory にフォールバックするので壊れない（fail-open）。
-- Supabase SQL Editor にコピペで実行（冪等）。

create table if not exists public.ai_rate_limits (
  user_id      uuid not null,
  window_start timestamptz not null,
  calls        integer not null default 0,
  primary key (user_id, window_start)
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ai_rate_limits ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.ai_rate_limits ADD COLUMN IF NOT EXISTS window_start timestamptz;
ALTER TABLE public.ai_rate_limits ADD COLUMN IF NOT EXISTS calls integer not null default 0;

alter table public.ai_rate_limits enable row level security;
-- クライアントからの直接アクセスは一切不可（RPC/service_role のみ）。ポリシー無し
-- ＝ authenticated/anon は SELECT も INSERT もできない（RLS 既定で全拒否）。

-- 固定ウィンドウのアトミック increment。返り値 = 「今回のコールが上限内か」。
-- 上限超過後も increment し続けるが、ウィンドウが変われば別行で自動リセット。
-- 古い行はその場でユーザー単位に掃除（PK で安価）。
create or replace function public.check_ai_rate_limit(
  p_user uuid,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w_start timestamptz;
  c integer;
begin
  if p_user is null or p_max is null or p_window_seconds is null or p_window_seconds <= 0 then
    return true; -- 引数不正は通す（fail-open）
  end if;
  w_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.ai_rate_limits (user_id, window_start, calls)
    values (p_user, w_start, 1)
    on conflict (user_id, window_start)
    do update set calls = public.ai_rate_limits.calls + 1
    returning calls into c;
  -- 古いウィンドウ行を掃除（このユーザー分のみ・10 分より前）。
  delete from public.ai_rate_limits
    where user_id = p_user and window_start < now() - interval '10 minutes';
  return c <= p_max;
end;
$$;

revoke all on function public.check_ai_rate_limit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.check_ai_rate_limit(uuid, integer, integer) to service_role;


-- ############################################################
-- 35. supabase_ai_cost.sql — AI の原価をトークンで数える
-- ############################################################
-- 💴 AI の原価を「円」で数えて、1 人・1 か月の上限を守る（2026-09-27）
--
-- 目的: 有料会員 1 人から、App Store の手数料と消費税を引いたあとに毎月 ¥1,000 が
--       手元に残るようにする。月額 ¥1,480 → 税抜 ¥1,345 → Apple の手数料
--       （日本・小規模事業者プログラム 10%＋App 内課金の決済 5%＝15%）を引いて約 ¥1,144。
--       ここから ¥900 を残すと、AI に使えるのは 1 人・月 約 ¥243 まで（2026-09-27 に ¥1,000 → ¥900）。
--       api/claude.js が実際に使ったトークン数から円の原価を出し、この行に積む。
--
-- 仕組み:
--   - ai_usage に cost_mjpy（その月に使った AI の原価。単位は 1/1000 円）を足す。
--   - reserve_ai_cost: AI を呼ぶ前に「この 1 回の最大の原価」を予約する。予約後の合計が
--     上限を超えるなら予約せず -1 を返す（＝呼ばない）。1 文の UPDATE なので、同時に
--     何本来ても上限を超えない。
--   - adjust_ai_cost: 呼んだあとに「実際の原価 − 予約した額」を足し戻す（ほとんどは減る）。
--     失敗して AI が答えなかったときは、予約した額をまるごと戻す。
--
-- 先に supabase_ai_usage.sql を適用しておくこと（ai_usage 表が要る）。
-- 未適用の DB では api/claude.js は回数の上限（AI_MONTHLY_CALL_LIMIT）だけで守る。
-- 冪等: 何度実行しても安全。

alter table public.ai_usage
  add column if not exists cost_mjpy bigint not null default 0;

create or replace function public.reserve_ai_cost(
  p_user_id uuid,
  p_period_month text,
  p_amount bigint,
  p_budget bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  insert into public.ai_usage (user_id, period_month, calls, cost_mjpy, updated_at)
  values (p_user_id, p_period_month, 0, 0, now())
  on conflict (user_id, period_month) do nothing;

  update public.ai_usage
     set cost_mjpy = cost_mjpy + greatest(p_amount, 0),
         updated_at = now()
   where user_id = p_user_id
     and period_month = p_period_month
     and cost_mjpy + greatest(p_amount, 0) <= p_budget
  returning cost_mjpy into v_total;

  if v_total is null then
    return -1; -- 上限を超えるので予約しない
  end if;
  return v_total;
end;
$$;

create or replace function public.adjust_ai_cost(
  p_user_id uuid,
  p_period_month text,
  p_delta bigint
)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set cost_mjpy = greatest(cost_mjpy + p_delta, 0),
         updated_at = now()
   where user_id = p_user_id
     and period_month = p_period_month
  returning cost_mjpy;
$$;

revoke all on function public.reserve_ai_cost(uuid, text, bigint, bigint) from public;
revoke all on function public.reserve_ai_cost(uuid, text, bigint, bigint) from anon;
revoke all on function public.reserve_ai_cost(uuid, text, bigint, bigint) from authenticated;
grant execute on function public.reserve_ai_cost(uuid, text, bigint, bigint) to service_role;

revoke all on function public.adjust_ai_cost(uuid, text, bigint) from public;
revoke all on function public.adjust_ai_cost(uuid, text, bigint) from anon;
revoke all on function public.adjust_ai_cost(uuid, text, bigint) from authenticated;
grant execute on function public.adjust_ai_cost(uuid, text, bigint) to service_role;

-- 確認用（管理者が SQL Editor で）: 今月、上限に近い人
-- select user_id, calls, round(cost_mjpy / 1000.0, 1) as cost_jpy
--   from ai_usage where period_month = to_char(now() at time zone 'utc', 'YYYY-MM')
--   order by cost_mjpy desc limit 20;


-- ############################################################
-- 36. supabase_ai_token_credits.sql — トークンの買い足し
-- ############################################################
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
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS tokens_total integer check (tokens_total > 0);
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS tokens_left integer check (tokens_left >= 0);
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS source text not null default 'iap' check (source in ('iap'));
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS environment text not null default 'production' check (environment in ('production', 'sandbox'));
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS purchased_at timestamptz not null default now();
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.ai_token_lots ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

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


-- ############################################################
-- 37. supabase_analytics_events.sql — 利用状況の記録
-- ############################################################
-- 📊 利用状況の記録（製品改善のためのファーストパーティ計測）
--
-- ローンチ後の「磨きの優先順位」を実データで決めるための最小限の計測基盤。
-- 外部トラッカーは一切使わず、自前 Supabase にだけ書く（CSP 変更不要）。
--
-- 設計の肝（プライバシー最優先）:
--   - 送るのは「イベント名（enum 想定）＋ 小さな数値/真偽/短い enum 文字列」だけ。
--   - メモ本文・書名・著者・メール・検索語・自由入力などの PII は構造的に入らない
--     （クライアント側 src/lib/analytics.js の props サニタイズで弾く）。
--   - 設定でいつでもオフにできる（クライアントの opt-out で no-op）。
--
-- RLS:
--   - INSERT  : 本人のみ（自分の user_id 行だけ書ける）
--   - SELECT  : 本人のみ（自分の行だけ読める）
--   - UPDATE/DELETE : ポリシー無し（誰も更新・削除できない＝改ざん防止の監査ログ）
--   - 管理者は service_role（RLS バイパス）で集計クエリを実行する。
--
-- supabase_advisor_sessions.sql と同じ流儀。冪等（DROP POLICY IF EXISTS）。

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event       text NOT NULL,
  props       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS event text;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS props jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 集計は「イベント名 × 期間」と「ユーザー × 期間」が主。2 本の複合 index で両方をカバー。
CREATE INDEX IF NOT EXISTS analytics_events_event_idx
  ON public.analytics_events(event, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_user_idx
  ON public.analytics_events(user_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- INSERT は本人のみ（自分の user_id でしか書けない）。
DROP POLICY IF EXISTS "analytics_events_insert_own" ON public.analytics_events;
CREATE POLICY "analytics_events_insert_own" ON public.analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- SELECT は本人のみ（自分の行だけ。エクスポート等で本人が確認できるように）。
DROP POLICY IF EXISTS "analytics_events_select_own" ON public.analytics_events;
CREATE POLICY "analytics_events_select_own" ON public.analytics_events
  FOR SELECT USING (auth.uid() = user_id);

-- UPDATE / DELETE のポリシーは敢えて定義しない。
--   → 一般ユーザーからは更新・削除できない（追記専用の監査ログ）。
--   → 管理者は service_role（RLS バイパス）で集計・保守を行う。
DROP POLICY IF EXISTS "analytics_events_update_own" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_events_delete_own" ON public.analytics_events;


-- ############################################################
-- 38. supabase_feedback.sql — フィードバック
-- ############################################################
-- 📩 ユーザーフィードバック・要望テーブル。
--
-- 設計方針:
-- - user_id は ON DELETE SET NULL — 退会後もフィードバック自体は残し、
--   匿名フィードバックとして読めるようにする。
-- - RLS により利用者は自分の投稿しか SELECT できない。管理者は SQL Editor
--   (service_role 相当) で全件読む想定。
-- - status / admin_note は管理者がトリアージ用に直接書き換える列。
--   ユーザーには触らせない (UPDATE ポリシーを敢えて作らない)。

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  category    text not null check (category in ('bug', 'feature', 'ui', 'question', 'thanks', 'other')),
  content     text not null,
  name        text,
  email       text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  status      text default 'open' check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),
  admin_note  text
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete set null;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS category text check (category in ('bug', 'feature', 'ui', 'question', 'thanks', 'other'));
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS status text default 'open' check (status in ('open', 'in_progress', 'resolved', 'wont_fix'));
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS admin_note text;

create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx  on public.feedback (status);

alter table public.feedback enable row level security;

-- INSERT: ログイン中なら user_id は本人と一致、未ログインなら user_id null。
drop policy if exists "feedback_insert_anyone" on public.feedback;
create policy "feedback_insert_anyone" on public.feedback
  for insert
  with check (auth.uid() = user_id or user_id is null);

-- SELECT: 自分の投稿のみ閲覧可。管理者は service_role 経由で全件アクセス。
drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select
  using (auth.uid() = user_id);

-- UPDATE / DELETE: 一切ポリシーを作らない。
-- → 一般ユーザーは投稿後に編集・削除できない (運営側が確認した後の改ざん防止)。
-- → 管理者は SQL Editor / service_role で個別対応する。


-- ############################################################
-- 39. supabase_feedback_hardening.sql — フィードバックの守り
-- ############################################################
-- 🛡️ feedback テーブルの堅牢化（anon スパム封じ + 長さ CHECK）
--
-- 監査で判明した 2 点を冪等な単一 SQL で固める:
--   1. 既存の INSERT ポリシー（supabase_feedback.sql の "feedback_insert_anyone"）
--      に TO authenticated が無く、`user_id is null` 分岐が anon ロールにも
--      評価されていた → 公開 anon キーだけで無認証・無制限のスパム投入が可能。
--      ログインユーザー限定（TO authenticated）で作り直す。
--      ※ クライアント（src/hooks/useFeedback.js）は `user_id: user?.id || null`
--        を送る＝「ログイン中だが user_id null」の匿名パスがコード上存在するため、
--        WITH CHECK は `auth.uid() = user_id OR user_id IS NULL` を維持する
--        （匿名性は保ちつつ、未認証ロールからの書き込みだけを封じる）。
--   2. content / name / email / user_agent に長さ CHECK が無く、巨大行を
--      投入され得た → クライアント側の clamp 値（useFeedback.js の
--      FEEDBACK_LIMITS: content 2000 / name 60 / email 254 / user_agent 500）
--      と矛盾しない余裕を見た上限で CHECK を付ける。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    supabase_feedback.sql は本番適用済みの可能性があるため編集せず、
--    この上書き用ファイルで是正する（このリポジトリの流儀）。
--
-- 冪等性:
--   - ポリシーは DROP POLICY IF EXISTS → CREATE で常に最新定義へ置換。
--   - CHECK 制約は ADD CONSTRAINT IF NOT EXISTS が使えないため、
--     制約名の存在確認つき DO ブロックで多重追加を防ぐ。
--
-- ⚠ 注意: 既にスパム等で上限超過の行が存在すると CHECK の追加自体が失敗する。
--   事前確認:
--     SELECT id, char_length(content) AS len FROM public.feedback
--     WHERE char_length(content) > 4000
--        OR char_length(coalesce(name, ''))       > 200
--        OR char_length(coalesce(email, ''))      > 320
--        OR char_length(coalesce(user_agent, '')) > 1000;
--   超過行があれば（スパムなら）削除してから実行:
--     -- DELETE FROM public.feedback WHERE id IN ('<該当ID>', ...);


-- =====================================================================
-- 1. INSERT ポリシーを authenticated 限定で作り直す
-- =====================================================================
DROP POLICY IF EXISTS "feedback_insert_anyone" ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert_authenticated" ON public.feedback;
CREATE POLICY "feedback_insert_authenticated" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);


-- =====================================================================
-- 2. テキスト列の長さ CHECK（巨大行の投入防止）
-- =====================================================================
-- 上限はクライアント（src/hooks/useFeedback.js FEEDBACK_LIMITS）の 2 倍程度:
--   content 2000 → 4000 / name 60 → 200 / email 254 → 320 / user_agent 500 → 1000
-- 古いクライアントや clamp 前の余白も考慮しつつ、DDoS 級の巨大行は構造的に弾く。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_content_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_content_len_chk
      CHECK (char_length(content) <= 4000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_name_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_name_len_chk
      CHECK (name IS NULL OR char_length(name) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_email_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_email_len_chk
      CHECK (email IS NULL OR char_length(email) <= 320);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_user_agent_len_chk'
      AND conrelid = 'public.feedback'::regclass
  ) THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_user_agent_len_chk
      CHECK (user_agent IS NULL OR char_length(user_agent) <= 1000);
  END IF;
END $$;

-- admin_note は管理者が service_role（SQL Editor）で書く運用列のため、
-- あえて CHECK を付けない（クライアントからは UPDATE ポリシー無しで書けない）。


-- ############################################################
-- 40. supabase_account_deletion.sql — 退会の申し込み
-- ############################################################
-- =============================================================================
-- 🛡️ アカウント削除リクエスト — Supabase migration
-- =============================================================================
-- このファイルは Supabase の SQL Editor で 1 回実行してください。
--
-- 仕様:
--   * クライアントから auth.users を直接削除するには service_role key が必要
--     なため、ユーザーが「削除」をタップしたら以下を実行する設計:
--       1. クライアント側で本人の books / book_memos / book_tags / actions /
--          chat_messages / Storage 上の写真をすべて削除
--       2. account_deletion_requests に「削除済み」レコードを INSERT
--       3. 管理者が定期的にこのテーブルを確認し、auth.users を service_role で
--          削除する (もしくは Edge Function で自動化)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email    text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  notes         text
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.account_deletion_requests ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.account_deletion_requests ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.account_deletion_requests ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.account_deletion_requests ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.account_deletion_requests ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS account_deletion_requests_user_id_idx
  ON public.account_deletion_requests(user_id);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- 利用者は自分のレコードを INSERT のみ可能。SELECT/UPDATE/DELETE は service_role のみ。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_deletion_requests'
      AND policyname = 'deletion_request_insert_own'
  ) THEN
    CREATE POLICY "deletion_request_insert_own"
      ON public.account_deletion_requests
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- =============================================================================
-- 管理者の作業 (Supabase Dashboard で定期的に実施):
--   SELECT * FROM public.account_deletion_requests ORDER BY requested_at;
--   -- 該当 user_id を確認したら:
--   -- (Supabase Dashboard → Authentication → Users で削除)
--   -- もしくは service_role で:
--   -- SELECT auth.users.email FROM auth.users WHERE id = '<user_id>';
-- =============================================================================


-- ############################################################
-- 41. supabase_account_deletion_hardening.sql — 退会の申し込みの守り
-- ############################################################
-- 🛡️ account_deletion_requests の堅牢化（メール偽装封じ + 二重リクエスト防止）
--
-- 監査で判明した 2 点を冪等な単一 SQL で固める:
--   1. INSERT で user_email がクライアント任意入力のまま保存されていた。
--      他人のメールを入れて INSERT できるため、管理者が「メール基準」で
--      auth.users を削除する運用だと無関係ユーザーが削除され得る
--      （社会工学ベクトル）。→ WITH CHECK で user_email を本人の JWT の
--      email クレームと一致（または NULL）に強制し、TO authenticated 付きで
--      作り直す。クライアント（src/components/AccountSettings.jsx）は
--      `user_email: user.email || null`（= auth セッションのメール）を送る
--      ため、正規の送信はこのチェックを常に通る。
--   2. UNIQUE(user_id) が無く、同一ユーザーが二重リクエストを積めた。
--      → 部分でない UNIQUE INDEX を冪等に追加。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    supabase_account_deletion.sql は本番適用済みの可能性があるため編集せず、
--    この上書き用ファイルで是正する（このリポジトリの流儀）。
--
-- 🚨 管理者の削除運用は必ず user_id 基準に統一すること。
--    user_email は「表示・連絡用の参考情報」に格下げする。メールを手掛かりに
--    照合する場合も、削除実行前に必ず
--      SELECT id, email FROM auth.users WHERE id = '<リクエスト行の user_id>';
--    で user_id と突き合わせ、auth.users 側のメールと一致することを確認してから
--    削除する（リクエスト行の user_email 単独を根拠に削除しない）。
--
-- ⚠ 注意: 既に同一 user_id の重複行がある DB に流すと UNIQUE INDEX の作成
--   自体が失敗する。先に手動で重複を整理してから実行すること。
--
-- 重複確認:
--   SELECT user_id, count(*) AS dup_count, array_agg(id) AS request_ids
--   FROM public.account_deletion_requests
--   GROUP BY user_id
--   HAVING count(*) > 1;
--
-- 重複削除サンプル（最古のリクエストだけ残す）:
--   DELETE FROM public.account_deletion_requests a
--   USING public.account_deletion_requests b
--   WHERE a.user_id = b.user_id
--     AND a.requested_at > b.requested_at;


-- =====================================================================
-- 1. INSERT ポリシーを作り直す（本人 user_id + 本人メール強制）
-- =====================================================================
-- 旧ポリシー（supabase_account_deletion.sql）は TO 指定なし +
-- user_email 無検証だった。authenticated 限定 + JWT email 一致で置換。
DROP POLICY IF EXISTS "deletion_request_insert_own" ON public.account_deletion_requests;
CREATE POLICY "deletion_request_insert_own"
  ON public.account_deletion_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (user_email IS NULL OR user_email = (auth.jwt() ->> 'email'))
  );


-- =====================================================================
-- 2. UNIQUE(user_id) — 二重リクエスト防止
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_user_id_unique
  ON public.account_deletion_requests(user_id);


-- =====================================================================
-- 3. notes / user_email の長さ CHECK（巨大行の投入防止・二重防衛）
-- =====================================================================
-- notes はクライアントが削除時の警告概要を書き込む列（AccountSettings.jsx）。
-- 正常系では数百文字以下。CHECK 制約は IF NOT EXISTS が使えないため、
-- 制約名の存在確認つき DO ブロックで冪等化。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_deletion_requests_notes_len_chk'
      AND conrelid = 'public.account_deletion_requests'::regclass
  ) THEN
    ALTER TABLE public.account_deletion_requests
      ADD CONSTRAINT account_deletion_requests_notes_len_chk
      CHECK (notes IS NULL OR char_length(notes) <= 4000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_deletion_requests_email_len_chk'
      AND conrelid = 'public.account_deletion_requests'::regclass
  ) THEN
    ALTER TABLE public.account_deletion_requests
      ADD CONSTRAINT account_deletion_requests_email_len_chk
      CHECK (user_email IS NULL OR char_length(user_email) <= 320);
  END IF;
END $$;


-- ############################################################
-- 42. supabase_lp_events.sql — 紹介ページの記録
-- ############################################################
-- 📊 LP（紹介ページ）の閲覧状況の記録 — ダウンロードにつながる導線を数字で決めるため。
--
-- 書き手: api/lp-event.js（service_role・未ログインの訪問者から受け取り、検証してから insert）。
-- 読み手: 管理者が SQL Editor（service_role）で集計する（集計例は docs/lp-measurement.md）。
-- クライアントからの直接アクセスは不可（RLS 有効・ポリシー無し）。
--
-- 個人を特定しない: IP・入力文・Cookie は持たない。session_id は閲覧タブごとの無作為な文字列。
-- props は小さな区分値だけ（サイズ上限 1KB）。プライバシーポリシー第 9 条③に記載。
-- 冪等（何度流しても安全）。

create table if not exists public.lp_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) between 8 and 40),
  event text not null, -- 一覧は下の lp_events_event_check（api/lp-event.js の EVENTS と同じ）
  variant text check (variant in ('3d', 'photo')),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 1024),
  device text check (device in ('mobile', 'desktop')),
  ref_host text check (char_length(ref_host) <= 100),
  utm_source text check (char_length(utm_source) <= 64),
  utm_medium text check (char_length(utm_medium) <= 64),
  utm_campaign text check (char_length(utm_campaign) <= 64)
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS id bigint generated always as identity;
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS session_id text check (char_length(session_id) between 8 and 40);
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS event text;
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS variant text check (variant in ('3d', 'photo'));
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 1024);
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS device text check (device in ('mobile', 'desktop'));
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS ref_host text check (char_length(ref_host) <= 100);
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS utm_source text check (char_length(utm_source) <= 64);
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS utm_medium text check (char_length(utm_medium) <= 64);
ALTER TABLE public.lp_events ADD COLUMN IF NOT EXISTS utm_campaign text check (char_length(utm_campaign) <= 64);

create index if not exists lp_events_created_idx on public.lp_events (created_at desc);
create index if not exists lp_events_event_idx on public.lp_events (event, created_at desc);
create index if not exists lp_events_session_idx on public.lp_events (session_id);

alter table public.lp_events enable row level security;
-- ポリシーは作らない（= anon / authenticated からは読めず書けない。service_role のみ）。

-- （2026-10-05）記録するイベントの一覧を api/lp-event.js の EVENTS とそろえる。
--   最初の版の CHECK には flow_* / section_view / offer_badge が無く、2026-10-02 からのこれらの記録は
--   insert が CHECK で弾かれて残っていなかった（api は失敗を訪問者に見せないため気づけなかった）。
--   このファイルを流し直すと、CHECK を今の一覧に作り直す（既にある行はどれも新しい一覧に入る）。
alter table public.lp_events drop constraint if exists lp_events_event_check;
alter table public.lp_events add constraint lp_events_event_check check (event in (
  'lp_view', 'cta_click', 'scroll_depth', 'faq_open', 'hero_3d',
  'flow_view', 'flow_step', 'flow_replay', 'section_view', 'offer_badge',
  'waitlist_submit', 'login_click', 'footer_link', 'hero_secondary',
  'demo_pick', 'demo_ask', 'demo_add'
));

-- 古い記録の掃除（任意・手動）: 400 日より前を消す
-- delete from public.lp_events where created_at < now() - interval '400 days';


-- ############################################################
-- 43. supabase_lp_waitlist.sql — 公開のお知らせの登録
-- ############################################################
-- ✉️ 公開のお知らせの登録（LP・2026-10-05）— App Store の URL が無い間、LP の入口は「公開の日にメールで知らせる」。
--
-- 書き手: api/lp-waitlist.js（service_role・未ログインの訪問者から受け取り、メールの形と長さを確かめてから upsert）。
-- 読み手: 管理者が SQL Editor（service_role）で読み、公開の日に 1 通だけ送る（送ったら notified_at を入れる）。
-- クライアントからの直接アクセスは不可（RLS 有効・ポリシー無し＝anon / authenticated は読めず書けない）。
--
-- 使い道は「公開のお知らせ」だけ（LP の欄の下とプライバシーポリシーに書く）。宣伝のメールには使わない。
-- 頼まれたら消す・公開から 3 か月以内に全部消す（プライバシーポリシーと同じ約束）。
-- ⚠️ 送るメール（特定電子メール法）: 本文に送信者の名前（Orime・運営 阿部文哉）と連絡先（問い合わせのメールアドレス）、
--   「このアドレスは LP で公開のお知らせを希望された方に送っています」を必ず書く。送るのは公開の日の 1 通だけ。
-- 同じメールは 1 行（UNIQUE・api は on conflict do nothing＝2 回目は何もしない）。IP は持たない。
-- 冪等（何度流しても安全）。

create table if not exists public.lp_waitlist (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null check (char_length(email) between 6 and 254 and email = lower(email) and position('@' in email) > 1),
  variant text check (variant in ('3d', 'photo')),
  utm_source text check (char_length(utm_source) <= 64),
  utm_medium text check (char_length(utm_medium) <= 64),
  utm_campaign text check (char_length(utm_campaign) <= 64),
  notified_at timestamptz -- 公開のお知らせを送った日時（送ったら管理者が入れる。null＝まだ）
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS id bigint generated always as identity;
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS email text check (char_length(email) between 6 and 254 and email = lower(email) and position('@' in email) > 1);
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS variant text check (variant in ('3d', 'photo'));
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS utm_source text check (char_length(utm_source) <= 64);
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS utm_medium text check (char_length(utm_medium) <= 64);
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS utm_campaign text check (char_length(utm_campaign) <= 64);
ALTER TABLE public.lp_waitlist ADD COLUMN IF NOT EXISTS notified_at timestamptz;

create unique index if not exists lp_waitlist_email_key on public.lp_waitlist (email);
create index if not exists lp_waitlist_created_idx on public.lp_waitlist (created_at desc);

alter table public.lp_waitlist enable row level security;
-- ポリシーは作らない（= anon / authenticated からは読めず書けない。service_role のみ）。

-- 集計例:
--   select count(*), count(*) filter (where notified_at is null) as not_yet from public.lp_waitlist;
--   select coalesce(utm_source, '(direct)') as source, variant, count(*) from public.lp_waitlist group by 1, 2 order by 3 desc;
-- 公開の日に送ったあと（送った人に印を付ける）:
--   update public.lp_waitlist set notified_at = now() where notified_at is null;
-- 頼まれたら、その人の行を消す:
--   delete from public.lp_waitlist where email = lower('…');
-- 公開から 3 か月以内に、全部消す（約束・忘れないようにカレンダーへ）:
--   delete from public.lp_waitlist;


-- ############################################################
-- 44. supabase_security_hardening.sql — 本・メモ・行動・写真の権限
-- ############################################################
-- 🛡️ セキュリティ堅牢化マイグレーション（RLS 再保証 + Storage バケット防御）
--
-- 監査で判明した 4 点を、冪等な単一 SQL で固める:
--   1. コアテーブル（books / book_memos / actions / book_tags）の RLS 定義が
--      リポジトリ外にあり、版管理されていなかった → ここで再保証する。
--   2. private 写真バケット（book-memo-photos）の定義がリポジトリに無かった
--      → public=false で作成し、user-folder ベースの所有権ポリシーを張る。
--   3. book-covers バケットの書き込みポリシーに TO authenticated が無く、
--      anon でも user-folder 名を詐称すれば書ける余地があった → 作り直す。
--   4. analytics_events の props（jsonb）にサイズ上限が無く、巨大 PII を
--      流し込まれ得た → CHECK で上限を付ける。
--
-- ⚠️ このファイルは Supabase の SQL Editor にコピペで 1 回実行する想定。
--    Vercel デプロイでは自動実行されない。
--
-- 冪等性: 本番が既に正しく設定済みでも安全に再適用できる。
--   - テーブル/バケット作成は IF NOT EXISTS / ON CONFLICT DO NOTHING。
--   - ポリシーは DROP POLICY IF EXISTS → CREATE で常に最新定義へ置換。
--   - ENABLE ROW LEVEL SECURITY は既に有効でも no-op。
--   - CHECK 制約は制約名の存在確認で多重追加を防ぐ（Postgres は CHECK 制約に
--     ADD CONSTRAINT IF NOT EXISTS が使えないため DO ブロックで冪等化）。


-- =====================================================================
-- 1. コアテーブル RLS 再保証
-- =====================================================================
-- books / book_memos / actions はいずれも user_id 列を持つ
-- （src/hooks/useBooks.js / src/hooks/useBookMemos.js で確認）。
-- 所有権は一貫して auth.uid() = user_id。

-- ---- books ----
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "books_select_own" ON public.books;
CREATE POLICY "books_select_own" ON public.books
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "books_insert_own" ON public.books;
CREATE POLICY "books_insert_own" ON public.books
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "books_update_own" ON public.books;
CREATE POLICY "books_update_own" ON public.books
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "books_delete_own" ON public.books;
CREATE POLICY "books_delete_own" ON public.books
  FOR DELETE USING (auth.uid() = user_id);

-- ---- book_memos ----
ALTER TABLE public.book_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_memos_select_own" ON public.book_memos;
CREATE POLICY "book_memos_select_own" ON public.book_memos
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_memos_insert_own" ON public.book_memos;
CREATE POLICY "book_memos_insert_own" ON public.book_memos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_memos_update_own" ON public.book_memos;
CREATE POLICY "book_memos_update_own" ON public.book_memos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_memos_delete_own" ON public.book_memos;
CREATE POLICY "book_memos_delete_own" ON public.book_memos
  FOR DELETE USING (auth.uid() = user_id);

-- ---- actions ----
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actions_select_own" ON public.actions;
CREATE POLICY "actions_select_own" ON public.actions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_insert_own" ON public.actions;
CREATE POLICY "actions_insert_own" ON public.actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_update_own" ON public.actions;
CREATE POLICY "actions_update_own" ON public.actions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_delete_own" ON public.actions;
CREATE POLICY "actions_delete_own" ON public.actions
  FOR DELETE USING (auth.uid() = user_id);

-- ---- book_tags ----
-- 前提: book_tags は user_id 列を持つ（src/hooks/useBooks.js の INSERT が
--   { book_id, user_id, tag_name } を書き込み、AccountSettings.jsx の退会処理が
--   .delete().eq('user_id', user.id) で消していることから確認）。
--   万一この前提（user_id 列）が当該 DB と異なる場合は、下の所有権式を
--   book_id 経由（EXISTS (select 1 from public.books b
--   where b.id = book_tags.book_id and b.user_id = auth.uid())）へ
--   差し替えること。推測で列を壊さないため、ここでは確認済みの user_id を採用。
ALTER TABLE public.book_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_tags_select_own" ON public.book_tags;
CREATE POLICY "book_tags_select_own" ON public.book_tags
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_tags_insert_own" ON public.book_tags;
CREATE POLICY "book_tags_insert_own" ON public.book_tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_tags_update_own" ON public.book_tags;
CREATE POLICY "book_tags_update_own" ON public.book_tags
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "book_tags_delete_own" ON public.book_tags;
CREATE POLICY "book_tags_delete_own" ON public.book_tags
  FOR DELETE USING (auth.uid() = user_id);


-- =====================================================================
-- 2. private 写真バケット（book-memo-photos）+ user-folder 所有権
-- =====================================================================
-- パス構造は userId/<book_id>/<file>（src/hooks/useBookMemos.js uploadPhoto）。
-- → (storage.foldername(name))[1] が所有者の auth.uid()。
-- public=false で署名 URL 経由のみアクセス可（直接 getPublicUrl は不可）。
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-memo-photos', 'book-memo-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "book_memo_photos_select_own" ON storage.objects;
CREATE POLICY "book_memo_photos_select_own" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_memo_photos_insert_own" ON storage.objects;
CREATE POLICY "book_memo_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_memo_photos_update_own" ON storage.objects;
CREATE POLICY "book_memo_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  ) WITH CHECK (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_memo_photos_delete_own" ON storage.objects;
CREATE POLICY "book_memo_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'book-memo-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- =====================================================================
-- 3. book-covers の anon 書き込み封じ（TO authenticated で作り直し）
-- =====================================================================
-- 既存ポリシー（supabase_book_covers_bucket.sql / supabase_added_via.sql）は
-- TO authenticated を欠いており、anon ロールにも書き込みが評価され得た。
-- public read は維持しつつ、書き込みは authenticated + user-folder 所有権に限定。
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- 旧 supabase_added_via.sql が作った別名ポリシー（book_covers_user_*）も明示的に
-- 撤去し、book-covers の書き込みポリシー面をこの SQL に一本化する。これらは元々
-- TO authenticated 付きで実害は無いが、残すと「作り直した」前提が崩れ二重定義に
-- なるため除去（下で *_own を authenticated + user-folder 所有権で再作成）。
DROP POLICY IF EXISTS book_covers_user_insert ON storage.objects;
DROP POLICY IF EXISTS book_covers_user_update ON storage.objects;
DROP POLICY IF EXISTS book_covers_user_delete ON storage.objects;

DROP POLICY IF EXISTS "book_covers_insert_own" ON storage.objects;
CREATE POLICY "book_covers_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_covers_update_own" ON storage.objects;
CREATE POLICY "book_covers_update_own" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  ) WITH CHECK (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "book_covers_delete_own" ON storage.objects;
CREATE POLICY "book_covers_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'book-covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
-- 読み取りは public バケットのため SELECT ポリシーは不要（既定で public read）。


-- =====================================================================
-- 4. analytics_events.props のサイズ上限（PII 流し込み防止の二重防衛）
-- =====================================================================
-- クライアント（src/lib/analytics.js）でサニタイズ済みだが、DB 側でも
-- pg_column_size(props) < 2048 バイトを強制し、巨大ペイロード（=PII 疑い）を
-- 構造的に弾く。CHECK 制約は IF NOT EXISTS が使えないため、制約名の存在確認で
-- 冪等化する。テーブル未適用（supabase_analytics_events.sql 未実行）の環境では
-- スキップする。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'analytics_events'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analytics_events_props_size_chk'
      AND conrelid = 'public.analytics_events'::regclass
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_props_size_chk
      CHECK (pg_column_size(props) < 2048);
  END IF;
END $$;


-- ############################################################
-- 45. supabase_admin_metrics.sql — 運営ダッシュボード（管理者の登録つき）
-- ############################################################
-- 🛰️ 運営ダッシュボード（KGI/KPI 管制塔）— 管理者だけが見る集計 RPC 群。
--
-- 設計:
--   - 集計対象テーブル（analytics_events / subscriptions / ai_usage / feedback /
--     books / book_memos / actions / auth.users）は RLS で「本人の行」しか読めない。
--     管理者が全体を集計するには RLS をバイパスする必要があるため、SECURITY
--     DEFINER 関数（= 所有者 postgres 権限で実行）で集計し、関数の冒頭で
--     is_app_admin() ゲートをかける（管理者以外は例外）。
--   - 生の行（特に feedback の本文/メール = PII）は管理者にのみ返す。一般
--     ユーザーは関数を呼んでも is_app_admin() が false で弾かれる。
--   - 冪等（IF NOT EXISTS / CREATE OR REPLACE）。本番に再適用しても安全。
--
-- ⚠️ 適用後、最後の「管理者シード」を必ず 1 回実行すること（自分を app_admins
--    に登録しないと、自分でもダッシュボードが見えない）。

-- ── 管理者テーブル ─────────────────────────────────────────────────────────
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.app_admins ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;
ALTER TABLE public.app_admins ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
-- RLS 有効＋ポリシー無し＝クライアントからは直接読めない（is_app_admin 経由のみ）。
alter table public.app_admins enable row level security;

-- ── ゲート関数 ─────────────────────────────────────────────────────────────
-- 呼び出し元（auth.uid()）が管理者かどうか。クライアントからも呼べる（自分が
-- 管理者かの判定にのみ使う。他人の情報は返さない）。
create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_app_admin() to authenticated;

-- 各集計関数の冒頭で使う共通ガード。
create or replace function public._require_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'not authorized';
  end if;
end;
$$;

-- ── ① 概況スナップショット ─────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'users_total',   (select count(*) from auth.users),
    'new_users_7d',  (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'dau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '1 day'),
    'wau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '7 days'),
    'mau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '30 days'),
    'books_total',   (select count(*) from public.books),
    'memos_total',   (select count(*) from public.book_memos),
    'actions_total', (select count(*) from public.actions),
    'actions_done',  (select count(*) from public.actions where done = true),
    'subs_active',   (select count(*) from public.subscriptions where status = 'active'),
    'feedback_open', (select count(*) from public.feedback where status = 'open')
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_overview() to authenticated;

-- ── ② アクティブ人数 / 新規本の日次推移 ────────────────────────────────────
create or replace function public.admin_active_series(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_days, 30), 180));
  with days as (
    select generate_series(current_date - (n - 1), current_date, interval '1 day')::date as d
  ),
  act as (
    select created_at::date as d, count(distinct user_id) as c
    from public.analytics_events
    where created_at >= current_date - (n - 1)
    group by 1
  ),
  bk as (
    select created_at::date as d, count(*) as c
    from public.analytics_events
    where event = 'book_added' and created_at >= current_date - (n - 1)
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'd', to_char(days.d, 'MM/DD'),
    'active', coalesce(act.c, 0),
    'new_books', coalesce(bk.c, 0)
  ) order by days.d)
  into result
  from days
  left join act on act.d = days.d
  left join bk on bk.d = days.d;
  return coalesce(result, '[]'::jsonb);
end;
$$;
grant execute on function public.admin_active_series(int) to authenticated;

-- ── ③ 機能別の利用状況 ─────────────────────────────────────────────────────
-- どの機能がどれくらい使われているか。イベント名 / AI 機能内訳 / 本の追加経路。
create or replace function public.admin_feature_usage(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_days, 30), 365));
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_object_agg(event, c)
      from (select event, count(*) c from public.analytics_events
            where created_at >= now() - (n || ' days')::interval
            group by event order by count(*) desc) t
    ), '{}'::jsonb),
    'ai_features', coalesce((
      select jsonb_object_agg(f, c)
      from (select coalesce(props->>'feature', '?') f, count(*) c from public.analytics_events
            where event = 'ai_used' and created_at >= now() - (n || ' days')::interval
            group by 1 order by count(*) desc) t
    ), '{}'::jsonb),
    'book_via', coalesce((
      select jsonb_object_agg(v, c)
      from (select coalesce(props->>'via', '?') v, count(*) c from public.analytics_events
            where event = 'book_added' and created_at >= now() - (n || ' days')::interval
            group by 1 order by count(*) desc) t
    ), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_feature_usage(int) to authenticated;

-- ── ④ AI コスト / API 消費（月次） ─────────────────────────────────────────
create or replace function public.admin_ai_usage(p_months int default 6)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_months, 6), 36));
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', period_month, 'calls', total_calls, 'users', users
  ) order by period_month desc), '[]'::jsonb)
  into result
  from (
    select period_month, sum(calls)::int as total_calls, count(*)::int as users
    from public.ai_usage
    group by period_month
    order by period_month desc
    limit n
  ) t;
  return result;
end;
$$;
grant execute on function public.admin_ai_usage(int) to authenticated;

-- ── ⑤ 売上 / 課金 ─────────────────────────────────────────────────────────
create or replace function public.admin_revenue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'active', (select count(*) from public.subscriptions where status = 'active'),
    'by_status', coalesce((
      select jsonb_object_agg(coalesce(status, '?'), c)
      from (select status, count(*) c from public.subscriptions group by status) t
    ), '{}'::jsonb),
    'expiring_30d', (
      select count(*) from public.subscriptions
      where status = 'active' and current_period_end is not null
        and current_period_end < now() + interval '30 days'
    )
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_revenue() to authenticated;

-- ── ⑥ 問い合わせ / フィードバック（一本化された受信箱） ────────────────────
-- 管理者の「サポート受信箱」。PII（本文 / 名前 / メール）を含むが管理者専用。
create or replace function public.admin_feedback(p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select coalesce(jsonb_agg(row_to_json(f) order by f.created_at desc), '[]'::jsonb)
  into result
  from (
    select id, category, content, name, email, status, admin_note, created_at
    from public.feedback
    where (p_status is null or status = p_status)
    order by created_at desc
    limit 300
  ) f;
  return result;
end;
$$;
grant execute on function public.admin_feedback(text) to authenticated;

-- 問い合わせのトリアージ（ステータス更新 / メモ追記）。
create or replace function public.admin_feedback_update(p_id uuid, p_status text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status is not null and p_status not in ('open', 'in_progress', 'resolved', 'wont_fix') then
    raise exception 'invalid status';
  end if;
  update public.feedback
     set status = coalesce(p_status, status),
         admin_note = coalesce(p_note, admin_note)
   where id = p_id;
end;
$$;
grant execute on function public.admin_feedback_update(uuid, text, text) to authenticated;

-- ── 管理者シード（必ず 1 回実行） ─────────────────────────────────────────
-- 自分（オーナー）の auth.users 行を app_admins に登録する。メールは実アドレスに。
-- ※ このメールの account でアプリにサインイン済みであること（auth.users に行が要る）。
insert into public.app_admins (user_id)
select id from auth.users where email = 'leverage.book0502@gmail.com'
on conflict (user_id) do nothing;


-- ############################################################
-- 46. supabase_admin_ops.sql — 目標・チケット
-- ############################################################
-- 🎛️ 運営オペレーション層（Founder Cockpit）— 目標 ＋ チケット。
--
-- supabase_admin_metrics.sql の上に乗る（is_app_admin() / _require_admin() に依存）。
-- 必ず supabase_admin_metrics.sql を先に適用すること。
--
--   - ops_goals : 創業者の売上/利用目標（MRR・有料会員数・総ユーザー数 ＋ 締切）。
--     ダッシュボードが現在地との差分から「達成ペース」を逆算し、やることを軌道修正する。
--   - ops_tickets: 顧客フィードバックから起票するバグ/要望チケット＋手動タスク。
--     「FB をもとにバグ修正チケットが作られる」を実現する作業ボード。
--
-- どちらも管理者専用（RLS 有効＋クライアントポリシー無し＝DEFINER RPC 経由のみ）。
-- 冪等（IF NOT EXISTS / CREATE OR REPLACE）。

-- ── 目標 ───────────────────────────────────────────────────────────────────
create table if not exists public.ops_goals (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  metric     text not null default 'mrr' check (metric in ('mrr', 'paid_users', 'users', 'gross_profit')),
  target     numeric not null default 0,
  deadline   date,
  updated_at timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ops_goals ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;
ALTER TABLE public.ops_goals ADD COLUMN IF NOT EXISTS metric text not null default 'mrr' check (metric in ('mrr', 'paid_users', 'users', 'gross_profit'));
ALTER TABLE public.ops_goals ADD COLUMN IF NOT EXISTS target numeric not null default 0;
ALTER TABLE public.ops_goals ADD COLUMN IF NOT EXISTS deadline date;
ALTER TABLE public.ops_goals ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
alter table public.ops_goals enable row level security;
-- 既存DB向け: metric の許容値に gross_profit（月次粗利）を追加（冪等）。
alter table public.ops_goals drop constraint if exists ops_goals_metric_check;
alter table public.ops_goals add constraint ops_goals_metric_check
  check (metric in ('mrr', 'paid_users', 'users', 'gross_profit'));

-- ── チケット（作業ボード） ─────────────────────────────────────────────────
create table if not exists public.ops_tickets (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  body               text,
  kind               text not null default 'task' check (kind in ('bug', 'feature', 'task')),
  priority           int  not null default 2,  -- 1=高 / 2=中 / 3=低
  status             text not null default 'open' check (status in ('open', 'in_progress', 'done', 'wont_fix')),
  source_feedback_id uuid references public.feedback(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS kind text not null default 'task' check (kind in ('bug', 'feature', 'task'));
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS priority int not null default 2;
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'wont_fix'));
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS source_feedback_id uuid references public.feedback(id) on delete set null;
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.ops_tickets ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
alter table public.ops_tickets enable row level security;
create index if not exists ops_tickets_status_idx on public.ops_tickets(status, priority, created_at desc);

-- ── 目標 RPC ───────────────────────────────────────────────────────────────
create or replace function public.admin_get_goal()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object('metric', metric, 'target', target, 'deadline', deadline, 'updated_at', updated_at)
    into result from public.ops_goals where user_id = auth.uid();
  return result; -- 未設定なら null
end;
$$;
grant execute on function public.admin_get_goal() to authenticated;

create or replace function public.admin_set_goal(p_metric text, p_target numeric, p_deadline date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_admin();
  if p_metric not in ('mrr', 'paid_users', 'users', 'gross_profit') then raise exception 'invalid metric'; end if;
  insert into public.ops_goals (user_id, metric, target, deadline, updated_at)
  values (auth.uid(), p_metric, greatest(coalesce(p_target, 0), 0), p_deadline, now())
  on conflict (user_id) do update
    set metric = excluded.metric, target = excluded.target, deadline = excluded.deadline, updated_at = now();
end;
$$;
grant execute on function public.admin_set_goal(text, numeric, date) to authenticated;

-- ── チケット RPC ───────────────────────────────────────────────────────────
create or replace function public.admin_tickets()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();
  select coalesce(jsonb_agg(row_to_json(t) order by
            (case t.status when 'open' then 0 when 'in_progress' then 1 else 2 end),
            t.priority, t.created_at desc), '[]'::jsonb)
    into result
  from (
    select id, title, body, kind, priority, status, source_feedback_id, created_at, updated_at
    from public.ops_tickets
    order by created_at desc
    limit 500
  ) t;
  return result;
end;
$$;
grant execute on function public.admin_tickets() to authenticated;

create or replace function public.admin_ticket_create(
  p_title text, p_body text default null, p_kind text default 'task',
  p_priority int default 2, p_source_feedback uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  perform public._require_admin();
  if coalesce(p_kind, 'task') not in ('bug', 'feature', 'task') then raise exception 'invalid kind'; end if;
  insert into public.ops_tickets (title, body, kind, priority, source_feedback_id)
  values (left(coalesce(nullif(trim(p_title), ''), '(無題)'), 200), p_body,
          coalesce(p_kind, 'task'), coalesce(p_priority, 2), p_source_feedback)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.admin_ticket_create(text, text, text, int, uuid) to authenticated;

create or replace function public.admin_ticket_update(p_id uuid, p_status text default null, p_priority int default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status is not null and p_status not in ('open', 'in_progress', 'done', 'wont_fix') then
    raise exception 'invalid status';
  end if;
  update public.ops_tickets
     set status = coalesce(p_status, status),
         priority = coalesce(p_priority, priority),
         updated_at = now()
   where id = p_id;
end;
$$;
grant execute on function public.admin_ticket_update(uuid, text, int) to authenticated;

-- フィードバック1件からチケットを起票（カテゴリでバグ/要望/タスクに振り分け）。
-- 起票と同時に元フィードバックを in_progress にして二重対応を防ぐ。
create or replace function public.admin_ticket_from_feedback(p_feedback_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare fb record; new_id uuid; t_kind text;
begin
  perform public._require_admin();
  select * into fb from public.feedback where id = p_feedback_id;
  if not found then raise exception 'feedback not found'; end if;
  t_kind := case fb.category when 'bug' then 'bug' when 'feature' then 'feature' else 'task' end;
  insert into public.ops_tickets (title, body, kind, priority, source_feedback_id)
  values (left(coalesce(nullif(trim(fb.content), ''), '(無題)'), 200), fb.content, t_kind,
          case when t_kind = 'bug' then 1 else 2 end, fb.id)
  returning id into new_id;
  update public.feedback set status = 'in_progress' where id = p_feedback_id and status = 'open';
  return new_id;
end;
$$;
grant execute on function public.admin_ticket_from_feedback(uuid) to authenticated;


-- ############################################################
-- 47. supabase_admin_growth.sql — 継続率
-- ############################################################
-- 📈 運営ダッシュボード — 成長・継続率の集計（admin_metrics の上に乗る）。
-- ※ 先に supabase_admin_metrics.sql を適用すること（_require_admin 依存）。
-- 冪等（CREATE OR REPLACE）。データが無い間は 0 / 空配列を返す（壊れない）。

-- コホート継続率（D1/D7/D30）＋ 新規有料の月次推移 ＋ 解約数。
--   - 継続率は analytics_events から: 各ユーザーの初回イベント日を基準に、
--     N 日後以降にも活動があったユーザーの割合（「N日後も残っている率」）。
--     分母は「初回から N 日以上経過したユーザー」（評価機会のある人だけ）。
--   - 新規有料は subscriptions.created_at の月次件数。
create or replace function public.admin_growth()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  perform public._require_admin();

  with firsts as (
    select user_id, min(created_at) as f
    from public.analytics_events
    group by user_id
  ),
  ret as (
    select
      count(*) filter (where f <= now() - interval '1 day')  as den1,
      count(*) filter (where f <= now() - interval '1 day' and exists (
        select 1 from public.analytics_events e
        where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '1 day')) as num1,
      count(*) filter (where f <= now() - interval '7 day')  as den7,
      count(*) filter (where f <= now() - interval '7 day' and exists (
        select 1 from public.analytics_events e
        where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '7 day')) as num7,
      count(*) filter (where f <= now() - interval '30 day') as den30,
      count(*) filter (where f <= now() - interval '30 day' and exists (
        select 1 from public.analytics_events e
        where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '30 day')) as num30
    from firsts
  ),
  paid_series as (
    select to_char(date_trunc('month', created_at), 'YYYY-MM') as m, count(*)::int as c
    from public.subscriptions
    group by 1
    order by 1 desc
    limit 12
  )
  select jsonb_build_object(
    'retention', (select jsonb_build_object(
      'd1_num', num1, 'd1_den', den1,
      'd7_num', num7, 'd7_den', den7,
      'd30_num', num30, 'd30_den', den30) from ret),
    'paid_new_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m) from paid_series
    ), '[]'::jsonb),
    'subs_total', (select count(*) from public.subscriptions),
    'subs_active', (select count(*) from public.subscriptions where status = 'active'),
    'subs_canceled', (select count(*) from public.subscriptions where status is not null and status <> 'active'),
    -- 当月に獲得した有料数（CAC 計算の分母に使う）。
    'paid_new_this_month', (
      select count(*) from public.subscriptions
      where created_at >= date_trunc('month', now())
    )
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_growth() to authenticated;


-- ############################################################
-- 48. supabase_admin_exclude_admins.sql — 自分の利用を数えない
-- ############################################################
-- 🧹 運営ダッシュボードの集計から「管理者（app_admins）」を除外する。
--
-- 創業者/運営者が自分でアプリを使う（テスト・ドッグフーディング）と、ユーザー数・
-- アクティブ・課金・継続率が水増しされる。顧客指標から自分（チーム）を外すのは
-- 標準的な運用。supabase_admin_metrics.sql / supabase_admin_growth.sql の集計
-- 関数を「app_admins を除外する版」で create or replace する（後勝ち・冪等）。
--
-- ※ 先に supabase_admin_metrics.sql と supabase_admin_growth.sql を適用済みであること。

-- ① 概況スナップショット（管理者除外）
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'users_total',   (select count(*) from auth.users u where u.id not in (select user_id from public.app_admins)),
    'new_users_7d',  (select count(*) from auth.users u where u.created_at > now() - interval '7 days' and u.id not in (select user_id from public.app_admins)),
    'new_users_30d', (select count(*) from auth.users u where u.created_at > now() - interval '30 days' and u.id not in (select user_id from public.app_admins)),
    'dau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '1 day'  and user_id not in (select user_id from public.app_admins)),
    'wau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '7 days' and user_id not in (select user_id from public.app_admins)),
    'mau', (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '30 days' and user_id not in (select user_id from public.app_admins)),
    'books_total',   (select count(*) from public.books      where user_id not in (select user_id from public.app_admins)),
    'memos_total',   (select count(*) from public.book_memos where user_id not in (select user_id from public.app_admins)),
    'actions_total', (select count(*) from public.actions    where user_id not in (select user_id from public.app_admins)),
    'actions_done',  (select count(*) from public.actions    where done = true and user_id not in (select user_id from public.app_admins)),
    'subs_active',   (select count(*) from public.subscriptions where status = 'active' and user_id not in (select user_id from public.app_admins)),
    'feedback_open', (select count(*) from public.feedback where status = 'open' and (user_id is null or user_id not in (select user_id from public.app_admins)))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_overview() to authenticated;

-- ② アクティブ/新規本の日次推移（管理者除外）
create or replace function public.admin_active_series(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_days, 30), 180));
  with days as (
    select generate_series(current_date - (n - 1), current_date, interval '1 day')::date as d
  ),
  act as (
    select created_at::date as d, count(distinct user_id) as c
    from public.analytics_events
    where created_at >= current_date - (n - 1) and user_id not in (select user_id from public.app_admins)
    group by 1
  ),
  bk as (
    select created_at::date as d, count(*) as c
    from public.analytics_events
    where event = 'book_added' and created_at >= current_date - (n - 1) and user_id not in (select user_id from public.app_admins)
    group by 1
  )
  select jsonb_agg(jsonb_build_object('d', to_char(days.d, 'MM/DD'), 'active', coalesce(act.c, 0), 'new_books', coalesce(bk.c, 0)) order by days.d)
  into result
  from days left join act on act.d = days.d left join bk on bk.d = days.d;
  return coalesce(result, '[]'::jsonb);
end; $$;
grant execute on function public.admin_active_series(int) to authenticated;

-- ③ 機能別の利用状況（管理者除外）
create or replace function public.admin_feature_usage(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_days, 30), 365));
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_object_agg(event, c) from (
        select event, count(*) c from public.analytics_events
        where created_at >= now() - (n || ' days')::interval and user_id not in (select user_id from public.app_admins)
        group by event order by count(*) desc) t), '{}'::jsonb),
    'ai_features', coalesce((
      select jsonb_object_agg(f, c) from (
        select coalesce(props->>'feature', '?') f, count(*) c from public.analytics_events
        where event = 'ai_used' and created_at >= now() - (n || ' days')::interval and user_id not in (select user_id from public.app_admins)
        group by 1 order by count(*) desc) t), '{}'::jsonb),
    'book_via', coalesce((
      select jsonb_object_agg(v, c) from (
        select coalesce(props->>'via', '?') v, count(*) c from public.analytics_events
        where event = 'book_added' and created_at >= now() - (n || ' days')::interval and user_id not in (select user_id from public.app_admins)
        group by 1 order by count(*) desc) t), '{}'::jsonb)
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_feature_usage(int) to authenticated;

-- ④ AI コスト（管理者除外）
create or replace function public.admin_ai_usage(p_months int default 6)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; n int;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_months, 6), 36));
  select coalesce(jsonb_agg(jsonb_build_object('month', period_month, 'calls', total_calls, 'users', users) order by period_month desc), '[]'::jsonb)
  into result
  from (
    select period_month, sum(calls)::int as total_calls, count(*)::int as users
    from public.ai_usage
    where user_id not in (select user_id from public.app_admins)
    group by period_month order by period_month desc limit n
  ) t;
  return result;
end; $$;
grant execute on function public.admin_ai_usage(int) to authenticated;

-- ⑤ 売上 / 課金（管理者除外）
create or replace function public.admin_revenue()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'active', (select count(*) from public.subscriptions where status = 'active' and user_id not in (select user_id from public.app_admins)),
    'by_status', coalesce((
      select jsonb_object_agg(coalesce(status, '?'), c)
      from (select status, count(*) c from public.subscriptions where user_id not in (select user_id from public.app_admins) group by status) t), '{}'::jsonb),
    'expiring_30d', (
      select count(*) from public.subscriptions
      where status = 'active' and current_period_end is not null
        and current_period_end < now() + interval '30 days'
        and user_id not in (select user_id from public.app_admins))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_revenue() to authenticated;

-- ⑥ 成長 / 継続率（管理者除外）
create or replace function public.admin_growth()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  with firsts as (
    select user_id, min(created_at) as f
    from public.analytics_events
    where user_id not in (select user_id from public.app_admins)
    group by user_id
  ),
  ret as (
    select
      count(*) filter (where f <= now() - interval '1 day')  as den1,
      count(*) filter (where f <= now() - interval '1 day' and exists (
        select 1 from public.analytics_events e where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '1 day')) as num1,
      count(*) filter (where f <= now() - interval '7 day')  as den7,
      count(*) filter (where f <= now() - interval '7 day' and exists (
        select 1 from public.analytics_events e where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '7 day')) as num7,
      count(*) filter (where f <= now() - interval '30 day') as den30,
      count(*) filter (where f <= now() - interval '30 day' and exists (
        select 1 from public.analytics_events e where e.user_id = firsts.user_id and e.created_at >= firsts.f + interval '30 day')) as num30
    from firsts
  ),
  paid_series as (
    select to_char(date_trunc('month', created_at), 'YYYY-MM') as m, count(*)::int as c
    from public.subscriptions
    where user_id not in (select user_id from public.app_admins)
    group by 1 order by 1 desc limit 12
  )
  select jsonb_build_object(
    'retention', (select jsonb_build_object('d1_num', num1, 'd1_den', den1, 'd7_num', num7, 'd7_den', den7, 'd30_num', num30, 'd30_den', den30) from ret),
    'paid_new_by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m) from paid_series), '[]'::jsonb),
    'subs_total', (select count(*) from public.subscriptions where user_id not in (select user_id from public.app_admins)),
    'subs_active', (select count(*) from public.subscriptions where status = 'active' and user_id not in (select user_id from public.app_admins)),
    'subs_canceled', (select count(*) from public.subscriptions where status is not null and status <> 'active' and user_id not in (select user_id from public.app_admins)),
    'paid_new_this_month', (select count(*) from public.subscriptions where created_at >= date_trunc('month', now()) and user_id not in (select user_id from public.app_admins))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_growth() to authenticated;


-- ############################################################
-- 49. supabase_admin_members_tasks.sql — 会員の内訳・売上
-- ############################################################
-- 🧩 操縦席の強化: ①会員内訳（有料/無料期間/解約の分離）②日次タスク。
-- ※ 先に supabase_admin_metrics.sql / _ops / _growth / _exclude_admins を適用済みであること。
-- 冪等。

-- ── ① subscriptions に「無料期間」を区別する period_type を追加 ──────────────
-- RevenueCat / App Store の period_type を保持する想定:
--   'trial' = 無料期間（売上0）、'normal'（または null）・'intro'（有料の初回価格＝創業メンバー価格「1 年目 ¥9,800」）= 有料。
--   （2026-10-02 に 'intro' を有料へ。RevenueCat の period_type は TRIAL＝無料・INTRO＝有料の初回価格。再適用で反映）
-- Webhook（RevenueCat→subscriptions）がこの列に書けば、ダッシュボードが自動で
-- 有料と無料期間を分離する。未設定（null）は有料(normal)扱い。
alter table public.subscriptions
  add column if not exists period_type text;

-- ── ② 日次タスク（今やるべきことの日次分解） ──────────────────────────────
create table if not exists public.ops_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  due_date   date not null,
  dept       text,                 -- 経営 / マーケ営業 / 開発 / 経理
  title      text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;
ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS dept text;
ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS done boolean not null default false;
ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
create index if not exists ops_tasks_user_date_idx on public.ops_tasks(user_id, due_date);
alter table public.ops_tasks alter column user_id set default auth.uid();
alter table public.ops_tasks enable row level security;
-- 既存の ops_advisor_messages にも default を補填（user_id 無し insert を許容）。存在時のみ。
do $$ begin
  if to_regclass('public.ops_advisor_messages') is not null then
    alter table public.ops_advisor_messages alter column user_id set default auth.uid();
  end if;
end $$;
drop policy if exists "ops_tasks_all_own" on public.ops_tasks;
create policy "ops_tasks_all_own" on public.ops_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── ③ 売上 / 課金（会員内訳：有料 / 無料期間 / 解約。管理者除外） ────────────
-- active = 有料（status='active' かつ無料期間でない）→ MRR はこれだけで計算。
-- trial  = 無料期間（status='active' かつ period_type が trial）= 売上0。intro（有料の初回価格）は有料に数える。
-- founding = active のうち period_type='intro'（創業メンバー価格・内訳。2026-10-02 追加。無い古い定義でもアプリは 0 として動く）。
-- canceled = 解約（status が active 以外）→ 会員数に含めない。
create or replace function public.admin_revenue()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'active', (select count(*) from public.subscriptions
      where status = 'active' and coalesce(period_type, 'normal') <> 'trial'
        and user_id not in (select user_id from public.app_admins)),
    -- founding = 有料のうち、有料の初回価格（period_type 'intro'＝創業メンバー価格「1 年目 ¥9,800」）の人。
    -- active に含まれる（内訳）。ダッシュボードの MRR は、この人数だけ ¥9,800 ÷ 12 で数える（2026-10-02）。
    'founding', (select count(*) from public.subscriptions
      where status = 'active' and period_type = 'intro'
        and user_id not in (select user_id from public.app_admins)),
    'trial', (select count(*) from public.subscriptions
      where status = 'active' and coalesce(period_type, 'normal') = 'trial'
        and user_id not in (select user_id from public.app_admins)),
    'canceled', (select count(*) from public.subscriptions
      where status is not null and status <> 'active'
        and user_id not in (select user_id from public.app_admins)),
    'by_status', coalesce((select jsonb_object_agg(coalesce(status, '?'), c)
      from (select status, count(*) c from public.subscriptions
        where user_id not in (select user_id from public.app_admins) group by status) t), '{}'::jsonb),
    'expiring_30d', (select count(*) from public.subscriptions
      where status = 'active' and coalesce(period_type, 'normal') <> 'trial'
        and current_period_end is not null and current_period_end < now() + interval '30 days'
        and user_id not in (select user_id from public.app_admins))
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_revenue() to authenticated;


-- ############################################################
-- 50. supabase_ops_advisor.sql — 参謀の会話
-- ############################################################
-- 🧠 AI 参謀（作戦会議）の会話履歴 — 運営ダッシュボードの対話相談役。
--
-- 元帥（運営者）と AI 参謀の対話を時系列で保存する。RLS は本人のみ（自分の行を
-- insert / select / delete 可）。クライアントから直接読み書きする（DEFINER RPC 不要）。
-- 運営ダッシュボードは管理者しか開けないので実質管理者専用だが、RLS 自体は
-- 「自分の行のみ」で十分（他人の会話は見えない）。冪等（DROP POLICY IF EXISTS）。

create table if not exists public.ops_advisor_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ops_advisor_messages ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.ops_advisor_messages ADD COLUMN IF NOT EXISTS user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;
ALTER TABLE public.ops_advisor_messages ADD COLUMN IF NOT EXISTS role text check (role in ('user', 'assistant'));
ALTER TABLE public.ops_advisor_messages ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.ops_advisor_messages ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
-- 既存テーブル向け: user_id を入れずに insert できるよう default を補填（冪等）。
alter table public.ops_advisor_messages alter column user_id set default auth.uid();

create index if not exists ops_advisor_messages_user_idx
  on public.ops_advisor_messages(user_id, created_at);

alter table public.ops_advisor_messages enable row level security;

drop policy if exists "ops_advisor_select_own" on public.ops_advisor_messages;
create policy "ops_advisor_select_own" on public.ops_advisor_messages
  for select using (auth.uid() = user_id);

drop policy if exists "ops_advisor_insert_own" on public.ops_advisor_messages;
create policy "ops_advisor_insert_own" on public.ops_advisor_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "ops_advisor_delete_own" on public.ops_advisor_messages;
create policy "ops_advisor_delete_own" on public.ops_advisor_messages
  for delete using (auth.uid() = user_id);


-- ############################################################
-- 51. supabase_ops_floor.sql — 作戦司令室の報告
-- ############################################################
-- 🏢 作戦司令室（社員フロア）の報告ログ — AI 企業の「記憶」。
-- 各社員（member_id）の報告と CEO室の統合ブリーフ（member_id='__integration__'）を
-- 追記していく。最新行 = その社員の現在の状態、過去行 = 履歴。
-- 管理者（元帥）本人の行のみ RLS で読み書き可（他人は一切見えない）。
-- さらに is_app_admin() ゲートで「管理者以外は自分の行すら作れない」ようにする
-- （UI 入口は AdminDashboard 内だが、anon キー + 自分の JWT で直接 INSERT する
--  ストレージ濫用ベクトルをテーブル側でも封じる = UI とテーブルの二層ゲート）。
-- 未適用でもクライアントは localStorage にフォールバックするため機能は壊れない。
--
-- 依存: supabase_admin_metrics.sql（is_app_admin() 関数）を先に適用すること。
-- 冪等（IF NOT EXISTS / DROP POLICY IF EXISTS）。

create table if not exists public.ops_floor_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id text not null,          -- aiCompany.js の社員 id、または '__integration__'
  kind text not null default 'report',  -- 'report' | 'integration'
  status text,                      -- フロア表示用の一言（integration は null）
  body text,                        -- 成果物 / 統合ブリーフ本体（Markdown）
  created_at timestamptz not null default now(),
  constraint ops_floor_reports_member_len check (char_length(member_id) <= 64),
  constraint ops_floor_reports_status_len check (status is null or char_length(status) <= 120),
  constraint ops_floor_reports_body_len check (body is null or char_length(body) <= 8000)
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ops_floor_reports ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.ops_floor_reports ADD COLUMN IF NOT EXISTS user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;
ALTER TABLE public.ops_floor_reports ADD COLUMN IF NOT EXISTS member_id text;
ALTER TABLE public.ops_floor_reports ADD COLUMN IF NOT EXISTS kind text not null default 'report';
ALTER TABLE public.ops_floor_reports ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.ops_floor_reports ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.ops_floor_reports ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

alter table public.ops_floor_reports enable row level security;

drop policy if exists ofr_all on public.ops_floor_reports;
create policy ofr_all on public.ops_floor_reports
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());

-- 最新行・履歴の取得を速くする（user × member × 新しい順）。
create index if not exists ops_floor_reports_user_member_idx
  on public.ops_floor_reports (user_id, member_id, created_at desc);


-- ############################################################
-- 52. supabase_ops_sales_metrics.sql — 営業の週の数字
-- ############################################################
-- 📣 営業ウィークリー計測 — 営業戦略（company/sales-strategy-2026-2027.md §7）の
-- 週次KPI（新規課金/インストール/LPクリック/note PV/Xプロフクリック）を記録する。
-- App Store Connect / note / X アナリティクスの数字は自動取得できないため、
-- 週次レビュー（日曜）に操縦席の 📣 営業タブから手入力する。
-- RLS は ops_floor_reports と同じ二層ゲート（本人 AND is_app_admin()）。
-- 依存: supabase_admin_metrics.sql（is_app_admin()）。冪等。

create table if not exists public.ops_sales_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,              -- その週の月曜日
  new_paid integer,                      -- 新規課金者数
  installs integer,                      -- App インストール数
  lp_clicks integer,                     -- LP クリック（UTM 集計）
  note_pv integer,                       -- note 週間PV
  x_profile_clicks integer,              -- X プロフィールクリック
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  constraint osm_memo_len check (memo is null or char_length(memo) <= 500)
);
-- （まとめが自動で足した: 前からある表に足りない列を足す）
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS id uuid default gen_random_uuid();
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS week_start date;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS new_paid integer;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS installs integer;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS lp_clicks integer;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS note_pv integer;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS x_profile_clicks integer;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS memo text;
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.ops_sales_metrics ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
CREATE UNIQUE INDEX IF NOT EXISTS ops_sales_metrics_user_id_week_start_bundle_uq ON public.ops_sales_metrics (user_id, week_start);

alter table public.ops_sales_metrics enable row level security;

drop policy if exists osm_all on public.ops_sales_metrics;
create policy osm_all on public.ops_sales_metrics
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());

create index if not exists ops_sales_metrics_user_week_idx
  on public.ops_sales_metrics (user_id, week_start desc);


-- ############################################################
-- 53. supabase_admin_launch_kpis.sql — ローンチの 4 つの数字
-- ############################################################
-- 🚀 ローンチの 4 つの数字（2026-10-02 オーナー承認・2026 年 11 月ローンチ）— 運営ダッシュボード用の集計。
--
-- ※ 依存: 先に supabase_admin_metrics.sql を適用すること（app_admins / _require_admin）。
--    あわせて supabase_analytics_events.sql（analytics_events）と supabase_chat_messages.sql
--    （chat_messages）が適用済みであること（どちらも本番では適用済みのはず）。
--    7 日間無料 → 有料 は supabase_subscription_events.sql（契約の履歴）が無いと「データなし」を返す
--    （この関数は表の有無を見てから読むので、順番が逆でも壊れない）。
-- 冪等（CREATE OR REPLACE）。管理者（app_admins）は全部の数字から除く。
--
-- 4 つの数字（定義と読み方は docs/launch-kpis.md）:
--   ① 初日に相談を体験した人の割合 = 登録から 24 時間以内に相談を送った人 ÷ 登録から 24 時間たった人
--      相談の証拠: chat_messages の role='user'（AI の答えを受けた相談）。
--      補助（あれば）: analytics_events の first_consult_sent / brain_memo_answer / brain_lookup_local /
--      ai_used(feature=brain)（メモが答える相談・メモで本を見つけた相談は chat_messages に残らないため）。
--   ② 7 日でメモ 10 件の割合 = 登録から 7 日以内にメモが 10 件以上になった人 ÷ 登録から 7 日たった人
--      数えるのは book_memos.created_at が [登録, 登録+7 日) のメモ。取り込み（ブクログ等）のメモは
--      元の日付で入るので、登録より前の日付のメモは「7 日以内に import_done がある人」だけ数える。
--      補助（あれば）: analytics_events の memos_reached_10（7 日以内）。
--   ③ 30 日後も使っている割合 = 登録から 30〜37 日目（30 日後からの 1 週間）に 1 回でも使った人 ÷ 登録から 37 日たった人
--      使った証拠: analytics_events（何でも）/ book_memos / chat_messages / actions の作成。
--      2026-10-10 から、ほかにも: 読む（集中モード）の reading_sessions.started_at・行動の完了 actions.completed_at。
--      表・列が無い DB ではその証拠だけ数えない（to_regclass / information_schema で確かめてから動的 SQL で読む）。**再適用が要る**。
--      book_memos.last_recalled_at は数えない（思い出しの通知を送っただけでも書かれ、本人が開いていなくても
--      「使っている」に入ってしまうため・2026-10-10）。
--   ④ 7 日間無料 → 有料の割合 = 無料期間を始めて 8 日たった人のうち、有料に進んだ人
--      無料期間の始まり: subscription_events の period_type が trial の最初の行。
--      （'intro' は有料の初回価格＝創業メンバー価格「1 年目 ¥9,800」で、無料期間ではない。分母にも分子の
--       「無料期間の始まり」にも数えない・2026-10-02。再適用で反映）
--      有料に進んだ: その後の行で（period_type='normal' かつ status='active'）または is_trial_conversion。
--      8 日 = 7 日間＋更新の処理の 1 日。サンドボックスは除く。
--
-- 週ごと: 登録した週（日本時間の月曜はじまり）で分け、各数字の 分子 / 分母 / 判定待ち（まだ日数がたっていない人）。
-- 全体: 「直近 30 日に結果が決まった人」。数字ごとに決まるまでの日数が違うので、登録日の範囲がずれる:
--   ① 登録が 31〜1 日前 ② 37〜7 日前 ③ 67〜37 日前 ④ 無料期間を始めたのが 38〜8 日前。範囲（from / to）も返す。
--
-- 返り値（jsonb）:
--   { generated_at, weeks, sources: { trial_history, trial_rows },
--     totals: { first_consult|memos10|d30|trial_paid: { num, den, pending, from, to } },
--     cohorts: [ { week: 'YYYY-MM-DD', signups,
--                  first_consult|memos10|d30: { num, den, pending },
--                  trial_paid: { started, num, den, pending } } ]   ← 新しい週が先 }

create or replace function public.admin_launch_kpis(p_weeks int default 8)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  v_now timestamptz := now();
  v_week0 date;                 -- いちばん古い週の月曜（日本時間）
  v_base_from timestamptz;      -- 集計に入れる登録の下限（週の表と「全体」の両方をまかなう）
  v_has_trials boolean := to_regclass('public.subscription_events') is not null;
  v_trials jsonb := '{}'::jsonb; -- user_id → { t: 無料期間を始めた時刻, c: 有料に進んだ時刻 }
  v_trial_rows int := 0;
  v_more_use jsonb := '{}'::jsonb; -- user_id → true（③ の追加の証拠が 30〜37 日目にある人・2026-10-10）
  v_more_sql text := '';
  v_totals jsonb;
  v_cohorts jsonb;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_weeks, 8), 26));
  v_week0 := (date_trunc('week', v_now at time zone 'Asia/Tokyo'))::date - (n - 1) * 7;
  v_base_from := least(v_week0::timestamp at time zone 'Asia/Tokyo', v_now - interval '67 days');

  -- ④ の材料。表が無い DB でも関数が壊れないよう、表があるときだけ動的 SQL で読む。
  if v_has_trials then
    execute $q$
      with starts as (
        select e.user_id, min(e.event_at) as trial_at
        from public.subscription_events e
        where e.period_type = 'trial'
          and coalesce(e.environment, 'production') <> 'sandbox'
          and e.user_id not in (select user_id from public.app_admins)
        group by e.user_id
      ),
      conv as (
        select s.user_id, s.trial_at, (
          select min(e.event_at) from public.subscription_events e
          where e.user_id = s.user_id
            and e.event_at > s.trial_at
            and coalesce(e.environment, 'production') <> 'sandbox'
            and ((e.period_type = 'normal' and e.status = 'active') or e.is_trial_conversion is true)
        ) as conv_at
        from starts s
      )
      select
        coalesce(jsonb_object_agg(user_id::text, jsonb_build_object('t', trial_at, 'c', conv_at)), '{}'::jsonb),
        (select count(*)::int from public.subscription_events)
      from conv
    $q$ into v_trials, v_trial_rows;
  end if;

  -- ③ の追加の証拠（2026-10-10）。表・列があるものだけを or でつなぎ、動的 SQL で読む。
  if to_regclass('public.reading_sessions') is not null then
    v_more_sql := v_more_sql || ' or exists (select 1 from public.reading_sessions r where r.user_id = u.id'
      || ' and r.started_at >= u.created_at + interval ''30 days'' and r.started_at < u.created_at + interval ''37 days'')';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'actions' and column_name = 'completed_at') then
    v_more_sql := v_more_sql || ' or exists (select 1 from public.actions a where a.user_id = u.id'
      || ' and a.completed_at >= u.created_at + interval ''30 days'' and a.completed_at < u.created_at + interval ''37 days'')';
  end if;
  -- book_memos.last_recalled_at は数えない（通知を送っただけでも書かれる＝本人が使ったとは限らない・2026-10-10）。
  if v_more_sql <> '' then
    execute 'select coalesce(jsonb_object_agg(u.id::text, true), ''{}''::jsonb) from auth.users u'
      || ' where u.created_at >= $1 and u.id not in (select user_id from public.app_admins)'
      || ' and (false' || v_more_sql || ')'
      into v_more_use using v_base_from;
  end if;

  with base as (
    select u.id, u.created_at as s,
           (date_trunc('week', u.created_at at time zone 'Asia/Tokyo'))::date as wk
    from auth.users u
    where u.created_at >= v_base_from
      and u.id not in (select user_id from public.app_admins)
  ),
  flags as (
    select
      b.id, b.s, b.wk,
      -- ① 初日に相談
      (b.s <= v_now - interval '1 day') as e_consult,
      (
        exists (select 1 from public.chat_messages c
                where c.user_id = b.id and c.role = 'user'
                  and c.created_at >= b.s and c.created_at < b.s + interval '1 day')
        or exists (select 1 from public.analytics_events e
                   where e.user_id = b.id
                     and e.created_at >= b.s and e.created_at < b.s + interval '1 day'
                     and (e.event in ('first_consult_sent', 'brain_memo_answer', 'brain_lookup_local')
                          or (e.event = 'ai_used' and e.props->>'feature' = 'brain')))
      ) as h_consult,
      -- ② 7 日でメモ 10 件
      (b.s <= v_now - interval '7 days') as e_memo,
      (
        (select count(*) from (
           select 1 from public.book_memos m
           where m.user_id = b.id
             and m.created_at < b.s + interval '7 days'
             and (m.created_at >= b.s or exists (
                   select 1 from public.analytics_events e
                   where e.user_id = b.id and e.event = 'import_done'
                     and e.created_at >= b.s and e.created_at < b.s + interval '7 days'))
           limit 10) z) >= 10
        or exists (select 1 from public.analytics_events e
                   where e.user_id = b.id and e.event = 'memos_reached_10'
                     and e.created_at >= b.s and e.created_at < b.s + interval '7 days')
      ) as h_memo,
      -- ③ 30 日後も使っている（30〜37 日目）
      (b.s <= v_now - interval '37 days') as e_d30,
      (
        exists (select 1 from public.analytics_events e
                where e.user_id = b.id
                  and e.created_at >= b.s + interval '30 days' and e.created_at < b.s + interval '37 days')
        or exists (select 1 from public.book_memos m
                   where m.user_id = b.id
                     and m.created_at >= b.s + interval '30 days' and m.created_at < b.s + interval '37 days')
        or exists (select 1 from public.chat_messages c
                   where c.user_id = b.id
                     and c.created_at >= b.s + interval '30 days' and c.created_at < b.s + interval '37 days')
        or exists (select 1 from public.actions a
                   where a.user_id = b.id
                     and a.created_at >= b.s + interval '30 days' and a.created_at < b.s + interval '37 days')
        or (v_more_use ? (b.id::text))   -- 読む・行動の完了・思い出し（2026-10-10）
      ) as h_d30,
      -- ④ 7 日間無料 → 有料
      ((v_trials -> (b.id::text)) ->> 't')::timestamptz as trial_at,
      ((v_trials -> (b.id::text)) ->> 'c')::timestamptz as conv_at
    from base b
  ),
  weeks as (
    select (v_week0 + i * 7) as wk from generate_series(0, n - 1) as i
  ),
  coh as (
    select
      w.wk,
      count(f.id) as signups,
      count(f.id) filter (where f.e_consult) as c_den,
      count(f.id) filter (where f.e_consult and f.h_consult) as c_num,
      count(f.id) filter (where f.e_memo) as m_den,
      count(f.id) filter (where f.e_memo and f.h_memo) as m_num,
      count(f.id) filter (where f.e_d30) as r_den,
      count(f.id) filter (where f.e_d30 and f.h_d30) as r_num,
      count(f.id) filter (where f.trial_at is not null) as t_started,
      count(f.id) filter (where f.trial_at is not null and f.trial_at <= v_now - interval '8 days') as t_den,
      count(f.id) filter (where f.trial_at is not null and f.trial_at <= v_now - interval '8 days' and f.conv_at is not null) as t_num
    from weeks w
    left join flags f on f.wk = w.wk
    group by w.wk
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'week', to_char(coh.wk, 'YYYY-MM-DD'),
      'signups', coh.signups,
      'first_consult', jsonb_build_object('num', coh.c_num, 'den', coh.c_den, 'pending', coh.signups - coh.c_den),
      'memos10',       jsonb_build_object('num', coh.m_num, 'den', coh.m_den, 'pending', coh.signups - coh.m_den),
      'd30',           jsonb_build_object('num', coh.r_num, 'den', coh.r_den, 'pending', coh.signups - coh.r_den),
      'trial_paid',    jsonb_build_object('started', coh.t_started, 'num', coh.t_num, 'den', coh.t_den, 'pending', coh.t_started - coh.t_den)
    ) order by coh.wk desc), '[]'::jsonb),
    jsonb_build_object(
      'first_consult', (select jsonb_build_object(
          'num', count(*) filter (where f.h_consult), 'den', count(*),
          'pending', (select count(*) from flags g where not g.e_consult),
          'from', to_char((v_now - interval '31 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '1 day')  at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from flags f where f.s >= v_now - interval '31 days' and f.s < v_now - interval '1 day'),
      'memos10', (select jsonb_build_object(
          'num', count(*) filter (where f.h_memo), 'den', count(*),
          'pending', (select count(*) from flags g where not g.e_memo),
          'from', to_char((v_now - interval '37 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '7 days')  at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from flags f where f.s >= v_now - interval '37 days' and f.s < v_now - interval '7 days'),
      'd30', (select jsonb_build_object(
          'num', count(*) filter (where f.h_d30), 'den', count(*),
          'pending', (select count(*) from flags g where not g.e_d30 and g.s >= v_now - interval '67 days'),
          'from', to_char((v_now - interval '67 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '37 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from flags f where f.s >= v_now - interval '67 days' and f.s < v_now - interval '37 days'),
      'trial_paid', (select jsonb_build_object(
          'num', count(*) filter (where x.t >= v_now - interval '38 days' and x.t < v_now - interval '8 days' and x.c is not null),
          'den', count(*) filter (where x.t >= v_now - interval '38 days' and x.t < v_now - interval '8 days'),
          'pending', count(*) filter (where x.t >= v_now - interval '8 days'),
          'from', to_char((v_now - interval '38 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '8 days')  at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from (select (value->>'t')::timestamptz as t, (value->>'c')::timestamptz as c
              from jsonb_each(v_trials)) x)
    )
  into v_cohorts, v_totals
  from coh;

  return jsonb_build_object(
    'generated_at', v_now,
    'weeks', n,
    'sources', jsonb_build_object(
      'trial_history', v_has_trials,
      'trial_rows', v_trial_rows,
      'trial_starts', (select count(*) from jsonb_object_keys(v_trials))
    ),
    'totals', v_totals,
    'cohorts', v_cohorts
  );
end;
$$;
grant execute on function public.admin_launch_kpis(int) to authenticated;
