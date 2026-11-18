import { describe, it, expect } from 'vitest';
import { nestQuotes, quotable } from './nestQuotes.js';

describe('nestQuotes', () => {
  it('「」の中の「」を『』にする', () => {
    expect(nestQuotes('メモの「部長には「結論から」話す」を試す'))
      .toBe('メモの「部長には『結論から』話す」を試す');
  });
  it('入れ子が無ければそのまま', () => {
    expect(nestQuotes('「結論から話す」と『イシューからはじめよ』')).toBe('「結論から話す」と『イシューからはじめよ』');
    expect(nestQuotes('引用なし')).toBe('引用なし');
  });
  it('閉じ忘れは次の行に広げない', () => {
    expect(nestQuotes('「閉じていない\n「次の行」')).toBe('「閉じていない\n「次の行」');
  });
});

describe('quotable', () => {
  it('中の「」を『』にして、途中で切った『』を閉じる', () => {
    expect(quotable('癖がある。「この報告で決めてほしい…')).toBe('癖がある。『この報告で決めてほしい…』');
    expect(quotable('「頑張ります」は計測できない')).toBe('『頑張ります』は計測できない');
  });
});
