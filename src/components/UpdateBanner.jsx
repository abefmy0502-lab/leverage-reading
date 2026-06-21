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

const overlayStyle = {
  position: 'fixed',
  top: 'env(safe-area-inset-top, 0px)',
  left: 0,
  right: 0,
  zIndex: 999,
  background: 'linear-gradient(135deg, #5C4A2E, #8B6F47)',
  color: '#fff',
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  boxSizing: 'border-box',
  fontFamily: "'Noto Serif JP', Georgia, serif",
  animation: 'lvg-slide-down 280ms ease both',
};

const applyBtnStyle = {
  padding: '8px 14px',
  background: '#fff',
  color: '#5C4A2E',
  border: 'none',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  minHeight: 44,
};

const dismissBtnStyle = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.18)',
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  minHeight: 44,
};

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
      <style>{`@keyframes lvg-slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
      <div style={overlayStyle} role="status" aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden="true">📦</span>
          <span style={{ fontSize: 13, fontWeight: 600, wordBreak: 'keep-all' }}>
            アプリの新しい版があります
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" style={applyBtnStyle} onClick={handleApply}>今すぐ更新</button>
          <button type="button" style={dismissBtnStyle} onClick={() => setDismissed(true)}>後で</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
