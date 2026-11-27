import { describe, it, expect } from 'vitest';
import { yearRecord } from './shareOverlay';

describe('この 1 年の 1 枚（2026-11-27・since）', () => {
  it('はじめてからいままでで数え、題は「この 1 年の読書」（暦の年にしない）', () => {
    const now = new Date(2026, 10, 27, 12);
    const since = new Date(2025, 10, 20).getTime();
    const books = [
      { id: 'a', status: 'done', doneDate: '2025-12-10', actions: [{ done: true, completedAt: '2025-12-11' }] },
      { id: 'b', status: 'done', doneDate: '2026-05-01' },
      { id: 'c', status: 'done', doneDate: '2025-10-01' }, // はじめる前
    ];
    const memos = [{ text: 'x', createdAt: '2025-12-01T00:00:00Z' }, { text: 'y', createdAt: '2026-11-01T00:00:00Z' }];
    const r = yearRecord(books, memos, now, { since });
    expect(r.title).toBe('この 1 年の読書');
    expect(r.stats.find((s) => s.key === 'books').value).toBe('2冊');
    expect(r.stats.find((s) => s.key === 'memos').value).toBe('2件');
    expect(r.stats.find((s) => s.key === 'actions').value).toBe('1件');
    // since が無ければ今までどおり暦の年
    expect(yearRecord(books, memos, now).title).toBe('2026年の読書');
  });
});

describe('はじめて 1 か月の 1 枚（2026-11-27）', () => {
  it('sinceLabel で題が「この 1 か月の読書」', async () => {
    const { yearRecord } = await import('./shareOverlay');
    const now = new Date('2026-11-27T12:00:00+09:00');
    const r = yearRecord([], [], now, { since: now.getTime() - 29 * 86400000, sinceLabel: 'この 1 か月' });
    expect(r.title).toBe('この 1 か月の読書');
    expect(yearRecord([], [], now, { since: now.getTime() - 364 * 86400000 }).title).toBe('この 1 年の読書');
  });
});
