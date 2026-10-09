// 🪙 トークンの量の定数だけ（supabase を読み込まない）。紹介ページ（LP）の初回読み込みを軽くするため
// src/lib/tokens.js から分けた。値を変えるときは api/_aiAccess.js の既定とも揃える（tokens.test.js が確かめる）。
export const AI_TOKEN_JPY = 0.3;
export const FREE_TOKENS = 30;
// 🌱 無料プランのはじめの月（アカウントを作った日本時間の月）だけのトークン（2026-10-09 オーナー裁定）。
//    api/_aiAccess.js の AI_FREE_FIRST_MONTH_TOKENS の既定と揃える。
export const FREE_FIRST_MONTH_TOKENS = 60;
export const TRIAL_TOKENS = 150;
export const PAID_TOKENS = 800;
// 📷 無料プランの写真から書き起こし（1 か月の回数・2026-10-02）。api/_aiAccess.js の AI_FREE_OCR_PER_MONTH の既定と揃える。
export const FREE_OCR_PER_MONTH = 10;

// 💬 量の目安は「AI の答え 約 N 回」（AI の答え 1 回 約 10 トークン・2026-10-09 コーディネーター裁定）。
//    相談 1 つは、聞き返しを含めて 2〜3 回の答え（この補足は有料プランの画面の目安・LP の注記・設定の説明に 1 回だけ）。
//    「相談 1 つ＝約 30」に揃えるとプランが小さく見え、原価もキャッシュで会話 1 つ 約 13 トークンの見積もりがあり不確かなため。
export const ANSWER_TOKENS = 10;
export const CONSULT_ANSWERS_NOTE = '相談 1 つは、聞き返しを含めて 2〜3 回の答えです';
// トークン → AI の答え何回（四捨五入・残りが少しでもあれば 1＝サーバーの「最後の 1 回」で始められる）。
export function answersOf(tokens) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  if (t <= 0) return 0;
  return Math.max(1, Math.round(t / ANSWER_TOKENS));
}
// 「約 3 回」「約 80 回」。
export function answerCountLabel(tokens) {
  return `約 ${answersOf(tokens).toLocaleString('ja-JP')} 回`;
}
// 残りのトークンで、あと AI の答え何回（切り捨て＝言い過ぎない・残りがあれば 1）。「約 5 回」。
export function remainingAnswersLabel(tokens) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  const n = t <= 0 ? 0 : Math.max(1, Math.floor(t / ANSWER_TOKENS));
  return `約 ${n.toLocaleString('ja-JP')} 回`;
}

// 🌱 はじめの月か（アカウントを作った日本時間の月＝いまの日本時間の月）。表示だけ（決めるのはサーバー）。
//    createdAt が読めなければ false（サーバーと同じく毎月の量で見せる）。
export function isFreeFirstMonth(createdAt, now = Date.now()) {
  const t = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt || '');
  const n = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  const month = (x) => new Date(x + 9 * 3600 * 1000).toISOString().slice(0, 7);
  return month(t) === month(n);
}
// この人の今月の無料のトークン（はじめの月は 60・それ以降は 30）。
export function freeTokensFor(createdAt, now = Date.now()) {
  return isFreeFirstMonth(createdAt, now) ? Math.max(FREE_TOKENS, FREE_FIRST_MONTH_TOKENS) : FREE_TOKENS;
}
