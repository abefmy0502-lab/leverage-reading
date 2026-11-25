import { describe, it, expect } from 'vitest';
import { glueInnerSpaces, glueClosers } from './TightBubble';

describe('glueInnerSpaces（文節の中の空きで折り返さない）', () => {
  it('数と助数詞の間の空きを折り返さない空きにする', () => {
    expect(glueInnerSpaces(' 3 行で')).toBe(' 3 行で');
    expect(glueInnerSpaces(' 15 分だけやる')).toBe(' 15 分だけやる');
    expect(glueInnerSpaces('1on1 は')).toBe('1on1 は');
  });
  it('文節の頭と終わりの空きはそのまま（文節の切れ目で折り返せる）', () => {
    expect(glueInnerSpaces(' 1 冊、 ')).toBe(' 1 冊、 ');
  });
  it('英文だけ・長い文節・空きの無い文節は変えない', () => {
    expect(glueInnerSpaces('The quick brown fox')).toBe('The quick brown fox');
    expect(glueInnerSpaces('あいうえお かきくけこ さしすせそ たちつてと')).toBe('あいうえお かきくけこ さしすせそ たちつてと');
    expect(glueInnerSpaces('結論から')).toBe('結論から');
    expect(glueInnerSpaces('')).toBe('');
  });
});

describe('glueClosers（閉じかっこ・その後ろの助詞を行頭に置かない・2026-11-25）', () => {
  it('？・。の直後の閉じかっこと、閉じかっこの直後の助詞を前につなぐ', () => {
    const J = '\u2060';
    expect(glueClosers('「達成するには？」を')).toBe(`「達成するには？${J}」${J}を`);
    expect(glueClosers('「保存しました。」')).toBe(`「保存しました。${J}」`);
    expect(glueClosers('「会議」を')).toBe(`「会議」${J}を`);
    expect(glueClosers('『考え方』は')).toBe(`『考え方』${J}は`);
    expect(glueClosers('「会議」、')).toBe('「会議」、');
  });
});
