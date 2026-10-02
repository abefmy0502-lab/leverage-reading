-- 🚀 ローンチの 4 つの数字（2026-10-02 オーナー承認・2026 年 11 月ローンチ）— 運営ダッシュボード用の集計。
--
-- ※ 依存: 先に supabase_admin_metrics.sql を適用すること（app_admins / _require_admin）。
--    あわせて supabase_analytics_events.sql（analytics_events）と supabase_chat_messages.sql
--    （chat_messages）が適用済みであること（どちらも本番では適用済みのはず）。
--    7 日間無料 → 有料 は supabase_subscription_events.sql（契約の履歴）が無いと「データなし」を返す
--    （この関数は表の有無を見てから読むので、順番が逆でも壊れない）。
-- 冪等（CREATE OR REPLACE）。管理者（app_admins）は全部の数字から除く。
--
-- 4 つの数字（定義と読み方は docs/launch-kpis.md）:
--   ① 初日に相談を体験した人の割合 = 登録から 24 時間以内に相談を送った人 ÷ 登録から 24 時間たった人
--      相談の証拠: chat_messages の role='user'（AI の答えを受けた相談）。
--      補助（あれば）: analytics_events の first_consult_sent / brain_memo_answer / brain_lookup_local /
--      ai_used(feature=brain)（メモが答える相談・メモで本を見つけた相談は chat_messages に残らないため）。
--   ② 7 日でメモ 10 件の割合 = 登録から 7 日以内にメモが 10 件以上になった人 ÷ 登録から 7 日たった人
--      数えるのは book_memos.created_at が [登録, 登録+7 日) のメモ。取り込み（ブクログ等）のメモは
--      元の日付で入るので、登録より前の日付のメモは「7 日以内に import_done がある人」だけ数える。
--      補助（あれば）: analytics_events の memos_reached_10（7 日以内）。
--   ③ 30 日後も使っている割合 = 登録から 30〜37 日目（30 日後からの 1 週間）に 1 回でも使った人 ÷ 登録から 37 日たった人
--      使った証拠: analytics_events（何でも）/ book_memos / chat_messages / actions の作成。
--   ④ 7 日間無料 → 有料の割合 = 無料期間を始めて 8 日たった人のうち、有料に進んだ人
--      無料期間の始まり: subscription_events の period_type が trial の最初の行。
--      （'intro' は有料の初回価格＝創業メンバー価格「1 年目 ¥9,800」で、無料期間ではない。分母にも分子の
--       「無料期間の始まり」にも数えない・2026-10-02。再適用で反映）
--      有料に進んだ: その後の行で（period_type='normal' かつ status='active'）または is_trial_conversion。
--      8 日 = 7 日間＋更新の処理の 1 日。サンドボックスは除く。
--
-- 週ごと: 登録した週（日本時間の月曜はじまり）で分け、各数字の 分子 / 分母 / 判定待ち（まだ日数がたっていない人）。
-- 全体: 「直近 30 日に結果が決まった人」。数字ごとに決まるまでの日数が違うので、登録日の範囲がずれる:
--   ① 登録が 31〜1 日前 ② 37〜7 日前 ③ 67〜37 日前 ④ 無料期間を始めたのが 38〜8 日前。範囲（from / to）も返す。
--
-- 返り値（jsonb）:
--   { generated_at, weeks, sources: { trial_history, trial_rows },
--     totals: { first_consult|memos10|d30|trial_paid: { num, den, pending, from, to } },
--     cohorts: [ { week: 'YYYY-MM-DD', signups,
--                  first_consult|memos10|d30: { num, den, pending },
--                  trial_paid: { started, num, den, pending } } ]   ← 新しい週が先 }

create or replace function public.admin_launch_kpis(p_weeks int default 8)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  v_now timestamptz := now();
  v_week0 date;                 -- いちばん古い週の月曜（日本時間）
  v_base_from timestamptz;      -- 集計に入れる登録の下限（週の表と「全体」の両方をまかなう）
  v_has_trials boolean := to_regclass('public.subscription_events') is not null;
  v_trials jsonb := '{}'::jsonb; -- user_id → { t: 無料期間を始めた時刻, c: 有料に進んだ時刻 }
  v_trial_rows int := 0;
  v_totals jsonb;
  v_cohorts jsonb;
