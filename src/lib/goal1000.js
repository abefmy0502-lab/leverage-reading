// 🎯 2027 年中に有料ユーザー 1,000 人（2026-10-11 オーナー決定）— 運営ダッシュボードの計算。
//
// 画面（src/components/admin/GoalPanel.jsx）は表示だけ。ずれ・必要な速さ・見込み・いちばん弱い段階の
// 選び方・季節の予定・毎週の見直しの 1 行は、ここの純粋な関数で決める（goal1000.test.js）。
// 数え方の元: company/marketing-master-plan-2026-10.md §6・§10 ／ company/marketing-strategy-2026-11.md §7。
// 読み方と毎週の見直しの手順: docs/goal-1000.md。集計の SQL: supabase_admin_goal.sql（admin_goal_weekly）。

const DAY = 86400000;

// ── 目標と道しるべ（master plan §10-2）。オーナーが画面で変えると ops_goals に入る（admin_set_goal_plan）。
export const GOAL_DEFAULT = Object.freeze({
  target: 1000,
  deadline: '2027-12-31',
  launch: '2026-11-17', // 公開日（marketing-strategy §9 の決定）。この日より前の「あるべき数」は 0
  milestones: Object.freeze([
    { d: '2026-12-31', n: 50 },
    { d: '2027-03-31', n: 200 },
    { d: '2027-06-30', n: 400 },
    { d: '2027-09-30', n: 650 },
    { d: '2027-12-31', n: 1000 },
  ]),
});

// 月のインストールの目安（master plan §10-2）。その月以降で最初の道しるべの値を使う（1〜3 月は 2,000）。
export const INSTALL_GUIDE = Object.freeze([
  ['2026-12', 1000], ['2027-03', 2000], ['2027-06', 2500], ['2027-09', 3000], ['2027-12', 3500],
]);

// 月額の解約率の置き方（master plan §10-1）。実データが少ない間はこれを使う。
export const ASSUMED_MONTHLY_CHURN = 0.08;
// 遅れの強い警告: 今日あるべき数の 80% を下回ったら（かつ 5 人以上遅れ）。
export const STRONG_BEHIND_RATIO = 0.8;
export const STRONG_BEHIND_MIN = 5;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function dayNum(iso) { return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY); }
function isoOfDay(n) { return new Date(n * DAY).toISOString().slice(0, 10); }

export function daysBetween(fromIso, toIso) { return dayNum(toIso) - dayNum(fromIso); }
export function addDays(iso, n) { return isoOfDay(dayNum(iso) + n); }

// 日本時間の日付（YYYY-MM-DD）。
export function jstDateIso(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

// 日本時間の月曜（週のはじまり・RPC と同じ決まり）。
export function weekStartJst(dateIso) {
  const n = dayNum(dateIso);
  const dow = (new Date(n * DAY).getUTCDay() + 6) % 7; // 月=0
  return isoOfDay(n - dow);
}

export function isMondayIso(dateIso) { return weekStartJst(dateIso) === dateIso; }

// RPC（admin_goal_plan / admin_get_goal）の返り値 → 画面で使う形。壊れた値・別の指標は既定に戻す。
export function normalizePlan(raw) {
  const base = { ...GOAL_DEFAULT, milestones: GOAL_DEFAULT.milestones.map((m) => ({ ...m })), fromDb: false };
  if (!raw || typeof raw !== 'object') return base;
  if (raw.metric && raw.metric !== 'paid_users') return base; // 売上など別の目標なら、この計算は既定で
  const target = Number(raw.target);
  if (Number.isFinite(target) && target > 0) base.target = Math.round(target);
  if (isIsoDate(raw.deadline)) base.deadline = raw.deadline;
  if (isIsoDate(raw.launch_date)) base.launch = raw.launch_date;
  if (Array.isArray(raw.milestones)) {
    const ms = raw.milestones
      .map((m) => ({ d: m?.d, n: Math.round(Number(m?.n)) }))
      .filter((m) => isIsoDate(m.d) && Number.isFinite(m.n) && m.n >= 0)
      .sort((a, b) => (a.d < b.d ? -1 : 1));
    if (ms.length) base.milestones = ms;
  }
  // 期限の日の目標は、いつも目標の数（道しるべの最後と食い違ったら目標を優先）。
  const rest = base.milestones.filter((m) => m.d < base.deadline);
  base.milestones = [...rest, { d: base.deadline, n: base.target }];
  base.fromDb = true;
  return base;
}

// 今日あるべき数。公開日 0 人 → 道しるべを直線でつなぐ（＝月ごとにならす）→ 期限の後は目標。
export function plannedAt(plan, dateIso) {
  const pts = [{ d: plan.launch, n: 0 }, ...plan.milestones.filter((m) => m.d > plan.launch)];
  if (dateIso <= pts[0].d) return 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]; const b = pts[i];
    if (dateIso <= b.d) {
      const span = daysBetween(a.d, b.d);
      const t = span > 0 ? daysBetween(a.d, dateIso) / span : 1;
      return Math.round(a.n + (b.n - a.n) * t);
    }
  }
  return pts[pts.length - 1].n;
}

