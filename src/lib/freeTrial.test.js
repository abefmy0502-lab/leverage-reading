import { describe, it, expect } from 'vitest';
import { isPaywallError, paywallReasonFor, nextResetLabelJa } from './freeTrial';

describe('isPaywallError', () => {
  it('402 の free_limit_reached / plan_required（と旧名 subscription_required）だけ', () => {
    expect(isPaywallError(402, 'free_limit_reached')).toBe(true);
    expect(isPaywallError(402, 'plan_required')).toBe(true);
    expect(isPaywallError(402, 'free_ocr_limit_reached')).toBe(true);
    expect(isPaywallError(402, 'subscription_required')).toBe(true);
    expect(isPaywallError(429, 'monthly_budget_exceeded')).toBe(false);
    expect(isPaywallError(402, '')).toBe(false);
  });
});

describe('paywallReasonFor', () => {
  it('無料のトークンを使い切った → free_used、それ以外 → feature', () => {
    expect(paywallReasonFor('free_limit_reached')).toBe('free_used');
    expect(paywallReasonFor('plan_required')).toBe('feature');
    expect(paywallReasonFor('free_ocr_limit_reached')).toBe('free_ocr_used');
    expect(paywallReasonFor('subscription_required')).toBe('feature');
  });
});

describe('nextResetLabelJa', () => {
  it('日本時間の来月 1 日', () => {
    expect(nextResetLabelJa(new Date('2026-09-30T16:00:00Z'))).toBe('11月1日');
    expect(nextResetLabelJa(new Date('2026-12-31T00:00:00Z'))).toBe('1月1日');
  });
});
