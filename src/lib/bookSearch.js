// Book search.
//
// 2026-10-02: 書名・著者で探すときは、まずサーバーの検索（/api/cover?search=・楽天の売上順 → Google →
// NDL・api/_bookSearch.js）を使う。サーバーが失敗したとき（通信・502・お試しモードの old）だけ、下の
// 端末だけの検索（NDL → openBD → Google）に切り替え、結果はサーバーと同じ並べ方（api/_bookRank.js の
// rankBooks）で並べ、著者名を整える（「稲盛, 和夫, 1932-2022」→「稲盛和夫」）。docs/book-search.md。
// 以前は NDL の返す順（読みの辞書順の先頭 50 件）をそのまま出していたので、「考え方」で稲盛和夫『考え方』が出なかった。
//
// （以下は端末だけの検索の説明）NDL-first to avoid Google Books rate limits.
//
// Why this exists: Google Books' anonymous IP quota is ~1000/day. A few
// active users on the same egress IP (corporate network, Vercel edge) hit
// 429 fast and the search "stops working" silently. NDL's OpenSearch is
// free, ungated, and has the best Japanese coverage anyway. Google Books
// stays as a fallback for non-Japanese books and when NDL is down.
//
// Pipeline for keyword queries:
//   1. localStorage cache hit?  →  return immediately
//   2. NDL OpenSearch (XML)     →  list of {title, author, publisher, isbn}
//   3. openBD batch by ISBN     →  enrich with cover URLs
//   4. Google Books fallback    →  only if NDL returned 0 / errored
//   5. cache the merged result
//
// For ISBN-shaped input we skip NDL and ask openBD directly (single fast
// trip), then Google Books if openBD doesn't have the book.
//
// All API responses are wrapped: { ok: true, results, cached? } or
// { ok: false, error } so the UI can distinguish a true 0-results from a
// network/quota failure (the original "search appears broken" bug came
// from collapsing those into a single empty array).

// 共著（「楠木建・杉浦泰」「A、B」「A/B」「A and B」）を書籍 API の著者絞り込み
// （inauthor: / creator=）に丸ごと渡すと「その名前の 1 人」を探して 0 件になる。
// クエリには先頭著者だけを使う（照合は isSameBook が全著者文字列で含み合い判定
// するので 2 人目以降も同定できる）。
//   ※「・」は外国人名の中黒（ロバート・キヨサキ ＝ 1 人）を割らず、日本語の連名
//     （漢字・漢字 ＝ 2 人）だけ割る。全パートが漢字を含む時のみ分割。
const firstAuthorForQuery = (author) => {
  const a = (author || '').trim();
  if (!a) return '';
  let first = a.split(/[/／、,，;；&＆]|\s+and\s+/i)[0].trim();
  if (first.includes('・') || first.includes('･')) {
    const parts = first.split(/[・･]/).map((p) => p.trim()).filter(Boolean);
    const hasKanji = (s) => /[一-龯]/.test(s);
    if (parts.length >= 2 && parts.every(hasKanji)) first = parts[0];
  }
  return first || a;
};

import { apiUrl } from './apiUrl';
import { rankBooks, formatAuthors, splitSubtitle } from '../../api/_bookRank.js';

// v2（2026-10-02）: 辞書順のまま・NDL の書き方の著者名で覚えた結果を捨てる。
const CACHE_KEY = 'bookSearchCache:v2';
// 7 days. ISBN は不変で、検索クエリも頻繁には変わらないため、長めに置いて
// 体感速度を上げる。容量制御は CACHE_MAX_ENTRIES が担当。
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 「0 件」は 1 日だけ（失敗は覚えない＝setCached を呼ばない）。
const CACHE_EMPTY_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

// ---------- localStorage cache ----------

function readCache() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(obj) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    }
  } catch {
    // QuotaExceeded — silently drop. Search still works without cache.
  }
}

function keyOf(query) {
  return (query || '').trim().toLowerCase();
}

function getCached(query) {
  const cache = readCache();
  const entry = cache[keyOf(query)];
  if (!entry) return null;
  const ttl = Array.isArray(entry.results) && entry.results.length === 0 ? CACHE_EMPTY_TTL_MS : CACHE_TTL_MS;
  if (Date.now() - entry.timestamp > ttl) {
    delete cache[keyOf(query)];
    writeCache(cache);
    return null;
  }
  return entry.results;
}

function setCached(query, results) {
  const cache = readCache();
  cache[keyOf(query)] = { results, timestamp: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX_ENTRIES) {
    // Trim oldest first.
    const sorted = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
    const drop = keys.length - CACHE_MAX_ENTRIES;
    for (let i = 0; i < drop; i++) delete cache[sorted[i]];
  }
  writeCache(cache);
}

export function clearBookSearchCache() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- helpers ----------

function cleanIsbn(s) {
  return (s || '').replace(/[-\s]/g, '');
}

function isISBN(s) {
  return /^\d{10,13}$/.test(cleanIsbn(s));
}

function authorFromNdl(item) {
  // NDL puts the cleanest version in <dc:creator>; <author> often duplicates
  // the same name with role suffix ("加藤, 和彦,加藤和彦 著").
  // 1 人ずつ本の表記に整えてから「、」でつなぐ（「稲盛, 和夫, 1932-2022」→「稲盛和夫」・
  // 「Heckel, Paul」「酒井, 邦秀, 1945-」→「Paul Heckel、酒井邦秀」・2026-10-02）。
  const creators = Array.from(item.getElementsByTagName('*'))
    .filter((el) => el.localName === 'creator')
    .map((el) => (el.textContent || '').trim())
    .filter(Boolean);
  if (creators.length > 0) return formatAuthors(creators);
  const authorEl = item.getElementsByTagName('author')[0];
  return formatAuthors((authorEl?.textContent || '').trim());
}

