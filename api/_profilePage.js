// 👤 プロフィールの公開のページ（2026-11-21 オーナー「ニックネームと好きな本とその本のおすすめの 1 行」・見せ方は共有リンクのページ）。
//   GET  /u/<id>              → /api/cover?profile=<id>（vercel.json の rewrite）＝ 1 枚の HTML（SNS に貼ると絵と文が出る）
//   POST /api/profile-report  → /api/cover?op=profile_report ＝ 通報（理由の文だけ・通報した人の情報は残さない）
//   新しい Vercel 関数を増やさないため api/cover.js から呼ぶ（Hobby の上限 12・docs/book-search.md と同じ考え）。
//   出すのは 本人が「公開する」をオンにした・運営が隠していない（hidden=false）行だけ。それ以外は「見つかりません」（404）。
//   ページはスクリプトを使わない（CSP の script-src 'self'）・色と文字はアプリと同じ値（src/styles/tokens.css の写し）。
//   本棚も公開する（shelf_public・2026-11-21 2 回目）ときは、本の書名・著者・表紙・状態・評価を状態ごとに（分野は 2026-11-21 4 回目に出さなくした）。メモは読まない・出さない。
//   本人が外した本（shelf_hidden）は出さない。自己紹介（bio）は名前の下に。
//   2026-11-21（3 回目・オーナー「ビジネス・ものの見方などの分類はなくて OK」「本の画像を押したらその人のこの本のまとめを」）:
//   分野のまとまりはやめた。VITE_SOCIAL=on のときは本を押すと本のページ（/u/<id>/b/<本の id>）＝書名・著者・状態・評価・
//   本人が「本のまとめも公開する」をオンにしていれば「この本のまとめ」（公開に向かない言葉・連絡先があれば出さない）・
//   「読みたいに追加」（Orime を開いて自分の読みたいに入れる＝/?want=1&title=…）。プロフィールに「フォローを申し込む」（/?follow=<id>）。
//   テーブル: supabase_profiles.sql
import { createClient } from '@supabase/supabase-js';
import { takeIpSlot } from './_ipRate.js';
import { checkCoverImageUrl } from './_coverImageUrl.js';
import { paletteFor } from '../src/lib/coverPalette.js';
import { profileTextIssue } from '../src/lib/profileFilter.js';
import { getAmazonLink } from '../src/lib/amazonLink.js';
import { getRakutenLink, STORE_DISCLOSURE_TEXT } from '../src/lib/rakutenLink.js';
import { avatarById, avatarInitial } from '../src/lib/avatars.js';
import { AVATAR_SVG } from '../src/lib/avatarSvg.js';

export const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;
const SITE = () => String(process.env.VITE_SITE_URL || 'https://orime.vercel.app').replace(/\/+$/, '');
const REPORT_MAX = 500;
// 開いている通報がこの数たまったら、運営が確かめるまで自動で隠す（App 審査 1.2・運営は 24 時間以内に確かめる）。
export const AUTO_HIDE_REPORTS = 3;
// 👥 フォロー・本のページ・読みたいに追加（2026-11-21 3 回目）は VITE_SOCIAL=on のときだけ出す（アプリの 1.0.1 と合わせて入れる）。
export const socialOn = (env = process.env) => String(env.VITE_SOCIAL || '').toLowerCase() === 'on';
const SUMMARY_MAX = 4000;
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
.av{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;margin:0 0 12px;color:#fff}.av-ini{background:var(--fill);color:var(--text-2);box-shadow:inset 0 0 0 1px var(--separator);font-size:24px;font-weight:600}
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
.bka{display:flex;flex-direction:column;gap:4px;min-width:0;color:inherit;text-decoration:none}
.stores{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0 0}.stores a{flex:1 1 9em;margin:0}
.cta2{display:flex;align-items:center;justify-content:center;margin:16px 0 0;min-height:48px;padding:12px 16px;border-radius:var(--radius);border:1px solid var(--border);color:var(--text);font-size:15px;font-weight:600;text-decoration:none}
.sum{margin:0;font-family:var(--font-read);font-size:17px;line-height:1.8;white-space:pre-line;overflow-wrap:anywhere}
.back{display:inline-flex;align-items:center;min-height:44px;font-size:15px;color:var(--accent);text-decoration:none}
.bookhead{display:flex;gap:16px;align-items:flex-start}.bookhead .bcover{width:96px;flex-shrink:0}
.bookhead .bcover img,.bookhead .bcover .ph{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:4px;border:1px solid var(--separator);display:flex;align-items:flex-end;padding:8px;font-size:13px;font-weight:600;color:var(--on-cover);overflow:hidden}
.meta{margin:8px 0 0;font-size:13px;color:var(--text-2)}
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

/** 公開の本棚に出す本を整える（外した本を除く・状態ごと）。books は { id, title, author, cover, status, rating } */
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
          id: String(b.id),
          title: String(b.title).trim().slice(0, 120),
          author: String(b.author || '').trim().slice(0, 80),
          cover: c.ok ? c.url : '',
          rating: st.id === 'done' ? Math.max(0, Math.min(5, Math.round(Number(b.rating) || 0))) : 0,
        };
      }),
    };
  }).filter((g) => g.total > 0);
  return { total: list.length, byStatus };
}

