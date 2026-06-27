-- 🛡️ RLS 適用状況の検証クエリ（読み取り専用・本番で安全に実行可）。
--
-- セキュリティ監査で最重要に挙がった点: コアテーブル（books / book_memos /
-- actions / book_tags）の RLS は supabase_security_hardening.sql でのみ
-- 保証されており、これが未適用だと「全ユーザーのデータが他ユーザーから
-- 読める」最悪の事態になりうる。本ファイルを Supabase SQL Editor に貼って
-- 実行し、下記2つの結果が「期待値」と一致することを確認する。
-- 一致しない場合は supabase_security_hardening.sql を必ず実行すること。

-- ① 各テーブルで RLS が有効か（rls_enabled が全て t であること）。
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'books','book_memos','actions','book_tags','book_collections',
    'chat_messages','advisor_sessions','theme_reports','push_subscriptions',
    'subscriptions','ai_usage','analytics_events','feedback',
    'account_deletion_requests'
  )
order by c.relname;
-- 期待: 全行 rls_enabled = t

-- ② 各テーブルのポリシー数（コアテーブルは SELECT/INSERT/UPDATE/DELETE の
--    4 本が揃っているのが理想。subscriptions/ai_usage は SELECT のみ＝1 本、
--    append-only 系は 1〜2 本でよい）。
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
    'books','book_memos','actions','book_tags','book_collections',
    'chat_messages','advisor_sessions','theme_reports','push_subscriptions',
    'subscriptions','ai_usage','analytics_events','feedback',
    'account_deletion_requests'
  )
group by tablename
order by tablename;
-- 期待: books/book_memos/actions/book_tags/book_collections/advisor_sessions/
--       theme_reports/push_subscriptions = 4、subscriptions/ai_usage = 1（SELECT のみ）、
--       analytics_events = 2、feedback/chat_messages/account_deletion_requests ≥ 1

-- ③ 危険なポリシーが無いか（USING (true) / qual が null = 全開放、を検出）。
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or qual is null and cmd in ('SELECT','UPDATE','DELETE'));
-- 期待: 0 行（全開放ポリシーが存在しない）
