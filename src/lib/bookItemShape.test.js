// 📚 「本 1 冊」の欄に本が 1 冊だけ入っているか（lib/bookItemShape.js・2026-10-04）。
import { describe, it, expect } from 'vitest';
import { splitBookTitle, looksLikeSingleTitle } from './bookItemShape';

describe('splitBookTitle', () => {
  it('ふつうの書名は 1 冊（『』「」は外す）', () => {
    expect(splitBookTitle('エッセンシャル思考')).toEqual({ title: 'エッセンシャル思考', mixed: false, candidates: ['エッセンシャル思考'] });
    expect(splitBookTitle('『イシューからはじめよ』')).toEqual({ title: 'イシューからはじめよ', mixed: false, candidates: ['イシューからはじめよ'] });
    expect(splitBookTitle('「嫌われる勇気」')).toMatchObject({ title: '嫌われる勇気', mixed: false });
    // 副題・巻のかっこは説明ではない
    expect(splitBookTitle('サピエンス全史（上）')).toMatchObject({ title: 'サピエンス全史（上）', mixed: false });
    expect(splitBookTitle('LIFE SHIFT(ライフ・シフト)')).toMatchObject({ mixed: false });
    // 『』の中の「あるいは」は書名の一部
    expect(splitBookTitle('『フランケンシュタイン あるいは現代のプロメテウス』')).toMatchObject({ mixed: false });
  });

  it('2 冊を混ぜた形は mixed（候補を順に）', () => {
    expect(splitBookTitle('『SMALL ACTIONS, BIG RESULTS』関連 または『やめる習慣』')).toEqual({ title: 'SMALL ACTIONS, BIG RESULTS', mixed: true, candidates: ['SMALL ACTIONS, BIG RESULTS', 'やめる習慣'] });
    expect(splitBookTitle('7つの習慣 または やめる習慣')).toEqual({ title: '7つの習慣', mixed: true, candidates: ['7つの習慣 または やめる習慣', '7つの習慣', 'やめる習慣'] });
    expect(splitBookTitle('嫌われる勇気／幸せになる勇気')).toMatchObject({ mixed: true, candidates: ['嫌われる勇気／幸せになる勇気', '嫌われる勇気', '幸せになる勇気'] });
    expect(splitBookTitle('Atomic Habits or 小さな習慣')).toMatchObject({ mixed: true });
  });

  it('書名の後ろの説明（関連・シリーズ・（続編も））は外して mixed', () => {
    expect(splitBookTitle('やめる習慣 関連')).toEqual({ title: 'やめる習慣', mixed: true, candidates: ['やめる習慣'] });
    expect(splitBookTitle('ハリー・ポッターシリーズ')).toMatchObject({ title: 'ハリー・ポッター', mixed: true });
    expect(splitBookTitle('嫌われる勇気（続編も）')).toMatchObject({ title: '嫌われる勇気', mixed: true });
    expect(splitBookTitle('『嫌われる勇気』（続編も）')).toMatchObject({ title: '嫌われる勇気', mixed: true, candidates: ['嫌われる勇気'] });
  });

  it('空は空', () => {
    expect(splitBookTitle('')).toEqual({ title: '', mixed: false, candidates: [] });
  });
});

describe('looksLikeSingleTitle', () => {
  it('2〜40 字で、文の終わりの記号が無い', () => {
    expect(looksLikeSingleTitle('7つの習慣')).toBe(true);
    expect(looksLikeSingleTitle('あ')).toBe(false);
    expect(looksLikeSingleTitle('次は実践の本で手を動かしましょう。')).toBe(false);
    expect(looksLikeSingleTitle('読み方のコツ：まず目次から')).toBe(false);
    expect(looksLikeSingleTitle('あ'.repeat(41))).toBe(false);
  });
});
