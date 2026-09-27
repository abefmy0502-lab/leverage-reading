// 🎁 登録直後のお試し（価値を感じる前に有料プランの画面を出さない・2026-09-27）。
//
// 未課金でも、アカウント作成から FREE_WINDOW_HOURS 以内なら、アプリに入って
// 初日クイックスタートと相談を FREE_AI_CALLS 回まで試せる（AI の回数はサーバーの
// api/claude.js が ai_usage の period_month='free' 行で数える＝真実はサーバー）。
// ここの 2 つの値は api/claude.js の既定（AI_FREE_CALL_LIMIT / AI_FREE_WINDOW_HOURS）と揃える。
//
// 使い切ったあとの AI 呼び出しはサーバーが 402 を返す。ai.js / streamClaude.js は
// 402 を受けたら requestPaywall() で有料プランの画面を開く（App の PaywallGate が受ける）。

import { supabase, isSupabaseConfigured } from './supabase';

export const FREE_AI_CALLS = 3;
export const FREE_WINDOW_HOURS = 72;

export function inFreeWindow(user, now = Date.now()) {
  const t = Date.parse(user?.created_at || '');
  return Number.isFinite(t) && now - t < FREE_WINDOW_HOURS * 3600 * 1000;
}

// お試しで使った AI の回数（ai_usage の 'free' 行・本人の行だけ読める）。読めなければ 0。
export async function fetchFreeUsed(userId) {
  if (!isSupabaseConfigured || !userId) return 0;
  try {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('calls')
      .eq('user_id', userId)
      .eq('period_month', 'free')
      .maybeSingle();
    if (error) return 0;
    return Math.max(0, Number(data?.calls) || 0);
  } catch {
    return 0;
  }
}

export const PAYWALL_EVENT = 'orime:paywall';

// 有料プランの画面を開いてもらう（reason: 'free_used' | 'subscription_required'）。
export function requestPaywall(reason = 'free_used') {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(PAYWALL_EVENT, { detail: { reason } })); } catch { /* ignore */ }
}

// サーバーの 402 の error_code から、有料プランの画面を開くべきか。
export function isPaywallError(status, code) {
  return status === 402 && (code === 'free_limit_reached' || code === 'subscription_required');
}
