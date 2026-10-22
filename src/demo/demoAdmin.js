// 🧪 お試しモードの運営ダッシュボード（?admin=1）。開発専用・本番バンドル外。
//
// ?admin=1 で is_app_admin が true になり、設定に「運営」→「運営ダッシュボード」が出る。
// admin_* の RPC はここのサンプルを返す。
//   &goal=ontrack   … （既定）公開から 3 か月・2027-02-15（月曜）の時点で「予定どおり」。いちばん弱い段階は ⑤ メモ
//   &goal=behind    … 同じ日で「大きな遅れ」（強い警告）。いちばん弱い段階は ⑦ 7 日間無料 → 有料
//   &goal=prelaunch … 今日（公開前）・数はまだ 0
//   &goal=missing   … supabase_admin_goal.sql 未適用（週ごとの流れ・道しるべ・見直しの記録が無い）
//   &goal=reviewed  … 予定どおり＋今週の見直しを記録済み（月曜の 1 行が出ない）
//   &kpi=missing    … admin_launch_kpis が無い（supabase_admin_launch_kpis.sql 未適用）
//   &kpi=notrial    … 契約の履歴（subscription_events）が無い → 7 日間無料 → 有料 は「データなし」
//   &kpi=empty      … ローンチ前（登録 0 人）

const DAY = 86400000;
const LAUNCH = '2026-11-17';
const SCENE_DAY = '2027-02-15'; // 月曜（日本時間）

function goalMode(params) {
  const g = params.get('goal');
  return ['behind', 'prelaunch', 'missing', 'reviewed'].includes(g) ? g : 'ontrack';
}

// 集計した時刻（日本時間の昼）。公開前の形だけ本当の今。
function refNow(params) {
  return goalMode(params) === 'prelaunch' ? new Date() : new Date(`${SCENE_DAY}T03:00:00Z`);
}

const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const jst = (d) => isoOf(d.getTime() + 9 * 3600000);

