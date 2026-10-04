import { describe, it, expect } from 'vitest';
import { dropSummarySection, introTextOf, splitRecoAnswer } from './advisorSummary';

describe('splitRecoAnswer（保存された推薦の答えを本のカードの前後に分ける）', () => {
  it('前置き・読む順番に分ける（下書きのブロックが 2 つでも最後の END の後ろ）', () => {
    const raw = '## 👋 はじめに\nつらいですね。\nRECOMMENDATIONS_START\n[]\nRECOMMENDATIONS_END\nRECOMMENDATIONS_START\n[{"title":"A"}]\nRECOMMENDATIONS_END\n## 📋 読む順番\n1. A';
    const r = splitRecoAnswer(raw);
    expect(r.found).toBe(true);
    expect(r.before).toBe('## 👋 はじめに\nつらいですね。\n');
    expect(r.after.trim()).toBe('## 📋 読む順番\n1. A');
  });
  it('ブロックが無い答えは found=false・END が無いときは後ろを空に', () => {
    expect(splitRecoAnswer('質問です')).toEqual({ found: false, before: '質問です', after: '' });
    expect(splitRecoAnswer('前\nRECOMMENDATIONS_START\n[{"title"').after).toBe('');
  });
});

describe('introTextOf / dropSummarySection', () => {
  it('前置きは見出しを落として 1 段落・太字の印を外す', () => {
    expect(introTextOf('## 👋 はじめに\n- **大変**ですね。\n一緒に探しましょう。')).toBe('大変ですね。一緒に探しましょう。');
    expect(introTextOf('')).toBe('');
  });
  it('まとめの区画だけ落とす', () => {
    expect(dropSummarySection('## 📋 読む順番\n1. A\n## 💬 まとめ\nがんばって')).toBe('## 📋 読む順番\n1. A');
  });
});
