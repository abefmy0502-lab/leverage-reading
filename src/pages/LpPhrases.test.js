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

describe('phrasesOf と noBreak（折り返さない塊）', () => {
  it('WORD JOINER・折り返さない空白でつないだ塊は分けない', async () => {
    const { noBreak } = await import('../lib/foundingOffer');
    const text = `無料プランで始めて、${noBreak('12月15日')}までに（${noBreak('7 日間無料')}で始めた方も）。`;
    const parts = phrasesOf(text);
    expect(parts.join('')).toBe(text);
    expect(parts.some((p) => p.includes(noBreak('12月15日')))).toBe(true);
    expect(parts.some((p) => p.includes(noBreak('7 日間無料')))).toBe(true);
  });
});

describe('phrasesOf と半角の空白', () => {
  it('塊の頭に空白を置かない（前の塊の終わりへ）・つなげると元の文', () => {
    const text = '相談も、無料プランで毎月 約 3 回まで AI が答えます。無料期間が終わる 24 時間前までに。';
    const parts = phrasesOf(text);
    expect(parts.join('')).toBe(text);
    parts.slice(1).forEach((p) => expect(p.startsWith(' ')).toBe(false));
  });
});
