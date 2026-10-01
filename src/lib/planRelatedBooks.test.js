import { describe, it, expect, vi } from 'vitest';
import { relatedBookEntries, dropRelatedBooks, verifyPlanRelatedBooks } from './planRelatedBooks';

const SHEET = [
  '## 🎯 読み方の戦略',
  '- 目的に合わせて読む',
  '',
  '## 📚 関連書籍',
  '### 1. 『イシューからはじめよ』- 安宅和人',
  '問いを先に決める本。',
  '### 2. 『BtoB営業を成功させるSPIN営業術』- ニール・ラッカム',
  'それらしい説明。',
  '',
  '## 💡 期待される変化',
  '- 会議が短くなる',
].join('\n');

describe('relatedBookEntries', () => {
  it('関連書籍の節の本だけを拾う', () => {
    const e = relatedBookEntries(SHEET);
    expect(e.map((x) => [x.title, x.author])).toEqual([
      ['イシューからはじめよ', '安宅和人'],
      ['BtoB営業を成功させるSPIN営業術', 'ニール・ラッカム'],
    ]);
  });
  it('関連書籍が無いシートは空', () => {
    expect(relatedBookEntries('## 🎯 読み方の戦略\n- a')).toEqual([]);
  });
});

describe('verifyPlanRelatedBooks', () => {
  it('見つからない本（exists:false）だけ消して番号を振り直す・ほかの節は変えない', async () => {
    const verify = vi.fn(async ({ title }) => ({ exists: title.startsWith('BtoB') ? false : true }));
    const r = await verifyPlanRelatedBooks(SHEET, verify);
    expect(r.removed).toEqual(['BtoB営業を成功させるSPIN営業術']);
    expect(r.sheet).not.toContain('SPIN');
    expect(r.sheet).not.toContain('それらしい説明');
    expect(r.sheet).toContain('### 1. 『イシューからはじめよ』- 安宅和人');
    expect(r.sheet).toContain('## 💡 期待される変化\n- 会議が短くなる');
    expect(r.sheet).toContain('## 🎯 読み方の戦略\n- 目的に合わせて読む');
  });
  it('1 冊目を消したら 2 冊目が 1. になる', async () => {
    const r = await verifyPlanRelatedBooks(SHEET, async ({ title }) => ({ exists: title.startsWith('イシュー') ? false : true }));
    expect(r.sheet).toContain('### 1. 『BtoB営業を成功させるSPIN営業術』');
  });
  it('確かめられなかった本（exists:null・通信の失敗）は残す', async () => {
    const r = await verifyPlanRelatedBooks(SHEET, async () => ({ exists: null }));
    expect(r.sheet).toBe(SHEET);
    expect(r.removed).toEqual([]);
    const thrown = await verifyPlanRelatedBooks(SHEET, async () => { throw new Error('net'); });
    expect(thrown.sheet).toBe(SHEET);
  });
  it('全部見つからなければ、関連書籍の見出しごと消す', async () => {
    const r = await verifyPlanRelatedBooks(SHEET, async () => ({ exists: false }));
    expect(r.sheet).not.toContain('関連書籍');
    expect(r.sheet).toBe('## 🎯 読み方の戦略\n- 目的に合わせて読む\n\n## 💡 期待される変化\n- 会議が短くなる');
  });
  it('関連書籍が無ければ確かめない', async () => {
    const verify = vi.fn();
    const r = await verifyPlanRelatedBooks('## 🎯 a\n- b', verify);
    expect(verify).not.toHaveBeenCalled();
    expect(r.sheet).toBe('## 🎯 a\n- b');
  });
  it('dropRelatedBooks: 何も消さなければそのまま', () => {
    expect(dropRelatedBooks(SHEET, [])).toBe(SHEET);
  });
});
