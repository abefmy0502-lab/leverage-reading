// 🔁 「先月の相談『…』を、いまのメモでもう一度」（2026-10-21・継続性の監査 #4）。
//
// 月がかわってはじめの 7 日間だけ、ホームの題の下に閉じられる 1 行。先月以前の相談（いちばん新しい 1 件）のあとに
// 自分のメモが増えていれば出す。押すとその相談を入力欄に入れて相談を開く（送らない）。押すか閉じたらその月は出さない
// （端末に覚える・通知は送らない）。有料・無料とも。無料の「今月の相談が戻りました」が出る月は、そちらを先にして 2 行にしない。
// 数は事実だけ（点数・バッジ・%にしない）。
import { jstMonthKey } from './tokens';
import { jstDayOfMonth, prevMonthOf } from './tokensBack';

export const REASK_DAYS = 7;
export const REASK_MIN_MEMOS = 3;
const KEY = 'orime.reaskNudge.v1';

// 読みに行くか（月のはじめの 7 日間・この月はまだ押しても閉じてもいない）。
export function reaskCandidate({ now = Date.now(), doneMonth = null } = {}) {
  if (jstDayOfMonth(now) > REASK_DAYS) return false;
  return doneMonth !== jstMonthKey(now);
}

// 先月以前の相談（user の行・新しい順）と、自分のメモの作成日時から、出す相談を選ぶ。
//   consults: [{ content, created_at }]（role user）・memoTimes: 作成日時のミリ秒の配列
// 返り値 { question, memos } か null。
export function pickReask({ consults = [], memoTimes = [], now = Date.now() } = {}) {
  const { end } = prevMonthOf(now);
  const last = (Array.isArray(consults) ? consults : [])
    .map((c) => ({ q: String(c?.content || '').trim(), at: Date.parse(c?.created_at || '') }))
    .filter((c) => c.q && Number.isFinite(c.at) && c.at <= end)
    .sort((a, b) => b.at - a.at)[0];
  if (!last) return null;
  const memos = (Array.isArray(memoTimes) ? memoTimes : []).filter((t) => Number.isFinite(t) && t > last.at).length;
  if (memos < REASK_MIN_MEMOS) return null;
  return { question: last.q, memos };
}

// 1 行の文（『』の中は 18 字まで）。
export function reaskText({ question, memos }) {
  const chars = [...String(question || '').replace(/\s+/g, ' ').trim()];
  const gist = chars.length > 18 ? `${chars.slice(0, 18).join('')}…` : chars.join('');
  return { lead: `先月の相談『${gist}』のあと、メモが ${memos} 件増えました。`, action: 'もう一度相談する' };
}

export function readReaskDone(userId) {
  if (!userId) return null;
  try { return window.localStorage.getItem(`${KEY}:${userId}`); } catch { return null; }
}
export function markReaskDone(userId, now = Date.now()) {
  if (!userId) return;
  try { window.localStorage.setItem(`${KEY}:${userId}`, jstMonthKey(now)); } catch { /* 端末に残せなくても動く */ }
}
