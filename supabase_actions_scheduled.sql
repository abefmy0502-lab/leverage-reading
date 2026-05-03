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
-- 削除:
DELETE FROM public.actions
 WHERE recurrence IS NOT NULL
   AND done = false
   AND deadline > current_date
   AND created_at < (current_date - interval '1 day');
