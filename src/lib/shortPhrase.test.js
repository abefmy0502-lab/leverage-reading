import { describe, it, expect } from 'vitest';
import { isShortPhrase } from './shortPhrase';

describe('isShortPhrase', () => {
  it('34 字までは短い・それより長いと長い', () => {
    expect(isShortPhrase('チームの成果をきちんと測って伸ばしたい')).toBe(true);
    expect(isShortPhrase('あ'.repeat(34))).toBe(true);
    expect(isShortPhrase('あ'.repeat(35))).toBe(false);
    expect(isShortPhrase('')).toBe(true);
  });
});
