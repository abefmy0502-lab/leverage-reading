#!/usr/bin/env node
// 計画の文書の「数字」と「予定」の節を、計算（model.mjs）と予定（schedule.mjs）から書き直す。手で写さない。
//   node scripts/plan/render-md.mjs   → company/mid-term-plan-2027-2029.md の <!-- plan:XXX --> 〜 <!-- /plan:XXX --> を差し替える
import { readFileSync, writeFileSync } from 'node:fs';
import { SCENARIOS, BASE, simulate, yearly, lifetimeValue, paidAcquisition, sensitivity, breakEvenMonth, stressGrid } from './model.mjs';
import { ROLES, ROUTINES, ITEMS, HOLD_ITEMS, GUARD_ITEMS, FREEZE_ITEMS, GUARD_ROLE_HOURS, FREEZE_ROLE_HOURS, BUSY_PLAN, isMonth, OWNER_WEEKLY_HOURS, ownerHoursOfMonth, FULLTIME_ROLE_HOURS, FULLTIME_WEEKLY_HOURS, fulltimeRoleHours } from './schedule.mjs';

const DOC = 'company/mid-term-plan-2027-2029.md';
const n = (v) => Math.round(v).toLocaleString('ja-JP');
const man = (v) => { const k = Math.round(v / 1e4); return `${k < 0 ? '−' : ''}¥${Math.abs(k).toLocaleString('ja-JP')} 万`; };
const roleShort = (id) => ROLES.find((r) => r.id === id)?.short || id;
const runs = Object.fromEntries(Object.entries(SCENARIOS).map(([k, A]) => [k, simulate(A)]));
const ys = (k) => Object.fromEntries(yearly(runs[k], SCENARIOS[k]).map((o) => [o.year, o]));
const S = { low: ys('low'), base: ys('base'), high: ys('high') };
const planName = (p) => (p === 'pass' ? '足す' : '止める');
const QS = ['2027-03', '2027-06', '2027-09', '2027-12', '2028-03', '2028-06', '2028-09', '2028-12', '2029-03', '2029-06', '2029-09', '2029-12'];
const pay = (m) => (m > 60 ? '60 か月を超える' : `${m} か月`);
const blocks = {};

blocks.scenarios = (() => {
  const row = (label, f) => `| ${label} | ${[2027, 2028, 2029].map((y) => `${f(S.low[y])} ／ **${f(S.base[y])}** ／ ${f(S.high[y])}`).join(' | ')} |`;
  return [
    '| （控えめ ／ **基本** ／ 強気） | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    row('年末の有料（個人＋法人の席）', (o) => n(o.paidEnd)),
    row('　うち個人', (o) => n(o.consumerEnd)),
    row('　うち法人の席', (o) => n(o.seatsEnd)),
    row('入れた人（1 年・Android と広告を含む）', (o) => n(o.installs)),
    row('売上（税抜・1 年）', (o) => man(o.revenue)),
    row('税引き前の利益（1 年）', (o) => man(o.profit)),
    row('（比べ用）オーナーに市場の報酬 月 ¥50 万を払っていたら', (o) => man(o.profitMarketOwner)),
    row('年末の手元の現金', (o) => man(o.cashEnd)),
    row('　うち借入の残り', (o) => man(o.loanEnd)),
    row('その年の費用の計画（年末の時点）', (o) => planName(o.plan)),
  ].join('\n');
})();

