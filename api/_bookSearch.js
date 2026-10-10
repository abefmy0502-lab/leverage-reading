// 🔎 サーバーの本の検索（/api/cover?search=…・2026-10-02）。
//
// 「本を追加」で「考え方」と入れても稲盛和夫『考え方』が出なかった（端末から NDL の書名検索を
// 引き、NDL が返す読みの順＝辞書順の先頭 50 件をそのまま出していた）のを直す。流れは docs/book-search.md。
//
//   1. 楽天ブックス（鍵があれば・売上順）: 語が 1 つなら BooksBook の書名検索＋BooksTotal の
//      キーワード検索（著者名でも当たる）、語が 2 つ以上なら BooksTotal のキーワード検索（AND）。
//      楽天は続けて呼ぶと 429 になりやすいので 1 回ずつ順番に。
//   2. Google Books（GOOGLE_BOOKS_API_KEY があるときだけ・楽天と同時に）
//   3. NDL（上の 2 つで関係する本が 5 冊未満のときだけ・古い本・珍しい本のため）＋ openBD で表紙
//   4. 重なりを除き（_bookRank.js の dedupeBooks）、並べ替える（rankBooks）。最大 30 冊。
//
// 外部への呼び出しは差し替えられる（テスト・fetchImpl / rakutenGetImpl）。

import { rakutenCreds, rakutenGet, rakutenUrl, rakutenItems, rakutenUpscale, rakutenRealImage } from './_rakuten.js';
import { toIsbn13, extractIsbnsFromXml } from './_coverSources.js';
import { formatAuthors, yearOf, rankBooks, dedupeBooks, isRelated, splitSubtitle } from './_bookRank.js';
import { parseGenreIds } from './_rakutenGenre.js';

export const SEARCH_MAX_RESULTS = 30;
const RAKUTEN_HITS = 30;
const FETCH_TIMEOUT_MS = 4000;
const SEARCH_BUDGET_MS = 9000;
const NDL_MIN_RESULTS = 5;
const RAKUTEN_ELEMENTS = 'title,subTitle,titleKana,author,authorKana,publisherName,isbn,jan,salesDate,largeImageUrl,mediumImageUrl,reviewCount,reviewAverage,size,booksGenreId';

const clip = (s, n = 200) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, n);

// 検索語の正規化（全角半角・空白をそろえ、100 字まで）。
export function normalizeSearchQuery(raw) {
  return clip(raw, 100);
}

// ─── 楽天 ─────────────────────────────────────────────────────────────
// 楽天の 1 件を共通の形に（rank = 売上順の位置・0 始まり）。
export function fromRakutenItem(it, rank) {
  const isbn = toIsbn13(it.isbn) || (/^97[89]\d{10}$/.test(String(it.jan || '')) ? String(it.jan) : '');
  const cover = rakutenUpscale(rakutenRealImage(it.largeImageUrl) || rakutenRealImage(it.mediumImageUrl) || '');
  return {
    title: clip(it.title),
    subtitle: clip(it.subTitle),
    titleKana: clip(it.titleKana),
    author: formatAuthors(clip(it.author, 300)),
    authorKana: clip(it.authorKana),
    publisher: clip(it.publisherName, 100),
    pubdate: clip(it.salesDate, 40),
    pubYear: yearOf(it.salesDate),
    isbn,
    cover,
    salesRank: rank,
    reviewCount: Number(it.reviewCount) || 0,
    // 楽天ブックスのジャンル（「001004008/001019001」＝複数は / 区切り）。本の分野を決める手がかり（2026-10-11）
    genreIds: parseGenreIds(it.booksGenreId),
    source: 'rakuten',
  };
}

// 楽天の応答（JSON の文字列）を本の配列に。
export function parseRakutenSearch(body) {
  let data;
  try { data = typeof body === 'string' ? JSON.parse(body) : body; } catch { return []; }
  return rakutenItems(data)
    .map((it, i) => fromRakutenItem(it, i))
    .filter((b) => b.title && (b.isbn || b.author));
}

// 楽天を引く計画（順番に呼ぶ）。語が 1 つ: 書名検索 → キーワード検索。2 つ以上: キーワード検索
//   （少なければ、いちばん長い語で書名検索）。
export function rakutenPlan(q) {
  const words = q.split(' ').filter(Boolean);
  const common = { hits: String(RAKUTEN_HITS), sort: 'sales', outOfStockFlag: '1', elements: RAKUTEN_ELEMENTS };
  const keyword = { api: 'BooksTotal/Search', params: { ...common, keyword: q, booksGenreId: '001' } };
  if (words.length <= 1) {
    return [{ api: 'BooksBook/Search', params: { ...common, title: q } }, keyword];
  }
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  return [keyword, { api: 'BooksBook/Search', params: { ...common, title: longest }, onlyIfFew: true }];
}

