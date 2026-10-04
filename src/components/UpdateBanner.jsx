// 📦 UpdateBanner — PWA 新版検知 + 安全状態でだけ告知するバナー。
//
// 設計:
//   - sw.js は install 時に skipWaiting() を呼ばないので、新版は
//     waiting 状態で待機する (= ユーザーの作業を中断しない)。
//   - swUpdate.js が新版検出時に `app-update-available` event を
//     window.dispatch する。
//   - このコンポーネントは module level で event を捕捉し、内部 boolean
//     を立てる。これにより view 切替で UpdateBanner が unmount しても
//     更新検知の事実が失われない。
//   - safe = true (本棚画面 + モーダル無し + 入力フォーカス無し) の時だけ
//     画面上部に portal でバナーを表示する。
//   - 「今すぐ更新」で applyUpdate() → SKIP_WAITING → activate → reload。
//   - 「後で」で 30 秒間バナーを閉じる (再表示までクールダウン)。

import { useEffect, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyUpdate } from '../lib/swUpdate';
import { isNative } from '../lib/iap';
import { btnLink } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

// ---------------------------------------------------------------------------
// Module-level state — UpdateBanner が unmount/remount されても更新検知の
// 事実は失われない。ページ全体の生存期間中だけ保持される。
// ---------------------------------------------------------------------------
let _updateAvailable = false;
const _listeners = new Set();
function notifyListeners() { _listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); }

if (typeof window !== 'undefined') {
  window.addEventListener('app-update-available', () => {
    _updateAvailable = true;
    notifyListeners();
  });
}

// 入力フォーカスを React state に同期する補助 hook。
// document.activeElement だけでは focus 変更で再描画されないため、
// focusin/focusout を listen して state を更新する。
function useInputFocused() {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = document.activeElement;
      const tag = el?.tagName;
      const isEditable = el?.isContentEditable;
      setFocused(tag === 'INPUT' || tag === 'TEXTAREA' || isEditable === true);
    };
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    check();
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);
  return focused;
}

// 見た目はトークンだけ（2026-10-04）。以前は栗色の帯（アクセントは主ボタン・リンク・選択中だけ＝DESIGN §3-2）・
// 12px の文字・丸いピル・📦 の絵文字だった。浮いた知らせのカード（--surface＋枠＋--shadow-overlay・角丸 12）にする。
// 置き場所は下のタブの上（知らせと同じ高さ・2026-10-04 ui-critic）: 上に置くと、上の行の「写真で共有」・？・⚙️ と
// 画面の題に重なっていた。出るのはホームの一覧（下のタブが出ている画面）だけ。
const overlayStyle = {
  position: 'fixed',
  bottom: 'calc(var(--tabbar-h) + var(--space-3) + env(safe-area-inset-bottom, 0px))',
  left: 'var(--space-4)',
  right: 'var(--space-4)',
  maxWidth: 420,
  margin: '0 auto',
  zIndex: 'var(--z-banner)',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: '0 var(--space-2) 0 var(--space-4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  boxShadow: 'var(--shadow-overlay)',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-ui)',
  animation: 'lvg-update-in var(--duration-base) var(--ease-out) both',
};

const applyBtnStyle = { ...btnLink, whiteSpace: 'nowrap' };
const dismissBtnStyle = { ...btnLink, color: 'var(--text-2)', fontWeight: 400, whiteSpace: 'nowrap' };

export default function UpdateBanner({ safe = false }) {
  // module-level の更新検知フラグを React state に同期する。
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    _listeners.add(force);
    return () => { _listeners.delete(force); };
  }, []);
  const updateAvailable = _updateAvailable;

  const inputFocused = useInputFocused();
  const [dismissed, setDismissed] = useState(false);

  // 「後で」を押したら 30 秒は再表示しない。クールダウン後にまた
  // safe state に戻った時に自然に再表示する。
  useEffect(() => {
    if (!dismissed) return undefined;
    const t = setTimeout(() => setDismissed(false), 30000);
    return () => clearTimeout(t);
  }, [dismissed]);

  // ネイティブ(App Store アプリ)では更新はストア経由＝SW 非登録でこの event は
  // そもそも発火しないが、多層防御として明示的にも封じる（誤案内防止）。
  if (isNative) return null;
  if (!updateAvailable) return null;
  if (!safe) return null;
  if (inputFocused) return null;
  if (dismissed) return null;
  if (typeof document === 'undefined') return null;

  const handleApply = () => {
    try { applyUpdate(); } catch { /* swUpdate handles fallback */ }
  };

  // body に portal することで、AuthedApp 内のどこにマウントされていても
  // 画面上部に必ず固定表示される。view 切替で unmount される心配なし。
  return createPortal(
    <>
      <style>{`@keyframes lvg-update-in { from { transform: translateY(var(--space-4)); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      {/* data-toast-above: 知らせ（Toast）はこのカードの上に浮かべる（タブの上で重なっていた・2026-10-04）。 */}
      <div style={overlayStyle} role="status" aria-live="polite" data-toast-above="">
        <span style={{ flex: 1, minWidth: 0, padding: 'var(--space-3) 0', fontSize: 'var(--text-sub)', lineHeight: 1.5, color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {withPhraseBreaks('アプリの新しい版があります')}
        </span>
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <button type="button" style={dismissBtnStyle} onClick={() => setDismissed(true)}>後で</button>
          <button type="button" style={applyBtnStyle} onClick={handleApply}>更新する</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