function isbnFromNdl(item) {
  const idents = Array.from(item.getElementsByTagName('*'))
    .filter((el) => el.localName === 'identifier');
  for (const id of idents) {
    const t = id.getAttribute('xsi:type') || id.getAttribute('type') || '';
    if (/ISBN/i.test(t)) {
      const cleaned = cleanIsbn(id.textContent);
      if (/^\d{10,13}$/.test(cleaned)) return cleaned;
    }
  }
  return '';
}

function publisherFromNdl(item) {
  const pubs = Array.from(item.getElementsByTagName('*'))
    .filter((el) => el.localName === 'publisher')
    .map((el) => (el.textContent || '').trim())
    .filter(Boolean);
  return pubs[0] || '';
}

function isBookCategoryNdl(item) {
  // Filter out 記事 (magazine articles) — we want 図書 / 雑誌 covers only.
  const cats = Array.from(item.getElementsByTagName('category'))
    .map((c) => (c.textContent || '').trim());
  if (cats.length === 0) return true;
  return cats.some((c) => c.includes('図書') || c.includes('雑誌'));
}

// ---------- API callers ----------

// 📚 検索結果は「書誌メタデータ専用」— 未検証の cover URL は載せない。
// NDL の thumbnail は登録のない本でも 'No image' プレースホルダーを
// 200 OK で返す + openBD URL パターンも 404 の可能性があるため、検索
// 段階で URL を入れると DB に「壊れた cover」として永続化される事故が
//起きる (実際にレバレッジ・リーディングで発生)。
//
// cover URL の確定は lib/bookCover.resolveCoverFromCandidates で実在
// 検証してから。検索結果の cover は常に '' を返す。

// Pull the publication year from <dc:date> / <pubDate>. NDL is inconsistent —
// some entries use ISO ("2014-09"), others "2014", others a long date. We
// keep just the 4-digit year for sorting / display.
function pubYearFromNdl(item) {
  const tags = ['date', 'pubDate', 'issued'];
  for (const tag of tags) {
    const els = Array.from(item.getElementsByTagName('*')).filter((el) => el.localName === tag);
    for (const el of els) {
      const t = (el.textContent || '').trim();
      const m = t.match(/(\d{4})/);
      if (m) return m[1];
    }
  }
  return '';
}

// Build the NDL OpenSearch URL. NDL supports separate `title` / `creator` /
// `isbn` query params — combining them gives AND semantics, which is exactly
// what the詳細検索 form wants.
function buildNdlUrl({ title, author, isbn, q } = {}) {
  const params = [];
  if (title) params.push(`title=${encodeURIComponent(title)}`);
  if (author) params.push(`creator=${encodeURIComponent(author)}`);
  if (isbn) params.push(`isbn=${encodeURIComponent(isbn)}`);
  // Free-text fallback (single-input mode).
  if (!params.length && q) params.push(`title=${encodeURIComponent(q)}`);
  // 50 まで持ってきて UI 側で「もっと見る」ページングする想定。
  // NDL は cnt= 上限を強く設けていないが、レスポンスサイズと体感速度の
  // バランスで 50 をプロジェクト基準にしている。
  params.push('cnt=50');
  return `https://ndlsearch.ndl.go.jp/api/opensearch?${params.join('&')}`;
}

async function searchNDLRaw(urlParams, { signal } = {}) {
  const url = buildNdlUrl(urlParams);
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) {
    const e = new Error(`NDL HTTP ${r.status}`);
    e.status = r.status;
    e.source = 'ndl';
    throw e;
  }
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    const e = new Error('NDL XML parse error');
    e.source = 'ndl';
    throw e;
  }
  const items = Array.from(doc.getElementsByTagName('item'));
  return items
    .filter(isBookCategoryNdl)
    .map((item) => {
      const isbn = isbnFromNdl(item);
      return {
        title:
          item.getElementsByTagName('title')[0]?.textContent?.trim() || '',
        author: authorFromNdl(item),
        publisher: publisherFromNdl(item),
        pubYear: pubYearFromNdl(item),
        isbn,
        // 検索結果は cover を持たない — 保存時に resolveCoverFromCandidates
        // で実在検証された URL に確定する。NDL サムネを cover に入れない
        // ことが今回の根本対策。
        cover: '',
        pages: 0,
        source: 'ndl',
      };
    })
    .filter((b) => b.title);
}

async function searchNDL(query) {
  return searchNDLRaw({ q: query });
}

async function batchOpenBD(isbns, { signal } = {}) {
  if (!isbns.length) return {};
  // openBD accepts a comma-separated list and returns a parallel-indexed array.
  const url = `https://api.openbd.jp/v1/get?isbn=${isbns.join(',')}`;
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) return {};
  const arr = await r.json();
  const map = {};
  arr.forEach((item, i) => {
    if (!item) return;
    const isbn = isbns[i];
    map[isbn] = {
      title: item.summary?.title || '',
      author: formatAuthors(item.summary?.author || ''),
      publisher: item.summary?.publisher || '',
      cover: item.summary?.cover || '',
    };
  });
  return map;
}

