import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Trash2, Undo2, AlertTriangle, Info, X } from 'lucide-react';
import { withPhraseBreaks } from './TightBubble';

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
  // トーストは画面と反転した色（明るい画面では濃い面・暗い画面では明るい面）。
  info: { bg: 'var(--text)', fg: 'var(--bg)', Icon: Info },
  error: { bg: 'var(--error)', fg: 'var(--accent-ink)', Icon: AlertTriangle },
  // 「元に戻す」つきの知らせ。印はふつう中立の ↶（状態の変更など）で、削除のときだけゴミ箱（2026-09-29）。
  //   以前はいつもゴミ箱で、「読書中に変更しました」まで消したように見えていた。
  undo: { bg: 'var(--text)', fg: 'var(--bg)', Icon: Undo2 },
  undoDelete: { bg: 'var(--text)', fg: 'var(--bg)', Icon: Trash2 },
  // ボタン付きの成功（下のバーで出す）。印は成功と同じ ✓。
  done: { bg: 'var(--text)', fg: 'var(--bg)', Icon: Check },
};

// 下のタブバー（またはシートの決定ボタンの欄）が出ているときは、その上に浮かべる（タブを隠さない）。
// どちらも無い画面（ログイン・キーボード表示中など）は下端から 16。
const BOTTOM_WITH_BAR = 'calc(var(--tabbar-h) + var(--space-2) + env(safe-area-inset-bottom, 0px))';
const BOTTOM_PLAIN = 'calc(var(--space-4) + env(safe-area-inset-bottom, 0px))';
// 閉じている途中のシート（data-closing・QuickMemoSheet / 設定）は、もう無いものとして扱う
// （閉じ終わってから位置が 110px ほど跳ねていた・2026-09-29）。
const OPEN_DIALOG = '[role="dialog"][aria-modal="true"]:not([data-closing])';
const CLOSING_DIALOG = '[role="dialog"][aria-modal="true"][data-closing]';
function hasBottomBar() {
  if (typeof document === 'undefined') return false;
  // 閉じている途中のシートがあれば、閉じ終わるとキーボードも下りてタブが戻る。はじめからタブの上に出す
  // （キーボードが下りたあとに下端からタブの上へ跳ねていた・2026-09-30）。
  if (!document.querySelector(OPEN_DIALOG) && document.querySelector(CLOSING_DIALOG)) return true;
  if (document.body?.classList.contains('keyboard-open')) return false;
  return !!document.querySelector(`.bottom-nav:not(.is-hidden), ${OPEN_DIALOG}`);
}
// 右下に浮いたボタン（本の詳細の「メモを書く」＝data-fab）が見えているときは、その上に浮かべる
// （保存の知らせが 2 行になってボタンに重なり、押せなくなっていた・2026-09-29）。シートなどが開いている間は、
// ボタンはその下に隠れているので気にしない。
function barBottom() {
  if (!hasBottomBar()) return BOTTOM_PLAIN;
  if (!document.querySelector(OPEN_DIALOG)) {
    const fab = document.querySelector('[data-fab]');
    const r = fab ? fab.getBoundingClientRect() : null;
    if (r && r.height > 0) return `calc(${Math.max(0, Math.round(window.innerHeight - r.top))}px + var(--space-2))`;
  }
  return BOTTOM_WITH_BAR;
}

// 高さの位置は bottom ではなく transform で動かす（bottom を動かすと毎フレーム配置し直しになり、カクついていた・2026-09-30）。
const containerStyle = {
  position: 'fixed',
  left: '50%',
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  zIndex: 'var(--z-toast)',
  width: 'min(420px, calc(100vw - 2 * var(--space-4)))',
  pointerEvents: 'none',
};

const toastStyleBase = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  // 右は閉じるボタン（押せる範囲 44）の内側の空きで足りるので詰める。
  padding: 'var(--space-1) var(--space-1) var(--space-1) var(--space-4)',
  minHeight: 52,
  borderRadius: 'var(--radius)',
  fontSize: 'var(--text-sub)',
  fontFamily: 'var(--font-app)',
  lineHeight: 'var(--leading-base)',
  boxShadow: 'var(--shadow-overlay)',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'inherit',
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
  background: 'transparent',
  border: '1px solid currentColor',
  color: 'inherit',
  padding: 'var(--space-2) var(--space-3)',
  minHeight: 44,
  borderRadius: 'var(--radius)',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
};

const stripLeadingEmoji = (m) => String(m || '').replace(/^[←-⯿\u{1F000}-\u{1FAFF}️‍\s]+/u, '');

