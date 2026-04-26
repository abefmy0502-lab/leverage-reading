// Tiny URL helpers used by image render sites to defend against mixed content
// (HTTPS app loading HTTP resources). The CSP `upgrade-insecure-requests`
// directive in vercel.json upgrades these at the network layer, but we still
// rewrite client-side so dev mode (no CSP) and stale data don't trip browsers.

export function ensureHttps(url) {
  if (typeof url !== 'string' || url.length === 0) return url;
  if (url.startsWith('http://')) return `https://${url.slice(7)}`;
  return url;
}