async function lookupISBNopenBD(isbn, { signal } = {}) {
  const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`, signal ? { signal } : undefined);
  // HTTP エラー（429/5xx）は「未収録（null）」と区別して throw する。
  // null に潰すと呼び出し側の error ガードが発火せず、空結果が 7 日
  // キャッシュされる（cache poisoning）。
  if (!r.ok) {
    const e = new Error(`openBD HTTP ${r.status}`);
    e.status = r.status;
    e.source = 'openbd';
    throw e;
  }
  const d = await r.json();
  if (d?.[0]?.summary) {
    const s = d[0].summary;
    return {
      title: s.title || '',
      author: formatAuthors(s.author || ''), // 「稲盛和夫／著」→「稲盛和夫」
      publisher: s.publisher || '',
      // openBD は summary.cover を持つ本は ~40%。それ以外は空文字に。
      // 推測 URL は入れない (上層 resolveCoverFromCandidates で確定)。
      cover: s.cover || '',
      pages: 0,
      isbn,
    };
  }
  return null;
}

async function searchGoogleBooks(query, { signal } = {}) {
  const r = await fetch(
    // Google Books は maxResults の上限が 40。NDL fallback として 40 まで。
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40`,
    signal ? { signal } : undefined,
  );
  if (!r.ok) {
    const e = new Error(`Google Books HTTP ${r.status}`);
    e.status = r.status;
    e.source = 'google';
    throw e;
  }
  const d = await r.json();
  return (d.items || [])
    .map((i) => {
      const v = i.volumeInfo || {};
      const ids = v.industryIdentifiers || [];
      const isbn =
        ids.find((x) => x.type === 'ISBN_13')?.identifier ||
        ids.find((x) => x.type === 'ISBN_10')?.identifier ||
        '';
      const pubMatch = (v.publishedDate || '').match(/(\d{4})/);
      return {
        title: v.title || '',
        subtitle: v.subtitle || '',
        author: formatAuthors(v.authors || []),
        publisher: v.publisher || '',
        pubYear: pubMatch ? pubMatch[1] : '',
        cover: String(v.imageLinks?.thumbnail || '').replace(/^http:/i, 'https:'),
        pages: v.pageCount || 0,
        isbn,
        source: 'google',
      };
    })
    .filter((b) => b.title);
}

// （撤去）fetchNewReleases — 本屋モード「最新の新刊」。Google Books の発売日順は
// キュレーションされておらずノイズが多く、「テーマの棚（AI 選書）」に一本化した際に
// 呼び出し元を全て撤去済み。死にコードのため削除（git 履歴から復活可）。

async function lookupISBNGoogle(isbn, { signal } = {}) {
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, signal ? { signal } : undefined);
  // HTTP エラーは「未収録」と区別して throw（上のコメント参照）。
  if (!r.ok) {
    const e = new Error(`Google Books HTTP ${r.status}`);
    e.status = r.status;
    e.source = 'google';
    throw e;
  }
  const d = await r.json();
  const v = d.items?.[0]?.volumeInfo;
  if (!v) return null;
  return {
    title: v.title || '',
    author: formatAuthors(v.authors || []),
    publisher: v.publisher || '',
    cover: String(v.imageLinks?.thumbnail || '').replace(/^http:/i, 'https:'),
    pages: v.pageCount || 0,
    isbn,
  };
}

// ---------- merge ----------

// Prefer the first source's order; secondary fills in missing ISBNs and
// upgrades blank fields (cover / publisher / author / pages) when present.
function mergeResults(primary, secondary) {
  const byKey = new Map();
  const order = [];
  const keyFor = (b) =>
    b.isbn ? `i:${b.isbn}` : `t:${(b.title || '').toLowerCase()}|a:${(b.author || '').toLowerCase()}`;
  const ingest = (src) => {
    for (const b of src) {
      const k = keyFor(b);
      const existing = byKey.get(k);
      if (!existing) {
        byKey.set(k, { ...b });
        order.push(k);
      } else {
        existing.cover = existing.cover || b.cover;
        existing.publisher = existing.publisher || b.publisher;
        existing.pages = existing.pages || b.pages;
        existing.author = existing.author || b.author;
        existing.isbn = existing.isbn || b.isbn;
        existing.pubYear = existing.pubYear || b.pubYear || '';
      }
    }
  };
  ingest(primary);
  if (secondary) ingest(secondary);
  return order.map((k) => byKey.get(k));
}

// ---------- server search (2026-10-02) ----------

const SERVER_SEARCH_TIMEOUT_MS = 10000;
const str = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');

// サーバーの本の検索（/api/cover?search=）。{ ok, results } / 失敗は { ok: false }（例外にしない）。
// 呼び出し側の signal で中断されたときだけ AbortError を投げる。結果は端末に覚えない（サーバーと CDN が覚える・
// 失敗や 0 件を端末に 7 日残さない）。
export async function searchBooksOnServer(query, { signal, timeoutMs = SERVER_SEARCH_TIMEOUT_MS } = {}) {
  const q = String(query || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!q) return { ok: true, results: [] };
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(apiUrl(`/api/cover?search=${encodeURIComponent(q)}`), { signal: ctrl.signal });
    if (!r.ok) return { ok: false, status: r.status };
    const d = await r.json();
    const results = (Array.isArray(d?.results) ? d.results : [])
      .filter((b) => b && typeof b.title === 'string' && b.title)
      .map((b) => ({
        title: str(b.title),
        subtitle: str(b.subtitle),
        author: str(b.author),
        publisher: str(b.publisher, 100),
        pubdate: str(b.pubdate, 40),
        pubYear: str(b.pubYear, 4),
        isbn: /^\d{13}$/.test(String(b.isbn || '')) ? String(b.isbn) : '',
        // 表紙は https だけ（お試しモードの表紙の絵＝data: は開発中だけ）。
        cover: /^https:\/\//.test(String(b.cover || '')) || (import.meta.env?.DEV && /^data:image\//.test(String(b.cover || ''))) ? String(b.cover) : '',
        pages: Number(b.pages) || 0,
        source: str(b.source, 20),
      }));
    return { ok: true, results };
  } catch (e) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return { ok: false, error: e };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// 端末だけの検索の結果を、サーバーと同じ並べ方に（著者名も整える）。
