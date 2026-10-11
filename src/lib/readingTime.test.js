// ⏱ 集中モードの時間の数え方（2026-10-09）。
import { describe, it, expect } from 'vitest';
import {
  startFocus, elapsedSeconds, remainingSeconds, isTimerDone, timerProgress, pauseFocus, resumeFocus, continueAsCount,
  displayMinutes, sessionRow, todaySeconds, secondsWithin, dayRange, totalSeconds, fmtDuration, shareReadingNote, localDay,
  saveFocusState, loadFocusState, loadFocusPrefs, saveFocusPrefs, defaultUntilTime, untilToMs, checkUntil, fmtClock, MIN_SESSION_SEC, MAX_SESSION_SEC, STALE_MS,
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
    expect(loadFocusPrefs(store)).toEqual({ mode: 'timer', minutes: 30, until: false, remembered: false });
    saveFocusPrefs({ mode: 'count', minutes: 45 }, store);
    expect(loadFocusPrefs(store)).toEqual({ mode: 'count', minutes: 45, until: false, remembered: true });
    saveFocusPrefs({ mode: 'timer', minutes: 30, until: true }, store);
    expect(loadFocusPrefs(store)).toEqual({ mode: 'timer', minutes: 30, until: true, remembered: true });
  });
});

describe('日付をまたいだ回（2026-10-10）', () => {
  const at = (ms) => new Date(ms).toISOString();
  const midnight = new Date(2026, 9, 10, 0, 0, 0).getTime();
  it('23:50〜0:30 の 40 分は、今日（0 時から）の 30 分ときのうの 10 分に分ける', () => {
    const s = startFocus({ bookId: 'b', mode: 'count' }, midnight - 10 * MIN);
    const row = sessionRow(s, midnight + 30 * MIN);
    expect(row.seconds).toBe(40 * 60);
    expect(todaySeconds([row], 'b', midnight + 30 * MIN)).toBe(30 * 60);
    expect(todaySeconds([row], 'b', midnight - MIN)).toBe(10 * 60);
  });
  it('おわったばかりの回の今日の分も合計に入る（「今日 1 分」にならない）', () => {
    const rows = [
      { book_id: 'b', started_at: at(midnight + 2 * 3600 * 1000), ended_at: at(midnight + 2 * 3600 * 1000 + 15 * MIN), seconds: 15 * 60 },
      sessionRow(startFocus({ bookId: 'b', mode: 'count' }, midnight - 5 * MIN), midnight + 25 * MIN),
    ];
    expect(todaySeconds(rows, 'b', midnight + 3 * 3600 * 1000)).toBe(40 * 60);
  });
  it('タイマーが終わったあと日付をまたいで置いていた時間は、おわりの時刻に入れない', () => {
    const s = startFocus({ bookId: 'b', mode: 'timer', minutes: 30 }, midnight - 40 * MIN);
    const row = sessionRow(s, midnight + 20 * MIN);
    expect(row.seconds).toBe(30 * 60);
    expect(Date.parse(row.ended_at)).toBe(midnight - 10 * MIN);
    expect(todaySeconds([row], 'b', midnight + 20 * MIN)).toBe(0);
  });
  it('おわりの無い古い行は、始めた日で数える', () => {
    const { from, to } = dayRange(midnight + MIN);
    expect(to - from).toBe(24 * 3600 * 1000);
    expect(secondsWithin({ started_at: at(midnight + MIN), seconds: 600 }, from, to)).toBe(600);
    expect(secondsWithin({ started_at: at(midnight - MIN), seconds: 600 }, from, to)).toBe(0);
  });
});

