import { describe, it, expect } from 'vitest';
import { scriptBreakPieces, phrasePieces, longestPhraseLength, keepUnitsTogether, isGluedPhrase } from './TightBubble';

// 書名・著者名の長い 1 文節の中の折り返してよい所（文字の種類の切れ目・2026-10-04）。
describe('scriptBreakPieces', () => {
  it('カタカナ↔漢字で分ける（「アウトプット大全」→「アウトプット|大全」）', () => {
    expect(scriptBreakPieces('アウトプット大全')).toEqual(['アウトプット', '大全']);
  });
  it('「1兆ドルコーチ」は「コーチ」の中で割らない（1 字の切れ端も作らない）', () => {
    const pieces = scriptBreakPieces('1兆ドルコーチ');
    expect(pieces.join('')).toBe('1兆ドルコーチ');
    expect(pieces.some((p) => p.includes('コーチ'))).toBe(true);
    expect(pieces.every((p) => [...p].length >= 2)).toBe(true);
  });
  it('「エリック・シュミット」は「・」の後ろでだけ分ける', () => {
    expect(scriptBreakPieces('エリック・シュミット')).toEqual(['エリック・', 'シュミット']);
  });
  it('短い文節（6 字まで）は分けない', () => {
    expect(scriptBreakPieces('考え方')).toEqual(['考え方']);
    expect(scriptBreakPieces('数値化の鬼')).toEqual(['数値化の鬼']);
  });
  it('ひらがなの前後では分けない（送りがな「動／かす」・「やり／抜く」を割らない）', () => {
    expect(scriptBreakPieces('人を動かす技術の本')).toEqual(['人を動かす技術の本']);
    expect(scriptBreakPieces('やり抜く力をつける')).toEqual(['やり抜く力をつける']);
  });
  it('英字↔日本語で分ける', () => {
    expect(scriptBreakPieces('GRITやり抜く力')).toEqual(['GRIT', 'やり抜く力']);
    expect(scriptBreakPieces('FACT大全シリーズ')).toEqual(['FACT', '大全', 'シリーズ']);
  });
});

describe('phrasePieces / longestPhraseLength', () => {
  it('scriptBreaks なしでは今までどおり BudouX の文節だけ', () => {
    expect(phrasePieces('アウトプット大全')).toEqual(['アウトプット大全']);
    expect(longestPhraseLength('アウトプット大全')).toBe(8);
  });
  it('数字と助数詞の間は折り返さない空白に（「1 つ」「800 トークン」）', () => {
    expect(phrasePieces('毎日の 1 つを決める').join('')).toBe('毎日の 1\u00a0つを決める');
    expect(phrasePieces('毎月 800 トークン使えます').join('')).toContain('800\u00a0トークン');
    // 助数詞でない語の前の空白はそのまま
    expect(phrasePieces('第 2 部 Amazon').join('')).toBe('第 2 部 Amazon');
  });
  it('ダッシュで始まる文節は前の文節に結合文字でつなぐ（— を行頭に置かない・前の空白は落とす）', () => {
    const pieces = phrasePieces('『時間術大全』 — 毎日の 1 つを決める');
    expect(pieces.join('')).toBe('『時間術大全』\u2060— 毎日の 1\u00a0つを決める');
    expect(pieces.some((pc) => /^[ \u00a0\u2060]*—/.test(pc))).toBe(false);
    // 同じ文節の中の「』 —」も同じ形に
    expect(phrasePieces('『大事なことに集中する』 — 集中できる時間').join('')).toBe('『大事なことに集中する』\u2060— 集中できる時間');
    // 英語の「a — b」はそのまま
    expect(phrasePieces('focus — time').join('')).toBe('focus — time');
    // 行頭のダッシュ（前が無い）はそのまま
    expect(phrasePieces('— はじめに')[0].startsWith('—')).toBe(true);
  });
  it('keepUnitsTogether は文字列のまま同じ 2 つだけかける（Markdown の箇条書き用）', () => {
    expect(keepUnitsTogether('『時間術大全』 — 毎日の 1 つを決める')).toBe('『時間術大全』\u2060— 毎日の 1\u00a0つを決める');
    expect(keepUnitsTogether('focus — 2 apples')).toBe('focus — 2 apples');
  });
  it('「約 15 回」「およそ 3 冊」の「約／およそ」と数を割らない（2026-10-10）', () => {
    expect(keepUnitsTogether('AI の答え 約 15 回')).toBe('AI の答え 約\u00a015\u00a0回');
    expect(keepUnitsTogether('およそ 3 冊')).toBe('およそ\u00a03\u00a0冊');
    expect(phrasePieces('1 回 約 10 トークンです').join('')).toContain('約\u00a010\u00a0トークン');
  });
  it('scriptBreaks ありでは長い文節の中も分ける', () => {
    expect(phrasePieces('アウトプット大全', { scriptBreaks: true })).toEqual(['アウトプット', '大全']);
    expect(longestPhraseLength('アウトプット大全', { scriptBreaks: true })).toBe(6);
  });
});

// 割ると読みにくい決まった言い回し（2026-10-08: AI 選書の問いとまとめ）。
describe('isGluedPhrase', () => {
  it('「もう／一度」「と／いう」は割らない', () => {
    expect(isGluedPhrase('もう', '一度')).toBe(true);
    expect(isGluedPhrase('「悩み」と', 'いう悩みについて')).toBe(true);
  });
  it('「いちばん」だけの半端な 1 行を作らない（次の文節とつなぐ）', () => {
    expect(isGluedPhrase('書いていましたが、いちばん', '引っかかっているのは、')).toBe(true);
  });
  it('ほかの切れ目は割ってよい', () => {
    expect(isGluedPhrase('本を', '読む')).toBe(false);
    expect(isGluedPhrase('あと', '一冊')).toBe(false);
  });
});
