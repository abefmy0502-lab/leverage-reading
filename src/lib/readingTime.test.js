// ⏱ 集中モードの時間の数え方（2026-10-09）。
import { describe, it, expect } from 'vitest';
import {
  startFocus, elapsedSeconds, remainingSeconds, isTimerDone, timerProgress, pauseFocus, resumeFocus, continueAsCount,
  displayMinutes, sessionRow, todaySeconds, totalSeconds, fmtDuration, shareReadingNote, localDay,
  saveFocusState, loadFocusState, loadFocusPrefs, saveFocusPrefs, MIN_SESSION_SEC, MAX_SESSION_SEC, STALE_MS,
} from './readingTime';

const MIN = 60 * 1000;
const T0 = new Date(2026, 9, 9, 20, 0, 0).getTime(); // 10 月 9 日 20:00（端末の時刻）

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('時間の数え方（始めた時刻から数え直す）', () => {
  it('タイマーは残りを切り上げ、計測は経った分を切り捨てる（秒は出さない）', () => {
    const t = startFocus({ bookId: 'b', mode: 'timer', minutes: 30 }, T0);
    expect(displayMinutes(t, T0)).toEqual({ hours: 0, minutes: 30 });
    expect(displayMinutes(t, T0 + 1000)).toEqual({ hours: 0, minutes: 30 }); // 29:59 → 30
    expect(displayMinutes(t, T0 + 7 * MIN + 10_000)).toEqual({ hours: 0, minutes: 23 });
    const c = startFocus({ bookId: 'b', mode: 'count' }, T0);
    expect(displayMinutes(c, T0 + 59_000)).toEqual({ hours: 0, minutes: 0 });
    expect(displayMinutes(c, T0 + 65 * MIN)).toEqual({ hours: 1, minutes: 5 });
  });

  it('アプリを裏に回して 1 秒ごとの数えが止まっていても、戻ったときに Date.now() から正しく出し直す', () => {
    const t = startFocus({ bookId: 'b', mode: 'timer', minutes: 15 }, T0);
    // 裏で 10 分（その間は 1 度も数えていない）
    expect(remainingSeconds(t, T0 + 10 * MIN)).toBe(5 * 60);
    expect(isTimerDone(t, T0 + 10 * MIN)).toBe(false);
    // 裏にいる間にタイマーが終わっていた: 読んだのは 15 分（終わってから置いていた時間は数えない）
    expect(isTimerDone(t, T0 + 40 * MIN)).toBe(true);
    expect(elapsedSeconds(t, T0 + 40 * MIN)).toBe(15 * 60);
    expect(timerProgress(t, T0 + 40 * MIN)).toBe(1);
  });

  it('一時停止の間は数えない・再開すると続きから', () => {
    let s = startFocus({ bookId: 'b', mode: 'count' }, T0);
    s = pauseFocus(s, T0 + 10 * MIN);
    expect(elapsedSeconds(s, T0 + 50 * MIN)).toBe(10 * 60);
    expect(pauseFocus(s, T0 + 20 * MIN)).toBe(s); // 2 度止めない
    s = resumeFocus(s, T0 + 50 * MIN);
    expect(elapsedSeconds(s, T0 + 55 * MIN)).toBe(15 * 60);
    expect(resumeFocus(s, T0 + 56 * MIN)).toBe(s);
  });

  it('「続けて読む」はタイマーの長さから計測で続ける（終わってから押すまでの時間は数えない）', () => {
    const t = startFocus({ bookId: 'b', mode: 'timer', minutes: 30 }, T0);
    const c = continueAsCount(t, T0 + 45 * MIN);
    expect(c.mode).toBe('count');
    expect(c.durationSec).toBeNull();
    expect(elapsedSeconds(c, T0 + 45 * MIN)).toBe(30 * 60);
    expect(elapsedSeconds(c, T0 + 50 * MIN)).toBe(35 * 60);
  });

  it('1 回は 6 時間で止める・知らない分数は 30 分', () => {
    const c = startFocus({ bookId: 'b', mode: 'count' }, T0);
    expect(elapsedSeconds(c, T0 + 20 * 3600 * 1000)).toBe(MAX_SESSION_SEC);
    expect(startFocus({ bookId: 'b', mode: 'timer', minutes: 7 }, T0).durationSec).toBe(30 * 60);
  });
});

