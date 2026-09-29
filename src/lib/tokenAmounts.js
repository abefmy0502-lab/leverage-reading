// 🪙 トークンの量の定数だけ（supabase を読み込まない）。紹介ページ（LP）の初回読み込みを軽くするため
// src/lib/tokens.js から分けた。値を変えるときは api/_aiAccess.js の既定とも揃える（tokens.test.js が確かめる）。
export const AI_TOKEN_JPY = 0.3;
export const FREE_TOKENS = 30;
export const TRIAL_TOKENS = 150;
export const PAID_TOKENS = 800;