//   NDL・openBD の「書名 : 副題」は、副題が無いときだけ書名と副題に分ける（行で副題を弱く出せるように）。
export function rankLocalResults(query, results) {
  const list = (results || []).map((b) => ({
    ...b,
    ...(b.subtitle ? {} : splitSubtitle(b.title)),
    author: formatAuthors(b.author || ''),
  }));
  return rankBooks(query, list);
}

// ---------- public API ----------

export async function searchBooks(query) {
  const q = (query || '').trim();
  if (!q) return { ok: true, results: [] };

  // 書名・著者はまずサーバーの検索（楽天の売上順・表紙つき）。失敗・0 件なら下の端末だけの検索へ。
  if (!isISBN(q)) {
    const server = await searchBooksOnServer(q);
    if (server.ok && server.results.length > 0) return { ok: true, results: server.results };
  }

  const cached = getCached(q);
  if (cached) return { ok: true, results: cached, cached: true };

  // ISBN shortcut: openBD first, Google Books fallback.
  if (isISBN(q)) {
    const cleaned = cleanIsbn(q);
    let isbnErr = null;
    try {
      const r = await lookupISBNopenBD(cleaned);
      if (r) {
        const results = [r];
        setCached(q, results);
        return { ok: true, results };
      }
    } catch (e) {
      isbnErr = e;
      console.warn('openBD ISBN lookup failed:', e?.message || e);
    }
    try {
      const r = await lookupISBNGoogle(cleaned);
      if (r) {
        const results = [r];
        setCached(q, results);
        return { ok: true, results };
      }
    } catch (e) {
      isbnErr = e;
      console.warn('Google Books ISBN lookup failed:', e?.message || e);
      if (e?.status === 429) {
        return {
          ok: false,
          error: '検索の利用回数が一時的に上限に達しました。\n5〜10 分後に再度お試しください。',
        };
      }
    }
    // どちらかのソースが「失敗」していたら真の 0 件と断定できない。
    // 空をキャッシュすると 7 日間この ISBN の検索が死ぬ（cache poisoning）。
    if (isbnErr) {
      return { ok: false, error: '検索できませんでした。通信環境を確認して、もう一度お試しください。' };
    }
    setCached(q, []);
    return { ok: true, results: [] };
  }

  // Keyword search: NDL primary.
  let ndlError = null;
  let ndlResults = [];
  try {
    ndlResults = await searchNDL(q);
  } catch (e) {
    ndlError = e;
    console.warn('NDL search failed:', e?.message || e);
  }

  // Enrich NDL hits with openBD covers (best-effort, no error gate).
  let enriched = ndlResults;
  if (ndlResults.length > 0) {
    try {
      const isbns = ndlResults.map((r) => r.isbn).filter(Boolean);
      if (isbns.length > 0) {
        const map = await batchOpenBD(isbns);
        enriched = ndlResults.map((r) => {
          const e = r.isbn ? map[r.isbn] : null;
          if (!e) return r;
          // openBD covers (cover.openbd.jp) are higher quality than the NDL
          // thumbnail fallback baked in by searchNDL — prefer them.
          return {
            ...r,
            cover: e.cover || r.cover,
            author: r.author || e.author,
            publisher: r.publisher || e.publisher,
          };
        });
      }
    } catch (e) {
      console.warn('openBD enrichment failed (non-fatal):', e?.message || e);
    }
  }

  if (enriched.length > 0) {
    const ranked = rankLocalResults(q, enriched);
    setCached(q, ranked);
    return { ok: true, results: ranked };
  }

  // NDL returned nothing — try Google Books as a fallback.
  let googleError = null;
  try {
    const g = rankLocalResults(q, await searchGoogleBooks(q));
    if (g.length > 0) {
      setCached(q, g);
      return { ok: true, results: g };
    }
  } catch (e) {
    googleError = e;
    console.warn('Google Books fallback failed:', e?.message || e);
  }

  // No results from any source. Surface the right error.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      error: 'ネット接続が切れています。再接続後にお試しください。',
    };
  }
  if (ndlError && googleError) {
    if (ndlError.status === 429 || googleError.status === 429) {
      return {
        ok: false,
        error: '検索の利用回数が一時的に上限に達しました。\n5〜10 分後に再度お試しください。',
      };
    }
    return {
      ok: false,
      error: '検索エラーが発生しました。\nネット接続を確認するか、しばらくしてからお試しください。',
    };
  }
  if (googleError?.status === 429) {
    return {
      ok: false,
      error: '検索の利用回数が一時的に上限に達しました。\n5〜10 分後に再度お試しください。',
    };
  }

  // Reached at least one source successfully but got no hits — true empty.
  setCached(q, []);
  return { ok: true, results: [] };
}

// Flat-array convenience for callers that only want best-effort results
// (BookAdvisor "add", learning-plan auto-add). Errors collapse to [].
export async function searchBooksFlat(query) {
  const r = await searchBooks(query);
  return r.ok ? r.results : [];
}

