// 🌱 育つ前の相談（lib/earlyShelf.js）の決まり。
import { describe, it, expect, vi } from 'vitest';
import { isEarlyStage, pickEarlyShelfBooks, earlyShelfBlock, prefetchEarlyShelf, earlyShelfUsedCount, EARLY_MEMO_LIMIT } from './earlyShelf';

const books = [
  { id: 'a', title: '考え方', author: '稲盛和夫', status: 'done', updatedAt: '2026-10-01' },
  { id: 'b', title: '嫌われる勇気', author: '岸見一郎, 古賀史健', status: 'reading', updatedAt: '2026-10-10' },
  { id: 'c', title: '積んだ本', status: 'before' },
  { id: 'd', title: 'メモの多い本', status: 'done', updatedAt: '2026-10-15' },
];
const info = { a: { description: '人生・仕事の結果＝考え方×熱意×能力。', toc: ['第1章 心を高める', '第2章 利他'] }, b: { description: 'アドラー心理学の対話篇。', toc: [] } };
const infoOf = (b) => info[b.id] || null;

describe('育つ前の相談', () => {
  it('メモ 10 件未満だけ', () => {
    expect(isEarlyStage(0)).toBe(true);
    expect(isEarlyStage(EARLY_MEMO_LIMIT - 1)).toBe(true);
    expect(isEarlyStage(EARLY_MEMO_LIMIT)).toBe(false);
    expect(isEarlyStage(null)).toBe(false);
  });
  it('読了 → 読書中、メモが 1 件以下の本だけ（積読は入れない）', () => {
    const ids = pickEarlyShelfBooks(books, { d: 3 }).map((b) => b.id);
    expect(ids).toEqual(['a', 'b']);
  });
  it('紹介か目次のある本だけを塊にし、書名を返す。10 件以上なら空', () => {
    const r = earlyShelfBlock(books, { d: 3 }, 2, { infoOf });
    expect(r.titles).toEqual(['考え方', '嫌われる勇気']);
    expect(r.text).toContain('EARLY_SHELF_START');
    expect(r.text).toContain('ユーザーのメモではない');
    expect(r.text).toContain('『嫌われる勇気』｜岸見一郎（読書中');
    expect(earlyShelfBlock(books, {}, 10, { infoOf }).text).toBe('');
  });
  it('控えの無い本だけ取りに行く', async () => {
    const load = vi.fn(async () => null);
    const peek = (b) => (b.id === 'a' ? info.a : undefined);
    await prefetchEarlyShelf(books, {}, 0, { load, peek, timeoutMs: 1000 });
    expect(load.mock.calls.map((c) => c[0].id).sort()).toEqual(['b', 'd']);
    load.mockClear();
    await prefetchEarlyShelf(books, {}, 12, { load, peek });
    expect(load).not.toHaveBeenCalled();
  });
  it('答えで紹介・目次として使った本を数える', () => {
    expect(earlyShelfUsedCount('『考え方』の紹介によると…', ['考え方', '嫌われる勇気'])).toBe(1);
    expect(earlyShelfUsedCount('『考え方』のメモから…', ['考え方'])).toBe(0);
  });
});
