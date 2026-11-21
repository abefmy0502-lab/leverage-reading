// 👤 プロフィールの公開のページ（2026-11-21 オーナー「ニックネームと好きな本とその本のおすすめの 1 行」・見せ方は共有リンクのページ）。
//   GET  /u/<id>              → /api/cover?profile=<id>（vercel.json の rewrite）＝ 1 枚の HTML（SNS に貼ると絵と文が出る）
//   POST /api/profile-report  → /api/cover?op=profile_report ＝ 通報（理由の文だけ・通報した人の情報は残さない）
//   新しい Vercel 関数を増やさないため api/cover.js から呼ぶ（Hobby の上限 12・docs/book-search.md と同じ考え）。
//   出すのは 本人が「公開する」をオンにした・運営が隠していない（hidden=false）行だけ。それ以外は「見つかりません」（404）。
//   ページはスクリプトを使わない（CSP の script-src 'self'）・色と文字はアプリと同じ値（src/styles/tokens.css の写し）。
//   テーブル: supabase_profiles.sql
import { createClient } from '@supabase/supabase-js';
import { takeIpSlot } from './_ipRate.js';
import { checkCoverImageUrl } from './_coverImageUrl.js';

export const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;
const SITE = () => String(process.env.VITE_SITE_URL || 'https://orime.vercel.app').replace(/\/+$/, '');
const REPORT_MAX = 500;