// 表紙の無い本はアプリと同じ代用表紙（書名から決まる色・白い書名・lib/coverPalette.js）。書名は表紙の上だけに見せ、下の書名は読み上げ用。
// 自分のアイコン（アプリの UserAvatar と同じ形・色は --cover-* と同じ値）。選んでいなければニックネームの 1 字。
const COVER_COLORS = { 1: ['#7d4a2e', '#5d3a22'], 2: ['#7a5080', '#5a3a60'], 3: ['#4a6e8a', '#2c4d68'], 4: ['#4f6e3f', '#3a5a30'], 5: ['#8e4330', '#703528'], 6: ['#7e6249', '#5e4836'] };
export function renderAvatar(avatarId, nickname) {
  const a = avatarById(avatarId);
  if (a && AVATAR_SVG[a.id]) {
    const [c1, c2] = COVER_COLORS[a.color] || COVER_COLORS[3];
    return `<span class="av" aria-hidden="true" style="background:linear-gradient(160deg, ${c1}, ${c2})"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${AVATAR_SVG[a.id]}</svg></span>`;
  }
  const ch = avatarInitial(nickname);
  return ch ? `<span class="av av-ini" aria-hidden="true">${esc(ch)}</span>` : '';
}

function coverPlaceholder(title) {
  const [a, b] = paletteFor(title);
  return `<span class="ph" aria-hidden="true" style="background:linear-gradient(160deg, ${a}, ${b})">${esc(title)}</span>`;
}

