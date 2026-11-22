#!/usr/bin/env node
// 計画の文書の「数字」と「予定」の節を、計算（model.mjs）と予定（schedule.mjs）から書き直す。手で写さない。
//   node scripts/plan/render-md.mjs   → company/mid-term-plan-2027-2029.md の <!-- plan:XXX --> 〜 <!-- /plan:XXX --> を差し替える
import { readFileSync, writeFileSync } from 'node:fs';
import { SCENARIOS, BASE, simulate, yearly, lifetimeValue, paidAcquisition, sensitivity, breakEvenMonth } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, quarterOf, isMonth, OWNER_WEEKLY_HOURS } from './schedule.mjs';

const DOC = 'company/mid-term-plan-2027-2029.md';
const n = (v) => Math.round(v).toLocaleString('ja-JP');
const man = (v) => { const k = Math.round(v / 1e4); return `${k < 0 ? '−' : ''}¥${Math.abs(k).toLocaleString('ja-JP')} 万`; };
const dman = (v) => { const k = Math.round(v / 1e4); return `${k >= 0 ? '+' : '−'}${Math.abs(k).toLocaleString('ja-JP')} 万`; };
const roleShort = (id) => ROLES.find((r) => r.id === id)?.short || id;
const runs = Object.fromEntries(Object.entries(SCENARIOS).map(([k, A]) => [k, simulate(A)]));
const ys = (k) => Object.fromEntries(yearly(runs[k]).map((o) => [o.year, o]));
const S = { low: ys('low'), base: ys('base'), high: ys('high') };
const planName = (p) => (p === 'pass' ? '足す' : '止める');
const blocks = {};

blocks.scenarios = (() => {
  const row = (label, f) => `| ${label} | ${[2027, 2028, 2029].map((y) => `${f(S.low[y])} ／ **${f(S.base[y])}** ／ ${f(S.high[y])}`).join(' | ')} |`;
  return [
    '| （控えめ ／ **基本** ／ 強気） | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    row('年末の有料（個人＋法人の席）', (o) => n(o.paidEnd)),
    row('　うち法人の席', (o) => n(o.seatsEnd)),
    row('入れた人（1 年）', (o) => n(o.installs)),
    row('売上（税抜・1 年）', (o) => man(o.revenue)),
    row('税引き前の利益（1 年）', (o) => man(o.profit)),
    row('年末の手元の現金', (o) => man(o.cashEnd)),
    row('その年の費用の計画', (o) => planName(o.plan)),
  ].join('\n');
})();

blocks.gates = (() => {
  const lines = ['| 見込み | Android（2027 年 9 月・有料 400 人） | 2027 年末の関門 | 2028 年 6 月（逆の決まり・1,400 人） | 2028 年末の関門 | いちばん少ない現金 | 黒字が続く最初の月 |', '|---|---|---|---|---|---|---|'];
  for (const k of ['low', 'base', 'high']) {
    const r = runs[k]; const g = r.gates;
    const cell = (y) => (g[y] ? `${g[y].ok ? '通る' : '通らない'}（有料 ${n(g[y].paid)} 人・月の売上 ${man(g[y].revenue)}）` : '—');
    const mid = g.mid ? `${g.mid.ok ? '続ける' : '止める'}（${n(g.mid.paid)} 人）` : '—';
    lines.push(`| ${SCENARIOS[k].name} | ${r.androidOn ? '作る' : '作らない'} | ${cell(2027)} | ${r.find((x) => x.ym === '2028-06').plan === 'hold' && !g.mid ? '—' : mid} | ${cell(2028)} | ${man(r.minCash)}（${r.minCashYm}） | ${breakEvenMonth(r) || '—'} |`);
  }
  return lines.join('\n');
})();

blocks.pl = (() => {
  const y = S.base;
  const r = (label, f, bold) => `| ${bold ? `**${label}**` : label} | ${[2027, 2028, 2029].map((k) => (bold ? `**${man(f(y[k]))}**` : man(f(y[k])))).join(' | ')} |`;
  return [
    '| 基本の見込み | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    r('売上（税抜）', (o) => o.revenue),
    r('App Store・Stripe の手数料', (o) => -o.fee),
    r('返金', (o) => -o.refunds),
    r('AI の原価（有料と無料の人）', (o) => -o.ai),
    r('人（オーナーの報酬・外注・社員・社会保険・採用・Android を作る費用）', (o) => -o.people),
    r('広告・制作', (o) => -o.marketing),
    r('サーバー', (o) => -o.infra),
    r('その他（Apple・税理士・法人化・道具）', (o) => -o.other),
    r('税引き前の利益', (o) => o.profit, true),
    r('法人税など（翌年 3 月に払う）', (o) => -o.corpTax),
    r('税引き後の利益', (o) => o.profitAfterTax, true),
    r('（比べ用）2027 年もオーナーに月 ¥50 万を払ったら', (o) => (o.year === 2027 ? o.profit - BASE.ownerMarketPayYen * 12 : o.profit)),
    r('年末の手元の現金', (o) => o.cashEnd),
  ].join('\n');
})();