// 詳細検索 (advanced search) — accepts any combination of title / author /
// isbn. AND semantics on the NDL side. ISBN takes the fast openBD path
// when supplied alone (search ボックス と同じ shortcut).
export async function searchBooksAdvanced({ title = '', author = '', isbn = '' }, { signal } = {}) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  const i = cleanIsbn(isbn);

  if (!t && !a && !i) return { ok: true, results: [] };

  // Pure-ISBN path: single API trip via openBD, identical to the keyword-mode
  // ISBN shortcut. Cache key includes the ISBN so it's shared with any prior
  // single-input ISBN search.
  if (i && !t && !a) {
    const cacheKey = `isbn:${i}`;
    const cached = getCached(cacheKey);
    if (cached) return { ok: true, results: cached, cached: true };
    let openbdError = null;
    let googleError = null;
    try {
      const r = await lookupISBNopenBD(i, { signal });
      if (r) {
        const results = [r];
        setCached(cacheKey, results);
        return { ok: true, results };
      }
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      openbdError = e;
      console.warn('openBD ISBN lookup failed:', e?.message || e);
    }
    try {
      const r = await lookupISBNGoogle(i, { signal });
      if (r) {
        const results = [r];
        setCached(cacheKey, results);
        return { ok: true, results };
      }
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      googleError = e;
      console.warn('Google Books ISBN lookup failed:', e?.message || e);
    }
    // どちらかのソースが「失敗」なら真の 0 件と断定できない（片方は未収録でも
    // もう片方が 429/5xx なら本は存在し得る）。空をキャッシュすると、復帰後も
    // 7 日間「該当なし」を返し続ける cache poisoning になる。
    if (openbdError || googleError) {
      return { ok: false, error: '検索できませんでした。通信環境を確認して、もう一度お試しください。' };
    }
    setCached(cacheKey, []);
    return { ok: true, results: [] };
  }

  // NDL with structured params for AND semantics. ISBN narrows the most.
  const cacheKey = `adv:t=${t}|a=${a}|i=${i}`;
  const cached = getCached(cacheKey);
  if (cached) return { ok: true, results: cached, cached: true };

  let ndlError = null;
  let results = [];
  try {
    results = await searchNDLRaw({ title: t, author: a, isbn: i }, { signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw e; // 上層に伝搬
    ndlError = e;
    console.warn('NDL advanced search failed:', e?.message || e);
  }

  // Enrich with openBD covers (best-effort).
  if (results.length > 0) {
    try {
      const isbns = results.map((r) => r.isbn).filter(Boolean);
      if (isbns.length > 0) {
        const map = await batchOpenBD(isbns, { signal });
        results = results.map((r) => {
          const e = r.isbn ? map[r.isbn] : null;
          if (!e) return r;
          return {
            ...r,
            cover: e.cover || r.cover,
            author: r.author || e.author,
            publisher: r.publisher || e.publisher,
          };
        });
      }
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      console.warn('openBD enrichment failed (non-fatal):', e?.message || e);
    }
  }

  // No NDL hits → Google Books with title + author concatenated.
  let googleError = null;
  if (results.length === 0 && (t || a)) {
    try {
      const g = await searchGoogleBooks(`${t} ${a}`.trim(), { signal });
      // Filter manually since Google Books doesn't support strict AND.
      results = g.filter((b) => {
        const titleHit = !t || (b.title || '').toLowerCase().includes(t.toLowerCase());
        const authorHit = !a || (b.author || '').toLowerCase().includes(a.toLowerCase());
        return titleHit && authorHit;
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      googleError = e;
      console.warn('Google Books fallback failed:', e?.message || e);
    }
  }

  if (results.length > 0) {
    setCached(cacheKey, results);
    return { ok: true, results };
  }

  if (ndlError && ndlError.status === 429) {
    return {
      ok: false,
      error: '検索の利用回数が一時的に上限に達しました。\n5〜10 分後に再度お試しください。',
    };
  }
  // 全ソースが「失敗」（真の 0 件ではない）なら通信エラーとして返し、
  // 空結果を 7 日キャッシュしない（ネット復帰後の再検索を殺さない）。
  if ((typeof navigator !== 'undefined' && navigator.onLine === false)
    || ndlError || googleError) {
    return { ok: false, error: '検索できませんでした。通信環境を確認して、もう一度お試しください。' };
  }
  setCached(cacheKey, []);
  return { ok: true, results: [] };
}

// Suggest 3 best-bet results from a result list — used to highlight likely
// matches when a search returns many books. Heuristic: prefer entries that
// have a cover + ISBN + publisher (looks more "complete"), then take the
// first 3 in result order.
export function pickSuggestions(results, limit = 3) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const scored = results.map((r, i) => {
    let score = 0;
    if (r.cover) score += 3;
    if (r.isbn) score += 2;
    if (r.publisher) score += 1;
    if (r.pubYear) score += 1;
    // Older results in the list slightly preferred (NDL ranks roughly
    // by relevance) — penalise long titles by index.
    score -= i * 0.1;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.r);
}

/**
 * 同タイトル+著者の本から複数エディション ISBN を集める。日本書籍は
 * Google Books だけでは網羅できない (定番の和書でも単行本 ISBN しか
 * 載ってない等) ので、**NDL 優先 + Google Books 並列** で取得し、
 * 重複排除して返す。
 *
 * キャッシュ: localStorage に 7 日。Google Books の 1日 1000 リクエスト
 * 制限を温存する目的が大きい。
 *
 * 失敗 (ネット断 / レート制限 / 0 件) 時は空配列を返す。上層は primary
 * ISBN だけで cover 解決を続けられる設計。
 */
const ISBN_CAND_CACHE_KEY = (title, author) =>
  `isbn-candidates:${(title || '').trim()}|${(author || '').trim()}`;
const ISBN_CAND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ISBN_CAND_EMPTY_TTL_MS = 24 * 60 * 60 * 1000; // 本当に 0 件だったときだけ・1 日

// ============================================================
// タイトル/著者の類似度判定 — タイトルが似ているだけの「全く別の本」
// (例: 「営業の本質」 vs 「営業の力」) の ISBN を候補から弾くために、
// fetch した書誌メタデータを正規化して比較する。
// ============================================================

// 正規化: 全角→半角, 括弧/記号/空白除去, lowercase, ローマ数字 (Ⅰ-Ⅻ) 展開
const normalizeTitle = (s) =>
  (s || '')
    .toString()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・()()\[\]【】「」『』:、,.。!?!?\-—‐−~〜:;]/g, '')
    .replace(/[Ⅰ-Ⅻ]/g, (m) => 'i'.repeat(m.charCodeAt(0) - 0x2160 + 1));

const normalizeAuthor = (s) =>
  (s || '')
    .toString()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・,、;:]/g, '');

