// 📣 SNS の投稿と画像づくり（運営者だけ・MCP の道具 ops_post / ops_image から・2026-11-08）。
//
// 鍵はすべて Vercel の env（サーバー専用・クライアント露出厳禁）:
//   X:          X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET（OAuth 1.0a のユーザー文脈・X Developer Portal で発行）
//   Threads:    THREADS_USER_ID / THREADS_ACCESS_TOKEN（Threads API・長期トークン＝60 日・refreshThreadsToken で延ばす）
//   Instagram:  IG_USER_ID / IG_ACCESS_TOKEN（Instagram Graph API・ビジネス／クリエイターアカウント・長期トークン）
//   画像:       OPENAI_API_KEY（gpt-image-1・ChatGPT と同じ画像の仕組み）
// 画像は Supabase の公開バケット ops-media に置く（Threads・Instagram は公開 URL の画像しか受け取らない・supabase_admin_mcp.sql）。
// SDK は使わない（fetch と node:crypto だけ）。鍵が無い送り先は「準備がまだ」と返して止める（fail-closed）。
import { createHmac, randomBytes } from 'node:crypto';

export const PLATFORMS = ['x', 'threads', 'instagram'];
export const PLATFORM_LABEL = { x: 'X', threads: 'Threads', instagram: 'Instagram' };
export const TEXT_LIMIT = { x: 280, threads: 500, instagram: 2200 };

// X の文字数は「重み」で数える（X の twitter-text と同じ決まり・2026-11-09）: URL は 1 つ 23、
// ラテン文字・数字・記号・結合文字などの範囲（U+0000–U+10FF・U+2000–U+200D・U+2010–U+201F・U+2032–U+2037）は 1、
// それ以外（漢字・かな・全角・絵文字）は 2。日本語の本文は約 140 字が上限。
const X_URL_RE = /https?:\/\/[^\s]+|(?:^|(?<=\s))(?:[a-z0-9-]+\.)+(?:com|net|org|jp|io|app|co|me|dev)(?:\/[^\s]*)?/gi;
export function xWeightedLength(text) {
  const t = String(text || '').normalize('NFC').replace(X_URL_RE, '');
  const urls = (String(text || '').match(X_URL_RE) || []).length;
  let n = urls * 23;
  for (const ch of t) {
    const c = ch.codePointAt(0);
    const light = c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037);
    n += light ? 1 : 2;
  }
  return n;
}
// 送り先ごとの長さ（X は重み・ほかはコードポイント）と上限。
export function textLength(platform, text) { return platform === 'x' ? xWeightedLength(text) : [...String(text || '')].length; }

export function configured(env = process.env) {
  return {
    x: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'].every((k) => Boolean(String(env[k] || '').trim())),
    threads: ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'].every((k) => Boolean(String(env[k] || '').trim())),
    instagram: ['IG_USER_ID', 'IG_ACCESS_TOKEN'].every((k) => Boolean(String(env[k] || '').trim())),
    image: Boolean(String(env.OPENAI_API_KEY || '').trim()),
  };
}

export class SocialError extends Error {
  constructor(message, { retryable = false } = {}) { super(message); this.retryable = retryable; }
}

// ── OAuth 1.0a（X）────────────────────────────────────────────────────────────
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function oauth1Header(method, url, params, creds, { nonce, timestamp } = {}) {
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce || randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp || String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const all = { ...params, ...oauth };
  const base = [method.toUpperCase(), enc(url), enc(Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join('&'))].join('&');
  const key = `${enc(creds.apiSecret)}&${enc(creds.accessSecret)}`;
  const sig = createHmac('sha1', key).update(base).digest('base64');
  const head = { ...oauth, oauth_signature: sig };
  return 'OAuth ' + Object.keys(head).sort().map((k) => `${enc(k)}="${enc(head[k])}"`).join(', ');
}

function xCreds(env) {
  return { apiKey: env.X_API_KEY, apiSecret: env.X_API_SECRET, accessToken: env.X_ACCESS_TOKEN, accessSecret: env.X_ACCESS_SECRET };
}

