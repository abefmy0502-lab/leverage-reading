// Floating iOS-style context menu shown on long-press. Renders a backdrop
// (taps close) plus a small floating panel positioned near (x, y) but clamped
// to the viewport.

import { useEffect, useState, useRef } from 'react';

const PANEL_WIDTH = 220;
const PANEL_MARGIN = 16;

const backdrop = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-popover)',
  // DESIGN §5「メニュー」: 背景は --backdrop だけ（ぼかさない）。
  background: 'var(--backdrop)',
  animation: 'lvg-fade-in var(--duration-fast) var(--ease-out)',
};

const panelBase = {
  position: 'fixed',
  zIndex: 'calc(var(--z-popover) + 1)', // 背景（--z-popover）のすぐ上
  width: PANEL_WIDTH,
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-overlay)',
  overflow: 'hidden',
  fontFamily: 'var(--font-ui)',
  animation: 'lvg-context-pop var(--duration-fast) var(--ease-spring) both',
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
  padding: 'var(--space-3) var(--space-4)',
  minHeight: 48,
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--separator)',
  textAlign: 'left',
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  color: 'var(--text)',
};

// 開いた直後の背景のクリックは無視する（長押しで開いたとき、指を離した瞬間の合成クリックが
// 背景に落ちてすぐ閉じるのを防ぐ・useLongPress 側の preventDefault と二重の守り・2026-09-29）。
const OPEN_GRACE_MS = 350;

export default function ContextMenu({ x = 0, y = 0, items = [], onClose }) {
  ensureKeyframes();
  const [position, setPosition] = useState({ left: x, top: y });
  const openedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const onBackdropClick = () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - openedAtRef.current < OPEN_GRACE_MS) return;
    onClose?.();
  };

  useEffect(() => {
    const onKey = (e) => {
      // IME 変換中の Escape は変換キャンセル。メニューを閉じない。
      if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) onClose?.();
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

  // role="menu" のキーボードパターン: 開いたら先頭にフォーカスし、上下/Home/End で移動。
  const itemRefs = useRef([]);
  useEffect(() => {
    const t = setTimeout(() => { try { itemRefs.current[0]?.focus(); } catch { /* ignore */ } }, 0);
    return () => clearTimeout(t);
  }, []);
  const onMenuKeyDown = (e) => {
    const n = items.length;
    if (n === 0) return;
    const cur = itemRefs.current.indexOf(document.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = cur < 0 ? 0 : (cur + 1) % n;
    else if (e.key === 'ArrowUp') next = cur <= 0 ? n - 1 : cur - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next >= 0) { e.preventDefault(); try { itemRefs.current[next]?.focus(); } catch { /* ignore */ } }
  };

  return (
    <>
      <div style={backdrop} onClick={onBackdropClick} aria-hidden="true" />
      <div
        style={{ ...panelBase, left: position.left, top: position.top }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onMenuKeyDown}
      >
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              ref={(el) => { itemRefs.current[i] = el; }}
              onClick={() => {
                try { it.onClick?.(); } finally { onClose?.(); }
              }}
              style={{
                ...itemBase,
                color: it.destructive ? 'var(--error)' : 'var(--text)',
                borderBottom: isLast ? 'none' : itemBase.borderBottom,
              }}
            >
              {it.icon && <span style={{ display: 'inline-flex', width: 20, justifyContent: 'center' }}>{it.icon}</span>}
              <span style={{ flex: 1 }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
