import { describe, it, expect } from 'vitest';
import { strongOverlap, discoveryMessage, STRONG_OVERLAP } from './overlapDiscovery';

const link = (title, score, memoId = 'm') => ({ book: { id: title, title }, score, hit: { memoId } });

describe('重なりの発見（2026-11-26）', () => {
  it('強く重なった 1 件だけ（いちばん似ているもの）', () => {
    expect(strongOverlap([link('A', 0.22), link('B', 0.41), link('C', 0.33)]).book.title).toBe('B');
    expect(strongOverlap([link('A', 0.22)])).toBeNull();
    expect(strongOverlap([])).toBeNull();
    expect(strongOverlap([link('A', STRONG_OVERLAP)]).book.title).toBe('A');
  });
  it('知らせの文は副題を落とした書名', () => {
    expect(discoveryMessage({ title: '考え方 人生・仕事の結果が変わる' })).toBe('『考え方』と重なりました');
  });
});
