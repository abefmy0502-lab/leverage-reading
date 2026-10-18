import { describe, it, expect } from 'vitest';
import { readThroughOrder, readThroughText } from './MemoReadThrough';

const memos = [
  { id: 'a', text: '後ろのページ', pageNumber: 48, createdAt: '2026-10-04T00:00:00Z' },
  { id: 'b', text: 'ページなし', pageNumber: null, createdAt: '2026-10-06T00:00:00Z' },
  { id: 'c', text: '前のページ', pageNumber: 15, createdAt: '2026-09-30T00:00:00Z' },
  { id: 'd', text: '  ', pageNumber: 3, createdAt: '2026-09-01T00:00:00Z' },
];

describe('メモを通して読む', () => {
  it('ページ順・ページの無いメモは後ろ・本文の無いメモは入れない', () => {
    expect(readThroughOrder(memos).map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });
  it('写す文は 書名 → 得たいこと → メモ → まとめ', () => {
    const t = readThroughText({ title: '本', purpose: '測りたい', memos, summary: 'まとめ' });
    expect(t.indexOf('『本』')).toBeLessThan(t.indexOf('測りたい'));
    expect(t).toContain('p.15　前のページ');
    expect(t.indexOf('前のページ')).toBeLessThan(t.indexOf('後ろのページ'));
    expect(t.trim().endsWith('まとめ')).toBe(true);
  });
});