// 月末ごとのあるべき数（道しるべの間を月ごとにならした表）。
export function monthEndPlan(plan) {
  const out = [];
  let y = Number(plan.launch.slice(0, 4)); let m = Number(plan.launch.slice(5, 7));
  for (let guard = 0; guard < 60; guard += 1) {
    const last = isoOfDay(Math.round(Date.UTC(y, m, 0) / DAY));
    const d = last > plan.deadline ? plan.deadline : last;
    out.push({ month: `${y}-${String(m).padStart(2, '0')}`, n: plannedAt(plan, d) });
    if (d >= plan.deadline) break;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// RPC admin_goal_weekly の rows（新しい週が先）→ 数の形をそろえる。月額＝全体 − 年額。
export function normalizeWeeks(rows) {
  if (!Array.isArray(rows)) return [];
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return rows.filter((r) => r && isIsoDate(r.week)).map((r) => {
    const newPaid = num(r.new_paid); const newAnnual = num(r.new_paid_annual);
    const churned = num(r.churned); const churnedAnnual = num(r.churned_annual);
    return {
      week: r.week,
      lpViews: num(r.lp_views), lpClicks: num(r.lp_clicks),
      lpViewsBy: r.lp_views_by_variant || {}, lpClicksBy: r.lp_clicks_by_variant || {},
      signups: num(r.signups) ?? 0,
      trialStarts: num(r.trial_starts),
      trialPaid: r.trial_paid ? { num: num(r.trial_paid.num) ?? 0, den: num(r.trial_paid.den) ?? 0, pending: num(r.trial_paid.pending) ?? 0 } : null,
      newPaid, newPaidAnnual: newAnnual, newPaidMonthly: newPaid == null ? null : newPaid - (newAnnual ?? 0),
      churned, churnedAnnual, churnedMonthly: churned == null ? null : churned - (churnedAnnual ?? 0),
      net: newPaid == null || churned == null ? null : newPaid - churned,
      paidEnd: num(r.paid_end), paidAnnualEnd: num(r.paid_annual_end),
    };
  });
}

// 終わった週だけ（今週＝いちばん上が途中なら外す）。
export function completedWeeks(weeks, todayIso) {
  const cur = weekStartJst(todayIso);
  return weeks.filter((w) => w.week < cur);
}

function avg(list) { return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null; }

// 直近 n 週（終わった週）の平均。数の無い週は除く。
export function recentAverage(weeks, key, n) {
  const vals = weeks.slice(0, n).map((w) => w[key]).filter((v) => v != null);
  return vals.length ? avg(vals) : null;
}

// 月額の解約率（月あたり）。直近 4 週に解約した月額の人 ÷ 4 週前の月額の人 × 30/28。
// 月額の人が 20 人未満・履歴が無いときは 8% と置く（assumed: true）。
export function monthlyChurnRate(done) {
  const win = done.slice(0, 4);
  const before = done[4] || null;
  const churned = win.map((w) => w.churnedMonthly).filter((v) => v != null);
  const base = before && before.paidEnd != null ? before.paidEnd - (before.paidAnnualEnd ?? 0) : null;
  if (churned.length < 4 || base == null || base < 20) return { rate: ASSUMED_MONTHLY_CHURN, assumed: true };
  const rate = (churned.reduce((s, v) => s + v, 0) / base) * (30 / 28);
  return { rate: Math.min(0.5, Math.max(0, rate)), assumed: false };
}

// 見込み: 今の人数から、毎週 g 人の新規を足し、月額の人を毎月 c 減らして、期限まで週ごとに積み上げる。
// 年額の人は期限までの解約を数えない（更新は 1 年後）。
export function forecastPaid({ current, weeklyNew, monthlyShare, monthlyChurn, weeksLeft }) {
  let p = Math.max(0, current);
  const wChurn = monthlyChurn * monthlyShare * (7 / 30);
  for (let i = 0; i < Math.max(0, Math.floor(weeksLeft)); i += 1) p = p + weeklyNew - p * wChurn;
  const rest = Math.max(0, weeksLeft - Math.floor(weeksLeft));
  p = p + (weeklyNew - p * wChurn) * rest;
  return Math.round(p);
}

// 1. 目標の進み具合。
// in: { plan, current, todayIso, weeks（normalizeWeeks の結果）, annualNow }
export function goalStatus({ plan, current, todayIso, weeks = [], annualNow = null }) {
  const cur = Math.max(0, Math.round(Number(current) || 0));
  const planned = plannedAt(plan, todayIso);
  const behind = Math.max(0, planned - cur);
  const ratio = planned > 0 ? cur / planned : null;
  let level = 'ok';
  if (todayIso < plan.launch) level = 'prelaunch';
  else if (behind > 0) level = (ratio != null && ratio < STRONG_BEHIND_RATIO && behind >= STRONG_BEHIND_MIN) ? 'critical' : 'behind';

  const daysLeft = Math.max(0, daysBetween(todayIso, plan.deadline));
  const weeksLeft = daysLeft / 7;
  const gap = Math.max(0, plan.target - cur);
  const requiredPerWeek = gap === 0 ? 0 : (weeksLeft > 0 ? Math.ceil(gap / weeksLeft) : gap);

  const done = completedWeeks(weeks, todayIso);
  const hasHistory = done.some((w) => w.net != null);
  const net4 = hasHistory ? recentAverage(done, 'net', 4) : null;
  const net8 = hasHistory ? recentAverage(done, 'net', 8) : null;
  const newAvgWeeks = Math.min(8, done.filter((w) => w.newPaid != null).length);
  const weeklyNew = hasHistory ? recentAverage(done, 'newPaid', 8) : null;
  const churn = monthlyChurnRate(done);
  const monthlyShare = cur > 0 && annualNow != null ? Math.max(0, Math.min(1, 1 - annualNow / cur)) : 0.5;
  const forecast = weeklyNew == null ? null : forecastPaid({
    current: cur, weeklyNew, monthlyShare, monthlyChurn: churn.rate, weeksLeft,
  });
  const paceShort = net4 != null && requiredPerWeek > 0 && net4 < requiredPerWeek;

  return {
    current: cur, target: plan.target, deadline: plan.deadline,
    planned, behind, ahead: Math.max(0, cur - planned), ratio, level,
    daysLeft, weeksLeft, requiredPerWeek,
    net4, net8, weeklyNew, newAvgWeeks,
    monthlyChurn: churn.rate, churnAssumed: churn.assumed, monthlyShare,
    forecast, forecastShort: forecast != null && forecast < plan.target,
    paceShort,
  };
}

// 計算のしかた（画面に 1 行で出す）。
export function forecastBasisText(s) {
  if (s.forecast == null) return '見込みは、契約の履歴（7 日間無料・有料・解約）がたまると出ます。';
  const g = Math.round(s.weeklyNew * 10) / 10;
  const c = Math.round(s.monthlyChurn * 1000) / 10;
  const share = Math.round(s.monthlyShare * 100);
  return `見込み＝今 ${s.current} 人に、毎週の新規 ${g} 人（直近 ${s.newAvgWeeks} 週の平均）を足し、月額の人（${share}%）を毎月 ${c}%${s.churnAssumed ? '（データが少ないので仮置き）' : '（直近 4 週）'}ずつ減らして、${s.deadline} まで週ごとに積み上げた数。年額の人は更新までやめないと置く。`;
}

// ── 2. 毎週の流れ ──────────────────────────────────────────────────────────────
// goalWeeks: normalizeWeeks の結果 / cohorts: admin_launch_kpis の cohorts（登録した週ごと）/
// sales: ops_sales_metrics の行（week_start・installs・store_page_views）
export function funnelRows(goalWeeks, cohorts = [], sales = []) {
  const byCohort = new Map((cohorts || []).map((c) => [c.week, c]));
  const bySales = new Map((sales || []).map((s) => [String(s.week_start), s]));
  return goalWeeks.map((w) => {
    const c = byCohort.get(w.week);
    const s = bySales.get(w.week);
    const nn = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    return {
      ...w,
      installs: s ? nn(s.installs) : null,
      storeViews: s ? nn(s.store_page_views) : null,
      firstConsult: c?.first_consult ? { num: c.first_consult.num || 0, den: c.first_consult.den || 0 } : null,
      memos10: c?.memos10 ? { num: c.memos10.num || 0, den: c.memos10.den || 0 } : null,
      annualShare: w.paidEnd > 0 && w.paidAnnualEnd != null ? w.paidAnnualEnd / w.paidEnd : null,
    };
  });
}

export function pctText(num, den) {
  if (!den) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

// ── 3. いちばん弱い段階 ────────────────────────────────────────────────────────
// 目標と「下回ったら」は marketing-strategy §7・docs/launch-kpis.md §3・master plan §10-3。
export const STAGES = Object.freeze([
  {
    key: 'aware', no: '①', label: '知ってもらう', target: '週ごとに増える',
    actions: [
      { id: 'aware_posts', dept: 'マーケ営業', title: 'X・note の本数と題を見直す（伸びた型だけ増やす）' },
      { id: 'aware_video', dept: 'マーケ営業', title: '15 秒の画面の動画を今週 3 本出す（Instagram リールと X）' },
    ],
  },
  {
    key: 'interest', no: '②', label: '興味（ストアのページ → 入手）', target: '30%',
    actions: [
      { id: 'interest_shots', dept: 'マーケ営業', title: 'ストアの 1 枚目のスクショと見出しを直す' },
      { id: 'interest_lp', dept: 'マーケ営業', title: 'LP のファーストビューを直す（押された場所の記録を見る）' },
      { id: 'interest_cpp', dept: 'マーケ営業', title: 'カスタムプロダクトページ 3 つの入口ごとの入手率を比べる' },
    ],
  },
  {
    key: 'install', no: '③', label: '入れる（週のインストール）', target: '月の目安 ÷ 週',
    actions: [
      { id: 'install_ct', dept: 'マーケ営業', title: '入口別（ct=）で弱い入口をやめ、強い入口を増やす' },
      { id: 'install_partner', dept: 'マーケ営業', title: '協業（本要約・読書術の発信者・読書会・大学の読書サークル）に今週 3 人声をかける' },
    ],
  },
  {
    key: 'first_consult', no: '④', label: '価値に触れる（初日に相談）', target: '50%',
    actions: [
      { id: 'fc_onboard', dept: '開発', title: '初回ガイドの最後で相談に連れて行く・相談例を 1 タップで送れるように' },
      { id: 'fc_quickstart', dept: '開発', title: '初日クイックスタートの「相談してみる」を目立たせる' },
    ],
  },
  {
    key: 'memos10', no: '⑤', label: '習慣（7 日でメモ 10 件）', target: '30%',
    actions: [
      { id: 'memo_import', dept: '開発', title: '取り込み（ブクログ・読書メーター）を初日クイックスタートとホームで案内' },
      { id: 'memo_ocr', dept: '開発', title: '写真から書き起こしをメモを書くシートの見えるところに' },
      { id: 'memo_recall', dept: '開発', title: '思い出しの通知の許可を取る場面を見直す' },
    ],
  },
  {
    key: 'trial_start', no: '⑥', label: 'お試し（7 日間無料の開始）', target: '10%',
    actions: [
      { id: 'trial_ab', dept: '経営', title: 'はじめての相談のあとの 7 日間無料の実験を見て、勝った方を全員に' },
      { id: 'trial_value', dept: '開発', title: '相談の答えの直後に「相談相手が育った」と感じる場面を増やす' },
    ],
  },
  {
    key: 'trial_paid', no: '⑦', label: '課金（7 日間無料 → 有料）', target: '40%',
    actions: [
      { id: 'paid_grow', dept: '開発', title: '7 日の間に「育った」と感じる場面を増やす（無料期間中の相談の価値）' },
      { id: 'paid_before_end', dept: '開発', title: '無料期間が終わる前の案内を見直す' },
      { id: 'paid_annual', dept: '経営', title: '有料プランの画面の年額の見せ方を見直す' },
    ],
  },
  {
    key: 'd30', no: '⑧', label: '継続（30 日後も使う）', target: '25%',
    actions: [
      { id: 'd30_deadline', dept: '開発', title: '行動の期限の通知・相談の続きを使ってもらう場面を増やす' },
      { id: 'd30_push', dept: '開発', title: '思い出しの通知の届く頻度・時刻を見直す' },
    ],
  },
  {
    key: 'share', no: '⑨', label: '広がる（共有）', target: '有料の 10%',
    actions: [
      { id: 'share_nudge', dept: 'マーケ営業', title: '月末・年末の「写真で共有」の声かけを確かめ、#◯月読了本 の投稿を拾う' },
    ],
  },
]);

export const STAGE_MIN = 10; // 分母がこれより少ない段階は「参考」（選ばない）

// 月のインストールの目安（その月以降で最初の道しるべ）。
export function installGuideFor(monthKey) {
  const hit = INSTALL_GUIDE.find(([k]) => k >= monthKey);
  return hit ? hit[1] : INSTALL_GUIDE[INSTALL_GUIDE.length - 1][1];
}

function sumKey(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
}

// 各段階の今の値と目標との比（actual ÷ target）。state: ok / below / few / nodata。
// in: { rows（funnelRows・新しい週が先）, todayIso, launchTotals（admin_launch_kpis.totals）, targets（%）, shareUsers, paid }
export function evaluateStages({ rows = [], todayIso, launchTotals = null, targets = {}, shareUsers = null, paid = 0 }) {
  const done = completedWeeks(rows, todayIso);
  const last4 = done.slice(0, 4);
  const out = {};
  const rate = (key, num, den, targetPct, minDen = STAGE_MIN) => {
    if (num == null || den == null || den <= 0) { out[key] = { state: 'nodata', value: null }; return; }
    const v = num / den;
    const t = targetPct / 100;
    out[key] = { state: den < minDen ? 'few' : (v >= t ? 'ok' : 'below'), value: v, ratio: v / t, num, den, targetPct };
  };

  // ① 訪問: 先週 vs その前 3 週の平均
  const views = done.slice(0, 4).map((w) => w.lpViews);
  if (views[0] != null && views.slice(1).filter((v) => v != null).length >= 1) {
    const prev = avg(views.slice(1).filter((v) => v != null));
    const ratio = prev > 0 ? views[0] / prev : (views[0] > 0 ? 1 : 0);
    out.aware = { state: prev < 20 ? 'few' : (ratio >= 1 ? 'ok' : 'below'), value: views[0], ratio, prev };
  } else out.aware = { state: 'nodata', value: null };

  // ② ストアのページ → 入手（手入力・直近 4 週）
  rate('interest', sumKey(last4.filter((w) => w.storeViews != null && w.installs != null), 'installs'),
    sumKey(last4.filter((w) => w.storeViews != null && w.installs != null), 'storeViews'), 30, 100);

  // ③ 週のインストール（手入力・直近 4 週の平均）vs 月の目安 ÷ 週
  const inst = last4.map((w) => w.installs).filter((v) => v != null);
  if (inst.length) {
    const a = avg(inst);
    const need = installGuideFor(todayIso.slice(0, 7)) * 7 / 30;
    const ratio = a / need;
    out.install = { state: ratio >= 1 ? 'ok' : 'below', value: a, ratio, need };
  } else out.install = { state: 'nodata', value: null };

  // ④⑤⑦⑧ はローンチの 4 つの数字（直近 30 日に結果が決まった人）
  const lt = launchTotals || {};
  const tg = (k, d) => (Number.isFinite(Number(targets[k])) ? Number(targets[k]) : d);
  rate('first_consult', lt.first_consult?.num, lt.first_consult?.den, tg('first_consult', 50));
  rate('memos10', lt.memos10?.num, lt.memos10?.den, tg('memos10', 30));
  rate('trial_paid', lt.trial_paid?.num, lt.trial_paid?.den, tg('trial_paid', 40));
  rate('d30', lt.d30?.num, lt.d30?.den, tg('d30', 25));

  // ⑥ 7 日間無料の開始 ÷ 登録（直近 4 週）
  const t4 = last4.filter((w) => w.trialStarts != null);
  rate('trial_start', sumKey(t4, 'trialStarts'), sumKey(t4, 'signups'), 10);

  // ⑨ 直近 28 日に共有の画像を作った人 ÷ 有料
  rate('share', shareUsers, paid, 10);

  return STAGES.map((s) => ({ ...s, ...(out[s.key] || { state: 'nodata', value: null }) }));
}

// いちばん下回っている段階を 1 つだけ（目標との比がいちばん小さい・同じなら前の段階）。無ければ null。
export function pickWeakest(stages) {
  let best = null;
  for (const s of stages) {
    if (s.state !== 'below' || !Number.isFinite(s.ratio)) continue;
    if (!best || s.ratio < best.ratio - 1e-9) best = s;
  }
  return best;
}

export function stageValueText(s) {
  if (s.state === 'nodata' || s.value == null) return 'データなし';
  if (s.key === 'aware') return `先週 ${s.value} 訪問（前 3 週の平均 ${Math.round(s.prev)}）`;
  if (s.key === 'install') return `週 ${Math.round(s.value)} 件（目安 週 ${Math.round(s.need)} 件）`;
  return `${Math.round(s.value * 100)}%（${s.num}/${s.den}）`;
}

// ── 4. 季節と更新の予定 ────────────────────────────────────────────────────────
export const SEASONS = Object.freeze([
  { id: 'y2026', label: '12 月 今年の読書（2026）', from: '2026-12-01', to: '2026-12-31',
    prep: '11 月中に「今年の読書」の投稿と年額の案内を用意する（写真で共有の 12 月の 1 行が出る）' },
  { id: 'ny2027', label: '1 月 今年こそ読む', from: '2027-01-01', to: '2027-01-31',
    prep: '12 月に年額をすすめる投稿・ストアの文を用意する（年額が主役）' },
  { id: 'sp2027', label: '4 月 新生活（新社会人・新入生）', from: '2027-04-01', to: '2027-04-30',
    prep: '3 月に新社会人・大学生向けの投稿と、大学の読書サークルへの声かけ' },
  { id: 'y2027', label: '12 月 今年の読書（2027）', from: '2027-12-01', to: '2027-12-31',
    prep: '11 月中に「今年の読書」の投稿と年額の案内を用意する' },
]);

// 今日から見た季節の山場（終わったものは出さない）。state: now（期間中）/ prep（30 日以内に始まる）/ later。
export function seasonView(todayIso) {
  return SEASONS.filter((s) => s.to >= todayIso).map((s) => {
    const until = daysBetween(todayIso, s.from);
    return { ...s, daysUntil: Math.max(0, until), state: until <= 0 ? 'now' : (until <= 30 ? 'prep' : 'later') };
  });
}

// 創業メンバー（2026-11〜12 に始めた年額）の更新。founding: RPC の founding（count・renew_from・renew_to）。
// 記録が無い間は、創業メンバー価格の期間（2026-11-17〜12-16）の 1 年後を目安にする。
export const FOUNDING_RENEW_GUESS = Object.freeze({ from: '2027-11-17', to: '2027-12-16' });
export function foundingView(founding, todayIso) {
  const count = Number(founding?.count) || 0;
  const from = isIsoDate(founding?.renew_from) ? founding.renew_from : FOUNDING_RENEW_GUESS.from;
  const to = isIsoDate(founding?.renew_to) ? founding.renew_to : FOUNDING_RENEW_GUESS.to;
  const daysUntil = daysBetween(todayIso, from);
  const prepFrom = addDays(from, -30);
  let state = 'later';
  if (todayIso > to) state = 'past';
  else if (todayIso >= from) state = 'now';
  else if (todayIso >= prepFrom) state = 'prep';
  return { count, from, to, guessed: !isIsoDate(founding?.renew_from), daysUntil, prepFrom, state, byMonth: founding?.by_month || {} };
}

export const FOUNDING_PREP_TEXT = '更新の 1 か月前から、その 1 年に残したメモ・行動・読書の時間を見せる（master plan §10-3 の 2）。12 月は年額をすすめる。';

// ── 5. 毎週の見直し ────────────────────────────────────────────────────────────
// 保存する数字のかたまり（小さく・あとで並べて読める形）。
export function reviewNumbers(status, weakest) {
  return {
    paid: status.current,
    planned: status.planned,
    behind: status.behind,
    need_per_week: status.requiredPerWeek,
    net_4w: status.net4 == null ? null : Math.round(status.net4 * 10) / 10,
    forecast: status.forecast,
    weakest: weakest ? weakest.key : null,
  };
}

// 一覧に出す 1 行。
export function reviewLine(n) {
  if (!n || typeof n !== 'object') return '';
  const parts = [`有料 ${n.paid ?? '—'}`];
  if (n.planned != null) parts.push(n.behind > 0 ? `予定 ${n.planned}・遅れ ${n.behind}` : `予定 ${n.planned}`);
  if (n.need_per_week != null) parts.push(`必要 週 +${n.need_per_week}`);
  if (n.net_4w != null) parts.push(`直近 週 ${n.net_4w >= 0 ? '+' : ''}${n.net_4w}`);
  if (n.forecast != null) parts.push(`見込み ${n.forecast}`);
  const st = STAGES.find((s) => s.key === n.weakest);
  if (st) parts.push(`弱い段階 ${st.no}`);
  return parts.join(' ・ ');
}

// 月曜に開いて、今週の見直しがまだなら知らせる。
export function needsReviewNudge(todayIso, reviews = []) {
  if (!isMondayIso(todayIso)) return false;
  const wk = weekStartJst(todayIso);
  return !reviews.some((r) => String(r.week_start) === wk);
}