async function readJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
}

async function fetchImageBytes(url, fetchImpl) {
  const res = await fetchImpl(url);
  // 置き場の一時的な失敗（5xx・429）はやり直せる
  if (!res.ok) throw new SocialError(`画像を読めませんでした（${res.status}）`, { retryable: res.status >= 500 || res.status === 429 });
  const type = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) throw new SocialError('画像が 5MB を超えています');
  return { buf, type };
}

// X: 画像があれば v1.1 の media/upload（base64）→ v2 の tweets。
export async function postX({ text, imageUrl }, { env = process.env, fetchImpl = fetch } = {}) {
  if (!configured(env).x) throw new SocialError('X の鍵（X_API_KEY ほか 4 つ）が Vercel の env にありません');
  const creds = xCreds(env);
  let mediaIds;
  if (imageUrl) {
    const { buf } = await fetchImageBytes(imageUrl, fetchImpl);
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const params = { media_data: buf.toString('base64') };
    const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: oauth1Header('POST', url, params, creds), 'Content-Type': 'application/x-www-form-urlencoded' }, body: `media_data=${enc(params.media_data)}` });
    const j = await readJson(res);
    if (!res.ok || !j.media_id_string) throw new SocialError(`X に画像を送れませんでした（${res.status}）`, { retryable: res.status >= 500 || res.status === 429 });
    mediaIds = [j.media_id_string];
  }
  const url = 'https://api.x.com/2/tweets';
  const body = mediaIds ? { text, media: { media_ids: mediaIds } } : { text };
  const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: oauth1Header('POST', url, {}, creds), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await readJson(res);
  const id = j?.data?.id;
  if (!res.ok || !id) throw new SocialError(`X に投稿できませんでした（${res.status}${j?.detail ? '・' + String(j.detail).slice(0, 120) : ''}）`, { retryable: res.status >= 500 || res.status === 429 });
  return { id, url: `https://x.com/i/web/status/${id}` };
}

// Threads: 作る → 出す（Threads API）。文だけも画像つきも。
export async function postThreads({ text, imageUrl }, { env = process.env, fetchImpl = fetch, waitMs = 1500 } = {}) {
  if (!configured(env).threads) throw new SocialError('Threads の鍵（THREADS_USER_ID / THREADS_ACCESS_TOKEN）が Vercel の env にありません');
  const base = `https://graph.threads.net/v1.0/${encodeURIComponent(env.THREADS_USER_ID)}`;
  const q = new URLSearchParams({ access_token: env.THREADS_ACCESS_TOKEN, text });
  if (imageUrl) { q.set('media_type', 'IMAGE'); q.set('image_url', imageUrl); } else q.set('media_type', 'TEXT');
  const c = await fetchImpl(`${base}/threads?${q}`, { method: 'POST' });
  const cj = await readJson(c);
  if (!c.ok || !cj.id) throw new SocialError(`Threads に作れませんでした（${c.status}${cj?.error?.message ? '・' + String(cj.error.message).slice(0, 120) : ''}）`, { retryable: c.status >= 500 });
  if (imageUrl && waitMs) await new Promise((r) => setTimeout(r, waitMs));
  const p = await fetchImpl(`${base}/threads_publish?${new URLSearchParams({ access_token: env.THREADS_ACCESS_TOKEN, creation_id: cj.id })}`, { method: 'POST' });
  const pj = await readJson(p);
  if (!p.ok || !pj.id) throw new SocialError(`Threads に出せませんでした（${p.status}）`, { retryable: p.status >= 500 });
  let url = null;
  try { const g = await fetchImpl(`https://graph.threads.net/v1.0/${pj.id}?${new URLSearchParams({ fields: 'permalink', access_token: env.THREADS_ACCESS_TOKEN })}`); const gj = await readJson(g); url = gj.permalink || null; } catch { /* URL は無くてもよい */ }
  return { id: pj.id, url };
}

