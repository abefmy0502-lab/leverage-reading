import { describe, it, expect } from 'vitest';
import { estimateProfit, loadFixed, saveFixed, DEFAULT_FIXED, monthLabel, yen } from './adminProfit';

describe('今月の売上と推定の粗利（運営ダッシュボード・2026-10-22）', () => {
  it('月額・年額・創業・追加トークンを月あたりに均して足し、税と手数料を引く', () => {
    const d = { month: '2026-12', paid: { monthly: 10, annual: 5, founding: 4, trial: 3 }, packs: { orime_tokens_300: 2, orime_tokens_1000: 1 }, ai_cost_mjpy: 790000, fields_ai_calls: 100 };
    const p = estimateProfit(d, { apple: 1082, supabase: 0, vercel: 0, other: 0 });
    // 10×1480 + 5×12800/12 + 4×9800/12 = 14800 + 5333.3 + 3266.7 = 23400
    expect(p.subsYen).toBe(23400);
    expect(p.packs).toEqual({ count: 3, yen: 1400 });
    expect(p.revenueYen).toBe(24800);
    expect(p.exTaxYen).toBe(Math.round(24800 / 1.1));
    expect(p.storeFeeYen).toBe(Math.round((24800 / 1.1) * 0.15));
    expect(p.netYen).toBe(Math.round((24800 / 1.1) * 0.85));
    expect(p.aiYen).toBe(790 + 13);
    expect(p.fixedYen).toBe(1082);
    expect(p.grossYen).toBe(p.netYen - 803 - 1082);
    expect(p.paid.total).toBe(19);
    expect(p.perPaidYen).toBe(Math.round((p.netYen - 803) / 19));
    expect(p.marginBeforeFixed).toBeGreaterThan(0.9);
  });
  it('何も無ければ 0・売上 0 のとき割合は null', () => {
    const p = estimateProfit(null);
    expect(p.revenueYen).toBe(0);
    expect(p.grossYen).toBe(-DEFAULT_FIXED.apple);
    expect(p.marginBeforeFixed).toBeNull();
    expect(p.perPaidYen).toBe(0);
  });
  it('固定費は端末に覚え、壊れた値は既定に戻す', () => {
    const store = new Map();
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
    expect(loadFixed(storage)).toEqual(DEFAULT_FIXED);
    saveFixed({ apple: 1082, supabase: 3750, vercel: -5, other: 'x' }, storage);
    expect(loadFixed(storage)).toEqual({ ...DEFAULT_FIXED, supabase: 3750 });
    expect(loadFixed(null)).toEqual(DEFAULT_FIXED);
  });
  it('月の名前と円の書き方', () => {
    expect(monthLabel('2026-11')).toBe('11 月');
    expect(monthLabel('')).toBe('今月');
    expect(yen(24800)).toBe('¥24,800');
  });
});