begin
  perform public._require_admin();
  n := greatest(1, least(coalesce(p_weeks, 8), 26));
  v_week0 := (date_trunc('week', v_now at time zone 'Asia/Tokyo'))::date - (n - 1) * 7;
  v_base_from := least(v_week0::timestamp at time zone 'Asia/Tokyo', v_now - interval '67 days');

  -- ④ の材料。表が無い DB でも関数が壊れないよう、表があるときだけ動的 SQL で読む。
  if v_has_trials then
    execute $q$
      with starts as (
        select e.user_id, min(e.event_at) as trial_at
        from public.subscription_events e
        where e.period_type = 'trial'
          and coalesce(e.environment, 'production') <> 'sandbox'
          and e.user_id not in (select user_id from public.app_admins)
        group by e.user_id
      ),
      conv as (
        select s.user_id, s.trial_at, (
          select min(e.event_at) from public.subscription_events e
          where e.user_id = s.user_id
            and e.event_at > s.trial_at
            and coalesce(e.environment, 'production') <> 'sandbox'
            and ((e.period_type = 'normal' and e.status = 'active') or e.is_trial_conversion is true)
        ) as conv_at
        from starts s
      )
      select
        coalesce(jsonb_object_agg(user_id::text, jsonb_build_object('t', trial_at, 'c', conv_at)), '{}'::jsonb),
        (select count(*)::int from public.subscription_events)
      from conv
    $q$ into v_trials, v_trial_rows;
  end if;

  with base as (
    select u.id, u.created_at as s,
           (date_trunc('week', u.created_at at time zone 'Asia/Tokyo'))::date as wk
    from auth.users u
    where u.created_at >= v_base_from
      and u.id not in (select user_id from public.app_admins)
  ),
  flags as (
    select
      b.id, b.s, b.wk,
      -- ① 初日に相談
      (b.s <= v_now - interval '1 day') as e_consult,
      (
        exists (select 1 from public.chat_messages c
                where c.user_id = b.id and c.role = 'user'
                  and c.created_at >= b.s and c.created_at < b.s + interval '1 day')
        or exists (select 1 from public.analytics_events e
                   where e.user_id = b.id
                     and e.created_at >= b.s and e.created_at < b.s + interval '1 day'
                     and (e.event in ('first_consult_sent', 'brain_memo_answer', 'brain_lookup_local')
                          or (e.event = 'ai_used' and e.props->>'feature' = 'brain')))
      ) as h_consult,
      -- ② 7 日でメモ 10 件
      (b.s <= v_now - interval '7 days') as e_memo,
      (
        (select count(*) from (
           select 1 from public.book_memos m
           where m.user_id = b.id
             and m.created_at < b.s + interval '7 days'
             and (m.created_at >= b.s or exists (
                   select 1 from public.analytics_events e
                   where e.user_id = b.id and e.event = 'import_done'
                     and e.created_at >= b.s and e.created_at < b.s + interval '7 days'))
           limit 10) z) >= 10
        or exists (select 1 from public.analytics_events e
                   where e.user_id = b.id and e.event = 'memos_reached_10'
                     and e.created_at >= b.s and e.created_at < b.s + interval '7 days')
      ) as h_memo,
      -- ③ 30 日後も使っている（30〜37 日目）
      (b.s <= v_now - interval '37 days') as e_d30,
      (
        exists (select 1 from public.analytics_events e
                where e.user_id = b.id
                  and e.created_at >= b.s + interval '30 days' and e.created_at < b.s + interval '37 days')
        or exists (select 1 from public.book_memos m
                   where m.user_id = b.id
                     and m.created_at >= b.s + interval '30 days' and m.created_at < b.s + interval '37 days')
        or exists (select 1 from public.chat_messages c
                   where c.user_id = b.id
                     and c.created_at >= b.s + interval '30 days' and c.created_at < b.s + interval '37 days')
        or exists (select 1 from public.actions a
                   where a.user_id = b.id
                     and a.created_at >= b.s + interval '30 days' and a.created_at < b.s + interval '37 days')
      ) as h_d30,
      -- ④ 7 日間無料 → 有料
      ((v_trials -> (b.id::text)) ->> 't')::timestamptz as trial_at,
      ((v_trials -> (b.id::text)) ->> 'c')::timestamptz as conv_at
    from base b
  ),
  weeks as (
    select (v_week0 + i * 7) as wk from generate_series(0, n - 1) as i
  ),
  coh as (
    select
      w.wk,
      count(f.id) as signups,
      count(f.id) filter (where f.e_consult) as c_den,
      count(f.id) filter (where f.e_consult and f.h_consult) as c_num,
      count(f.id) filter (where f.e_memo) as m_den,
      count(f.id) filter (where f.e_memo and f.h_memo) as m_num,
      count(f.id) filter (where f.e_d30) as r_den,
      count(f.id) filter (where f.e_d30 and f.h_d30) as r_num,
      count(f.id) filter (where f.trial_at is not null) as t_started,
      count(f.id) filter (where f.trial_at is not null and f.trial_at <= v_now - interval '8 days') as t_den,
      count(f.id) filter (where f.trial_at is not null and f.trial_at <= v_now - interval '8 days' and f.conv_at is not null) as t_num
    from weeks w
    left join flags f on f.wk = w.wk
    group by w.wk
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'week', to_char(coh.wk, 'YYYY-MM-DD'),
      'signups', coh.signups,
      'first_consult', jsonb_build_object('num', coh.c_num, 'den', coh.c_den, 'pending', coh.signups - coh.c_den),
      'memos10',       jsonb_build_object('num', coh.m_num, 'den', coh.m_den, 'pending', coh.signups - coh.m_den),
      'd30',           jsonb_build_object('num', coh.r_num, 'den', coh.r_den, 'pending', coh.signups - coh.r_den),
      'trial_paid',    jsonb_build_object('started', coh.t_started, 'num', coh.t_num, 'den', coh.t_den, 'pending', coh.t_started - coh.t_den)
    ) order by coh.wk desc), '[]'::jsonb),
    jsonb_build_object(
      'first_consult', (select jsonb_build_object(
          'num', count(*) filter (where f.h_consult), 'den', count(*),
          'pending', (select count(*) from flags g where not g.e_consult),
          'from', to_char((v_now - interval '31 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '1 day')  at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from flags f where f.s >= v_now - interval '31 days' and f.s < v_now - interval '1 day'),
      'memos10', (select jsonb_build_object(
          'num', count(*) filter (where f.h_memo), 'den', count(*),
          'pending', (select count(*) from flags g where not g.e_memo),
          'from', to_char((v_now - interval '37 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '7 days')  at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from flags f where f.s >= v_now - interval '37 days' and f.s < v_now - interval '7 days'),
      'd30', (select jsonb_build_object(
          'num', count(*) filter (where f.h_d30), 'den', count(*),
          'pending', (select count(*) from flags g where not g.e_d30 and g.s >= v_now - interval '67 days'),
          'from', to_char((v_now - interval '67 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '37 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from flags f where f.s >= v_now - interval '67 days' and f.s < v_now - interval '37 days'),
      'trial_paid', (select jsonb_build_object(
          'num', count(*) filter (where x.t >= v_now - interval '38 days' and x.t < v_now - interval '8 days' and x.c is not null),
          'den', count(*) filter (where x.t >= v_now - interval '38 days' and x.t < v_now - interval '8 days'),
          'pending', count(*) filter (where x.t >= v_now - interval '8 days'),
          'from', to_char((v_now - interval '38 days') at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
          'to',   to_char((v_now - interval '8 days')  at time zone 'Asia/Tokyo', 'YYYY-MM-DD'))
        from (select (value->>'t')::timestamptz as t, (value->>'c')::timestamptz as c
              from jsonb_each(v_trials)) x)
    )
  into v_cohorts, v_totals
  from coh;

  return jsonb_build_object(
    'generated_at', v_now,
    'weeks', n,
    'sources', jsonb_build_object(
      'trial_history', v_has_trials,
      'trial_rows', v_trial_rows,
      'trial_starts', (select count(*) from jsonb_object_keys(v_trials))
    ),
    'totals', v_totals,
    'cohorts', v_cohorts
  );
end;
$$;
grant execute on function public.admin_launch_kpis(int) to authenticated;