function bookInner(b) {
  return `${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy">` : coverPlaceholder(b.title)}${
    b.cover ? `<p class="bt">${esc(b.title)}</p>` : `<p class="bt sr">${esc(b.title)}</p>`}${b.author ? `<p class="ba">${esc(b.author)}</p>` : ''}${
    b.rating ? `<p class="st" aria-label="評価 ${b.rating}">${'★'.repeat(b.rating)}${'☆'.repeat(5 - b.rating)}</p>` : ''}`;
}

function renderShelf(shelf, { publicId = '', links = false } = {}) {
  if (!shelf || !shelf.total) return '';
  const counts = shelf.byStatus.map((g) => `${g.label} ${g.total} 冊`).join('・');
  const sections = shelf.byStatus.map((g) => `<section class="status"><h3>${esc(g.label)}</h3><ul class="grid">${g.books.map((b) => (
    links && b.id
      ? `<li class="bk"><a class="bka" href="/u/${esc(publicId)}/b/${esc(b.id)}">${bookInner(b)}</a></li>`
      : `<li class="bk">${bookInner(b)}</li>`
  )).join('')}</ul>${g.total > g.books.length ? `<p class="more">ほか ${g.total - g.books.length} 冊</p>` : ''}</section>`).join('');
  return `<section class="shelf"><h2>本棚</h2><p class="counts">${esc(counts)}</p>${sections}</section>`;
}

export function renderProfile(p, { publicId, shelf = null, social = socialOn() }) {
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
${renderAvatar(p.avatar, nickname)}<h1 class="name">${esc(who)}</h1>${bio ? `<p class="bio">${esc(bio)}</p>` : ''}
${title ? `<p class="label">好きな本</p><div class="book">${cover.ok ? `<img class="cover" src="${esc(cover.url)}" alt="">` : ''}<div><p class="title">『${esc(title)}』</p>${author ? `<p class="author">${esc(author)}</p>` : ''}</div></div>` : ''}
${line ? `<p class="label">おすすめの 1 行</p><p class="line">「${esc(line)}」</p>` : ''}
</div>${social ? `<a class="cta2" href="${esc(site)}/?follow=${esc(publicId)}">Orime でフォローを申し込む</a>` : ''}${renderShelf(shelf, { publicId, links: social })}
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

const STATUS_LABEL = Object.fromEntries(SHELF_STATUSES.map((x) => [x.id, x.label]));

/** 本のまとめを公開のページに出せる形に（公開に向かない言葉・連絡先があれば出さない・長さを切る）。 */
export function publicSummary(text) {
  const t = String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, SUMMARY_MAX);
  if (!t) return '';
  return profileTextIssue(t, 'own') ? '' : t;
}

/** 読みたいに追加の行き先（Orime を開いて、自分の読みたいに入れる確認を出す）。 */
export function wantUrl(book, site = SITE()) {
  const q = new URLSearchParams({ want: '1', title: String(book.title || '').slice(0, 120) });
  if (book.author) q.set('author', String(book.author).slice(0, 80));
  const isbn = String(book.isbn || '').replace(/[^0-9Xx]/g, '');
  if (isbn) q.set('isbn', isbn.slice(0, 13));
  if (book.cover) q.set('cover', String(book.cover).slice(0, 500));
  return `${site}/?${q.toString()}`;
}

/** 本のページ（/u/<id>/b/<本の id>）。 */
export function renderBook(p, book, { publicId, showSummary = false }) {
  const site = SITE();
  const nickname = String(p.nickname || '').trim();
  const who = nickname ? `${nickname}さん` : 'Orime の読者';
  const c = book.cover ? checkCoverImageUrl(String(book.cover)) : { ok: false };
  const cover = c.ok ? c.url : '';
  const rating = book.status === 'done' ? Math.max(0, Math.min(5, Math.round(Number(book.rating) || 0))) : 0;
  const summary = showSummary ? publicSummary(book.summary) : '';
  const title = String(book.title || '').trim();
  const meta = [STATUS_LABEL[book.status] || '', rating ? `評価 ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : ''].filter(Boolean).join('・');
  const body = `<a class="back" href="/u/${esc(publicId)}">‹ ${esc(who)}の本棚</a>
<div class="card" style="margin-top:8px"><div class="bookhead"><div class="bcover">${cover ? `<img src="${esc(cover)}" alt="">` : coverPlaceholder(title)}</div>
<div><h1 class="title" style="font-size:20px">『${esc(title)}』</h1>${book.author ? `<p class="author">${esc(book.author)}</p>` : ''}${meta ? `<p class="meta">${esc(meta)}</p>` : ''}</div></div>
<p class="label">${esc(who)}の、この本のまとめ</p>${summary ? `<p class="sum">${esc(summary)}</p>` : `<p class="note" style="margin:0">${showSummary ? 'まとめはまだありません。' : 'まとめは公開されていません。'}</p>`}
</div>
<a class="cta" href="${esc(wantUrl({ ...book, cover }, site))}">読みたいに追加</a>
<p class="note">Orime が開き、あなたの「読みたい」に入れる前に確かめます。</p>
<div class="stores"><a class="cta2" href="${esc(getAmazonLink({ isbn: book.isbn, title, author: book.author }))}" target="_blank" rel="noopener noreferrer sponsored">Amazon で見る ↗</a><a class="cta2" href="${esc(getRakutenLink({ isbn: book.isbn, title, author: book.author }))}" target="_blank" rel="noopener noreferrer">楽天で見る ↗</a></div>
<p class="note">${esc(STORE_DISCLOSURE_TEXT)}</p>
<a class="cta2" href="${esc(site)}/?follow=${esc(publicId)}">Orime でフォローを申し込む</a>
<p class="note">承認されると、本棚とまとめをアプリでいつでも見られます。</p>
<details><summary>このページを通報する</summary>
<form method="post" action="/api/profile-report"><input type="hidden" name="id" value="${esc(publicId)}">
<label for="reason">理由（任意・500 字まで）</label><textarea id="reason" name="reason" maxlength="${REPORT_MAX}"></textarea>
<button type="submit">通報する</button></form></details>
<p class="foot"><a href="${esc(site)}/legal/terms">利用規約</a>・<a href="${esc(site)}/legal/privacy">プライバシーポリシー</a></p>`;
  return page({
    title: `${who}の本棚『${title}』 | Orime`,
    description: summary ? summary.slice(0, 80) : `${who}の本棚の『${title}』`,
    image: cover,
    url: `${site}/u/${publicId}/b/${book.id}`,
    body,
  });
}

