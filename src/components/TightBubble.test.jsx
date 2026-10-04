import { describe, it, expect } from 'vitest';
import { scriptBreakPieces, phrasePieces, longestPhraseLength } from './TightBubble';

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
  it('scriptBreaks ありでは長い文節の中も分ける', () => {
    expect(phrasePieces('アウトプット大全', { scriptBreaks: true })).toEqual(['アウトプット', '大全']);
    expect(longestPhraseLength('アウトプット大全', { scriptBreaks: true })).toBe(6);
  });
});