// `longer` が `shorter` で始まる時、続く部分が「巻数 / 続編」を示すか。
// 「1分で話せ」と「1分で話せ2」を別書誌として扱うため。App.jsx の
// `_suffixIsVolume` と同じロジック (CJK タイトル + 数字接尾 + 巻数語彙)。
function suffixIsVolume(longer, shorter) {
  const tail = longer.slice(shorter.length);
  if (!tail) return false;
  if (/^\d/.test(tail)) return true;
  if (/^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)([^a-z]|$)/.test(tail)) return true;
  if (/^(上|下|前編|後編|続編|完結編|外伝|新章|別巻|超)/.test(tail)) return true;
  if (/^(vol|part|book|chapter|episode)/.test(tail)) return true;
  return false;
}

/**
 * 0.0〜1.0 のタイトル類似度。
 *  - 完全一致: 1.0
 *  - 一方が他方を完全に含む (副題違い等): 包含側の比率
 *  - 続編 (「1分で話せ」「1分で話せ2」): 0 (別書誌扱い)
 *  - それ以外: 0
 *
 * 部分一致 (どちらでも片方を含まない) は意図的に却下。半分一致した
 * 別タイトルの本が候補に紛れる事故を根治するため。
 */
const titleSimilarity = (a, b) => {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const longer = na.length >= nb.length ? na : nb;
    const shorter = na.length >= nb.length ? nb : na;
    // longer = shorter + 巻数表記 のケースを除外 (例: 「1分で話せ2」を
    // 「1分で話せ」の候補にしない)。続編判定は startsWith の時のみ実施。
    if (longer.startsWith(shorter)) {
      if (suffixIsVolume(longer, shorter)) return 0;
      // 「核タイトル＋副題」= 同一書誌として高スコアを返す。
      //   例: 「確率思考の戦略論 USJでも実証された…」と「確率思考の戦略論」
      // これまでは shorter/longer の比率で 0.3 程度に下がり、副題付きで保存
      // した本の ISBN/表紙が永遠に解決できない主因になっていた。
      // 暴発防止: 核タイトルが十分長く(≥6)、続きも副題規模(≥3)の時だけ。
      //   （「営業」(2字)が「営業の魔法」に化けるような短核は比率のまま）
      const tail = longer.slice(shorter.length);
      if (shorter.length >= 6 && tail.length >= 3) return 0.95;
    }
    return shorter.length / longer.length;
  }
  return 0;
};

const TITLE_SIM_THRESHOLD = 0.8;

/**
 * 候補 (NDL/Google Books から取れた書誌) と「ユーザーが追加しようとして
 * いる本」が同じ本かを判定する。タイトル類似度 ≥ 0.8 + 著者厳格チェック。
 *
 * 著者ルール:
 *   - original.author が無ければ author check は skip (信頼性は下がるが代替なし)
 *   - original.author があるのに candidate.author が空 → 不一致扱い (誤マッチ防止)
 *   - 両方ある時は互含 (どちらかが他方を含む)
 *
 * 0.7 → 0.8 に厳格化したのは「営業の本質」「営業の力」のような部分一致で
 * 全く別の本の表紙が紛れ込む事故を防ぐため。
 */
const isSameBook = (candidate, original) => {
  const tSim = titleSimilarity(candidate.title, original.title);
  if (tSim < TITLE_SIM_THRESHOLD) return false;
  // original に author 情報があれば厳格にチェックする
  if (original.author) {
    if (!candidate.author) return false; // 候補に著者が無い → 別の本扱い
    const aA = normalizeAuthor(candidate.author);
    const aO = normalizeAuthor(original.author);
    if (!aA || !aO) return false;
    if (!aA.includes(aO) && !aO.includes(aA)) return false;
  }
  return true;
};