let client = null;
function db() {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 見せてよい行か（公開・隠していない・ニックネームか好きな本がある）。 */
export function isShowable(p) {
  return !!(p && p.is_public && !p.hidden && (String(p.nickname || '').trim() || String(p.fav_title || '').trim()));
}

const STYLE = `
:root{--bg:#f7f5f1;--surface:#fffefb;--fill:#efece6;--text:#2b2825;--text-2:#5f5a53;--text-3:#6e6860;--separator:#dcd7ce;--border:#868076;--accent:#8a4b2a;--accent-ink:#fffefb;--radius:12px;
--font-ui:-apple-system,BlinkMacSystemFont,"SF Pro Text","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;--font-read:"Hiragino Mincho ProN","YuMincho","Yu Mincho","Noto Serif JP",serif}
@media (prefers-color-scheme:dark){:root{--bg:#1b1a18;--surface:#252321;--fill:#2f2c29;--text:#f2efea;--text-2:#bdb7ae;--text-3:#9e978d;--separator:#3a3632;--border:#807a73;--accent:#e0a07a;--accent-ink:#1b1a18}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-ui);-webkit-text-size-adjust:100%}
main{max-width:480px;margin:0 auto;padding:48px 16px 64px}
.card{background:var(--surface);border:1px solid var(--separator);border-radius:var(--radius);padding:24px 16px}
.who{margin:0;font-size:15px;color:var(--text-2)}.name{margin:4px 0 0;font-size:24px;font-weight:700;line-height:1.4;overflow-wrap:anywhere}
.label{margin:24px 0 8px;font-size:13px;font-weight:600;color:var(--text-2)}
.book{display:flex;gap:16px;align-items:flex-start}.cover{width:72px;height:auto;border-radius:4px;flex-shrink:0;background:var(--fill)}
.title{margin:0;font-size:17px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.author{margin:4px 0 0;font-size:15px;color:var(--text-2)}
.line{margin:16px 0 0;font-family:var(--font-read);font-size:20px;line-height:1.7;overflow-wrap:anywhere}
.cta{display:block;margin:32px 0 0;min-height:48px;padding:12px 16px;border-radius:var(--radius);background:var(--accent);color:var(--accent-ink);font-size:15px;font-weight:600;text-align:center;text-decoration:none}
.note{margin:12px 0 0;font-size:13px;color:var(--text-2);text-align:center;line-height:1.6}
details{margin:32px 0 0;font-size:13px;color:var(--text-3)}summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
textarea{width:100%;min-height:96px;margin:8px 0;padding:12px;font:inherit;font-size:16px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
button{min-height:44px;padding:8px 16px;font:inherit;font-size:15px;color:var(--text);background:transparent;border:1px solid var(--border);border-radius:var(--radius)}
a{color:var(--accent)}
`;

function page({ title, description = '', image = '', url = '', body, status = 200 }) {
  const site = SITE();
  const og = image || `${site}/og-image.png`;
  return {
    status,
    html: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta property="og:type" content="profile"><meta property="og:site_name" content="Orime"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${esc(og)}">${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
<meta name="twitter:card" content="summary"><meta name="robots" content="${status === 200 ? 'noindex' : 'noindex,nofollow'}">
<link rel="icon" href="/favicon-32.png"><style>${STYLE}</style></head><body><main>${body}</main></body></html>`,
  };
}

/** 公開のページの HTML。 */
export function renderProfile(p, { publicId }) {
  const site = SITE();
  const nickname = String(p.nickname || '').trim();
  const title = String(p.fav_title || '').trim();
  const author = String(p.fav_author || '').trim();
  const line = String(p.fav_line || '').trim();
  const cover = p.fav_cover ? checkCoverImageUrl(String(p.fav_cover)) : { ok: false };
  const who = nickname ? `${nickname}さん` : 'Orime の読者';
  const pageTitle = title ? `${who}の好きな本『${title}』` : `${who}のプロフィール`;
  const desc = line ? `「${line}」` : (title ? `${who}が好きな本は『${title}』` : '');
  const body = `<div class="card">
<p class="who">Orime の読者</p><h1 class="name">${esc(who)}</h1>
${title ? `<p class="label">好きな本</p><div class="book">${cover.ok ? `<img class="cover" src="${esc(cover.url)}" alt="">` : ''}<div><p class="title">『${esc(title)}』</p>${author ? `<p class="author">${esc(author)}</p>` : ''}</div></div>` : ''}
${line ? `<p class="label">おすすめの 1 行</p><p class="line">「${esc(line)}」</p>` : ''}
</div>
<a class="cta" href="${esc(site)}/lp">Orime で読書メモをはじめる</a>
<p class="note">読んだ本と、会話できる。答えのもとは、あなたが残したメモ。</p>
<details><summary>このページを通報する</summary>
<form method="post" action="/api/profile-report"><input type="hidden" name="id" value="${esc(publicId)}">
<label for="reason">理由（任意・500 字まで）</label><textarea id="reason" name="reason" maxlength="${REPORT_MAX}"></textarea>
<button type="submit">通報する</button></form></details>`;
  return page({ title: pageTitle, description: desc, image: cover.ok ? cover.url : '', url: `${site}/u/${publicId}`, body });
}

export function renderNotFound() {
  return page({
    title: 'ページが見つかりません | Orime',
    status: 404,
    body: `<div class="card"><h1 class="name">ページが見つかりません</h1><p class="note" style="text-align:left">公開をやめたか、リンクが違うようです。</p></div>
<a class="cta" href="${esc(SITE())}/lp">Orime について見る</a>`,
  });
}

function send(res, { status, html }, cache = 'no-store') {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  return res.status(status).send(html);
}

/** api/cover.js から呼ぶ。扱ったら true。 */
export async function handleProfileRequest(req, res, { dbImpl = db } = {}) {
  const q = req.query || {};
  if (q.op === 'profile_report') {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).send('Method not allowed'), true; }
    const slot = takeIpSlot(req, { max: 5, bucket: 'profile_report' });
    if (!slot.ok) return send(res, page({ title: '少し時間をおいてください | Orime', status: 429, body: '<div class="card"><h1 class="name">少し時間をおいてから、もう一度お試しください</h1></div>' })), true;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(body.id || '').trim();
    const reason = String(body.reason || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, REPORT_MAX);
    if (!PUBLIC_ID_RE.test(id)) return send(res, renderNotFound()), true;
    const c = dbImpl();
    if (c) {
      const { error } = await c.from('profile_reports').insert({ public_id: id, reason });
      if (error) console.warn('[profile] report failed:', error.code || error.message);
    }
    return send(res, page({
      title: '通報を受け付けました | Orime',
      body: `<div class="card"><h1 class="name">通報を受け付けました</h1><p class="note" style="text-align:left">内容を確かめて、必要なら公開を止めます。ありがとうございました。</p></div><p class="note"><a href="/u/${esc(id)}">ページに戻る</a></p>`,
    })), true;
  }
  if (q.profile === undefined) return false;
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).send('Method not allowed'), true; }
  const slot = takeIpSlot(req, { max: 60, bucket: 'profile_page' });
  if (!slot.ok) { res.setHeader('Retry-After', String(slot.retryAfter)); return res.status(429).send('Too Many Requests'), true; }
  const id = String(Array.isArray(q.profile) ? q.profile[0] : q.profile || '').trim().toLowerCase();
  if (!PUBLIC_ID_RE.test(id)) return send(res, renderNotFound()), true;
  const c = dbImpl();
  let row = null;
  if (c) {
    const { data, error } = await c.from('profiles')
      .select('public_id, nickname, fav_title, fav_author, fav_cover, fav_line, is_public, hidden')
      .eq('public_id', id).maybeSingle();
    if (error) console.warn('[profile] read failed:', error.code || error.message);
    row = data || null;
  }
  if (!isShowable(row)) return send(res, renderNotFound()), true;
  // 公開をやめたらすぐ消えるように、CDN には短くだけ覚えさせる。
  return send(res, renderProfile(row, { publicId: id }), 'public, max-age=0, s-maxage=60'), true;
}
