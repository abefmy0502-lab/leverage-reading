import { describe, it, expect } from 'vitest';
import { isBookIsbn13, isRepeatScan } from './barcodeLookup';

describe('バーコードの ISBN（2026-11-26）', () => {
  it('本の ISBN-13 でチェックディジットが合うものだけ', () => {
    expect(isBookIsbn13('9784478025819')).toBe(true);
    expect(isBookIsbn13('9784478025818')).toBe(false); // 1 桁の読み違い
    expect(isBookIsbn13('4901234567894')).toBe(false); // 本でない JAN
    expect(isBookIsbn13('978483792616')).toBe(false);
  });
  it('同じ本を続けて読んでも 1 回に', () => {
    const last = { isbn: '9784837926163', at: 1000 };
    expect(isRepeatScan(last, '9784837926163', 2000)).toBe(true);
    expect(isRepeatScan(last, '9784837926163', 5000)).toBe(false);
    expect(isRepeatScan(last, '9784478025819', 2000)).toBe(false);
    expect(isRepeatScan(null, '9784837926163', 2000)).toBe(false);
  });
});