const BOOK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 本を 1 冊読む（本棚を公開していて、外していない本だけ）。まとめは本人が公開しているときだけ読む。
async function loadBook(c, row, bookId) {
  if (!BOOK_ID_RE.test(bookId) || (row.shelf_hidden || []).map(String).includes(bookId)) return null;
  const cols = `id, title, author, cover, isbn, status, rating${row.summary_public ? ', leverage_memo' : ''}`;
  try {
    let { data, error } = await c.from('books').select(cols).eq('user_id', row.user_id).eq('id', bookId).maybeSingle();
    if (error && /isbn/.test(String(error.message || ''))) ({ data, error } = await c.from('books').select(cols.replace(', isbn', '')).eq('user_id', row.user_id).eq('id', bookId).maybeSingle());
    if (error || !data || !String(data.title || '').trim()) return null;
    if (profileTextIssue(data.title, 'book') || profileTextIssue(data.author, 'book')) return null;
    return { ...data, summary: data.leverage_memo || '' };
  } catch (e) {
    console.warn('[profile] book read failed:', e?.message || e);
    return null;
  }
}

// 本棚を読む（書名・著者・表紙・状態・評価だけ。分野とメモは読まない）。読めなければ null＝本棚を出さない。
async function loadShelf(c, userId, hidden) {
  try {
    const { data, error } = await c.from('books')
      .select('id, title, author, cover, status, rating, updated_at')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(1000);
    if (error) { console.warn('[profile] shelf read failed:', error.code || error.message); return null; }
    const books = data || [];
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
    let { data, error } = await c.from('profiles').select(`user_id, ${base}, bio, shelf_public, shelf_hidden, avatar, summary_public`).eq('public_id', id).maybeSingle();
    // まとめの公開の列がまだ無い DB では、まとめを出さずに読む。
    if (error && (error.code === '42703' || /summary_public/.test(String(error.message || '')))) ({ data, error } = await c.from('profiles').select(`user_id, ${base}, bio, shelf_public, shelf_hidden, avatar`).eq('public_id', id).maybeSingle());
    // アイコンの列がまだ無い DB では、アイコン無しで読む。
    if (error && (error.code === '42703' || /avatar/.test(String(error.message || '')))) ({ data, error } = await c.from('profiles').select(`user_id, ${base}, bio, shelf_public, shelf_hidden`).eq('public_id', id).maybeSingle());
    // 本棚の列がまだ無い DB（前の版の SQL）では、前の列だけで読む。
    if (error && (error.code === '42703' || /bio|shelf_/.test(String(error.message || '')))) ({ data, error } = await c.from('profiles').select(base).eq('public_id', id).maybeSingle());
    if (error) console.warn('[profile] read failed:', error.code || error.message);
    row = data || null;
  }
  row = row ? cleanPublicRow(row) : row;
  if (!isShowable(row)) return send(res, renderNotFound()), true;
  const bookId = String(Array.isArray(q.book) ? q.book[0] : q.book || '').trim().toLowerCase();
  if (bookId) {
    // 本のページは VITE_SOCIAL=on・本棚を公開しているときだけ。
    if (!socialOn() || !row.shelf_public || !row.user_id || !c) return send(res, renderNotFound()), true;
    const book = await loadBook(c, row, bookId);
    if (!book) return send(res, renderNotFound()), true;
    return send(res, renderBook(row, book, { publicId: id, showSummary: !!row.summary_public }), 'public, max-age=0, s-maxage=60'), true;
  }
  let shelf = null;
  if (row.shelf_public && row.user_id && c) shelf = await loadShelf(c, row.user_id, row.shelf_hidden);
  // 公開をやめたらすぐ消えるように、CDN には短くだけ覚えさせる。
  return send(res, renderProfile(row, { publicId: id, shelf }), 'public, max-age=0, s-maxage=60'), true;
}
