// 📜 利用規約・プライバシーポリシーへのリンク先の唯一の真実。
//
// ネイティブ（Capacitor iOS）はアプリを capacitor://localhost から動かしているため、
// `/legal/terms` のような相対パスを target="_blank" で開くと、Safari に渡せず何も起きない
// （App Store 審査 3.1.2 で「規約リンクが機能しない」と差し戻される原因になる）。
// ネイティブでは本番サイトの https の絶対 URL にして、外部ブラウザ（Safari）で開かせる。
// Web は同じサイト内なので相対パスのまま。
//
// VITE_SITE_URL: 本番サイトの URL（末尾スラッシュなし）。未設定なら既定のドメイン。
import { isNative } from './iap';

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://leverage-reading.vercel.app').replace(/\/+$/, '');

const legal = (path) => (isNative ? `${SITE_URL}${path}` : path);

export const TERMS_URL = legal('/legal/terms');
export const PRIVACY_URL = legal('/legal/privacy');
export const SCT_URL = legal('/legal/sct');
