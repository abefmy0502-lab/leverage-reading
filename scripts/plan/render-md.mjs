#!/usr/bin/env node
// 計画の文書の「数字」と「予定」の節を、計算（model.mjs）と予定（schedule.mjs）から書き直す。手で写さない。
//   node scripts/plan/render-md.mjs   → company/mid-term-plan-2027-2029.md の <!-- plan:XXX --> 〜 <!-- /plan:XXX --> を差し替える
import { readFileSync, writeFileSync } from 'node:fs';
import { SCENARIOS, BASE, simulate, yearly, lifetimeValue, paidAcquisition, sensitivity } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, quarterOf } from './schedule.mjs';

const DOC = 'company/mid-term-plan-2027-2029.md';
const n = (v) => Math.round(v).toLocaleString('ja-JP');
const man = (v) => `${Math.round(v / 1e4) < 0 ? '−' : ''}¥${Math.abs(Math.round(v / 1e4)).toLocaleString('ja-JP')} 万`;
const roleShort = (id) => ROLES.find((r) => r.id === id)?.short || id;
const ys = (A) => Object.fromEntries(yearly(simulate(A)).map((o) => [o.year, o]));

const blocks = {};

blocks.scenarios = (() => {
  const S = Object.fromEntries(Object.entries(SCENARIOS).map(([k, A]) => [k, ys(A)]));
  const row = (label, f) => `| ${label} | ${[2027, 2028, 2029].map((y) => `${f(S.low[y])} ／ **${f(S.base[y])}** ／ ${f(S.high[y])}`).join(' | ')} |`;
  return [
    '| （控えめ ／ **基本** ／ 強気） | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    row('年末の有料（法人の席を含む）', (o) => n(o.paidEnd)),
    row('　うち法人の席', (o) => n(o.seatsEnd)),
    row('入れた人（1 年）', (o) => n(o.installs)),
    row('売上（税抜・1 年）', (o) => man(o.revenue)),
    row('利益（1 年）', (o) => man(o.profit)),
    row('年末の月の売上', (o) => man(o.mrrEnd)),
  ].join('\n');
})();

blocks.pl = (() => {
  const y = ys(BASE);
  const r = (label, f, bold) => `| ${bold ? `**${label}**` : label} | ${[2027, 2028, 2029].map((k) => (bold ? `**${man(f(y[k]))}**` : man(f(y[k])))).join(' | ')} |`;
  return [
    '| 基本の見込み | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    r('売上（税抜）', (o) => o.revenue),
    r('App Store・Stripe の手数料', (o) => -o.fee),
    r('AI の原価（有料と無料の人）', (o) => -o.ai),
    r('人（オーナーの報酬・外注・社員）', (o) => -o.people),
    r('広告・制作', (o) => -o.marketing),
    r('サーバー', (o) => -o.infra),
    r('その他（Apple・税理士・道具）', (o) => -o.other),
    r('利益', (o) => o.profit, true),
  ].join('\n');
})();

blocks.unit = (() => {
  const rows = [2027, 2028, 2029].map((y) => ({ y, l: lifetimeValue(BASE, y), a: paidAcquisition(BASE, y) }));
  return [
    '| 基本 | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    `| 月額の人が続く月数（平均） | ${rows.map((x) => `${x.l.monthlyMonths.toFixed(1)} か月`).join(' | ')} |`,
    `| 生涯の利益（月額） | ${rows.map((x) => `¥${n(x.l.ltvMonthly)}`).join(' | ')} |`,
    `| 生涯の利益（年額） | ${rows.map((x) => `¥${n(x.l.ltvAnnual)}`).join(' | ')} |`,
    `| **生涯の利益（半々）** | ${rows.map((x) => `**¥${n(x.l.blended)}**`).join(' | ')} |`,
    `| 広告で有料 1 人を取る費用 | ${rows.map((x) => `¥${n(x.a.cac)}`).join(' | ')} |`,
    `| 生涯の利益 ÷ 取る費用 | ${rows.map((x) => `${x.a.ratio.toFixed(1)} 倍`).join(' | ')} |`,
    `| 取る費用を取り戻す月数 | ${rows.map((x) => `${x.a.paybackMonths.toFixed(1)} か月`).join(' | ')} |`,
  ].join('\n');
})();

blocks.sensitivity = (() => [
  '| 前提を 1 つだけ悪くすると（基本から） | 2029 年末の有料 | 2029 年の利益 |',
  '|---|---|---|',
  ...sensitivity(BASE).map((s) => `| ${s.label} | ${n(s.paidEnd)}（${s.dPaid >= 0 ? '+' : '−'}${n(Math.abs(s.dPaid))}） | ${man(s.profit)}（${s.dProfit >= 0 ? '+' : '−'}${n(Math.abs(s.dProfit / 1e4))} 万） |`),
].join('\n'))();

blocks.roles = (() => [
  '| 責任者 | 受け持つこと | 見る数字 | いま | 人に渡す時期 |',
  '|---|---|---|---|---|',
  ...ROLES.map((r) => `| **${r.name}** | ${r.mission} | ${r.kpi} | ${r.now} | ${r.later} |`),
].join('\n'))();

blocks.routines = (() => [
  '| 責任者 | 毎月の決まった仕事 | 終わりの基準 |',
  '|---|---|---|',
  ...ROUTINES.map((r) => `| ${roleShort(r.role)} | ${r.title} | ${r.done} |`),
].join('\n'))();

const table = (periods, label) => {
  const order = ROLES.map((r) => r.id);
  const lines = [`| ${label} | 責任者 | やること | 終わりの基準 |`, '|---|---|---|---|'];
  for (const p of periods) {
    const its = ITEMS.filter((x) => x.period === p).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    its.forEach((x, i) => lines.push(`| ${i === 0 ? `**${p}**` : ''} | ${roleShort(x.role)} | ${x.title} | ${x.done} |`));
  }
  return lines.join('\n');
};
blocks.years = table(['2027', '2028', '2029'], '年');
blocks.quarters = table(['2027-Q1', '2027-Q2', '2027-Q3', '2027-Q4', '2028-Q1', '2028-Q2', '2028-Q3', '2028-Q4', '2029-Q1', '2029-Q2', '2029-Q3', '2029-Q4'], '四半期');
const months = [...new Set(ITEMS.filter((x) => x.period.length === 7).map((x) => x.period))].sort();
blocks.months = table(months, '月');
void quarterOf;

let doc = readFileSync(DOC, 'utf8');
for (const [k, body] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- plan:${k} -->)[\\s\\S]*?(<!-- /plan:${k} -->)`);
  if (!re.test(doc)) { console.error(`✗ ${DOC} に <!-- plan:${k} --> 〜 <!-- /plan:${k} --> がありません`); process.exitCode = 1; continue; }
  doc = doc.replace(re, `$1\n${body}\n$2`);
}
writeFileSync(DOC, doc);
console.log(`✓ ${DOC} の数字と予定を、計算と予定のデータから書き直しました`);
