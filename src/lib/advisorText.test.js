import { describe, it, expect } from 'vitest';
import { concernOf, interviewPairsOf, displayUserText } from './advisorText';

const raw = '【相談内容】\n仕事が回らない\n\n【ヒアリングの回答】\nQ. つまずきは？\nA. 時間が足りない\nQ. 理想は？\nA. 定時で帰る\n\n以上でヒアリングは十分です。これ以上質問せず、推薦してください。';

describe('advisorText', () => {
  it('テンプレートから相談だけを取り出す', () => {
    expect(concernOf(raw)).toBe('仕事が回らない');
    expect(concernOf('ふつうの相談')).toBe('ふつうの相談');
  });
  it('ヒアリングの Q/A を取り出す', () => {
    expect(interviewPairsOf(raw)).toEqual([{ q: 'つまずきは？', a: '時間が足りない' }, { q: '理想は？', a: '定時で帰る' }]);
    expect(interviewPairsOf('ふつう')).toEqual([]);
  });
  it('表示用に指示文を落とす', () => {
    expect(displayUserText(raw)).toBe('仕事が回らない\n・時間が足りない\n・定時で帰る');
    expect(displayUserText(raw)).not.toMatch(/推薦してください/);
  });
});