blocks.gates = (() => {
  const lines = ['| 見込み | Android（2027-09） | 2027 年末 | 2028-06（逆の決まり） | 2028 年末 | 2029-06（逆の決まり） | 社員 | いちばん少ない現金 |', '|---|---|---|---|---|---|---|---|'];
  for (const k of ['low', 'base', 'high']) {
    const r = runs[k]; const g = r.gates;
    const c = (x) => (x ? `${x.ok ? '通る' : '通らない'}（${n(x.paid)} 人）` : '—');
    lines.push(`| ${SCENARIOS[k].name} | ${c(g.android)} | ${c(g[2027])} | ${c(g.mid2028)} | ${c(g[2028])} | ${c(g.mid2029)} | ${r.hired.join('・') || 'なし'} | ${man(r.minCash)}（${r.minCashYm}） |`);
  }
  const ev = runs.base.events.map((e) => `${e.ym} ${e.what}`).join('／');
  return `${lines.join('\n')}\n\n基本の見込みで起きること: ${ev || 'なし'}。黒字が続く最初の月: 控えめ ${breakEvenMonth(runs.low) || '—'}・基本 ${breakEvenMonth(runs.base) || '—'}・強気 ${breakEvenMonth(runs.high) || '—'}。`;
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
    r('　うちオーナーの報酬', (o) => -o.ownerPay),
    r('広告・制作', (o) => -o.marketing),
    r('サーバー', (o) => -o.infra),
    r('その他（Claude Max・Apple・税理士・法人化・道具・借入の利息）', (o) => -o.other),
    r('税引き前の利益', (o) => o.profit, true),
    r('法人税など（その年の分・翌年 2 月に払う）', (o) => -o.taxForYear),
    r('税引き後の利益', (o) => o.profitAfterTax, true),
    r('（比べ用）オーナーに市場の報酬 月 ¥50 万を払っていたら', (o) => o.profitMarketOwner),
    r('年末の手元の現金', (o) => o.cashEnd),
    r('年末の現金 − 翌年に払う税', (o) => o.cashAfterTaxDue),
  ].join('\n');
})();

blocks.cash = (() => {
  const lines = [`| 四半期の末 | ${QS.map((q) => q.replace('-', '/')).join(' | ')} |`, `|---|${QS.map(() => '---').join('|')}|`];
  for (const k of ['low', 'base', 'high']) lines.push(`| ${k === 'base' ? '**基本**' : SCENARIOS[k].name} | ${QS.map((q) => { const v = Math.round(runs[k].find((r) => r.ym === q).cash / 1e4); return k === 'base' ? `**${v}**` : `${v}`; }).join(' | ')} |`);
  lines.push(`| 基本の有料 | ${QS.map((q) => n(runs.base.find((r) => r.ym === q).paid)).join(' | ')} |`);
  const g = stressGrid(BASE); const neg = g.filter((x) => x.minCash < 0).length; const worst = Math.min(...g.map((x) => x.minCash));
  return `${lines.join('\n')}\n\n（単位: 万円。始めの手元資金 ${man(BASE.startingCash)}。入金は 2 か月遅れ・年額は始めた月にまとめて入る・借入は 2028 年 1 月）\n\n**網の目の点検**: 有料になる率と流入をそれぞれ 0.5〜1.3 倍（9 × 9）、無料の人の AI の原価を 1 倍と 3 倍で組み合わせた ${g.length} 通りのうち、現金がマイナスになるのは **${neg} 通り**（いちばん少ない現金 ${man(worst)}）。テストで毎回確かめる。`;
})();

blocks.channels = (() => {
  const r = runs.base;
  const lines = [`| 月（四半期の末・季節の山を含む） | ${QS.map((q) => q.replace('-', '/')).join(' | ')} |`, `|---|${QS.map(() => '---').join('|')}|`];
  const row = (label, f) => lines.push(`| ${label} | ${QS.map((q) => n(f(r.find((x) => x.ym === q)))).join(' | ')} |`);
  row('App Store の検索', (x) => x.ch.search); row('SNS', (x) => x.ch.sns); row('協業・note・プレス', (x) => x.ch.collab); row('利用者の共有', (x) => x.ch.share);
  row('**iPhone の自然な流入の合計**', (x) => x.organic); row('Android', (x) => x.android); row('広告（試し）', (x) => x.paidInstalls);
  let cumIos = 0; let cumAll = 0; for (const x of r) if (x.inPlan) { cumIos += x.organic; cumAll += x.installs; }
  return `${lines.join('\n')}\n\n**市場に対して大きすぎないか**: 3 年で入れた人は のべ 約 ${n(cumAll / 1e4)} 万（iPhone の自然な流入 約 ${n(cumIos / 1e4)} 万）。TAM 約 726 万人の 約 ${(cumAll / 7.26e6 * 100).toFixed(0)}%、ねらう人（約 150 万人）に対して iPhone の分は 約 ${(cumIos / 1.5e6 * 100).toFixed(0)}%（入れた人には、ねらう人の外の人・入れ直しも含む）。`;
})();

