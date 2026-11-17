import { describe, it, expect } from 'vitest';
import { cleanKeywords, usableCandidate, gatherCandidates, candidatesBlock, matchCandidate, applyCandidate } from './advisorCandidates';
import { normalizeAdvisorRec } from './advisorRecs';

const book = (title, author, isbn, extra = {}) => ({ title, subtitle: '', author, publisher: '見本社', pubYear: '2020', isbn, cover: `https://example.com/${isbn}.jpg`, genreIds: ['001006'], ...extra });

describe('cleanKeywords', () => {
  it('文字列だけ・2〜20 字・記号を落とし・重なりなし・4 つまで', () => {
    expect(cleanKeywords(['部下育成', '「1on1」', '部下育成', 'a', 3, '', 'フィードバック', 'アサーション', '家計管理'])).toEqual(['部下育成', '1on1', 'フィードバック', 'アサーション']);
    expect(cleanKeywords(null)).toEqual([]);
    expect(cleanKeywords(['あ'.repeat(21)])).toEqual([]);
  });
});

describe('usableCandidate', () => {
  it('漫画・資格の問題集・雑誌は候補にしない', () => {
    expect(usableCandidate(book('部下を育てる', '見本 太郎', '9784000000001'))).toBe(true);
    expect(usableCandidate(book('マンガでわかる部下育成', '見本', '9784000000002', { genreIds: ['001001001'] }))).toBe(false);
    expect(usableCandidate(book('FP3級 問題集', '見本', '9784000000003', { genreIds: ['001006'] }))).toBe(false);
    expect(usableCandidate(book('日経ビジネス 2026年11月号', '見本', '9784000000004'))).toBe(false);
    expect(usableCandidate({ title: '書名だけ', author: '', isbn: '' })).toBe(false);
  });
});

describe('gatherCandidates', () => {
  const results = {
    部下育成: [book('部下を育てる', 'A', '9784000000011'), book('任せる技術', 'B', '9784000000012'), book('考え方', '稲盛和夫', '9784479795735')],
    '1on1': [book('任せる技術', 'B', '9784000000012'), book('1on1 の教科書', 'C', '9784000000013')],
  };
  const search = async (q) => ({ ok: true, results: results[q] || [] });

  it('言葉ごとに交互に並べ・同じ本と本棚の本を除き・C1〜 の印を付ける', async () => {
    const cands = await gatherCandidates(['部下育成', '1on1'], { search, shelf: [{ title: '考え方', isbn: '9784479795735' }] });
    expect(cands.map((c) => [c.key, c.title])).toEqual([
      ['C1', '部下を育てる'], ['C2', '任せる技術'], ['C3', '1on1 の教科書'],
    ]);
    expect(cands[0].isbn).toBe('9784000000011');
  });

  it('検索が失敗しても例外にしない・言葉が無ければ空', async () => {
    expect(await gatherCandidates(['部下育成'], { search: async () => { throw new Error('x'); } })).toEqual([]);
    expect(await gatherCandidates([], { search })).toEqual([]);
  });

  it('時間の上限を過ぎたら、集まった分だけ返す', async () => {
    let t = 0;
    const slow = async (q) => { t += 8000; return { ok: true, results: results[q] || [] }; };
    const cands = await gatherCandidates(['部下育成', '1on1'], { search: slow, now: () => t, budgetMs: 9000 });
    expect(cands.map((c) => c.title)).toEqual(['部下を育てる', '任せる技術', '考え方']);
  });
});

describe('candidatesBlock', () => {
  it('印・書名・著者・出版社・年を 1 行ずつ', () => {
    const text = candidatesBlock([{ key: 'C1', title: '任せる技術', subtitle: '', author: '見本 太郎', publisher: '見本社', pubYear: '2020' }]);
    expect(text).toContain('【本の候補');
    expect(text).toContain('C1『任せる技術』（見本 太郎・見本社・2020）');
    expect(candidatesBlock([])).toBe('');
  });
});

describe('matchCandidate / applyCandidate', () => {
  const cands = [
    { key: 'C1', title: 'エッセンシャル思考', subtitle: '最少の時間で成果を最大にする', author: 'グレッグ・マキューン', isbn: '9784761270438', cover: 'https://example.com/e.jpg' },
    { key: 'C2', title: '任せる技術', subtitle: '', author: '見本 太郎', isbn: '9784000000012', cover: '' },
  ];
  it('印で当てる（印と書名が食い違えば印を信じない）', () => {
    expect(matchCandidate({ key: 'C2', title: '任せる技術' }, cands)?.key).toBe('C2');
    expect(matchCandidate({ key: 'c1', title: 'エッセンシャル思考 最少の時間で成果を最大にする' }, cands)?.key).toBe('C1');
    expect(matchCandidate({ key: 'C2', title: 'ザ・マネジャー', author: 'ブルース・ロジャーズ' }, cands)).toBe(null);
  });
  it('印が無くても書名と著者で当てる', () => {
    expect(matchCandidate({ title: 'エッセンシャル思考', author: 'グレッグ・マキューン' }, cands)?.key).toBe('C1');
    expect(matchCandidate({ title: 'エッセンシャル思考', author: '別の人' }, cands)).toBe(null);
  });
  it('当たった本は書誌の書名・ISBN・表紙で確かめた本になる（整えても表紙と ISBN が残る）', () => {
    const rec = applyCandidate({ key: 'C1', title: 'エッセンシャル思考 最少の時間で', author: 'マキューン', why: 'w' }, cands[0]);
    expect(rec).toMatchObject({ title: 'エッセンシャル思考', author: 'グレッグ・マキューン', isbn: '9784761270438', cover: 'https://example.com/e.jpg', _verify: 'ok', why: 'w' });
    expect(rec.key).toBeUndefined();
    expect(normalizeAdvisorRec(rec)).toMatchObject({ isbn: '9784761270438', cover: 'https://example.com/e.jpg', _verify: 'ok' });
    expect(applyCandidate({ title: 'x' }, null)).toEqual({ title: 'x' });
  });
});
