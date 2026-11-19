import { describe, it, expect } from 'vitest';
import { TASTE_PREFS, TASTE_LABELS, tasteScore, rankByTaste, tasteBlock, tasteNote } from './bookTaste';

const NOW = 2026;
const old = { key: 'C1', title: '古典', pubYear: '2004', trend: 'steady', marks: ['ビジネス書大賞 2005'] };
const fresh = { key: 'C2', title: '新刊', pubYear: '2026', trend: 'new', marks: [] };
const plain = { key: 'C3', title: 'ふつう', pubYear: '2021', trend: '', marks: [] };
const noYear = { key: 'C4', title: '年なし', pubYear: '', trend: '', marks: [] };

describe('本の選び方（AI 選書・2026-11-19）', () => {
  it('4 つの選び方と画面の言葉', () => {
    expect(TASTE_PREFS).toEqual(['auto', 'classic', 'new', 'trend']);
    expect(TASTE_PREFS.map((p) => TASTE_LABELS[p])).toEqual(['おまかせ', '名著', '新しい本', 'いま話題']);
    for (const p of TASTE_PREFS) expect(tasteNote(p).length).toBeLessThanOrEqual(24);
  });
  it('名著は、賞・長く売れている・古い本が先', () => {
    expect(tasteScore(old, 'classic', NOW)).toBeGreaterThan(tasteScore(plain, 'classic', NOW));
    expect(tasteScore(fresh, 'classic', NOW)).toBe(0);
    expect(rankByTaste([fresh, plain, old], 'classic', NOW).map((c) => c.key)).toEqual(['C1', 'C3', 'C2']);
  });
  it('新しい本は、今年と去年の本が先・出版年が分からない本は上げない', () => {
    expect(rankByTaste([old, noYear, fresh], 'new', NOW)[0].key).toBe('C2');
    expect(tasteScore(noYear, 'new', NOW)).toBe(0);
  });
  it('いま話題は、売れ方の印がある本が先', () => {
    const r = rankByTaste([plain, old, fresh], 'trend', NOW).map((c) => c.key);
    expect(r.slice(0, 2).sort()).toEqual(['C1', 'C2']);
    expect(r[2]).toBe('C3');
  });
  it('おまかせは並びを変えない・本は減らさない', () => {
    const list = [plain, old, fresh];
    expect(rankByTaste(list, 'auto', NOW)).toBe(list);
    expect(rankByTaste(list, 'classic', NOW)).toHaveLength(3);
  });
  it('AI へは選んだときだけ 1 段・事実でないことを言わせない', () => {
    expect(tasteBlock('auto', NOW)).toBe('');
    expect(tasteBlock('classic', NOW)).toContain('名著');
    expect(tasteBlock('new', NOW)).toContain('2025 年以降');
    expect(tasteBlock('new', NOW)).toContain('出版年が分からない本を新しいと言わない');
    expect(tasteBlock('trend', NOW)).toContain('売れ方の印が無い本を「話題」と言わない');
  });
});
