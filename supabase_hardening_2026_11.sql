-- 🛡 DB の守りの追加（2026-11-26 監査・M3／L4）
--
-- 1. 利用者が書ける列の大きさの上限（「登録せずに始める」でアカウントはタダで作れるので、1 つのアカウントが
--    数 MB の行を繰り返し入れて DB を埋め、全体を読み取り専用にできた）。数字はアプリの上限（src/lib/limits.js）の約 2 倍。
--    既にある行は壊さない（NOT VALID＝これから入れる・直す行だけを確かめる）。表・列が無ければ飛ばす。
-- 2. 運営の表（ops_tasks・ops_advisor_messages）は管理者だけ（前は誰でも自分の行を書けた）。
--    書き手は運営の道具（service_role）なので、ふつうの利用者は使わない。
-- 3. 記録の時刻は利用者が決められない（analytics_events・chat_messages の created_at をサーバーの今にする＝
--    ローンチの数字をずらせた）。service_role と SQL Editor（運営の作業）はそのまま。
-- 冪等。何度流しても同じ。

-- ─── 1. 大きさの上限 ─────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('chat_messages',        'chat_messages_size_chk',        'content',          'char_length(content) <= 20000'),
      ('chat_messages',        'chat_messages_refs_size_chk',   'refs',             'refs is null or pg_column_size(refs) < 16384'),
      ('book_memos',           'book_memos_text_len',           'text',             'text is null or char_length(text) <= 10000'),
      ('books',                'books_memo_len',                'leverage_memo',    'leverage_memo is null or char_length(leverage_memo) <= 100000'),
      ('advisor_sessions',     'advisor_sessions_size_chk',     'messages',         'pg_column_size(messages) + pg_column_size(recommended_books) < 262144'),
      ('analytics_events',     'analytics_events_event_len',    'event',            'char_length(event) <= 64'),
      ('ops_advisor_messages', 'ops_advisor_messages_len',      'content',          'char_length(content) <= 20000'),
      ('ops_tasks',            'ops_tasks_title_len',           'title',            'char_length(title) <= 500'),
      ('theme_reports',        'theme_reports_content_len',     'content',          'content is null or char_length(content) <= 100000')
    ) as t(tbl, conname, col, expr)
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tbl and column_name = r.col)
       and not exists (select 1 from pg_constraint where conname = r.conname) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.conname, r.expr);
    end if;
  end loop;
end $$;

-- ─── 2. 運営の表は管理者だけ ─────────────────────────────
do $$
begin
  if to_regclass('public.ops_tasks') is not null and to_regprocedure('public.is_app_admin()') is not null then
    drop policy if exists "ops_tasks_all_own" on public.ops_tasks;
    create policy "ops_tasks_all_own" on public.ops_tasks for all to authenticated
      using (auth.uid() = user_id and public.is_app_admin())
      with check (auth.uid() = user_id and public.is_app_admin());
  end if;
  if to_regclass('public.ops_advisor_messages') is not null and to_regprocedure('public.is_app_admin()') is not null then
    drop policy if exists "ops_advisor_select_own" on public.ops_advisor_messages;
    create policy "ops_advisor_select_own" on public.ops_advisor_messages for select to authenticated
      using (auth.uid() = user_id and public.is_app_admin());
    drop policy if exists "ops_advisor_insert_own" on public.ops_advisor_messages;
    create policy "ops_advisor_insert_own" on public.ops_advisor_messages for insert to authenticated
      with check (auth.uid() = user_id and public.is_app_admin());
    drop policy if exists "ops_advisor_delete_own" on public.ops_advisor_messages;
    create policy "ops_advisor_delete_own" on public.ops_advisor_messages for delete to authenticated
      using (auth.uid() = user_id and public.is_app_admin());
  end if;
end $$;

-- ─── 3. 記録の時刻はサーバーの今 ─────────────────────────────
create or replace function public.force_created_now()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 利用者（authenticated・anon）が入れるときだけ。service_role と SQL Editor はそのまま（運営の作業・移し替え）。
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.analytics_events') is not null then
    drop trigger if exists analytics_events_created_now on public.analytics_events;
    create trigger analytics_events_created_now before insert on public.analytics_events
      for each row execute function public.force_created_now();
  end if;
  if to_regclass('public.chat_messages') is not null then
    drop trigger if exists chat_messages_created_now on public.chat_messages;
    create trigger chat_messages_created_now before insert on public.chat_messages
      for each row execute function public.force_created_now();
  end if;
end $$;
