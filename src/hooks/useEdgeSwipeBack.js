// iOS-style edge swipe back. Listens to window touches so any screen can
// register a "go back" gesture without wrapping the whole subtree.
//
// Activates only when the touch starts within `edgeWidth` of the left edge,
// then tracks rightward drag (the screen from getTarget() follows the finger).
// Release past `threshold` slides the screen out and calls onBack.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { hasBackLayers } from './useHistoryBack';

// 書きかけの入力（メモのシート・全画面エディタ・下から出るシート）が開いている間は、
// 左端スワイプで画面を戻さない（確認なしに下書きが消える事故の防止・2026-09-27）。
// 開いている部品が useBlockEdgeSwipe(true) で数を足し、閉じたら戻す。
let blockers = 0;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
export function useBlockEdgeSwipe(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    blockers += 1;
    notify();
    return () => { blockers = Math.max(0, blockers - 1); notify(); };
  }, [active]);
}
// ブラウザの「戻る」（useHistoryBack）も同じ条件で止める。
export const isBackBlocked = () => blockers > 0;
// シートが開いているかを画面の深さに足すための購読（一番上の画面でも履歴を 1 つ積み、
// 「戻る」でアプリごと離れて書きかけが消えないようにする・2026-09-29）。
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function useBackBlocked() {
  return useSyncExternalStore(subscribe, isBackBlocked, () => false);
}

const DEFAULT_EDGE_WIDTH = 24;
const DEFAULT_THRESHOLD = 80;

const reducedMotion = () => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; }
};
const cssVar = (name, fallback) => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
};
const ms = (v) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return /ms$/.test(v) ? n : n * 1000;
};
// 戻った先の画面を、押し込みの逆向き（左から少し）で出す。動きを減らす設定では出さない。
function playPop(el) {
  if (!el?.animate || reducedMotion()) return;
  try {
    el.animate(
      [{ opacity: 0, transform: `translate3d(-${cssVar('--space-6', '24px')}, 0, 0)` }, { opacity: 1, transform: 'none' }],
      { duration: ms(cssVar('--duration-base', '300ms')) * 0.85, easing: cssVar('--ease-out', 'ease-out') },
    );
  } catch { /* ignore */ }
}

// iOS の「端から戻る」: 指に合わせて今の画面（getTarget が返す要素）を右へずらし、
// 離したとき・閾値を越えていれば右へ送り出してから onBack、越えていなければ元の位置へ戻す（2026-09-29）。
//   getTarget   : 動かす画面の要素を返す関数（無ければ従来どおり動かさずに判定だけ）
//   beforeBack  : 戻ってよいか（未保存の確認など）。false なら元の位置へ戻す
export function useEdgeSwipeBack({
  onBack,
  edgeWidth = DEFAULT_EDGE_WIDTH,
  threshold = DEFAULT_THRESHOLD,
  enabled = true,
  getTarget,
  beforeBack,
} = {}) {
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const directionRef = useRef(null);
  const offsetRef = useRef(0);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;
  const beforeBackRef = useRef(beforeBack);
  beforeBackRef.current = beforeBack;

  // 指の移動量は ref だけに持つ（state にすると指が動くたびにアプリ全体が描き直される）。
  const setOffsetState = useCallback((v) => {
    offsetRef.current = v;
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    let el = null;
    // 画面の外に固定で浮いているボタン（本の詳細の「メモを書く」＝data-fab）も画面と一緒に動かす
    // （画面だけが右へ流れて、ボタンが元の場所に取り残されていた・2026-09-30）。
    let fab = null;
    let raf = 0;
    let settling = false;
    const findFab = (node) => {
      try {
        const f = document.querySelector('[data-fab]');
        return f && !(node && node.contains(f)) ? f : null;
      } catch { return null; }
    };

    const paint = () => {
      raf = 0;
      if (!el) return;
      const x = offsetRef.current;
      el.style.transition = 'none';
      el.style.transform = x > 0 ? `translate3d(${x}px, 0, 0)` : '';
      el.style.boxShadow = x > 0 ? 'var(--shadow-overlay)' : '';
      if (fab) {
        fab.style.transition = 'none';
        fab.style.transform = x > 0 ? `translate3d(${x}px, 0, 0)` : '';
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const clearStyles = (node) => {
      if (!node) return;
      node.style.transition = '';
      node.style.transform = '';
      node.style.boxShadow = '';
      node.style.willChange = '';
    };
    // 離したあとの動き（transition）。終わったら（または届かなくても一定時間で）done。
    const animateTo = (node, x, done, companion = null) => {
      if (!node) { done?.(); return; }
      const dur = reducedMotion() ? 0 : ms(cssVar('--duration-fast', '200ms'));
      [node, companion].forEach((n) => {
        if (!n) return;
        n.style.transition = `transform ${dur}ms ${cssVar('--ease-out', 'ease-out')}`;
        n.style.transform = x > 0 ? `translate3d(${x}px, 0, 0)` : '';
      });
      window.setTimeout(() => done?.(), dur + 20);
    };

    const handleStart = (e) => {
      const t = e.touches?.[0];
      if (!t || settling) return;
      // 書きかけのシート・重ねて開いたもの（設定・ヘルプなど）がある間は、下の画面を戻さない。
      if (t.clientX > edgeWidth || blockers > 0 || hasBackLayers()) {
        startXRef.current = null;
        return;
      }
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      directionRef.current = null;
      el = null;
      setOffsetState(0);
    };

    const handleMove = (e) => {
      if (startXRef.current === null) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      if (directionRef.current === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        directionRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        if (directionRef.current === 'horizontal') {
          try { el = getTargetRef.current?.() || null; } catch { el = null; }
          if (el) el.style.willChange = 'transform';
          fab = el ? findFab(el) : null;
          if (fab) fab.style.willChange = 'transform';
        }
      }
      if (directionRef.current !== 'horizontal') return;
      setOffsetState(Math.max(0, dx));
      schedule();
    };

    const reset = () => {
      startXRef.current = null;
      startYRef.current = null;
      directionRef.current = null;
    };

    const handleEnd = () => {
      if (startXRef.current === null) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const node = el;
      const companion = fab;
      el = null;
      fab = null;
      const passed = directionRef.current === 'horizontal'
        && offsetRef.current >= threshold && blockers === 0 && !hasBackLayers();
      setOffsetState(0);
      reset();
      if (!passed) {
        animateTo(node, 0, () => { clearStyles(node); clearStyles(companion); }, companion);
        return;
      }
      settling = true;
      (async () => {
        let ok = true;
        try { ok = beforeBackRef.current ? (await beforeBackRef.current()) !== false : true; } catch { ok = false; }
        if (!ok) {
          animateTo(node, 0, () => { clearStyles(node); clearStyles(companion); settling = false; }, companion);
          return;
        }
        const width = window.innerWidth || 390;
        animateTo(node, width, async () => {
          try { await onBackRef.current?.(); } catch { /* ignore */ }
          // 同じ要素のまま中身だけ替わる画面（すべての本 → ホーム）は、位置を戻して左から出す。
          requestAnimationFrame(() => {
            if (node?.isConnected) { clearStyles(node); playPop(node); }
            if (companion?.isConnected) clearStyles(companion);
            settling = false;
          });
        }, companion);
      })();
    };

    window.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd, { passive: true });
    window.addEventListener('touchcancel', handleEnd, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (el) clearStyles(el);
      if (fab) clearStyles(fab);
      window.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [enabled, edgeWidth, threshold, setOffsetState]);

  return { offsetRef };
}

export default useEdgeSwipeBack;
