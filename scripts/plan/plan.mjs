#!/usr/bin/env node
// 中期経営計画の数字を出す（node scripts/plan/plan.mjs）。--json で company/plan-model/plan.json に書き出す（ダッシュボードと文書が使う）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { SCENARIOS, simulate, yearly, lifetimeValue, paidAcquisition, sensitivity, breakEvenMonth, BASE } from './model.mjs';
import { ROLES, ROUTINES, ITEMS } from './schedule.mjs';

const man = (v) => `${Math.round(v / 10000).toLocaleString('ja-JP')}`;
const n = (v) => Math.round(v).toLocaleString('ja-JP');
const out = { generatedAt: new Date().toISOString().slice(0, 10), scenarios: {} };

for (const [key, A] of Object.entries(SCENARIOS)) {
  const rows = simulate(A); const ys = yearly(rows);
  out.scenarios[key] = {
    name: A.name,
    gates: rows.gates, androidOn: rows.androidOn, minCashMan: Math.round(rows.minCash / 1e4), minCashYm: rows.minCashYm, breakEven: breakEvenMonth(rows),
    years: ys.map((o) => ({ year: o.year, plan: o.plan, paidEnd: Math.round(o.paidEnd), consumerEnd: Math.round(o.consumerEnd), seatsEnd: o.seatsEnd, companiesEnd: o.companiesEnd, installs: Math.round(o.installs), newPaid: Math.round(o.newPaid), revenueMan: Math.round(o.revenue / 1e4), mrrEndMan: Math.round(o.mrrEnd / 1e4), feeMan: Math.round(o.fee / 1e4), refundsMan: Math.round(o.refunds / 1e4), aiMan: Math.round(o.ai / 1e4), peopleMan: Math.round(o.people / 1e4), marketingMan: Math.round(o.marketing / 1e4), adMan: Math.round(o.adSpend / 1e4), infraMan: Math.round(o.infra / 1e4), otherMan: Math.round(o.other / 1e4), profitMan: Math.round(o.profit / 1e4), taxMan: Math.round(o.corpTax / 1e4), afterTaxMan: Math.round(o.profitAfterTax / 1e4), ownerMarketMan: Math.round((o.profit - (o.year === 2027 ? BASE.ownerMarketPayYen * 12 : 0)) / 1e4), cashEndMan: Math.round(o.cashEnd / 1e4) })),
    quarters: rows.filter((r) => r.inPlan && ['03', '06', '09', '12'].includes(r.ym.slice(5))).map((r) => ({ ym: r.ym, paid: Math.round(r.paid), consumer: Math.round(r.consumerPaid), seats: r.seats })),
    cash: rows.filter((r) => r.inPlan).map((r) => ({ ym: r.ym, cashMan: Math.round(r.cash / 1e4) })),
  };
  if (!process.argv.includes('--json')) {
    console.log(`\n■ ${A.name}`);
    console.log(`関門 ${JSON.stringify(rows.gates)}  Android ${rows.androidOn}  いちばん少ない現金 ${man(rows.minCash)} 万（${rows.minCashYm}）  黒字の月 ${breakEvenMonth(rows)}`);
    console.log('年      年末の有料（個人＋席）  入れた人   売上(万)  利益(万)  税(万)  年末の現金(万)  費用の計画');
    for (const o of ys) console.log(`${o.year}  ${n(o.paidEnd).padStart(6)}（${n(o.consumerEnd)}＋${n(o.seatsEnd)}）  ${n(o.installs).padStart(9)}  ${man(o.revenue).padStart(7)}  ${man(o.profit).padStart(7)}  ${man(o.corpTax).padStart(5)}  ${man(o.cashEnd).padStart(7)}  ${o.plan}`);
  }
}
const ltv = [2027, 2028, 2029].map((y) => ({ year: y, ...lifetimeValue(BASE, y), ...paidAcquisition(BASE, y) }));
out.unit = ltv.map((u) => ({ year: u.year, ltvMonthly: Math.round(u.ltvMonthly), ltvAnnual: Math.round(u.ltvAnnual), ltv: Math.round(u.blended), cac: Math.round(u.cac), ratio: Math.round(u.ratio * 10) / 10, paybackMonths: Math.round(u.paybackMonths * 10) / 10 }));
out.sensitivity = sensitivity(BASE).map((s) => ({ label: s.label, paidEnd: Math.round(s.paidEnd), dPaid: Math.round(s.dPaid), profitMan: Math.round(s.profit / 1e4), profitNoGatesMan: Math.round(s.profitNoGates / 1e4) }));
out.roles = ROLES; out.routines = ROUTINES; out.items = ITEMS;
if (process.argv.includes('--json')) {
  mkdirSync('company/plan-model', { recursive: true });
  writeFileSync('company/plan-model/plan.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log('✓ company/plan-model/plan.json');
} else {
  console.log('\n■ 1 人の生涯の利益と広告で取る費用（基本）');
  for (const u of out.unit) console.log(`${u.year}  生涯の利益 ¥${n(u.ltv)}（月額 ¥${n(u.ltvMonthly)}・年額 ¥${n(u.ltvAnnual)}）  広告で 1 人 ¥${n(u.cac)}  比 ${u.ratio}  回収 ${u.paybackMonths} か月`);
  console.log('\n■ 感度（基本から 1 つだけ動かす・2029 年）');
  for (const s of out.sensitivity) console.log(`${s.label}  年末の有料 ${n(s.paidEnd)}（${s.dPaid >= 0 ? '+' : ''}${n(s.dPaid)}）  利益（関門で止める）${n(s.profitMan)} 万・（止めない）${n(s.profitNoGatesMan)} 万`);
}
