// 🧭 Jev（TypeSafe AI の判断のモデル・"System One"）の呼び出し口（2026-10-02 オーナー要望「Jev を進めたい」）。
// 名前が _ で始まるので Vercel の関数にはならない（Hobby は関数 12 個まで）。
//
// Jev は文を書かない。「状況（state）」と「決めた形の問い（questions）」を送ると、問いごとに
// 選んだもの・はい の確率・点数と、その確率だけを返す（形の外の値は返さない）。問いは並べて同時に決める。
// 速さ 約 70〜500ms・入力 $0.042 / 100 万トークン・出力は無料（docs/jev-plan.md）。
//
// ⚠️ 送り方・受け取り方は公開の資料（2026-10-02 時点。公式の docs.typesafe.ai はこの作業環境から開けず、
//    検索の抜き書き・第三者の解説で確かめた）に合わせた。形が違ったときに直す所はこのファイルだけ:
//      送る:   POST {JEV_ENDPOINT}（既定 https://api.typesafe.ai/v1/systemone）
//              Authorization: Bearer {JEV_API_KEY}
//              { model, state, questions: { <id>: { type: 'noul'|'choice'|'score', instructions, criteria } } }
//              noul の criteria は { true: '…', false: '…' }・choice は { <選択肢>: '説明' }・score は低い順の [ '…', … ]
//      受ける: { model, answers: { <id>: { type, noul } | { type, choice, confidence, probabilities }
//                                         | { type, score, confidence, probabilities, legend } },
//                usage: { input_tokens, output_tokens } }
//    readAnswer は「answers が無く上の階層に答えが並ぶ」「noul が probability / value / p の名前」などの揺れも読む。
//    OpenRouter 経由（JEV_ENDPOINT=https://openrouter.ai/api/v1/systemone・JEV_MODEL=typesafe/jev-1.13）も同じ形。
//
// 決まり:
//   - JEV_ENABLED が入っていない・鍵（JEV_API_KEY）が無い・時間切れ（既定 1.5 秒）・どんな失敗も null を返す
//     （呼び出し側はこれまでの決め方で続ける＝Jev は「良くする」だけで、止まる理由にはしない）
//   - ログには番号・理由・かかった時間だけ（状況や問いの中身は書かない）
//   - 1 回に送る問いは JEV_MAX_QUESTIONS（既定 6・資料の「1〜6 個」に合わせた安全側）まで。多ければ分けて同時に送る

import { jevCostMjpy } from './_aiCost.js';

export const JEV_DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_DEFAULT_MODEL = 'jev-1.13.0';
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const isOn = (v) => /^(1|true|on|yes)$/i.test(String(v ?? '').trim());

// env から設定を読む（テストでは env を渡す）。
export function jevConfig(env = process.env) {
  const endpoint = String(env.JEV_ENDPOINT || '').trim() || JEV_DEFAULT_ENDPOINT;
  return {
    enabled: isOn(env.JEV_ENABLED),
    apiKey: String(env.JEV_API_KEY || '').trim(),
    endpoint: /^https:\/\//.test(endpoint) ? endpoint : JEV_DEFAULT_ENDPOINT,
    model: String(env.JEV_MODEL || '').trim() || JEV_DEFAULT_MODEL,
    timeoutMs: Math.min(num(env.JEV_TIMEOUT_MS, 1500), 5000),
    maxQuestions: Math.min(Math.floor(num(env.JEV_MAX_QUESTIONS, 6)), 32),
  };
}

// 使えるか（スイッチと鍵）。
export function jevAvailable(env = process.env) {
  const c = jevConfig(env);
  return c.enabled && !!c.apiKey;
}

const clamp01 = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
};

// 確率の表（{ 名前: 確率 }）を整える。数でない値は外す。
function probs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const p = clamp01(v);
    if (p != null) out[k] = p;
  }
  return Object.keys(out).length ? out : null;
}

// 1 つの答えを読む（type: 送った問いの種類）。読めなければ null。
//   noul   → { type: 'noul', p }                         p＝「はい」の確率
//   choice → { type: 'choice', choice, confidence, probabilities }
//   score  → { type: 'score', score, confidence, probabilities }
export function readAnswer(raw, type) {
  if (raw == null) return null;
  if (type === 'noul') {
    if (typeof raw === 'number' || typeof raw === 'string') {
      const p = clamp01(raw);
      return p == null ? null : { type, p };
    }
    if (typeof raw !== 'object') return null;
    const pr = probs(raw.probabilities);
    const cand = [raw.noul, raw.probability, raw.p, raw.value, raw.yes, pr?.true, pr?.yes];
    for (const c of cand) {
      if (typeof c === 'boolean') continue; // true/false だけでは確率にならない
      const p = clamp01(c);
      if (p != null) return { type, p };
    }
    return null;
  }
  if (typeof raw !== 'object') return null;
  if (type === 'choice') {
    const probabilities = probs(raw.probabilities);
    let choice = typeof raw.choice === 'string' ? raw.choice : typeof raw.value === 'string' ? raw.value : null;
    if (!choice && probabilities) choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
    if (!choice) return null;
    return { type, choice, confidence: clamp01(raw.confidence) ?? probabilities?.[choice] ?? null, probabilities };
  }
  if (type === 'score') {
    const score = Number(raw.score ?? raw.value);
    if (!Number.isFinite(score)) return null;
    return { type, score, confidence: clamp01(raw.confidence), probabilities: probs(raw.probabilities) };
  }
  return null;
}

