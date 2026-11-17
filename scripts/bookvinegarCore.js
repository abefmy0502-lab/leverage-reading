// 📚 bookvinegar（ビジネス書の書評サイト）が推す本を読む小さな関数（2026-11-17・オーナー裁定）。
//   本の事実（ISBN・書名・著者）と、推薦の事実（推薦ポイント・推薦者の名前と肩書き）と要約の文
//   （オーナー裁定で文ごと持つ・推薦の AI の参考にだけ使う・画面には出さない＝company/research/bookvinegar-2026-11.md §5-5）。
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

// 構造化データのジャンル（その書評サイトのテーマ）。
function genreOf(html) {
  for (const m of String(html || '').matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1].includes('"Review"')) continue;
    try {
      const g = JSON.parse(m[1])?.itemReviewed?.genre;
      return (Array.isArray(g) ? g : [g]).map((x) => clip(x, 20)).filter(Boolean).slice(0, 10);
    } catch { /* 次 */ }
  }
  return [];
}

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&#8217;|&#8216;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
/** HTML の断片を文に（タグを外し、段落と箇条書きで改行）。 */
export function textOf(fragment) {
  const t = String(fragment || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/dt>|<\/dd>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(t).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/**
 * 本の記事から、推薦の事実と要約の文（ops_books の ext に送る形）。本の記事でなければ null。
 *   points＝推薦ポイント・endorsers＝この本を薦めた人と媒体（名前と肩書き）・tags＝その記事のテーマ・summary＝要約の本文（4,000 字まで）。
 */
export function extFromPage(html, url = '') {
  const t = String(html || '');
  const book = bookFromPage(t);
  if (!book || !book.isbn) return null;
  const pm = t.match(/class="p-recommend-point"[^>]*>([\s\S]*?)<\/div>/);
  const pn = pm ? textOf(pm[1]).match(/(\d+)\s*P/) : null;
  // <span class="bv-recl__name">名前<small>肩書き</small></span>
  const endorsers = [...t.matchAll(/class="bv-recl__name"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => {
    const [namePart, ...rest] = m[1].split(/<small[^>]*>/);
    return { name: textOf(namePart).replace(/\n/g, ' ').slice(0, 60), note: textOf(rest.join(' ')).replace(/\n/g, ' ').slice(0, 80) };
  }).filter((x) => x.name).slice(0, 30);
  const s = t.indexOf('class="entry-content');
  const e = s >= 0 ? t.indexOf('class="bv-related', s) : -1;
  const end = e > s ? t.lastIndexOf('<', e) : s + 40000; // 次の区画のタグの頭で切る
  const body = s >= 0 ? textOf(t.slice(t.indexOf('>', s) + 1, end)).slice(0, 4000) : '';
  const tags = genreOf(t);
  return { isbn: book.isbn, url, points: pn ? Number(pn[1]) : null, endorsers, tags, summary: body };
}