// NDL OpenSearch — 日本書籍に強い。XML レスポンスから書誌メタデータ
// (isbn / title / author) をまとめて抽出する。
// 戻り値 { ok, items }。ok=false は「失敗」（CORS・429・通信断）で、「0 件」とは区別する。
async function ndlCandidateBooks(title, author) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return { ok: true, items: [] };
  const params = [];
  if (t) params.push(`title=${encodeURIComponent(t)}`);
  const qa = firstAuthorForQuery(a); // 共著は先頭著者で絞る
  if (qa) params.push(`creator=${encodeURIComponent(qa)}`);
  params.push('cnt=20');
  const url = `https://ndlsearch.ndl.go.jp/api/opensearch?${params.join('&')}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, items: [] };
    const xml = await r.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return { ok: false, items: [] };
    const items = Array.from(doc.getElementsByTagName('item'));
    const out = [];
    for (const item of items) {
      const isbn = isbnFromNdl(item);
      if (!isbn) continue;
      const titleText = item.getElementsByTagName('title')[0]?.textContent?.trim() || '';
      const authorText = authorFromNdl(item);
      out.push({ isbn, title: titleText, author: authorText });
    }
    return { ok: true, items: out };
  } catch (e) {
    console.warn('[findCandidateBooksFromNDL] failed:', e?.message || e);
    return { ok: false, items: [] };
  }
}
async function findCandidateBooksFromNDL(title, author) {
  return (await ndlCandidateBooks(title, author)).items;
}

// Google Books — 洋書 / NDL に無い和書のフォールバック。
async function googleCandidateBooks(title, author) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return { ok: true, items: [] };
  const parts = [];
  if (t) parts.push(`intitle:${encodeURIComponent(t)}`);
  const qa = firstAuthorForQuery(a); // 共著は先頭著者で絞る
  if (qa) parts.push(`inauthor:${encodeURIComponent(qa)}`);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${parts.join('+')}&maxResults=10&country=JP`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, items: [] };
    const d = await r.json();
    const out = [];
    for (const item of d.items || []) {
      const info = item.volumeInfo || {};
      const ids = info.industryIdentifiers || [];
      for (const id of ids) {
        if ((id.type === 'ISBN_13' || id.type === 'ISBN_10') && id.identifier) {
          out.push({
            isbn: String(id.identifier).replace(/[-\s]/g, ''),
            title: info.title || '',
            author: (info.authors || []).join(', '),
          });
        }
      }
    }
    return { ok: true, items: out };
  } catch (e) {
    console.warn('[findCandidateBooksFromGoogleBooks] failed:', e?.message || e);
    return { ok: false, items: [] };
  }
}
async function findCandidateBooksFromGoogleBooks(title, author) {
  return (await googleCandidateBooks(title, author)).items;
}

/**
 * 📕 Google Books の imageLinks.thumbnail を「検証済みの確実な表紙 URL」として
 * 直接取得する。ISBN ベースのコンストラクト URL（books.google.com/content?vid=…
 * や Amazon の LZZZ パターン）は存在しない本でプレースホルダーを返したり遅い
 * のに対し、volumes API の thumbnail は Google が実体保証している URL なので
 * 実在検証（<img> ロード）なしでそのまま使える。日本語書籍の表紙取得が
 * 「全然取れない」問題への主対策。
 *
 *   1. ISBN があれば `q=isbn:<isbn>` で直引き（最も正確）
 *   2. 取れなければ title+author で intitle/inauthor 検索 → 厳格マッチした
 *      最初の 1 冊の thumbnail
 *
 * 戻り値は https 化した URL（mixed-content 回避）。見つからなければ ''。
 */
