import { describe, it, expect } from 'vitest';
import { triedActions } from './triedActions';

describe('やってみたこと', () => {
  it('完了した行動だけ・ふりかえりのあるものを先に・新しい順', () => {
    const r = triedActions([
      { text: 'A', done: true, completedAt: '2026-10-01T00:00:00Z' },
      { text: 'B', done: true, completedAt: '2026-09-01T00:00:00Z', reflection: '会議が 5 分で終わった' },
      { text: 'C', done: false },
      { text: 'D', done: true, completedAt: '2026-10-10T00:00:00Z' },
      { text: '  ', done: true },
    ]);
    expect(r.map((a) => a.text)).toEqual(['B', 'D', 'A']);
  });
});
