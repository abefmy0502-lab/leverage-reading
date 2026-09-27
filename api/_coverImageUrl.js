// 🖼 表紙画像の中継（api/cover-image.js）で「取りに行ってよい URL」かを決める純粋関数。
//
// 開いた中継（どこへでも取りに行ける）にしないため、表紙の配信元として実際に使っている
// ホストだけを許可する（vercel.json の CSP img-src と同じ顔ぶれ）。
//   - https だけ（http は https に読み替える）・ポート指定なし・ユーザー名/パスワードなし
//   - Supabase は自分のプロジェクトの公開バケット book-covers の中だけ
//   - 転送（リダイレクト）先も同じ検査を通す。Open Library の表紙は archive.org へ転送されるので、
//     archive.org は転送先としてだけ許可する
// ファイル名が _ で始まるので Vercel のルートにはならない。

const EXACT_HOSTS = new Set([
  'books.google.com',
  'books.googleusercontent.com',
  'covers.openlibrary.org',
  'cover.openbd.jp',
  'ndlsearch.ndl.go.jp',
  'iss.ndl.go.jp',
  'images-na.ssl-images-amazon.com',
  'images-fe.ssl-images-amazon.com',
  'm.media-amazon.com',
  'thumbnail.image.rakuten.co.jp',
]);
const SUFFIX_HOSTS = ['.googleusercontent.com'];
const REDIRECT_ONLY_SUFFIX = ['.archive.org'];
const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/book-covers/';
export const MAX_URL_LENGTH = 2048;

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
}

// supabaseUrl: 自分の Supabase の URL（SUPABASE_URL）。無ければ Supabase の画像は通さない。
// redirect: true のときだけ archive.org を許す。
// 戻り値: { ok: true, url: 'https://…' } | { ok: false, reason }
export function checkCoverImageUrl(raw, { supabaseUrl = '', redirect = false } = {}) {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, reason: 'missing' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' };
  let u;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: 'invalid' }; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:') return { ok: false, reason: 'protocol' };
  if (u.username || u.password) return { ok: false, reason: 'credentials' };
  if (u.port) return { ok: false, reason: 'port' };
  const host = u.hostname.toLowerCase();
  const supaHost = hostOf(supabaseUrl);
  let allowed = EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s));
  if (!allowed && redirect) allowed = REDIRECT_ONLY_SUFFIX.some((s) => host.endsWith(s));
  if (!allowed && supaHost && host === supaHost) {
    // パスの「..」は URL の解析で畳まれている。念のため符号化した「..」も拒む。
    if (!u.pathname.startsWith(SUPABASE_PUBLIC_PREFIX) || /%2e%2e/i.test(u.pathname)) return { ok: false, reason: 'path' };
    allowed = true;
  }
  if (!allowed) return { ok: false, reason: 'host' };
  u.hash = '';
  return { ok: true, url: u.toString() };
}

// 中継で返してよい画像の種類（SVG は中にスクリプトを持てるので通さない）。
export function isAllowedImageType(contentType) {
  const t = String(contentType || '').split(';')[0].trim().toLowerCase();
  return /^image\/(jpeg|jpg|png|webp|gif|avif)$/.test(t) ? t : '';
}
