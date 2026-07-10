// 汎用ボトムシート — 本棚の「絞り込み / 並び」など、コントロールを画面から
// 隠して必要なときだけ引き出すための iOS 風シート。QuickMemoSheet の見た目
// （backdrop blur + sheet-up + ドラッグハンドル + safe-area）を踏襲し、
// アプリ全体で再利用できるよう最小の API（title / onClose / children / footer）
// に絞った。Esc / ハンドルタップ / 背景タップ / 下スワイプ で閉じる。
import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

const backdrop = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(30,25,20,0.4)',
  zIndex: 700,
  animation: 'leverage-fade-in .15s ease',
  WebkitBackdropFilter: 'blur(8px)',
  backdropFilter: 'blur(8px)',
};

const sheetWrap = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 701,
  background: 'var(--c-card)',
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  boxShadow: '0 -10px 30px rgba(30,25,20,0.18)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85vh',
  animation: 'leverage-sheet-up .25s cubic-bezier(0.2,0.9,0.3,1)',
  fontFamily: 'var(--font-app)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

export default function BottomSheet({ title, onClose, children, footer }) {
  const sheetRef = useRef(null);
  // ♿ aria-modal の宣言どおり Tab を内部に閉じ込め、閉じたら元へ復帰。
  const trapRef = useFocusTrap(true);
  const dragStartYRef = useRef(null);
  const draggingRef = useRef(false);
  // 閉じは slide-down を経由（入りだけ滑らかで出が瞬間消滅、の非対称を解消）。
  const [closing, setClosing] = useState(false);
  const animateClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose?.(), 220);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.isComposing) animateClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, closing]);

  // 掴んで下に振ると閉じる（iOS シートの標準所作。ハンドル/ヘッダー起点のみ）。
  const onDragStart = (e) => {
    if (closing) return;
    dragStartYRef.current = e.touches?.[0]?.clientY ?? null;
  };
  const onDragMove = (e) => {
    if (dragStartYRef.current == null || !sheetRef.current) return;
    const dy = (e.touches?.[0]?.clientY ?? 0) - dragStartYRef.current;
    if (dy <= 0) return;
    draggingRef.current = true;
    sheetRef.current.style.transition = 'none';
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onDragEnd = (e) => {
    const startY = dragStartYRef.current;
    dragStartYRef.current = null;
    if (!draggingRef.current || !sheetRef.current || startY == null) return;
    draggingRef.current = false;
    const dy = Math.max(0, (e.changedTouches?.[0]?.clientY ?? startY) - startY);
    const el = sheetRef.current;
    el.style.transition = 'transform .22s cubic-bezier(0.2,0.9,0.3,1)';
    if (dy > 110) {
      el.style.transform = 'translateY(100%)';
      setTimeout(() => onClose?.(), 200);
    } else {
      el.style.transform = '';
    }
  };

  return (
    <>
      <div
        style={{ ...backdrop, ...(closing ? { opacity: 0, transition: 'opacity .18s ease' } : {}) }}
        onClick={animateClose}
        aria-hidden="true"
      />
      <div
        ref={(el) => { sheetRef.current = el; trapRef.current = el; }}
        style={{
          ...sheetWrap,
          animation: closing
            ? 'leverage-sheet-down .22s cubic-bezier(0.3,0,0.8,0.3) forwards'
            : sheetWrap.animation,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'シート'}
      >
        <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
          <button
            type="button"
            onClick={animateClose}
            aria-label="閉じる"
            style={{ background: 'none', border: 'none', padding: '8px 0 2px', cursor: 'pointer', alignSelf: 'center', width: '100%' }}
          >
            <div className="lvg-sheet-handle" aria-hidden="true" />
          </button>
          {title && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 18px 10px', borderBottom: '1px solid var(--c-hairline)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>{title}</h3>
              <button
                type="button"
                onClick={animateClose}
                aria-label="閉じる"
                style={{ background: 'none', border: 'none', color: 'var(--c-brand)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 32 }}
              >
                完了
              </button>
            </div>
          )}
        </div>
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '14px 18px 18px' }}>
          {children}
        </div>
        {footer && (
          <div style={{ borderTop: '1px solid var(--c-hairline)', padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
