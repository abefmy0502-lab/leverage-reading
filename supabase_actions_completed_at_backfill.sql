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
