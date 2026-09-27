// 📊 LP（紹介ページ）の閲覧状況の記録と、ヒーローの A/B（3D ↔ 写真）の振り分け。
//
// - 送り先は自前の api/lp-event.js（→ lp_events テーブル）。Cookie は使わない。
//   閲覧タブごとの無作為な識別子（sessionStorage）で束ねるだけで、入力文や個人を特定する値は送らない。
// - ブラウザの Do Not Track がオン、または開発中（npm run demo 等）は送らない（開発中は console に出す）。
// - App Store のキャンペーンリンク: VITE_APP_STORE_PT（App Store Connect の provider token）があれば、
//   押した場所と表示方式を ct に入れる → App Store Connect の「App 分析 → キャンペーン」で
//   どのボタンからのダウンロードかを数えられる。
// 集計のしかたは docs/lp-measurement.md。

import { APP_STORE_URL } from './appStore';

const DEV = import.meta.env.DEV;
const PT = (import.meta.env.VITE_APP_STORE_PT || '').trim();

const safe = (fn, fallback = null) => {
  try { return fn(); } catch { return fallback; }
};

const randomId = () => safe(() => crypto.randomUUID(), null)
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

let sessionId = null;
function session() {
  if (sessionId) return sessionId;
  sessionId = safe(() => sessionStorage.getItem('orime-lp-sid')) || randomId();
  safe(() => sessionStorage.setItem('orime-lp-sid', sessionId));
  return sessionId;
}

// ヒーローの表示方式。?hero=3d / ?hero=photo で固定でき、それ以外は端末ごとに半々で振り分けて覚える。
let variant = null;
export function lpVariant() {
  if (variant) return variant;
  const q = safe(() => new URLSearchParams(window.location.search).get('hero'));
  if (q === '3d' || q === 'photo') { variant = q; return variant; }
  const saved = safe(() => localStorage.getItem('orime-lp-hero'));
  variant = saved === '3d' || saved === 'photo' ? saved : (Math.random() < 0.5 ? '3d' : 'photo');
  safe(() => localStorage.setItem('orime-lp-hero', variant));
  return variant;
}

let context = null;
function ctx() {
  if (context) return context;
  const sp = safe(() => new URLSearchParams(window.location.search), new URLSearchParams());
  const refHost = safe(() => {
    if (!document.referrer) return null;
    const h = new URL(document.referrer).host;
    return h && h !== window.location.host ? h.slice(0, 100) : null;
  });
  const cut = (v) => (v ? v.slice(0, 64) : null);
  context = {
    device: safe(() => (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768 ? 'mobile' : 'desktop'), null),
    ref_host: refHost,
    utm_source: cut(sp.get('utm_source')),
    utm_medium: cut(sp.get('utm_medium')),
    utm_campaign: cut(sp.get('utm_campaign')),
  };
  return context;
}

const blocked = () => safe(() => navigator.doNotTrack === '1' || window.doNotTrack === '1', false);

let viewSent = false;
export function lpTrack(event, props = {}) {
  if (typeof window === 'undefined') return;
  if (event === 'lp_view') { if (viewSent) return; viewSent = true; } // 1 回の表示で 1 件だけ
  const payload = { event, props, session_id: session(), variant: lpVariant(), ...ctx() };
  if (DEV) {
    // eslint-disable-next-line no-console
    console.debug('[lp]', event, props);
    return;
  }
  if (blocked()) return;
  const body = JSON.stringify(payload);
  const sent = safe(() => navigator.sendBeacon?.('/api/lp-event', new Blob([body], { type: 'application/json' })), false);
  if (!sent) {
    safe(() => fetch('/api/lp-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {}));
  }
}

// 押した場所ごとの App Store の URL（provider token があるときだけキャンペーン情報を付ける）。
export function storeUrlFor(loc) {
  if (!PT) return APP_STORE_URL;
  const ct = `lp_${loc}_${lpVariant()}`.slice(0, 40);
  const sep = APP_STORE_URL.includes('?') ? '&' : '?';
  return `${APP_STORE_URL}${sep}pt=${encodeURIComponent(PT)}&ct=${encodeURIComponent(ct)}&mt=8`;
}