describe('12 時間より前の途中の状態（2026-10-10）', () => {
  it('捨てる前に 1 回分として残す（タイマーは長さまで・おわりは始め＋長さ）・2 回目は残さない', () => {
    const store = memStore();
    const s = startFocus({ bookId: 'b', mode: 'timer', minutes: 30 }, T0);
    saveFocusState(s, store);
    const got = [];
    expect(loadFocusState(T0 + STALE_MS + 1, store, { onStale: (r) => got.push(r) })).toBeNull();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ book_id: 'b', seconds: 30 * 60, mode: 'timer' });
    expect(Date.parse(got[0].ended_at) - T0).toBe(30 * MIN);
    expect(loadFocusState(T0 + STALE_MS + 2, store, { onStale: (r) => got.push(r) })).toBeNull();
    expect(got).toHaveLength(1);
  });
  it('計測は 6 時間まで・止めていた時間は引く', () => {
    const store = memStore();
    saveFocusState(startFocus({ bookId: 'b', mode: 'count' }, T0), store);
    const got = [];
    loadFocusState(T0 + STALE_MS + 1, store, { onStale: (r) => got.push(r) });
    expect(got[0].seconds).toBe(MAX_SESSION_SEC);
    expect(Date.parse(got[0].ended_at) - T0).toBe(MAX_SESSION_SEC * 1000);
    const paused = pauseFocus(resumeFocus(pauseFocus(startFocus({ bookId: 'b', mode: 'timer', minutes: 45 }, T0), T0 + 10 * MIN), T0 + 20 * MIN), T0 + 25 * MIN);
    saveFocusState(paused, store);
    loadFocusState(T0 + STALE_MS + 1, store, { onStale: (r) => got.push(r) });
    expect(got[1].seconds).toBe(15 * 60);
    expect(Date.parse(got[1].ended_at) - T0).toBe(25 * MIN);
  });
});

describe('「◯時◯分まで」（2026-10-10）', () => {
  const at = (h, m, d = 9) => new Date(2026, 9, d, h, m, 0).getTime();
  it('既定は いま＋20 分を 5 分に切り上げ', () => {
    expect(defaultUntilTime(at(18, 23))).toBe('18:45');
    expect(defaultUntilTime(at(18, 25))).toBe('18:45');
    expect(defaultUntilTime(at(23, 50))).toBe('00:10');
    expect(fmtClock(at(9, 5))).toBe('09:05');
  });
  it('日付をまたぐ: 23:50 → 00:20 は 30 分', () => {
    const now = at(23, 50);
    expect(untilToMs('00:20', now)).toBe(at(0, 20, 10));
    expect(checkUntil('00:20', now)).toEqual({ ok: true, untilMs: at(0, 20, 10), minutes: 30 });
  });
  it('残りの分は切り上げ', () => {
    const now = at(18, 23) + 30 * 1000; // 18:23:30
    expect(checkUntil('18:45', now).minutes).toBe(22);
  });
  it('いまより前・いまの分は past', () => {
    expect(checkUntil('17:30', at(18, 0)).error).toBe('past');
    expect(checkUntil('18:00', at(18, 0)).error).toBe('past');
    expect(checkUntil('18:00', at(18, 0) - 30 * 1000).error).toBe('past');
  });
  it('6 時間を超えるのは tooLong・ちょうど 6 時間は ok', () => {
    expect(checkUntil('01:00', at(18, 0)).error).toBe('tooLong');
    expect(checkUntil('00:00', at(18, 0))).toMatchObject({ ok: true, minutes: 360 });
  });
  it('空・壊れた値は empty', () => {
    expect(checkUntil('', at(18, 0)).error).toBe('empty');
    expect(checkUntil('25:00', at(18, 0)).error).toBe('empty');
    expect(untilToMs('ab', at(18, 0))).toBeNull();
  });
  it('時刻まで のタイマー: 長さはその時刻まで・記録はタイマー', () => {
    const now = at(18, 23) + 30 * 1000;
    const s = startFocus({ bookId: 'b1', mode: 'timer', untilMs: at(18, 45) }, now);
    expect(s.mode).toBe('timer');
    expect(s.durationSec).toBe(21 * 60 + 30);
    expect(s.until).toBe(at(18, 45));
    expect(displayMinutes(s, now)).toEqual({ hours: 0, minutes: 22 });
    expect(sessionRow(s, at(18, 45)).mode).toBe('timer');
    // 6 時間で止める
    expect(startFocus({ bookId: 'b1', mode: 'timer', untilMs: now + 9 * 3600 * 1000 }, now).durationSec).toBe(MAX_SESSION_SEC);
  });

  it('秒の途中で始めても、入れた時刻のまま出す（10:48 が 10:47 にならない・2026-10-11）', () => {
    const base = new Date(2026, 9, 11, 10, 46, 0, 0).getTime();
    const target = new Date(2026, 9, 11, 10, 48, 0, 0).getTime();
    const now = base + 20_400; // 10:46:20.4
    const s = startFocus({ bookId: 'b', mode: 'timer', untilMs: target }, now);
    expect(s.until).toBe(target);
    expect(fmtClock(s.until)).toBe('10:48');
    expect(s.startedAt + s.durationSec * 1000).toBeGreaterThanOrEqual(target);
    // 前の版で保存した途中の状態（数百ミリ秒前にずれた時刻）も 10:48 と出す
    expect(fmtClock(target - 400)).toBe('10:48');
  });
});
