// ✍️ お気に入りの著者の本（2026-11-25 オーナー「著者をお気に入り登録できるようにして・新作が出たらおすすめする」）。
//   /api/cover?author_books=稲盛和夫 → { books: [{ title, subtitle, author, publisher, pubdate, release, isbn, cover }] }
//   楽天ブックスの書籍検索を著者の名前で・発売日の新しい順（これから出る本＝予約も入る）。著者がはっきり合う本だけ・
//   同じ作品の文庫化・新装版は新しい 1 冊にまとめず、古い版がある作品は reissue（新しい作品ではない）の印。
//   利用者の情報は使わない（著者の名前だけ）。新しい関数を増やさないため api/cover.js から呼ぶ。
import { rakutenCreds, rakutenGet, rakutenUrl } from './_rakuten.js';
import { parseRakutenSearch } from './_bookSearch.js';
import { authorMatches } from './_bookVerify.js';
import { normText, coreTitleOf } from './_bookRank.js';

const ELEMENTS = 'title,subTitle,author,publisherName,isbn,salesDate,largeImageUrl,mediumImageUrl,booksGenreId';
export const AUTHOR_BOOKS_MAX = 20;

export function normalizeAuthorQuery(raw) {
  return String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * 楽天の発売日（「2026年12月18日」「2026年12月中旬」「2026年12月下旬頃」「2026年12月」）→ 'YYYY-MM-DD'（日が無ければ旬か月末）。
 * 読めなければ ''。
 */
export function releaseDateOf(salesDate) {
  const s = String(salesDate || '').normalize('NFKC');
  const m = s.match(/(\d{4})年\s*(\d{1,2})月(?:\s*(\d{1,2})日)?/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return '';
  let d = m[3] ? Number(m[3]) : 0;
  if (!d) d = /上旬/.test(s) ? 10 : /中旬/.test(s) ? 20 : new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(Math.min(d, 31)).padStart(2, '0')}`;
}

/** 楽天の応答 → 著者の本（新しい順・はっきり合う著者だけ・同じ作品の前の版があれば reissue）。 */
export function pickAuthorBooks(author, items) {
  const list = (items || [])
    .filter((b) => b && b.title && /^\d{13}$/.test(String(b.isbn || '')))
    .filter((b) => authorMatches(author, String(b.author || '')))
    .map((b) => ({ ...b, release: releaseDateOf(b.pubdate) }))
    .sort((a, b) => (b.release || '').localeCompare(a.release || ''));
  const seenIsbn = new Set();
  const out = [];
  for (const b of list) {
    if (seenIsbn.has(b.isbn)) continue;
    seenIsbn.add(b.isbn);
    const core = normText(coreTitleOf(b.title));
    // 同じ作品で、もっと前に出た版（単行本 → 文庫）がある＝新しい作品ではない。
    const reissue = !!core && list.some((o) => o !== b && o.release && b.release && o.release < b.release && normText(coreTitleOf(o.title)) === core);
    out.push({
      title: b.title,
      subtitle: b.subtitle || '',
      author: b.author || '',
      publisher: b.publisher || '',
      pubdate: b.pubdate || '',
      release: b.release || '',
      isbn: b.isbn,
      cover: b.cover || '',
      reissue,
    });
    if (out.length >= AUTHOR_BOOKS_MAX) break;
  }
  return out;
}

/** 著者の本を楽天で引く。戻り値 { ok, books }（ok=false は楽天が答えなかった）。 */
export async function authorBooksServer(rawAuthor, { env = process.env, rakutenGetImpl = rakutenGet } = {}) {
  const author = normalizeAuthorQuery(rawAuthor);
  if (!author) return { ok: true, books: [] };
  const creds = rakutenCreds(env);
  if (!creds.configured) return { ok: false, books: [] };
  try {
    const resp = await rakutenGetImpl(
      rakutenUrl('BooksBook/Search', {
        format: 'json', applicationId: creds.appId, accessKey: creds.accessKey,
        author, sort: '-releaseDate', hits: '30', outOfStockFlag: '1', elements: ELEMENTS,
      }),
      creds.referer,
    );
    if (resp.status < 200 || resp.status >= 300) return { ok: false, books: [] };
    return { ok: true, books: pickAuthorBooks(author, parseRakutenSearch(resp.body)) };
  } catch {
    return { ok: false, books: [] };
  }
}

// 同じインスタンスの中で 3 時間覚える（成功だけ・200 人まで）。
const TTL = 3 * 60 * 60 * 1000;
const cache = new Map();
export function cachedAuthorBooks(author) {
  const k = normText(author);
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() - e.at > TTL) { cache.delete(k); return null; }
  return e.data;
}
export function rememberAuthorBooks(author, data) {
  if (!data?.ok) return;
  cache.set(normText(author), { at: Date.now(), data });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
}
