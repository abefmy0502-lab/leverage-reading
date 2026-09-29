// アプリ本体の起動（main.jsx から、LP・法的ページ以外のときに読まれる）。
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import { AppDataCacheProvider } from './state/AppDataCache';
import { AuthProvider } from './hooks/useAuth';
import { initSentry } from './lib/sentry';
import { initNative } from './lib/native';
import { prefetchAppParts } from './components/lazyParts';
import { installPressFeedback } from './lib/pressFeedback';

export function mount(rootEl) {
  // Sentry はできるだけ早く初期化する — 後段で throw された時に拾えるようにするため。
  // DSN 未設定 / dev モードでは内部で no-op になる。
  initSentry();

  // ネイティブ (Capacitor / iOS) のみ StatusBar / Keyboard / SplashScreen を
  // 初期化する。Web / PWA では内部で即 return するので無害。
  initNative();

  // 👆 指で押した瞬間に押した形を出す（:active が遅れる／付かない端末のため・lib/pressFeedback.js）。
  installPressFeedback();

  ReactDOM.createRoot(rootEl).render(
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

  // ⚡ 最初の描画が落ち着いたあと、手が空いたときにタブ・本の詳細の部品を先読みする
  // （ログイン済み・ネイティブだけ）。
  prefetchAppParts();
}
