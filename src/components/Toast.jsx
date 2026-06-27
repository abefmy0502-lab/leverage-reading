import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, Trash2, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext({
  show: () => '',
  success: () => '',
  error: () => '',
  info: () => '',
  undo: () => '',
  dismiss: () => {},
});

// 下部バー（error / undo / info 用）の配色。success は下部バーを使わず、
// 中央の上品な ✓ HUD（toast-hud）で表現する。
const palette = {
  info: { bg: 'rgba(61,54,44,0.94)', fg: 'var(--c-card)', Icon: Info },
  error: { bg: 'rgba(160,80,64,0.96)', fg: 'var(--c-card)', Icon: AlertTriangle },
  undo: { bg: 'rgba(61,54,44,0.94)', fg: 'var(--c-card)', Icon: Trash2 },
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
  borderRadius: 'var(--radius-lg)',
  fontSize: 13,
  fontFamily: 'var(--font-app)',
  lineHeight: 'var(--leading-base)',
  boxShadow: 'var(--shadow-4)',
  WebkitBackdropFilter: 'blur(10px)',
  backdropFilter: 'blur(10px)',
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
  padding: '7px 14px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
};

// 下部バー（error / undo / info）。success はここには来ない。
function ToastItem({ toast, onDismiss, onAction }) {
  const p = palette[toast.type] || palette.info;
  const Icon = p.Icon;
  return (
    <div
      className="toast-enter"
      style={{ ...toastStyleBase, background: p.bg, color: p.fg }}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      {Icon && <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{toast.message}</span>
      {toast.action && (
        <button type="button" style={actionBtnStyle} onClick={() => onAction(toast)}>
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

// 中央の ✓ HUD（成功時）。下からせり上がるバーではなく、画面中央に一瞬だけ
// 上品に出して消える iOS 風の確認表示。アクションした手応えを邪魔せず伝える。
const hudContainerStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 'var(--z-toast)',
  pointerEvents: 'none',
};

function ToastHud({ toast }) {
  // HUD 自体が ✓ を出すので、メッセージ先頭の絵文字（✅ / 💾 / 🎯 等）は除去。
  const message = (toast.message || '').replace(/^[←-⯿\u{1F000}-\u{1FAFF}️‍\s]+/u, '');
  return (
    <div
      className="toast-hud"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '20px 24px',
        minWidth: 132,
        maxWidth: 'min(280px, calc(100vw - 48px))',
        background: 'rgba(40,34,28,0.92)',
        color: '#fff',
        borderRadius: 20,
        boxShadow: 'var(--shadow-5)',
        WebkitBackdropFilter: 'blur(12px)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span
        className="toast-hud-check"
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: 'rgba(95,122,85,0.22)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ec48a',
        }}
      >
        <Check size={28} strokeWidth={2.4} aria-hidden="true" />
      </span>
      {message && (
        <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {message}
        </span>
      )}
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
          : type === 'success'
          ? 1150 // ✓ HUD は一瞬で消える
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

  const hudToasts = toasts.filter((t) => t.type === 'success');
  const barToasts = toasts.filter((t) => t.type !== 'success');

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 中央 ✓ HUD（成功） */}
      <div style={hudContainerStyle} aria-live="polite">
        {hudToasts.slice(-1).map((toast) => (
          <ToastHud key={toast.id} toast={toast} />
        ))}
      </div>
      {/* 下部バー（エラー / 削除取消 / 情報） */}
      <div style={containerStyle} aria-live="polite">
        {barToasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onAction={handleAction} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
