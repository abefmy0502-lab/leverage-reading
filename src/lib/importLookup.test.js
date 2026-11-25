import { describe, it, expect } from 'vitest';
import { resolveListBooks, setGuessedStatus } from './importLookup';

describe('一覧の本を書店の検索で確かめる（2026-11-25）', () => {
  it('ISBN は同じ ISBN の本・書名は照合・見つからない本は打った書名のまま', async () => {
    const db = {
      '9784763141712': [{ title: '「迷わない心」のつくり方', author: '稲盛和夫', isbn: '9784763141712', cover: 'https://x/c.jpg' }],
      考え方: [{ title: '考え方', author: '稲盛和夫', isbn: '9784837927645', cover: '' }],
    };
    const search = async (q) => ({ ok: true, results: db[q.trim()] || [] });
    const books = [
      { title: 'ISBN 9784763141712', author: '', isbn: '9784763141712', needsLookup: true },
      { title: '考え方', author: '', isbn: '', needsLookup: true },
      { title: 'ぜったいに無い本', author: '', isbn: '', needsLookup: true },
      { title: '前からある本', author: 'A', isbn: '', needsLookup: false },
    ];
    let last = 0;
    const r = await resolveListBooks(books, { search, onEach: (d) => { last = d; } });
    expect(r.books[0]).toMatchObject({ title: '「迷わない心」のつくり方', author: '稲盛和夫', cover: 'https://x/c.jpg' });
    expect(r.books[1]).toMatchObject({ title: '考え方', isbn: '9784837927645' });
    expect(r.books[2]).toMatchObject({ title: 'ぜったいに無い本', unverified: true });
    expect(r.books[3].title).toBe('前からある本');
    expect([r.found, r.loose, r.missing, last]).toEqual([2, 0, 1, 3]);
  });
  it('状態を決めつけた本だけをまとめて直す', () => {
    const r = setGuessedStatus({ books: [{ status: 'before', statusGuessed: true }, { status: 'want' }] }, 'done');
    expect(r.books.map((b) => b.status)).toEqual(['done', 'want']);
  });
});

describe('同じ本に行き着いた行は 1 冊に', () => {
  it('書名の行と ISBN の行', async () => {
    const hit = { title: '考え方', author: '稲盛和夫', isbn: '9784479795735', cover: '' };
    const search = async () => ({ ok: true, results: [hit] });
    const r = await resolveListBooks([
      { title: '考え方', author: '', isbn: '', needsLookup: true },
      { title: 'ISBN 9784479795735', author: '', isbn: '9784479795735', needsLookup: true },
    ], { search });
    expect(r.books).toHaveLength(1);
    expect(r.merged).toBe(1);
  });
});