export async function findCoverFromGoogleBooks({ title, author, isbn } = {}) {
  const toHttps = (u) => (u ? String(u).replace(/^http:/i, 'https:') : '');
  const thumbOf = (info) => {
    const links = info?.imageLinks || {};
    // thumbnail は ~128px、smallThumbnail は ~80px。大きい方を優先。
    return toHttps(links.thumbnail || links.smallThumbnail || '');
  };

  // ── 1: ISBN 直引き（あれば最優先・最も正確） ─────────────────────────
  const cleanIsbn = isbn ? String(isbn).replace(/[-\s]/g, '') : '';
  if (cleanIsbn) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}&country=JP`,
      );
      if (r.ok) {
        const d = await r.json();
        for (const item of d.items || []) {
          const cover = thumbOf(item.volumeInfo);
          if (cover) return cover;
        }
      }
    } catch (e) {
      console.warn('[findCoverFromGoogleBooks] isbn phase failed:', e?.message || e);
    }
  }

  // ── 2: タイトル + 著者で検索 → 厳格マッチの thumbnail ────────────────
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (t || a) {
    try {
      const parts = [];
      if (t) parts.push(`intitle:${encodeURIComponent(t)}`);
      const qa = firstAuthorForQuery(a); // 共著は先頭著者で絞る（連結だと 0 件）
      if (qa) parts.push(`inauthor:${encodeURIComponent(qa)}`);
      const r = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${parts.join('+')}&maxResults=10&country=JP`,
      );
      if (r.ok) {
        const d = await r.json();
        const original = { title: t, author: a };
        // まず厳格マッチ（同じ本）の中で thumbnail を持つものを探す。
        for (const item of d.items || []) {
          const info = item.volumeInfo || {};
          const cover = thumbOf(info);
          if (!cover) continue;
          if (!t || !a || isSameBook({ title: info.title || '', author: (info.authors || []).join(', ') }, original)) {
            return cover;
          }
        }
      }
    } catch (e) {
      console.warn('[findCoverFromGoogleBooks] title/author phase failed:', e?.message || e);
    }
  }

  // ── 3: 緩いフォールバック ───────────────────────────────────────────
  // ユーザーはこの「正確なタイトル」で本を追加している。厳格マッチに漏れても、
  // タイトル（＋著者）のプレーン検索の上位ヒットはほぼ同一書籍。タイトルが
  // 十分に被っている最初の thumbnail を採用して取りこぼしを大幅に減らす。
  if (t) {
    try {
      const q = `${t}${a ? ` ${a}` : ''}`.trim();
      // langRestrict は付けない（メタデータが ja タグ無しの本を取りこぼすため）。
      const r = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&country=JP`,
      );
      if (r.ok) {
        const d = await r.json();
        // NFKC で全角英数字/記号の揺れも吸収して照合（「営業１年目」vs「営業1年目」）。
        const norm = (s) => (s || '').normalize('NFKC').replace(/[\s　・･,，、.。:：!！?？「」『』\-―ー（）()]/g, '').toLowerCase();
        const tn = norm(t);
        for (const item of d.items || []) {
          const info = item.volumeInfo || {};
          const cover = thumbOf(info);
          if (!cover) continue;
          const cand = norm(info.title);
          // タイトルが相互に部分一致すれば同一書籍とみなす（緩め）。
          if (!tn || cand.includes(tn) || tn.includes(cand)) return cover;
        }
        // ⚠️「タイトル不一致でも最初の thumbnail を無条件採用」する旧・最終手段は
        //    撤去した。同じ著者の別の本（兄弟本）や無関係な本の表紙を掴む誤マッチの
        //    発生源だったため（例: 楠木建『感情と勘定の経営』に『逆・タイムマシン
        //    経営論』の表紙）。誤った表紙より「表紙なし → 手動アップロード」を選ぶ。
      }
    } catch (e) {
      console.warn('[findCoverFromGoogleBooks] loose phase failed:', e?.message || e);
    }
  }

  return '';
}

// 後方互換: 旧 API は string[] を返す。
export async function findIsbnCandidatesFromNDL(title, author) {
  const books = await findCandidateBooksFromNDL(title, author);
  return [...new Set(books.map((b) => b.isbn).filter(Boolean))];
}
export async function findIsbnCandidatesFromGoogleBooks(title, author) {
  const books = await findCandidateBooksFromGoogleBooks(title, author);
  return [...new Set(books.map((b) => b.isbn).filter(Boolean))];
}

/**
 * 厳格化版: NDL + Google Books から書誌メタデータを並列取得 → タイトル/著者
 * の類似度フィルタを通したものだけ {isbn, title, author} 配列で返す。
 * 「タイトルが似ているだけの全く別の本」の ISBN は除外される。
 */
export async function findIsbnCandidatesWithMetadata(title, author) {
  return (await collectIsbnCandidates(title, author)).filtered;
}

// 戻り値 { filtered, hadError }。hadError = NDL か Google のどちらかが「失敗」した
// （0 件と断定できない → 空の結果をキャッシュしてはいけない）。
async function collectIsbnCandidates(title, author) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return { filtered: [], hadError: false };
  const [ndlR, googleR] = await Promise.allSettled([
    ndlCandidateBooks(t, a),
    googleCandidateBooks(t, a),
  ]);
  const ndl = ndlR.status === 'fulfilled' ? ndlR.value.items : [];
  const google = googleR.status === 'fulfilled' ? googleR.value.items : [];
  const hadError = !(ndlR.status === 'fulfilled' && ndlR.value.ok) || !(googleR.status === 'fulfilled' && googleR.value.ok);
  const allCandidates = [...ndl, ...google];

  // タイトル + 著者でフィルタ。NDL を優先 (先頭) し、同 ISBN は重複排除。
  const original = { title: t, author: a };
  const seen = new Set();
  const filtered = [];
  for (const cand of allCandidates) {
    if (!cand.isbn) continue;
    if (seen.has(cand.isbn)) continue;
    seen.add(cand.isbn);
    if (!t || !a || isSameBook(cand, original) || (!cand.title && cand.author)) {
      // タイトル/著者が両方与えられていれば厳格、片方しかなければ通す。
      // (片方しかない検索条件の時は受け取り側で判断)
      filtered.push(cand);
    }
  }

  return { filtered, hadError };
}

// 統合: 厳格マッチ後の ISBN だけを返す (旧 API、後方互換用)。
export async function findIsbnCandidates(title, author) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return [];

  // localStorage cache key を v3 にバンプ (閾値 0.8 + 上限 3 件 + 著者厳格化)
  // v4: 副題付きタイトルの類似度判定を緩和（核タイトル＋副題＝同一書誌）。
  // v5: 共著の著者クエリを先頭著者に修正（連結文字列だと NDL/Google が 0 件で
  //     ISBN が取れず空配列がキャッシュされていた）。旧キャッシュを捨てて再解決。
  // v6: 失敗（CORS・429・通信断）を「0 件」として 7 日キャッシュしていた（取り込み 20 冊を
  //     同時に解決して Google が 429 → 20 冊とも 7 日間 ISBN なし）。失敗は覚えず、本当に 0 件の
  //     ときだけ 1 日覚える。旧キャッシュ（v5 の空）は捨てる（2026-09-30）。
  const cacheKey = `${ISBN_CAND_CACHE_KEY(t, a)}:v6`;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ttl = typeof parsed?.ttl === 'number' ? parsed.ttl : ISBN_CAND_TTL_MS;
        if (parsed && Date.now() - parsed.t < ttl && Array.isArray(parsed.v)) {
          return parsed.v;
        }
      }
    }
  } catch { /* ignore */ }

  const { filtered, hadError } = await collectIsbnCandidates(t, a);
  // 誤マッチを最小化するため候補を最大 3 件に制限。多すぎると tryCoverForIsbn
  // のループで「タイトルが似ているだけの違う本」の表紙を採用するリスクが上がる。
  const isbns = filtered.map((c) => c.isbn).slice(0, 3);

  const ttl = isbns.length > 0 ? ISBN_CAND_TTL_MS : (hadError ? 0 : ISBN_CAND_EMPTY_TTL_MS);
  if (ttl > 0) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: isbns, ttl }));
      }
    } catch { /* ignore */ }
  }
  return isbns;
}

// ISBN-only lookup used by BookSearchModal when a clean ISBN is typed.
// Returns one normalized book or null.
export async function lookupISBN(isbn) {
  const cleaned = cleanIsbn(isbn);
  if (!/^\d{10,13}$/.test(cleaned)) return null;
  try {
    const r = await lookupISBNopenBD(cleaned);
    if (r) return r;
  } catch (e) {
    console.warn('lookupISBN openBD failed:', e?.message || e);
  }
  try {
    return await lookupISBNGoogle(cleaned);
  } catch (e) {
    console.warn('lookupISBN Google Books failed:', e?.message || e);
    return null;
  }
}
