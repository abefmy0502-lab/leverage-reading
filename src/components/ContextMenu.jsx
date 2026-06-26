// Floating iOS-style context menu shown on long-press. Renders a backdrop
// (taps close) plus a small floating panel positioned near (x, y) but clamped
// to the viewport.

import { useEffect, useState } from 'react';

const PANEL_WIDTH = 220;
const PANEL_MARGIN = 12;

const backdrop = {
  position: 'fixed',
  inset: 0,
  zIndex: 880,
  background: 'rgba(30, 25, 20, 0.18)',
  WebkitBackdropFilter: 'blur(2px)',
  backdropFilter: 'blur(2px)',
  animation: 'lvg-fade-in 150ms ease',
};

const panelBase = {
  position: 'fixed',
  zIndex: 881,
  width: PANEL_WIDTH,
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 10px 30px rgba(30, 25, 20, 0.25)',
  overflow: 'hidden',
  fontFamily: "var(--font-app)",
  animation: 'lvg-context-pop 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
};

const KEYFRAME_ID = '__leverage-context-menu-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const s = document.createElement('style');
  s.id = KEYFRAME_ID;
  s.textContent = `
@keyframes lvg-context-pop {
  0%   { opacity: 0; transform: scale(0.85); }
  100% { opacity: 1; transform: scale(1); }
}
`;
  document.head.appendChild(s);
}

const itemBase = {
  width: '100%',
  padding: '14px 16px',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--c-soft-2)',
  textAlign: 'left',
  fontFamily: 'inherit',
  fontSize: 15,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: 'var(--c-ink)',
};

export default function ContextMenu({ x = 0, y = 0, items = [], onClose }) {
  ensureKeyframes();
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estHeight = items.length * 50 + 12;
    let left = x - PANEL_WIDTH / 2;
    let top = y + 12;
    if (left < PANEL_MARGIN) left = PANEL_MARGIN;
    if (left + PANEL_WIDTH > vw - PANEL_MARGIN) left = vw - PANEL_WIDTH - PANEL_MARGIN;
    if (top + estHeight > vh - PANEL_MARGIN) top = Math.max(PANEL_MARGIN, y - estHeight - 12);
    setPosition({ left, top });
  }, [x, y, items.length]);

  return (
    <>
      <div style={backdrop} onClick={onClose} aria-hidden="true" />
      <div
        style={{ ...panelBase, left: position.left, top: position.top }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                try { it.onClick?.(); } finally { onClose?.(); }
              }}
              style={{
                ...itemBase,
                color: it.destructive ? '#FF3B30' : 'var(--c-ink)',
                borderBottom: isLast ? 'none' : itemBase.borderBottom,
              }}
            >
              {it.icon && <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{it.icon}</span>}
              <span style={{ flex: 1 }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
