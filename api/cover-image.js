// 🖼 表紙画像の中継（シェア画像を canvas で作るため）。
//
// 表紙は外部サイト（Google Books・楽天・openBD・NDL・Amazon・自分の Supabase）にあり、
// そのまま canvas に描くと「汚れた canvas」になって画像に書き出せない。ここで同じサイトから
// 返し直す。中身は公開の表紙画像だけなので CORS は「*」（Cookie・認証は使わない）。
// オリジンごとに変えると CDN のキャッシュが iOS アプリ（capacitor://localhost）に
// CORS なしの版を返してしまうため、全員に同じヘッダーを返す。
//
// 安全のため（どこへでも取りに行ける中継にしない）:
//   - 取りに行くのは許可したホストだけ（api/_coverImageUrl.js）。転送先も毎回検査し、3 回まで
//   - 画像（jpeg/png/webp/gif/avif）だけ・2MB まで・5 秒で打ち切り
//   - 同じ IP から 1 分 60 回まで（インスタンス内の簡易制限）
//   - エラーは短い JSON だけ（中身・内部情報を返さない）
// 入力（GET）: url（表紙の URL）。出力: 画像そのもの（1 日キャッシュ）。

import { checkCoverImageUrl, isAllowedImageType } from './_coverImageUrl.js';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const LIMIT_PER_MIN = 60;
const hits = new Map();

function clientKey(req) {
  const h = req.headers || {};
  const realIp = typeof h['x-real-ip'] === 'string' ? h['x-real-ip'].trim() : '';
  const fwd = typeof h['x-forwarded-for'] === 'string' ? h['x-forwarded-for'].split(',')[0].trim() : '';
  return realIp || fwd || req.socket?.remoteAddress || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > 60_000) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  rec.n += 1;
  return rec.n > LIMIT_PER_MIN;
}

async function readCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await response.arrayBuffer());
    return buf.length > MAX_BYTES ? null : buf;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method' });
  }
  if (rateLimited(clientKey(req))) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'rate' });
  }

  const raw = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  let check = checkCoverImageUrl(raw, { supabaseUrl });
  if (!check.ok) return res.status(400).json({ error: 'url' });

  let upstream = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(check.url, {
        redirect: 'manual', // 転送先は自分で検査する（許可していないホストへ連れて行かれない）
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 'User-Agent': 'OrimeCoverImage/1.0' },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (!loc || hop === MAX_REDIRECTS) return res.status(502).json({ error: 'redirect' });
        let next;
        try { next = new URL(loc, check.url).toString(); } catch { return res.status(502).json({ error: 'redirect' }); }
        check = checkCoverImageUrl(next, { supabaseUrl, redirect: true });
        if (!check.ok) return res.status(502).json({ error: 'redirect' });
        continue;
      }
      upstream = r;
      break;
    }
  } catch {
    return res.status(504).json({ error: 'fetch' });
  }
  if (!upstream || !upstream.ok) return res.status(502).json({ error: 'upstream' });

  const type = isAllowedImageType(upstream.headers.get('content-type'));
  if (!type) return res.status(415).json({ error: 'type' });
  const declared = Number(upstream.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return res.status(413).json({ error: 'size' });

  let body;
  try {
    body = await readCapped(upstream);
  } catch {
    return res.status(504).json({ error: 'fetch' });
  }
  if (!body) return res.status(413).json({ error: 'size' });
  if (body.length === 0) return res.status(502).json({ error: 'empty' });

  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  return res.status(200).send(body);
}
