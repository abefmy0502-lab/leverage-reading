import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import { AppDataCacheProvider } from './state/AppDataCache';
import { AuthProvider } from './hooks/useAuth';
import { initSentry } from './lib/sentry';
import { initNative } from './lib/native';

// Sentry はモジュール評価の最上位で初期化する — 後段で throw された時に
// 拾えるようにするため。DSN 未設定 / dev モードでは内部で no-op になる。
initSentry();

// ネイティブ (Capacitor / iOS) のみ StatusBar / Keyboard / SplashScreen を
// 初期化する。Web / PWA では内部で即 return するので無害。
initNative();

// 🔄 新しい版を公開した直後、開いたままの古い画面が「もう無い部品（assets/*.js）」を
// 読みに行って画面が真っ白になるのを防ぐ。1 回だけ再読み込みして新しい版に切り替える
// （sessionStorage で 1 分以内の再発は見送り＝無限リロードにしない）。
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('orime-chunk-reload') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('orime-chunk-reload', String(Date.now()));
  } catch { /* storage が使えなくても再読み込みはする */ }
  event.preventDefault();
  window.location.reload();
});

// 🌙 暗い画面を有効にする（tokens.css の :root[data-dark-ready]）。
// 2026-09-26: 全画面のトークン化が終わったので本番でも有効化（DESIGN.md §8 の手順 5）。
// 端末の設定（ライト／ダーク）に自動で従う。問題が出たら、この 1 行を消せば明るい画面だけに戻る。
document.documentElement.setAttribute('data-dark-ready', '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppDataCacheProvider>
          <ToastProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ToastProvider>
        </AppDataCacheProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
