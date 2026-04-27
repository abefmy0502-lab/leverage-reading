// 📚 AddBookModal — the precursor screen the user sees when tapping the
// "+" on the bookshelf.
//
// Search-first by design: AI features (本の解析 / セットアップシート / ROI 要約)
// give substantially better output when the title/author actually match a
// real published work, so we make the search box the primary action and
// demote manual entry to a small link below.
//
// The component itself is dumb — it owns the staged search query and routes
// to the right callback. The parent (App.jsx) owns the BookSearchModal +
// edit-form transitions.

import { useState } from 'react';
import { Search, PenLine } from 'lucide-react';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: "'Noto Serif JP', Georgia, serif",
  animation: 'fadeIn .2s',
};

const cardStyle = {
  background: '#faf6f0',
  borderRadius: 14,
  padding: '22px 20px calc(22px + env(safe-area-inset-bottom, 0px))',
  width: 'min(420px, 100%)',
  maxHeight: 'min(85vh, 85dvh)',
  overflowY: 'auto',
  boxShadow: '0 16px 48px rgba(30,25,20,0.16)',
  animation: 'slideUp .25s',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const closeBtn = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: '#5c5043',
  cursor: 'pointer',
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

const searchRowStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'stretch',
};

const searchInputStyle = {
  flex: 1,
  width: '100%',
  padding: '14px 14px',
  fontSize: 16,
  border: '1.5px solid #d4ccbe',
  borderRadius: 12,
  background: '#fff',
  outline: 'none',
  color: '#3d362c',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const searchBtnStyle = {
  flexShrink: 0,
  width: 56,
  borderRadius: 12,
  border: 'none',
  background: '#5c5043',
  color: '#faf6f0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const hintCardStyle = {
  background: '#f5efde',
  border: '1px solid #e0d0a8',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 12,
  lineHeight: 1.7,
  color: '#5c5043',
};

const dividerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  color: '#b5aa96',
  fontSize: 11,
  margin: '4px 0',
};

const dividerLine = {
  flex: 1,
  height: 1,
  background: '#e4ddd0',
};

const manualBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '10px 14px',
  border: '1px solid #d4ccbe',
  borderRadius: 10,
  background: 'transparent',
  color: '#8a7e6b',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function AddBookModal({ onClose, onSearch, onManual }) {
  const [q, setQ] = useState('');

  const submit = () => {
    const query = q.trim();
    onSearch?.(query);
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: '#3d362c', margin: 0 }}>📚 本を追加</h3>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="閉じる">×</button>
        </div>

        <div>
          <label
            htmlFor="add-book-search-input"
            style={{ fontSize: 12, fontWeight: 600, color: '#5c5043', display: 'block', marginBottom: 6 }}
          >
            🔍 本を検索（推奨）
          </label>
          <div style={searchRowStyle}>
            <input
              id="add-book-search-input"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="タイトル・著者・ISBN"
              style={searchInputStyle}
            />
            <button
              type="button"
              onClick={submit}
              style={searchBtnStyle}
              aria-label="検索"
              title="検索"
            >
              <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div style={hintCardStyle}>
          💡 検索で追加すると、AI が本の内容を解析し、セットアップシートや ROI 要約を自動生成します。
        </div>

        <div style={dividerStyle}>
          <div style={dividerLine} />
          <span>または</span>
          <div style={dividerLine} />
        </div>

        <button
          type="button"
          onClick={onManual}
          style={manualBtnStyle}
        >
          <PenLine size={14} strokeWidth={1.75} aria-hidden="true" />
          検索で見つからない場合は手動入力
        </button>
      </div>
    </div>
  );
}