describe('記録する 1 行', () => {
  it('30 秒未満は残さない（押し間違い）・止めた時刻をおわりに', () => {
    const s = startFocus({ bookId: 'b', mode: 'timer', minutes: 15 }, T0);
    expect(sessionRow(s, T0 + (MIN_SESSION_SEC - 1) * 1000)).toBeNull();
    const row = sessionRow(pauseFocus(s, T0 + 12 * MIN), T0 + 30 * MIN);
    expect(row).toMatchObject({ book_id: 'b', seconds: 12 * 60, mode: 'timer' });
    expect(Date.parse(row.ended_at) - Date.parse(row.started_at)).toBe(12 * MIN);
  });
});

describe('その日の合計・これまでの合計', () => {
  const at = (ms) => new Date(ms).toISOString();
  const rows = [
    { book_id: 'b', started_at: at(T0 - 12 * 3600 * 1000), seconds: 20 * 60 }, // 今日の 8 時
    { book_id: 'b', started_at: at(T0 - 24 * 3600 * 1000), seconds: 45 * 60 }, // きのう
    { book_id: 'x', started_at: at(T0), seconds: 10 * 60 }, // ほかの本
    { book_id: 'b', started_at: at(T0 + 10 * MIN), seconds: 12 * 60 },
  ];
  it('今日（端末の暦の日・始めた日）のこの本だけ', () => {
    expect(localDay(T0)).toBe('2026-10-09');
    expect(todaySeconds(rows, 'b', T0 + 30 * MIN)).toBe(32 * 60);
    expect(totalSeconds(rows, 'b')).toBe(77 * 60);
  });
  it('「32 分」「1 時間 5 分」「2 時間」・30 秒は「1 分」', () => {
    expect(fmtDuration(32 * 60)).toBe('32 分');
    expect(fmtDuration(65 * 60)).toBe('1 時間 5 分');
    expect(fmtDuration(120 * 60 + 10)).toBe('2 時間');
    expect(fmtDuration(30)).toBe('1 分');
    expect(fmtDuration(0)).toBe('0 分');
  });
  it('写真で共有（雑誌）の欄は、今日読んでいれば「読書 32 分」・無ければ出さない', () => {
    expect(shareReadingNote(rows, 'b', T0 + 30 * MIN)).toEqual({ label: '読書', value: '32 分' });
    expect(shareReadingNote(rows, 'none', T0)).toBeNull();
    expect(shareReadingNote(rows, null, T0)).toBeNull();
  });
});

describe('端末に覚える', () => {
  it('途中の状態を保存して戻せる・古すぎる／壊れたものは捨てる', () => {
    const store = memStore();
    const s = pauseFocus(startFocus({ bookId: 'b', mode: 'timer', minutes: 45 }, T0), T0 + MIN);
    saveFocusState(s, store);
    expect(loadFocusState(T0 + 5 * MIN, store)).toEqual(s);
    expect(loadFocusState(T0 + STALE_MS + 1, store)).toBeNull();
    expect(store.getItem('orime.focus.v1')).toBeNull();
    store.setItem('orime.focus.v1', '{bad');
    expect(loadFocusState(T0, store)).toBeNull();
    saveFocusState(s, store);
    saveFocusState(null, store);
    expect(loadFocusState(T0, store)).toBeNull();
  });
  it('前回の選び方（はじめては タイマー 30 分）', () => {
    const store = memStore();
    expect(loadFocusPrefs(store)).toEqual({ mode: 'timer', minutes: 30, remembered: false });
    saveFocusPrefs({ mode: 'count', minutes: 45 }, store);
    expect(loadFocusPrefs(store)).toEqual({ mode: 'count', minutes: 45, remembered: true });
  });
});
