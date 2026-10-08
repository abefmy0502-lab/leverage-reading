// 📱 App Store 導線の唯一の真実。
//
// 以前は Landing.jsx / Paywall.jsx / App.jsx / AccountSettings.jsx の 4 箇所が
// それぞれ `import.meta.env.VITE_APP_STORE_URL || 'https://apps.apple.com/jp/app/orime'`
// を複製していた。フォールバックの `/jp/app/orime` は **実在しないプレースホルダー**
// （公開前の暫定値）で、審査通過前にユーザーが踏むと App Store の 404 に落ちる。
// ここに集約し、「実 URL が設定されているか」を判定できるようにする。
//
// 使い方:
//   import { APP_STORE_URL, isAppStoreLive } from '../lib/appStore';
//   {isAppStoreLive ? <a href={APP_STORE_URL}>App Store で入手</a> : <span>近日公開</span>}
//
// VITE_APP_STORE_URL に実 URL（.../idXXXXXXXXXX）を設定すると isAppStoreLive が
// true になり、全導線が一斉に「入手」ボタンへ切り替わる。

import { storeCampaignLink } from './storeCampaign';

const PLACEHOLDER_URL = 'https://apps.apple.com/jp/app/orime';

export const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL || PLACEHOLDER_URL;

// 実 URL が env で設定されているか（= リンクを出してよいか）。
// プレースホルダーのままなら false — 導線側は「近日公開」等に倒すこと。
export const isAppStoreLive = Boolean(import.meta.env.VITE_APP_STORE_URL);

// 📊 App Store Connect の provider token（キャンペーンリンクの pt=）。無ければ ct を付けない（lib/storeCampaign.js）。
export const APP_STORE_PT = String(import.meta.env.VITE_APP_STORE_PT || '').trim();

// キャンペーン名（ct）付きの App Store の URL。App Store の URL がまだ無いときは ''（入れない・出さない）。
//   ct は lib/storeCampaign.js の campaignToken / shareCampaign で作る（share_* / note_* / partner_* / web_*）。
export function storeLinkFor(ct) {
  return storeCampaignLink({ url: APP_STORE_URL, live: isAppStoreLive, pt: APP_STORE_PT }, ct);
}
