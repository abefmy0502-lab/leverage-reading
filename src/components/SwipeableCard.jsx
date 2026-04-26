// Wraps a card to add iOS-style "swipe left to delete" with a red action
// drawer on the right and spring-back when not crossed the threshold.
//
// The wrapper purposely stays minimal — it just gates the touch handling and
// applies a transform. The visual style of the inner card is the caller's
// responsibility (we don't paint a background here so we don't double up).

import { useEffect } from 'react';
import { useSwipeToDelete } from '../hooks/useSwipeToDelete';
import { useHaptic } from '../hooks/useHaptic';

const ACTION_WIDTH = 200;

export default function SwipeableCard({
  children,
  onDelete,
  threshold = 80,
  disabled = false,
  actionLabel = '🗑️ 削除',
}) {
  const haptic = useHaptic();
  const { offset, armed, isDeleting, bind } = useSwipeToDelete({
    threshold,
    maxSwipe: ACTION_WIDTH,
    onDelete: () => {
      haptic.medium();
      onDelete?.();
    },
  });

  // Buzz once when crossing the arm threshold (gives the user the "click"
  // moment before they release).
  useEffect(() => {
    if (armed) haptic.light();
  }, [armed, haptic]);

  if (disabled) return children;

  const transformValue = `translate3d(${-offset}px, 0, 0)`;
  const useTransition = offset === 0 || isDeleting;

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 14,
        // Background sits behind the foreground card; the action drawer paints
        // its own colour above it.
      }}
    >
      {/* Action drawer (red) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: ACTION_WIDTH,
          background: '#FF3B30',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: 24,
          color: '#fff',
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: 1,
          // The drawer pulses a bit when the swipe crosses the arm threshold
          // so the user sees their gesture is "loaded".
          transform: armed ? 'scale(1.04)' : 'scale(1)',
          transformOrigin: 'left center',
          transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {actionLabel}
      </div>

      {/* Foreground content */}
      <div
        {...bind}
        style={{
          transform: transformValue,
          transition: useTransition
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'none',
          willChange: 'transform',
          // Inherit so the card's own background continues to cover the drawer
          // when at rest.
          background: 'transparent',
        }}
      >
        {children}
      </div>
    </div>
  );
}
