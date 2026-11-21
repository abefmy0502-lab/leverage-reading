// 👤 プロフィールの公開のページ（2026-11-21 オーナー「ニックネームと好きな本とその本のおすすめの 1 行」・見せ方は共有リンクのページ）。
//   GET  /u/<id>              → /api/cover?profile=<id>（vercel.json の rewrite）＝ 1 枚の HTML（SNS に貼ると絵と文が出る）
//   POST /api/profile-report  → /api/cover?op=profile_report ＝ 通報（理由の文だけ・通報した人の情報は残さない）
//   新しい Vercel 関数を増やさないため api/cover.js から呼ぶ（Hobby の上限 12・docs/book-search.md と同じ考え）。
//   出すのは 本人が「公開する」をオンにした・運営が隠していない（hidden=false）行だけ。それ以外は「見つかりません」（404）。
//   ページはスクリプトを使わない（CSP の script-src 'self'）・色と文字はアプリと同じ値（src/styles/tokens.css の写し）。
//   本棚も公開する（shelf_public・2026-11-21 2 回目）ときは、本の書名・著者・表紙・状態・評価・分野を状態ごとに。メモは読まない・出さない。
//   本人が外した本（shelf_hidden）は出さない。自己紹介（bio）は名前の下に。
//   テーブル: supabase_profiles.sql
import { createClient } from '@supabase/supabase-js';
import { takeIpSlot } from './_ipRate.js';
import { checkCoverImageUrl } from './_coverImageUrl.js';
import { BOOK_FIELD_GROUPS, isBookField } from './_bookFieldsCore.js';
import { paletteFor } from '../src/lib/coverPalette.js';
import { profileTextIssue } from '../src/lib/profileFilter.js';

export const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;
const SITE = () => String(process.env.VITE_SITE_URL || 'https://orime.vercel.app').replace(/\/+$/, '');
const REPORT_MAX = 500;
// 開いている通報がこの数たまったら、運営が確かめるまで自動で隠す（App 審査 1.2・運営は 24 時間以内に確かめる）。
export const AUTO_HIDE_REPORTS = 3;
const SUPPORT = () => String(process.env.VITE_SUPPORT_EMAIL || 'orime.support@gmail.com');

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

/** 公開に向かない言葉・連絡先を含む欄を空にする（アプリでも保存の前に止めるが、古いアプリや直接の書き込みに備える）。 */
export function cleanPublicRow(row) {
  const out = { ...row };
  for (const [k, kind] of [['nickname', 'own'], ['bio', 'own'], ['fav_line', 'own'], ['fav_title', 'book'], ['fav_author', 'book']]) {
    if (out[k] && profileTextIssue(out[k], kind)) out[k] = '';
  }
  if (!out.fav_title) { out.fav_author = ''; out.fav_cover = ''; }
  return out;
}

/** 見せてよい行か（公開・隠していない・ニックネームか好きな本がある）。 */
export function isShowable(p) {
  return !!(p && p.is_public && !p.hidden && (String(p.nickname || '').trim() || String(p.fav_title || '').trim() || String(p.bio || '').trim() || p.shelf_public));
}

