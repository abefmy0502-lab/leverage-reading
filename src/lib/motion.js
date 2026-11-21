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

// いちばん近い「中を送れる箱」（overflow-y が auto / scroll で、中が溢れている祖先）。無ければ null（ページそのもの）。
export function scrollParentOf(el) {
  if (typeof window === 'undefined') return null;
  let n = el?.parentElement || null;
  while (n && n !== document.body && n !== document.documentElement) {
    const oy = window.getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return null;
}

// el を見える所まで最小限だけ送る（scrollIntoView の block: 'nearest' の代わり・2026-11-21）。
//   送るのはいちばん近い箱の中だけ。scrollIntoView は外の箱やページまで動かし、iPhone でキーボードが出ていると
//   画面全体が上へずれた。キーボードで隠れた所（visualViewport の外）も「見えていない」と数える。箱より高いときは上端を見せる。
export function revealInScroller(el, { gap = 16 } = {}) {
  if (!el || typeof window === 'undefined') return;
  const box = scrollParentOf(el);
  if (!box) {
    try { el.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }); } catch { /* ignore */ }
    return;
  }
  const r = el.getBoundingClientRect();
  const c = box.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const bottom = Math.min(c.bottom, viewBottom);
  let delta = 0;
  if (r.bottom + gap > bottom) delta = r.bottom + gap - bottom;
  if (r.top - delta < c.top) delta = r.top - c.top - gap;
  if (Math.abs(delta) < 1) return;
  try { box.scrollTo({ top: box.scrollTop + delta, behavior: scrollBehavior() }); } catch { box.scrollTop += delta; }
}
