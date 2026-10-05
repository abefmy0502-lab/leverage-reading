// 🚪 入口。ここはできるだけ小さく保つ（ここに静的 import を足すと、LP でもアプリでも毎回読まれる）。
// LP・法的ページ（/lp, /legal/*, ?view=lp）と、`/` に来たはじめての人（ログインの記録が無い・アプリの用事が無い
// ＝lib/staticRoute.js の landingAtRoot・2026-10-05）はそのページだけを、それ以外はアプリ本体を読む。
// 本体の起動は mainApp.jsx（Provider の並び・Sentry・ネイティブ初期化）、静的ページは mainStatic.jsx。
import './index.css';
import { entryRoute } from './lib/staticRoute';

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

const rootEl = document.getElementById('root');
// お試しモード（npm run demo）の `/` はアプリを見る場所なので、はじめての人の LP にしない。
const route = entryRoute({ demo: import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true' });
// ⚠️ 2 つの import() はオブジェクトの別々の値にしておく。三項演算子や if/else にすると、圧縮で 1 つの
// 呼び出しにまとめられ、Vite の先読みがアプリ本体の部品まで読んでしまう（LP が重くなる）。
const ENTRIES = {
  static: () => import('./mainStatic'),
  app: () => import('./mainApp'),
};
ENTRIES[route ? 'static' : 'app']()
  .then((m) => m.mount(rootEl, route))
  .catch((err) => {
    // 読み込みに失敗（通信・古い版）。vite:preloadError で再読み込みされないときのために記録だけ残す。
    console.error('[orime] failed to start', err);
  });
