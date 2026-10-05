// LP・法的ページの起動（main.jsx から読まれる）。アプリ本体（App.jsx 一式・ログイン・データ）は読まない。
// 以前は App.jsx の中で同じページを出していた（見た目・中身は同じ）。
import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './components/ErrorBoundary';
import Spinner from './components/Spinner';
import { initSentry } from './lib/sentry';
import { entryRoute } from './lib/staticRoute';

const DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true';

const PAGES = {
  lp: lazy(() => import('./pages/Landing')),
  terms: lazy(() => import('./legal/TermsPage')),
  privacy: lazy(() => import('./legal/PrivacyPage')),
  sct: lazy(() => import('./legal/SctPage')),
};

function StaticPage({ route }) {
  // 同じ文書の中で（戻る等で）アプリの URL に変わったら、アプリとして読み直す。
  useEffect(() => {
    const onPop = () => {
      if (entryRoute({ demo: DEMO }) !== route) window.location.reload();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [route]);
  const Page = PAGES[route] || PAGES.lp;
  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
}

export function mount(rootEl, route) {
  initSentry();
  // iOS アプリ（Capacitor）の中で開いたときだけ、端末の部品（状態バー・キーボード）を整える。
  // ブラウザで見る LP には要らないので、別ファイルにして読まない（約 15KB・2026-10-05）。
  if (window.Capacitor?.isNativePlatform?.()) import('./lib/native').then((m) => m.initNative()).catch(() => {});
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <StaticPage route={route} />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