const STYLE = `
:root{--bg:#f7f5f1;--surface:#fffefb;--fill:#efece6;--text:#2b2825;--text-2:#5f5a53;--text-3:#6e6860;--separator:#dcd7ce;--border:#868076;--accent:#8a4b2a;--accent-ink:#fffefb;--radius:12px;
--on-cover:#ffffff;--cover-1a:#7d4a2e;--cover-1b:#5d3a22;--cover-2a:#7a5080;--cover-2b:#5a3a60;--cover-3a:#4a6e8a;--cover-3b:#2c4d68;--cover-4a:#4f6e3f;--cover-4b:#3a5a30;--cover-5a:#8e4330;--cover-5b:#703528;--cover-6a:#7e6249;--cover-6b:#5e4836;
--font-ui:-apple-system,BlinkMacSystemFont,"SF Pro Text","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;--font-read:"Hiragino Mincho ProN","YuMincho","Yu Mincho","Noto Serif JP",serif}
@media (prefers-color-scheme:dark){:root{--bg:#1b1a18;--surface:#252321;--fill:#2f2c29;--text:#f2efea;--text-2:#bdb7ae;--text-3:#9e978d;--separator:#3a3632;--border:#807a73;--accent:#e0a07a;--accent-ink:#1b1a18}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-ui);-webkit-text-size-adjust:100%}
main{max-width:480px;margin:0 auto;padding:48px 16px 64px}
p,h1{line-break:strict;word-break:auto-phrase;text-wrap:pretty}
.card{background:var(--surface);border:1px solid var(--separator);border-radius:var(--radius);padding:24px 16px}
.name{margin:0;font-size:24px;font-weight:700;line-height:1.4;overflow-wrap:anywhere}
.label{margin:24px 0 8px;font-size:13px;font-weight:600;color:var(--text-2)}
.book{display:flex;gap:16px;align-items:flex-start}.cover{width:72px;height:auto;border-radius:4px;flex-shrink:0;background:var(--fill)}
.title{margin:0;font-size:17px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.author{margin:4px 0 0;font-size:15px;color:var(--text-2)}
.line{margin:0;font-family:var(--font-read);font-size:20px;line-height:1.6;overflow-wrap:anywhere}
.cta{display:block;margin:32px 0 0;min-height:48px;padding:12px 16px;border-radius:var(--radius);background:var(--accent);color:var(--accent-ink);font-size:15px;font-weight:600;text-align:center;text-decoration:none}
.note{margin:12px 0 0;font-size:13px;color:var(--text-2);text-align:center;line-height:1.6}
details{margin:32px 0 0;font-size:13px;color:var(--text-3)}summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
textarea{width:100%;min-height:96px;margin:8px 0;padding:12px;font:inherit;font-size:16px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
button{min-height:44px;padding:8px 16px;font:inherit;font-size:15px;color:var(--text);background:transparent;border:1px solid var(--border);border-radius:var(--radius)}
a{color:var(--accent)}
.bio{margin:12px 0 0;font-size:15px;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere}
.shelf{margin:32px 0 0}.shelf h2{margin:0;font-size:20px;font-weight:700}
.counts{margin:8px 0 0;font-size:13px;color:var(--text-2)}
.fields{margin:16px 0 0;display:flex;flex-direction:column;gap:12px}
.fgroup{margin:0;font-size:13px;font-weight:600;color:var(--text-2)}
.chips{display:flex;flex-wrap:wrap;gap:4px 16px;margin:4px 0 0;padding:0;list-style:none}
.chips li{font-size:15px;color:var(--text)}.chips b{font-weight:400;color:var(--text-2)}
.status{margin:32px 0 0}.status h3{margin:0;font-size:17px;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 12px;margin:12px 0 0;padding:0;list-style:none}
.bk{display:flex;flex-direction:column;gap:4px;min-width:0}
.bk img,.bk .ph{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:4px;background:var(--fill);border:1px solid var(--separator)}
.bk .ph{display:flex;align-items:flex-end;padding:8px;font-size:13px;font-weight:600;line-height:1.4;color:var(--on-cover);overflow:hidden;overflow-wrap:anywhere;border-color:transparent}
.bt{margin:0;font-size:13px;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.ba{margin:0;font-size:12px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st{margin:0;font-size:12px;color:var(--accent);letter-spacing:1px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.foot{margin:24px 0 0;font-size:13px;color:var(--text-2);line-height:1.8}
.more{margin:12px 0 0;font-size:13px;color:var(--text-2)}
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
export const SHELF_STATUSES = [
  { id: 'reading', label: '読書中' },
  { id: 'done', label: '読了' },
  { id: 'before', label: '積読' },
  { id: 'want', label: '読みたい' },
];
export const SHELF_PER_STATUS = 60;

/** 公開の本棚に出す本を整える（外した本を除く・状態ごと・分野の数）。books は { id, title, author, cover, status, rating, fields } */
export function buildShelf(books = [], hidden = [], { supabaseUrl = '' } = {}) {
  const hide = new Set((hidden || []).map(String));
  // 書名・著者に連絡先がある本は出さない（App 審査 1.2・lib/profileFilter.js）。
  const list = (Array.isArray(books) ? books : []).filter((b) => b && b.id && !hide.has(String(b.id)) && String(b.title || '').trim()
    && !profileTextIssue(b.title, 'book') && !profileTextIssue(b.author, 'book'));
  const byStatus = SHELF_STATUSES.map((st) => {
    const all = list.filter((b) => b.status === st.id);
    return {
      ...st,
      total: all.length,
      books: all.slice(0, SHELF_PER_STATUS).map((b) => {
        const c = b.cover ? checkCoverImageUrl(String(b.cover), { supabaseUrl }) : { ok: false };
        return {
          title: String(b.title).trim().slice(0, 120),
          author: String(b.author || '').trim().slice(0, 80),
          cover: c.ok ? c.url : '',
          rating: st.id === 'done' ? Math.max(0, Math.min(5, Math.round(Number(b.rating) || 0))) : 0,
        };
      }),
    };
  }).filter((g) => g.total > 0);
  const count = new Map();
  for (const b of list) for (const f of new Set((b.fields || []).filter(isBookField))) count.set(f, (count.get(f) || 0) + 1);
  const fields = BOOK_FIELD_GROUPS.map((g) => ({
    label: g.name || '',
    items: g.fields.map((f) => ({ name: f.name, n: count.get(f.name) || 0 })).filter((x) => x.n > 0),
  })).filter((g) => g.items.length > 0);
  return { total: list.length, byStatus, fields };
}

// 表紙の無い本はアプリと同じ代用表紙（書名から決まる色・白い書名・lib/coverPalette.js）。書名は表紙の上だけに見せ、下の書名は読み上げ用。
function coverPlaceholder(title) {
  const [a, b] = paletteFor(title);
  return `<span class="ph" aria-hidden="true" style="background:linear-gradient(160deg, ${a}, ${b})">${esc(title)}</span>`;
}

function renderShelf(shelf) {
  if (!shelf || !shelf.total) return '';
  const counts = shelf.byStatus.map((g) => `${g.label} ${g.total} 冊`).join('・');
  const fields = shelf.fields.length
    ? `<div class="fields">${shelf.fields.map((g) => `<div><p class="fgroup">${esc(g.label)}</p><ul class="chips">${g.items.map((f) => `<li>${esc(f.name)} <b>${f.n}</b></li>`).join('')}</ul></div>`).join('')}</div>`
    : '';
  const sections = shelf.byStatus.map((g) => `<section class="status"><h3>${esc(g.label)}</h3><ul class="grid">${g.books.map((b) => `<li class="bk">${
    b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy">` : coverPlaceholder(b.title)
  }${b.cover ? `<p class="bt">${esc(b.title)}</p>` : `<p class="bt sr">${esc(b.title)}</p>`}${b.author ? `<p class="ba">${esc(b.author)}</p>` : ''}${
    b.rating ? `<p class="st" aria-label="評価 ${b.rating}">${'★'.repeat(b.rating)}${'☆'.repeat(5 - b.rating)}</p>` : ''
  }</li>`).join('')}</ul>${g.total > g.books.length ? `<p class="more">ほか ${g.total - g.books.length} 冊</p>` : ''}</section>`).join('');
  return `<section class="shelf"><h2>本棚</h2><p class="counts">${esc(counts)}</p>${fields}${sections}</section>`;
}

