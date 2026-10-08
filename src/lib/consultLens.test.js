// 🔭 見方を変える 3 つ（2026-10-08・オーナー承認・記事「視点・視野・視座」から）。
import { describe, it, expect } from 'vitest';
import { turnHint } from './ai';
import { LENS_CHIPS, lensOf, lensChips, wantsAction, shouldDecide, countAsks, nextStepChips, DECIDE_CHIP } from './consultHelpers';

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
    expect(o.text).toContain('候補（「・」の行）は書かない');
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
