// 📚 AddBookModal — 全画面シート式の本追加 UI。
//
// シンプル化: タブ切替・「シンプル / 詳細」分岐は廃止。最初から
// タイトル / 著者 / ISBN の 3 入力欄を表示し、検索 → 結果リスト UI
// (BookSearchModal) へ受け渡す。手動入力は下のリンクから。

import { useState } from 'react';

const overlayStyle = {
  // 全画面シート — キーボード被りを最小化、安全領域も尊重。
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'var(--color-bg, #f5f0e8)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Noto Serif JP', Georgia, serif",
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const headerStyle = {
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--color-separator)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
};

const closeBtn = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--color-secondary)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

const bodyStyle = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: 'var(--space-5) var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-secondary)',
  display: 'block',
  marginBottom: 6,
};

const inpStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid var(--color-separator)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  outline: 'none',
  color: 'var(--color-label)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const searchBtnStyle = {
  width: '100%',
  padding: '14px 0',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-accent-strong)',
  color: 'var(--color-text-inverse)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: 0.5,
  minHeight: 48,
};

const dividerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  color: 'var(--color-tertiary)',
  fontSize: 11,
  margin: 'var(--space-4) 0 var(--space-2)',
};

const dividerLine = {
  flex: 1,
  height: 1,
  background: 'var(--color-separator)',
};

const manualBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '12px 16px',
  border: '1px solid var(--color-separator)',
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  color: 'var(--color-secondary)',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
  minHeight: 44,
};

export default function AddBookModal({ onClose, onSearch, onManual }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');

  const hasInput = !!(title.trim() || author.trim() || isbn.trim());

  const submit = () => {
    if (!hasInput) return;
    onSearch?.({
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim(),
    });
  };

  const onEnter = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={headerStyle}>
        <h2 style={{ fontSize: 16, color: 'var(--color-label)', margin: 0, fontWeight: 600, flex: 1 }}>📚 本を追加</h2>
        <button type="button" onClick={onClose} style={closeBtn} aria-label="閉じる">×</button>
      </div>

      <div style={bodyStyle}>
        <div>
          <label htmlFor="add-book-title" style={labelStyle}>タイトル</label>
          <input
            id="add-book-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onEnter}
            placeholder="例：レバレッジ・リーディング"
            style={inpStyle}
          />
        </div>
        <div>
          <label htmlFor="add-book-author" style={labelStyle}>
            著者 <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="add-book-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onKeyDown={onEnter}
            placeholder="例：本田 直之"
            style={inpStyle}
          />
        </div>
        <div>
          <label htmlFor="add-book-isbn" style={labelStyle}>
            ISBN <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="add-book-isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            onKeyDown={onEnter}
            placeholder="978-4-7631-9742-3"
            style={inpStyle}
            inputMode="numeric"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!hasInput}
          style={{ ...searchBtnStyle, opacity: hasInput ? 1 : 0.5 }}
        >
          🔍 検索
        </button>

        <div style={dividerStyle}>
          <div style={dividerLine} />
          <span>または</span>
          <div style={dividerLine} />
        </div>

        <button type="button" onClick={onManual} style={manualBtnStyle}>
          📝 検索でヒットしない場合は手動入力
        </button>
      </div>
    </div>
  );
}
