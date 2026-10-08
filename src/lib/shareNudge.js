// 📷 ホームの控えめな 1 行「◯月の読書を、1 枚の画像に」「2026年の読書を、1 枚の画像に」（2026-10-08）。
//
// company/marketing-strategy-2026-11.md §6 の 2・3（オーナー承認済み）:
//   - 月末: 毎月の最後の 3 日間（端末の日付）、その月に読了 1 冊以上かメモ 3 件以上ある人だけ
//           → 押すと写真で共有の「今月」。閉じても押しても、その月は二度と出さない
//   - 12 月: 12/1〜12/31、今年に読み終えた本が 1 冊以上ある人だけ
//           → 押すと写真で共有の「今年」。閉じても押しても、その年は二度と出さない。
//             触らないまま 3 回（アプリを開いた回数）出したら、もう出さない（YEAR_NUDGE_MAX_SHOWS）
// 12 月は今月の声かけを出さない（今年の 1 行を閉じた直後に今月の 1 行が出ないように・2026-10-08 第 2 回 ui-critic）。
// 通知は送らない。覚えるのは端末の中だけ（localStorage・読めない端末では毎回の判定のまま＝出しても閉じられる）。
//
// canvas も DOM も触らない純粋関数（テストで確かめる）。画面は components/ShareNudge.jsx。

import { parseLocalDate, hasFinishedThisYear, isYearWrapSeason } from './shareOverlay';

export const MONTH_END_DAYS = 3;
export const MONTH_NUDGE_MIN_MEMOS = 3;
export const YEAR_NUDGE_MAX_SHOWS = 3;
export const SHARE_NUDGE_STORAGE_KEY = 'orime.share.nudges';

const pad2 = (n) => String(n).padStart(2, '0');
export const monthKeyOf = (now = new Date()) => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
export const yearKeyOf = (now = new Date()) => String(now.getFullYear());

// 毎月の最後の 3 日間か（28 日の月は 26〜28 日・31 日の月は 29〜31 日）。
export function isMonthEndWindow(now = new Date(), days = MONTH_END_DAYS) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() > last - days;
}

// その月に読み終えた本の冊数。
export function finishedInMonth(books, now = new Date()) {
  return (Array.isArray(books) ? books : []).filter((b) => {
    if (!b || b.status !== 'done') return false;
    const d = parseLocalDate(b.doneDate);
    return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
}

// 月末の声かけの条件（読了 1 冊以上 か メモ 3 件以上）。メモの件数が分からない（null）ときは、読了だけで決める。
export function monthNudgeEligible({ finishedCount = 0, memoCount = null } = {}) {
  if (finishedCount >= 1) return true;
  return Number.isFinite(memoCount) && memoCount >= MONTH_NUDGE_MIN_MEMOS;
}

// 端末に覚えた「もう出さない」印と、今年の 1 行を出した回数。
// { month: 'YYYY-MM' | null, year: 'YYYY' | null, yearShows: { year: 'YYYY', n } | null }
export function readNudgeState(storage) {
  try {
    const raw = storage?.getItem(SHARE_NUDGE_STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    const ys = p && p.yearShows && typeof p.yearShows.year === 'string' && Number.isFinite(p.yearShows.n) ? { year: p.yearShows.year, n: p.yearShows.n } : null;
    return {
      month: p && typeof p.month === 'string' ? p.month : null,
      year: p && typeof p.year === 'string' ? p.year : null,
      yearShows: ys,
    };
  } catch {
    return { month: null, year: null, yearShows: null };
  }
}

// 今年の 1 行を出した回数（その年の分だけ数える）。
export function yearShowCount(state, now = new Date()) {
  const ys = state?.yearShows;
  return ys && ys.year === yearKeyOf(now) ? ys.n : 0;
}

// 今年の 1 行を 1 回出した（アプリを開いて 1 回だけ呼ぶ）。戻り値は新しい印（書けなければ null）。
export function recordYearShown(storage, now = new Date()) {
  try {
    const cur = readNudgeState(storage);
    const next = { ...cur, yearShows: { year: yearKeyOf(now), n: yearShowCount(cur, now) + 1 } };
    storage?.setItem(SHARE_NUDGE_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

// 押した・閉じた → その月（年）は出さない。
export function markNudgeDone(storage, kind, now = new Date()) {
  try {
    const next = { ...readNudgeState(storage) };
    if (kind === 'year') next.year = yearKeyOf(now);
    else next.month = monthKeyOf(now);
    storage?.setItem(SHARE_NUDGE_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

// 1 行の文（その月・年の数字）。
export function nudgeText(kind, now = new Date()) {
  return kind === 'year' ? `${now.getFullYear()}年の読書を、1 枚の画像に` : `${now.getMonth() + 1}月の読書を、1 枚の画像に`;
}

// 今月のメモの件数を数える必要があるか（月末で、まだ出していなくて、読了だけでは決まらないとき）。
// 数えるのは要るときだけ（ふだんは問い合わせない）。
export function needsMonthMemoCount({ now = new Date(), books = [], state = { month: null, year: null } } = {}) {
  if (isYearWrapSeason(now) || !isMonthEndWindow(now) || state.month === monthKeyOf(now)) return false;
  return finishedInMonth(books, now) === 0;
}

// いま出す 1 行（無ければ null）。戻り値: { kind: 'year' | 'month', text }
export function pickShareNudge({ now = new Date(), books = [], monthMemoCount = null, state = { month: null, year: null } } = {}) {
  const list = Array.isArray(books) ? books : [];
  if (isYearWrapSeason(now)) {
    // 12 月は今年だけ（今月の 1 行は出さない）。
    if (state.year !== yearKeyOf(now) && yearShowCount(state, now) < YEAR_NUDGE_MAX_SHOWS && hasFinishedThisYear(list, now)) {
      return { kind: 'year', text: nudgeText('year', now) };
    }
    return null;
  }
  if (isMonthEndWindow(now) && state.month !== monthKeyOf(now)
    && monthNudgeEligible({ finishedCount: finishedInMonth(list, now), memoCount: monthMemoCount })) {
    return { kind: 'month', text: nudgeText('month', now) };
  }
  return null;
}