blocks.unit = (() => {
  const rows = [2027, 2028, 2029].map((y) => ({ y, l: lifetimeValue(BASE, y), ls: lifetimeValue(BASE, y, { strict: true }), a: paidAcquisition(BASE, y), as: paidAcquisition(BASE, y, { strict: true }) }));
  return [
    '| 基本 | 2027 | 2028 | 2029 |',
    '|---|---|---|---|',
    `| 月額の人が続く月数（平均） | ${rows.map((x) => `${x.l.monthlyMonths.toFixed(1)} か月`).join(' | ')} |`,
    `| 生涯の利益（月額 55%・年額 45%・ふつう） | ${rows.map((x) => `¥${n(x.l.blended)}`).join(' | ')} |`,
    `| 生涯の利益（**きびしめ**: 返金・無料の人の AI・サーバーを引き、年 10% で割り引く） | ${rows.map((x) => `¥${n(x.ls.blended)}`).join(' | ')} |`,
    `| 広告で有料 1 人を取る費用（ふつう: 広告で入れた人は 1.5 倍有料に） | ${rows.map((x) => `¥${n(x.a.cac)}`).join(' | ')} |`,
    `| 広告で有料 1 人を取る費用（きびしめ: 1.5 倍を使わない） | ${rows.map((x) => `¥${n(x.as.cac)}`).join(' | ')} |`,
    `| **取る費用を取り戻す月数**（ふつう／きびしめ） | ${rows.map((x) => `**${pay(x.a.paybackMonths)}**／${pay(x.as.paybackMonths)}`).join(' | ')} |`,
    `| 広告の扱い | ${rows.map((x) => (x.y < 2028 ? '出さない' : x.a.paybackMonths <= BASE.adPaybackMax ? '増やす' : '月 ¥10 万の試しだけ')).join(' | ')} |`,
  ].join('\n');
})();

blocks.sensitivity = (() => {
  const base = S.base[2029];
  return [
    '| 前提を 1 つだけ動かすと（基本から） | 2029 年末の有料 | 2029 年の利益（関門で止める＝計画の動き方） | （比べ用）止めなかったら | いちばん少ない現金 |',
    '|---|---|---|---|---|',
    `| （基本） | ${n(base.paidEnd)} | ${man(base.profit)} | — | ${man(runs.base.minCash)} |`,
    ...sensitivity(BASE).sort((a, b) => a.dPaid - b.dPaid).map((s) => `| ${s.label} | ${n(s.paidEnd)}（${s.dPaid >= 0 ? '+' : '−'}${n(Math.abs(s.dPaid))}） | ${man(s.profit)} | ${man(s.profitNoGates)} | ${man(s.minCash)} |`),
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
    `| **合計** | | | **${total} 時間**（使える時間 ${OWNER_WEEKLY_HOURS} 時間） | |`,
  ].join('\n');
})();