// Instagram: 画像が必須。作る → 出す（Instagram Graph API）。
export async function postInstagram({ text, imageUrl }, { env = process.env, fetchImpl = fetch, waitMs = 3000 } = {}) {
  if (!configured(env).instagram) throw new SocialError('Instagram の鍵（IG_USER_ID / IG_ACCESS_TOKEN）が Vercel の env にありません');
  if (!imageUrl) throw new SocialError('Instagram は画像が要ります（ops_image で作ってから）');
  const base = `https://graph.facebook.com/v21.0/${encodeURIComponent(env.IG_USER_ID)}`;
  const c = await fetchImpl(`${base}/media?${new URLSearchParams({ access_token: env.IG_ACCESS_TOKEN, image_url: imageUrl, caption: text })}`, { method: 'POST' });
  const cj = await readJson(c);
  if (!c.ok || !cj.id) throw new SocialError(`Instagram に作れませんでした（${c.status}${cj?.error?.message ? '・' + String(cj.error.message).slice(0, 120) : ''}）`, { retryable: c.status >= 500 });
  if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
  const p = await fetchImpl(`${base}/media_publish?${new URLSearchParams({ access_token: env.IG_ACCESS_TOKEN, creation_id: cj.id })}`, { method: 'POST' });
  const pj = await readJson(p);
  if (!p.ok || !pj.id) throw new SocialError(`Instagram に出せませんでした（${p.status}${pj?.error?.message ? '・' + String(pj.error.message).slice(0, 120) : ''}）`, { retryable: p.status >= 500 });
  let url = null;
  try { const g = await fetchImpl(`https://graph.facebook.com/v21.0/${pj.id}?${new URLSearchParams({ fields: 'permalink', access_token: env.IG_ACCESS_TOKEN })}`); const gj = await readJson(g); url = gj.permalink || null; } catch { /* URL は無くてもよい */ }
  return { id: pj.id, url };
}

export async function postTo(platform, post, opts) {
  if (platform === 'x') return postX(post, opts);
  if (platform === 'threads') return postThreads(post, opts);
  if (platform === 'instagram') return postInstagram(post, opts);
  throw new SocialError('platform は x・threads・instagram のどれか');
}

// 画像を作って公開バケットに置き、URL を返す（gpt-image-1）。1 枚 約 ¥6〜25（size と quality による）。
export async function makeImage({ prompt, size = '1024x1024', quality = 'medium', userId }, { env = process.env, fetchImpl = fetch, storage } = {}) {
  if (!configured(env).image) throw new SocialError('画像の鍵（OPENAI_API_KEY）が Vercel の env にありません');
  if (!['1024x1024', '1024x1536', '1536x1024'].includes(size)) size = '1024x1024';
  if (!['low', 'medium', 'high'].includes(quality)) quality = 'medium';
  const res = await fetchImpl('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: String(prompt).slice(0, 4000), size, quality, n: 1, output_format: 'png' }),
  });
  const j = await readJson(res);
  const b64 = j?.data?.[0]?.b64_json;
  if (!res.ok || !b64) throw new SocialError(`画像を作れませんでした（${res.status}${j?.error?.message ? '・' + String(j.error.message).slice(0, 120) : ''}）`, { retryable: res.status >= 500 || res.status === 429 });
  const buf = Buffer.from(b64, 'base64');
  if (!storage) return { url: null, bytes: buf.length, revised_prompt: j.data[0].revised_prompt || null };
  const path = `${userId || 'ops'}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${randomBytes(4).toString('hex')}.png`;
  const up = await storage.from('ops-media').upload(path, buf, { contentType: 'image/png', upsert: false });
  if (up.error) throw new SocialError(`画像を置けませんでした（${up.error.message || 'storage'}・ops-media のバケットは supabase_admin_mcp.sql が作ります）`);
  const { data } = storage.from('ops-media').getPublicUrl(path);
  return { url: data?.publicUrl || null, path, bytes: buf.length, revised_prompt: j.data[0].revised_prompt || null };
}
