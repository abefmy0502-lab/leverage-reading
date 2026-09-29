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
