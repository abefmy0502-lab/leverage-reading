// 📖 「この本について」（本の紹介文と目次）を取ってきて、端末に控える（2026-10-02）。
//
// 中身はサーバーの /api/cover?info=1（api/_bookInfo.js）＝出版社・書店が公開している紹介文と目次だけ。
// AI は使わない（無料プランも同じ・トークンなし）。見つからない本は何も出さない（作らない）。
//
// 控え: 本の列は増やさず（SQL 不要）、ISBN（無ければ書名＋著者）ごとに、メモリと localStorage に置く。
//   見つかった本は 30 日・見つからなかった本は 1 日。通信に失敗したときは覚えない（次に開いたときに取り直す）。
// 読書計画シートは、この紹介文と目次を材料に「この本の概要」と「重点的に読む箇所」を書く（bookInfoForPrompt）。

import { apiUrl } from './apiUrl';

const LS_PREFIX = 'orime.bookInfo.v1:';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;

// 画面に出す取得元の名前（正直に、どこの文かを添える）。
export const BOOK_INFO_SOURCE_LABELS = {
  openbd: '出版社の内容紹介',
  rakuten: '楽天ブックスの商品説明',
  google: 'Google ブックスの紹介',
};

const mem = new Map();
const inflight = new Map();

function normIsbn(s) {
  const v = String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return /^(?:\d{9}[\dX]|\d{13})$/.test(v) ? v : '';
}

