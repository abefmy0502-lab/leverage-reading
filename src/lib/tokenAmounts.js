// 🪙 トークンの量の定数だけ（supabase を読み込まない）。紹介ページ（LP）の初回読み込みを軽くするため
// src/lib/tokens.js から分けた。値を変えるときは api/_aiAccess.js の既定とも揃える（tokens.test.js が確かめる）。
export const AI_TOKEN_JPY = 0.3;
export const FREE_TOKENS = 30;
// 🌱 無料プランのはじめの月（アカウントを作った日本時間の月）だけのトークン（2026-10-09 オーナー裁定）。
//    api/_aiAccess.js の AI_FREE_FIRST_MONTH_TOKENS の既定と揃える。
export const FREE_FIRST_MONTH_TOKENS = 130; // 2026-11-12 オーナー承認: 60 → 130（はじめの 2 か月は相談 約 5 件）。サーバーの AI_FREE_FIRST_MONTH_TOKENS の既定と同じ
export const TRIAL_TOKENS = 150;
export const PAID_TOKENS = 800;
// 📷 無料プランの写真から書き起こし（1 か月の回数・2026-10-02）。api/_aiAccess.js の AI_FREE_OCR_PER_MONTH の既定と揃える。
export const FREE_OCR_PER_MONTH = 10;

// 💬 量の目安は「AI の答え 約 N 回」（AI の答え 1 回 約 10 トークン・2026-10-09 コーディネーター裁定）。
//    相談 1 つは、聞き返しを含めて 2〜3 回の答え（この補足は有料プランの画面の目安・LP の注記・設定の説明に 1 回だけ）。
//    「相談 1 つ＝約 30」に揃えるとプランが小さく見え、原価もキャッシュで会話 1 つ 約 13 トークンの見積もりがあり不確かなため。
//    2026-11-25: 相談のモデルが Haiku 5.5（単価 1/10）になり、実際の 1 回は 約 1〜3 トークン（docs/ai-routing.md §11）。
//    画面の目安を 10 のままにすると、無料プランが実際よりずっと少なく見えていた（オーナー方針「無料会員を大切に」）
//    → キャッシュが冷えた長めの答え（約 2.4）でも超えない 3 に（言い過ぎない側の切り上げ）。
//    ⚠️ 相談を Haiku 4.5 に戻す（AI_CONSULT_MODEL=claude-haiku-4-5）ときは、ここも 10 に戻す（画面が多く約束しすぎないように・2026-11-26 点検）。
export const ANSWER_TOKENS = 3;
export const CONSULT_ANSWERS_NOTE = '相談 1 つは、聞き返しを含めて 2〜3 回の答えです';
// トークン → AI の答え何回（切り捨て＝言い過ぎない・残りが少しでもあれば 1＝サーバーの「最後の 1 回」で始められる）。
//   残りの数（remainingAnswersLabel）と同じ切り捨てにそろえた（800 トークンが「あと約 266 回」と「毎月 約 267 回」の 2 つの数に見えていた・2026-11-27 点検）。
export function answersOf(tokens) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  if (t <= 0) return 0;
  return Math.max(1, Math.floor(t / ANSWER_TOKENS));
}
// 「約」を付けて言うときは、細かな 1 の位を見せない（20 回からは 5 の、100 回からは 10 の単位に切り捨て・「約 43 回」→「約 40 回」・2026-11-28 提出前の点検）。
export function roughCount(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v < 20) return v;
  if (v < 100) return Math.floor(v / 5) * 5;
  return Math.floor(v / 10) * 10;
}
// 「約 3 回」「約 80 回」。
export function answerCountLabel(tokens) {
  return `約 ${roughCount(answersOf(tokens)).toLocaleString('ja-JP')} 回`;
}
// 🔍 AI 選書（聞き取り＋推薦）1 回の目安（tokens.js の TOKEN_COSTS.advisor と同じ・2026-11-25）。
export const ADVISOR_TOKENS = 20;
// 残りのトークンで、あと何回本を探せるか（切り捨て・残りがあれば 1＝最後の 1 回は始められる）。「約 1 回」。
// 本を探すのに要る最小のトークン（聞き取り 約 1 で使い切ると、推薦の 1 回を始められない・2026-11-26 点検）。
//   推薦は「最後の 1 回」の決まり（使ったトークンが上限未満なら始められる）で通るので、聞き取りのあとに 1 以上残ればよい。
export const ADVISOR_MIN_TOKENS = 3;
export function canStartAdvisor(tokens) {
  if (tokens == null || !Number.isFinite(Number(tokens))) return true; // 分からないときは止めない（サーバーが守る）
  return Math.floor(Number(tokens)) >= ADVISOR_MIN_TOKENS;
}
export function remainingAdvisorLabel(tokens) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  const n = t < ADVISOR_MIN_TOKENS ? 0 : Math.max(1, Math.floor(t / ADVISOR_TOKENS));
  return `約 ${n.toLocaleString('ja-JP')} 回`;
}
// 🔍 無料プランで本を探す前に、相談の答えがどれだけ減るかを見せる（2026-11-26 オーナー判断「今のまま・探す前に見せる」＝
//   AI 選書と相談は同じ毎月のトークンを使う）。{ before: '約 10 回', after: '約 3 回' }。残りが分からなければ null。
export function advisorConsultImpact(tokens) {
  if (tokens == null || !Number.isFinite(Number(tokens))) return null;
  const t = Math.max(0, Math.floor(Number(tokens)));
  if (t <= 0) return null;
  return { before: remainingAnswersLabel(t), after: remainingAnswersLabel(Math.max(0, t - ADVISOR_TOKENS)) };
}
// 残りのトークンで、あと AI の答え何回（切り捨て＝言い過ぎない・残りがあれば 1）。「約 5 回」。
export function remainingAnswersLabel(tokens) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  const n = t <= 0 ? 0 : Math.max(1, Math.floor(t / ANSWER_TOKENS));
  return `約 ${roughCount(n).toLocaleString('ja-JP')} 回`;
}

