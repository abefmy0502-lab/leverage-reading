// iOS-style edge swipe back. Listens to window touches so any screen can
// register a "go back" gesture without wrapping the whole subtree.
//
// Activates only when the touch starts within `edgeWidth` of the left edge,
// then tracks rightward drag. Release past `threshold` calls onBack.

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_EDGE_WIDTH = 24;
const DEFAULT_THRESHOLD = 80;
const MAX_VISIBLE_OFFSET = 200;

export function useEdgeSwipeBack({
  onBack,
  edgeWidth = DEFAULT_EDGE_WIDTH,
  threshold = DEFAULT_THRESHOLD,
  enabled = true,
} = {}) {
  const [offset, setOffset] = useState(0);
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const directionRef = useRef(null);
  const offsetRef = useRef(0);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const setOffsetState = useCallback((v) => {
    offsetRef.current = v;
    setOffset(v);
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
      if (offsetRef.current >= threshold) {
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

  return { offset };
}

export default useEdgeSwipeBack;
