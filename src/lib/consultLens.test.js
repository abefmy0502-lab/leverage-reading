// 🔭 見方を変える 3 つ（2026-10-08・オーナー承認・記事「視点・視野・視座」から）。
import { describe, it, expect } from 'vitest';
import { turnHint } from './ai';
import { LENS_CHIPS, lensOf, lensChips, wantsAction, shouldDecide, countAsks, nextStepChips, DECIDE_CHIP, usedLenses, isWorkConsult, LENS_LIMIT } from './consultHelpers';

describe('見方を変える 3 つのチップ', () => {
  it('ほかの本の視点では、メモのある本が 2 冊以上のときだけ', () => {
    expect(lensChips({ booksWithMemos: 1 }).map((c) => c.label)).toEqual(['2 つ上の立場なら', '前と後ろの工程から']);
    expect(lensChips({ booksWithMemos: 2 }).map((c) => c.label)).toEqual(['ほかの本の視点で', '2 つ上の立場なら', '前と後ろの工程から']);
    lensChips({ booksWithMemos: 2 }).forEach((c) => expect(c.kind).toBe('lens'));
  });
  it('送る文から見方が分かる・ふつうの文は null', () => {
    expect(lensOf(LENS_CHIPS.otherBook.send)).toBe('otherBook');
    expect(lensOf(LENS_CHIPS.up.send)).toBe('up');
    expect(lensOf(LENS_CHIPS.flow.send)).toBe('flow');
    expect(lensOf('会議の前')).toBeNull();
  });
  it('見方の頼みは行動を求める言葉に当たらず、聞き返しの上限でも行動にしない', () => {
    Object.values(LENS_CHIPS).forEach((c) => {
      expect(wantsAction(c.send)).toBe(false);
      expect(shouldDecide({ followUp: true, question: c.send, asked: 2 })).toBe(false);
    });
  });
  it('見方を変えた答えの「続けますか？」は聞き返しに数えない', () => {
    const lensAnswer = ['【結論】', '別の見方です。', '', '【あなたに聞きたいこと】', 'この見方で続けますか？'].join('\n');
    expect(countAsks([{ question: LENS_CHIPS.up.send, answer: lensAnswer }])).toBe(0);
    expect(countAsks([{ question: '会議の前', answer: lensAnswer }])).toBe(1);
  });
  it('見方を変えた答えのあとは「ここで答えと行動を」→ まだ使っていないほかの見方', () => {
    const c = nextStepChips({ replies: [], booksWithMemos: 3, lastAsked: LENS_CHIPS.up.send });
    expect(c.map((x) => x.label)).toEqual([DECIDE_CHIP, 'ほかの本の視点で', '前と後ろの工程から']);
    expect(c[0].kind).toBe('decide');
  });
});

describe('turnHint（LENS の頼み方）', () => {
  it('ほかの本の視点で: 直前の答えで使った本を使わない・作り話をしない・続けるかの問い 1 つ', () => {
    const o = turnHint({ followUp: true, question: LENS_CHIPS.otherBook.send, usedTitles: ['イシューからはじめよ'] });
    expect(o.lens).toBe('otherBook');
    expect(o.decide).toBe(false);
    expect(o.text).toContain('LENS');
    expect(o.text).toContain('『イシューからはじめよ』');
    expect(o.text).toContain('メモに無い役職・工程・人物・数字を作らない');
    expect(o.text).toContain('【あなたに聞きたいこと】');
    expect(o.text).toContain('最後は問いにしない');
    expect(o.text).toContain('【結論】に書名を書かない');
    expect(o.text).toContain('1 冊');
    expect(o.text).not.toContain('ACTION_REQUEST');
  });
  it('2 つ上の立場・前と後ろの工程', () => {
    expect(turnHint({ followUp: true, question: LENS_CHIPS.up.send }).text).toContain('2 段上');
    expect(turnHint({ followUp: true, question: LENS_CHIPS.flow.send }).text).toContain('一つ前と一つ後ろの工程');
  });
  it('最初の相談（続きでない）では見方の頼みとして扱わない', () => {
    expect(turnHint({ followUp: false, question: LENS_CHIPS.up.send }).lens).toBeUndefined();
  });
});