/** 控えの鍵（ISBN があれば ISBN、無ければ書名＋著者）。本が分からなければ ''。 */
export function bookInfoKey(book) {
  const isbn = normIsbn(book?.isbn);
  if (isbn) return `i:${isbn}`;
  const t = String(book?.title || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  if (!t) return '';
  const a = String(book?.author || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  return `t:${t.slice(0, 100)}|${a.slice(0, 60)}`;
}

const str = (v, max) => [...String(v ?? '')].slice(0, max).join('');

/**
 * 紹介文の、数字と日本語の間の半角の空き（「の 3 つ」「100 年」）を詰める。空きがあると、そこで行が折れて
 * 「の 3 ／つ」のように数と助数詞が別の行に分かれる（2026-10-02 ui-critic）。英字の語の間の空きは残す。
 * 見出しの区切りの空き（「序章 100年」「第1部 2つの…」＝章・部・節・編・巻・話の後ろ）は残す。
 * 目次の行には使わない（目次は元の空きのまま・AI にもそのまま渡す）。
 */
export function tidyJaSpacing(s) {
  return String(s ?? '')
    .replace(/(\d)[ \u00a0]+(?=[^\x00-\x7F])/g, '$1')
    .replace(/([^\x00-\x7F章部節編巻話])[ \u00a0]+(?=\d)/g, '$1');
}

/** サーバーの返事を、画面と AI に渡せる形にそろえる（型と長さを確かめる）。 */
export function normalizeBookInfo(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const toc = (Array.isArray(r.toc) ? r.toc : [])
    .map((l) => str(l, 80).trim())
    .filter(Boolean)
    .slice(0, 40);
  const source = Object.prototype.hasOwnProperty.call(BOOK_INFO_SOURCE_LABELS, r.source) ? r.source : '';
  const tocSource = Object.prototype.hasOwnProperty.call(BOOK_INFO_SOURCE_LABELS, r.tocSource) ? r.tocSource : '';
  const pages = Number.isFinite(r.pages) && r.pages > 0 && r.pages < 20000 ? Math.round(r.pages) : 0;
  const pubdate = /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(r.pubdate || '')) ? String(r.pubdate) : '';
  const description = source ? tidyJaSpacing(str(r.description, 1000)).trim() : '';
  return { description, toc, source, tocSource: toc.length ? tocSource : '', pages, pubdate };
}

/** 見せるものがあるか（紹介文か目次のどちらか）。 */
export function hasBookInfo(info) {
  return !!(info && (info.description || (info.toc && info.toc.length)));
}

function readStore(key) {
  try {
    const raw = globalThis.localStorage?.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    const v = JSON.parse(raw);
    if (!v || typeof v.until !== 'number' || Date.now() > v.until) return undefined;
    return v.info ? normalizeBookInfo(v.info) : null;
  } catch {
    return undefined;
  }
}
function writeStore(key, info) {
  try {
    const until = Date.now() + (hasBookInfo(info) ? HIT_TTL_MS : MISS_TTL_MS);
    globalThis.localStorage?.setItem(LS_PREFIX + key, JSON.stringify({ until, info: hasBookInfo(info) ? info : null }));
  } catch { /* 書けない端末では毎回取りに行く */ }
}

/**
 * 控えだけを見る（同期）。undefined＝まだ知らない／null＝見つからなかった本／{…}＝紹介文・目次。
 */
export function peekBookInfo(book) {
  const key = bookInfoKey(book);
  if (!key) return null;
  if (mem.has(key)) return mem.get(key);
  const stored = readStore(key);
  if (stored !== undefined) mem.set(key, stored);
  return stored;
}

/**
 * 紹介文・目次を取ってくる（控えがあれば控え）。見つからなければ null。通信に失敗したら null（覚えない）。
 */
export async function loadBookInfo(book, { fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const key = bookInfoKey(book);
  if (!key) return null;
  const known = peekBookInfo(book);
  if (known !== undefined) return known;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const params = new URLSearchParams({ info: '1' });
    const isbn = normIsbn(book?.isbn);
    if (isbn) params.set('isbn', isbn);
    if (book?.title) params.set('title', String(book.title).slice(0, 200));
    if (book?.author) params.set('author', String(book.author).slice(0, 200));
    try {
      const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
      const r = await fetchImpl(apiUrl(`/api/cover?${params.toString()}`), signal ? { signal } : undefined);
      if (!r || !r.ok) return null;
      const info = normalizeBookInfo(await r.json());
      const value = hasBookInfo(info) ? info : null;
      // サーバーが「確かめられなかった」（no-store）ときは覚えない。
      const cc = (r.headers && typeof r.headers.get === 'function' && r.headers.get('cache-control')) || '';
      if (value || !/no-store/i.test(cc)) {
        mem.set(key, value);
        writeStore(key, value);
      }
      return value;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** テスト用: 控えを空にする。 */
export function _resetBookInfoMemory() {
  mem.clear();
  inflight.clear();
}

/** 「2016年10月」・「400 ページ」などの添え書き（取得元の名前の後ろに）。 */
export function bookInfoMetaLine(info) {
  if (!info) return '';
  const parts = [];
  const label = BOOK_INFO_SOURCE_LABELS[info.source] || BOOK_INFO_SOURCE_LABELS[info.tocSource] || '';
  if (label) parts.push(`${label}より`);
  if (info.pages) parts.push(`${info.pages} ページ`);
  const m = String(info.pubdate || '').match(/^(\d{4})(?:-(\d{2}))?/);
  if (m) parts.push(m[2] ? `${m[1]}年${Number(m[2])}月` : `${m[1]}年`);
  return parts.join(' · ');
}

/**
 * 読書計画シートに渡す形（AI に送る前に呼び出し側で sanitizeForPrompt をかける）。
 * 紹介文は 600 字・目次は 30 行（1 行 60 字）まで＝入力が増えすぎないように（docs/ai-routing.md §3）。
 */
export const PLAN_ABOUT_MAX = 600;
export const PLAN_TOC_MAX_LINES = 30;
export function bookInfoForPrompt(info) {
  if (!hasBookInfo(info)) return { about: '', aboutSource: '', toc: [] };
  const about = info.description ? str(info.description, PLAN_ABOUT_MAX) : '';
  return {
    about,
    aboutSource: about ? (BOOK_INFO_SOURCE_LABELS[info.source] || '') : '',
    toc: (info.toc || []).slice(0, PLAN_TOC_MAX_LINES).map((l) => str(l, 60)),
  };
}
