// 🛡 vercel.json の CSP ヘッダーから、iOS アプリの index.html に入れる <meta> の中身を作る（2026-10-11・vite.config.js の cspMeta）。
//   meta では効かない frame-ancestors・report-uri / report-to・sandbox は外す。
//   connect-src と img-src に自前のサイトの絶対 URL を足す（iOS の 'self' は capacitor://localhost のため）。
//   2026-11-17: iOS 27 の WKWebView では 'self' が capacitor://localhost に当たらず、JS が読み込めずに画面が真っ白になった
//   （build 5 をシミュレータで確かめて分かった）。読み込み元の capacitor://localhost を *-src に明示し、
//   http ではない独自のスキームを書き換えうる upgrade-insecure-requests は meta では外す（Web のヘッダーには残る）。
export const APP_ORIGIN = 'capacitor://localhost';
const SRC_WITH_APP = /^(default-src|script-src|style-src|img-src|font-src|connect-src|media-src|worker-src)\b/;
export function cspForMeta(headerCsp, siteUrl) {
  const site = String(siteUrl || '').replace(/\/+$/, '');
  return String(headerCsp || '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !/^frame-ancestors\b/.test(d) && !/^report-(uri|to)\b/.test(d) && !/^sandbox\b/.test(d) && !/^upgrade-insecure-requests\b/.test(d))
    .map((d) => (site && /^(connect-src|img-src)\b/.test(d) && !d.split(/\s+/).includes(site) ? `${d} ${site}` : d))
    .map((d) => (SRC_WITH_APP.test(d) && !d.split(/\s+/).includes(APP_ORIGIN) ? `${d} ${APP_ORIGIN}` : d))
    .join('; ');
}
