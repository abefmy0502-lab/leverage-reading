import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext({
  show: () => '',
  success: () => '',
  error: () => '',
  info: () => '',
  undo: () => '',
  dismiss: () => {},
});

const palette = {
  info: { bg: 'var(--c-ink)', fg: 'var(--c-card)', border: 'var(--c-ink)', icon: 'ℹ️' },
  success: { bg: '#5a7a48', fg: 'var(--c-card)', border: '#5a7a48', icon: '✓' },
  error: { bg: 'var(--c-critical)', fg: 'var(--c-card)', border: 'var(--c-critical)', icon: '⚠' },
  undo: { bg: 'var(--c-ink)', fg: 'var(--c-card)', border: 'var(--c-ink)', icon: '🗑' },
};

const containerStyle = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(20px + env(safe-area-inset-bottom))',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 'var(--z-toast)',
  width: 'min(420px, calc(100vw - 24px))',
  pointerEvents: 'none',
};

const toastStyleBase = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  fontFamily: "var(--font-app)",
  lineHeight: 'var(--leading-base)',
  boxShadow: 'var(--shadow-4)',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'rgba(250,246,240,0.7)',
  fontSize: 16,
  cursor: 'pointer',
  padding: 0,
  minWidth: 44,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  flexShrink: 0,
};

const actionBtnStyle = {
  background: 'rgba(250,246,240,0.18)',
  border: '1px solid rgba(250,246,240,0.4)',
  color: 'var(--c-card)',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
};

function ToastItem({ toast, onDismiss, onAction }) {
  const p = palette[toast.type] || palette.info;
  return (
    <div
      className="toast-enter"
      style={{
        ...toastStyleBase,
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.border}`,
      }}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>{p.icon}</span>
      <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          style={actionBtnStyle}
          onClick={() => onAction(toast)}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        style={closeBtnStyle}
        onClick={() => onDismiss(toast.id, { byUser: true })}
        aria-label="閉じる"
      >
        ×
      </button>
    </div>
  );
}

let counter = 0;
function makeId() {
  counter += 1;
  return `t-${Date.now().toString(36)}-${counter}`;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const toastsRef = useRef([]);

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const clearTimer = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id, opts = {}) => {
      const toast = toastsRef.current.find((t) => t.id === id);
      clearTimer(id);
      setToasts((arr) => arr.filter((t) => t.id !== id));
      if (toast && !opts.skipExpire && opts.byUser !== true) {
        try {
          toast.onExpire?.();
        } catch {
          /* swallow */
        }
      }
    },
    [clearTimer]
  );

  const show = useCallback(
    (opts) => {
      const id = makeId();
      const type = opts.type || 'info';
      const duration =
        typeof opts.duration === 'number'
          ? opts.duration
          : type === 'undo'
          ? 5000
          : type === 'error'
          ? 5000
          : 3500;
      const toast = {
        id,
        type,
        message: opts.message,
        action: opts.action || null,
        onExpire: opts.onExpire,
        duration,
      };
      setToasts((arr) => [...arr, toast]);
      if (duration > 0) {
        const t = setTimeout(() => {
          dismiss(id);
        }, duration);
        timersRef.current.set(id, t);
      }
      return id;
    },
    [dismiss]
  );

  const handleAction = useCallback(
    (toast) => {
      // User-initiated action: skip the on-expire callback so undo doesn't run delete.
      try {
        toast.action?.onClick?.();
      } finally {
        clearTimer(toast.id);
        setToasts((arr) => arr.filter((t) => t.id !== toast.id));
      }
    },
    [clearTimer]
  );

  const value = {
    show,
    success: (message, opts = {}) => show({ ...opts, type: 'success', message }),
    error: (message, opts = {}) => show({ ...opts, type: 'error', message }),
    info: (message, opts = {}) => show({ ...opts, type: 'info', message }),
    undo: ({ message, onUndo, onExpire, duration = 5000 }) =>
      show({
        type: 'undo',
        message,
        duration,
        onExpire,
        action: { label: '取消', onClick: onUndo },
      }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={containerStyle} aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={dismiss}
            onAction={handleAction}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
