import { describe, it, expect, beforeEach } from 'vitest';
import { freePoolBudgetMjpy, freePoolLevel, freePoolOn, reserveFreePool, paidMemberCount, _resetPaidCacheForTest } from './_freePool.js';

describe('無料プランの AI の全体の予算（2026-11-25）', () => {
  beforeEach(() => _resetPaidCacheForTest());
  it('基本 ¥10,000 ＋ 有料 1 人 ¥300・上限 ¥300,000（mjpy）', () => {
    expect(freePoolBudgetMjpy({ paidCount: null, env: {} })).toBe(10000 * 1000);
    expect(freePoolBudgetMjpy({ paidCount: 100, env: {} })).toBe(40000 * 1000);
    expect(freePoolBudgetMjpy({ paidCount: 5000, env: {} })).toBe(300000 * 1000);
    expect(freePoolBudgetMjpy({ paidCount: 10, env: { AI_FREE_POOL_BASE_JPY: '0', AI_FREE_POOL_PER_PAID_JPY: '500' } })).toBe(5000 * 1000);
  });
  it('有料 1 人に回す ¥300 は、有料 1 人の手取りから本人の AI の上限を引いた残りの半分より少ない（赤字にしない）', () => {
    const net = (1480 / 1.1) * (1 - 0.15); // 約 ¥1,144
    expect(300).toBeLessThan((net - 240) / 2);
  });
  it('段: 70% で warn・90% で high・100% で out', () => {
    expect(freePoolLevel(0, 1000)).toBe('ok');
    expect(freePoolLevel(700, 1000)).toBe('warn');
    expect(freePoolLevel(900, 1000)).toBe('high');
    expect(freePoolLevel(1000, 1000)).toBe('out');
    expect(freePoolLevel(1, 0)).toBe('out');
  });
  it('AI_FREE_POOL=off で数えない', () => {
    expect(freePoolOn({})).toBe(true);
    expect(freePoolOn({ AI_FREE_POOL: 'off' })).toBe(false);
  });
  it('予約: -1 は止める・RPC が無ければ止めない（1 人ずつの上限だけ）', async () => {
    const sb = (data, error = null) => ({ rpc: async () => ({ data, error }) });
    expect(await reserveFreePool(sb(1234), { periodMonth: '2026-11', amountMjpy: 10, budgetMjpy: 5000 })).toEqual({ metered: true, allowed: true, total: 1234 });
    expect(await reserveFreePool(sb(-1), { periodMonth: '2026-11', amountMjpy: 10, budgetMjpy: 5000 })).toEqual({ metered: true, allowed: false, total: null });
    expect((await reserveFreePool(sb(null, { message: 'function does not exist' }), { periodMonth: '2026-11', amountMjpy: 10, budgetMjpy: 5000 })).allowed).toBe(true);
    expect((await reserveFreePool(null, { periodMonth: '2026-11', amountMjpy: 10, budgetMjpy: 5000 })).metered).toBe(false);
  });
  it('有料の数は読めなければ null（基本の予算だけ）', async () => {
    const fail = { error: { message: 'x' } };
    const bad = { from: () => ({ select: () => ({ eq: () => ({ or: async () => fail, then: (r) => r(fail) }) }) }) };
    expect(await paidMemberCount(bad)).toBe(null);
    expect(await paidMemberCount(null)).toBe(null);
  });
});