export function renderProfile(p, { publicId, shelf = null }) {
  const site = SITE();
  const nickname = String(p.nickname || '').trim();
  const title = String(p.fav_title || '').trim();
  const author = String(p.fav_author || '').trim();
  const line = String(p.fav_line || '').trim();
  const cover = p.fav_cover ? checkCoverImageUrl(String(p.fav_cover)) : { ok: false };
  const who = nickname ? `${nickname}さん` : 'Orime の読者';
  const pageTitle = title ? `${who}の好きな本『${title}』` : `${who}のプロフィール`;
  const desc = line ? `「${line}」` : (title ? `${who}が好きな本は『${title}』` : (String(p.bio || '').trim().slice(0, 80)));
  const bio = String(p.bio || '').trim();
  const body = `<div class="card">
<h1 class="name">${esc(who)}</h1>${bio ? `<p class="bio">${esc(bio)}</p>` : ''}
${title ? `<p class="label">好きな本</p><div class="book">${cover.ok ? `<img class="cover" src="${esc(cover.url)}" alt="">` : ''}<div><p class="title">『${esc(title)}』</p>${author ? `<p class="author">${esc(author)}</p>` : ''}</div></div>` : ''}
${line ? `<p class="label">おすすめの 1 行</p><p class="line">「${esc(line)}」</p>` : ''}
</div>${renderShelf(shelf)}
<a class="cta" href="${esc(site)}/lp">Orime で読書メモをはじめる</a>
<p class="note">読んだ本と、会話できる。<br>答えのもとは、あなたが残したメモ。</p>
<details><summary>このページを通報する</summary>
<form method="post" action="/api/profile-report"><input type="hidden" name="id" value="${esc(publicId)}">
<label for="reason">理由（任意・500 字まで）</label><textarea id="reason" name="reason" maxlength="${REPORT_MAX}"></textarea>
<button type="submit">通報する</button></form>
<p class="note" style="text-align:left">通報は運営が 24 時間以内に確かめ、利用規約に反する内容は表示を止めます。</p></details>
<p class="foot"><a href="${esc(site)}/legal/terms">利用規約</a>・<a href="${esc(site)}/legal/privacy">プライバシーポリシー</a>・お問い合わせ <a href="mailto:${esc(SUPPORT())}">${esc(SUPPORT())}</a></p>`;
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

// 本棚を読む（書名・著者・表紙・状態・評価・分野だけ。メモは読まない）。読めなければ null＝本棚を出さない。
async function loadShelf(c, userId, hidden) {
  try {
    const { data, error } = await c.from('books')
      .select('id, title, author, cover, status, rating, updated_at, book_tags(tag_name)')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(1000);
    if (error) { console.warn('[profile] shelf read failed:', error.code || error.message); return null; }
    const books = (data || []).map((b) => ({ ...b, fields: (b.book_tags || []).map((t) => t.tag_name) }));
    // 自分でアップロードした表紙（Supabase の置き場）は公開のページに出さない＝書店・図書館の表紙だけ（App 審査 1.2）。
    return buildShelf(books, hidden);
  } catch (e) {
    console.warn('[profile] shelf read failed:', e?.message || e);
    return null;
  }
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
    let saved = false;
    if (c) {
      const { error } = await c.from('profile_reports').insert({ public_id: id, reason });
      if (error) console.warn('[profile] report failed:', error.code || error.message);
      else {
        saved = true;
        // 開いている通報がたまったら自動で隠す（運営が確かめて戻すか決める）。
        try {
          const { count } = await c.from('profile_reports').select('id', { count: 'exact', head: true }).eq('public_id', id).eq('status', 'open');
          if ((count || 0) >= AUTO_HIDE_REPORTS) await c.from('profiles').update({ hidden: true }).eq('public_id', id);
        } catch (e) { console.warn('[profile] auto hide failed:', e?.message || e); }
      }
    }
    if (!saved) {
      return send(res, page({
        title: '通報を受け付けられませんでした | Orime',
        status: 503,
        body: `<div class="card"><h1 class="name">通報を受け付けられませんでした</h1><p class="note" style="text-align:left">少し時間をおいて、もう一度お試しください。急ぎのときは ${esc(SUPPORT())} までご連絡ください。</p></div><p class="note"><a href="/u/${esc(id)}">ページに戻る</a></p>`,
      })), true;
    }
    return send(res, page({
      title: '通報を受け付けました | Orime',
      body: `<div class="card"><h1 class="name">通報を受け付けました</h1><p class="note" style="text-align:left">運営が 24 時間以内に確かめ、利用規約に反する内容は表示を止めます。ありがとうございました。</p></div><p class="note"><a href="/u/${esc(id)}">ページに戻る</a></p>`,
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
    const base = 'public_id, nickname, fav_title, fav_author, fav_cover, fav_line, is_public, hidden';
    let { data, error } = await c.from('profiles').select(`user_id, ${base}, bio, shelf_public, shelf_hidden`).eq('public_id', id).maybeSingle();
    // 本棚の列がまだ無い DB（前の版の SQL）では、前の列だけで読む。
    if (error && (error.code === '42703' || /bio|shelf_/.test(String(error.message || '')))) ({ data, error } = await c.from('profiles').select(base).eq('public_id', id).maybeSingle());
    if (error) console.warn('[profile] read failed:', error.code || error.message);
    row = data || null;
  }
  row = row ? cleanPublicRow(row) : row;
  if (!isShowable(row)) return send(res, renderNotFound()), true;
  let shelf = null;
  if (row.shelf_public && row.user_id && c) shelf = await loadShelf(c, row.user_id, row.shelf_hidden);
  // 公開をやめたらすぐ消えるように、CDN には短くだけ覚えさせる。
  return send(res, renderProfile(row, { publicId: id, shelf }), 'public, max-age=0, s-maxage=60'), true;
}
