// 📅 12 月・1 月に、月額プランの人へ年額プランを 1 行（2026-10-22・master plan §10-3 の 2「1 月と 12 月に年額をすすめる」）。
//
// ホームの題の下に閉じられる 1 行。12 月は「来年も読むなら」、1 月は「今年こそ読むなら」。
//   「来年も読むなら、年額プランは 月あたり 約 ¥1,066（年額 ¥12,800）。」→ 年額プランを見る（設定の「年額プランに変える」）
// 月額の人だけ（年額・7 日間無料・無料プランには出さない）。押すか閉じたら、その冬（12 月〜翌 1 月）は二度と出さない。
// 数は billing.js の表示ラベルから（金額の真実はストア）。「お得」「今だけ」と書かない・通知は送らない。
import { planPeriodOf } from './trialNudge';
import { PLAN_LABELS } from './billing';

const KEY = 'orime.annualNudge.v1';
const JST = 9 * 3600 * 1000;

// 12 月と 1 月（日本時間）。冬の印は 1 月の年（2026-12 と 2027-01 は同じ '2027'）。
export function annualSeasonKey(now = Date.now()) {
  const d = new Date(now + JST);
  const m = d.getUTCMonth() + 1;
  if (m === 12) return String(d.getUTCFullYear() + 1);
  if (m === 1) return String(d.getUTCFullYear());
  return null;
}

export function annualNudgeCandidate({ plan, priceId = '', now = Date.now(), doneSeason = null } = {}) {
  if (plan !== 'paid') return false;
  if (planPeriodOf(priceId) !== 'monthly') return false;
  const season = annualSeasonKey(now);
  return !!season && season !== doneSeason;
}

// 「年額 ¥12,800（税込・月あたり約¥1,066）」→ { monthly: '約 ¥1,066', yearly: '¥12,800' }（読めなければ null）。
export function annualAmounts(label = PLAN_LABELS.annual.price) {
  const s = String(label || '');
  const y = /年額\s*(¥[\d,]+)/.exec(s);
  const m = /月あたり\s*(約?\s*¥[\d,]+)/.exec(s);
  if (!y || !m) return null;
  // 値段の塊の中は割らない（DESIGN §2・NBSP）。
  return { yearly: y[1], monthly: m[1].replace(/^約\s*/, '約\u00a0') };
}

export function annualNudgeText(now = Date.now(), label = PLAN_LABELS.annual.price) {
  const a = annualAmounts(label);
  const m = new Date(now + JST).getUTCMonth() + 1;
  const head = m === 12 ? '来年も読むなら、' : '今年こそ読むなら、';
  const body = a ? `年額プランは 月あたり\u00a0${a.monthly}（年額\u00a0${a.yearly}）。` : '年額プランもあります。';
  return { lead: `${head}${body}`, action: '年額プランを見る' };
}

export function readAnnualNudgeDone(userId) {
  if (!userId) return null;
  try { return window.localStorage.getItem(`${KEY}:${userId}`); } catch { return null; }
}
export function markAnnualNudgeDone(userId, now = Date.now()) {
  const season = annualSeasonKey(now);
  if (!userId || !season) return;
  try { window.localStorage.setItem(`${KEY}:${userId}`, season); } catch { /* 端末に残せなくても動く */ }
}
