// 🪙 AI の「トークン」（見せ方・2026-09-27 オーナー裁定）。
//
// 1 トークン ≈ AI の原価 ¥0.3。サーバー（api/claude.js・api/_aiAccess.js）が円（1/1000 円）で数えて
// 止める。ここは画面に「残り N トークン」を出すための写し（止めるのはサーバー・真実は ai_usage）。
// 値を変えるときは api/_aiAccess.js の既定（AI_TOKEN_JPY / AI_FREE_TOKENS / AI_TRIAL_TOKENS /
// AI_PAID_TOKENS）と揃える（src/lib/tokens.test.js が確かめる）。
//
//   無料（契約なし）: 相談だけ・毎月 30 トークン（行 'free-YYYY-MM'）。はじめの月（アカウントを作った月）だけ 60
//   無料期間（7 日間）: すべての AI・期間まるごとで 150 トークン（行 'trial-YYYY-MM-DD'＝終わる日）
//   プラン: すべての AI・毎月 800 トークン（行 'YYYY-MM'）
//   追加トークン: プランの人が買い足せる（TOKEN_PACKS・購入から 180 日）

import { supabase, isSupabaseConfigured } from './supabase';

import {
  AI_TOKEN_JPY, FREE_TOKENS, FREE_FIRST_MONTH_TOKENS, TRIAL_TOKENS, PAID_TOKENS,
  ANSWER_TOKENS, CONSULT_ANSWERS_NOTE, answersOf, answerCountLabel, remainingAnswersLabel, isFreeFirstMonth, freeTokensFor,
} from './tokenAmounts';

export {
  AI_TOKEN_JPY, FREE_TOKENS, FREE_FIRST_MONTH_TOKENS, TRIAL_TOKENS, PAID_TOKENS,
  ANSWER_TOKENS, CONSULT_ANSWERS_NOTE, answersOf, answerCountLabel, remainingAnswersLabel, isFreeFirstMonth, freeTokensFor,
};

// 1 回あたりの目安（表示だけ。実際は材料の長さで前後する）。api/_aiCost.js の単価と、ふつうの大きさの
// 入出力から出して、切りのよい数に丸めた（2026-09-27）。
export const TOKEN_COSTS = {
  consult: 10, // 相談（まとめて）の AI の答え 1 回（量の目安の単位＝ANSWER_TOKENS と同じ）
  consultPerBook: 12, // 相談（本ごとに）
  advisor: 25, // AI 選書（聞き返し＋おすすめ）
  setupSheet: 6, // 読書計画シート
  bookBrief: 2, // この本で学べること（Flash-Lite・入力 約 3,000・出力 約 600 で ¥0.3〜0.5＝1〜2 トークン・2026-10-08）
  photoToText: 3, // 写真から書き起こす
  condense: 1, // 凝縮
  cardsToSummary: 3, // メモからまとめを作る
};

// 🪙➕ 追加トークン（買い足し・プランの人だけ）。App Store の消耗型の App 内課金（RevenueCat）。
// サーバーの api/_tokenLots.js（AI_TOKEN_PACKS）と揃える。VITE_TOKEN_PACKS='id:tokens:¥価格,…' で上書き。
// 価格の真実は App Store（ストアの値が取れないときだけ fallbackPrice を出す）。consults＝AI の答えの目安（「約 30 回」・2026-10-10 に「相談 約 30 回分」から GLOSSARY に合わせた）。
// 期限は購入から TOKEN_LOT_DAYS 日（資金決済法: 6 か月以内）。使う順は その月の分 → 追加分（期限の近い順）。
export const TOKEN_LOT_DAYS = 180;
const DEFAULT_TOKEN_PACKS = [
  { id: 'orime_tokens_300', tokens: 300, fallbackPrice: '¥300', tag: '' },
  { id: 'orime_tokens_1000', tokens: 1000, fallbackPrice: '¥800', tag: 'お得' },
];
function parsePacks(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const packs = raw.split(',').map((p) => {
    const [id, n, price] = p.split(':').map((x) => (x || '').trim());
    const tokens = Math.floor(Number(n));
    return id && tokens > 0 ? { id, tokens, fallbackPrice: price || '', tag: '' } : null;
  }).filter(Boolean);
  return packs.length ? packs : null;
}
export const TOKEN_PACKS = (parsePacks(import.meta.env?.VITE_TOKEN_PACKS) || DEFAULT_TOKEN_PACKS)
  .map((p) => ({ ...p, consults: answerCountLabel(p.tokens) }));

// 追加分の残り（期限内の合計）といちばん近い期限（本人の行だけ読める）。表が無い・読めないときは null。
export async function fetchLotBalance(userId) {
  if (!isSupabaseConfigured || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('ai_token_lots')
      .select('tokens_left, expires_at')
      .eq('user_id', userId)
      .gt('tokens_left', 0)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true });
    if (error) return null;
    const rows = Array.isArray(data) ? data : [];
    return {
      balance: rows.reduce((n, r) => n + Math.max(0, Math.floor(Number(r.tokens_left) || 0)), 0),
      nextExpiry: rows[0]?.expires_at || null,
    };
  } catch {
    return null;
  }
}

const TOKEN_MJPY = Math.round(AI_TOKEN_JPY * 1000);

// 使った原価（1/1000 円）→ トークン（切り上げ・サーバーと同じ）。
export function tokensFromMjpy(mjpy) {
  const m = Math.max(0, Number(mjpy) || 0);
  if (m === 0) return 0;
  return Math.ceil(m / TOKEN_MJPY - 1e-9);
}

// opts.createdAt（アカウントを作った日時）を渡すと、無料のはじめの月は 60（表示だけ・決めるのはサーバー）。
export function allowanceFor(plan, { createdAt = null, now = Date.now() } = {}) {
  if (plan === 'free') return freeTokensFor(createdAt, now);
  if (plan === 'trial') return TRIAL_TOKENS;
  if (plan === 'paid') return PAID_TOKENS;
  return null; // 管理者など（数えない）
}

// 来月 1 日に戻る量（無料のはじめの月の人も、来月は毎月の 30）。
export function nextMonthAllowanceFor(plan) {
  return allowanceFor(plan);
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

// 🪙 AI 選書・読書計画シートの実行ボタンのそばに出す 1 行（相談の上部の行と同じ言い方・2026-09-29）。
//   「1 回 約 25 トークン・今月の残り 742 トークン」（無料期間は「無料期間の残り」・追加分は「＋追加 N」）。
//   残りが分からない（管理者・読めない）ときは空（出さない）。
export function runCostLine({ plan, remaining, purchased = 0, cost }) {
  if (remaining == null || !Number.isFinite(Number(remaining))) return '';
  const fmt = (n) => (Number(n) || 0).toLocaleString('ja-JP');
  const extra = Number(purchased) > 0 ? ` ＋追加 ${fmt(purchased)}` : '';
  const left = `${plan === 'trial' ? '無料期間' : '今月'}の残り ${fmt(remaining)}${extra} トークン`;
  return cost ? `1 回 約 ${fmt(cost)} トークン・${left}` : left;
}
