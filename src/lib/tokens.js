// 🪙 AI の「トークン」（見せ方・2026-09-27 オーナー裁定）。
//
// 1 トークン ≈ AI の原価 ¥0.3。サーバー（api/claude.js・api/_aiAccess.js）が円（1/1000 円）で数えて
// 止める。ここは画面に「残り N トークン」を出すための写し（止めるのはサーバー・真実は ai_usage）。
// 値を変えるときは api/_aiAccess.js の既定（AI_TOKEN_JPY / AI_FREE_TOKENS / AI_TRIAL_TOKENS /
// AI_PAID_TOKENS）と揃える（src/lib/tokens.test.js が確かめる）。
//
//   無料（契約なし）: 相談だけ・毎月 30 トークン（行 'free-YYYY-MM'）
//   無料期間（7 日間）: すべての AI・期間まるごとで 150 トークン（行 'trial-YYYY-MM-DD'＝終わる日）
//   プラン: すべての AI・毎月 800 トークン（行 'YYYY-MM'）

import { supabase, isSupabaseConfigured } from './supabase';

export const AI_TOKEN_JPY = 0.3;
export const FREE_TOKENS = 30;
export const TRIAL_TOKENS = 150;
export const PAID_TOKENS = 800;

// 1 回あたりの目安（表示だけ。実際は材料の長さで前後する）。api/_aiCost.js の単価と、ふつうの大きさの
// 入出力から出して、切りのよい数に丸めた（2026-09-27）。
export const TOKEN_COSTS = {
  consult: 10, // 相談（まとめて）
  consultPerBook: 12, // 相談（本ごとに）
  advisor: 25, // AI 選書（聞き返し＋おすすめ）
  themeReport: 6, // テーマまとめ
  setupSheet: 6, // 読書計画シート
  photoToText: 3, // 写真から書き起こす
  condense: 1, // 凝縮
  cardsToSummary: 3, // メモからまとめを作る
};

const TOKEN_MJPY = Math.round(AI_TOKEN_JPY * 1000);

// 使った原価（1/1000 円）→ トークン（切り上げ・サーバーと同じ）。
export function tokensFromMjpy(mjpy) {
  const m = Math.max(0, Number(mjpy) || 0);
  if (m === 0) return 0;
  return Math.ceil(m / TOKEN_MJPY - 1e-9);
}

export function allowanceFor(plan) {
  if (plan === 'free') return FREE_TOKENS;
  if (plan === 'trial') return TRIAL_TOKENS;
  if (plan === 'paid') return PAID_TOKENS;
  return null; // 管理者など（数えない）
}

export function remainingTokens(allowance, usedMjpy) {
  if (allowance == null) return null;
  return Math.max(0, allowance - tokensFromMjpy(usedMjpy));
}

// 日本時間の 'YYYY-MM' / 'YYYY-MM-DD'。
const jstIso = (t) => new Date(t + 9 * 3600 * 1000).toISOString();
export function jstMonthKey(now = Date.now()) {
  return jstIso(now).slice(0, 7);
}

// どの行を読むか（サーバーの periodKeyFor と同じ）。
export function periodKeyFor(plan, { now = Date.now(), periodEnd = null } = {}) {
  const month = jstMonthKey(now);
  if (plan === 'free') return `free-${month}`;
  if (plan === 'trial') {
    const t = Date.parse(periodEnd || '');
    return Number.isFinite(t) ? `trial-${jstIso(t).slice(0, 10)}` : `trial-${month}`;
  }
  return month;
}

// その行で使った原価（1/1000 円・本人の行だけ読める）。行が無ければ 0、読めなければ null。
export async function fetchUsedMjpy(userId, periodKey) {
  if (!isSupabaseConfigured || !userId || !periodKey) return null;
  try {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('cost_mjpy')
      .eq('user_id', userId)
      .eq('period_month', periodKey)
      .maybeSingle();
    if (error) return null;
    return data ? Math.max(0, Number(data.cost_mjpy) || 0) : 0;
  } catch {
    return null;
  }
}

// 日本時間の「M月D日」（期限の表示）。
export function monthDayLabelJa(time) {
  const t = typeof time === 'number' ? time : Date.parse(time || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
