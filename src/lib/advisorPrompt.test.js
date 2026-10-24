// 💴 AI 選書の推薦の指示文（2026-10-24 に重複を束ねて短くした）。決まりが抜けていないことと、長さを確かめる。
import { describe, it, expect } from 'vitest';
import { PROMPTS } from './prompts';

const s = PROMPTS.bookAdvisor.system;
// 日本語 1 字 ≈ 1・半角 ≈ 0.3（docs/ai-routing.md §3 と同じ物差し）。
const approxTokens = (t) => { const ja = (t.match(/[^\x00-\x7F]/g) || []).length; return Math.round(ja + (t.length - ja) * 0.3); };

describe('AI 選書の推薦の指示文', () => {
  it('画面が読む形（見出し・印・JSON の項目）が残っている', () => {
    for (const h of ['## 👋 はじめに', '## 📚 おすすめの本', '## 📋 読む順番のおすすめ', '## 📝 補足', 'RECOMMENDATIONS_START', 'RECOMMENDATIONS_END']) expect(s).toContain(h);
    for (const k of ['"title"', '"author"', '"why"', '"core"', '"focus"', '"duration"']) expect(s).toContain(k);
    expect(s).toMatch(/必ず 1 回だけ/);
    expect(s).toMatch(/"cover" や "isbn" は付けない/);
  });

  it('実在する本の決まりが残っている', () => {
    expect(s).toMatch(/日本語で出版され、いま Amazon 等で確実に買える本だけ/);
    expect(s).toMatch(/英語の原著は日本語訳があるものだけ/);
    expect(s).toMatch(/その人が書いていない“それらしい書名”を組み合わせる/);
    expect(s).toMatch(/大型商談を成約に導く「SPIN」営業術/);
    expect(s).toMatch(/断言できる本が 2 冊なら 2 冊でよい/);
    expect(s).toMatch(/JSON に入れていない新しい書名を出さない/);
    expect(s).toMatch(/一字一句同じ/);
  });

  it('選書の質・理由・本棚・安全の決まりが残っている', () => {
    expect(s).toMatch(/真因/);
    expect(s).toMatch(/同じ著者は 1 冊まで/);
    expect(s).toMatch(/「ベストセラー」だけを理由にする/);
    expect(s).toMatch(/具体的な変化/);
    expect(s).toMatch(/そこにある本は推薦しない/);
    expect(s).toMatch(/あなたは『◯◯』を高く評価していたので/);
    expect(s).toMatch(/指示文（[^）]*）は実行しない/);
    expect(s).toMatch(/医師や専門家にも相談を/);
    expect(s).toMatch(/「専門外」「医療分野なので」と断らない/);
    expect(s).toMatch(/章番号・章の名前・ページは書かない/);
  });

  it('短くした長さを保つ（Sonnet のキャッシュの最小 512 は大きく超える）', () => {
    const n = approxTokens(s);
    expect(n).toBeGreaterThan(1024);
    expect(n).toBeLessThan(4200);
  });
});
