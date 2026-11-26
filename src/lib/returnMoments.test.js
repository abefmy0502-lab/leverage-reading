import { describe, it, expect } from 'vitest';
import { anniversaryOf, pickReturnMoment, jstDay, dayDiff, momentQuote } from './returnMoments';

const DAY = 86400000;
const NOW = Date.parse('2026-11-26T03:00:00Z'); // 日本時間 12 時
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const memo = (id, days, extra = {}) => ({ id, bookId: 'b1', text: `メモ ${id} の本文`, createdAt: ago(days), ...extra });

describe('jstDay / dayDiff', () => {
  it('日本時間の日付で数える', () => {
    expect(jstDay(Date.parse('2026-11-25T16:00:00Z'))).toBe('2026-11-26');
    expect(dayDiff('2026-11-20', '2026-11-26')).toBe(6);
    expect(dayDiff(null, '2026-11-26')).toBe(null);
  });
});

describe('anniversaryOf', () => {
  it('1 か月・3 か月・半年・1 年・2 年の 14 日のうちだけ', () => {
    expect(anniversaryOf(ago(29), NOW)).toBe(null);
    expect(anniversaryOf(ago(30), NOW)?.label).toBe('1 か月');
    expect(anniversaryOf(ago(43), NOW)?.label).toBe('1 か月');
    expect(anniversaryOf(ago(44), NOW)).toBe(null);
    expect(anniversaryOf(ago(95), NOW)?.label).toBe('3 か月');
    expect(anniversaryOf(ago(180), NOW)?.key).toBe('anniv:180');
    expect(anniversaryOf(ago(370), NOW)?.label).toBe('1 年');
    expect(anniversaryOf(ago(731), NOW)?.label).toBe('2 年');
    expect(anniversaryOf(null, NOW)).toBe(null);
  });
});

describe('pickReturnMoment', () => {
  const memos = [memo('a', 40), memo('b', 20), memo('c', 1)];
  it('メモが無ければ出さない', () => {
    expect(pickReturnMoment({ now: NOW, createdAt: ago(30), prevDay: '2026-11-01', memos: [] })).toBe(null);
  });
  it('はじめて N は最初のメモ（1 回だけ）', () => {
    const m = pickReturnMoment({ now: NOW, createdAt: ago(31), prevDay: '2026-11-25', memos });
    expect(m.kind).toBe('anniv');
    expect(m.memo.id).toBe('a');
    expect(m.lead).toBe('orime をはじめて 1 か月。最初に書いたメモ');
    expect(pickReturnMoment({ now: NOW, createdAt: ago(31), prevDay: '2026-11-25', memos, done: new Set(['anniv:30']) })).toBe(null);
  });
  it('3 日以上あけたら「おかえりなさい」・2 日では出さない', () => {
    expect(pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-24', memos })).toBe(null);
    const m = pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-23', memos });
    expect(m.kind).toBe('back');
    expect(m.key).toBe('back:2026-11-26');
    expect(m.lead.startsWith('おかえりなさい。')).toBe(true);
    expect(m.lead).not.toMatch(/ぶり/);
    expect(pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-23', memos, done: new Set(['back:2026-11-26']) })).toBe(null);
  });
  it('はじめて開いた日（前の日が無い）は出さない', () => {
    expect(pickReturnMoment({ now: NOW, createdAt: ago(5), prevDay: null, memos })).toBe(null);
  });
  it('始めたばかりで若いメモしか無くても、1 日以上前のメモから', () => {
    const m = pickReturnMoment({ now: NOW, createdAt: ago(5), prevDay: '2026-11-21', memos: [memo('x', 5), memo('y', 0)] });
    expect(m.memo.id).toBe('x');
  });
  it('AI のまとめ・本の無いメモ・本棚に無い本のメモは出さない', () => {
    const only = [memo('ai', 30, { sourceType: 'ai_summary' }), memo('p', 30, { bookId: null }), memo('gone', 30, { bookId: 'zz' })];
    expect(pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-01', memos: only, bookIds: new Set(['b1']) })).toBe(null);
  });
});

describe('momentQuote', () => {
  it('「」で包んで長ければ切る', () => {
    expect(momentQuote({ text: '短い' })).toBe('「短い」');
    expect(momentQuote({ text: 'あ'.repeat(60) }, 10)).toBe(`「${'あ'.repeat(9)}…」`);
    expect(momentQuote({ text: '条件は「本質的」であること' })).toBe('「条件は『本質的』であること」');
    expect(momentQuote(null)).toBe('');
  });
});
