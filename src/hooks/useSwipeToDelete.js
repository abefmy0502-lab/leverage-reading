// Horizontal swipe-to-reveal-delete for a card. Only intercepts the touch when
// the user moves more horizontally than vertically (= not scrolling). Returns
// the current swipe offset (positive = pixels swiped left) and a `bind` for
// the touch handlers.

import { useCallback, useEffect, useRef, useState } from 'react';

// immediate: 指を離した瞬間に onDelete を呼ぶ（滑り出す動きは呼ぶ側が受け持つ・SwipeableCard）。
//   「元に戻す」の知らせが、カードが消え終わるのを待たずに指を離したときに出る（2026-09-30）。
export function useSwipeToDelete({ onDelete, threshold = 80, maxSwipe = 200, immediate = false } = {}) {
  const [offset, setOffset] = useState(0);
  const [armed, setArmed] = useState(false); // whether release will trigger delete
  const [isDeleting, setIsDeleting] = useState(false);
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const directionRef = useRef(null); // 'horizontal' | 'vertical' | null
  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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
    if (offsetRef.current >= threshold && immediate) {
      setIsDeleting(true);
      Promise.resolve()
        .then(() => onDelete?.())
        .catch(() => { /* ignore */ })
        .finally(() => {
          // 取り消し・失敗でカードがまだ残っていれば、元の位置へ戻す。
          setTimeout(() => {
            if (!mountedRef.current) return;
            setIsDeleting(false);
            setOffsetState(0);
          }, 400);
        });
    } else if (offsetRef.current >= threshold) {
      setIsDeleting(true);
      // Slide fully off-screen then notify
      setOffsetState(maxSwipe);
      setTimeout(async () => {
        try { await onDelete?.(); } catch { /* ignore */ }
        // 削除が取り消された（確認で「キャンセル」）・失敗したときは、カードがまだ画面に残る。
        // ずれたまま・赤い引き出しが出たままにせず、元の位置へ戻す（2026-09-27）。
        setTimeout(() => {
          if (!mountedRef.current) return;
          setIsDeleting(false);
          setOffsetState(0);
        }, 400);
      }, 220);
    } else {
      setOffsetState(0);
    }
    setArmed(false);
    startXRef.current = null;
    startYRef.current = null;
    directionRef.current = null;
  }, [threshold, maxSwipe, onDelete, setOffsetState, immediate]);

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
