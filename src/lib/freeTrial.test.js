import { describe, it, expect } from 'vitest';
import { inFreeWindow, isPaywallError, FREE_WINDOW_HOURS } from './freeTrial';

describe('inFreeWindow', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  it('登録直後は枠の中', () => {
    expect(inFreeWindow({ created_at: '2026-09-27T11:00:00Z' }, now)).toBe(true);
  });
  it('72 時間を過ぎたら枠の外', () => {
    const past = new Date(now - (FREE_WINDOW_HOURS * 3600 + 1) * 1000).toISOString();
    expect(inFreeWindow({ created_at: past }, now)).toBe(false);
  });
  it('作成日時が無い・壊れているときは枠の外（安全側）', () => {
    expect(inFreeWindow({}, now)).toBe(false);
    expect(inFreeWindow({ created_at: 'x' }, now)).toBe(false);
    expect(inFreeWindow(null, now)).toBe(false);
  });
});

describe('isPaywallError', () => {
  it('402 の free_limit_reached / subscription_required だけ', () => {
    expect(isPaywallError(402, 'free_limit_reached')).toBe(true);
    expect(isPaywallError(402, 'subscription_required')).toBe(true);
    expect(isPaywallError(429, 'monthly_limit_exceeded')).toBe(false);
    expect(isPaywallError(402, '')).toBe(false);
  });
});
