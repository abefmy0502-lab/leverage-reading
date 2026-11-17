// 📚 bookvinegar（ビジネス書の書評サイト）が推す本の「事実」だけを読む小さな関数（2026-11-17・オーナー裁定）。
//   持つのは ISBN・書名・著者だけ。要約・紹介文・推薦者の文章は読まない・残さない（company/research/bookvinegar-2026-11.md §5-5）。
//   使うのは scripts/bookvinegar-sync.mjs（月に 1 回・スケジュールされたタスク）。

/** 記事のサイトマップ（post-sitemap*.xml）から { loc, lastmod } を取り出す。本の記事（/数字/）だけ。 */
export function parsePostSitemap(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = (m[1].match(/<loc>(?:<!\[CDATA\[)?\s*([^<\]\s]+)/) || [])[1] || '';
    const lastmod = (m[1].match(/<lastmod>(?:<!\[CDATA\[)?\s*([^<\]\s]+)/) || [])[1] || '';
    if (/^https:\/\/bookvinegar\.jp\/\d+\/$/.test(loc)) out.push({ loc, lastmod });
  }
  return out;
}

/** サイトマップの一覧（sitemap.xml）から記事のサイトマップの URL を取り出す。 */
export function postSitemapUrls(indexXml) {
  return [...String(indexXml || '').matchAll(/<loc>(?:<!\[CDATA\[)?\s*(https:\/\/bookvinegar\.jp\/post-sitemap\d*\.xml)/g)].map((m) => m[1]);
}

/** 直近 days 日に更新された記事だけ（lastmod が読めない記事は入れない）。 */
export function recentPosts(posts, { days = 35, now = Date.now() } = {}) {
  const since = now - days * 24 * 3600 * 1000;
  const seen = new Set();
  return posts.filter((p) => {
    const t = Date.parse(p.lastmod);
    if (!Number.isFinite(t) || t < since || seen.has(p.loc)) return false;
    seen.add(p.loc);
    return true;
  });
}

const clip = (s, n) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * 本の記事の HTML から、構造化データ（schema.org の Review の中の Book）の事実だけを取り出す。
 * 返り値: { isbn, title, author } か null（本の記事でない・読めない）。本文の文章は見ない。
 */
export function bookFromPage(html) {
  for (const m of String(html || '').matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1].includes('"Review"')) continue;
    let r = null;
    try { r = JSON.parse(m[1]); } catch { continue; }
    const b = r && r.itemReviewed;
    if (!b || b['@type'] !== 'Book') continue;
    const authors = (Array.isArray(b.author) ? b.author : [b.author]).filter((a) => a && typeof a === 'object').map((a) => clip(a.name, 80)).filter(Boolean);
    const isbn = String(b.isbn || '').replace(/[^0-9Xx]/g, '');
    const title = clip(b.name, 300);
    if (!title && !isbn) return null;
    return { isbn: /^(\d{9}[\dXx]|\d{13})$/.test(isbn) ? isbn : '', title, author: authors.slice(0, 3).join('、') };
  }
  return null;
}

/** 待ち行列に送る形（ops_books の add の books）に。ISBN の無い本は書名と著者で。同じ本は 1 つに。 */
export function toAddBooks(books) {
  const out = [];
  const seen = new Set();
  for (const b of books) {
    if (!b) continue;
    const key = b.isbn || `${b.title}|${b.author}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(b.isbn ? { isbn: b.isbn, title: b.title, author: b.author } : { title: b.title, author: b.author });
  }
  return out;
}

/** n 冊ずつに分ける（ops_books の add は 1 回 200 冊まで）。 */
export function chunks(list, n = 200) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
