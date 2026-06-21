import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ConfirmContext = createContext({ confirm: async () => false });

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const cardStyle = {
  background: '#faf6f0',
  borderRadius: 14,
  padding: '20px 22px',
  width: 'min(380px, 100%)',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  fontFamily: "'Noto Serif JP', Georgia, serif",
};

const titleStyle = {
  fontSize: 16,
  color: '#3d362c',
  fontWeight: 500,
  margin: '0 0 8px',
};

const messageStyle = {
  fontSize: 13,
  color: '#5c5548',
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
  padding: '10px 0',
  borderRadius: 10,
  border: '1px solid #d4ccbe',
  background: 'transparent',
  color: '#5c5548',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
};

const confirmBtnStyle = (danger) => ({
  flex: 1,
  padding: '10px 0',
  borderRadius: 10,
  border: 'none',
  background: danger ? 'var(--color-error, #ff3b30)' : '#5c5043',
  color: '#faf6f0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 500,
});

export function ConfirmProvider({ children }) {
  const [pending, setPending] = useState(null);

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
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, finish]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div style={overlayStyle} onClick={() => finish(false)} role="dialog" aria-modal="true">
          <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
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
