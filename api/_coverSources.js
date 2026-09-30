// 📕 表紙の取得元（鍵の要らないもの）と、画像の確かめ方。api/cover.js から使う。
//
// ファイル名が _ で始まるので Vercel のルートにはならない。fetch は差し替えられる
// （テストで外部に出ないように・fetchImpl）。docs/cover-pipeline.md に全体の流れ。
//
//   - openBD:  API（api.openbd.jp/v1/get）の summary.cover ＝「表紙がある」ことの一次情報
//   - NDL 書影: https://ndlsearch.ndl.go.jp/thumbnail/{ISBN13}.jpg（無い本は 404）
//   - Amazon:  https://images-na.ssl-images-amazon.com/images/P/{ISBN10}.09.LZZZZZZZ.jpg
//              （無い本も 200 で 1×1・43 バイトの GIF を返す → 画像の縦横で弾く）
//   - Google:  books.google.com の ISBN 直リンク（無い本は 128×170 前後の「No cover」→ 縦横比 1.35 で弾く）
//   - Open Library（?default=false で無い本は 404。archive.org へ転送される）

export const FETCH_TIMEOUT_MS = 4000;
export const IMAGE_TIMEOUT_MS = 3000;
// /api/cover?health=1 で確かめる決まった本（公開の書誌・利用者の情報ではない）。
export const HEALTH_ISBN = '9784862760852';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// ─── ISBN ──────────────────────────────────────────────────────────────
// ISBN-10（末尾 X 可）/ ISBN-13 の形だけ通す。形の外は ''。
export function cleanIsbn(s) {
  const v = (s || '').toString().replace(/[-\s]/g, '').trim().slice(0, 20);
  return /^(?:[0-9]{9}[0-9Xx]|[0-9]{13})$/.test(v) ? v.toUpperCase() : '';
}

export function isbn13to10(isbn13) {
  const s = cleanIsbn(isbn13);
  if (s.length !== 13 || !s.startsWith('978')) return '';
  const core = s.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += parseInt(core[i], 10) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

export function isbn10to13(isbn10) {
  const s = cleanIsbn(isbn10);
  if (s.length !== 10) return '';
  const core = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  return core + String((10 - (sum % 10)) % 10);
}

// どちらの形でも 13 桁にそろえる（できなければ ''）。
export function toIsbn13(s) {
  const c = cleanIsbn(s);
  if (c.length === 13) return c;
  if (c.length === 10) return isbn10to13(c);
  return '';
}

// NDL OpenSearch（RSS/XML）から ISBN を上から順に取り出す（13 桁にそろえる）。
//   2007 年より前の本は NDL に ISBN-10 しか載っていないことが多い（例: 4-492-04269-5）。
//   以前は「978…」だけを拾っていたので、古い本は書名から ISBN が必ず空になっていた。
export function extractIsbnsFromXml(xml, limit = 5) {
  const found = [];
  const seen = new Set();
  const push = (raw) => {
    const i13 = toIsbn13(raw);
    if (i13 && !seen.has(i13)) { seen.add(i13); found.push(i13); }
  };
  const src = String(xml || '');
  // ① ISBN と書かれた identifier（10 桁・13 桁どちらも・セット全体の SetISBN は除く）を文書の順に
  // ② 念のため本文中の 978/979 で始まる 13 桁も（identifier の中は ① が読むので二重にしない）
  const re = /<dc:identifier([^>]*)>([^<]*)<\/dc:identifier>|(97[89][\d-]{10,17})/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1] !== undefined) {
      if (/ISBN/i.test(m[1]) && !/SetISBN/i.test(m[1])) push(m[2]);
    } else {
      push(m[3]);
    }
    if (found.length >= limit) break;
  }
  return found;
}

