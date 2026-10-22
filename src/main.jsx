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
    // 読み込み・起動に失敗（通信・古い版・環境の値）。真っ暗のままにせず、何が起きたかを画面に出す
    // （2026-10-22 オーナー「真っ暗のまま」= ここで黙っていた）。アプリの部品が無い前提なので素の DOM で描く。
    console.error('[orime] failed to start', err);
    try { window.__orimeStartError = err; } catch { /* ignore */ }
    showStartFailure(rootEl, err);
  });

// 起動に失敗したときの最低限の画面（部品・トークンを読めない前提・端末の明暗に合わせた 2 色だけ）。
// 「もう一度」は、古い控え（サービスワーカーとキャッシュ）を消してから再読み込みする。
function showStartFailure(el, err) {
  if (!el) return;
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const detail = String((err && (err.message || err)) || '不明なエラー').slice(0, 300);
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  el.innerHTML = `
    <div role="alert" style="max-width:480px;margin:0 auto;padding:48px 16px;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;color:${dark ? '#f1ece4' : '#2a2520'}">
      <p style="margin:0 0 8px;font-size:17px;font-weight:600">アプリを起動できませんでした。</p>
      <p style="margin:0 0 16px;font-size:13px;opacity:.75;word-break:break-all">${esc(detail)}</p>
      <button type="button" id="orime-start-retry" style="min-height:48px;padding:0 24px;border-radius:12px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-weight:600">もう一度</button>
      <p style="margin:16px 0 0;font-size:13px;opacity:.75">直らないときは、この画面の文字をそのまま伝えてください。</p>
    </div>`;
  const btn = document.getElementById('orime-start-retry');
  if (btn) btn.addEventListener('click', async () => {
    try {
      if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
      if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    } catch { /* 消せなくても再読み込みはする */ }
    window.location.reload();
  });
}
