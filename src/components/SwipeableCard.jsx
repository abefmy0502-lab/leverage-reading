// Wraps a card to add iOS-style "swipe left to delete" with a red action
// drawer on the right and spring-back when not crossed the threshold.
//
// The wrapper purposely stays minimal — it just gates the touch handling and
// applies a transform. The visual style of the inner card is the caller's
// responsibility (we don't paint a background here so we don't double up).

import { useEffect } from 'react';
import { useSwipeToDelete } from '../hooks/useSwipeToDelete';
import { useHaptic } from '../hooks/useHaptic';
import { Trash2 } from 'lucide-react';

const ACTION_WIDTH = 200;

export default function SwipeableCard({
  children,
  onDelete,
  threshold = 80,
  disabled = false,
  actionLabel,
}) {
  // Default label uses a Lucide icon; callers can override with a string or JSX.
  const resolvedLabel = actionLabel ?? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
      削除
    </span>
  );
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

  const transformValue = offset > 0 ? `translate3d(${-offset}px, 0, 0)` : 'none';
  const useTransition = offset === 0 || isDeleting;

  return (
    <div
      style={{
        position: 'relative',
        // 切り抜きはスワイプ中だけ（静止中も hidden だと、端数の高さのカードで下端の枠線と
        // 角が 1px 欠けて描かれていた）。静止中は赤い引き出しも visibility:hidden。
        overflow: offset > 0 || isDeleting ? 'hidden' : 'visible',
        borderRadius: 'var(--radius)',
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
          background: 'var(--error)',
          // 🩹 静止中は赤を描かない。カードの角丸（直書きの 14/16 等）と外枠の角丸が
          // 違うと、角のすき間から赤がにじんで見えていた（SPEC の違和感 1）。
          // スワイプが始まった時だけ出す。
          visibility: offset > 0 || isDeleting ? 'visible' : 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: 24,
          color: 'var(--accent-ink)',
          fontWeight: 600,
          fontSize: 'var(--text-sub)',
          letterSpacing: 1,
          // The drawer pulses a bit when the swipe crosses the arm threshold
          // so the user sees their gesture is "loaded".
          transform: armed ? 'scale(1.04)' : 'scale(1)',
          transformOrigin: 'left center',
          transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {resolvedLabel}
      </div>

      {/* Foreground content */}
      <div
        {...bind}
        style={{
          transform: transformValue,
          transition: useTransition
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'none',
          // 静止中は合成レイヤーにしない（overflow:hidden＋角丸の親の中で常時レイヤー化すると、
          // 端数の高さのカードで下端の枠線と角が 1px 欠けて描かれることがあった）。
          willChange: offset > 0 ? 'transform' : 'auto',
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
