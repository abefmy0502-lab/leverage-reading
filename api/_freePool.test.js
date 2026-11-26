import { describe, it, expect, beforeEach } from 'vitest';
import { freePoolBudgetMjpy, freePoolLevel, freePoolOn, reserveFreePool, paidMemberCount, _resetPaidCacheForTest } from './_freePool.js';

describe('無料プランの AI の全体の予算（2026-11-25）', () => {
  beforeEach(() => _resetPaidCacheForTest());
  it('基本 ¥10,000 と 有料 1 人 ¥300 × 人数 の大きいほう・上限 ¥300,000（mjpy・2026-11-26）', () => {
    expect(freePoolBudgetMjpy({ paidCount: null, env: {} })).toBe(10000 * 1000);
    expect(freePoolBudgetMjpy({ paidCount: 10, env: {} })).toBe(10000 * 1000);
    expect(freePoolBudgetMjpy({ paidCount: 100, env: {} })).toBe(30000 * 1000);
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

describe('登録せずに始めた人の分の枠（2026-11-26 監査）', () => {
  it('全体の予算の 30% が既定・env で変えられる・おかしな値は既定', async () => {
    const { guestPoolBudgetMjpy, guestPoolShare, guestPoolKey } = await import('./_freePool.js');
    expect(guestPoolBudgetMjpy(10_000_000, {})).toBe(3_000_000);
    expect(guestPoolShare({ AI_FREE_POOL_GUEST_SHARE: '0.5' })).toBe(0.5);
    expect(guestPoolShare({ AI_FREE_POOL_GUEST_SHARE: '2' })).toBe(0.3);
    expect(guestPoolKey('2026-11')).toBe('guest-2026-11');
    expect(/^(guest-)?[0-9]{4}-[0-9]{2}$/.test(guestPoolKey('2026-11'))).toBe(true);
  });
});

describe('有料が 100 人に 1 人でも黒字（2026-11-26 オーナー）', () => {
  it('どのプランでも、有料の本人が AI を上限まで使い、無料の人が予算を使い切っても、手残りはマイナスにならない', async () => {
    const { unitEconomics } = await import('./_freePool.js');
    for (const plan of ['monthly', 'annual', 'founding']) {
      const worst = unitEconomics({ conversion: 0.01, plan, paidAi: 240, freeAvg: 1000 });
      expect(worst.freeAi).toBe(300); // 無料の AI は有料 1 人あたり ¥300 で頭打ち
      expect(worst.contribution).toBeGreaterThan(0);
    }
  });
  it('有料が 34 人を超えると、無料の AI の予算はすべて有料 1 人あたりの分で決まる（基本の ¥10,000 を上乗せしない）', () => {
    expect(freePoolBudgetMjpy({ paidCount: 34, env: {} })).toBe(10200 * 1000);
    expect(freePoolBudgetMjpy({ paidCount: 33, env: {} })).toBe(10000 * 1000);
  });
});