// 日本時間の月曜（ref の週）から n 週前。
function mondayIso(ref, weeksAgo) {
  const today = jst(ref);
  const t = Date.parse(`${today}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return isoOf(t - (dow + weeksAgo * 7) * DAY);
}
const daysAgoIso = (ref, n) => jst(new Date(ref.getTime() - n * DAY));

// ── 公開からの週ごとのサンプル（新しい週が先・12 週）。ref の週がいちばん上（途中）。
function goalSeries(params) {
  const mode = goalMode(params);
  const ref = refNow(params);
  const behind = mode === 'behind';
  const weeks = Array.from({ length: 12 }, (_, i) => mondayIso(ref, i));
  const launchWeek = '2026-11-16';
  // 公開の週から ref の週まで、古い順に積み上げる。
  const all = [];
  let paid = 0; let annual = 0;
  for (let t = Date.parse(`${launchWeek}T00:00:00Z`), k = 0; isoOf(t) <= weeks[0]; t += 7 * DAY, k += 1) {
    const week = isoOf(t);
    const partial = week === weeks[0] ? 0.15 : 1; // 今週は月曜だけ
    const newPaid = Math.round((behind ? 3 + 0.6 * k : 4 + 1.5 * k) * partial);
    const newAnnual = Math.round(newPaid * (behind ? 0.3 : 0.45));
    const churned = Math.round((paid - annual) * (behind ? 0.025 : 0.012) * partial);
    paid += newPaid - churned; annual += newAnnual;
    const lp = Math.round((behind ? 520 + 15 * k : 600 + 60 * k) * partial);
    const installs = Math.round((behind ? 300 + 8 * k : 360 + 30 * k) * partial);
    const signups = Math.round(installs * 0.62);
    const trialStarts = Math.round(signups * (behind ? 0.11 : 0.12));
    const settled = week <= mondayIso(ref, 2);
    const trialRate = behind ? 0.24 : 0.42;
    all.push({
      week, k,
      lp_views: lp,
      lp_views_by_variant: { illust: Math.round(lp * 0.52), photo: lp - Math.round(lp * 0.52) },
      lp_clicks: Math.round(lp * 0.06),
      lp_clicks_by_variant: { illust: Math.round(lp * 0.034), photo: Math.round(lp * 0.06) - Math.round(lp * 0.034) },
      signups, trial_starts: trialStarts,
      trial_paid: settled ? { num: Math.round(trialStarts * trialRate), den: trialStarts, pending: 0 } : { num: 0, den: 0, pending: trialStarts },
      new_paid: newPaid, new_paid_annual: newAnnual, churned, churned_annual: 0,
      paid_end: paid, paid_annual_end: annual,
      installs, store_page_views: Math.round(installs / 0.33),
      founding: week <= '2026-12-14' ? newAnnual : 0,
    });
  }
  const rows = all.slice().reverse().slice(0, 12);
  const founding = all.reduce((s, r) => s + r.founding, 0);
  return { ref, rows, paid, annual, founding, mode };
}

function goalWeekly(params) {
  const s = goalSeries(params);
  if (s.mode === 'prelaunch') {
    return {
      generated_at: s.ref.toISOString(), weeks: 12,
      sources: { subscription_events: true, lp_events: true, subscriptions: true },
      now: { paid: 0, paid_annual: 0, trial: 0 }, founding: { count: 0, renew_from: null, renew_to: null, by_month: {} },
      share_users_28d: 0,
      rows: Array.from({ length: 12 }, (_, i) => ({
        week: mondayIso(s.ref, i), lp_views: 0, lp_views_by_variant: {}, lp_clicks: 0, lp_clicks_by_variant: {}, signups: 0,
        trial_starts: 0, trial_paid: { num: 0, den: 0, pending: 0 }, new_paid: 0, new_paid_annual: 0, churned: 0, churned_annual: 0,
        paid_end: 0, paid_annual_end: 0,
      })),
    };
  }
  return {
    generated_at: s.ref.toISOString(), weeks: 12,
    sources: { subscription_events: true, lp_events: true, subscriptions: true },
    now: { paid: s.paid, paid_annual: s.annual, trial: s.mode === 'behind' ? 9 : 21 },
    founding: { count: s.founding, renew_from: '2027-11-17', renew_to: '2027-12-16', by_month: { '2027-11': Math.round(s.founding * 0.6), '2027-12': s.founding - Math.round(s.founding * 0.6) } },
    share_users_28d: s.mode === 'behind' ? 6 : 18,
    rows: s.rows.map(({ k: _k, installs: _i, store_page_views: _v, founding: _f, ...r }) => r),
  };
}

function launchKpis(mode, params) {
  const ref = refNow(params);
  const iso = (n) => daysAgoIso(ref, n);
  const g = goalMode(params);
  if (mode === 'empty' || g === 'prelaunch') {
    return {
      generated_at: ref.toISOString(), weeks: 12,
      sources: { trial_history: true, trial_rows: 0, trial_starts: 0 },
      totals: {
        first_consult: { num: 0, den: 0, pending: 0, from: iso(31), to: iso(1) },
        memos10: { num: 0, den: 0, pending: 0, from: iso(37), to: iso(7) },
        d30: { num: 0, den: 0, pending: 0, from: iso(67), to: iso(37) },
        trial_paid: { num: 0, den: 0, pending: 0, from: iso(38), to: iso(8) },
      },
      cohorts: Array.from({ length: 12 }, (_, i) => ({
        week: mondayIso(ref, i), signups: 0,
        first_consult: { num: 0, den: 0, pending: 0 }, memos10: { num: 0, den: 0, pending: 0 },
        d30: { num: 0, den: 0, pending: 0 }, trial_paid: { started: 0, num: 0, den: 0, pending: 0 },
      })),
    };
  }
  const behind = g === 'behind';
  const s = goalSeries(params);
  const noTrial = mode === 'notrial';
  const fcRate = behind ? 0.51 : 0.53; const mRate = behind ? 0.31 : 0.24; const dRate = behind ? 0.26 : 0.27;
  const cohorts = s.rows.map((r, i) => {
    const sgn = r.signups;
    const c = i === 0 ? Math.round(sgn * 0.7) : sgn; // 今週はまだ 24 時間たっていない人がいる
    const m = i === 0 ? 0 : sgn;
    const d = i >= 6 ? sgn : 0;
    return {
      week: r.week, signups: sgn,
      first_consult: { num: Math.round(c * fcRate), den: c, pending: sgn - c },
      memos10: { num: Math.round(m * mRate), den: m, pending: sgn - m },
      d30: { num: Math.round(d * dRate), den: d, pending: sgn - d },
      trial_paid: noTrial ? { started: 0, num: 0, den: 0, pending: 0 } : { started: r.trial_starts, num: r.trial_paid.num, den: r.trial_paid.den, pending: r.trial_paid.pending },
    };
  });
  const sum = (key, from, to) => cohorts.slice(from, to).reduce((a, c) => ({ num: a.num + c[key].num, den: a.den + c[key].den }), { num: 0, den: 0 });
  const tp = sum('trial_paid', 2, 7);
  return {
    generated_at: ref.toISOString(), weeks: 12,
    sources: noTrial ? { trial_history: false, trial_rows: 0, trial_starts: 0 } : { trial_history: true, trial_rows: 640, trial_starts: 310 },
    totals: {
      first_consult: { ...sum('first_consult', 0, 5), pending: cohorts[0].first_consult.pending, from: iso(31), to: iso(1) },
      memos10: { ...sum('memos10', 1, 6), pending: cohorts[0].signups, from: iso(37), to: iso(7) },
      d30: { ...sum('d30', 6, 10), pending: 900, from: iso(67), to: iso(37) },
      trial_paid: noTrial ? { num: 0, den: 0, pending: 0, from: iso(38), to: iso(8) } : { ...tp, pending: cohorts[0].trial_paid.pending + cohorts[1].trial_paid.pending, from: iso(38), to: iso(8) },
    },
    cohorts,
  };
}

// 画面で保存した目標（admin_set_goal_plan）。再読み込みで消える。
let savedPlan = null;

function samples(params) {
  const s = goalSeries(params);
  const pre = s.mode === 'prelaunch';
  const ref = s.ref;
  return {
    admin_overview: () => ({
      users_total: pre ? 0 : 2840, new_users_7d: pre ? 0 : 310, new_users_30d: pre ? 0 : 1240, dau: pre ? 0 : 410, wau: pre ? 0 : 960, mau: pre ? 0 : 1580,
      books_total: 12400, memos_total: 53100, actions_total: 4020, actions_done: 1880, subs_active: s.paid, feedback_open: 3,
    }),
    admin_active_series: () => Array.from({ length: 30 }, (_, i) => ({ d: daysAgoIso(ref, 29 - i).slice(5).replace('-', '/'), active: 10 + ((i * 7) % 30), new_books: (i * 3) % 9 })),
    admin_feature_usage: () => ({ events: { app_open: 19000, memo_added: 8200, book_added: 4100, ai_used: 3600, paywall_viewed: 1200, checkout_completed: 140, share_card: 90 }, ai_features: { brain: 3000, ocr: 400, condense: 200 } }),
    admin_ai_usage: () => [{ month: jst(ref).slice(0, 7), calls: 4200, users: 600 }],
    admin_revenue: () => ({ active: s.paid, founding: s.founding, trial: s.mode === 'behind' ? 9 : 21, canceled: 12, by_status: { active: s.paid, canceled: 12 }, expiring_30d: 14 }),
    admin_feedback: () => [],
    admin_get_goal: () => ({ metric: 'paid_users', target: 1000, deadline: '2027-12-31' }),
    admin_tickets: () => [],
    admin_growth: () => ({ retention: { d1_num: 900, d1_den: 1720, d7_num: 400, d7_den: 1580, d30_num: 50, d30_den: 210 }, paid_new_by_month: [], subs_total: 160, subs_active: s.paid, subs_canceled: 12, paid_new_this_month: 60 }),
    admin_goal_plan: () => savedPlan,
    admin_goal_weekly: () => goalWeekly(params),
    // 💰 今月の売上と推定の粗利（supabase_admin_profit.sql）。&profit=missing で SQL が無い DB。
    admin_profit: () => ({
      month: jst(ref).slice(0, 7), generated_at: ref.toISOString(),
      paid: { monthly: Math.max(0, s.paid - s.annual - s.founding), annual: s.annual, founding: s.founding, trial: s.mode === 'behind' ? 9 : 21 },
      packs: pre ? {} : { orime_tokens_300: 6, orime_tokens_1000: 2 },
      ai_cost_mjpy: pre ? 0 : s.paid * 79000, fields_ai_calls: pre ? 0 : 340,
      purpose_mjpy: pre ? {} : { consult: s.paid * 63000, book_advisor: s.paid * 7000, advisor_interview: s.paid * 2000, setup_sheet: s.paid * 3000, book_brief: s.paid * 1500, ocr: s.paid * 1500, condense: s.paid * 500, cards_to_summary: s.paid * 500 },
      paid_users_ai: pre ? { users: 0, over_half: 0, top_mjpy: 0 } : { users: Math.round(s.paid * 0.7), over_half: 3, top_mjpy: 236000 },
    }),
    // 直近 12 か月の推移（公開の月から有料が増える・解約は少し）。
    admin_profit_series: () => Array.from({ length: 12 }, (_, i) => {
      const m = new Date(ref.getFullYear(), ref.getMonth() - (11 - i), 1);
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const t = Math.max(0, i - 8); // 公開は 4 か月前
      const paid = pre ? 0 : Math.round(s.paid * Math.min(1, t / 3));
      const annual = Math.round(paid * 0.5);
      const founding = Math.min(s.founding, Math.round(paid * 0.12));
      return { month, paid: { monthly: paid - annual - founding, annual, founding, trial: paid > 0 ? 12 : 0 },
        packs: paid > 0 ? { orime_tokens_300: Math.round(paid / 20), orime_tokens_1000: Math.round(paid / 60) } : {},
        ai_cost_mjpy: paid * 79000, fields_ai_calls: paid > 0 ? 200 + i * 10 : 0, churned: paid > 0 ? Math.round(paid * 0.03) : 0 };
    }),
    // 次の 12 か月の更新の見込み（年額は 11〜12 月に山＝創業メンバー）。
    admin_renewals: () => Array.from({ length: 12 }, (_, i) => {
      const m = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const mo = m.getMonth() + 1;
      return { month, monthly: pre ? 0 : Math.max(0, s.paid - s.annual - s.founding), annual: pre ? 0 : (mo === 11 || mo === 12 ? Math.round(s.annual * 0.4) : Math.round(s.annual * 0.02)), founding: pre ? 0 : (mo === 11 ? Math.round(s.founding * 0.6) : mo === 12 ? Math.round(s.founding * 0.4) : 0) };
    }),
  };
}

// 運営の表（ops_sales_metrics の手入力・ops_weekly_reviews の見直し）のサンプル。demoClient が ?admin=1 のときに呼ぶ。
export function seedAdminDemo(db, params, userId) {
  const s = goalSeries(params);
  if (s.mode === 'prelaunch') return;
  const at = s.ref.toISOString();
  db.ops_sales_metrics = s.rows.slice(1).map((r, i) => ({
    id: `00000000-0000-4000-8000-0000000a${String(100 + i).padStart(4, '0')}`, user_id: userId, week_start: r.week,
    new_paid: r.new_paid, installs: r.installs, store_page_views: r.store_page_views, lp_clicks: r.lp_clicks,
    note_pv: 1200 + i * 40, x_profile_clicks: 90 + i * 3, memo: null, created_at: at, updated_at: at,
  }));
  if (s.mode === 'missing') return;
  const reviewWeeks = s.mode === 'reviewed' ? [0, 1, 2, 3] : [1, 2, 3];
  db.ops_weekly_reviews = reviewWeeks.map((i) => {
    const r = s.rows[i];
    return {
      id: `00000000-0000-4000-8000-0000000b${String(100 + i).padStart(4, '0')}`, user_id: userId, week_start: r.week,
      numbers: { paid: r.paid_end, planned: s.mode === 'behind' ? r.paid_end + 30 : Math.max(0, r.paid_end - 8), behind: s.mode === 'behind' ? 30 : 0, need_per_week: 19, net_4w: s.mode === 'behind' ? 6.5 : 13.2, forecast: s.mode === 'behind' ? 480 : 1010, weakest: s.mode === 'behind' ? 'trial_paid' : 'memos10' },
      actions: i === 1 ? ['取り込み（ブクログ・読書メーター）を初日クイックスタートとホームで案内'] : [],
      weakest: s.mode === 'behind' ? 'trial_paid' : 'memos10',
      memo: i === 1 ? '7 日でメモ 10 件が 24%。取り込みの案内を前に出す。' : null,
      created_at: at, updated_at: at,
    };
  });
}

// demoClient の rpc から呼ぶ。admin の RPC でなければ null（＝今までどおり「無い」）。
export function demoAdminRpc(name, params, args = {}) {
  const kpi = params.get('kpi');
  const missing = (n) => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${n}` } });
  if (name === 'admin_launch_kpis') {
    if (kpi === 'missing') return missing(name);
    return { data: launchKpis(kpi, params), error: null };
  }
  if (['admin_goal_plan', 'admin_goal_weekly', 'admin_set_goal_plan'].includes(name) && goalMode(params) === 'missing') return missing(name);
  if (['admin_profit', 'admin_profit_series', 'admin_renewals'].includes(name) && params.get('profit') === 'missing') return missing(name);
  // &profit=error＝読み込みの失敗・&profit=loading＝読み込み中のまま（ProfitCard の状態の撮影用）。
  if (['admin_profit', 'admin_profit_series', 'admin_renewals'].includes(name) && params.get('profit') === 'error') return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
  if (['admin_profit', 'admin_profit_series', 'admin_renewals'].includes(name) && params.get('profit') === 'loading') return new Promise(() => {});
  if (name === 'admin_set_goal_plan') {
    savedPlan = { metric: 'paid_users', target: args.p_target, deadline: args.p_deadline, milestones: args.p_milestones, launch_date: args.p_launch || LAUNCH };
    return { data: null, error: null };
  }
  const table = samples(params);
  if (table[name]) return { data: table[name](), error: null };
  return null;
}

// ?goal=missing のとき、見直しの表が無い DB と同じ答えにする（demoClient の読み出しが使う）。
export function demoAdminTableMissing(table, params) {
  return params.get('admin') === '1' && goalMode(params) === 'missing' && table === 'ops_weekly_reviews';
}
