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
  it('「前に相談した「X」、その後どう進める？」なら X を取り出す', () => {
    expect(questionGist('前に相談した「部下が報告をくれない」、その後どう進める？')).toBe('部下が報告をくれない');
  });
  it('続きの続きも、いちばん中の相談を取り出す', () => {
    expect(questionGist('前に相談した「前に相談した「会議が長い」、その後どう進める？」、その後どう進める？')).toBe('会議が長い');
  });
  it('かっこの中の「。」「？」では文を切らない', () => {
    expect(questionGist('上司に「なぜ？」と聞かれて困った。どうする？', 30)).toBe('上司に「なぜ？」と聞かれて困った');
  });
  it('かっこの中では切らない（かっこの手前で切る）', () => {
    const g = questionGist('先週の会議で「このプロジェクトは誰の責任なのか」と言われた', 20);
    expect(g).toBe('先週の会議で…');
  });
  it('かっこで始まる長い文は中で切り、閉じかっこを補う', () => {
    const g = questionGist('「任せたのに結局自分でやり直してしまう問題」をどうにかしたい', 12);
    expect(g).toBe('「任せたのに結局自分…」');
  });
  it('どの要約もかっこの数がそろう', () => {
    ['「あいうえお', '前に相談した「「長い長い長い長い長い長い長い長い長い長い」」、その後', '『本の名前がとても長いときの相談ですがどうでしょう』'].forEach((q) => {
      const g = questionGist(q, 10);
      expect(g.split('「').length).toBe(g.split('」').length);
      expect(g.split('『').length).toBe(g.split('』').length);
    });
  });
});

describe('続きの相談の例と行動', () => {
  it('前の相談が「続き」の例でも、例は入れ子にしない', () => {
    const ex = buildConsultExamples({ lastConsult: { question: '前に相談した「部下が報告をくれない」、その後どう進める？' }, count: 1 });
    expect(ex[0].text).toBe('前に相談した「部下が報告をくれない」、その後どう進める？');
  });
  it('続きの相談から行動に入れるときは、元の相談の要約を付ける', () => {
    expect(standaloneAction('その件を 1on1 で聞く', '前に相談した「部下が報告をくれない」、その後どう進める？'))
      .toBe('部下が報告をくれない：その件を 1on1 で聞く');
  });
});

import { BOOK_WORRIES, worryForBook, quickstartWorries } from './consultHelpers';
describe('初日クイックスタートの困りごと', () => {
  it('よく読まれている 12 冊すべてに困りごとがある', () => {
    expect(Object.keys(BOOK_WORRIES)).toHaveLength(12);
    Object.values(BOOK_WORRIES).forEach((w) => expect(w.length).toBeGreaterThan(8));
  });
  it('書名の一致・副題つき・全角半角の違いでも引ける', () => {
    expect(worryForBook({ title: '嫌われる勇気' })).toBe(BOOK_WORRIES['嫌われる勇気']);
    expect(worryForBook({ title: '完訳 7つの習慣' })).toBe('');
    expect(worryForBook({ title: '７つの習慣 人格主義の回復' })).toBe(BOOK_WORRIES['7つの習慣']);
    expect(worryForBook({ title: 'factfulness' })).toBe(BOOK_WORRIES.FACTFULNESS);
  });
  it('えらんだ本の困りごとを先に、足りない分はよくある困りごと', () => {
    expect(quickstartWorries([{ title: '伝え方が9割' }, { title: '知らない本' }], 2))
      .toEqual([BOOK_WORRIES['伝え方が9割'], WORRY_EXAMPLES[0]]);
    expect(quickstartWorries([{ title: '1兆ドルコーチ' }, { title: '数値化の鬼' }, { title: '人を動かす' }], 2))
      .toEqual([BOOK_WORRIES['1兆ドルコーチ'], BOOK_WORRIES['数値化の鬼']]);
  });
  it('同じ文は重ねない', () => {
    expect(quickstartWorries([{ title: 'エッセンシャル思考' }], 3)).toEqual([BOOK_WORRIES['エッセンシャル思考'], WORRY_EXAMPLES[0], WORRY_EXAMPLES[1]]);
  });
});

import { hasSummaryMemo, countSummaryMemos } from './consultHelpers';
describe('メモの数え方（カード式＋まとめ）', () => {
  const bs = [
    { id: 'a', title: 'A', status: 'done', leverageMemo: '感想' },
    { id: 'b', title: 'B', status: 'done', leverageMemo: '  ' },
    { id: 'c', title: 'C', status: 'done', leverage_memo: 'まとめ' },
  ];
  it('まとめの入っている本を 1 冊 1 件で数える（空白だけは数えない）', () => {
    expect(hasSummaryMemo(bs[1])).toBe(false);
    expect(countSummaryMemos(bs)).toBe(2);
    expect(countSummaryMemos(bs, ['a', 'b'])).toBe(1);
  });
  it('まとめだけの本も相談例の「メモのある本」に入る', () => {
    const ex = buildConsultExamples({ books: bs, memoBookIds: new Set(), count: 1 });
    expect(ex[0].text).toBe('『A』の学びで、明日から使えるものは？');
  });
});

import { fmtTokens, consultsLeft } from './consultHelpers';
describe('トークンの見せ方', () => {
  it('3 桁ごとに区切る', () => {
    expect(fmtTokens(1000)).toBe('1,000');
    expect(fmtTokens(20)).toBe('20');
  });
  it('相談できるおよその回数（最後の 1 回を含む）', () => {
    expect(consultsLeft(20, 10)).toBe(2);
    expect(consultsLeft(5, 10)).toBe(1);
    expect(consultsLeft(0, 10)).toBe(0);
  });
});
