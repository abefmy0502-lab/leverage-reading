// 📖 読書計画シートの重点的に読む箇所・流し読みから、目次に無い章を消す（lib/planChapters.js・2026-10-04）。
import { describe, it, expect } from 'vitest';
import { dropUnknownChapters, focusLinesOf } from './planChapters';
import { PLAN_NO_TOC_LINE, PLAN_NO_MATCH_LINE } from './prompts';

const TOC = ['第1章 100年ライフ', '第2章 過去の資金計画', '第3章 見えない資産', '第4章 新しいシナリオ'];

const SHEET = [
  '## 🎯 読み方の戦略',
  '- 第9章 から読むと決める（戦略の節は触らない）',
  '',
  '## 📍 重点的に読む箇所（20%）',
  '- 『第3章 見えない資産』: 得たいことにいちばん近い',
  '- 『第9章 AI 時代の働き方』: これからの働き方',
  '- 第7章 のケーススタディ',
  '- 『新しいシナリオ』: 次のステージを考える',
  '',
  '## ⏩ 流し読みでOKな箇所',
  '- 『第2章 過去の資金計画』: 数字は流してよい',
  '',
  '## 📚 関連書籍',
  '### 1. 『GRIT やり抜く力』- アンジェラ・ダックワース',
].join('\n');

describe('dropUnknownChapters', () => {
  it('目次に無い『章名』・章番号を含む行だけ消す（目次の項目・その一部は残す・ほかの節は触らない）', () => {
    const { sheet, removed } = dropUnknownChapters(SHEET, TOC);
    expect(sheet).toContain('『第3章 見えない資産』');
    expect(sheet).toContain('『新しいシナリオ』');
    expect(sheet).toContain('『第2章 過去の資金計画』');
    expect(sheet).not.toContain('第9章 AI 時代');
    expect(sheet).not.toContain('第7章');
    expect(sheet).toContain('- 第9章 から読むと決める（戦略の節は触らない）');
    expect(sheet).toContain('『GRIT やり抜く力』');
    expect(removed).toHaveLength(2);
  });

  it('目次が無い本: 章名を挙げた行は消し、箇条書きが残らない節は決まった 1 行（目次が手に入らない）に', () => {
    const { sheet } = dropUnknownChapters(SHEET, [], { noToc: true });
    expect(sheet).toContain(`## 📍 重点的に読む箇所（20%）\n${PLAN_NO_TOC_LINE}\n\n## ⏩ 流し読みでOKな箇所\n${PLAN_NO_TOC_LINE}`);
    expect(sheet).not.toContain('第3章');
    expect(sheet).toContain('## 📚 関連書籍');
  });

  it('目次がある本で、挙げた章がどれも目次と合わない → 決まった 1 行（目次と合う章が見つからなかった）', () => {
    const s = '## 📍 重点的に読む箇所（20%）\nこの本では次の章が大事です。\n- 『第9章 AI 時代の働き方』: 近い\n- 第12章 のケース\n\n## ❓ 注意点\n- x';
    const { sheet } = dropUnknownChapters(s, TOC);
    expect(sheet).toBe(`## 📍 重点的に読む箇所（20%）\n${PLAN_NO_MATCH_LINE}\n\n## ❓ 注意点\n- x`);
  });

  it('この本の書名を許す文字列に入れれば、書名の『』は残る', () => {
    const s = '## 📍 重点的に読む箇所\n- 『LIFE SHIFT』の後半の人物の例';
    expect(dropUnknownChapters(s, [], { noToc: true }).sheet).toBe(`## 📍 重点的に読む箇所\n${PLAN_NO_TOC_LINE}`);
    expect(dropUnknownChapters(s, ['LIFE SHIFT'], { noToc: true }).sheet).toBe(s);
  });

  it('消すものが無ければそのまま', () => {
    const ok = '## 📍 重点的に読む箇所（20%）\n- 『第3章 見えない資産』: 近い\n- 人物の例が出てくる部分';
    expect(dropUnknownChapters(ok, TOC)).toEqual({ sheet: ok, removed: [] });
  });

  it('直すとき: 直す前のシートの行（focusLinesOf）にある章は残す・新しく作った章は消す', () => {
    const prev = '## 📍 重点的に読む箇所\n- 第2章 1on1 の進め方\n\n## 🎯 読み方の戦略\n- 目的を書く';
    expect(focusLinesOf(prev)).toEqual(['- 第2章 1on1 の進め方']);
    const edited = '## 📍 重点的に読む箇所\n- 第2章 1on1 の進め方（ここを最初に）\n- 第6章 チームの作り方';
    const { sheet } = dropUnknownChapters(edited, focusLinesOf(prev));
    expect(sheet).toContain('第2章 1on1 の進め方');
    expect(sheet).not.toContain('第6章');
  });
});
