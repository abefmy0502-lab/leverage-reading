import { describe, it, expect } from 'vitest';
import { sameBookTitle, onShelfByTitle } from './ownedTitle';

describe('もう本棚にある本か（書名）', () => {
  const shelf = '確率思考の戦略論USJでも実証された数学マーケティングの力';
  it('空白・記号の違いは同じ本', () => {
    expect(sameBookTitle(shelf, '確率思考の戦略論 USJでも実証された数学マーケティングの力')).toBe(true);
  });
  it('書名と副題の順が入れ替わっても同じ本', () => {
    expect(sameBookTitle(shelf, 'USJでも実証された数学マーケティングの力 確率思考の戦略論')).toBe(true);
  });
  it('副題が違う別の版・書名の一部だけは別の本', () => {
    expect(sameBookTitle(shelf, '確率思考の戦略論 どうすれば売上は増えるのか')).toBe(false);
    expect(sameBookTitle(shelf, '確率思考の戦略論')).toBe(false);
    expect(onShelfByTitle([{ title: shelf }], 'USJでも実証された数学マーケティングの力 確率思考の戦略論')).toBe(true);
  });
});
