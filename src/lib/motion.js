// 🎞 動きを減らす設定（prefers-reduced-motion）への小さな手助け（2026-09-30）。
// シート・設定を閉じるときの「滑り下ろしを待つ時間」は、動きを減らす設定ではすぐ閉じる
// （動かないのに透明の背景が 0.2 秒残り、下の画面を押せない時間ができていた）。

export function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

// 閉じる動きを待つ時間（ms）。動きを減らす設定なら 0。
export function closeDelayMs(ms) {
  return prefersReducedMotion() ? 0 : ms;
}
