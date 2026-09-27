// 🎁 プラン（フリーミアム）・残りのトークン・「有料プランの画面を開く」を、アプリの中から使うための入口。
// 値を出すのは App.jsx の PaywallGate。
//   plan: 'free'（契約なし・AI は相談だけ）| 'trial'（7 日間無料）| 'paid' | 'admin'
//   tokensRemaining / tokenAllowance: 今月（無料期間はまるごと）の残り・量（src/lib/tokens.js。null＝不明）
import { createContext, useContext } from 'react';

const noop = () => {};
export const PaywallContext = createContext({
  plan: null,
  freeMode: false, // 無料プラン（契約なし）
  trialEndsAt: null, // 無料期間が終わる日時（無料期間のときだけ）
  tokenAllowance: null,
  tokensRemaining: null,
  refreshTokens: noop, // AI を使ったあとに残りを取り直す
  freeRemaining: null, // 旧名: 無料プランの残りのトークン
  refreshFree: noop, // 旧名: refreshTokens
  openPaywall: noop, // 有料プランの画面を開く（reason: 'free_used' | 'feature' | null, feature: 機能の名前）
  requirePlan: () => true, // プランの AI 機能の入口で呼ぶ。無料プランなら画面を開いて false
});

export const usePaywall = () => useContext(PaywallContext);
