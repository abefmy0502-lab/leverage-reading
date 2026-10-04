import { describe, it, expect } from 'vitest';
import { fmtDateTimeJa } from './dates';

describe('fmtDateTimeJa（過去の相談・過去の AI 選書の日時）', () => {
  const now = new Date(2026, 9, 4, 23, 0);
  it('今年は「M月D日 HH:mm」（今日・昨日でも同じ書き方）', () => {
    expect(fmtDateTimeJa(new Date(2026, 9, 4, 22, 38).toISOString(), now)).toBe('10月4日 22:38');
    expect(fmtDateTimeJa(new Date(2026, 0, 2, 7, 5).toISOString(), now)).toBe('1月2日 07:05');
  });
  it('違う年は年を前に・空や読めない値は空', () => {
    expect(fmtDateTimeJa(new Date(2025, 11, 31, 9, 0).toISOString(), now)).toBe('2025年12月31日 09:00');
    expect(fmtDateTimeJa('', now)).toBe('');
    expect(fmtDateTimeJa('x', now)).toBe('');
  });
});
