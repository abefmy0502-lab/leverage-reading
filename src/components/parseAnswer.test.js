import { describe, it, expect } from 'vitest';
import { parseAnswer } from './MyBookBrain';

const sample = [
  '【結論】',
  '結論の一文です。',
  '',
  '【参照した本のメモ】',
  '- 『A』のメモ：「一」',
  '',
  '【あなたの状況に合わせた解釈】',
  '解釈です。',
  '',
  '【明日からできる 1 つの行動】',
  '明日の朝、10 分で書き出す。',
  '',
  '（お試しモードの応答です）',
  '',
  '（参照: 3/10 件、内訳: カード 3 / まとめ 0 / 学び 0）',
].join('\n');

describe('parseAnswer', () => {
  it('結論・根拠・解釈・一歩に分ける', () => {
    const p = parseAnswer(sample);
    expect(p.conclusion).toBe('結論の一文です。');
    expect(p.refs).toContain('『A』');
    expect(p.interp).toBe('解釈です。');
    expect(p.action).toBe('明日の朝、10 分で書き出す。');
    expect(p.actionLabel).toBe('明日からできる一歩');
  });
  it('一歩の後ろの補足は note に回し、内部向けの参照件数は出さない', () => {
    const p = parseAnswer(sample);
    expect(p.note).toContain('お試しモード');
    expect(p.note).not.toContain('参照: 3/10');
    expect(p.action).not.toContain('参照');
  });
  it('「心に残るもの」の見出しはそのままラベルにする', () => {
    const p = parseAnswer('【結論】\nx\n\n【心に残るもの】\n一節');
    expect(p.action).toBe('一節');
    expect(p.actionLabel).toBe('心に残るもの');
  });
  it('見出しが無ければ null', () => {
    expect(parseAnswer('回答を生成できませんでした。')).toBeNull();
  });
});
