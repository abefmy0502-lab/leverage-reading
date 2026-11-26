// 🧭 無料ユーザーの 3 つの型が 1・3・5・7・30・90・180・365 日目にホームを開いたとき、
//   「また開いたときの 1 行」（lib/returnMoments.js）が何を出すかを通しで確かめる（2026-11-26 オーナーの点検）。
//   ホームのほかの入口（いま読んでいる本・読みたい本 → 読み始める・月のはじめの 1 行・月末の 1 枚）は別のテストで確かめている。
import { describe, it, expect } from 'vitest';
import { pickReturnMoment, jstDay } from './returnMoments';

const DAY = 86400000;
const START = Date.parse('2026-01-05T01:00:00Z'); // 日本時間 10 時にはじめた
const at = (day) => START + (day - 1) * DAY;
const VISITS = [1, 3, 5, 7, 30, 90, 180, 365];

// 型ごとに、何日目にどの本・メモがあるか
const PERSONAS = {
  // 読書の習慣がない: AI 選書で読みたいを 4 冊（ホームの一覧は 3 冊まで）・まだ読み始めていない・メモは書かない
  none: () => ({ books: [1, 2, 3, 4].map((i) => ({ id: `w${i}`, title: `読みたい本 ${i}`, status: 'want', updated_at: `2026-01-0${i}T00:00:00Z` })), memos: [] }),
  // 少し読む: 1 日目に 1 冊・メモ 2 件、30 日目にもう 1 件
  little: (day) => ({
    books: [{ id: 'b1', title: '本 A', status: 'reading' }],
    memos: [
      { id: 'm1', bookId: 'b1', text: '一つめのメモ', createdAt: new Date(at(1)).toISOString() },
      { id: 'm2', bookId: 'b1', text: '二つめのメモ', createdAt: new Date(at(1) + 3600000).toISOString() },
      ...(day >= 30 ? [{ id: 'm3', bookId: 'b1', text: '三つめのメモ', createdAt: new Date(at(30)).toISOString() }] : []),
    ],
  }),
  // よく読む: 毎週 1 冊・メモ 5 件
  lot: (day) => {
    const weeks = Math.max(1, Math.ceil(day / 7));
    const books = Array.from({ length: weeks }, (_, i) => ({ id: `b${i}`, title: `本 ${i}`, status: 'done' }));
    const memos = [];
    books.forEach((b, i) => { for (let k = 0; k < 5; k += 1) memos.push({ id: `${b.id}-${k}`, bookId: b.id, text: `${b.title} のメモ ${k}`, createdAt: new Date(at(i * 7 + 1) + k * 60000).toISOString() }); });
    return { books, memos: memos.filter((m) => Date.parse(m.createdAt) <= at(day)) };
  },
};

function walk(persona) {
  const out = {};
  let prev = null;
  const done = new Set();
  for (const day of VISITS) {
    const { books, memos } = PERSONAS[persona](day);
    const m = pickReturnMoment({ now: at(day), createdAt: new Date(START).toISOString(), prevDay: prev, memos, bookIds: new Set(books.map((b) => b.id)), books, done });
    if (m) done.add(m.key);
    out[day] = m ? `${m.kind}:${m.action}` : null;
    prev = jstDay(at(day));
  }
  return out;
}

describe('3 つの型 × 8 つの日（ホームの また開いたときの 1 行）', () => {
  it('少し読む・よく読む人には、3 日目から毎回なにかが出る（1 日目は出さない）', () => {
    for (const p of ['little', 'lot']) {
      const r = walk(p);
      expect(r[1]).toBe(null);
      for (const d of [3, 5, 7]) expect(r[d]).toBe('back:read');
      expect(r[30]).toBe('anniv:read');
      for (const d of [90, 180, 365]) expect(r[d]).toBe('anniv:compare');
    }
  });
  it('読書の習慣がない人（メモ 0 件・まだ読み始めていない）は、1 か月〜1 年に本棚で待っている本（読み始める）', () => {
    const r = walk('none');
    for (const d of [1, 3, 5, 7]) expect(r[d]).toBe(null); // この間はホームの「読みたい本 → 読み始める」が入口
    for (const d of [30, 90, 180, 365]) expect(r[d]).toBe('anniv:start');
  });
  it('読み始めたがメモが無い人には出さない（ホームの「相談相手をつくる」が一文のメモを誘う）', () => {
    const m = pickReturnMoment({ now: at(30), createdAt: new Date(START).toISOString(), prevDay: null, memos: [], books: [{ id: 'x', title: 'A', status: 'reading' }] });
    expect(m).toBe(null);
  });
});
