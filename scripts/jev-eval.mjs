#!/usr/bin/env node
// 🧭 Jev（TypeSafe AI の判断のモデル）を入れるかどうかを、人手のラベルで確かめる（2026-10-02・docs/jev-plan.md §4）。
//
// 3 つの用途ごとに「今の決め方」と Jev をくらべ、正解率・適合率・再現率・待ち時間・原価を出す。
//   relevance … 相談の質問に、このメモは役に立つか（今: pickRelatedMemos＝2 文字ずつの語片の重なり）
//   filing    … 保存したメモに、自分のタグのどれが合うか（今: suggestTagsLocal＝文に出るタグ＋似たメモの近い 10 件）
//   intent    … 相談の問いの種類（今: isBookLookup / wantsAction の正規表現）
// ラベルは scripts/fixtures/jev-eval/*.json（日本語・お試しモードの見本のメモから）。
//
// 使い方:
//   node scripts/jev-eval.mjs                 … 鍵が無ければ「今の決め方」だけ（基準の数字）
//   JEV_API_KEY=… node scripts/jev-eval.mjs   … Jev も呼んでくらべる（1 回 約 ¥0.01〜0.1・全部で ¥3 未満の見込み）
//   オプション: --task relevance|filing|intent（1 つだけ）/ --json out.json（結果を保存）
//               --relevance-min 0.5 / --filing-min 0.6（Jev の確率のしきい値）/ --repeat 3（待ち時間を測る回数）
//               --mock（鍵なしで、偽物の Jev（いつも確率 0.5）を通して配線だけ確かめる。数字に意味は無い）
//   env: JEV_ENDPOINT / JEV_MODEL（OpenRouter 経由なら JEV_ENDPOINT=https://openrouter.ai/api/v1/systemone
//        JEV_MODEL=typesafe/jev-1.13 と OpenRouter の鍵）・JEV_MAX_QUESTIONS・JEV_TIMEOUT_MS（評価では既定 5000）
// 鍵は表示しない・ログに残さない。送るのは fixtures の見本の文だけ（利用者のデータは送らない）。

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { jevDecide, jevConfig } from '../api/_jev.js';
import {
  readRelevanceInput, relevanceRequests, relevanceResult, readFilingInput, filingRequests, filingResult,
  readIntentInput, intentRequests, intentResult,
} from '../api/_jevTasks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'scripts', 'fixtures', 'jev-eval');
const args = process.argv.slice(2);
const opt = (name, d = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const only = opt('task');
const jsonOut = opt('json');
const RELEVANCE_MIN = Number(opt('relevance-min', '0.5'));
const FILING_MIN = Number(opt('filing-min', '0.6'));
const REPEAT = Math.max(1, Number(opt('repeat', '1')) || 1);
const load = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));

const MOCK = args.includes('--mock');
const KEY = MOCK ? 'mock' : String(process.env.JEV_API_KEY || '').trim();
const ENV = { ...process.env, JEV_API_KEY: KEY, JEV_ENABLED: 'true', JEV_TIMEOUT_MS: process.env.JEV_TIMEOUT_MS || '5000' };
const withJev = !!KEY;
if (MOCK) {
  // 偽物の Jev: 送った問いの形どおりに、いつも 0.5（choice は先頭の選択肢）を返す。配線の確認だけ。
  globalThis.fetch = async (_url, init) => {
    const { questions } = JSON.parse(init.body);
    const answers = {};
    for (const [id, q] of Object.entries(questions)) {
      answers[id] = q.type === 'choice' ? { type: 'choice', choice: Object.keys(q.criteria)[0], confidence: 0.5 } : { type: 'noul', noul: 0.5 };
    }
    return { ok: true, status: 200, json: async () => ({ model: 'mock', answers, usage: { input_tokens: Math.ceil(init.body.length / 2) } }) };
  };
}

