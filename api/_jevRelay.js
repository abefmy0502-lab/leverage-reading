// 🧭 アプリ → Jev の中継（api/claude.js の中の短い道・2026-10-02）。名前が _ で始まるので Vercel の関数にはならない。
//
// アプリは /api/claude に { purpose: 'memo_relevance' | 'intent', jev: 材料 } を送る。
// ここで「使ってよいか」を決め（api/_aiRouting.js の resolveJevRoute: スイッチ・用途ごとのスイッチ・プラン・同意の版）、
// 材料から問いを組み立てて（api/_jevTasks.js）、Jev に決めてもらう（api/_jev.js）。
//
// 返事はいつも 200 で { jev: { result, ms } } か { jev: null, reason }（アプリは null ならこれまでの決め方で続ける）。
// 402 / 429 は返さない（有料プランの画面を開いたり、トークンの案内を出したりしない＝裏で使う小さな判断だから）。
//
// 数え方: 1 人・1 か月（日本時間）に JEV_MONTHLY_CALL_LIMIT 回（既定 600）まで。ai_usage の 'jev-YYYY-MM' 行
//   （reserve_ai_usage を流用・新しい SQL は要らない）。原価（1 回 約 ¥0.01〜0.2）は同じ行の cost_mjpy に足す
//   （adjust_ai_cost）＝利用者のトークン（相談・AI 選書など）からは引かない。数えられないときは送らない（fail-closed）。
// 分間の上限は文を書く AI とは別（JEV_RATE_PER_MIN・既定 20 回/分・この関数のインスタンスごと）。

import { resolveJevRoute } from './_aiRouting.js';
import { JEV_TASKS, jevInputChars } from './_jevTasks.js';
import { jevDecide, jevConfig } from './_jev.js';

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};
export function jevMonthlyLimit(env = process.env) {
  return num(env.JEV_MONTHLY_CALL_LIMIT, 600);
}
export function jevPeriodKey(monthKey) {
  return `jev-${monthKey}`;
}

// 分間の上限（インスタンスごと）。
const WINDOW_MS = 60 * 1000;
const hits = new Map();
export function jevRateOk(userId, env = process.env, now = Date.now()) {
  const max = num(env.JEV_RATE_PER_MIN, 20);
  const recent = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) { hits.set(userId, recent); return false; }
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return true;
}
export function __resetJevRateForTest() { hits.clear(); }

const none = (reason) => ({ status: 200, body: { jev: null, reason } });

// deps:
//   reserveCall(periodKey, limit) → { allowed, reserved }（reserve_ai_usage）
//   addCost(periodKey, mjpy)                               （adjust_ai_cost）
// 戻り値: { status, body }
export async function handleJevRelay({ body, tier, consentVersion, userId, monthKey, env = process.env, fetchImpl = globalThis.fetch, signal = null, deps }) {
  const purpose = body?.purpose;
  const route = resolveJevRoute({ purpose, tier, consentVersion, env });
  if (!route.ok) return none(route.reason);
  const task = JEV_TASKS[purpose];
  const input = task.read(body?.jev);
  if (!input) return none('bad_input');
  if (!jevRateOk(userId, env)) return none('rate');

  const periodKey = jevPeriodKey(monthKey);
  let usage;
  try {
    usage = await deps.reserveCall(periodKey, jevMonthlyLimit(env));
  } catch {
    usage = { allowed: false, reserved: false };
  }
  if (!usage?.reserved) return none('uncounted'); // 数えられないときは送らない
  if (!usage.allowed) return none('limit');

  const requests = task.requests(input, { maxQuestions: jevConfig(env).maxQuestions });
  const decided = await jevDecide(requests, { env, fetchImpl, signal });
  const result = decided ? task.result(decided.answers, input) : null;
  // 数だけのログ（中身・利用者は書かない）
  console.info(`[jev] ${purpose} ${result ? 'ok' : 'fail'} calls=${decided?.calls ?? 0} in=${decided?.inputTokens ?? '-'} chars=${jevInputChars(requests)} ms=${decided?.ms ?? '-'}`);
  if (decided?.costMjpy > 0) {
    try { await deps.addCost(periodKey, decided.costMjpy); } catch { /* 原価の記録に失敗しても答えは返す */ }
  }
  if (!result) return none('upstream');
  return { status: 200, body: { jev: { result, ms: decided.ms } } };
}
