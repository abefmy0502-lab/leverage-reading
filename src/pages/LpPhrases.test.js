import { describe, it, expect } from 'vitest';
import { phrasesOf } from './LpPhrases';

describe('phrasesOf（LP の段落を文節に分ける）', () => {
  it('文節に分け、つなげると元の文に戻る', () => {
    const text = '前に読んで残したメモが、困ったときの答えの材料になります。';
    const parts = phrasesOf(text);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.join('')).toBe(text);
    // 語の途中（「材／料」など）では分けない
    expect(parts.some((p) => p.endsWith('材'))).toBe(false);
  });
  it('日付（12月15日）は 1 つの塊のまま', () => {
    const parts = phrasesOf('12月15日までにプランを始めた方は創業メンバーです。');
    expect(parts.join('')).toBe('12月15日までにプランを始めた方は創業メンバーです。');
    expect(parts.some((p) => p.includes('12月15日'))).toBe(true);
  });
});
