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

// 💬 相談 1 つ＝聞き返し 2 回＋答えで 約 3 往復＝約 30 トークン（1 回の答えは 約 10・2026-10-09）。
//    「相談 約 N 回」（答え 1 回ずつ）だと、はじめての相談 1 つで無料の月が尽きる実態と食い違ったので、
//    量の目安は「相談 約 N つ」で数える。
export const CONSULT_THREAD_TOKENS = 30;
// トークン → 相談いくつ（四捨五入・残りが少しでもあれば 1＝サーバーの「最後の 1 回」で始められる）。
export function consultsOf(tokens) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  if (t <= 0) return 0;
  return Math.max(1, Math.round(t / CONSULT_THREAD_TOKENS));
}
// 「約 2 つ」「約 27 件」（「つ」は 9 まで・10 からは「件」）。
export function consultCountLabel(tokens) {
  const n = consultsOf(tokens);
  return `約 ${n.toLocaleString('ja-JP')} ${n <= 9 ? 'つ' : '件'}`;
}

// 残りのトークンで、あと相談いくつ（切り捨て＝言い過ぎない・残りがあれば 1）。「約 1 つ」。
export function remainingConsultsLabel(tokens) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  if (t <= 0) return '約 0 つ';
  const n = Math.max(1, Math.floor(t / CONSULT_THREAD_TOKENS));
  return `約 ${n.toLocaleString('ja-JP')} ${n <= 9 ? 'つ' : '件'}`;
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