const ACT = ['【結論】', 'まとめます。', '', '【明日からできる 1 つの行動】', '始業前の 10 分で依頼を書く。'].join('\n');
const PLAIN = ['【結論】', '別の見方です。', '', '【あなたの状況に合わせた解釈】', 'こう読めます。'].join('\n');

describe('見方を回り続けない（usedLenses・LENS_LIMIT）', () => {
  it('いまの区切りで使った見方を数え、行動を決めた答えで数え直す', () => {
    expect(usedLenses([{ question: LENS_CHIPS.up.send, answer: PLAIN }])).toEqual(['up']);
    expect(usedLenses([{ question: LENS_CHIPS.up.send, answer: PLAIN }, { question: '決めたい', answer: ACT }])).toEqual([]);
    expect(usedLenses([{ question: LENS_CHIPS.up.send, answer: PLAIN }, { question: LENS_CHIPS.up.send, answer: PLAIN }])).toEqual(['up']);
  });
  it('使った見方は出さない', () => {
    const c = nextStepChips({ booksWithMemos: 3, lastAsked: LENS_CHIPS.flow.send, used: ['up'] });
    expect(LENS_LIMIT).toBe(2);
    // up と flow の 2 つを使った → 「ここで答えと行動を」だけ
    expect(c.map((x) => x.label)).toEqual([DECIDE_CHIP]);
  });
  it('1 つ使ったあとは、ここで答えと行動を → 残りの見方', () => {
    const c = nextStepChips({ booksWithMemos: 3, lastAsked: LENS_CHIPS.otherBook.send, used: [] });
    expect(c.map((x) => x.label)).toEqual([DECIDE_CHIP, '2 つ上の立場なら', '前と後ろの工程から']);
  });
});

describe('仕事の相談か（isWorkConsult）', () => {
  it('仕事の言葉があれば仕事', () => {
    ['部下が報告をくれない', '上司との会議で発言できない', '売上が落ちた', 'プロジェクトが遅れる', '取引先に断りたい',
      'チームの会議がまとまらない', '評価面談で何を話すか', '会社の部活の幹事を任された'].forEach((t) => {
      expect(isWorkConsult({ texts: [t] })).toBe(true);
    });
  });
  it('仕事でない相談', () => {
    ['子どもが朝起きない', '眠れない夜がつづく', '小説の余韻を言葉にしたい',
      '子どもの学校の評価が気になる', '部活のチームがまとまらない', '娘の担任の先生に報告するか迷う', '家族の会議で意見が割れる'].forEach((t) => {
      expect(isWorkConsult({ texts: [t] })).toBe(false);
    });
  });
  it('相談相手に絞った本が仕事の本なら仕事', () => {
    expect(isWorkConsult({ texts: ['気持ちが続かない'], books: [{ title: '最高のリーダーは何もしない', tags: [] }] })).toBe(true);
    expect(isWorkConsult({ texts: ['気持ちが続かない'], books: [{ title: '星の王子さま', tags: ['小説'] }] })).toBe(false);
    expect(isWorkConsult({ texts: ['気持ちが続かない'], books: [{ title: 'X', tags: ['ビジネス'] }] })).toBe(true);
  });
  it('仕事でない相談は「ほかの本の視点で」だけ', () => {
    expect(lensChips({ booksWithMemos: 3, work: false }).map((c) => c.label)).toEqual(['ほかの本の視点で']);
    expect(nextStepChips({ booksWithMemos: 3, work: false }).map((c) => c.label)).toEqual([DECIDE_CHIP, 'ほかの本の視点で']);
    expect(nextStepChips({ booksWithMemos: 1, work: false }).map((c) => c.label)).toEqual([DECIDE_CHIP]);
  });
});
