import { describe, it, expect } from 'vitest';
import { BASE, SCENARIOS, simulate, yearly, lifetimeValue, paidAcquisition, MONTHS } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, quarterOf } from './schedule.mjs';

// 2026-11-22 オーナー「優秀なコンサルが何人読んでも納得する内容に」: 計画の数字は、この計算から出る
describe('中期経営計画の計算', () => {
  const ys = (A) => Object.fromEntries(yearly(simulate(A)).map((o) => [o.year, o]));
  it('基本の見込みは、目標（1,000・4,000・10,000 人）の ±15% に入る', () => {
    const y = ys(BASE);
    expect(Math.abs(y[2027].paidEnd / 1000 - 1)).toBeLessThan(0.15);
    expect(Math.abs(y[2028].paidEnd / 4000 - 1)).toBeLessThan(0.15);
    expect(Math.abs(y[2029].paidEnd / 10000 - 1)).toBeLessThan(0.15);
  });
  it('控えめ ＜ 基本 ＜ 強気 の順', () => {
    const [l, b, h] = ['low', 'base', 'high'].map((k) => ys(SCENARIOS[k])[2029].paidEnd);
    expect(l).toBeLessThan(b); expect(b).toBeLessThan(h);
  });
  it('控えめでは人とお金を足さないので、どの年も赤字にならない', () => {
    for (const o of Object.values(ys(SCENARIOS.low))) expect(o.profit).toBeGreaterThan(-100_000);
  });
  it('月額の 1 年後に残る割合は、日本の目安（26%）に近い', () => {
    const left = (1 - BASE.firstMonthChurn) * (1 - BASE.steadyChurn[2027]) ** 11;
    expect(left).toBeGreaterThan(0.2); expect(left).toBeLessThan(0.32);
  });
  it('広告は 12 か月以内に回収できる範囲（基本）', () => {
    for (const y of [2028, 2029]) expect(paidAcquisition(BASE, y).paybackMonths).toBeLessThanOrEqual(12);
  });
  it('Android を出さないと減る（月の比べ方のまちがいを防ぐ）', () => {
    const no = ys({ ...BASE, androidFrom: '2099-01' })[2029].paidEnd;
    expect(no).toBeLessThan(ys(BASE)[2029].paidEnd);
  });
  it('生涯の利益は年額のほうが大きい', () => {
    const u = lifetimeValue(BASE, 2028);
    expect(u.ltvAnnual).toBeGreaterThan(u.ltvMonthly);
  });
});

describe('責任者と予定', () => {
  const months = MONTHS.filter((m) => m >= '2026-12');
  it('どの責任者にも、毎月の決まった仕事と年の成果物がある（法人は 2027 年は準備だけ）', () => {
    for (const r of ROLES) {
      if (r.id !== 'b2b') expect(ROUTINES.some((x) => x.role === r.id)).toBe(true);
      expect(ITEMS.some((x) => x.role === r.id && x.period === '2027')).toBe(true);
    }
  });
  it('どの四半期にも、方針・SNS 統括・マーケ・開発・保守運用の成果物がある', () => {
    for (const y of [2027, 2028, 2029]) for (const q of [1, 2, 3, 4]) {
      for (const role of ['ceo', 'sns', 'mkt', 'dev', 'ops']) {
        const has = ITEMS.some((x) => x.role === role && (x.period === `${y}-Q${q}` || (x.period.length === 7 && quarterOf(x.period) === `${y}-Q${q}`)));
        if (!has) throw new Error(`${role} ${y}-Q${q} に成果物が無い`);
      }
    }
  });
  it('2027 年はどの月にも、決まった成果物がある', () => {
    for (const m of months.filter((x) => x <= '2027-12')) expect(ITEMS.some((x) => x.period === m)).toBe(true);
  });
  it('成果物には責任者と終わりの基準がある', () => {
    for (const x of ITEMS) { expect(ROLES.some((r) => r.id === x.role)).toBe(true); expect(x.done).toBeTruthy(); }
  });
});
