// 🔁 「今月の相談が戻りました」（2026-10-20 オーナー「入れて 1 か月・使っていない人それぞれの満足度を最大化」）。
//
// 無料プランで先月のトークンを使い切った人に、月がかわってはじめの 7 日間だけ、ホームの題の下に閉じられる 1 行。
// 押すと相談を開く（下書きは入れない・送らない）。押すか閉じたらその月は出さない（端末に覚える）。通知は送らない。
// 「使い切った」＝先月の残りが答え 1 回ぶん（10 トークン）より少なかった。今月がもう答え 1 回ぶんより少なければ出さない。
import { allowanceFor, jstMonthKey } from './tokens';
import { ANSWER_TOKENS, answerCountLabel } from './tokenAmounts';
import { tokensFromMjpy } from './tokens';

export const TOKENS_BACK_DAYS = 7;
const KEY = 'orime.tokensBack.v1';

// 日本時間の先月の 'YYYY-MM' と、その月の終わりの時刻（はじめの月だったかを決めるのに使う）。
export function prevMonthOf(now = Date.now()) {
  const [y, m] = jstMonthKey(now).split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const key = `${py}-${String(pm).padStart(2, '0')}`;
  // 今月 1 日 0 時（日本時間）の 1 ミリ秒前＝先月の終わり。
  const end = Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000 - 1;
  return { key, end };
}

export function jstDayOfMonth(now = Date.now()) {
  return Number(new Date(now + 9 * 3600 * 1000).toISOString().slice(8, 10));
}

// 先月の使った量を読みに行くか（無料プラン・月のはじめの 7 日間・この月はまだ押しても閉じてもいない）。
export function tokensBackCandidate({ freeMode, now = Date.now(), doneMonth = null }) {
  if (!freeMode) return false;
  if (jstDayOfMonth(now) > TOKENS_BACK_DAYS) return false;
  return doneMonth !== jstMonthKey(now);
}

// 出すか（先月を使い切った・今月は答え 1 回ぶん以上ある）。分からないときは出さない。
export function shouldShowTokensBack({ prevUsedMjpy, createdAt = null, now = Date.now(), remaining = null }) {
  if (prevUsedMjpy == null) return false;
  const { end } = prevMonthOf(now);
  if (createdAt && Date.parse(createdAt) > end) return false; // 先月はまだアカウントが無かった
  const allowance = allowanceFor('free', { createdAt, now: end });
  if (allowance == null || allowance <= 0) return false;
  const left = allowance - tokensFromMjpy(prevUsedMjpy);
  if (left >= ANSWER_TOKENS) return false;
  return remaining == null || remaining >= ANSWER_TOKENS;
}

// { lead, count }（画面は count を 1 行にまとめて出す＝「AI の / 答え」と割らない・括弧から行を始めない）。
export function tokensBackText(remaining) {
  return { lead: '今月の相談が戻りました。', count: `AI の答え ${answerCountLabel(remaining)}` };
}

export function readTokensBackDone(userId) {
  if (!userId) return null;
  try { return window.localStorage.getItem(`${KEY}:${userId}`); } catch { return null; }
}
export function markTokensBackDone(userId, now = Date.now()) {
  if (!userId) return;
  try { window.localStorage.setItem(`${KEY}:${userId}`, jstMonthKey(now)); } catch { /* 端末に残せなくても動く */ }
}
