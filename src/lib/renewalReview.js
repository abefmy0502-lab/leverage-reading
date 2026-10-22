// 📅 年額プランの更新の前に「この 1 年に残したもの」（2026-10-22・master plan §10-3 の 2・goal-1000-elements 8-4）。
//
// 年額プランの人に、次回更新の 30 日前から、ホームの題の下に閉じられる 1 行:
//   「年額プランの更新まで 24 日。この 1 年で、メモ 128 件・読了 14 冊・行動 9 つ・読書 12 時間」→ 記録を見る（文は全幅・ボタンは次の行）
// 数は事実だけ（点数・%・順位・バッジにしない・「続けましょう」と言わない）。押すか閉じたら、その更新日は二度と出さない
// （端末に覚える・通知は送らない）。残したものが 1 つも無い人には出さない（見せるものが無い）。
// 創業メンバー（2026-11〜12 に始めた年額）の 2027 年 11〜12 月の更新がいちばんの山場だが、年額の人は全員同じ。
// 7 日間無料の途中・月額の人には出さない。
import { planPeriodOf } from './trialNudge';
import { parseLocalDate } from './shareSubject';
import { rangeSeconds } from './readingStats';

export const RENEWAL_DAYS = 30;
export const YEAR_MS = 365 * 86400000;
const DAY_MS = 86400000;
const KEY = 'orime.renewalReview.v1';

// 更新日の印（日本時間の日付）。
export function renewalKeyOf(periodEnd) {
  const t = Date.parse(periodEnd || '');
  if (!Number.isFinite(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 更新までの日数（切り上げ・0 以上）。
export function daysUntil(periodEnd, now = Date.now()) {
  const t = Date.parse(periodEnd || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - now) / DAY_MS));
}

// 出す候補か（年額・有料・更新まで 30 日以内・この更新日はまだ押しても閉じてもいない）。
export function renewalCandidate({ plan, priceId = '', periodEnd = null, now = Date.now(), doneKey = null } = {}) {
  if (plan !== 'paid') return false;
  if (planPeriodOf(priceId) !== 'annual') return false;
  const d = daysUntil(periodEnd, now);
  if (d == null || d > RENEWAL_DAYS) return false;
  const key = renewalKeyOf(periodEnd);
  return !!key && key !== doneKey;
}

// この 1 年（今日から 365 日前まで）に残したもの。
//   books: 本棚の本（status / doneDate / actions[].completedAt・done）・memoTimes: メモの作成日時（ms）・sessions: reading_sessions の行
export function yearReviewStats({ books = [], memoTimes = [], sessions = [], now = Date.now() } = {}) {
  const from = now - YEAR_MS;
  const list = Array.isArray(books) ? books : [];
  const memos = (Array.isArray(memoTimes) ? memoTimes : []).filter((t) => Number.isFinite(t) && t >= from && t <= now).length;
  const finished = list.filter((b) => {
    if (!b || b.status !== 'done') return false;
    const d = parseLocalDate(b.doneDate);
    return !!d && d.getTime() >= from && d.getTime() <= now;
  }).length;
  const actions = list.reduce((n, b) => n + (Array.isArray(b?.actions) ? b.actions : []).filter((a) => {
    if (!a || !a.done) return false;
    const t = Date.parse(a.completedAt || a.created_at || '');
    return Number.isFinite(t) && t >= from && t <= now;
  }).length, 0);
  let seconds = 0;
  try { seconds = rangeSeconds(Array.isArray(sessions) ? sessions : [], list, from, now); } catch { seconds = 0; }
  const hours = Math.floor(seconds / 3600);
  return { memos, finished, actions, hours };
}

export function hasAnything(stats) {
  return !!stats && (stats.memos > 0 || stats.finished > 0 || stats.actions > 0 || stats.hours > 0);
}

// 1 行の文。数が 0 のものは書かない。
export function renewalText({ days, stats }) {
  const parts = [];
  if (stats.memos > 0) parts.push(`メモ ${stats.memos} 件`);
  if (stats.finished > 0) parts.push(`読了 ${stats.finished} 冊`);
  if (stats.actions > 0) parts.push(`行動 ${stats.actions} つ`);
  if (stats.hours > 0) parts.push(`読書 ${stats.hours} 時間`);
  const when = days <= 0 ? '年額プランの更新日です。' : `年額プランの更新まで ${days} 日。`;
  return { lead: `${when}この 1 年で、${parts.join('・')}`, action: '記録を見る' };
}

export function readRenewalDone(userId) {
  if (!userId) return null;
  try { return window.localStorage.getItem(`${KEY}:${userId}`); } catch { return null; }
}
export function markRenewalDone(userId, periodEnd) {
  const key = renewalKeyOf(periodEnd);
  if (!userId || !key) return;
  try { window.localStorage.setItem(`${KEY}:${userId}`, key); } catch { /* 端末に残せなくても動く */ }
}
