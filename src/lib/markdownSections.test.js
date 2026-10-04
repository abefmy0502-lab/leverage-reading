// 📄 画面に出す節の決まり（lib/markdownSections.js・2026-10-04）。
import { describe, it, expect } from 'vitest';
import { visibleSections, hasVisibleSections, relatedCardCount } from './markdownSections';

const SHEET = '## 🧭 核心\n寿命が延びる。\n\n## 📚 関連書籍\n### 1. 『GRIT やり抜く力』- アンジェラ・ダックワース\n説明';

describe('visibleSections', () => {
  it('関連書籍をカードにするとき、カードが出ない節は出さない', () => {
    const bad = '## 📚 関連書籍\n### 1. 7つの習慣 - コヴィー\n### 2. 『A』または『B』';
    expect(relatedCardCount(bad.split('\n'))).toBe(0);
    expect(visibleSections(bad, { relatedCards: true })).toEqual([]);
    expect(visibleSections(SHEET, { relatedCards: true }).map((s) => s.heading)).toEqual(['🧭 核心', '📚 関連書籍']);
  });
  it('hideRelatedBooks は関連書籍の節を出さない・中身が無くなれば hasVisibleSections は false', () => {
    expect(visibleSections(SHEET, { hideRelatedBooks: true }).map((s) => s.heading)).toEqual(['🧭 核心']);
    expect(hasVisibleSections('\n## 📚 関連書籍\n### 1. 『X』', { hideRelatedBooks: true })).toBe(false);
    expect(hasVisibleSections('', {})).toBe(false);
  });
  it('書いている途中（pendingRelated）は関連書籍の節を残す（骨組みを出す）', () => {
    expect(visibleSections('## 📚 関連書籍\n### 1. 7つの', { relatedCards: true, pendingRelated: true })).toHaveLength(1);
  });
});
