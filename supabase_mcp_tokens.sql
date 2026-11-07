-- 🔌 AI と連携（MCP）の接続キー（2026-11-07 オーナー「アプリと AI が繋がるようにしたい」）
--
-- 利用者が Claude・ChatGPT・Claude Code などの AI から、自分の本・メモ・行動を呼べるようにする
-- Orime の MCP サーバー（api/mcp.js）の鍵。キーそのものは保存せず、SHA-256 のハッシュだけを持つ
-- （キーは作ったその場で 1 回だけ見せる・なくしたら作り直す）。
--
-- 書き手:
--   - アプリ（本人・RLS）: 作る（insert）・名前を変える／取り消す（update）・消す（delete）・一覧（select）
--   - サーバー（service_role）: ハッシュで探して本人を決め、last_used_at を更新する
-- 取り消したキー（revoked_at が入った行）は、サーバーが受け付けない。
-- 退会はアプリが本人の行を消す（auth.users の削除でも ON DELETE CASCADE で消える）。
-- 未適用でも壊れない: 設定の「AI と連携」が「まだ使えません」の案内になるだけ。
-- 冪等（何度流しても同じ）。Supabase の SQL Editor に貼って実行する。

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mcp_tokens_hash_check') then
    -- SHA-256 の 16 進（64 字・小文字）だけ。
    alter table public.mcp_tokens add constraint mcp_tokens_hash_check check (token_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mcp_tokens_name_check') then
    alter table public.mcp_tokens add constraint mcp_tokens_name_check check (char_length(name) <= 60);
  end if;
end $$;

-- サーバーがハッシュで探す（1 つのキーは 1 行）。
create unique index if not exists mcp_tokens_hash_uq on public.mcp_tokens (token_hash);
create index if not exists mcp_tokens_user_idx on public.mcp_tokens (user_id, created_at desc);

-- RLS: 本人の行だけ。
alter table public.mcp_tokens enable row level security;

drop policy if exists "mcp_tokens_select_own" on public.mcp_tokens;
create policy "mcp_tokens_select_own" on public.mcp_tokens
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "mcp_tokens_insert_own" on public.mcp_tokens;
create policy "mcp_tokens_insert_own" on public.mcp_tokens
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "mcp_tokens_update_own" on public.mcp_tokens;
create policy "mcp_tokens_update_own" on public.mcp_tokens
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mcp_tokens_delete_own" on public.mcp_tokens;
create policy "mcp_tokens_delete_own" on public.mcp_tokens
  for delete to authenticated using (auth.uid() = user_id);