// 下部バー（error / undo / info）。success はここには来ない。
function ToastItem({ toast, onDismiss, onAction }) {
  const p = (toast.type === 'undo' && toast.destructive ? palette.undoDelete : palette[toast.type]) || palette.info;
  const Icon = p.Icon;
  return (
    <div
      className="toast-enter"
      style={{ ...toastStyleBase, background: p.bg, color: p.fg }}
      // 読み上げは外側の入れ物（いつもある live region）に任せる。ここにも role を付けると
      // 入れ子になって 2 回読まれていた（2026-09-29）。
    >
      {Icon && <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />}
      {/* 左のアイコンがあるので、文の先頭の絵文字は外す（DESIGN §3-2・中央の ✓ と同じ）。 */}
      {/* 折り返すときは文節の切れ目で（「保存しまし／た。」と切らない・TightBubble と同じ BudouX）。 */}
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-line', wordBreak: 'keep-all', overflowWrap: 'anywhere', padding: 'var(--space-2) 0' }}>{withPhraseBreaks(stripLeadingEmoji(toast.message))}</span>
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
        <X size={18} aria-hidden="true" />
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
  const message = stripLeadingEmoji(toast.message);
  return (
    <div
      className={toast.duration > 1150 ? 'toast-hud toast-hud-long' : 'toast-hud'}
      role="status"
      aria-live="polite"
      style={{
        '--hud-dur': `${toast.duration}ms`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-6)',
        minWidth: 132,
        maxWidth: 'min(280px, calc(100vw - 2 * var(--space-6)))',
        background: 'var(--text)',
        color: 'var(--bg)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-overlay)',
      }}
    >
      <span
        className="toast-hud-check"
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '2px solid currentColor',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'inherit',
        }}
      >
        <Check size={28} strokeWidth={2.4} aria-hidden="true" />
      </span>
      {message && (
        <span style={{ fontSize: 'var(--text-sub)', fontWeight: 600, textAlign: 'center', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
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
  const [barPos, setBarPos] = useState(BOTTOM_PLAIN);
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
      // ボタン（取消・行動にする・開く など）付きの成功は、押せない中央の ✓ ではなく
      // 下のバーで出す（中央の ✓ はボタンを持てず、押せる操作が黙って消えていた・2026-09-27）。
      // 印は成功と同じ ✓（palette.done）。
      const type = opts.type === 'success' && opts.action ? 'done' : (opts.type || 'info');
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
        destructive: !!opts.destructive,
        onExpire: opts.onExpire,
        duration,
      };
      if (type !== 'success') setBarPos(barBottom());
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

  // 値は作り直さない（知らせを出す・消すたびに、useToast を使う画面がすべて描き直されていた。
  // 行動の「元に戻す」など、知らせと一緒に動く操作が遅い端末で重くなっていた・2026-09-29）。
  const value = useMemo(() => ({
    show,
    success: (message, opts = {}) => show({ ...opts, type: 'success', message }),
    error: (message, opts = {}) => show({ ...opts, type: 'error', message }),
    info: (message, opts = {}) => show({ ...opts, type: 'info', message }),
    // destructive: 削除の取り消しならゴミ箱の印。省くと文面（「削除」「消しました」）から決める。
    undo: ({ message, onUndo, onExpire, duration = 5000, destructive }) =>
      show({
        type: 'undo',
        message,
        duration,
        onExpire,
        destructive: typeof destructive === 'boolean' ? destructive : /削除|消しました/.test(String(message || '')),
        action: { label: '元に戻す', onClick: onUndo },
      }),
    dismiss,
  }), [show, dismiss]);

  const hudToasts = toasts.filter((t) => t.type === 'success');
  const barToasts = toasts.filter((t) => t.type !== 'success');

  // 下部バーの高さ位置は、出ている間だけ見直す（シートが閉じた・キーボードが下りた・浮いたボタンが出たなどで変わる。
  // 出した瞬間の位置のままだと、タブやボタンに重なったまま残っていた）。出す瞬間の位置は show() で決める。
  // 動かすのは出たあとだけ（出る瞬間に前の位置から滑ってこないように）。
  const hasBar = barToasts.length > 0;
  const [barAnim, setBarAnim] = useState(false);
  useEffect(() => {
    if (!hasBar) { setBarAnim(false); return undefined; }
    const raf = requestAnimationFrame(() => setBarAnim(true));
    const id = setInterval(() => setBarPos((cur) => { const next = barBottom(); return next === cur ? cur : next; }), 200);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [hasBar]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 中央 ✓ HUD（成功） */}
      <div style={hudContainerStyle} aria-live="polite">
        {hudToasts.slice(-1).map((toast) => (
          <ToastHud key={toast.id} toast={toast} />
        ))}
      </div>
      {/* 下部バー（エラー / 削除取消 / 情報）。エラーがある時はスクリーンリーダーに
          割り込み通知（assertive/alert）、それ以外は穏やかに（polite/status）。 */}
      {(() => {
        const barHasError = barToasts.some((t) => t.type === 'error');
        return (
          <div style={{ ...containerStyle, transform: `translate(-50%, calc(-1 * (${barPos})))`, transition: barAnim ? 'transform var(--duration-fast) var(--ease-out)' : 'none' }} aria-live={barHasError ? 'assertive' : 'polite'} role={barHasError ? 'alert' : 'status'}>
            {barToasts.map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onAction={handleAction} />
            ))}
          </div>
        );
      })()}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
