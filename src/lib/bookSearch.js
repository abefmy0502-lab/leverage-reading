// Book search — NDL-first to avoid Google Books rate limits.
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

const CACHE_KEY = 'bookSearchCache';
// 7 days. ISBN は不変で、検索クエリも頻繁には変わらないため、長めに置いて
// 体感速度を上げる。容量制御は CACHE_MAX_ENTRIES が担当。
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
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
  const creators = Array.from(item.getElementsByTagName('*'))
    .filter((el) => el.localName === 'creator')
    .map((el) => (el.textContent || '').trim())
    .filter(Boolean);
  if (creators.length > 0) return creators.join(', ');
  const authorEl = item.getElementsByTagName('author')[0];
  return (authorEl?.textContent || '').split(',')[0].trim();
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
      author: item.summary?.author || '',
      publisher: item.summary?.publisher || '',
      cover: item.summary?.cover || '',
    };
  });
  return map;
}

async function lookupISBNopenBD(isbn) {
  const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
  if (!r.ok) return null;
  const d = await r.json();
  if (d?.[0]?.summary) {
    const s = d[0].summary;
    return {
      title: s.title || '',
      author: s.author || '',
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
        author: (v.authors || []).join(', '),
        publisher: v.publisher || '',
        pubYear: pubMatch ? pubMatch[1] : '',
        cover: v.imageLinks?.thumbnail || '',
        pages: v.pageCount || 0,
        isbn,
      };
    })
    .filter((b) => b.title);
}

async function lookupISBNGoogle(isbn) {
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  if (!r.ok) return null;
  const d = await r.json();
  const v = d.items?.[0]?.volumeInfo;
  if (!v) return null;
  return {
    title: v.title || '',
    author: (v.authors || []).join(', '),
    publisher: v.publisher || '',
    cover: v.imageLinks?.thumbnail || '',
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

// ---------- public API ----------

export async function searchBooks(query) {
  const q = (query || '').trim();
  if (!q) return { ok: true, results: [] };

  const cached = getCached(q);
  if (cached) return { ok: true, results: cached, cached: true };

  // ISBN shortcut: openBD first, Google Books fallback.
  if (isISBN(q)) {
    const cleaned = cleanIsbn(q);
    try {
      const r = await lookupISBNopenBD(cleaned);
      if (r) {
        const results = [r];
        setCached(q, results);
        return { ok: true, results };
      }
    } catch (e) {
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
      console.warn('Google Books ISBN lookup failed:', e?.message || e);
      if (e?.status === 429) {
        return {
          ok: false,
          error: '検索の利用回数が一時的に上限に達しました。\n5〜10 分後に再度お試しください。',
        };
      }
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
    setCached(q, enriched);
    return { ok: true, results: enriched };
  }

  // NDL returned nothing — try Google Books as a fallback.
  let googleError = null;
  try {
    const g = await searchGoogleBooks(q);
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
    try {
      const r = await lookupISBNopenBD(i);
      if (r) {
        const results = [r];
        setCached(cacheKey, results);
        return { ok: true, results };
      }
    } catch (e) {
      console.warn('openBD ISBN lookup failed:', e?.message || e);
    }
    try {
      const r = await lookupISBNGoogle(i);
      if (r) {
        const results = [r];
        setCached(cacheKey, results);
        return { ok: true, results };
      }
    } catch (e) {
      console.warn('Google Books ISBN lookup failed:', e?.message || e);
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

/**
 * 0.0〜1.0 のタイトル類似度。
 *  - 完全一致: 1.0
 *  - 一方が他方を完全に含む (副題違い等): 包含側の比率
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
    return shorter.length / longer.length;
  }
  return 0;
};

const TITLE_SIM_THRESHOLD = 0.7;

/**
 * 候補 (NDL/Google Books から取れた書誌) と「ユーザーが追加しようとして
 * いる本」が同じ本かを判定する。タイトル類似度 ≥ 0.7 + 著者の互含 (両方
 * 与えられている場合のみ) を要求。
 */
const isSameBook = (candidate, original) => {
  const tSim = titleSimilarity(candidate.title, original.title);
  if (tSim < TITLE_SIM_THRESHOLD) return false;
  if (candidate.author && original.author) {
    const aA = normalizeAuthor(candidate.author);
    const aO = normalizeAuthor(original.author);
    if (aA && aO && !aA.includes(aO) && !aO.includes(aA)) return false;
  }
  return true;
};

// NDL OpenSearch — 日本書籍に強い。XML レスポンスから書誌メタデータ
// (isbn / title / author) をまとめて抽出する。
async function findCandidateBooksFromNDL(title, author) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return [];
  const params = [];
  if (t) params.push(`title=${encodeURIComponent(t)}`);
  if (a) params.push(`creator=${encodeURIComponent(a)}`);
  params.push('cnt=20');
  const url = `https://ndlsearch.ndl.go.jp/api/opensearch?${params.join('&')}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const xml = await r.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return [];
    const items = Array.from(doc.getElementsByTagName('item'));
    const out = [];
    for (const item of items) {
      const isbn = isbnFromNdl(item);
      if (!isbn) continue;
      const titleText = item.getElementsByTagName('title')[0]?.textContent?.trim() || '';
      const authorText = authorFromNdl(item);
      out.push({ isbn, title: titleText, author: authorText });
    }
    return out;
  } catch (e) {
    console.warn('[findCandidateBooksFromNDL] failed:', e?.message || e);
    return [];
  }
}

// Google Books — 洋書 / NDL に無い和書のフォールバック。
async function findCandidateBooksFromGoogleBooks(title, author) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return [];
  const parts = [];
  if (t) parts.push(`intitle:${encodeURIComponent(t)}`);
  if (a) parts.push(`inauthor:${encodeURIComponent(a)}`);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${parts.join('+')}&maxResults=10&country=JP`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
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
    return out;
  } catch (e) {
    console.warn('[findCandidateBooksFromGoogleBooks] failed:', e?.message || e);
    return [];
  }
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
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return [];
  const [ndlR, googleR] = await Promise.allSettled([
    findCandidateBooksFromNDL(t, a),
    findCandidateBooksFromGoogleBooks(t, a),
  ]);
  const ndl = ndlR.status === 'fulfilled' ? ndlR.value : [];
  const google = googleR.status === 'fulfilled' ? googleR.value : [];
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

  if (typeof console !== 'undefined') {
    console.log('[isbn-candidates] all:', allCandidates.length, 'filtered:', filtered.length);
  }
  return filtered;
}

// 統合: 厳格マッチ後の ISBN だけを返す (旧 API、後方互換用)。
export async function findIsbnCandidates(title, author) {
  const t = (title || '').trim();
  const a = (author || '').trim();
  if (!t && !a) return [];

  // localStorage cache。v4 で厳格マッチ導入 → 旧キャッシュは無視できるよう
  // バージョン suffix を付ける。
  const cacheKey = `${ISBN_CAND_CACHE_KEY(t, a)}:v2`;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Date.now() - parsed.t < ISBN_CAND_TTL_MS && Array.isArray(parsed.v)) {
          return parsed.v;
        }
      }
    }
  } catch { /* ignore */ }

  const filtered = await findIsbnCandidatesWithMetadata(t, a);
  const isbns = filtered.map((c) => c.isbn);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: isbns }));
    }
  } catch { /* ignore */ }
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
