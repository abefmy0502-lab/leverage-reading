// Bottom-sheet quick-memo composer. Page number + body only — for the user who
// just wants to dump a thought without leaving the book detail screen.
// "詳細入力 →" hands off to the full BookMemoEditor for photos/tags.

import { useEffect, useRef, useState } from 'react';
import { toMessage } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import PhotoToTextButton from './PhotoToTextButton';
import { BookOpen } from 'lucide-react';

const KEYFRAMES_ID = '__leverage-sheet-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
@keyframes leverage-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes leverage-fade-in { from { opacity: 0; } to { opacity: 1; } }
`;
  document.head.appendChild(style);
}

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
  fontFamily: "var(--font-app)",
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 16px',
  borderBottom: '1px solid var(--c-hairline)',
};

const closeBtn = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--c-brand)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 10,
};

const bodyStyle = {
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
};

const fieldLabel = {
  fontSize: 12,
  color: 'var(--c-ink-soft)',
  fontWeight: 500,
  display: 'block',
  marginBottom: 4,
};

const inp = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid var(--c-hairline-strong)',
  borderRadius: 10,
  background: '#fff',
  color: 'var(--c-ink)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const ta = {
  ...inp,
  resize: 'vertical',
  minHeight: 140,
  lineHeight: 1.7,
};

const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--c-hairline)',
};

const detailLink = {
  background: 'none',
  border: 'none',
  fontSize: 13,
  color: 'var(--c-brand)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'underline',
  padding: '8px 4px',
  flex: 1,
  textAlign: 'left',
};

const saveBtn = (busy) => ({
  padding: '12px 22px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--c-brand)',
  color: 'var(--c-card)',
  cursor: busy ? 'default' : 'pointer',
  fontFamily: 'inherit',
  fontSize: 15,
  letterSpacing: 1,
  opacity: busy ? 0.6 : 1,
  minWidth: 96,
  minHeight: 44,
});

export default function QuickMemoSheet({
  bookTitle,
  defaultPageNumber = '',
  onClose,
  onCreate,
  onOpenFullEditor,
}) {
  ensureKeyframes();
  const [pageNumber, setPageNumber] = useState(defaultPageNumber !== '' ? String(defaultPageNumber) : '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const textRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    // Auto-focus the textarea when the sheet opens.
    setTimeout(() => textRef.current?.focus(), 80);
  }, []);

  // Keyboard push-up: visualViewport changes height when the on-screen
  // keyboard appears. Resize the sheet so its content stays visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const apply = () => {
      if (!sheetRef.current) return;
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheetRef.current.style.transform = offset > 60 ? `translateY(-${offset}px)` : '';
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  // Escape closes
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMsg('メモ本文を入力してください。');
      return;
    }
    const parsed = parseInt(pageNumber, 10);
    setBusy(true);
    setErrorMsg('');
    try {
      await onCreate({
        pageNumber: Number.isFinite(parsed) ? parsed : null,
        text: trimmed,
        photoFile: null,
        tags: [],
      });
      onClose?.();
    } catch (e) {
      setErrorMsg(toMessage(e, 'メモの保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handleDetailHandoff = () => {
    const parsed = parseInt(pageNumber, 10);
    onOpenFullEditor?.({
      pageNumber: Number.isFinite(parsed) ? parsed : null,
      text,
    });
    onClose?.();
  };

  return (
    <>
      <div style={backdrop} onClick={onClose} aria-hidden="true" />
      <div ref={sheetRef} style={sheetWrap} role="dialog" aria-modal="true">
        <div className="lvg-sheet-handle" aria-hidden="true" />
        <div style={headerStyle}>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="閉じる">
            ✕
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: 0 }}>クイックメモ</p>
            <p
              style={{
                fontSize: 14,
                color: 'var(--c-ink)',
                fontWeight: 500,
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <BookOpen size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {bookTitle || '本'}
            </p>
          </div>
        </div>

        <div style={bodyStyle}>
          <div>
            <label style={fieldLabel}>ページ番号（任意）</label>
            <input
              type="number"
              inputMode="numeric"
              value={pageNumber}
              onChange={(e) => setPageNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  textRef.current?.focus();
                }
              }}
              placeholder="78"
              style={{ ...inp, width: 140, textAlign: 'center' }}
            />
          </div>
          <div>
            <label style={fieldLabel}>メモ本文</label>
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.nativeEvent.isComposing) {
                  e.preventDefault();
                }
              }}
              placeholder="メモを入力..."
              style={ta}
              maxLength={LIMITS.memoText}
            />
            <div style={{ marginTop: 8 }}>
              <PhotoToTextButton
                onText={(t) =>
                  setText((prev) => (prev ? `${prev}\n${t}` : t).slice(0, LIMITS.memoText))
                }
              />
            </div>
          </div>
          {errorMsg && (
            <p style={{ color: 'var(--c-critical)', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
          )}
        </div>

        <div style={footerStyle}>
          <button type="button" style={detailLink} onClick={handleDetailHandoff}>
            詳細入力（写真・タグ）→
          </button>
          <button type="button" style={saveBtn(busy)} onClick={handleSave} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}