// 今の決め方（src/lib の本物）を Vite で読み込む（拡張子なしの import・import.meta.env をそのまま使えるように）。
const vite = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const ai = await vite.ssrLoadModule('/src/lib/ai.js');
const tagLib = await vite.ssrLoadModule('/src/lib/tagSuggest.js');
const helpers = await vite.ssrLoadModule('/src/lib/consultHelpers.js');
const { buildSeed } = await vite.ssrLoadModule('/src/demo/seed.js');

// ── 数え方 ───────────────────────────────────────────────────────
function binary(pairs) {
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  for (const { y, p } of pairs) {
    if (y && p) tp += 1; else if (!y && p) fp += 1; else if (y && !p) fn += 1; else tn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { n: pairs.length, accuracy: (tp + tn) / Math.max(1, pairs.length), precision, recall, f1, tp, fp, fn, tn };
}
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const quant = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
function latencyOf(ms) {
  return { mean: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null, p50: quant(ms, 0.5), p95: quant(ms, 0.95) };
}
const yen = (mjpy) => `¥${(mjpy / 1000).toFixed(3)}`;

// Jev を 1 回呼ぶ（REPEAT 回測って、答えは最初の 1 回・時間はすべて）
async function callJev(requests) {
  const times = [];
  let first = null;
  let cost = 0;
  let fails = 0;
  for (let i = 0; i < REPEAT; i += 1) {
    const t0 = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const r = await jevDecide(requests, { env: ENV });
    times.push(Date.now() - t0);
    if (!r) fails += 1;
    else cost += r.costMjpy;
    if (i === 0) first = r;
  }
  return { r: first, times, cost, fails };
}

const report = { date: new Date().toISOString(), model: withJev ? jevConfig(ENV).model : null, endpoint: withJev ? jevConfig(ENV).endpoint : null, tasks: {} };

// ── relevance ────────────────────────────────────────────────────
async function evalRelevance() {
  const { cases } = load('relevance.json');
  const base = [];
  const jev = [];
  const baseMs = [];
  const jevMs = [];
  let jevCost = 0; let jevFails = 0;
  // どれも当たらない質問（確定申告など）で選んでしまった数
  let baseNone = 0; let jevNone = 0;
  for (const c of cases) {
    const none = !c.memos.some((m) => m.relevant);
    const memos = c.memos.map((m, i) => ({ id: `x${i}`, text: m.text, tags: [], created_at: '2026-09-01T00:00:00Z', book: { title: m.book, rating: 0 } }));
    const t0 = performance.now();
    const picked = new Set(ai.pickRelatedMemos(c.question, memos));
    baseMs.push(performance.now() - t0);
    memos.forEach((m, i) => base.push({ y: c.memos[i].relevant, p: picked.has(m) }));
    if (none) baseNone += picked.size;
    if (withJev) {
      const input = readRelevanceInput({ question: c.question, memos: c.memos.map((m, i) => ({ id: `m${i}`, text: m.text, book: m.book })) });
      // eslint-disable-next-line no-await-in-loop
      const { r, times, cost, fails } = await callJev(relevanceRequests(input, { maxQuestions: jevConfig(ENV).maxQuestions }));
      jevMs.push(...times); jevCost += cost; jevFails += fails;
      const res = r ? relevanceResult(r.answers, input) : null;
      c.memos.forEach((m, i) => jev.push({ y: m.relevant, p: res ? (res.scores[`m${i}`] ?? 0) >= RELEVANCE_MIN : false, missing: !res }));
      if (none && res) jevNone += c.memos.filter((_, i) => (res.scores[`m${i}`] ?? 0) >= RELEVANCE_MIN).length;
    }
  }
  return {
    baseline: { ...binary(base), pickedOnNoRelevant: baseNone, latencyMs: latencyOf(baseMs.map((x) => Math.round(x * 100) / 100)), costMjpy: 0 },
    jev: withJev ? { ...binary(jev), pickedOnNoRelevant: jevNone, latencyMs: latencyOf(jevMs), costMjpy: jevCost, failures: jevFails, threshold: RELEVANCE_MIN } : null,
  };
}

// ── filing ───────────────────────────────────────────────────────
async function evalFiling() {
  const { cases, tags } = load('filing.json');
  const rows = buildSeed(null).book_memos;
  const base = []; const jev = [];
  const baseExact = []; const jevExact = [];
  const baseEmptyWrong = []; const jevEmptyWrong = [];
  const baseMs = []; const jevMs = [];
  let jevCost = 0; let jevFails = 0;
  for (const c of cases) {
    const t0 = performance.now();
    const pred = new Set(tagLib.suggestTagsLocal({ text: c.memo, rows }).map((x) => x.tag));
    baseMs.push(performance.now() - t0);
    const exp = new Set(c.expected);
    for (const t of tags) base.push({ y: exp.has(t), p: pred.has(t) });
    baseExact.push([...pred].sort().join() === [...exp].sort().join());
    if (!exp.size) baseEmptyWrong.push(pred.size > 0);
    if (withJev) {
      // アプリと同じく、候補は端末の点の高い順＋よく使う順（ここではタグは 9 個なので全部）
      const scored = tagLib.scoreTagsLocal({ text: c.memo, rows });
      const cands = tagLib.jevTagCandidates(scored);
      const input = readFilingInput({ memo: c.memo, book: '', tags: cands });
      // eslint-disable-next-line no-await-in-loop
      const { r, times, cost, fails } = await callJev(filingRequests(input));
      jevMs.push(...times); jevCost += cost; jevFails += fails;
      const res = r ? filingResult(r.answers, input) : null;
      const jp = new Set(res ? (tagLib.tagsFromJev(input.tags, res.probs, { min: FILING_MIN }) || []).map((x) => x.tag) : []);
      for (const t of tags) jev.push({ y: exp.has(t), p: jp.has(t) });
      jevExact.push([...jp].sort().join() === [...exp].sort().join());
      if (!exp.size) jevEmptyWrong.push(jp.size > 0);
    }
  }
  const rate = (a) => (a.length ? a.filter(Boolean).length / a.length : 0);
  return {
    baseline: { ...binary(base), exactMatch: rate(baseExact), wrongOnNoTag: rate(baseEmptyWrong), latencyMs: latencyOf(baseMs.map((x) => Math.round(x * 100) / 100)), costMjpy: 0 },
    jev: withJev ? { ...binary(jev), exactMatch: rate(jevExact), wrongOnNoTag: rate(jevEmptyWrong), latencyMs: latencyOf(jevMs), costMjpy: jevCost, failures: jevFails, threshold: FILING_MIN } : null,
  };
}

// ── intent ───────────────────────────────────────────────────────
async function evalIntent() {
  const { cases, labels } = load('intent.json');
  const baseline = (q) => (helpers.isBookLookup(q) ? 'lookup' : helpers.wantsAction(q) ? 'decide_action' : 'consult');
  const base = []; const jev = [];
  const jevMs = []; let jevCost = 0; let jevFails = 0;
  for (const c of cases) {
    base.push({ y: c.label, p: baseline(c.question) });
    if (withJev) {
      const input = readIntentInput({ question: c.question, followUp: c.followUp });
      // eslint-disable-next-line no-await-in-loop
      const { r, times, cost, fails } = await callJev(intentRequests(input));
      jevMs.push(...times); jevCost += cost; jevFails += fails;
      const res = r ? intentResult(r.answers) : null;
      jev.push({ y: c.label, p: res?.intent || 'none' });
    }
  }
  const multi = (pairs) => {
    const per = {};
    for (const l of labels) per[l] = binary(pairs.map(({ y, p }) => ({ y: y === l, p: p === l })));
    const macroF1 = labels.reduce((n, l) => n + per[l].f1, 0) / labels.length;
    return { n: pairs.length, accuracy: pairs.filter((x) => x.y === x.p).length / Math.max(1, pairs.length), macroF1, per };
  };
  return {
    baseline: { ...multi(base), costMjpy: 0 },
    jev: withJev ? { ...multi(jev), latencyMs: latencyOf(jevMs), costMjpy: jevCost, failures: jevFails } : null,
  };
}

// ── 表示 ─────────────────────────────────────────────────────────
function printBinary(title, r) {
  console.log(`\n■ ${title}`);
  const row = (name, x) => {
    if (!x) { console.log(`  ${name.padEnd(10)} （JEV_API_KEY が無いので呼んでいません）`); return; }
    const extra = [
      x.exactMatch != null ? `完全一致 ${pct(x.exactMatch)}` : '',
      x.wrongOnNoTag != null ? `合うタグの無いメモにすすめた ${pct(x.wrongOnNoTag)}` : '',
      x.pickedOnNoRelevant != null ? `当たらない質問で選んだ ${x.pickedOnNoRelevant} 件` : '',
      x.latencyMs?.p50 != null ? `待ち p50 ${x.latencyMs.p50}ms / p95 ${x.latencyMs.p95}ms` : '',
      x.failures ? `失敗 ${x.failures}` : '',
      x.costMjpy ? `原価 ${yen(x.costMjpy)}` : '',
    ].filter(Boolean).join(' · ');
    console.log(`  ${name.padEnd(10)} 正解率 ${pct(x.accuracy)} · 適合率 ${pct(x.precision)} · 再現率 ${pct(x.recall)} · F1 ${x.f1.toFixed(3)} （${x.n} 組・TP ${x.tp} FP ${x.fp} FN ${x.fn}）${extra ? `\n             ${extra}` : ''}`);
  };
  row('今の決め方', r.baseline);
  row('Jev', r.jev);
}
function printIntent(r) {
  console.log('\n■ intent（問いの種類）');
  const row = (name, x) => {
    if (!x) { console.log(`  ${name.padEnd(10)} （JEV_API_KEY が無いので呼んでいません）`); return; }
    const per = Object.entries(x.per).map(([l, v]) => `${l} P${pct(v.precision)}/R${pct(v.recall)}`).join(' · ');
    console.log(`  ${name.padEnd(10)} 正解率 ${pct(x.accuracy)} · macro-F1 ${x.macroF1.toFixed(3)} （${x.n} 件）\n             ${per}${x.latencyMs ? `\n             待ち p50 ${x.latencyMs.p50}ms / p95 ${x.latencyMs.p95}ms${x.failures ? ` · 失敗 ${x.failures}` : ''} · 原価 ${yen(x.costMjpy)}` : ''}`);
  };
  row('今の決め方', r.baseline);
  row('Jev', r.jev);
}

try {
  console.log(`Jev の評価（${MOCK ? '偽物の Jev（--mock）: 配線の確認だけ・数字に意味は無い' : withJev ? `Jev あり: ${report.model}` : 'Jev なし: 今の決め方だけ（JEV_API_KEY を入れると Jev もくらべます）'}）`);
  if (!only || only === 'relevance') { report.tasks.relevance = await evalRelevance(); printBinary('relevance（相談の関係するメモ）', report.tasks.relevance); }
  if (!only || only === 'filing') { report.tasks.filing = await evalFiling(); printBinary('filing（タグの提案・タグ 1 つずつ）', report.tasks.filing); }
  if (!only || only === 'intent') { report.tasks.intent = await evalIntent(); printIntent(report.tasks.intent); }
  if (jsonOut) { writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`); console.log(`\n結果: ${jsonOut}`); }
  console.log('\n採用の基準は docs/jev-plan.md §4（用途ごとに、基準を満たしたものだけ JEV_TASK_<用途>=on）。');
} finally {
  await vite.close();
}