blocks.owner = (() => {
  const ms = ['2026-12', ...Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}`), '2028-01', '2028-02', '2028-03'];
  const o = ms.map((m) => ownerHoursOfMonth(m));
  return [
    `| 月 | ${ms.map((m) => m.slice(2).replace('-', '/')).join(' | ')} |`,
    `|---|${ms.map(() => '---').join('|')}|`,
    `| 決まった仕事 | ${o.map((x) => x.routine.toFixed(1)).join(' | ')} |`,
    `| その月の成果物 | ${o.map((x) => x.items.toFixed(1)).join(' | ')} |`,
    `| **合計（予定の上限 ${o[0].planLimit.toFixed(1)}・使える時間 ${o[0].limit.toFixed(1)}）** | ${o.map((x) => `**${x.total.toFixed(1)}**`).join(' | ')} |`,
  ].join('\n');
})();

// 2028 年 4 月からの専業（週 40 時間）の内訳と、月ごとの時間
blocks.fulltime = (() => {
  const ms = []; for (let y = 2028; y <= 2029; y += 1) for (let m = 1; m <= 12; m += 1) { const ym = `${y}-${String(m).padStart(2, '0')}`; if (ym >= '2028-04') ms.push(ym); }
  const roleRow = ROLES.map((r) => { const v = FULLTIME_ROLE_HOURS[r.id]; const txt = Array.isArray(v) ? v.map(([f, h]) => `${f.slice(2).replace('-', '/')}〜 ${h}`).join('・') : `${v}`; return `| ${roleShort(r.id)} | ${txt} 時間 |`; });
  const o = ms.map((m) => ownerHoursOfMonth(m));
  const wk = (ym) => ROLES.reduce((s, r) => s + fulltimeRoleHours(r.id, ym), 0);
  return [
    '| 責任者 | オーナーの時間（週） |', '|---|---|', ...roleRow,
    `| **合計** | **${wk('2028-04')}〜${Math.max(...ms.map(wk))} 時間**（使える時間 ${FULLTIME_WEEKLY_HOURS} 時間・予定は 8 割の ${FULLTIME_WEEKLY_HOURS * 0.8} 時間まで） |`,
    '',
    `| 月 | ${ms.map((m) => m.slice(2).replace('-', '/')).join(' | ')} |`,
    `|---|${ms.map(() => '---').join('|')}|`,
    `| 役割の時間 | ${o.map((x) => x.routine.toFixed(1)).join(' | ')} |`,
    `| 成果物（四半期 1/3・年 1/12・月） | ${o.map((x) => x.items.toFixed(1)).join(' | ')} |`,
    `| **合計（予定の上限 ${o[0].planLimit.toFixed(1)}）** | ${o.map((x) => `**${x.total.toFixed(1)}**`).join(' | ')} |`,
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

// Android の外注を見る時間が週 2 時間に増えたときの決まり
blocks.busy = (() => {
  const cuts = ROUTINES.filter((r) => BUSY_PLAN.routineCuts[r.role] != null).map((r) => `| ${roleShort(r.role)} | 週 ${r.owner} 時間 → **${BUSY_PLAN.routineCuts[r.role]} 時間** |`);
  const flex = ITEMS.filter((x) => x.flex).map((x) => `| ${x.period} | ${roleShort(x.role)} | ${x.title} | ${x.h} 時間 |`);
  const ms = ['2027-10', '2027-11', '2027-12', '2028-01', '2028-02'];
  return [`**発動**: Android の外注を見る時間が 2 週続けて週 1.5 時間を超えたら（見込みは週 1 時間・この決まりは週 ${BUSY_PLAN.androidWeekly} 時間でも収まるように作った）。`, '', '| 決まった仕事 | 減らし方 |', '|---|---|', ...cuts, '', '| 後ろへ回す成果物（日付の決まっていない仕事だけ） | 責任者 | やること | 時間 |', '|---|---|---|---|', ...flex, '', `このときの月の時間: ${ms.map((m) => `${m.slice(2).replace('-', '/')} ${ownerHoursOfMonth(m, { busy: true }).total.toFixed(1)}`).join('・')}（予定の上限 ${ownerHoursOfMonth('2027-10').planLimit.toFixed(1)}）。借入・関門・「今年の読書」・創業メンバーの更新・法人化は回さない。`].join('\n');
})();

// 2027 年末の関門に落ちたときの 2028 年（兼業のまま）
const altTable = (items, opt, from, to, roleHours, note) => {
  const order = ROLES.map((r) => r.id);
  const lines = ['| 時期 | 責任者 | やること | 終わりの基準 | オーナーの時間 |', '|---|---|---|---|---|'];
  for (const x of [...items].sort((a, b) => a.period.localeCompare(b.period) || order.indexOf(a.role) - order.indexOf(b.role))) lines.push(`| ${x.period} | ${roleShort(x.role)} | ${x.title} | ${x.done} | ${x.h} 時間 |`);
  const ms = []; for (let y = 2028; y <= 2029; y += 1) for (let m = 1; m <= 12; m += 1) { const ym = `${y}-${String(m).padStart(2, '0')}`; if (ym >= from && ym <= to) ms.push(ym); }
  const t = ms.map((m) => ownerHoursOfMonth(m, opt).total);
  const rh = Object.entries(roleHours).map(([k, v]) => `${roleShort(k)} 週 ${v} 時間`).join('・');
  return `${lines.join('\n')}\n\n決まった仕事の時間を変える役割: ${rh}。${note}このときのオーナーの時間は月 ${Math.min(...t).toFixed(1)}〜${Math.max(...t).toFixed(1)} 時間（予定の上限 ${ownerHoursOfMonth(from, opt).planLimit.toFixed(1)} 時間・テストで確かめる）。`;
};
blocks.guard = altTable(GUARD_ITEMS, { guard: true }, '2028-07', '2028-12', GUARD_ROLE_HOURS, 'ここに無い責任者は基本の予定のまま。');
blocks.freeze = altTable(FREEZE_ITEMS, { freeze: true }, '2029-01', '2029-12', FREEZE_ROLE_HOURS, '社員の募集・採用・引き継ぎの行はなくなり、ここに無い責任者は基本の予定のまま。外注を 2028 年 7 月に止めていた場合（両方）も、月 ' + (() => { const t = Array.from({ length: 12 }, (_, i) => ownerHoursOfMonth(`2029-${String(i + 1).padStart(2, '0')}`, { guard: true, freeze: true }).total); return `${Math.min(...t).toFixed(1)}〜${Math.max(...t).toFixed(1)} 時間に収まる。`; })());

blocks.hold = (() => {
  const order = ROLES.map((r) => r.id);
  const lines = ['| 時期 | 責任者 | やること | 終わりの基準 | オーナーの時間 |', '|---|---|---|---|---|'];
  for (const x of [...HOLD_ITEMS].sort((a, b) => a.period.localeCompare(b.period) || order.indexOf(a.role) - order.indexOf(b.role))) lines.push(`| ${x.period} | ${roleShort(x.role)} | ${x.title} | ${x.done} | ${x.h} 時間 |`);
  const ms = ['2028', '2029'].flatMap((y) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)).map((m) => ownerHoursOfMonth(m, { hold: true }).total);
  return `${lines.join('\n')}\n\nこのときのオーナーの時間は月 ${Math.min(...ms).toFixed(1)}〜${Math.max(...ms).toFixed(1)} 時間（予定の上限 ${ownerHoursOfMonth('2028-01').planLimit.toFixed(1)} 時間）。`;
})();

// 2029 年に人とお金を足す値打ち（2028 年末の関門に落ちて「今の契約を残し、新しく足さない」ときと比べる）
blocks.invest = (() => {
  const B = { ...BASE, gates: { ...BASE.gates, 2028: { ...BASE.gates[2028], paid: 1e9 } } };
  const f = Object.fromEntries(yearly(simulate(B), B).map((o) => [o.year, o]))[2029]; const b = S.base[2029];
  const dPaid = b.paidEnd - f.paidEnd; const dSeats = b.seatsEnd - f.seatsEnd; const dProfit = f.profit - b.profit;
  const hired = runs.base.hired.join('・') || 'なし';
  return `2029 年の基本は、2028 年の契約（オーナーの報酬・外注）のまま、元が取れると分かったものだけ足す。だから「足す」と「足さない（freeze）」の違いは社員だけ。基本で入るのは ${hired}で、2029 年の利益は ${man(dProfit)} 少なく、年末の有料は ${n(dPaid)} 人（うち法人の席 ${n(dSeats)}）多い。**社員は計画の期間の中では元が取れない、2030 年以降の伸び（法人 30 社への道筋）のための投資**として扱い、入れたあとの支出の 6 か月分の現金と 2029 年 6 月の逆の決まりで絞る。`;
})();

let doc = readFileSync(DOC, 'utf8');
for (const [k, body] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- plan:${k} -->)[\\s\\S]*?(<!-- /plan:${k} -->)`);
  if (!re.test(doc)) { console.error(`✗ ${DOC} に <!-- plan:${k} --> 〜 <!-- /plan:${k} --> がありません`); process.exitCode = 1; continue; }
  doc = doc.replace(re, `$1\n${body}\n$2`);
}
writeFileSync(DOC, doc);
console.log(`✓ ${DOC} の数字と予定を、計算と予定のデータから書き直しました`);
