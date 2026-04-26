// Horizontal swipe-to-reveal-delete for a card. Only intercepts the touch when
// the user moves more horizontally than vertically (= not scrolling). Returns
// the current swipe offset (positive = pixels swiped left) and a `bind` for
// the touch handlers.

import { useCallback, useRef, useState } from 'react';

export function useSwipeToDelete({ onDelete, threshold = 80, maxSwipe = 200 } = {}) {
  const [offset, setOffset] = useState(0);
  const [armed, setArmed] = useState(false); // whether release will trigger delete
  const [isDeleting, setIsDeleting] = useState(false);
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const directionRef = useRef(null); // 'horizontal' | 'vertical' | null
  const offsetRef = useRef(0);

  const setOffsetState = useCallback((v) => {
    offsetRef.current = v;
    setOffset(v);
  }, []);

  const onTouchStart = useCallback((e) => {
    const t = e.touches?.[0];
    if (!t) return;
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    directionRef.current = null;
  }, []);

  const onTouchMove = useCallback(
    (e) => {
      if (startXRef.current === null) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      // Lock in axis after a small initial movement
      if (directionRef.current === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        directionRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }

      if (directionRef.current !== 'horizontal') return;

      // Allow only left swipe (dx < 0)
      const next = Math.max(-maxSwipe, Math.min(0, dx));
      const positive = -next;
      setOffsetState(positive);
      setArmed(positive >= threshold);
    },
    [maxSwipe, threshold, setOffsetState]
  );

  const onTouchEnd = useCallback(() => {
    if (offsetRef.current >= threshold) {
      setIsDeleting(true);
      // Slide fully off-screen then notify
      setOffsetState(maxSwipe);
      setTimeout(() => {
        try { onDelete?.(); } catch { /* ignore */ }
      }, 220);
    } else {
      setOffsetState(0);
    }
    setArmed(false);
    startXRef.current = null;
    startYRef.current = null;
    directionRef.current = null;
  }, [threshold, maxSwipe, onDelete, setOffsetState]);

  const onTouchCancel = useCallback(() => {
    setOffsetState(0);
    setArmed(false);
    startXRef.current = null;
    startYRef.current = null;
    directionRef.current = null;
  }, [setOffsetState]);

  return {
    offset,
    armed,
    isDeleting,
    bind: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
  };
}

export default useSwipeToDelete;
