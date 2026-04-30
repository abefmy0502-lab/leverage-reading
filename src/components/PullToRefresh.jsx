// Pull-to-refresh wrapper. Renders a circular indicator above the children
// that fills as the user pulls, then spins while `onRefresh` runs, then a
// brief checkmark before fading out.

import { useEffect, useState } from 'react';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const KEYFRAME_ID = '__leverage-ptr-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const s = document.createElement('style');
  s.id = KEYFRAME_ID;
  s.textContent = `
@keyframes lvg-ptr-spin { to { transform: rotate(360deg); } }
@keyframes lvg-ptr-fade { to { opacity: 0; transform: scale(0.85); } }
`;
  document.head.appendChild(s);
}

const indicatorBase = {
  position: 'absolute',
  left: '50%',
  top: 0,
  transform: 'translate(-50%, 0)',
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: '#faf6f0',
  border: '1px solid #e4ddd0',
  boxShadow: '0 4px 12px rgba(30, 25, 20, 0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 50,
};

export default function PullToRefresh({ onRefresh, threshold = 70, children }) {
  ensureKeyframes();
  const { pullDistance, isRefreshing, bind } = usePullToRefresh({ onRefresh, threshold });
  const [showCheck, setShowCheck] = useState(false);
  const [refreshingPrev, setRefreshingPrev] = useState(false);

  useEffect(() => {
    if (refreshingPrev && !isRefreshing) {
      // Just finished refreshing — flash the check.
      setShowCheck(true);
      const t = setTimeout(() => setShowCheck(false), 600);
      return () => clearTimeout(t);
    }
    setRefreshingPrev(isRefreshing);
    return undefined;
  }, [isRefreshing, refreshingPrev]);

  const visible = pullDistance > 0 || isRefreshing || showCheck;
  const offsetY = isRefreshing ? threshold * 0.6 : Math.min(pullDistance, threshold + 20);
  const progress = Math.min(1, pullDistance / threshold);
  const armed = pullDistance >= threshold;

  return (
    <div
      style={{ position: 'relative' }}
      onTouchStart={bind.onTouchStart}
      onTouchMove={bind.onTouchMove}
      onTouchEnd={bind.onTouchEnd}
      onTouchCancel={bind.onTouchCancel}
    >
      {visible && (
        <div
          aria-hidden="true"
          style={{
            ...indicatorBase,
            transform: `translate(-50%, ${offsetY - 30}px)`,
            opacity: visible ? 1 : 0,
            transition: pullDistance === 0 ? 'transform 250ms cubic-bezier(0.25,1,0.5,1), opacity 200ms' : 'none',
          }}
        >
          {showCheck ? (
            <span style={{ fontSize: 18, color: '#5a7a48' }}>✓</span>
          ) : isRefreshing ? (
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid #e0d8c8',
                borderTopColor: '#5c5043',
                animation: 'lvg-ptr-spin 0.8s linear infinite',
              }}
            />
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" style={{ transform: `rotate(${progress * 270}deg)`, transition: 'transform 80ms linear' }}>
              <circle cx="12" cy="12" r="9" fill="none" stroke="#e0d8c8" strokeWidth="2.5" />
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke={armed ? '#5a7a48' : '#5c5043'}
                strokeWidth="2.5"
                strokeDasharray={`${progress * 56.5} 56.5`}
                strokeLinecap="round"
                transform="rotate(-90 12 12)"
              />
            </svg>
          )}
        </div>
      )}

      <div
        // showCheck is true for the 600ms after a refresh completes; reuse
        // that window to play the success flash on the list itself.
        className={showCheck ? 'list-refreshed' : ''}
        style={{
          transform: pullDistance > 0 || isRefreshing ? `translate3d(0, ${isRefreshing ? threshold * 0.4 : pullDistance * 0.6}px, 0)` : 'translate3d(0, 0, 0)',
          transition: pullDistance === 0 && !isRefreshing ? 'transform 250ms cubic-bezier(0.25,1,0.5,1)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
