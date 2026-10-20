import { describe, it, expect } from 'vitest';
import { prevMonthOf, jstDayOfMonth, tokensBackCandidate, shouldShowTokensBack, tokensBackText } from './tokensBack';

const at = (iso) => Date.parse(iso);
const T = 300; // 1 トークン＝¥0.3＝300 mjpy

describe('今月の相談が戻りました', () => {
  it('先月は日本時間で数える（1 月は前の年の 12 月）', () => {
    expect(prevMonthOf(at('2026-11-02T00:00:00+09:00')).key).toBe('2026-10');
    expect(prevMonthOf(at('2027-01-01T00:30:00+09:00')).key).toBe('2026-12');
    expect(jstDayOfMonth(at('2026-10-31T23:30:00Z'))).toBe(1); // 日本時間 11/1
  });

  it('読みに行くのは無料プラン・月のはじめの 7 日間・この月にまだ閉じていないときだけ', () => {
    const now = at('2026-11-03T09:00:00+09:00');
    expect(tokensBackCandidate({ freeMode: true, now })).toBe(true);
    expect(tokensBackCandidate({ freeMode: false, now })).toBe(false);
    expect(tokensBackCandidate({ freeMode: true, now, doneMonth: '2026-11' })).toBe(false);
    expect(tokensBackCandidate({ freeMode: true, now, doneMonth: '2026-10' })).toBe(true);
    expect(tokensBackCandidate({ freeMode: true, now: at('2026-11-08T09:00:00+09:00') })).toBe(false);
  });

  it('先月の残りが答え 1 回ぶんより少なかったときだけ出す', () => {
    const now = at('2026-11-02T09:00:00+09:00');
    const createdAt = '2026-08-01T00:00:00Z';
    expect(shouldShowTokensBack({ prevUsedMjpy: 30 * T, createdAt, now, remaining: 30 })).toBe(true);
    expect(shouldShowTokensBack({ prevUsedMjpy: 25 * T, createdAt, now, remaining: 30 })).toBe(true);
    expect(shouldShowTokensBack({ prevUsedMjpy: 20 * T, createdAt, now, remaining: 30 })).toBe(false);
    expect(shouldShowTokensBack({ prevUsedMjpy: 0, createdAt, now, remaining: 30 })).toBe(false);
    expect(shouldShowTokensBack({ prevUsedMjpy: null, createdAt, now, remaining: 30 })).toBe(false);
    // 今月がもう少ない
    expect(shouldShowTokensBack({ prevUsedMjpy: 30 * T, createdAt, now, remaining: 5 })).toBe(false);
  });

  it('先月がはじめの月（60）なら 60 を使い切ったときだけ・先月にアカウントが無ければ出さない', () => {
    const now = at('2026-11-02T09:00:00+09:00');
    const createdAt = '2026-10-10T00:00:00+09:00';
    expect(shouldShowTokensBack({ prevUsedMjpy: 30 * T, createdAt, now, remaining: 30 })).toBe(false);
    expect(shouldShowTokensBack({ prevUsedMjpy: 55 * T, createdAt, now, remaining: 30 })).toBe(true);
    expect(shouldShowTokensBack({ prevUsedMjpy: 30 * T, createdAt: '2026-11-01T10:00:00+09:00', now, remaining: 30 })).toBe(false);
  });

  it('文は答えの回数で', () => {
    const t = tokensBackText(30);
    expect(t.lead + t.count).toBe('今月の相談が戻りました（AI の答え 約 3 回）');
  });
});
