import { describe, it, expect } from 'vitest';
import { BASE, SCENARIOS, simulate, yearly, lifetimeValue, paidAcquisition, MONTHS, breakEvenMonth, stressGrid } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, quarterOf, isMonth, TARGETS, MILESTONES, OWNER_WEEKLY_HOURS, ownerHoursOfMonth } from './schedule.mjs';

// 2026-11-22 オーナー「優秀なコンサルが何人読んでも納得する内容に」: 計画の数字は、この計算から出る（v3・点検 3 人の 2 回目を反映）
const ys = (A, o) => Object.fromEntries(yearly(simulate(A, o), A).map((x) => [x.year, x]));

describe('中期経営計画の計算', () => {
  it('目標（600・2,000・5,000 人）は基本の見込みの ±10% に入る', () => {
    const y = ys(BASE);
    for (const yr of [2027, 2028, 2029]) expect(Math.abs(y[yr].paidEnd / TARGETS[yr] - 1), String(yr)).toBeLessThan(0.1);
  });
  it('四半期の道しるべも、基本の見込みの ±10% に入る', () => {
    const rows = simulate(BASE);
    for (const [ym, v] of Object.entries(MILESTONES)) expect(Math.abs(rows.find((x) => x.ym === ym).paid / v - 1), ym).toBeLessThan(0.1);
  });
  it('控えめ ＜ 基本 ＜ 強気 の順', () => {
    const [l, b, h] = ['low', 'base', 'high'].map((k) => ys(SCENARIOS[k])[2029].paidEnd);
    expect(l).toBeLessThan(b); expect(b).toBeLessThan(h);
  });
  it('網の目（有料になる率と流入を 0.5〜1.3 倍・無料の人の AI ×1 と ×3＝162 通り）のどれでも、現金は 0 を下回らない', () => {
    const bad = stressGrid(BASE).filter((x) => x.minCash < 0);
    expect(bad.map((x) => `${x.cv}x${x.og} ai${x.ai} ${x.minCashYm}`)).toEqual([]);
  });
  it('お金を足す計画のほうが、止める計画より伸びる（費用と伸びがつながっている）', () => {
    const pass = simulate(BASE, { noGates: true }).find((x) => x.ym === '2029-12').paid;
    const hold = simulate({ ...BASE, gates: { ...BASE.gates, 2027: { ...BASE.gates[2027], paid: 1e9 } } }).find((x) => x.ym === '2029-12').paid;
    expect(pass).toBeGreaterThan(hold * 1.3);
  });
  it('関門を通らなければ、次の年は止める計画（hold）に切り替わる', () => {
    const low = simulate(SCENARIOS.low);
    expect(low.gates[2027].ok).toBe(false);
    expect(low.find((r) => r.ym === '2028-06').plan).toBe('hold');
    const base = simulate(BASE);
    expect(base.gates[2027].ok).toBe(true); expect(base.gates[2028].ok).toBe(true);
  });
  it('2028 年 6 月の逆の決まり: 道しるべの 8 割に届かなければ、7 月から止める', () => {
    const r = simulate({ ...BASE, midChecks: [{ at: '2028-06', paid: 1e9 }] });
    expect(r.find((x) => x.ym === '2028-07').plan).toBe('hold');
  });
  it('社員は、その月の現金が 6 か月分の決まった支出に届くときだけ入れる', () => {
    const r = simulate({ ...BASE, hireCashMonths: 1e6 });
    expect(r.hired).toEqual([]);
  });
  it('借入は 2027 年末の関門を通ったときだけ', () => {
    expect(simulate(BASE).find((x) => x.ym === '2028-01').loanFlow).toBeGreaterThan(0);
    expect(simulate(SCENARIOS.low).find((x) => x.ym === '2028-01').loanFlow).toBe(0);
  });
  it('広告は、取る費用を 12 か月以内に取り戻せる年だけ増やす（それ以外は月 ¥10 万の試し）', () => {
    const rows = simulate(BASE);
    for (const y of [2028, 2029]) if (paidAcquisition(BASE, y).paybackMonths > BASE.adPaybackMax) for (const r of rows.filter((x) => x.ym.startsWith(`${y}-`))) expect(r.adSpend).toBeLessThanOrEqual(BASE.adTestYen);
  });
  it('きびしめの生涯の利益は、ふつうより小さい', () => {
    expect(lifetimeValue(BASE, 2028, { strict: true }).blended).toBeLessThan(lifetimeValue(BASE, 2028).blended);
  });
  it('Android を出さないと減る', () => {
    expect(ys({ ...BASE, androidGate: { ...BASE.androidGate, paid: 1e9 } })[2029].paidEnd).toBeLessThan(ys(BASE)[2029].paidEnd);
  });
  it('月額の 1 年後に残る割合は、日本の目安（26%）に近い', () => {
    const left = (1 - BASE.firstMonthChurn) * (1 - BASE.steadyChurn[2027]) ** 11;
    expect(left).toBeGreaterThan(0.2); expect(left).toBeLessThan(0.32);
  });
  it('基本は 2027 年のうちに黒字の月が来る', () => {
    const be = breakEvenMonth(simulate(BASE));
    expect(be).toBeTruthy(); expect(be <= '2027-12').toBe(true);
  });
});