// ─── 画像 ──────────────────────────────────────────────────────────────
// 画像の先頭のバイトから縦横を読む（JPEG / PNG / GIF / WebP）。読めなければ null。
export function imageDimensions(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
  const n = b.length;
  if (n < 10) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && n >= 24) {
    const w = ((b[16] << 24) >>> 0) + (b[17] << 16) + (b[18] << 8) + b[19];
    const h = ((b[20] << 24) >>> 0) + (b[21] << 16) + (b[22] << 8) + b[23];
    return { type: 'png', w, h };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { type: 'gif', w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < n) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { type: 'jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xd9) break;
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
    return null;
  }
  // WebP
  if (n >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8 ') return { type: 'webp', w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === 'VP8L') {
      return { type: 'webp', w: 1 + (b[21] | ((b[22] & 0x3f) << 8)), h: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
    }
    if (chunk === 'VP8X') {
      return { type: 'webp', w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
  }
  return null;
}

const GB_CONTENT_RE = /books\.google\.[a-z.]+\/books\/content/i;
// 無い本を 404 / 1×1 / 「noimage」の URL で返す配信元は、形（縦横比）を問わない。
const SHAPE_FREE_HOSTS_RE = /(^|\.)(thumbnail\.image\.rakuten\.co\.jp|cover\.openbd\.jp|ssl-images-amazon\.com|media-amazon\.com|covers\.openlibrary\.org|archive\.org|supabase\.co|supabase\.in)$/i;

// 縦/横の下限。src/lib/bookCover.js の coverMinRatio と同じ（変えたら両方・src/lib/bookCover.test.js が比べる）。
export function coverMinRatio(url) {
  const u = String(url || '');
  if (GB_CONTENT_RE.test(u)) return 1.35;
  let host = '';
  try { host = new URL(u).hostname; } catch { /* '' */ }
  if (SHAPE_FREE_HOSTS_RE.test(host)) return 0;
  return 1.05;
}

// 「本の表紙らしい画像か」。端末の checkImageExists（src/lib/bookCover.js の isCoverLikeSize）と同じ基準。
//   - 1×1・43 バイトの GIF（Amazon の「無い」）/ 50px 未満 → 偽
//   - Google の ISBN 直リンクは、無い本に 128×170 前後（縦/横 1.33）の「No cover」を返す → 1.35 未満は偽
//   - 楽天・openBD・Amazon・Open Library・自分の Supabase は形を問わない（正方形寄りの本も通す）
//   - ほか（NDL など）は横長のロゴだけ弾く（1.05 未満）
//   - 縦横が読めない画像は 2KB 以上なら本物とみなす
export function looksLikeCover({ url = '', bytes = 0, w = 0, h = 0 } = {}) {
  if (bytes > 0 && bytes < 200) return false;
  if (w > 0 && h > 0) {
    if (w < 50 || h < 50) return false;
    return h / w >= coverMinRatio(url);
  }
  return bytes >= 2000;
}

function headersFor(url) {
  const h = {
    // 一部の書影の配信元（NDL・Amazon）は素の fetch をデータセンターの IP から 403 で弾く。
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.8',
  };
  if (/ndl\.go\.jp/i.test(url)) h.Referer = 'https://ndlsearch.ndl.go.jp/';
  return h;
}
export const BROWSER_HEADERS = headersFor('https://ndlsearch.ndl.go.jp/');

function isImageMagic(b) {
  return (b[0] === 0xff && b[1] === 0xd8) // JPEG
    || (b[0] === 0x89 && b[1] === 0x50) // PNG
    || (b[0] === 0x47 && b[1] === 0x49) // GIF
    || (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57); // RIFF…WEBP
}

// 画像を 1 枚取りに行って確かめる。HEAD は使わない（許していない配信元がある）。転送はたどる。
// 戻り値 { ok, status, bytes, w, h }（status 0 = 時間切れ・通信の失敗）。
export async function probeImage(url, { fetchImpl = globalThis.fetch, timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  const out = { ok: false, status: 0, bytes: 0, w: 0, h: 0 };
  if (!url) return out;
  try {
    const r = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: headersFor(url), signal: AbortSignal.timeout(timeoutMs) });
    out.status = r.status;
    if (!r.ok) return out;
    const ab = await r.arrayBuffer();
    const buf = new Uint8Array(ab.byteLength > MAX_IMAGE_BYTES ? ab.slice(0, MAX_IMAGE_BYTES) : ab);
    out.bytes = ab.byteLength;
    const ct = (r.headers?.get?.('content-type') || '').toLowerCase();
    // 画像の種類が書かれていない配信元もあるので、先頭のバイトでも見る。
    if (!/^image\//.test(ct) && !isImageMagic(buf)) return out;
    if (/svg/.test(ct)) return out;
    const dim = imageDimensions(buf);
    if (dim) { out.w = dim.w; out.h = dim.h; }
    out.ok = looksLikeCover({ url, bytes: out.bytes, w: out.w, h: out.h });
    return out;
  } catch {
    return out;
  }
}

// 候補を同時に確かめ、並び順でいちばん前の「本物」を返す（1 枚ずつ順番に待たない）。
//   以前は 1 枚 4 秒 × 6 URL × ISBN 5 件を順番に待ち、関数の時間切れで何も返せないことがあった。
export async function firstRealImage(urls, { probe = probeImage, fetchImpl } = {}) {
  const list = [...new Set((urls || []).filter(Boolean))];
  const pending = list.map((u) => Promise.resolve()
    .then(() => probe(u, fetchImpl ? { fetchImpl } : undefined))
    .catch(() => ({ ok: false, status: 0 })));
  const results = [];
  for (let i = 0; i < list.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await pending[i];
    results.push({ url: list[i], ...r });
    if (r && r.ok) return { url: list[i], results };
  }
  return { url: '', results };
}

// ─── openBD（鍵なし）──────────────────────────────────────────────────
// 戻り値 { status, found, cover }。found ＝ openBD にその本がある。cover ＝ 表紙の URL（無ければ ''）。
export async function openbdCover(isbn, { fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const i13 = toIsbn13(isbn);
  const out = { status: 0, found: false, cover: '' };
  if (!i13) return out;
  try {
    const r = await fetchImpl(`https://api.openbd.jp/v1/get?isbn=${i13}`, { signal: AbortSignal.timeout(timeoutMs) });
    out.status = r.status;
    if (!r.ok) return out;
    const d = await r.json();
    const s = Array.isArray(d) && d[0] ? d[0].summary : null;
    if (s) {
      out.found = true;
      out.cover = s.cover ? String(s.cover).replace(/^http:/i, 'https:') : '';
    }
    return out;
  } catch {
    return out;
  }
}

// ─── 候補の URL ───────────────────────────────────────────────────────
// ISBN から、鍵の要らない表紙の URL を「当たりやすい順」に並べる（端末の <img> が最後に確かめる）。
// src/lib/bookCover.js の getCoverCandidates と同じ並び（変えたら両方）。
export function coverCandidatesFor(isbn, { openbd = '' } = {}) {
  const i13 = toIsbn13(isbn);
  const i10 = isbn13to10(i13);
  return [...new Set([
    openbd,
    i13 && `https://ndlsearch.ndl.go.jp/thumbnail/${i13}.jpg`,
    i13 && `https://cover.openbd.jp/${i13}.jpg`,
    i10 && `https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`,
    i10 && `https://m.media-amazon.com/images/P/${i10}.09._SCLZZZZZZZ_.jpg`,
    i13 && `https://books.google.com/books/content?vid=ISBN${i13}&printsec=frontcover&img=1&zoom=1`,
    i13 && `https://covers.openlibrary.org/b/isbn/${i13}-L.jpg?default=false`,
  ].filter(Boolean))];
}

// ─── Google Books の休み ─────────────────────────────────────────────
// 鍵なしの Google は Vercel の共有 IP から 429/403 になりやすい。一度そうなったら、しばらく叩かない
// （1 回の解決で 3 回叩いて 3 回とも待つのをやめる）。鍵ありは短く。
export function createCooldown({ now = () => Date.now() } = {}) {
  let until = 0;
  return {
    blocked: () => now() < until,
    hit: (status, { hasKey = false } = {}) => {
      if (status === 429 || status === 403) until = now() + (hasKey ? 60_000 : 300_000);
    },
    reset: () => { until = 0; },
  };
}
