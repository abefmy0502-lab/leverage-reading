import { describe, it, expect } from 'vitest';
import { buildConsultExamples, standaloneAction, questionGist, needsSubject, WORRY_EXAMPLES } from './consultHelpers';

const books = [
  { id: 'a', title: '1兆ドルコーチ', status: 'reading', updatedAt: '2026-09-20' },
  { id: 'b', title: 'LIFE SHIFT', status: 'before', currentChallenge: 'いまの会社で定年まで働くイメージが持てない', updatedAt: '2026-09-01' },
  { id: 'c', title: 'イシューからはじめよ', status: 'done', updatedAt: '2026-08-01' },
];

describe('buildConsultExamples', () => {
  it('前の相談の続き → 課題 → 本 の順', () => {
    const ex = buildConsultExamples({ books, memoBookIds: new Set(['a', 'c']), lastConsult: { question: '部下に任せた仕事がいつも遅れる' } });
    expect(ex.map((e) => e.kind)).toEqual(['continue', 'challenge', 'book']);
    expect(ex[0].text).toBe('前に相談した「部下に任せた仕事がいつも遅れる」、その後どう進める？');
    expect(ex[1].text).toBe('いまの会社で定年まで働くイメージが持てない。どう考えればいい？');
    expect(ex[2].text).toBe('『1兆ドルコーチ』の学びで、明日から使えるものは？');
  });
  it('前の相談が無ければ課題から。足りない分はよくある困りごと', () => {
    const ex = buildConsultExamples({ books: [], count: 2 });
    expect(ex.map((e) => e.text)).toEqual(WORRY_EXAMPLES.slice(0, 2));
  });
  it('メモの無い本は例に出さない', () => {
    const ex = buildConsultExamples({ books, memoBookIds: new Set(['c']), count: 3 });
    expect(ex.map((e) => e.text)).toContain('『イシューからはじめよ』の学びで、明日から使えるものは？');
    expect(ex.map((e) => e.text).join()).not.toContain('1兆ドルコーチ');
  });
  it('タグの型（「〜」で迷ったとき…）は出さない', () => {
    const ex = buildConsultExamples({ books: [{ id: 'x', title: 'X', status: 'done', tags: ['読書術'] }] });
    expect(ex.map((e) => e.text).join()).not.toContain('迷ったとき');
  });
  it('長い相談は短くまとめる', () => {
    const ex = buildConsultExamples({ lastConsult: { question: '新しいプロジェクトのメンバーがなかなか自分から動いてくれず、毎回こちらから声をかけています。' } });
    expect(ex[0].text).toBe('前に相談した「新しいプロジェクトのメンバーがなか…」、その後どう進める？');
  });
});

describe('standaloneAction', () => {
  it('単独で分かる一歩はそのまま', () => {
    expect(standaloneAction('明日の朝、1on1 の最初の 5 分を近況の話にする', '部下が報告をくれない')).toBe('明日の朝、1on1 の最初の 5 分を近況の話にする');
  });
  it('「それ」で始まる一歩には相談の要約を付ける', () => {
    expect(standaloneAction('それを紙に 1 行で書き出す', '部下が報告をくれなくて困っています')).toBe('部下が報告をくれなくて困っています：それを紙に 1 行で書き出す');
  });
  it('中に「この件」があるときも付ける', () => {
    expect(needsSubject('明日の朝、この件について 10 分考える')).toBe(true);
  });
  it('上限の長さを超えない', () => {
    expect(standaloneAction('その件を'.repeat(200), '会議で話がまとまりません', 500).length).toBeLessThanOrEqual(500);
  });
  it('相談が無ければ付けない', () => {
    expect(standaloneAction('それを書き出す', '')).toBe('それを書き出す');
  });
});

describe('questionGist', () => {
  it('最初の 1 文だけ・句読点を外す', () => {
    expect(questionGist('会議が長い。どうすれば？')).toBe('会議が長い');
  });
});
