// 🌱 初日の体験（2026-10-02 オーナー承認）— 「自分のメモから答えが返ってきた」を早く体験してもらう。
//
//   1. 初回ガイドの最後の画面: 取り込む → ページを撮る → 読んだ本に一言ずつ残す の順（Onboarding.jsx）
//   2. どの道も、終わったら「相談してみる」（自分のメモから作った相談を入力欄に入れて相談を開く・送らない）
//   3. メモが 10 件になるまで、ホームと相談の上に静かな一行「あと N 件で相談相手が育ちます」（growthMeterText）
//   4. はじめての相談の答えには、必ず「あなたのメモ N 件から答えました」（firstAnswerEvidence）
//
// 計測（docs/analytics-events.md）: onboard_path / onboard_path_done / try_consult / first_consult_sent / memos_reached_10。
// 端末に覚えるのは「1 回だけ送る」ための印だけ（消えても害は「もう一度送る」だけ。運営の集計は 1 人の最初の 1 件で数える）。
//
// 10 件は 7 日間無料の案内（lib/trialNudge.js の TRIAL_NUDGE_MEMOS）と同じ数。メーターは 10 件で消え、
// 案内は 10 件から出る（同じ場所に 2 つ並ばない）。

import { TRIAL_NUDGE_MEMOS } from './trialNudge';

export const GROWTH_GOAL = TRIAL_NUDGE_MEMOS;

// 相談相手が育つまでの残り（1〜9 件のときだけ数を返す）。0 件は「相談相手をつくる」など別の入口が主役なので出さない。
export function growthLeft(memoCount) {
  if (memoCount == null || memoCount === '') return null;
  const n = Number(memoCount);
  if (!Number.isFinite(n) || n <= 0 || n >= GROWTH_GOAL) return null;
  return GROWTH_GOAL - Math.floor(n);
}

// ホーム・相談の上に出す一行（null＝出さない）。点数・バッジ・連続日数にはしない（事実の数だけ）。
export function growthMeterText(memoCount) {
  const left = growthLeft(memoCount);
  return left == null ? null : `あと ${left} 件で相談相手が育ちます`;
}

// はじめての相談の答えの下の一行。AI が挙げた参照からメモが数えられたら、その行（evidence）のまま。
// 数えられなかった（参照の書き方がずれた）ときも、はじめての相談だけは、答えに使ったメモの数で出す。
// 関係するメモが無かった答え（トークンを返した）・メモ 0 件には付けない（盛らない）。
export function firstAnswerEvidence({ evidence = null, memoCount = 0, isFirst = false, refunded = false } = {}) {
  if (evidence) return evidence;
  if (!isFirst || refunded) return null;
  const n = Math.floor(Number(memoCount) || 0);
  return n > 0 ? `あなたのメモ ${n} 件から答えました` : null;
}

// ── 端末の印（1 回だけ送る計測用） ───────────────────────────────────────
const KEYS = {
  path: 'orime-onboard-path', // 初回ガイドで選んだ道（import / ocr / quickstart / skip）
  pathDone: 'orime-onboard-path-done', // その道を終えた（onboard_path_done を送った）
  firstConsult: 'orime-first-consult-sent',
  below: 'orime-memos-below-goal-seen', // 10 件より少ないのを見たことがある
  reached: 'orime-memos-reached-goal',
};
export const ONBOARD_PATHS = ['import', 'ocr', 'quickstart', 'skip'];

const store = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};
const read = (k) => { try { return store()?.getItem(k) ?? null; } catch { return null; } };
const write = (k, v) => { try { store()?.setItem(k, v); } catch { /* 覚えられなくても画面は壊さない */ } };

export function rememberOnboardPath(path) {
  if (!ONBOARD_PATHS.includes(path)) return;
  write(KEYS.path, path);
}
export function getOnboardPath() {
  const p = read(KEYS.path);
  return ONBOARD_PATHS.includes(p) ? p : null;
}
// 初回ガイドで選んだ道を終えたとき 1 回だけ true（呼び出し側が onboard_path_done を送る）。
export function takeOnboardPathDone(path) {
  if (!path || getOnboardPath() !== path || read(KEYS.pathDone) === '1') return false;
  write(KEYS.pathDone, '1');
  return true;
}

// はじめての相談を送ったとき 1 回だけ true（first_consult_sent）。
export function takeFirstConsult() {
  if (read(KEYS.firstConsult) === '1') return false;
  write(KEYS.firstConsult, '1');
  return true;
}

// メモの件数を見るたびに呼ぶ。10 件より少ないのを見たあとで 10 件以上になったとき 1 回だけ true（memos_reached_10）。
// はじめから 10 件以上（前からのユーザー・別の端末）は送らずに印だけ付ける（リリースの日に一斉に数えないように）。
export function takeMemosReached(memoCount) {
  if (memoCount == null || memoCount === '') return false;
  const n = Number(memoCount);
  if (!Number.isFinite(n) || n < 0) return false;
  if (read(KEYS.reached) === '1') return false;
  if (n < GROWTH_GOAL) {
    write(KEYS.below, '1');
    return false;
  }
  write(KEYS.reached, '1');
  return read(KEYS.below) === '1';
}

export const FIRST_DAY_KEYS = KEYS;
