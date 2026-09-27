// 🛰️ 自前の API（/api/claude・/api/cover・/api/stripe-*）の呼び先の唯一の真実。
//
// iOS アプリ（Capacitor）は capacitor://localhost から動いているため、`/api/claude` のような
// 相対パスはアプリ自身（端末内のファイル）を指してしまい、Vercel のサーバーに届かない。
// ネイティブでは本番サイトの絶対 URL（VITE_SITE_URL・既定 https://orime.vercel.app）に向ける。
// サーバー側は capacitor://localhost からの呼び出しを CORS で許可している（api/_cors.js）。
// Web は同じサイトなので相対パスのまま。
import { isNative } from './iap';
import { SITE_URL } from './legalLinks';

export const apiUrl = (path) => (isNative ? `${SITE_URL}${path}` : path);
