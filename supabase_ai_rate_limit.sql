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
