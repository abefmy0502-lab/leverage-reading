import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  padding: 'var(--space-4)',
};

const cardStyle = {
  background: 'var(--c-card)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-6)',
  width: 'min(380px, 100%)',
  boxShadow: 'var(--shadow-overlay)',
  fontFamily: "var(--font-app)",
};

const titleStyle = {
  fontSize: 'var(--text-body)',
  color: 'var(--text)',
  fontWeight: 600,
  margin: '0 0 var(--space-2)',
};

const messageStyle = {
  fontSize: 'var(--text-sub)',
  color: 'var(--text-2)',
  lineHeight: 1.6,
  margin: '0 0 var(--space-6)',
  whiteSpace: 'pre-line',
};

const rowStyle = {
  display: 'flex',
  gap: 'var(--space-3)',
};

const cancelBtnStyle = {
  flex: 1,
  minHeight: 48,
  // 縦に積んだときも文字がボタンの縁に付かないよう、左右にも余白（2026-09-29）。
  padding: 'var(--space-3) var(--space-4)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
};

const confirmBtnStyle = (danger) => ({
  flex: 1,
  minHeight: 48,
  padding: 'var(--space-3) var(--space-4)',
  borderRadius: 'var(--radius)',
  border: 'none',
  // 破壊的アクションの色はブランドのレンガ色（--c-critical）に統一。
  // 以前の鮮やかな iOS 純赤 #ff3b30 は暖色世界観から浮き、削除メニュー側の
  // --c-critical と2色に割れていた。--color-error はシステムエラー帯専用に隔離。
  background: danger ? 'var(--error)' : 'var(--accent)',
  color: 'var(--accent-ink)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
});

export function ConfirmProvider({ children }) {
  const [pending, setPending] = useState(null);
  const trapRef = useFocusTrap(!!pending);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  // 最初に触れるボタン: ふつうは「決める」、消す操作（danger）は取り消せないので「やめる」側
  // （Enter の押し間違いで消さない・iOS のアラートと同じ・2026-09-29）。
  // フォーカストラップ（先頭のボタンへ移す）のあとに走るよう、このフックの後ろに置く。
  useEffect(() => {
    if (!pending) return;
    const el = pending.options.danger ? cancelRef.current : confirmRef.current;
    try { el?.focus(); } catch { /* ignore */ }
  }, [pending]);

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
        // 出るときは、ほかのダイアログと同じ .modal / .modal-backdrop（components.css）。
        <div className="modal-backdrop" style={overlayStyle} onClick={() => finish(false)} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <div ref={trapRef} className="modal" style={cardStyle} onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-dialog-title" style={titleStyle}>{pending.options.title}</h2>
            {pending.options.message && <p style={messageStyle}>{pending.options.message}</p>}
            {/* ボタンの文字が長い（8 字以上）ときは横に並べると語の途中で折り返すので、縦に積む
                （決める操作を上・やめるを下・iOS のアラートと同じ・2026-09-29）。 */}
            <div style={Math.max(String(pending.options.confirmLabel).length, String(pending.options.cancelLabel).length) >= 8 ? { ...rowStyle, flexDirection: 'column-reverse' } : rowStyle}>
              <button
                ref={cancelRef}
                type="button"
                style={cancelBtnStyle}
                onClick={() => finish(false)}
                autoFocus={!!pending.options.danger}
              >
                {pending.options.cancelLabel}
              </button>
              <button
                type="button"
                style={confirmBtnStyle(pending.options.danger)}
                onClick={() => finish(true)}
                ref={confirmRef}
                autoFocus={!pending.options.danger}
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
