import { describe, it, expect } from 'vitest';
import { BASE, SCENARIOS, simulate, yearly, lifetimeValue, paidAcquisition, MONTHS, breakEvenMonth, stressGrid } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, HOLD_ITEMS, quarterOf, isMonth, TARGETS, TARGET_SPLIT, MILESTONES, OWNER_WEEKLY_HOURS, REV_SHARE_TARGETS, ownerHoursOfMonth } from './schedule.mjs';

// 2026-11-22 オーナー「優秀なコンサルが何人読んでも納得する内容に」: 計画の数字は、この計算から出る（v4・点検の 3 回目を反映）
const ys = (A, o) => Object.fromEntries(yearly(simulate(A, o), A).map((x) => [x.year, x]));

describe('中期経営計画の計算', () => {
  it('目標（600・2,000・4,300 人）と、主に追う個人の目標は、基本の見込みの ±10% に入る', () => {
    const y = ys(BASE);
    for (const yr of [2027, 2028, 2029]) {
      expect(Math.abs(y[yr].paidEnd / TARGETS[yr] - 1), String(yr)).toBeLessThan(0.1);
      expect(Math.abs(y[yr].consumerEnd / TARGET_SPLIT[yr].consumer - 1), `個人 ${yr}`).toBeLessThan(0.1);
    }
  });
  it('専業になったあとで関門に落ちても、オーナーの報酬と外注は残り（足さないだけ）、人数は基本より少ない', () => {
    const r = simulate({ ...BASE, gates: { ...BASE.gates, 2028: { ...BASE.gates[2028], paid: 1e9 } } });
    expect(r.mode[2029]).toBe('freeze');
    const y29 = r.filter((x) => x.ym.startsWith('2029-'));
    expect(y29.every((x) => x.ownerPay > 0)).toBe(true);
    expect(r.find((x) => x.ym === '2029-12').paid).toBeLessThan(simulate(BASE).find((x) => x.ym === '2029-12').paid);
  });
  it('税引き後の利益には、法人化の前の個人の税も入る', () => {
    const y = ys(BASE);
    expect(y[2027].taxForYear).toBeGreaterThan(0);
  });
  it('四半期の道しるべも、基本の見込みの ±10% に入る', () => {
    const rows = simulate(BASE);
    for (const [ym, v] of Object.entries(MILESTONES)) expect(Math.abs(rows.find((x) => x.ym === ym).paid / v - 1), ym).toBeLessThan(0.1);
  });
  it('有料会員以外の売上の割合の目標（12 月の月の売上）は、計算の ±1.5 ポイントに入る', () => {
    const rows = simulate(BASE);
    for (const [y, v] of Object.entries(REV_SHARE_TARGETS)) { const d = rows.find((x) => x.ym === `${y}-12`); expect(Math.abs((d.b2bRevenue / d.revenue) * 100 - v), y).toBeLessThan(1.5); }
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
  it('2028 年 6 月の逆の決まり: 届かなければ 7 月から外注と広告を止め、オーナーの報酬は残す', () => {
    const r = simulate({ ...BASE, midChecks: [{ at: '2028-06', paid: 1e9 }] });
    const jul = r.find((x) => x.ym === '2028-07');
    expect(jul.plan).toBe('guard'); expect(jul.adSpend).toBe(0); expect(jul.ownerPay).toBeGreaterThan(0);
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
  it('オーナーの時間は、兼業の間（2026-12〜2028-03）のどの月も、使える時間の 8 割（週 14 時間 × 4.33 × 0.8＝月 約 48.5 時間）に収まる', () => {
    for (const m of months.filter((x) => x <= '2028-03')) { const o = ownerHoursOfMonth(m); expect(o.total, m).toBeLessThanOrEqual(o.planLimit); }
    expect(ROUTINES.reduce((s, r) => s + r.owner, 0)).toBeLessThanOrEqual(OWNER_WEEKLY_HOURS);
  });
  it('専業の間（2028-04〜2029-12）も、役割の時間と採用・引き継ぎを足して、どの月も週 40 時間の 8 割（月 約 139 時間）に収まる', () => {
    for (const m of MONTHS.filter((x) => x >= '2028-04' && x <= '2029-12')) { const o = ownerHoursOfMonth(m); expect(o.fulltime, m).toBe(true); expect(o.total, m).toBeLessThanOrEqual(o.planLimit); }
  });
  it('PdM の仕様は、開発が作る時期より前か同じ（つながり 1・Web の入口・年額の贈り物・AI と連携の有料化）', () => {
    const start = (p) => (p.length === 4 ? `${p}-01` : p.includes('Q') ? `${p.slice(0, 4)}-${String((Number(p.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}` : p);
    for (const k of ['つながり 1', 'Web の入口', '年額の贈り物', 'AI と連携']) {
      const first = (role) => ITEMS.filter((x) => x.role === role && x.period.length > 4 && x.title.includes(k)).map((x) => start(x.period)).sort()[0];
      expect(first('pdm'), `PdM ${k}`).toBeTruthy(); expect(first('dev'), `開発 ${k}`).toBeTruthy();
      expect(first('pdm') <= first('dev'), k).toBe(true);
    }
  });
  it('法人化の手続きは、お金と決まりだけが持つ（ほかの役割に同じ成果物を置かない）', () => {
    expect(ITEMS.filter((x) => /法人化の手続き|法人化・/.test(x.title)).every((x) => x.role === 'fin')).toBe(true);
  });
  it('2027 年末の関門に落ちて兼業のままの 2028 年も、どの月も 8 割に収まる', () => {
    for (const m of months.filter((x) => x.startsWith('2028-'))) { const o = ownerHoursOfMonth(m, { hold: true }); expect(o.total, m).toBeLessThanOrEqual(o.planLimit); }
    for (const r of ROLES) expect(HOLD_ITEMS.some((x) => x.role === r.id && x.period === '2028'), r.id).toBe(true);
  });
  it('兼業の間の成果物には、すべてオーナーの時間（h）が書いてある（0＝四半期の行に含むか AI だけ）', () => {
    const inWin = (p) => p === '2027' || p.startsWith('2027-') || p === '2026-12' || ['2028-01', '2028-02', '2028-03', '2028-Q1'].includes(p);
    for (const x of ITEMS.filter((i) => inWin(i.period))) expect(typeof x.h, `${x.role} ${x.period} ${x.title}`).toBe('number');
  });
  it('2027 年はどの月にも、決まった成果物がある', () => {
    for (const m of months.filter((x) => x <= '2027-12')) expect(ITEMS.some((x) => x.period === m), m).toBe(true);
  });
  it('終わりの基準は「・」で分けたどの項目も、数か、見て分かる物（文書・URL・公開・登記・記録・申請・内諾・入金・契約）で書く', () => {
    const ok = /[0-9]|（文書）|URL|Google Play に公開|の公開|登記|手順書|の記録|申請|内諾|入金|契約/;
    const pieces = (t) => { const out = []; let d = 0; let cur = ''; for (const c of t) { if (c === '（') d += 1; if (c === '）') d -= 1; if (c === '・' && d === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
    for (const x of [...ITEMS, ...HOLD_ITEMS]) { expect(ROLES.some((r) => r.id === x.role)).toBe(true); for (const p of pieces(x.done)) expect(ok.test(p), `${x.period} ${x.role}「${p}」`).toBe(true); }
  });
  it('後ろへ回してよい（flex）のは、日付の決まっていない仕事だけ', () => {
    for (const x of ITEMS.filter((i) => i.flex)) expect(/借入|関門|今年の読書|更新|法人化|登記|公開/.test(x.title), x.title).toBe(false);
  });
  it('2028 年 6 月に外注を止めたあと 2028 年末の関門にも落ちても、止めた外注は戻らない', () => {
    const r = simulate({ ...BASE, midChecks: [{ at: '2028-06', paid: 1e9 }], gates: { ...BASE.gates, 2028: { ...BASE.gates[2028], paid: 1e9 } } });
    expect(r.filter((x) => x.ym.startsWith('2029-')).every((x) => x.people - x.ownerPay <= BASE.supportYen + 1)).toBe(true);
  });
  it('Android の外注を見る時間が週 2 時間に増えても、決めておいた減らし方（SNS を減らす・flex の成果物を次へ回す）で 8 割に収まる', () => {
    for (const m of ['2027-10', '2027-11', '2027-12', '2028-01', '2028-02']) { const o = ownerHoursOfMonth(m, { busy: true }); expect(o.total, m).toBeLessThanOrEqual(o.planLimit); }
  });
  it('方針の四半期の道しるべは、MILESTONES と同じ数', () => {
    for (const [ym, v] of Object.entries(MILESTONES)) {
      const it2 = ITEMS.find((x) => x.role === 'ceo' && x.period === quarterOf(ym));
      expect(it2?.done, ym).toContain(`${v.toLocaleString('en-US')} 人`);
    }
  });
});