// 🪙 無料プランの画面（相談の上の行・初日クイックスタートのできあがり）では「AI の答え 約 N 回」だけを見せ、
//    トークンの数は残りが少ないとき（20 トークン以下）だけ添える（設定の画面はいつも数を出す・2026-10-11 オーナー判断）。
export const LOW_TOKENS_SHOW = 20;
export function showFreeTokenCount(remaining) {
  const t = Number(remaining);
  return Number.isFinite(t) && t > 0 && t <= LOW_TOKENS_SHOW;
}

// 🌱 はじめの月か（アカウントを作った日本時間の月＝いまの日本時間の月）。表示だけ（決めるのはサーバー）。
//    createdAt が読めなければ false（サーバーと同じく毎月の量で見せる）。
// はじめの 2 か月（作った月と翌月・2026-10-21・サーバーの AI_FREE_FIRST_MONTHS の写し）。
export const FREE_FIRST_MONTHS = 2;
export function isFreeFirstMonth(createdAt, now = Date.now()) {
  const t = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt || '');
  const n = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  const idx = (x) => { const d = new Date(x + 9 * 3600 * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
  const diff = idx(n) - idx(t);
  return diff >= 0 && diff < FREE_FIRST_MONTHS;
}
// 来月 1 日（日本時間）の時刻。
export function nextJstMonthStart(now = Date.now()) {
  const n = now instanceof Date ? now.getTime() : Number(now);
  const d = new Date(n + 9 * 3600 * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 9 * 3600 * 1000;
}
// この人の今月の無料のトークン（はじめの月は 60・それ以降は 30）。
export function freeTokensFor(createdAt, now = Date.now()) {
  return isFreeFirstMonth(createdAt, now) ? Math.max(FREE_TOKENS, FREE_FIRST_MONTH_TOKENS) : FREE_TOKENS;
}