blocks.cash = (() => {
  const qs = ['2027-03', '2027-06', '2027-09', '2027-12', '2028-03', '2028-06', '2028-09', '2028-12', '2029-03', '2029-06', '2029-09', '2029-12'];
  const lines = [`| 四半期の末 | ${qs.map((q) => q.replace('-', '/')).join(' | ')} |`, `|---|${qs.map(() => '---').join('|')}|`];
  for (const k of ['low', 'base', 'high']) lines.push(`| ${k === 'base' ? '**基本**' : SCENARIOS[k].name} | ${qs.map((q) => { const v = Math.round(runs[k].find((r) => r.ym === q).cash / 1e4); return k === 'base' ? `**${v}**` : `${v}`; }).join(' | ')} |`);
  lines.push(`| 基本の有料 | ${qs.map((q) => n(runs.base.find((r) => r.ym === q).paid)).join(' | ')} |`);
  return `${lines.join('\n')}\n\n（単位: 万円。始めの手元資金 ${man(BASE.startingCash)}。入金は 2 か月遅れ・年額は始めた月にまとめて入る・法人税は翌年 3 月）`;
})();

blocks.unit = (() => {
  const rows = [2027, 2028, 2029].map((y) => ({ y, l: lifetimeValue(BASE, y), a: paidAcquisition(BASE, y) }));
  return [
    '| 基本 | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    `| 月額の人が続く月数（平均） | ${rows.map((x) => `${x.l.monthlyMonths.toFixed(1)} か月`).join(' | ')} |`,
    `| 生涯の利益（月額） | ${rows.map((x) => `¥${n(x.l.ltvMonthly)}`).join(' | ')} |`,
    `| 生涯の利益（年額） | ${rows.map((x) => `¥${n(x.l.ltvAnnual)}`).join(' | ')} |`,
    `| **生涯の利益（月額 55%・年額 45%）** | ${rows.map((x) => `**¥${n(x.l.blended)}**`).join(' | ')} |`,
    `| 広告で有料 1 人を取る費用 | ${rows.map((x) => `¥${n(x.a.cac)}`).join(' | ')} |`,
    `| 生涯の利益 ÷ 取る費用 | ${rows.map((x) => `${x.a.ratio.toFixed(1)} 倍`).join(' | ')} |`,
    `| **取る費用を取り戻す月数**（入った月ごとの集団・解約と更新を入れる） | ${rows.map((x) => `**${x.a.paybackMonths} か月**`).join(' | ')} |`,
    `| 広告の扱い | ${rows.map((x) => (x.y < 2028 ? '出さない' : x.a.paybackMonths <= BASE.adPaybackMax ? '増やす' : '月 ¥10 万の試しだけ')).join(' | ')} |`,
  ].join('\n');
})();

blocks.sensitivity = (() => {
  const base = S.base[2029];
  return [
    '| 前提を 1 つだけ悪くすると（基本から） | 2029 年末の有料 | 2029 年の利益（関門で費用を止める＝計画の動き方） | （比べ用）費用を止めなかったら |',
    '|---|---|---|---|',
    `| （基本） | ${n(base.paidEnd)} | ${man(base.profit)} | — |`,
    ...sensitivity(BASE).sort((a, b) => a.dPaid - b.dPaid).map((s) => `| ${s.label} | ${n(s.paidEnd)}（${s.dPaid >= 0 ? '+' : '−'}${n(Math.abs(s.dPaid))}） | ${man(s.profit)} | ${man(s.profitNoGates)} |`),
  ].join('\n');
})();

blocks.roles = (() => [
  '| 責任者 | 受け持つこと | 見る数字 | いま | 人に渡す時期 |',
  '|---|---|---|---|---|',
  ...ROLES.map((r) => `| **${r.name}** | ${r.mission} | ${r.kpi} | ${r.now} | ${r.later} |`),
].join('\n'))();

blocks.routines = (() => {
  const total = ROUTINES.reduce((s, r) => s + r.owner, 0);
  return [
    '| 責任者 | 毎月の決まった仕事 | 終わりの基準 | オーナーの時間（週） | AI が受け持つこと |',
    '|---|---|---|---|---|',
    ...ROUTINES.map((r) => `| ${roleShort(r.role)} | ${r.title} | ${r.done} | ${r.owner} 時間 | ${r.ai} |`),
    `| **合計** | | | **${total} 時間**（上限 ${OWNER_WEEKLY_HOURS} 時間） | |`,
  ].join('\n');
})();

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
blocks.quarters = table(['2027', '2028', '2029'].flatMap((y) => [1, 2, 3, 4].map((q) => `${y}-Q${q}`)), '四半期');
blocks.months = table([...new Set(ITEMS.filter((x) => isMonth(x.period)).map((x) => x.period))].sort(), '月');
void quarterOf; void dman;

let doc = readFileSync(DOC, 'utf8');
for (const [k, body] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- plan:${k} -->)[\\s\\S]*?(<!-- /plan:${k} -->)`);
  if (!re.test(doc)) { console.error(`✗ ${DOC} に <!-- plan:${k} --> 〜 <!-- /plan:${k} --> がありません`); process.exitCode = 1; continue; }
  doc = doc.replace(re, `$1\n${body}\n$2`);
}
writeFileSync(DOC, doc);
console.log(`✓ ${DOC} の数字と予定を、計算と予定のデータから書き直しました`);
