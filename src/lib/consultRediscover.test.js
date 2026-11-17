// 忘れかけた古いメモの枠（2026-11-17・何年使っても一番の価値が出るように）。
import { describe, it, expect } from 'vitest';
import { selectConsultMemos, rediscoverMemos, consultDayNow } from './ai';

const now = new Date('2026-11-17T10:00:00').getTime();
const ago = (d) => new Date(now - d * 86400000).toISOString();
const memo = (i, days, extra = {}) => ({ id: `m${i}`, text: `メモ${i} `.repeat(30), created_at: ago(days), book_id: `b${i % 7}`, book: { id: `b${i % 7}`, title: `本${i % 7}`, rating: 0 }, ...extra });

describe('忘れかけた古いメモ', () => {
  const recent = Array.from({ length: 120 }, (_, i) => memo(i, i % 60));
  const old = Array.from({ length: 300 }, (_, i) => memo(1000 + i, 200 + i * 3));
  const all = [...recent, ...old];
  it('入りきらないとき、芯に 100 日より前のメモが入る', () => {
    const { core, fitsAll } = selectConsultMemos('', all, { now });
    expect(fitsAll).toBe(false);
    expect(core.some((m) => Date.parse(m.created_at) < now - 100 * 86400000)).toBe(true);
  });
  it('その日のうちは同じ・日が変わると入れ替わる', () => {
    const a = selectConsultMemos('', all, { now }).core.map((m) => m.id);
    const b = selectConsultMemos('', all, { now: now + 3600000 }).core.map((m) => m.id);
    const c = selectConsultMemos('', all, { now: now + 3 * 86400000 }).core.map((m) => m.id);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
  it('★の高い本・覚えたメモを先に', () => {
    const day = consultDayNow(now);
    const list = rediscoverMemos([memo(1, 300), memo(2, 300, { book: { rating: 5 } }), memo(3, 300, { recall_count: 4 }), memo(4, 10)], day);
    expect(list.map((m) => m.id).slice(0, 2).sort()).toEqual(['m2', 'm3']);
    expect(list.some((m) => m.id === 'm4')).toBe(false);
  });
  it('全部入るときは今までどおり', () => {
    const small = [memo(1, 300), memo(2, 1)];
    const { core, fitsAll } = selectConsultMemos('', small, { now });
    expect(fitsAll).toBe(true);
    expect(core).toHaveLength(2);
  });
});
