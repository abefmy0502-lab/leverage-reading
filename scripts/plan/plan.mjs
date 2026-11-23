#!/usr/bin/env node
// 中期経営計画の数字を出す（node scripts/plan/plan.mjs）。--json で company/plan-model/plan.json に書き出す（ダッシュボードと文書が使う）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { SCENARIOS, simulate, yearly, lifetimeValue, paidAcquisition, sensitivity, breakEvenMonth, stressGrid, BASE } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, TARGETS, MILESTONES, DEPARTMENTS, ownerHoursOfMonth } from './schedule.mjs';

const M = (v) => Math.round(v / 1e4);
const n = (v) => Math.round(v).toLocaleString('ja-JP');
const out = { generatedAt: new Date().toISOString().slice(0, 10), targets: TARGETS, milestones: MILESTONES, scenarios: {} };
const QE = ['03', '06', '09', '12'];

for (const [key, A] of Object.entries(SCENARIOS)) {
  const rows = simulate(A); const ys = yearly(rows, A);
  out.scenarios[key] = {
    name: A.name, gates: rows.gates, events: rows.events, hired: rows.hired, androidOn: rows.androidOn, incorporatedAt: rows.incorporatedAt,
    minCashMan: M(rows.minCash), minCashYm: rows.minCashYm, breakEven: breakEvenMonth(rows),
    years: ys.map((o) => ({ year: o.year, plan: o.plan, paidEnd: Math.round(o.paidEnd), consumerEnd: Math.round(o.consumerEnd), seatsEnd: o.seatsEnd, companiesEnd: o.companiesEnd, installs: Math.round(o.installs), revenueMan: M(o.revenue), mrrEndMan: M(o.mrrEnd), feeMan: M(o.fee), refundsMan: M(o.refunds), aiMan: M(o.ai), peopleMan: M(o.people), marketingMan: M(o.marketing), adMan: M(o.adSpend), infraMan: M(o.infra), otherMan: M(o.other), profitMan: M(o.profit), taxMan: M(o.taxForYear), afterTaxMan: M(o.profitAfterTax), marketOwnerMan: M(o.profitMarketOwner), cashEndMan: M(o.cashEnd), cashAfterTaxMan: M(o.cashAfterTaxDue), loanEndMan: M(o.loanEnd) })),
    quarters: rows.filter((r) => r.inPlan && QE.includes(r.ym.slice(5))).map((r) => ({ ym: r.ym, paid: Math.round(r.paid), consumer: Math.round(r.consumerPaid), seats: r.seats, cashMan: M(r.cash), ch: r.ch, android: r.android, installs: r.installs })),
    cash: rows.filter((r) => r.inPlan).map((r) => ({ ym: r.ym, cashMan: M(r.cash), plan: r.plan })),
  };
  // 2026-11-22 オーナー「ダウンロード数・アクティブ会員数（無料・有料）・アクティブ有料会員数・無料会員数・売上・粗利の目標と実数を出したい」
  // 月ごとの目標（基本の見込みだけ）。ダッシュボードの「売上と粗利」と同じ数え方にそろえる:
  // 売上＝税込・月あたり（年額は月割り）／粗利＝手取り（税抜 − ストアの手数料 − 返金）− AI の原価 − 固定費（Apple ¥1,082・Claude Max）
  const FIXED = (A.claudeMaxYen ?? 0) + 1082;
  if (key === 'base') out.kpi = rows.filter((r) => r.inPlan).map((r) => ({ ym: r.ym, dl: Math.round(r.installs), active: Math.round(r.freeActive + r.paid), paid: Math.round(r.paid), free: Math.round(r.freeActive), revenue: Math.round(r.revenue * 1.1), gross: Math.round(r.revenue - r.fee - r.refunds - r.ai - FIXED) }));
  if (!process.argv.includes('--json')) {
    console.log(`\n■ ${A.name}`);
    console.log(`関門 ${JSON.stringify(rows.gates)}\nAndroid ${rows.androidOn}  法人化 ${rows.incorporatedAt}  社員 ${rows.hired.join('・') || 'なし'}  いちばん少ない現金 ${M(rows.minCash)} 万（${rows.minCashYm}）  黒字の月 ${breakEvenMonth(rows)}`);
    for (const e of rows.events) console.log(`  ${e.ym} ${e.what}`);
    console.log('年      年末の有料（個人＋席）  入れた人   売上(万)  利益(万)  市場の報酬なら(万)  年末の現金(万)  借入の残り(万)  計画');
    for (const o of ys) console.log(`${o.year}  ${n(o.paidEnd).padStart(6)}（${n(o.consumerEnd)}＋${n(o.seatsEnd)}）  ${n(o.installs).padStart(9)}  ${String(M(o.revenue)).padStart(7)}  ${String(M(o.profit)).padStart(7)}  ${String(M(o.profitMarketOwner)).padStart(9)}  ${String(M(o.cashEnd)).padStart(9)}  ${String(M(o.loanEnd)).padStart(6)}  ${o.plan}`);
  }
}
out.unit = [2027, 2028, 2029].map((y) => { const l = lifetimeValue(BASE, y); const ls = lifetimeValue(BASE, y, { strict: true }); const a = paidAcquisition(BASE, y); const as = paidAcquisition(BASE, y, { strict: true }); return { year: y, monthlyMonths: Math.round(l.monthlyMonths * 10) / 10, ltvMonthly: Math.round(l.ltvMonthly), ltvAnnual: Math.round(l.ltvAnnual), ltv: Math.round(l.blended), ltvStrict: Math.round(ls.blended), cac: Math.round(a.cac), cacStrict: Math.round(as.cac), ratio: Math.round(a.ratio * 10) / 10, paybackMonths: a.paybackMonths, paybackStrict: as.paybackMonths }; });
out.sensitivity = sensitivity(BASE).map((s) => ({ label: s.label, paidEnd: Math.round(s.paidEnd), dPaid: Math.round(s.dPaid), profitMan: M(s.profit), profitNoGatesMan: M(s.profitNoGates), minCashMan: M(s.minCash), marketOwnerMan: M(s.profitMarketOwner) }));
const grid = stressGrid(BASE); out.stress = { cases: grid.length, negative: grid.filter((x) => x.minCash < 0).length, worstMan: M(Math.min(...grid.map((x) => x.minCash))) };
out.ownerHours = ['2026-12', ...Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}`), '2028-01', '2028-02', '2028-03'].map((ym) => { const o = ownerHoursOfMonth(ym); return { ym, routine: Math.round(o.routine * 10) / 10, items: Math.round(o.items * 10) / 10, total: Math.round(o.total * 10) / 10, limit: Math.round(o.planLimit * 10) / 10, available: Math.round(o.limit * 10) / 10 }; });
out.roles = ROLES; out.routines = ROUTINES; out.items = ITEMS;
// 部署の目標の数字（基本の見込みから年ごとに）
{
  const rows = simulate(BASE).filter((r) => r.inPlan); const ys2 = Object.fromEntries(yearly(simulate(BASE), BASE).map((o) => [o.year, o]));
  const yr = (y) => rows.filter((r) => r.ym.startsWith(`${y}-`)); const dec = (y) => rows.find((r) => r.ym === `${y}-12`);
  const sumCh = (y, k) => Math.round(yr(y).reduce((s2, r) => s2 + (r.ch?.[k] || 0), 0));
  const FIXED = (BASE.claudeMaxYen ?? 0) + 1082;
  const calc = {
    paidEnd: (y) => TARGETS[y], grossDec: (y) => { const d = dec(y); return Math.round(d.revenue - d.fee - d.refunds - d.ai - FIXED); }, cashEnd: (y) => Math.round(ys2[y].cashEnd / 1e4),
    installsYear: (y) => Math.round(yr(y).reduce((s2, r) => s2 + r.installs, 0)), dlDec: (y) => Math.round(dec(y).installs), chSearch: (y) => sumCh(y, 'search'), chSns: (y) => sumCh(y, 'sns'), chCollab: (y) => sumCh(y, 'collab'),
    activeDec: (y) => Math.round(dec(y).freeActive + dec(y).paid), revenueDec: (y) => Math.round(dec(y).revenue * 1.1), b2bRevenueDec: (y) => Math.round(dec(y).b2bRevenue * 1.1), renew: (y) => Math.round(BASE.renew[y] * 100), installToPaid: (y) => Math.round(BASE.installToPaid[y] * 1000) / 10, steadyChurn: (y) => Math.round(BASE.steadyChurn[y] * 100), revShare: (y) => Math.round((dec(y).b2bRevenue / dec(y).revenue) * 1000) / 10, seatsEnd: (y) => dec(y).seats, companiesEnd: (y) => dec(y).companies,
  };
  out.departments = DEPARTMENTS.map((d) => ({ ...d, metrics: d.metrics.map((m) => ({ label: m.label, yen: !!m.yen, kpi: m.kpi || null, values: Object.fromEntries([2027, 2028, 2029].map((y) => [y, m.fixed ? m.fixed[y] : calc[m.kind](y)])) })) }));
}
if (process.argv.includes('--json')) {
  mkdirSync('company/plan-model', { recursive: true });
  writeFileSync('company/plan-model/plan.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log('✓ company/plan-model/plan.json');
} else {
  console.log('\n■ 1 人の生涯の利益と広告で取る費用（基本・ふつう／きびしめ）');
  for (const u of out.unit) console.log(`${u.year}  生涯の利益 ¥${n(u.ltv)}／¥${n(u.ltvStrict)}  広告で 1 人 ¥${n(u.cac)}／¥${n(u.cacStrict)}  回収 ${u.paybackMonths}／${u.paybackStrict} か月`);
  console.log('\n■ 感度（基本から 1 つだけ動かす・2029 年）');
  for (const s of out.sensitivity) console.log(`${s.label}  年末の有料 ${n(s.paidEnd)}（${s.dPaid >= 0 ? '+' : ''}${n(s.dPaid)}）  利益 ${s.profitMan} 万（止めない ${s.profitNoGatesMan} 万）  いちばん少ない現金 ${s.minCashMan} 万`);
  console.log(`\n■ 網の目の点検 ${out.stress.cases} 通り: 現金がマイナス ${out.stress.negative} 通り・いちばん少ない現金 ${out.stress.worstMan} 万`);
  console.log('\n■ オーナーの時間（月・時間）'); for (const o of out.ownerHours) console.log(`${o.ym}  決まった仕事 ${o.routine}＋成果物 ${o.items}＝${o.total}（予定の上限 ${o.limit}・使える時間 ${o.available}）`);
}
