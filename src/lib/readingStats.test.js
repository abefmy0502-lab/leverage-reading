import { describe, it, expect } from 'vitest';
import {
  weekStartOf, monthRange, periodSeconds, hasReadingTime, defaultPeriod, weeklyTotals,
  bookTotals, tagTotals, bookInTag, fmtReadingTotal, weekName, NO_TAG, OTHER_TAGS,
} from './readingStats';

// 端末の暦の時刻（テストの時差に左右されない）。
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const row = (bookId, startMs, minutes, id = `${bookId}-${startMs}`) => ({
  id, book_id: bookId, started_at: new Date(startMs).toISOString(),
  ended_at: new Date(startMs + minutes * 60000).toISOString(), seconds: minutes * 60,
});

// 2026-10-14（水）の昼。今週は 10/12（月）から。
const NOW = at(2026, 10, 14, 12);
const books = [
  { id: 'a', title: '数値化の鬼', tags: ['マネジメント'] },
  { id: 'b', title: '1兆ドルコーチ', tags: ['マネジメント', 'コミュニケーション'] },
  { id: 'c', title: 'アウトプット大全', tags: [] },
  { id: 'd', title: '読んでいない本', tags: ['キャリア'] },
];

describe('weekStartOf / monthRange', () => {
  it('月曜の 0 時', () => {
    expect(weekStartOf(NOW)).toBe(at(2026, 10, 12));
    expect(weekStartOf(at(2026, 10, 12, 0, 0))).toBe(at(2026, 10, 12));
    expect(weekStartOf(at(2026, 10, 18, 23, 59))).toBe(at(2026, 10, 12)); // 日曜はその週
  });
  it('月の範囲', () => {
    expect(monthRange(NOW)).toEqual({ from: at(2026, 10, 1), to: at(2026, 11, 1) });
  });
});

describe('weeklyTotals', () => {
  it('12 週・古い順・今週が最後', () => {
    const w = weeklyTotals([], books, { now: NOW });
    expect(w).toHaveLength(12);
    expect(w[11].isCurrent).toBe(true);
    expect(w[11].from).toBe(at(2026, 10, 12));
    expect(w[0].from).toBe(at(2026, 7, 27));
  });
  it('日曜の夜から月曜の朝にまたいだ回は、時刻の割合で 2 つの週に分ける', () => {
    // 10/11（日）23:30 から 60 分＝前の週 30 分・今週 30 分。
    const w = weeklyTotals([row('a', at(2026, 10, 11, 23, 30), 60)], books, { now: NOW });
    expect(w[10].seconds).toBe(30 * 60);
    expect(w[11].seconds).toBe(30 * 60);
  });
  it('真夜中をまたいでも同じ週なら 1 つの週', () => {
    const w = weeklyTotals([row('a', at(2026, 10, 13, 23, 50), 40)], books, { now: NOW });
    expect(w[11].seconds).toBe(40 * 60);
  });
  it('月の名前は 1 日がある週（いちばん左はその月）', () => {
    const w = weeklyTotals([], books, { now: NOW });
    expect(w[0].monthLabel).toBe('8月'); // 7/27〜8/2 に 8/1
    // 10/10（土）なら左端は 7/20〜26（1 日なし）・すぐ右に 8/1 があるので左端は出さない。
    const w2 = weeklyTotals([], books, { now: at(2026, 10, 10, 12) });
    expect(w2[0].monthLabel).toBe('');
    expect(w2[1].monthLabel).toBe('8月');
    // 左端の週に 1 日が無く、すぐ右にも無いときは、その月の名前。
    expect(weeklyTotals([], books, { now: at(2026, 10, 21, 12) })[0].monthLabel).toBe('8月');
    const oct = w.findIndex((x) => x.monthLabel === '10月');
    expect(new Date(w[oct].from).getDate()).toBe(28); // 9/28〜10/4
  });
  it('本棚に無い本の行は数えない', () => {
    const w = weeklyTotals([row('zz', at(2026, 10, 13, 8), 30)], books, { now: NOW });
    expect(w[11].seconds).toBe(0);
  });
});

describe('期間の合計', () => {
  const rows = [
    row('a', at(2026, 10, 13, 7), 20),
    row('a', at(2026, 9, 30, 23, 30), 60), // 9 月 30 分・10 月 30 分
    row('b', at(2026, 9, 10, 21), 45),
  ];
  it('今月は月をまたいだ回を割合で', () => {
    expect(periodSeconds(rows, books, 'month', NOW)).toBe(50 * 60);
  });
  it('これまでは全部', () => {
    expect(periodSeconds(rows, books, 'all', NOW)).toBe(125 * 60);
  });
  it('はじめの期間: 今月に記録があれば今月', () => {
    expect(defaultPeriod(rows, books, NOW)).toBe('month');
    expect(defaultPeriod([rows[2]], books, NOW)).toBe('all');
  });
  it('記録が無ければ区画を出さない', () => {
    expect(hasReadingTime([], books)).toBe(false);
    expect(hasReadingTime(rows, books)).toBe(true);
    expect(hasReadingTime([row('zz', NOW - 3600000, 30)], books)).toBe(false);
  });
});