// 応答の答えの表（answers が無いときは上の階層）。
function answersOf(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.answers && typeof data.answers === 'object') return data.answers;
  if (data.results && typeof data.results === 'object') return data.results;
  return data;
}

function inputTokensOf(data) {
  const u = data?.usage;
  if (!u || typeof u !== 'object') return null;
  const n = Number(u.input_tokens ?? u.prompt_tokens);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// 送る中身の文字数（原価の見積もり・応答に usage が無いとき）。
function payloadChars(state, questions) {
  let n = typeof state === 'string' ? state.length : JSON.stringify(state ?? '').length;
  for (const q of Object.values(questions || {})) n += JSON.stringify(q).length;
  return n;
}

// 問いの名前は英小文字・数字・_ だけ（資料の snake_case）。
const QID = /^[a-z][a-z0-9_]{0,47}$/;

// 1 回分を送る。成功 → { answers: { id: 読んだ答え }, inputTokens, ms }。失敗 → null（理由はログだけ）。
//   requests の 1 つ分: { state, questions }。questions の各問いは { type, instructions, criteria? }。
async function sendOne({ state, questions }, cfg, { fetchImpl, signal, deadline }) {
  const started = Date.now();
  const left = deadline - started;
  if (left <= 0) return null;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), left);
  try {
    const res = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, state, questions }),
      signal: ctrl.signal,
    });
    if (!res || !res.ok) {
      console.warn(`[jev] upstream ${res?.status ?? 0}`);
      return null;
    }
    const data = await res.json();
    const table = answersOf(data);
    const answers = {};
    for (const [id, q] of Object.entries(questions)) {
      const a = readAnswer(table?.[id], q.type);
      if (!a) {
        console.warn('[jev] unreadable answer');
        return null;
      }
      answers[id] = a;
    }
    const inputTokens = inputTokensOf(data);
    return {
      answers,
      inputTokens: inputTokens ?? Math.ceil(payloadChars(state, questions) * 1.2),
      model: typeof data?.model === 'string' ? data.model : cfg.model,
      ms: Date.now() - started,
    };
  } catch (e) {
    console.warn(`[jev] ${ctrl.signal.aborted ? 'timeout' : 'error'} after ${Date.now() - started}ms`);
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// 問いの多い 1 回を、maxQuestions ずつに分ける（state は同じ）。
export function splitQuestions(state, questions, maxQuestions) {
  const ids = Object.keys(questions || {});
  const out = [];
  for (let i = 0; i < ids.length; i += maxQuestions) {
    const qs = {};
    for (const id of ids.slice(i, i + maxQuestions)) qs[id] = questions[id];
    out.push({ state, questions: qs });
  }
  return out;
}

// 決めてもらう。requests: [{ state, questions }]（問いの名前は全体で重ならないこと）。
// どれか 1 つでも失敗したら null（一部だけの答えで並びが偏らないように）。
// 戻り値: { answers: { id: 答え }, inputTokens, costMjpy, ms, calls, model } | null
export async function jevDecide(requests, { env = process.env, fetchImpl = globalThis.fetch, signal = null, now = Date.now } = {}) {
  const cfg = jevConfig(env);
  if (!cfg.enabled || !cfg.apiKey || typeof fetchImpl !== 'function') return null;
  const list = [];
  for (const r of Array.isArray(requests) ? requests : [requests]) {
    if (!r || r.state == null || !r.questions || typeof r.questions !== 'object') return null;
    for (const [id, q] of Object.entries(r.questions)) {
      if (!QID.test(id) || !q || !['noul', 'choice', 'score'].includes(q.type) || typeof q.instructions !== 'string') return null;
    }
    list.push(...splitQuestions(r.state, r.questions, cfg.maxQuestions));
  }
  if (list.length === 0) return null;
  const started = now();
  const deadline = started + cfg.timeoutMs;
  const parts = await Promise.all(list.map((r) => sendOne(r, cfg, { fetchImpl, signal, deadline })));
  if (parts.some((p) => !p)) return null;
  const answers = {};
  let inputTokens = 0;
  for (const p of parts) {
    Object.assign(answers, p.answers);
    inputTokens += p.inputTokens;
  }
  return {
    answers,
    inputTokens,
    costMjpy: jevCostMjpy({ inputTokens }),
    ms: now() - started,
    calls: parts.length,
    model: parts[0].model,
  };
}
