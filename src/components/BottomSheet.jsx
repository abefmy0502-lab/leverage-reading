// 汎用ボトムシート — 本棚の「絞り込み / 並び」など、コントロールを画面から
// 隠して必要なときだけ引き出すための iOS 風シート。QuickMemoSheet の見た目
// （backdrop blur + sheet-up + ドラッグハンドル + safe-area）を踏襲し、
// アプリ全体で再利用できるよう最小の API（title / onClose / children / footer）
// に絞った。Esc とハンドル/背景タップで閉じる。
import { useEffect } from 'react';

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
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div style={backdrop} onClick={onClose} aria-hidden="true" />
      <div style={sheetWrap} role="dialog" aria-modal="true" aria-label={title || 'シート'}>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          style={{ background: 'none', border: 'none', padding: '8px 0 2px', cursor: 'pointer', alignSelf: 'center' }}
        >
          <div className="lvg-sheet-handle" aria-hidden="true" />
        </button>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 18px 10px', borderBottom: '1px solid var(--c-hairline)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              style={{ background: 'none', border: 'none', color: 'var(--c-brand)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 32 }}
            >
              完了
            </button>
          </div>
        )}
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 18px 18px' }}>
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
