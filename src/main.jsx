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
