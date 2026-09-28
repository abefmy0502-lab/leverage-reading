// 🎁 プラン（フリーミアム）・残りのトークン・「有料プランの画面を開く」を、アプリの中から使うための入口。
// 値を出すのは App.jsx の PaywallGate。
//   plan: 'free'（無料プラン＝ずっと無料・AI は相談だけ）| 'trial'（プランの 7 日間無料）| 'paid' | 'admin'
//   tokensRemaining / tokenAllowance: 今月（無料期間はまるごと）の残り・量（src/lib/tokens.js。null＝不明）
//   purchasedTokens: 追加トークン（買い足し・購入から 180 日）の残り。使う順は その月の分 → 追加分
import { createContext, useContext } from 'react';

const noop = () => {};
export const PaywallContext = createContext({
  plan: null,
  freeMode: false, // 無料プラン（契約なし）
  trialEndsAt: null, // 無料期間が終わる日時（無料期間のときだけ）
  tokenAllowance: null,
  tokensRemaining: null,
  purchasedTokens: 0, // 追加トークン（買い足し）の残り（期限内）
  purchasedExpiresAt: null, // 追加分のいちばん近い期限
  tokensAvailable: null, // その月の残り＋追加分
  canBuyTokens: false, // 買い足せるのはプランの人（有料・7 日間無料）だけ
  hadPlan: false, // 前にプランを契約していた無料プランの人（無料期間はもう使えない）
  openTokenSheet: noop, // 「トークンを追加」のシートを開く
  refreshTokens: noop, // AI を使ったあとに残りを取り直す（追加分が増えたら true）
  freeRemaining: null, // 旧名: 無料プランの残りのトークン
  refreshFree: noop, // 旧名: refreshTokens
  openPaywall: noop, // 有料プランの画面を開く（reason: 'free_used' | 'feature' | 'grown' | null, feature: 機能の名前）
  requirePlan: () => true, // プランの AI 機能の入口で呼ぶ。無料プランなら画面を開いて false
});

export const usePaywall = () => useContext(PaywallContext);
