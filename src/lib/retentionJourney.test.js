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
  // 読書の習慣がない: 1 日目に AI 選書で読みたいを 1 冊・まだ読み始めていない・メモは書かない
  none: () => ({ books: [{ id: 'w1', title: '最初の 1 冊', status: 'want', updated_at: '2026-01-05T01:00:00Z' }], memos: [] }),
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
  const shown = {};
  for (const day of VISITS) {
    const { books, memos } = PERSONAS[persona](day);
    const m = pickReturnMoment({ now: at(day), createdAt: new Date(START).toISOString(), prevDay: prev, memos, bookIds: new Set(books.map((b) => b.id)), books, done });
    if (m) { done.add(m.key); if (m.memo?.id) done.add(`m:${m.memo.id}`); if (m.book?.id && m.book.status !== 'reading') done.add(`b:${m.book.id}`); }
    if (m) shown[day] = m.memo?.id || m.book?.id || null;
    out[day] = m ? `${m.kind}:${m.action}` : null;
    prev = jstDay(at(day));
  }
  out.shown = shown;
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
  it('読書の習慣がない人（読みたいの本 1 冊・メモ 0 件）にも、3 日目から毎回なにかが出て、節目に同じ本をくり返さない', () => {
    const r = walk('none');
    expect(r[1]).toBe(null);
    // 読みたいの本は手元に無いかもしれない＝本の詳細へ
    for (const d of [3, 5, 7]) expect(r[d]).toBe('back:open');
    // 3〜7 日目にもう見せた本は節目ですすめ直さず、いまの悩みで 1 冊探す
    for (const d of [30, 90, 180, 365]) expect(r[d]).toBe('anniv:advisor');
  });
  it('読み始めたがメモが無い人には、毎回「続きを 15 分」', () => {
    const m = pickReturnMoment({ now: at(30), createdAt: new Date(START).toISOString(), prevDay: null, memos: [], books: [{ id: 'x', title: 'A', status: 'reading' }] });
    expect(m.action).toBe('focus');
    expect(m.actionLabel).toBe('続きを 15 分');
  });

  it('続けて開いても同じメモを繰り返さない（3・5・7 日目・半年・1 年）', () => {
    const r = walk('lot');
    const ids = [3, 5, 7, 180, 365].map((d) => r.shown[d]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
