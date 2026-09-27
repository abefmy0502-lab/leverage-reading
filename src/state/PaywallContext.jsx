// 🎁 お試し中の状態と「有料プランの画面を開く」を、アプリの中から使うための入口。
// 値を出すのは App.jsx の PaywallGate。契約中・管理者は freeMode=false。
import { createContext, useContext } from 'react';

const noop = () => {};
export const PaywallContext = createContext({
  freeMode: false, // お試し中（未課金で、登録直後の枠の中）
  freeRemaining: 0, // お試しで残っている AI の回数（目安。真実はサーバー）
  refreshFree: noop, // AI を使ったあとに残りを取り直す
  openPaywall: noop, // 有料プランの画面を開く（reason: 'free_used' 等）
});

export const usePaywall = () => useContext(PaywallContext);
