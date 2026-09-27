import { describe, it, expect } from 'vitest';
import { pickRelatedMemos } from './ai';

const memo = (text, extra = {}) => ({ text, tags: [], book: { title: '本' }, created_at: '2025-01-01', ...extra });

describe('pickRelatedMemos', () => {
  it('質問の言葉を含むメモだけを、当たりの多い順に返す', () => {
    const a = memo('会議が長くなるのは、決まらない問いを並べるから');
    const b = memo('会議の前に議題を送る');
    const c = memo('朝の散歩で頭を整理する');
    const out = pickRelatedMemos('会議が長引いて決まらない', [c, b, a]);
    expect(out).toContain(a);
    expect(out).toContain(b);
    expect(out).not.toContain(c);
    expect(out[0]).toBe(a);
  });
  it('ひらがなだけの語片では当てない', () => {
    const out = pickRelatedMemos('どうしていいかわからない', [memo('どうしていいかわからないときは寝る')]);
    expect(out).toEqual([]);
  });
  it('件数の上限を守る', () => {
    const pool = Array.from({ length: 40 }, (_, i) => memo(`部下の報告 ${i}`));
    expect(pickRelatedMemos('部下の報告が来ない', pool, { max: 15 }).length).toBe(15);
  });
});
