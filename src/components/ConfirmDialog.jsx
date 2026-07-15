import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

const ConfirmContext = createContext({ confirm: async () => false });

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-confirm)',
  background: 'var(--backdrop)',
  backdropFilter: 'var(--backdrop-blur)',
  WebkitBackdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const cardStyle = {
  background: 'var(--c-card)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 22px',
  width: 'min(380px, 100%)',
  boxShadow: 'var(--shadow-5)',
  fontFamily: "var(--font-app)",
};

const titleStyle = {
  fontSize: 16,
  color: 'var(--c-ink)',
  fontWeight: 500,
  margin: '0 0 8px',
};

const messageStyle = {
  fontSize: 13,
  color: 'var(--c-ink-soft)',
  lineHeight: 1.7,
  margin: '0 0 18px',
  whiteSpace: 'pre-line',
};

const rowStyle = {
  display: 'flex',
  gap: 10,
};

const cancelBtnStyle = {
  flex: 1,
  minHeight: 44,
  padding: '12px 0',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--c-hairline-strong)',
  background: 'transparent',
  color: 'var(--c-ink-soft)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
};

const confirmBtnStyle = (danger) => ({
  flex: 1,
  minHeight: 44,
  padding: '12px 0',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  // 破壊的アクションの色はブランドのレンガ色（--c-critical）に統一。
  // 以前の鮮やかな iOS 純赤 #ff3b30 は暖色世界観から浮き、削除メニュー側の
  // --c-critical と2色に割れていた。--color-error はシステムエラー帯専用に隔離。
  background: danger ? 'var(--c-critical)' : 'var(--c-brand)',
  color: 'var(--c-card)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
});

export function ConfirmProvider({ children }) {
  const [pending, setPending] = useState(null);
  const trapRef = useFocusTrap(!!pending);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setPending({
        options: {
          title: options.title || '確認',
          message: options.message || '',
          confirmLabel: options.confirmLabel || 'OK',
          cancelLabel: options.cancelLabel || 'キャンセル',
          danger: options.danger ?? false,
        },
        resolve,
      });
    });
  }, []);

  const finish = useCallback(
    (result) => {
      if (!pending) return;
      pending.resolve(result);
      setPending(null);
    },
    [pending]
  );

  // Allow Escape to cancel
  useEffect(() => {
    if (!pending) return undefined;
    const onKey = (e) => {
      // IME 変換中の Escape は「変換キャンセル」であってダイアログを閉じる意図ではない。
      if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, finish]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div style={overlayStyle} onClick={() => finish(false)} role="dialog" aria-modal="true">
          <div ref={trapRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={titleStyle}>{pending.options.title}</h2>
            {pending.options.message && <p style={messageStyle}>{pending.options.message}</p>}
            <div style={rowStyle}>
              <button type="button" style={cancelBtnStyle} onClick={() => finish(false)}>
                {pending.options.cancelLabel}
              </button>
              <button
                type="button"
                style={confirmBtnStyle(pending.options.danger)}
                onClick={() => finish(true)}
                autoFocus
              >
                {pending.options.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}