async function searchRakuten(q, { env, rakutenGetImpl, hasTime }) {
  const creds = rakutenCreds(env);
  if (!creds.configured) return { state: 'off', status: 0, items: [] };
  const items = [];
  let answered = false;
  let status = 0;
  for (const step of rakutenPlan(q)) {
    if (!hasTime()) break;
    if (step.onlyIfFew && items.filter((b) => isRelated(q, b)).length >= NDL_MIN_RESULTS) break;
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await rakutenGetImpl(
        rakutenUrl(step.api, { format: 'json', applicationId: creds.appId, accessKey: creds.accessKey, ...step.params }),
        creds.referer,
      );
      status = resp.status;
      if (resp.status < 200 || resp.status >= 300) continue; // 429 などは次の手へ
      answered = true;
      items.push(...parseRakutenSearch(resp.body));
    } catch {
      status = status || 0;
    }
  }
  return { state: answered ? 'ok' : 'error', status, items };
}

// ─── Google Books ───────────────────────────────────────────────────────
export function fromGoogleVolume(v, rank) {
  const ids = v.industryIdentifiers || [];
  const gi = (ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10') || {}).identifier || '';
  const links = v.imageLinks || {};
  return {
    title: clip(v.title),
    subtitle: clip(v.subtitle),
    author: formatAuthors(Array.isArray(v.authors) ? v.authors.map((a) => clip(a, 100)) : []),
    publisher: clip(v.publisher, 100),
    pubdate: clip(v.publishedDate, 40),
    pubYear: yearOf(v.publishedDate),
    isbn: toIsbn13(gi),
    cover: String(links.thumbnail || links.smallThumbnail || '').replace(/^http:/i, 'https:'),
    pages: Number(v.pageCount) || 0,
    googleRank: rank,
    source: 'google',
  };
}

async function searchGoogle(q, { env, fetchImpl }) {
  const key = (env.GOOGLE_BOOKS_API_KEY || '').trim();
  if (!key) return { state: 'off', status: 0, items: [] };
  try {
    const r = await fetchImpl(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&country=JP&printType=books&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!r.ok) return { state: 'error', status: r.status, items: [] };
    const d = await r.json();
    const items = (d.items || []).map((it, i) => fromGoogleVolume(it.volumeInfo || {}, i)).filter((b) => b.title);
    return { state: 'ok', status: r.status, items };
  } catch {
    return { state: 'error', status: 0, items: [] };
  }
}

// ─── NDL（最後の手段）＋ openBD の表紙 ───────────────────────────────────
const tagText = (chunk, re) => (chunk.match(re) || [])[1] || '';
const decode = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// NDL OpenSearch（RSS）を本の配列に。記事（雑誌の中の 1 本）は除く。
export function parseNdlSearch(xml) {
  const chunks = String(xml || '').split(/<item[\s>]/i).slice(1);
  const out = [];
  for (const chunk of chunks) {
    const cats = (chunk.match(/<category[^>]*>([^<]*)<\/category>/gi) || []).map((c) => c.replace(/<[^>]+>/g, ''));
    if (cats.length && !cats.some((c) => c.includes('図書'))) continue;
    const title = decode(tagText(chunk, /<title[^>]*>([^<]*)<\/title>/i) || tagText(chunk, /<dc:title[^>]*>([^<]*)<\/dc:title>/i));
    if (!title) continue;
    const creators = (chunk.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/gi) || []).map((c) => decode(c.replace(/<[^>]+>/g, '')));
    const date = tagText(chunk, /<dc:date[^>]*>([^<]*)<\/dc:date>/i) || tagText(chunk, /<dcterms:issued[^>]*>([^<]*)<\/dcterms:issued>/i);
    const parts = splitSubtitle(clip(title)); // NDL は「書名 : 副題」を 1 つの書名で返す
    out.push({
      title: parts.title,
      subtitle: parts.subtitle,
      author: formatAuthors(creators),
      publisher: clip(decode(tagText(chunk, /<dc:publisher[^>]*>([^<]*)<\/dc:publisher>/i)), 100),
      pubdate: clip(date, 40),
      pubYear: yearOf(date),
      isbn: extractIsbnsFromXml(chunk, 1)[0] || '',
      cover: '',
      source: 'ndl',
    });
  }
  return out;
}

