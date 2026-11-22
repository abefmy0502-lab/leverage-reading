// 📅 読書計画カレンダー（lib/readingPlan.js）。
import { describe, it, expect } from 'vitest';
import {
  readingSpeedFactor, estimateBookMinutes, scheduleBooks, planItemsFromRoadmap, monthWeeks, weekBands,
  planItemsFromOrder, planMonths, bookOnDay, fmtSpan, fmtMd, fmtRange, fmtHoursMin, addDays, DEFAULT_BOOK_MINUTES, MIN_LEFT_MINUTES,
} from './readingPlan';

describe('1 冊にかかる時間', () => {
  it('読む時間の目安 ＞ ページ数 × 2 分 × 速さ ＞ 決まりの 400 分', () => {
    expect(estimateBookMinutes({ readTargetMin: 300, totalPages: 200 })).toBe(300);
    expect(estimateBookMinutes({ totalPages: 200 }, { speed: 1.5 })).toBe(600);
    expect(estimateBookMinutes({})).toBe(DEFAULT_BOOK_MINUTES);
  });
  it('読書中の本は読んだ分を引く（少なくとも 30 分）', () => {
    expect(estimateBookMinutes({ status: 'reading', totalPages: 100 }, { readMinutes: 50 })).toBe(150);
    expect(estimateBookMinutes({ status: 'reading', totalPages: 100 }, { readMinutes: 999 })).toBe(MIN_LEFT_MINUTES);
  });
  it('本人の速さは読了の本の真ん中（0.5〜2 倍・分からなければ 1）', () => {
    const books = [
      { id: 'a', status: 'done', totalPages: 100 },
      { id: 'b', status: 'done', totalPages: 100 },
      { id: 'c', status: 'reading', totalPages: 100 },
    ];
    const sessions = [{ book_id: 'a', seconds: 100 * 60 }, { book_id: 'b', seconds: 300 * 60 }, { book_id: 'c', seconds: 999 * 60 }];
    expect(readingSpeedFactor(books, sessions)).toBe(1); // (0.5 + 1.5) / 2
    expect(readingSpeedFactor(books, [])).toBe(1);
    expect(readingSpeedFactor([{ id: 'a', status: 'done', totalPages: 100 }], [{ book_id: 'a', seconds: 9999 * 60 }])).toBe(2);
  });
});

describe('日付の割り振り', () => {
  it('1 日の分で日数を決め、同じ日に 2 冊置かない', () => {
    const s = scheduleBooks([{ bookId: 'a', minutes: 90 }, { bookId: 'b', minutes: 30 }], { minutesPerDay: 30, start: '2026-11-15' });
    expect(s.map((x) => [x.bookId, x.start, x.end, x.days])).toEqual([['a', '2026-11-15', '2026-11-17', 3], ['b', '2026-11-18', '2026-11-18', 1]]);
  });
  it('区切りが始まる日より前には始めない（間があく）', () => {
    const s = scheduleBooks([{ bookId: 'a', minutes: 30 }, { bookId: 'b', minutes: 30, notBefore: '2027-02-01' }], { minutesPerDay: 30, start: '2026-11-15' });
    expect(s[1].start).toBe('2027-02-01');
  });
  it('時間を増やすと早く終わる', () => {
    const items = [{ bookId: 'a', minutes: 600 }];
    const slow = scheduleBooks(items, { minutesPerDay: 15, start: '2026-11-15' });
    const fast = scheduleBooks(items, { minutesPerDay: 60, start: '2026-11-15' });
    expect(slow[0].days).toBe(40);
    expect(fast[0].days).toBe(10);
  });
  it('ロードマップの順に・読了と重複を外す・区切りの始まりは目安で待たない', () => {
    const books = [{ id: 'a', status: 'want' }, { id: 'b', status: 'done' }, { id: 'c', status: 'before' }];
    const roadmap = { phases: [{ books: [{ bookId: 'a' }, { bookId: 'b' }] }, { books: [{ bookId: 'a' }, { bookId: 'c' }, { bookId: 'x' }] }] };
    const items = planItemsFromRoadmap(roadmap, books, { phaseStarts: ['2026-11-01', '2027-02-01'] });
    expect(items.map((i) => [i.bookId, i.phase, i.notBefore, i.phaseStart])).toEqual([['a', 0, null, '2026-11-01'], ['c', 1, null, '2027-02-01']]);
    // 前の本が早く終わっても、次の区切りまで空けない
    const s = scheduleBooks(items.map((i) => ({ ...i, minutes: 30 })), { minutesPerDay: 30, start: '2026-11-15' });
    expect(s.map((x) => x.start)).toEqual(['2026-11-15', '2026-11-16']);
  });
});

