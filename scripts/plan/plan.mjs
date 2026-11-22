#!/usr/bin/env node
// 中期経営計画の数字を出す（node scripts/plan/plan.mjs）。--json で company/plan-model/plan.json に書き出す（ダッシュボードと文書が使う）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { SCENARIOS, simulate, yearly, lifetimeValue, paidAcquisition, sensitivity, BASE } from './model.mjs';
import { ROLES, ROUTINES, ITEMS } from './schedule.mjs';

const man = (v) => `${Math.round(v / 10000).toLocaleString('ja-JP')}`;
const n = (v) => Math.round(v).toLocaleString('ja-JP');
const out = { generatedAt: new Date().toISOString().slice(0, 10), scenarios: {} };

for (const [key, A] of Object.entries(SCENARIOS)) {
  const rows = simulate(A); const ys = yearly(rows);
  out.scenarios[key] = {
    name: A.name,
    years: ys.map((o) => ({ year: o.year, paidEnd: Math.round(o.paidEnd), seatsEnd: o.seatsEnd, companiesEnd: o.companiesEnd, installs: Math.round(o.installs), newPaid: Math.round(o.newPaid), revenueMan: Math.round(o.revenue / 1e4), mrrEndMan: Math.round(o.mrrEnd / 1e4), feeMan: Math.round(o.fee / 1e4), aiMan: Math.round(o.ai / 1e4), peopleMan: Math.round(o.people / 1e4), marketingMan: Math.round(o.marketing / 1e4), infraMan: Math.round(o.infra / 1e4), otherMan: Math.round(o.other / 1e4), profitMan: Math.round(o.profit / 1e4) })),
    quarters: rows.filter((r) => ['03', '06', '09', '12'].includes(r.ym.slice(5))).map((r) => ({ ym: r.ym, paid: Math.round(r.paid) })),
  };
  if (!process.argv.includes('--json')) {
    console.log(`\n■ ${A.name}`);
    console.log('年      年末の有料  うち法人  入れた人   新しい有料  売上(万)  利益(万)  年末の月の売上(万)');
    for (const o of ys) console.log(`${o.year}  ${n(o.paidEnd).padStart(8)}  ${n(o.seatsEnd).padStart(7)}  ${n(o.installs).padStart(9)}  ${n(o.newPaid).padStart(9)}  ${man(o.revenue).padStart(7)}  ${man(o.profit).padStart(7)}  ${man(o.mrrEnd).padStart(7)}`);
  }
}
const ltv = [2027, 2028, 2029].map((y) => ({ year: y, ...lifetimeValue(BASE, y), ...paidAcquisition(BASE, y) }));
out.unit = ltv.map((u) => ({ year: u.year, ltvMonthly: Math.round(u.ltvMonthly), ltvAnnual: Math.round(u.ltvAnnual), ltv: Math.round(u.blended), cac: Math.round(u.cac), ratio: Math.round(u.ratio * 10) / 10, paybackMonths: Math.round(u.paybackMonths * 10) / 10 }));
out.sensitivity = sensitivity(BASE).map((s) => ({ label: s.label, paidEnd: Math.round(s.paidEnd), dPaid: Math.round(s.dPaid), profitMan: Math.round(s.profit / 1e4), dProfitMan: Math.round(s.dProfit / 1e4) }));
out.roles = ROLES; out.routines = ROUTINES; out.items = ITEMS;
if (process.argv.includes('--json')) {
  mkdirSync('company/plan-model', { recursive: true });
  writeFileSync('company/plan-model/plan.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log('✓ company/plan-model/plan.json');
} else {
  console.log('\n■ 1 人の生涯の利益と広告で取る費用（基本）');
  for (const u of out.unit) console.log(`${u.year}  生涯の利益 ¥${n(u.ltv)}（月額 ¥${n(u.ltvMonthly)}・年額 ¥${n(u.ltvAnnual)}）  広告で 1 人 ¥${n(u.cac)}  比 ${u.ratio}  回収 ${u.paybackMonths} か月`);
  console.log('\n■ 感度（基本から 1 つだけ動かす・2029 年）');
  for (const s of out.sensitivity) console.log(`${s.label.padEnd(20)}  年末の有料 ${n(s.paidEnd)}（${s.dPaid >= 0 ? '+' : ''}${n(s.dPaid)}）  利益 ${n(s.profitMan)} 万（${s.dProfitMan >= 0 ? '+' : ''}${n(s.dProfitMan)}）`);
}
