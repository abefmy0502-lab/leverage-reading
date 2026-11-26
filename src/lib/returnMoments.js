// 🌙 また開いたときの 1 行（2026-11-26 オーナー「無料ユーザーが 1・3・5・7・30・90・180・365 日目に使い続ける仕組みに」）。
//
// 点検で分かったこと: 何日か空けて戻ってきた人にも、1 か月・半年・1 年たった人にも、ホームは毎回同じだった
//   （iPhone のアプリは通知も既定で出ない）。読むほど育つアプリなのに、育ったことに出会う瞬間が無かった。
//
// 出すもの（ホームの題の下・1 行・× で閉じる・AI なし・通知は送らない）:
//   - はじめて 1 か月・3 か月・半年・1 年（その日から 14 日のうちに開いたとき・1 回だけ）
//       「orime をはじめて 3 か月。最初に書いたメモ「…」」→「読み返す」＝そのメモを開く
//   - 3 日以上あけて開いたとき（その日 1 回だけ）
//       「おかえりなさい。2 週間前に書いたメモ「…」」→「読み返す」
//     選ぶメモは思い出しカードと同じ（忘れかけたものから・自分の言葉だけ・AI のまとめは出さない）。
//
// 出さないもの: 連続日数・「N 日ぶり」の数・目標・バッジ・責める言葉（「しばらく開いていません」など）。
//   空けた日数は数字にしない（「おかえりなさい」だけ）。メモが 1 件も無い人には出さない（はじめの一歩が出る）。
//
// ⚠️ 純関数だけ（I/O なし）。端末に覚えるのは hooks/useReturnMoment.js。

import { pickRecallMemo, pickFallbackMemo, recallFraming, memoExcerpt, isAiWritten } from './recall';

const DAY_MS = 86400000;

// 「はじめて N」の区切り（アカウントを作ってからの日数）。1 年からは 1 年ごと。
export const ANNIVERSARIES = Object.freeze([
  { days: 30, label: '1 か月' },
  { days: 90, label: '3 か月' },
  { days: 180, label: '半年' },
  { days: 365, label: '1 年' },
]);
export const ANNIVERSARY_WINDOW_DAYS = 14;
// 何日あけたら「おかえりなさい」（毎日・1 日おきに開く人には出さない＝続けて出すと重い）。
export const BACK_AFTER_DAYS = 3;

// 日本時間の日付（'YYYY-MM-DD'）。端末の時刻に頼らない（ほかの月の決まりと同じ）。
export function jstDay(ms) {
  const d = new Date(Number(ms) + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}
export function dayDiff(fromDay, toDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDay || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(toDay || ''))) return null;
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

// 今日が「はじめて N」の 14 日のうちなら { days, label, key }。作った日が読めなければ null。
export function anniversaryOf(createdAt, now) {
  const t = new Date(createdAt || '').getTime();
  if (!Number.isFinite(t)) return null;
  const age = dayDiff(jstDay(t), jstDay(now));
  if (age == null || age < ANNIVERSARIES[0].days) return null;
  const marks = [...ANNIVERSARIES];
  for (let y = 2; y <= 20; y += 1) marks.push({ days: 365 * y, label: `${y} 年` });
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const m = marks[i];
    if (age >= m.days) return age < m.days + ANNIVERSARY_WINDOW_DAYS ? { ...m, key: `anniv:${m.days}` } : null;
  }
  return null;
}

// 自分の言葉の、本のメモだけ（本を開いて見せられるもの）。
function ownBookMemos(memos, bookIds) {
  return (Array.isArray(memos) ? memos : []).filter((m) => m && m.bookId && (!bookIds || bookIds.has(m.bookId))
    && String(m.text || '').trim() && !isAiWritten(m) && Number.isFinite(new Date(m.createdAt).getTime()));
}

// 今日出す 1 行を決める。出さないなら null。
//   memos: [{ id, bookId, text, createdAt, lastRecalledAt?, recallCount?, sourceType? }]
//   prevDay: 前に開いた日（'YYYY-MM-DD'・はじめてなら null）
//   done: もう出した印の集まり（Set）。'anniv:90'・'back:2026-11-26' など
export function pickReturnMoment({ now, createdAt = null, prevDay = null, memos = [], bookIds = null, done = new Set() } = {}) {
  const today = jstDay(now);
  const own = ownBookMemos(memos, bookIds);
  if (!own.length) return null;
  const ann = anniversaryOf(createdAt, now);
  if (ann && !done.has(ann.key)) {
    const first = [...own].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)))[0];
    // 最初のメモが今月のもの（あとから書き始めた人）でも、はじめて N の 1 行は出す（いちばん古い自分の言葉）。
    return { kind: 'anniv', key: ann.key, label: ann.label, memo: first, lead: `orime をはじめて ${ann.label}。最初に書いたメモ` };
  }
  const gap = dayDiff(prevDay, today);
  const backKey = `back:${today}`;
  if (gap != null && gap >= BACK_AFTER_DAYS && !done.has(backKey)) {
    const seed = Number(today.replace(/-/g, '')) || 0;
    // 思い出しカードと同じ選び方。まだ若いメモしか無い人（はじめて数日）は、1 日以上前のメモから。
    const memo = pickRecallMemo(own, { now, minAgeDays: 2, seed }) || pickFallbackMemo(own, { now, minAgeDays: 1, seed });
    if (!memo) return null;
    return { kind: 'back', key: backKey, memo, lead: `おかえりなさい。${recallFraming(memo.createdAt, now) || '前に書いたメモ'}` };
  }
  return null;
}

// 画面に出す引用（「」で包む・1 行に収まる長さで…）。
export function momentQuote(memo, max = 40) {
  // 中の「」は『』に（「」の入れ子で読みにくくしない）。
  const t = memoExcerpt(memo?.text || '', max).replace(/「/g, '『').replace(/」/g, '』');
  return t ? `「${t}」` : '';
}
