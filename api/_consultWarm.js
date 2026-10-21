// 🔥 相談の指示文のキャッシュを、温まっているあいだだけ延ばす（2026-10-21・docs/ai-routing.md §7）。
//
// 相談の指示文（BRAIN_SYSTEM・約 6,800 トークン・全員で同じ文）は AI 側に 1 時間キャッシュされ、使うたびに延びる。
// 1 時間だれも相談しないと消え、次の会話の最初の答えが 約 ¥1.6 → 約 ¥3.9（書き込み 2 倍）になる。
// アプリが開かれたとき（端末ごとに 10 分に 1 回まで）に中継へ知らせ、最後に温まってから 40〜57 分なら、
// 出力 1 トークンの短い呼び出し（キャッシュの読み出し＝約 ¥0.12）で 1 時間延ばす。
//   - 冷えたキャッシュを先に書くことはしない（だれも相談しなければ ¥2.4 が無駄になる）。延ばすだけ。
//   - 全インスタンスで 1 回だけ（supabase_ai_cache_warm.sql の claim_ai_cache_refresh）。表が無ければ何もしない。
//   - 利用者の情報は送らない。トークンは数えない（運営の原価）。答えの中身は何も変わらない。
// 本物の相談でキャッシュが使われたら touch で時刻を今にする（api/claude.js）。

import { BRAIN_SYSTEM } from '../src/lib/brainSystem.js';
import { resolveRoute } from './_aiRouting.js';
import { openRoute } from './_providers.js';
import { costFromUsage } from './_aiCost.js';

export const WARM_KEY = 'consult';
export const WARM_MIN_AGE_S = 40 * 60;
export const WARM_MAX_AGE_S = 57 * 60; // 1 時間ぎりぎりは避ける（時計のずれ・呼び出しの時間）

// アプリが送る相談の指示文と同じか（違う版のアプリの相談では時刻を進めない）。
export function isWarmableSystem(system) {
  if (!Array.isArray(system)) return false;
  return system.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('') === BRAIN_SYSTEM;
}

// 延ばすモデル（有料と無料プランの相談の行き先・Claude だけ）。
export function warmModels(env = process.env) {
  const out = new Set();
  for (const free of [false, true]) {
    try {
      const r = resolveRoute({ purpose: 'consult', requestedModel: 'claude-haiku-4-5', free, env });
      if (r?.provider === 'anthropic' && r.model) out.add(r.model);
    } catch { /* no-op */ }
  }
  return [...out];
}

export function warmBody() {
  return {
    max_tokens: 1,
    system: [{ type: 'text', text: BRAIN_SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: '.' }],
  };
}

// 本物の相談の指示文がキャッシュに乗ったとき（読み出し・書き込み）。失敗しても止めない。
export async function touchConsultWarm(admin) {
  if (!admin) return;
  try { await admin.rpc('touch_ai_cache_warm', { p_key: WARM_KEY }); } catch { /* no-op */ }
}

// 温まっていれば延ばす。戻り値 { refreshed, reason }。
export async function refreshConsultWarm({ admin, env = process.env, fetchImpl = fetch } = {}) {
  if (env.AI_CONSULT_WARM === 'off') return { refreshed: false, reason: 'off' };
  if (String(env.AI_CONSULT_SYSTEM_TTL || '1h').trim() === '5m') return { refreshed: false, reason: 'ttl' };
  if (!admin || !env.ANTHROPIC_API_KEY) return { refreshed: false, reason: 'config' };
  let claimed = false;
  try {
    const { data, error } = await admin.rpc('claim_ai_cache_refresh', { p_key: WARM_KEY, p_min_age: WARM_MIN_AGE_S, p_max_age: WARM_MAX_AGE_S });
    claimed = !error && data === true;
  } catch { claimed = false; }
  if (!claimed) return { refreshed: false, reason: 'not_due' };
  let any = false;
  for (const model of warmModels(env)) {
    try {
      const { response, model: served } = await openRoute({ provider: 'anthropic', model, base: warmBody(), env, fetchImpl });
      if (!response?.ok) { console.warn(`[ai-cache] warm ${model} failed (status ${response?.status ?? 0})`); continue; }
      const json = await response.json().catch(() => null);
      const u = json?.usage || {};
      const cc = u.cache_creation && typeof u.cache_creation === 'object' ? u.cache_creation : {};
      const mjpy = costFromUsage(served || model, u);
      console.info(`[ai-cache] warm ${served || model} cr=${u.cache_read_input_tokens ?? '-'} cw1h=${cc.ephemeral_1h_input_tokens ?? 0} yen=${(mjpy / 1000).toFixed(2)}`);
      any = true;
    } catch (e) {
      console.warn(`[ai-cache] warm ${model} failed (${e?.name || 'error'})`);
    }
  }
  return { refreshed: any, reason: any ? 'ok' : 'failed' };
}
