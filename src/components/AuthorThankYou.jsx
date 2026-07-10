// 🙇 AuthorThankYou — easter egg modal that fires when the user
// long-presses the bookshelf logo (📚 in the header). Quiet way to
// thank power users who explore the app.

import { useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 940,
  background: 'rgba(30, 25, 20, 0.55)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4)',
  fontFamily: "var(--font-app)",
};

const cardStyle = {
  background: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-xl)',
  width: 'min(420px, 100%)',
  boxShadow: 'var(--shadow-5)',
};

const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-3) var(--space-6)',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-accent-strong)',
  color: 'var(--color-text-inverse)',
  fontFamily: 'inherit',
  fontSize: 'var(--type-callout)',
  fontWeight: 'var(--weight-semibold)',
  cursor: 'pointer',
  minHeight: 44,
  marginTop: 'var(--space-4)',
};

export default function AuthorThankYou({ onClose }) {
  // ♿ 唯一 Escape で閉じられないダイアログだった。フォーカストラップ + Escape +
  // accessible name を他のモーダルと同じ流儀で揃える。
  const trapRef = useFocusTrap(true);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="thanks-title" onClick={onClose}>
      <div ref={trapRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="thanks-modal">
          <div className="thanks-icon" aria-hidden="true">🙇‍♂️</div>
          <h2 className="thanks-title" id="thanks-title">使ってくれて、ありがとう</h2>
          <p className="thanks-body">
            このアプリは、<br />
            読書を「投資」に変える<br />
            小さな実験です。
          </p>
          <p className="thanks-body" style={{ marginTop: 'var(--space-3)' }}>
            あなたが本を読んで、<br />
            メモを残して、<br />
            行動に変えていく姿が、<br />
            このアプリを作る<br />
            一番の励みになっています。
          </p>
          <p className="thanks-body" style={{ marginTop: 'var(--space-3)' }}>
            これからも、<br />
            読書がいい時間でありますように。
          </p>
          <p className="thanks-body" style={{ fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-4)' }}>
            — 開発者より
          </p>
          <button type="button" onClick={onClose} style={btnPrimary}>
            こちらこそ、ありがとう
          </button>
        </div>
      </div>
    </div>
  );
}