async function searchNdl(q, { fetchImpl }) {
  const words = q.split(' ').filter(Boolean);
  const param = words.length <= 1 ? `title=${encodeURIComponent(q)}` : `any=${encodeURIComponent(q)}`;
  try {
    const r = await fetchImpl(`https://ndlsearch.ndl.go.jp/api/opensearch?${param}&cnt=30`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) return { state: 'error', status: r.status, items: [] };
    const items = parseNdlSearch(await r.text());
    // openBD の表紙（1 回でまとめて）。失敗しても本の一覧は返す。
    const isbns = [...new Set(items.map((b) => b.isbn).filter(Boolean))].slice(0, 30);
    if (isbns.length) {
      try {
        const ob = await fetchImpl(`https://api.openbd.jp/v1/get?isbn=${isbns.join(',')}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (ob.ok) {
          const arr = await ob.json();
          const covers = {};
          (Array.isArray(arr) ? arr : []).forEach((it, i) => {
            const c = it?.summary?.cover;
            if (c) covers[isbns[i]] = String(c).replace(/^http:/i, 'https:');
          });
          for (const b of items) if (b.isbn && covers[b.isbn]) b.cover = covers[b.isbn];
        }
      } catch { /* 表紙なしのまま */ }
    }
    return { state: 'ok', status: r.status, items };
  } catch {
    return { state: 'error', status: 0, items: [] };
  }
}

// ─── 全体 ─────────────────────────────────────────────────────────────
// 端末へ返す形（小さく）。sales = 楽天の売上順の位置（1 始まり）・review = レビュー件数。
export function toClientBook(b) {
  return {
    title: b.title,
    subtitle: b.subtitle || '',
    author: b.author || '',
    publisher: b.publisher || '',
    pubdate: b.pubdate || '',
    pubYear: b.pubYear || '',
    isbn: b.isbn || '',
    cover: b.cover || '',
    pages: b.pages || 0,
    sales: Number.isFinite(b.salesRank) ? b.salesRank + 1 : null,
    review: Number(b.reviewCount) || 0,
    genreIds: Array.isArray(b.genreIds) ? b.genreIds : [],
    source: b.source || '',
  };
}

// 検索する。戻り値 { ok, results, sources: { rakuten, google, ndl } }（sources は 'ok'|'error'|'off'|'skip'）。
//   ok=false は、試した取得元がすべて失敗した（＝0 件とは言い切れない）。
export async function searchBooksServer(rawQuery, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  rakutenGetImpl = rakutenGet,
  budgetMs = SEARCH_BUDGET_MS,
} = {}) {
  const q = normalizeSearchQuery(rawQuery);
  if (!q) return { ok: true, results: [], sources: {} };
  const deadline = Date.now() + budgetMs;
  const hasTime = () => Date.now() < deadline;

  const [rk, gg] = await Promise.all([
    searchRakuten(q, { env, rakutenGetImpl, hasTime }),
    searchGoogle(q, { env, fetchImpl }),
  ]);
  let merged = dedupeBooks([...rk.items, ...gg.items]);
  let nd = { state: 'skip', status: 0, items: [] };
  if (merged.filter((b) => isRelated(q, b)).length < NDL_MIN_RESULTS && hasTime()) {
    nd = await searchNdl(q, { fetchImpl });
    merged = dedupeBooks([...rk.items, ...gg.items, ...nd.items]);
  }
  const tried = [rk, gg, nd].filter((s) => s.state === 'ok' || s.state === 'error');
  const ok = tried.some((s) => s.state === 'ok');
  const results = rankBooks(q, merged).slice(0, SEARCH_MAX_RESULTS).map(toClientBook);
  return {
    ok,
    results,
    sources: { rakuten: rk.state, google: gg.state, ndl: nd.state },
    statuses: { rakuten: rk.status, google: gg.status, ndl: nd.status },
  };
}

// ─── 覚えておく（同じインスタンスの中・30 分・成功だけ）──────────────────────
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 300;
const cache = new Map();
export function cachedSearch(q) {
  const e = cache.get(normalizeSearchQuery(q).toLowerCase());
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) { cache.delete(normalizeSearchQuery(q).toLowerCase()); return null; }
  return e.data;
}
export function rememberSearch(q, data) {
  if (!data?.ok) return; // 失敗は覚えない
  const key = normalizeSearchQuery(q).toLowerCase();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
export function clearSearchCache() { cache.clear(); }
