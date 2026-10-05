// 📊 LP（紹介ページ）の閲覧状況の記録と、ヒーローの A/B（3D ↔ 写真）の振り分け。
//
// - 送り先は自前の api/lp-event.js（→ lp_events テーブル）。Cookie は使わない。
//   閲覧タブごとの無作為な識別子（sessionStorage）で束ねるだけで、入力文や個人を特定する値は送らない。
// - ブラウザの Do Not Track がオン、または開発中（npm run demo 等）は送らない（開発中は console に出す）。
// - App Store のキャンペーンリンク: VITE_APP_STORE_PT（App Store Connect の provider token）があれば、
//   押した場所と表示方式を ct に入れる → App Store Connect の「App 分析 → キャンペーン」で
//   どのボタンからのダウンロードかを数えられる。
// - 公開のお知らせの登録（submitWaitlist）は記録ではなく本人の送信なので、Do Not Track でも送る。
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

// 3D を出せる画面か（2026-10-05: 768px 以上・マウスの端末だけ。スマホの 3D は写真の上にカードが 1 枚重なるだけで、
// three.js（約 130KB）と GPU の費用に見合わなかった・LP の CRO 点検 P2-5）。
export const WIDE_POINTER = '(min-width: 768px) and (pointer: fine)';
export const isWidePointer = () => safe(() => window.matchMedia(WIDE_POINTER).matches, false);

// ヒーローの表示方式。?hero=3d / ?hero=photo で固定できる。それ以外は、3D を出せる画面（広い画面・マウス）の
// 端末だけ半々で振り分けて覚え、スマホ・タブレットはいつも 'photo'（覚えない）。
// VITE_LP_HERO_AB=off で、みんな 'photo'（A/B を止める）。
const AB_OFF = String(import.meta.env.VITE_LP_HERO_AB || '').trim().toLowerCase() === 'off';
let variant = null;
export function lpVariant() {
  if (variant) return variant;
  const q = safe(() => new URLSearchParams(window.location.search).get('hero'));
  if (q === '3d' || q === 'photo') { variant = q; return variant; }
  if (AB_OFF || !isWidePointer()) { variant = 'photo'; return variant; }
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

// ✉️ 公開のお知らせの登録（App Store の URL が無い間の入口・api/lp-waitlist.js）。
// 本人がボタンを押して送るものなので、Do Not Track でも送る（閲覧の記録ではない）。
// 返す形: { ok: true } / { ok: false, error: 'invalid_email' | 'rate_limited' | 'unavailable' | 'network' }
// 🧪 開発中（npm run demo 等・api が無い）は送らずにまねる: ?waitlist=fail（保存できない）/ slow（3 秒待つ）。
export async function submitWaitlist({ email, website = '' }) {
  const c = ctx();
  const body = {
    email: String(email || '').slice(0, 300),
    website: String(website || '').slice(0, 200),
    variant: lpVariant(),
    utm_source: c.utm_source,
    utm_medium: c.utm_medium,
    utm_campaign: c.utm_campaign,
  };
  if (DEV) {
    const mode = safe(() => new URLSearchParams(window.location.search).get('waitlist'));
    await new Promise((r) => setTimeout(r, mode === 'slow' ? 3000 : 500));
    // eslint-disable-next-line no-console
    console.debug('[lp] waitlist', body);
    if (mode === 'fail') return { ok: false, error: 'unavailable' };
    return { ok: true };
  }
  try {
    const r = await fetch('/api/lp-waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.ok) return { ok: true };
    const error = ['invalid_email', 'rate_limited', 'unavailable'].includes(j?.error) ? j.error : (r.status === 429 ? 'rate_limited' : 'unavailable');
    return { ok: false, error };
  } catch {
    return { ok: false, error: 'network' };
  }
}