describe('本人が決めた順番', () => {
  it('並べた順に今日から（読了・消えた本・重なりは外す・区切りの始まりは待たない）', () => {
    const books = [{ id: 'a', status: 'want' }, { id: 'b', status: 'done' }, { id: 'c', status: 'before' }];
    const items = planItemsFromOrder(['c', 'x', 'b', 'a', 'c'], books, { phaseOf: new Map([['a', 1]]), fallbackPhase: 0 });
    expect(items.map((i) => [i.bookId, i.phase, i.notBefore])).toEqual([['c', 0, null], ['a', 1, null]]);
  });
});

describe('カレンダー', () => {
  it('月曜はじまりで 7 日ずつ（前後の月の日も入る）', () => {
    const w = monthWeeks(2026, 10); // 2026 年 11 月（1 日は日曜）
    expect(w[0][0].date).toBe('2026-10-26');
    expect(w[0][6]).toMatchObject({ date: '2026-11-01', inMonth: true });
    expect(w.every((x) => x.length === 7)).toBe(true);
    expect(w[w.length - 1][6].date).toBe('2026-12-06');
  });
  it('週の帯: 列・幅・始まり／終わり', () => {
    const week = monthWeeks(2026, 10)[3]; // 11/16〜11/22
    const bands = weekBands(week, [{ bookId: 'a', start: '2026-11-15', end: '2026-11-18' }, { bookId: 'b', start: '2026-11-19', end: '2026-11-30' }]);
    expect(bands).toEqual([
      { bookId: 'a', phase: undefined, col: 0, span: 3, head: false, tail: true },
      { bookId: 'b', phase: undefined, col: 3, span: 4, head: true, tail: false },
    ]);
  });
  it('予定のある月・今日の本', () => {
    const s = [{ bookId: 'a', start: '2026-11-15', end: '2026-11-20' }, { bookId: 'b', start: '2027-01-02', end: '2027-01-03' }];
    expect(planMonths(s, '2026-11-15').map((m) => `${m.year}-${m.month + 1}`)).toEqual(['2026-11', '2026-12', '2027-1']);
    expect(bookOnDay(s, '2026-11-16').bookId).toBe('a');
    expect(bookOnDay(s, '2026-12-01')).toBe(null);
  });
});

describe('書き方', () => {
  it('期間・日付・時間', () => {
    expect(fmtSpan(3)).toBe('3 日');
    expect(fmtSpan(20)).toBe('約 3 週間');
    expect(fmtSpan(90)).toBe('約 3 か月');
    expect(fmtMd('2027-02-01', 2026)).toBe('2027.2.1');
    expect(fmtMd('2026-12-03', 2026)).toBe('12/3');
    expect(fmtRange('2026-11-16', '2026-11-16', 2026)).toBe('11/16');
    expect(fmtRange('2026-11-16', '2026-11-25', 2026)).toBe('11/16〜11/25');
    expect(fmtHoursMin(45)).toBe('45 分');
    expect(fmtHoursMin(320)).toBe('5 時間 20 分');
    expect(fmtHoursMin(120)).toBe('2 時間');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