describe('責任者と予定', () => {
  const months = MONTHS.filter((m) => m >= '2026-12');
  it('どの責任者にも、3 年ぶんの年の成果物と全部の四半期の成果物がある（法人は 2027-Q3 から）', () => {
    for (const r of ROLES) {
      for (const y of ['2027', '2028', '2029']) expect(ITEMS.some((x) => x.role === r.id && x.period === y), `${r.id} ${y}`).toBe(true);
      for (const y of [2027, 2028, 2029]) for (const q of [1, 2, 3, 4]) {
        if (r.id === 'b2b' && y === 2027 && q < 3) continue;
        const has = ITEMS.some((x) => x.role === r.id && (x.period === `${y}-Q${q}` || (isMonth(x.period) && quarterOf(x.period) === `${y}-Q${q}`)));
        if (!has) throw new Error(`${r.id} ${y}-Q${q} に成果物が無い`);
      }
    }
  });
  it('法人以外の責任者には、毎月の決まった仕事がある', () => {
    for (const r of ROLES) if (r.id !== 'b2b') expect(ROUTINES.some((x) => x.role === r.id), r.id).toBe(true);
  });
  it('オーナーの時間は、2027 年のどの月も週 6.5 時間（月 約 28 時間）に収まる', () => {
    for (const m of months.filter((x) => x <= '2027-12')) { const o = ownerHoursOfMonth(m); expect(o.total, m).toBeLessThanOrEqual(o.limit); }
    expect(ROUTINES.reduce((s, r) => s + r.owner, 0)).toBeLessThanOrEqual(OWNER_WEEKLY_HOURS);
  });
  it('2027 年はどの月にも、決まった成果物がある', () => {
    for (const m of months.filter((x) => x <= '2027-12')) expect(ITEMS.some((x) => x.period === m), m).toBe(true);
  });
  it('成果物には責任者と終わりの基準がある。あいまいな基準（「素材」「記事」だけ等）を使わない', () => {
    const vague = /^(素材|記事|共有の数|判断の記録|試しの結果|更新|相談の満足の実測)$/;
    for (const x of ITEMS) { expect(ROLES.some((r) => r.id === x.role)).toBe(true); expect(x.done).toBeTruthy(); expect(vague.test(x.done), `${x.period} ${x.title}`).toBe(false); }
  });
  it('方針の四半期の道しるべは、MILESTONES と同じ数', () => {
    for (const [ym, v] of Object.entries(MILESTONES)) {
      const it2 = ITEMS.find((x) => x.role === 'ceo' && x.period === quarterOf(ym));
      expect(it2?.done, ym).toContain(`${v.toLocaleString('en-US')} 人`);
    }
  });
});
