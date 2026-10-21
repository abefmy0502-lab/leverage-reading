-- 🔥 相談の指示文のキャッシュを温め直す時刻（2026-10-21・docs/ai-routing.md §7・冪等）
--
-- 相談の指示文（約 6,800 トークン・全員で同じ文）は AI 側に 1 時間キャッシュされ、使うたびに 1 時間延びる。
-- 1 時間だれも相談しないと消え、次の相談の最初の答えが 1 回 約 ¥1.6 → 約 ¥3.9 になる。
-- 中継（api/_consultWarm.js）は、温まっているあいだだけ（最後に使ってから 40〜57 分）、アプリが開かれたのを
-- きっかけに 1 回 約 ¥0.12 の短い呼び出しで延ばす。冷えたキャッシュを先に書くことはしない（相談が来ないと無駄になるため）。
--
-- この表は「最後に温まった時刻」を全インスタンスで共有するだけ。利用者の情報は入れない。
-- RLS 有効・ポリシー無し＝service_role（中継）だけが読み書きする。
-- 未適用なら温め直しはしない（今までどおり・壊れない）。

create table if not exists public.ai_cache_warm (
  key text primary key check (char_length(key) <= 32),
  warmed_at timestamptz not null default now()
);

alter table public.ai_cache_warm enable row level security;

-- 本物の相談でキャッシュが使われた・書かれたとき（中継が呼ぶ）。
create or replace function public.touch_ai_cache_warm(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_cache_warm (key, warmed_at) values (p_key, now())
  on conflict (key) do update set warmed_at = now();
$$;

-- 温め直してよいか（最後に温まってから p_min_age 秒以上・p_max_age 秒未満）を 1 文で確かめて取る。
-- 取れたら true（時刻を今にする＝ほかのインスタンスは重ねて呼ばない）。冷えている（行が無い・古すぎる）なら false。
create or replace function public.claim_ai_cache_refresh(p_key text, p_min_age integer, p_max_age integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  with c as (
    update public.ai_cache_warm
       set warmed_at = now()
     where key = p_key
       and warmed_at <= now() - make_interval(secs => p_min_age)
       and warmed_at > now() - make_interval(secs => p_max_age)
    returning 1
  )
  select exists (select 1 from c);
$$;

revoke all on function public.touch_ai_cache_warm(text) from public, anon, authenticated;
revoke all on function public.claim_ai_cache_refresh(text, integer, integer) from public, anon, authenticated;
grant execute on function public.touch_ai_cache_warm(text) to service_role;
grant execute on function public.claim_ai_cache_refresh(text, integer, integer) to service_role;
