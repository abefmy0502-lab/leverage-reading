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