describe('bookTotals', () => {
  const rows = [
    row('a', at(2026, 10, 13, 7), 20),
    row('a', at(2026, 10, 12, 7), 25),
    row('b', at(2026, 9, 10, 21), 90),
    row('c', at(2026, 10, 1, 21), 10),
  ];
  it('多い順・期間に読んだ本だけ', () => {
    expect(bookTotals(rows, books, 'all', NOW).map((x) => [x.book.id, x.seconds / 60])).toEqual([['b', 90], ['a', 45], ['c', 10]]);
    expect(bookTotals(rows, books, 'month', NOW).map((x) => x.book.id)).toEqual(['a', 'c']);
  });
});

describe('tagTotals', () => {
  const rows = [
    row('a', at(2026, 10, 13, 7), 30),
    row('b', at(2026, 10, 12, 7), 60),
    row('c', at(2026, 10, 1, 21), 15),
  ];
  const sumOf = (t) => [...t.items, ...(t.other ? [t.other] : []), ...(t.untagged ? [t.untagged] : [])].reduce((m, x) => m + x.minutes, 0);
  it('タグが 2 つの本は時間をタグの数で分ける（重ねて数えない）・タグなしは最後', () => {
    const t = tagTotals(rows, books, 'all', NOW);
    // マネジメント＝a 30 ＋ b 60/2 ＝ 60・コミュニケーション＝b 60/2 ＝ 30・タグなし＝c 15。
    expect(t.items.map((x) => [x.tag, x.minutes, x.books])).toEqual([['マネジメント', 60, 2], ['コミュニケーション', 30, 1]]);
    expect(t.untagged).toMatchObject({ tag: NO_TAG, minutes: 15, books: 1 });
    expect(t.other).toBeNull();
    expect(t.totalMinutes).toBe(105);
    expect(sumOf(t)).toBe(105);
  });
  it('3 つのタグで割り切れなくても、丸めた分の和は合計と同じ', () => {
    const bs = [{ id: 'p', title: '三つ', tags: ['A', 'B', 'C'] }, { id: 'q', title: '二つ', tags: ['A', 'D'] }];
    const r = [row('p', at(2026, 10, 13, 7), 50), row('q', at(2026, 10, 13, 9), 7)];
    const t = tagTotals(r, bs, 'all', NOW);
    expect(t.totalMinutes).toBe(57);
    expect(sumOf(t)).toBe(57);
    expect(t.items[0].tag).toBe('A'); // 50/3 ＋ 7/2 ＝ 20.2
  });
  it('上位のあとは「ほか」にまとめ、それでも和は合計と同じ', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, title: `本${i}`, tags: [`タグ${i}`] }));
    many.push({ id: 'x', title: '重なる本', tags: ['タグ6', 'タグ7'] });
    const r = many.map((b, i) => row(b.id, at(2026, 10, 2 + (i % 5), 8), b.id === 'x' ? 2 : 100 - i * 5));
    const t = tagTotals(r, many, 'all', NOW, { top: 6 });
    expect(t.items).toHaveLength(6);
    expect(t.other.tag).toBe(OTHER_TAGS);
    expect(t.other.tags).toBe(2);
    // ほか＝本6（70）＋本7（65）＋重なる本（2＝1＋1）＝ 137 分。
    expect(t.other.minutes).toBe(137);
    expect(sumOf(t)).toBe(t.totalMinutes);
  });
  it('期間で絞る', () => {
    const t = tagTotals([row('b', at(2026, 9, 10, 21), 60), row('a', at(2026, 10, 3, 7), 20)], books, 'month', NOW);
    expect(t.items.map((x) => x.tag)).toEqual(['マネジメント']);
    expect(t.totalMinutes).toBe(20);
  });
});

describe('bookInTag', () => {
  it('タグとタグなし', () => {
    expect(bookInTag(books[1], 'コミュニケーション')).toBe(true);
    expect(bookInTag(books[0], 'コミュニケーション')).toBe(false);
    expect(bookInTag(books[2], NO_TAG)).toBe(true);
    expect(bookInTag(books[0], NO_TAG)).toBe(false);
    expect(bookInTag(books[0], null)).toBe(true);
  });
});

describe('書き方', () => {
  it('「2 時間 5 分」「45 分」', () => {
    expect(fmtReadingTotal(125 * 60)).toBe('2 時間 5 分');
    expect(fmtReadingTotal(45 * 60)).toBe('45 分');
    expect(fmtReadingTotal(180 * 60)).toBe('3 時間');
  });
  it('週の名前', () => {
    expect(weekName(at(2026, 10, 12))).toBe('10月12日の週');
  });
});
