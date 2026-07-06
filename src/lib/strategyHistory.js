// 📝 AI 読書計画（セットアップシート）の 1 ステップ Undo 用ヒストリー。
//
// 「AI に整える」で上書きする直前の投資戦略テキストを localStorage に退避し、
// 直後の 1 回だけ「元に戻す」を可能にする。本ごとに 1 スロット・純粋な副作用のみ
// （component state に依存しない）ため App.jsx から切り出して単一責務化した。

const STRATEGY_HISTORY_KEY = (bookId) => `aiStrategyHistory:${bookId}`;

export function saveStrategyHistory(bookId, prevStrategy) {
  if (!bookId || typeof prevStrategy !== 'string') return;
  try { localStorage.setItem(STRATEGY_HISTORY_KEY(bookId), prevStrategy); } catch { /* quota/private */ }
}

export function popStrategyHistory(bookId) {
  if (!bookId) return null;
  try {
    const v = localStorage.getItem(STRATEGY_HISTORY_KEY(bookId));
    if (!v) return null;
    localStorage.removeItem(STRATEGY_HISTORY_KEY(bookId));
    return v;
  } catch { return null; }
}

export function hasStrategyHistory(bookId) {
  if (!bookId) return false;
  try { return !!localStorage.getItem(STRATEGY_HISTORY_KEY(bookId)); } catch { return false; }
}

export function clearStrategyHistory(bookId) {
  if (!bookId) return;
  try { localStorage.removeItem(STRATEGY_HISTORY_KEY(bookId)); } catch { /* ignore */ }
}
