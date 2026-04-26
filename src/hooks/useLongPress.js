// Detects a 500ms+ press without movement, then fires onLongPress with the
// originating event (so callers can read clientX/Y for context-menu placement).
// Cancels on touchmove > 8px (treated as a scroll attempt) or touchend.

import { useCallback, useRef } from 'react';

const DEFAULT_DURATION = 500;
const MOVEMENT_TOLERANCE = 8; // px

export function useLongPress({ onLongPress, duration = DEFAULT_DURATION, onCancel } = {}) {
  const timerRef = useRef(null);
  const startPosRef = useRef(null);
  const triggeredRef = useRef(false);
  const originRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(
    (e) => {
      clear();
      if (!triggeredRef.current && onCancel) {
        try { onCancel(e); } catch { /* ignore */ }
      }
      startPosRef.current = null;
      originRef.current = null;
    },
    [clear, onCancel]
  );

  const start = useCallback(
    (e) => {
      if (!onLongPress) return;
      triggeredRef.current = false;
      const t = e.touches?.[0] || e;
      startPosRef.current = { x: t.clientX, y: t.clientY };
      // Capture a snapshot of the originating event so onLongPress callers
      // can use clientX / clientY even after the touch ends.
      originRef.current = { clientX: t.clientX, clientY: t.clientY, target: e.currentTarget };
      clear();
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        try {
          onLongPress(originRef.current);
        } catch {
          /* ignore caller errors */
        }
      }, duration);
    },
    [onLongPress, duration, clear]
  );

  const move = useCallback(
    (e) => {
      if (!startPosRef.current) return;
      const t = e.touches?.[0] || e;
      const dx = Math.abs(t.clientX - startPosRef.current.x);
      const dy = Math.abs(t.clientY - startPosRef.current.y);
      if (dx > MOVEMENT_TOLERANCE || dy > MOVEMENT_TOLERANCE) {
        cancel(e);
      }
    },
    [cancel]
  );

  return {
    bind: {
      onTouchStart: start,
      onTouchMove: move,
      onTouchEnd: cancel,
      onTouchCancel: cancel,
      onContextMenu: (e) => e.preventDefault(),
    },
  };
}

export default useLongPress;
