// Pull-to-refresh on the window scroll container. Activates only when the page
// is at scrollTop === 0; downward drag past `threshold` then release runs the
// async `onRefresh` callback. Returns `pullDistance` (px) and `isRefreshing`
// for an indicator component to render.

import { useCallback, useRef, useState } from 'react';

const DEFAULT_THRESHOLD = 70;
const MAX_PULL = 120;
const PULL_RESISTANCE = 0.5;

function getScrollTop() {
  if (typeof window === 'undefined') return 0;
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

export function usePullToRefresh({ onRefresh, threshold = DEFAULT_THRESHOLD } = {}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(null);
  const activeRef = useRef(false);

  const reset = useCallback(() => {
    startYRef.current = null;
    activeRef.current = false;
    setPullDistance(0);
  }, []);

  const onTouchStart = useCallback((e) => {
    if (isRefreshing) return;
    if (getScrollTop() > 0) {
      activeRef.current = false;
      return;
    }
    const t = e.touches?.[0];
    if (!t) return;
    startYRef.current = t.clientY;
    activeRef.current = true;
  }, [isRefreshing]);

  const onTouchMove = useCallback(
    (e) => {
      if (!activeRef.current || isRefreshing) return;
      const t = e.touches?.[0];
      if (!t) return;
      // If user has scrolled down at all, stop tracking pull.
      if (getScrollTop() > 0) {
        reset();
        return;
      }
      const dy = t.clientY - startYRef.current;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      // Apply resistance so pull feels rubber-band-ish
      const dist = Math.min(MAX_PULL, dy * PULL_RESISTANCE);
      setPullDistance(dist);
    },
    [isRefreshing, reset]
  );

  const onTouchEnd = useCallback(async () => {
    if (!activeRef.current || isRefreshing) {
      reset();
      return;
    }
    if (pullDistance >= threshold && onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch {
        /* surface via toast at call site */
      } finally {
        setIsRefreshing(false);
        reset();
      }
    } else {
      reset();
    }
  }, [pullDistance, threshold, onRefresh, isRefreshing, reset]);

  return {
    pullDistance,
    isRefreshing,
    bind: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
  };
}

export default usePullToRefresh;
