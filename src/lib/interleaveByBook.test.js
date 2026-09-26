import { describe, it, expect } from 'vitest';
import { interleaveByBook } from './ai';

const m = (id, book_id, source_type = 'book') => ({ id, book_id, source_type, book: book_id ? { id: book_id } : null });

describe('interleaveByBook（相談の根拠を複数の本に散らす）', () => {
  it('同じ本のメモが続いても、本ごとに 1 件ずつ交互に並べる', () => {
    const input = [m(1, 'A'), m(2, 'A'), m(3, 'A'), m(4, 'B'), m(5, null, 'personal'), m(6, 'B')];
    expect(interleaveByBook(input).map((x) => x.id)).toEqual([1, 4, 5, 2, 6, 3]);
  });

  it('上限で切っても、上位に複数の本が入る', () => {
    const input = [...Array(10)].map((_, i) => m(i, 'A')).concat([m(100, 'B'), m(200, 'C')]);
    const top3 = interleaveByBook(input).slice(0, 3).map((x) => x.book_id);
    expect(new Set(top3)).toEqual(new Set(['A', 'B', 'C']));
  });

  it('件数は変えず、各本の中の順序は保つ', () => {
    const input = [m(1, 'A'), m(2, 'B'), m(3, 'A'), m(4, 'B')];
    const out = interleaveByBook(input);
    expect(out).toHaveLength(4);
    expect(out.filter((x) => x.book_id === 'A').map((x) => x.id)).toEqual([1, 3]);
  });

  it('空配列はそのまま', () => {
    expect(interleaveByBook([])).toEqual([]);
  });
});
