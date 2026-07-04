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
