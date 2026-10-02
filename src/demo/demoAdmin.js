// 🧪 お試しモードの運営ダッシュボード（?admin=1）。開発専用・本番バンドル外。
//
// ?admin=1 で is_app_admin が true になり、設定に「運営」→「運営ダッシュボード」が出る。
// admin_* の RPC はここのサンプルを返す（ローンチ直後〜1 か月の想定）。
//   &kpi=missing    … admin_launch_kpis が無い（supabase_admin_launch_kpis.sql 未適用）
//   &kpi=notrial    … 契約の履歴（subscription_events）が無い → 7 日間無料 → 有料 は「データなし」
//   &kpi=empty      … ローンチ前（登録 0 人）

const iso = (daysAgo) => {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
};

// 日本時間の月曜（いまの週）から n 週前。
function mondayIso(weeksAgo) {
  const now = new Date(Date.now() + 9 * 3600000); // 日本時間の暦
  const dow = (now.getUTCDay() + 6) % 7; // 月=0
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow - weeksAgo * 7));
  return mon.toISOString().slice(0, 10);
}

function launchKpis(mode) {
  if (mode === 'empty') {
    return {
      generated_at: new Date().toISOString(), weeks: 8,
      sources: { trial_history: true, trial_rows: 0, trial_starts: 0 },
      totals: {
        first_consult: { num: 0, den: 0, pending: 0, from: iso(31), to: iso(1) },
        memos10: { num: 0, den: 0, pending: 0, from: iso(37), to: iso(7) },
        d30: { num: 0, den: 0, pending: 0, from: iso(67), to: iso(37) },
        trial_paid: { num: 0, den: 0, pending: 0, from: iso(38), to: iso(8) },
      },
      cohorts: Array.from({ length: 8 }, (_, i) => ({
        week: mondayIso(i), signups: 0,
        first_consult: { num: 0, den: 0, pending: 0 }, memos10: { num: 0, den: 0, pending: 0 },
        d30: { num: 0, den: 0, pending: 0 }, trial_paid: { started: 0, num: 0, den: 0, pending: 0 },
      })),
    };
  }
  // 週ごとの登録と、それぞれの結果（新しい週が先）。
  const rows = [
    // signups, consult(num/den), memos(num/den), d30(num/den), trial(started/num/den)
    [18, [6, 14], [0, 0], [0, 0], [2, 0, 0]],
    [41, [22, 41], [11, 41], [0, 0], [6, 0, 3]],
    [57, [27, 57], [14, 57], [0, 0], [9, 3, 9]],
    [36, [19, 36], [9, 36], [0, 0], [5, 2, 5]],
    [24, [13, 24], [8, 24], [0, 0], [4, 2, 4]],
    [12, [7, 12], [4, 12], [3, 12], [2, 1, 2]],
    [6, [3, 6], [2, 6], [1, 6], [1, 1, 1]],
    [3, [2, 3], [1, 3], [1, 3], [0, 0, 0]],
  ];
  const noTrial = mode === 'notrial';
  const cohorts = rows.map(([s, c, m, r, t], i) => ({
    week: mondayIso(i), signups: s,
    first_consult: { num: c[0], den: c[1], pending: s - c[1] },
    memos10: { num: m[0], den: m[1], pending: s - m[1] },
    d30: { num: r[0], den: r[1], pending: s - r[1] },
    trial_paid: noTrial ? { started: 0, num: 0, den: 0, pending: 0 } : { started: t[0], num: t[1], den: t[2], pending: t[0] - t[2] },
  }));
  return {
    generated_at: new Date().toISOString(), weeks: 8,
    sources: noTrial ? { trial_history: false, trial_rows: 0, trial_starts: 0 } : { trial_history: true, trial_rows: 61, trial_starts: 29 },
    totals: {
      first_consult: { num: 91, den: 172, pending: 6, from: iso(31), to: iso(1) },
      memos10: { num: 38, den: 158, pending: 59, from: iso(37), to: iso(7) },
      d30: { num: 5, den: 21, pending: 197, from: iso(67), to: iso(37) },
      trial_paid: noTrial ? { num: 0, den: 0, pending: 0, from: iso(38), to: iso(8) } : { num: 9, den: 24, pending: 5, from: iso(38), to: iso(8) },
    },
    cohorts,
  };
}

const SAMPLES = {
  admin_overview: () => ({
    users_total: 197, new_users_7d: 18, new_users_30d: 172, dau: 41, wau: 96, mau: 158,
    books_total: 1240, memos_total: 5310, actions_total: 402, actions_done: 188, subs_active: 14, feedback_open: 3,
  }),
  admin_active_series: () => Array.from({ length: 30 }, (_, i) => ({ d: iso(29 - i).slice(5).replace('-', '/'), active: 10 + ((i * 7) % 30), new_books: (i * 3) % 9 })),
  admin_feature_usage: () => ({ events: { app_open: 1900, memo_added: 820, book_added: 410, ai_used: 360, paywall_viewed: 120, checkout_completed: 14 }, ai_features: { brain: 300, ocr: 40, condense: 20 } }),
  admin_ai_usage: () => [{ month: iso(0).slice(0, 7), calls: 420, users: 60 }],
  admin_revenue: () => ({ active: 9, founding: 3, trial: 5, canceled: 2, by_status: { active: 14, canceled: 2 }, expiring_30d: 1 }),
  admin_feedback: () => [],
  admin_get_goal: () => ({ metric: 'paid_users', target: 50, deadline: '2026-12-31' }),
  admin_tickets: () => [],
  admin_growth: () => ({ retention: { d1_num: 90, d1_den: 172, d7_num: 40, d7_den: 158, d30_num: 5, d30_den: 21 }, paid_new_by_month: [], subs_total: 16, subs_active: 14, subs_canceled: 2, paid_new_this_month: 9 }),
};

// demoClient の rpc から呼ぶ。admin の RPC でなければ null（＝今までどおり「無い」）。
export function demoAdminRpc(name, params) {
  const kpi = params.get('kpi');
  if (name === 'admin_launch_kpis') {
    if (kpi === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.admin_launch_kpis' } };
    return { data: launchKpis(kpi), error: null };
  }
  if (SAMPLES[name]) return { data: SAMPLES[name](), error: null };
  return null;
}
