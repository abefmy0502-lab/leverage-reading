import { describe, it, expect } from 'vitest';
import {
  decideAiAccess, decideFreeReservation, freePeriodKey, isFreePurpose,
  jstMonthDayLabel, nextMonthFirstLabel, freeLimitMessage, trialLimitMessage, planRequiredMessage,
} from './_aiAccess.js';

describe('decideAiAccess（フリーミアム）', () => {
  it('管理者はいつでも通す', () => {
    expect(decideAiAccess({ entitlement: { admin: true }, purpose: undefined })).toEqual({ allow: true, tier: 'admin' });
  });
  it('有料はすべての AI 機能', () => {
    expect(decideAiAccess({ entitlement: { allowed: true }, purpose: undefined })).toEqual({ allow: true, tier: 'paid' });
    expect(decideAiAccess({ entitlement: { allowed: true }, purpose: 'consult' })).toEqual({ allow: true, tier: 'paid' });
  });
  it('無料期間（trial/intro）もすべての AI 機能（原価の上限は別）', () => {
    expect(decideAiAccess({ entitlement: { allowed: true, trial: true } })).toEqual({ allow: true, tier: 'trial' });
  });
  it('契約なし: 相談は無料の枠で通す', () => {
    expect(decideAiAccess({ entitlement: { allowed: false }, purpose: 'consult', freeLimit: 3 })).toEqual({ allow: true, tier: 'free' });
  });
  it('契約なし: 相談以外（purpose なし・別の用途）は plan_required', () => {
    for (const purpose of [undefined, null, '', 'advisor', 'theme', 'CONSULT', 1]) {
      expect(decideAiAccess({ entitlement: { allowed: false }, purpose, freeLimit: 3 }))
        .toEqual({ allow: false, status: 402, errorCode: 'plan_required' });
    }
  });
  it('契約なし: 今月の回数を使い切ったら free_limit_reached', () => {
    expect(decideAiAccess({ entitlement: { allowed: false }, purpose: 'consult', freeLimit: 3, freeUsed: 3 }))
      .toEqual({ allow: false, status: 402, errorCode: 'free_limit_reached' });
    expect(decideAiAccess({ entitlement: { allowed: false }, purpose: 'consult', freeLimit: 3, freeUsed: 2 }).allow).toBe(true);
  });
  it('無料の回数が 0（AI_FREE_CALL_LIMIT=0）なら相談も plan_required', () => {
    expect(decideAiAccess({ entitlement: { allowed: false }, purpose: 'consult', freeLimit: 0 }).errorCode).toBe('plan_required');
  });
});

describe('decideFreeReservation（無料の枠は fail-closed）', () => {
  it('予約できたら通す', () => {
    expect(decideFreeReservation({ allowed: true, reserved: true })).toEqual({ allow: true });
  });
  it('上限に達したら free_limit_reached', () => {
    expect(decideFreeReservation({ allowed: false, reserved: true }).errorCode).toBe('free_limit_reached');
  });
  it('数えられない（RPC 未適用・障害）ときは通さない', () => {
    expect(decideFreeReservation({ allowed: true, reserved: false })).toEqual({ allow: false, status: 402, errorCode: 'plan_required' });
    expect(decideFreeReservation(undefined).allow).toBe(false);
  });
});

describe('キーと文言', () => {
  it('無料の相談は free-YYYY-MM の行で数える', () => {
    expect(freePeriodKey('2026-09')).toBe('free-2026-09');
  });
  it('isFreePurpose は consult だけ', () => {
    expect(isFreePurpose('consult')).toBe(true);
    expect(isFreePurpose('advisor')).toBe(false);
  });
  it('日付は日本時間・途中で改行しない', () => {
    // 2026-10-03T20:00Z は日本時間 10 月 4 日
    expect(jstMonthDayLabel('2026-10-03T20:00:00Z')).toBe('10月4日');
    expect(jstMonthDayLabel('2026-10-03T20:00:00Z', true)).toBe('10⁠月⁠4⁠日');
    expect(jstMonthDayLabel('x')).toBe('');
  });
  it('来月 1 日（日本時間・12 月は 1 月へ）', () => {
    expect(nextMonthFirstLabel(Date.parse('2026-09-30T16:00:00Z'))).toBe('11月1日'); // 日本時間 10/1
    expect(nextMonthFirstLabel(Date.parse('2026-12-10T00:00:00Z'))).toBe('1月1日');
  });
  it('案内文', () => {
    expect(freeLimitMessage(3, Date.parse('2026-09-27T00:00:00Z'))).toBe('今月の無料相談は、ここまでです。10⁠月⁠1⁠日にまた 3 回使えます。');
    expect(trialLimitMessage('2026-10-03T20:00:00Z')).toBe('無料期間中に使える AI の分は、ここまでです。無料期間が終わる10⁠月⁠4⁠日から、すべて使えます。');
    expect(trialLimitMessage(null)).toBe('無料期間中に使える AI の分は、ここまでです。無料期間が終わると、すべて使えます。');
    expect(planRequiredMessage()).toMatch(/プラン/);
  });
});
