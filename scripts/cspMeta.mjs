// 🛡 vercel.json の CSP ヘッダーから、iOS アプリの index.html に入れる <meta> の中身を作る（2026-10-11・vite.config.js の cspMeta）。
//   meta では効かない frame-ancestors・report-uri / report-to・sandbox は外す。
//   connect-src と img-src に自前のサイトの絶対 URL を足す（iOS の 'self' は capacitor://localhost のため）。
export function cspForMeta(headerCsp, siteUrl) {
  const site = String(siteUrl || '').replace(/\/+$/, '');
  return String(headerCsp || '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !/^frame-ancestors\b/.test(d) && !/^report-(uri|to)\b/.test(d) && !/^sandbox\b/.test(d))
    .map((d) => (site && /^(connect-src|img-src)\b/.test(d) && !d.split(/\s+/).includes(site) ? `${d} ${site}` : d))
    .join('; ');
}
