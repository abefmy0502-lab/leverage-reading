// 🧭 Jev（TypeSafe AI の判断のモデル）にアプリから決めてもらう（2026-10-02・docs/jev-plan.md）。
//
// Jev は「良くする」だけ。使えないときはいつも null を返し、呼び出し側はこれまでの決め方
// （語の重なり・端末の中の計算）で続ける。例外は投げない・画面に案内も出さない・トークンも使わない。
// 使うのは次のどれもがそろったときだけ:
//   - アプリのスイッチ VITE_AI_JEV=on（lib/aiProcessors.js の AI_JEV_ON・お試しモードは ?jev=1）
//   - ログインしている
//   - いまの版（2）の同意がある（ここでは同意のシートを出さない＝聞かずに送らない・lib/aiConsent.js）
// サーバー側でも、スイッチ・用途ごとのスイッチ・プラン・同意の版を確かめる（api/_jevRelay.js）。
//
// 送るのは「材料」だけ（問いの文はサーバーが作る）: purpose と jev（用途ごとの材料）。
import { supabase, isSupabaseConfigured } from './supabase';
import { apiUrl } from './apiUrl';
import { AI_JEV_ON } from './aiProcessors';
import { currentAiConsentVersion, AI_CONSENT_HEADER } from './aiConsent';

// サーバーの JEV_CONSENT_VERSION（api/_aiRouting.js）と同じ。
export const JEV_MIN_CONSENT = 2;
// 通信を含めた待ちの上限（サーバーは 1.5 秒で打ち切る）。
export const JEV_CLIENT_TIMEOUT_MS = 2500;

export function jevClientOn() {
  return AI_JEV_ON && isSupabaseConfigured;
}

// 同意（聞かない）: いまの版に同意していて、その版が 2 以上なら、その版。
async function jevConsentOk() {
  try {
    const v = await currentAiConsentVersion();
    return Number(v) >= JEV_MIN_CONSENT ? v : null;
  } catch {
    return null;
  }
}

// 決めてもらう。戻り値: 用途ごとの結果（api/_jevTasks.js の *Result）か null。
export async function askJev(purpose, input, { signal = null, timeoutMs = JEV_CLIENT_TIMEOUT_MS } = {}) {
  if (!jevClientOn() || !purpose || !input) return null;
  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  } catch { token = null; }
  if (!token) return null;
  const version = await jevConsentOk();
  if (!version) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) { clearTimeout(timer); return null; }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(apiUrl('/api/claude'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [AI_CONSENT_HEADER]: String(version) },
      body: JSON.stringify({ purpose, jev: input }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.jev?.result || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
