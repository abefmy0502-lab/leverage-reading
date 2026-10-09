// 🎁 無料プラン（フリーミアム・2026-09-27 オーナー裁定）と、有料プランの画面を開く合図。
//
// 契約していない人も、メモ・記録・振り返り・行動・取り込み・書き出し・シェアはずっと無料で使える
// （起動時の有料プランの画面は無い）。AI は 💬 相談だけ、毎月 FREE_TOKENS トークン（src/lib/tokens.js・
// AI の答え 約 3 回・はじめの月は 60＝約 6 回）。ほかの AI 機能（AI 選書・読書計画シート・写真から書き起こす・凝縮・
// まとめを作る）はプランで使える。📷 写真から書き起こすだけは、無料プランでも別枠で毎月 10 回
// （相談のトークンは使わない・src/lib/freeOcr.js・2026-10-02）。数えて止めるのはサーバー（api/claude.js・api/_aiAccess.js）。
//
// サーバーの 402 は ai.js / streamClaude.js が受けて requestPaywall() で有料プランの画面を
// アプリの上に重ねて開く（App の PaywallGate が受ける・いつでも閉じられる）:
//   free_limit_reached → reason 'free_used'（今月の無料のトークンを使い切った）
//   plan_required      → reason 'feature'（プランで使える機能を押した）
//   free_ocr_limit_reached → reason 'free_ocr_used'（今月の無料の写真から書き起こし 10 回を使い切った・2026-10-02）

export { FREE_TOKENS as FREE_AI_TOKENS } from './tokens';

export const PAYWALL_EVENT = 'orime:paywall';

// AI を 1 回使った（成功した）合図。「残り N トークン」をどの機能から使っても取り直す。
export const AI_USED_EVENT = 'orime:ai-used';
export function notifyAiUsed() {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new Event(AI_USED_EVENT)); } catch { /* ignore */ }
}

// 有料プランの画面を開いてもらう。
//   reason: 'free_used'（今月の無料のトークンを使い切った）| 'free_ocr_used'（今月の無料の写真から書き起こしを
//           使い切った）| 'feature'（プランの機能）| null（プランを見る）
//   feature: 'feature' のときの機能の名前（例「AI 選書」）。無ければ「この機能」。
export function requestPaywall(reason = 'feature', feature = '') {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(PAYWALL_EVENT, { detail: { reason, feature } })); } catch { /* ignore */ }
}

// サーバーの 402 の error_code から、有料プランの画面を開くべきか。
// subscription_required は旧サーバー（全機能有料の頃）の名前。念のため受ける。
export function isPaywallError(status, code) {
  return status === 402 && (code === 'free_limit_reached' || code === 'free_ocr_limit_reached'
    || code === 'plan_required' || code === 'subscription_required');
}
export function paywallReasonFor(code) {
  if (code === 'free_limit_reached') return 'free_used';
  if (code === 'free_ocr_limit_reached') return 'free_ocr_used';
  return 'feature';
}

// 「来月 1 日」（日本時間）。
export function nextResetLabelJa(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const m = jst.getUTCMonth() + 2;
  return `${m > 12 ? 1 : m}月1日`;
}
