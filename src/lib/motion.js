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

// scrollIntoView / scrollTo の behavior。動きを減らす設定なら 'auto'（飛ぶ）・そうでなければ 'smooth'（2026-10-11）。
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

// 閉じる動きを待つ時間（ms）。動きを減らす設定なら 0。
// 動きの秒数（tokens.css の --duration-fast / --duration-base の写し・テストで一致を確かめる）。JS の setTimeout で待つときはこれを使う。
export const DURATION_FAST_MS = 200;
export const DURATION_BASE_MS = 300;

export function closeDelayMs(ms) {
  return prefersReducedMotion() ? 0 : ms;
}
