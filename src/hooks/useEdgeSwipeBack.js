// iOS-style edge swipe back. Listens to window touches so any screen can
// register a "go back" gesture without wrapping the whole subtree.
//
// Activates only when the touch starts within `edgeWidth` of the left edge,
// then tracks rightward drag. Release past `threshold` calls onBack.

import { useCallback, useEffect, useRef } from 'react';

// 書きかけの入力（メモのシート・全画面エディタ・下から出るシート）が開いている間は、
// 左端スワイプで画面を戻さない（確認なしに下書きが消える事故の防止・2026-09-27）。
// 開いている部品が useBlockEdgeSwipe(true) で数を足し、閉じたら戻す。
let blockers = 0;
export function useBlockEdgeSwipe(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    blockers += 1;
    return () => { blockers = Math.max(0, blockers - 1); };
  }, [active]);
}

const DEFAULT_EDGE_WIDTH = 24;
const DEFAULT_THRESHOLD = 80;
const MAX_VISIBLE_OFFSET = 200;

export function useEdgeSwipeBack({
  onBack,
  edgeWidth = DEFAULT_EDGE_WIDTH,
  threshold = DEFAULT_THRESHOLD,
  enabled = true,
} = {}) {
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const directionRef = useRef(null);
  const offsetRef = useRef(0);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // 指の移動量は ref だけに持つ（state にすると指が動くたびにアプリ全体が描き直される）。
  const setOffsetState = useCallback((v) => {
    offsetRef.current = v;
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const handleStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      if (t.clientX > edgeWidth) {
        startXRef.current = null;
        return;
      }
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      directionRef.current = null;
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
      }
      if (directionRef.current !== 'horizontal') return;
      if (dx <= 0) {
        setOffsetState(0);
        return;
      }
      setOffsetState(Math.min(dx, MAX_VISIBLE_OFFSET));
    };

    const handleEnd = () => {
      if (startXRef.current === null) return;
      if (offsetRef.current >= threshold && blockers === 0) {
        try { onBackRef.current?.(); } catch { /* ignore */ }
      }
      setOffsetState(0);
      startXRef.current = null;
      startYRef.current = null;
      directionRef.current = null;
    };

    window.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd, { passive: true });
    window.addEventListener('touchcancel', handleEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [enabled, edgeWidth, threshold, setOffsetState]);

  return { offsetRef };
}

export default useEdgeSwipeBack;
