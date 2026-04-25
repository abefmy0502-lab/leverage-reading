// Contextual help modal. Pass a helpKey that exists in HELP_CONTENT.
// The footer shows the lastUpdated date so users (and reviewers) can tell at a
// glance whether the doc is fresh after a feature change.

import { useEffect } from 'react';
import { getHelp } from '../lib/helpContent';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 850,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: "'Noto Serif JP', Georgia, serif",
};

const cardStyle = {
  background: '#faf6f0',
  borderRadius: 14,
  width: 'min(440px, 100%)',
  maxHeight: 'min(85vh, 85dvh)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 16px',
  borderBottom: '1px solid #e4ddd0',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: '#5c5043',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
  borderRadius: 10,
};

const bodyStyle = {
  padding: '16px 18px',
  overflowY: 'auto',
  flex: 1,
  WebkitOverflowScrolling: 'touch',
};

const footerStyle = {
  padding: '10px 18px calc(10px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid #e4ddd0',
  fontSize: 11,
  color: '#a89e8c',
  textAlign: 'center',
};

const onboardingLinkStyle = {
  display: 'block',
  margin: '12px 0 6px',
  padding: '10px 12px',
  background: '#f0ebe2',
  border: '1px solid #e4ddd0',
  borderRadius: 10,
  fontSize: 13,
  color: '#5c5043',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
  textAlign: 'left',
};

const sectionWrap = { marginBottom: 14 };
const sectionHeading = {
  fontSize: 13,
  color: '#3d362c',
  fontWeight: 600,
  marginBottom: 4,
};
const sectionBody = {
  fontSize: 13,
  color: '#5c5548',
  lineHeight: 1.8,
  margin: '0 0 6px',
};
const itemList = {
  fontSize: 12,
  color: '#5c5548',
  lineHeight: 1.8,
  paddingLeft: 18,
  margin: 0,
};

export default function HelpModal({ helpKey, onClose, onShowOnboarding }) {
  const entry = getHelp(helpKey);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!entry) {
    return (
      <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
        <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <div style={headerStyle}>
            <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 500, flex: 1 }}>ヘルプ</h2>
            <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる">×</button>
          </div>
          <div style={bodyStyle}>
            <p style={{ fontSize: 13, color: '#a89e8c', margin: 0, lineHeight: 1.8 }}>
              この画面のヘルプはまだ用意されていません。
            </p>
            {onShowOnboarding && (
              <button
                type="button"
                style={onboardingLinkStyle}
                onClick={() => onShowOnboarding()}
              >
                📖 アプリ全体の使い方を最初から見る →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 500, flex: 1 }}>
            {entry.title}
          </h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div style={bodyStyle}>
          {entry.description && (
            <p style={{ fontSize: 13, color: '#5c5548', lineHeight: 1.8, margin: '0 0 14px' }}>
              {entry.description}
            </p>
          )}

          {(entry.sections || []).map((s, i) => (
            <section key={i} style={sectionWrap}>
              <h3 style={sectionHeading}>{s.heading}</h3>
              {s.body && <p style={{ ...sectionBody, whiteSpace: 'pre-line' }}>{s.body}</p>}
              {s.items?.length > 0 && (
                <ul style={itemList}>
                  {s.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {onShowOnboarding && (
            <button
              type="button"
              style={onboardingLinkStyle}
              onClick={() => {
                onShowOnboarding();
              }}
            >
              📖 アプリ全体の使い方を最初から見る →
            </button>
          )}
        </div>

        {entry.lastUpdated && (
          <div style={footerStyle}>
            このヘルプは {entry.lastUpdated} に更新されました
          </div>
        )}
      </div>
    </div>
  );
}
