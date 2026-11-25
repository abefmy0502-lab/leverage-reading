import { describe, it, expect } from 'vitest';
import { toHalfWidthAlnum } from './halfWidth';

describe('全角の英数字を半角に', () => {
  it('数字と英字だけを半角に・ほかはそのまま', () => {
    expect(toHalfWidthAlnum('７つの習慣')).toBe('7つの習慣');
    expect(toHalfWidthAlnum('ＯＫＲ　入門')).toBe('OKR　入門');
    expect(toHalfWidthAlnum('考え方')).toBe('考え方');
    expect(toHalfWidthAlnum('')).toBe('');
    expect(toHalfWidthAlnum(null)).toBe(null);
  });
});
