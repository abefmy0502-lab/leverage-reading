import { describe, it, expect } from 'vitest';
import { BASE, SCENARIOS, simulate, yearly, lifetimeValue, paidAcquisition, MONTHS, breakEvenMonth } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, quarterOf, isMonth, TARGETS, MILESTONES, OWNER_WEEKLY_HOURS } from './schedule.mjs';

// 2026-11-22 オーナー「優秀なコンサルが何人読んでも納得する内容に」: 計画の数字は、この計算から出る（v2・点検 3 人の指摘を反映）
const ys = (A, o) => Object.fromEntries(yearly(simulate(A, o)).map((x) => [x.year, x]));

describe('中期経営計画の計算', () => {
  it('目標（900・3,200・8,000 人）は基本の見込みの ±10% に入る', () => {
    const y = ys(BASE);
    for (const yr of [2027, 2028, 2029]) expect(Math.abs(y[yr].paidEnd / TARGETS[yr] - 1)).toBeLessThan(0.1);
  });
  it('四半期の道しるべも、基本の見込みの ±10% に入る', () => {
    const rows = simulate(BASE);
    for (const [ym, v] of Object.entries(MILESTONES)) {
      const r = rows.find((x) => x.ym === ym);
      expect(Math.abs(r.paid / v - 1), ym).toBeLessThan(0.1);
    }
  });
  it('控えめ ＜ 基本 ＜ 強気 の順', () => {
    const [l, b, h] = ['low', 'base', 'high'].map((k) => ys(SCENARIOS[k])[2029].paidEnd);
    expect(l).toBeLessThan(b); expect(b).toBeLessThan(h);
  });
  it('どの見込みでも、手元の現金は 0 より下にならない（関門で費用を止める）', () => {
    for (const A of Object.values(SCENARIOS)) expect(simulate(A).minCash, A.name).toBeGreaterThan(0);
  });
  it('関門を通らなければ、次の年は費用を足さない計画（hold）に切り替わる', () => {
    const low = simulate(SCENARIOS.low);
    expect(low.gates[2027].ok).toBe(false);
    expect(low.find((r) => r.ym === '2028-06').plan).toBe('hold');
    const base = simulate(BASE);
    expect(base.gates[2027].ok).toBe(true); expect(base.gates[2028].ok).toBe(true);
  });
  it('控えめでも、1 年の赤字は ¥100 万まで（人と広告を足さないので）', () => {
    for (const o of Object.values(ys(SCENARIOS.low))) expect(o.profit).toBeGreaterThan(-1_000_000);
  });
  it('広告は、取る費用を 12 か月以内に取り戻せる年だけ増やす（それ以外は月 ¥10 万の試し）', () => {
    const rows = simulate(BASE);
    for (const y of [2028, 2029]) {
      const ok = paidAcquisition(BASE, y).paybackMonths <= BASE.adPaybackMax;
      const spend = rows.filter((r) => r.ym.startsWith(`${y}-`)).map((r) => r.adSpend);
      if (!ok) for (const s of spend) expect(s).toBeLessThanOrEqual(BASE.adTestYen);
    }
  });
  it('Android は 2027 年 9 月に有料 400 人以上のときだけ作る', () => {
    expect(simulate(BASE).androidOn).toBe(true);
    expect(simulate(SCENARIOS.low).androidOn).toBe(false);
  });
  it('Android を出さないと減る（月の比べ方のまちがいを防ぐ）', () => {
    const no = ys({ ...BASE, androidFrom: '2099-01' })[2029].paidEnd;
    expect(no).toBeLessThan(ys(BASE)[2029].paidEnd);
  });
  it('月額の 1 年後に残る割合は、日本の目安（26%）に近い', () => {
    const left = (1 - BASE.firstMonthChurn) * (1 - BASE.steadyChurn[2027]) ** 11;
    expect(left).toBeGreaterThan(0.2); expect(left).toBeLessThan(0.32);
  });
  it('生涯の利益は年額のほうが大きい', () => {
    const u = lifetimeValue(BASE, 2028);
    expect(u.ltvAnnual).toBeGreaterThan(u.ltvMonthly);
  });
  it('基本は 2027 年のうちに黒字の月が来る', () => {
    const be = breakEvenMonth(simulate(BASE));
    expect(be).toBeTruthy(); expect(be <= '2027-12').toBe(true);
  });
});

describe('責任者と予定', () => {
  const months = MONTHS.filter((m) => m >= '2026-12');
  it('どの責任者にも年の成果物があり、法人以外には毎月の決まった仕事がある', () => {
    for (const r of ROLES) {
      if (r.id !== 'b2b') expect(ROUTINES.some((x) => x.role === r.id), r.id).toBe(true);
      expect(ITEMS.some((x) => x.role === r.id && x.period === '2027'), r.id).toBe(true);
    }
  });
  it('オーナーが決まった仕事に使う時間は週 7 時間以内', () => {
    const h = ROUTINES.reduce((s, r) => s + r.owner, 0);
    expect(h).toBeGreaterThan(0); expect(h).toBeLessThanOrEqual(OWNER_WEEKLY_HOURS);
  });
  it('どの四半期にも、方針・SNS 統括・マーケ・開発・保守運用の成果物がある', () => {
    for (const y of [2027, 2028, 2029]) for (const q of [1, 2, 3, 4]) {
      for (const role of ['ceo', 'sns', 'mkt', 'dev', 'ops']) {
        const has = ITEMS.some((x) => x.role === role && (x.period === `${y}-Q${q}` || (isMonth(x.period) && quarterOf(x.period) === `${y}-Q${q}`)));
        if (!has) throw new Error(`${role} ${y}-Q${q} に成果物が無い`);
      }
    }
  });
  it('2027 年はどの月にも、決まった成果物がある', () => {
    for (const m of months.filter((x) => x <= '2027-12')) expect(ITEMS.some((x) => x.period === m), m).toBe(true);
  });
  it('成果物には責任者と終わりの基準がある', () => {
    for (const x of ITEMS) { expect(ROLES.some((r) => r.id === x.role)).toBe(true); expect(x.done).toBeTruthy(); }
  });
  it('方針の四半期の道しるべは、MILESTONES と同じ数', () => {
    for (const [ym, v] of Object.entries(MILESTONES)) {
      const q = quarterOf(ym);
      const it = ITEMS.find((x) => x.role === 'ceo' && x.period === q);
      expect(it?.done, q).toContain(`${v.toLocaleString('en-US')} 人`);
    }
  });
});
