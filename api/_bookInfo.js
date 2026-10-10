// 📖 「この本について」（/api/cover?info=1）— 本の紹介文と目次を、公開の書誌から集める（2026-10-02）。
//
// オーナー（2026-10-02）:「読書計画シートを書く前にその本のことを調べてくれる機能はなくなったの？
//   それがないと読書前に概要を掴めないし、計画も立てられなくない？」
//   → 以前の「AIで本を解析する」（2026-09-27 に廃止）は AI が本の中身を思い出して書いていた＝作り話が混じる。
//     今度は AI を使わず、出版社・書店が公開している紹介文と目次だけを集める（無料プランも使える・トークンなし）。
//
// 取得元（鍵の要らないものから）:
//   - openBD（api.openbd.jp/v1/get）: ONIX の CollateralDetail.TextContent
//       TextType 03＝内容紹介（長い）/ 02＝短い説明 / 04＝目次。出版社が登録した文（いちばん信頼できる）
//       DescriptiveDetail.Extent（ページ数）・summary.pubdate（発売日）
//   - 楽天ブックス（BooksBook/Search）: itemCaption（商品説明。「【目次】」を含むことがある）・salesDate
//       鍵（RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY）と Referer は api/cover.js と同じ（rakutenGet を渡してもらう）
//   - Google Books（isbn:）: volumeInfo.description・pageCount・publishedDate（紹介文がほかに無いときだけ引く）
//
// 決まり:
//   - 文は HTML を落とし、空白をそろえ、長さを切る（紹介 800 字・目次 40 行×80 字）。同じ文は 1 つに
//   - ISBN で引いた結果でも、書名が分かっていれば、取得元の書名と照らして別の本なら捨てる（誤った ISBN で
//     別の本の紹介を見せない）。ISBN が無いときは楽天の書名検索で「書名がはっきり一致し著者も一致する本」だけ
//   - 何も見つからなければ空（description: ''・toc: []）を返す。作らない
// ファイル名が _ で始まるので Vercel のルートにはならない（関数の数を増やさない）。テストは api/_bookInfo.test.js。

import { toIsbn13, createCooldown, FETCH_TIMEOUT_MS } from './_coverSources.js';
import { strongTitleMatch, authorMatches, coreOfTitle, flatTitle } from './_bookVerify.js';
import { parseGenreIds } from './_rakutenGenre.js';

export const INFO_DESCRIPTION_MAX = 800;
export const INFO_TOC_MAX_LINES = 40;
export const INFO_TOC_LINE_MAX = 80;

// ─── 文を整える ───────────────────────────────────────────────────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k.startsWith('#x')) { const n = parseInt(k.slice(2), 16); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    if (k.startsWith('#')) { const n = parseInt(k.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENTITIES[k] ?? m;
  });
}

/** HTML を落として、段落の改行だけを残す（行の中の空白は 1 つに・空行は 1 つまで）。 */
export function cleanText(raw) {
  let s = String(raw ?? '');
  if (!s) return '';
  s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  // 制御文字（改行・タブ以外）を落とす
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‍﻿]/g, '');
  s = s.replace(/\r\n?/g, '\n');
  const lines = s.split('\n').map((l) => l.replace(/[ \t　]+/g, ' ').trim());
  const out = [];
  for (const l of lines) {
    if (!l) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    out.push(l);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n').trim();
}

/** 紹介文を max 字までに。文の終わり（。！？）で切れるならそこで切り、切ったら … を付ける。 */
export function clampDescription(text, max = INFO_DESCRIPTION_MAX) {
  const t = String(text || '').trim();
  const chars = [...t];
  if (chars.length <= max) return t;
  const head = chars.slice(0, max).join('');
  const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'));
  if (cut >= max * 0.6) return `${head.slice(0, cut + 1)}…`;
  return `${head.trimEnd()}…`;
}

const TOC_SPLIT_SLASH = /\s*／\s*/;
const TOC_SPLIT_INLINE = /\s+(?=(?:序章|終章|はじめに|おわりに|まえがき|あとがき|第\s*[0-9０-９一二三四五六七八九十百]+\s*[章部節講話回]|Chapter\s*\d+|PART\s*\d+|Part\s*\d+|[0-9０-９]{1,2}\s*[章.．]\s))/;

const HEADING_MARK = /(?:^|\s)(?:序章|終章|はじめに|おわりに|まえがき|あとがき|第\s*[0-9０-９一二三四五六七八九十百]+\s*[章部節講話回])/g;
const headingMarks = (l) => (l.match(HEADING_MARK) || []).length;

/** 目次の文を行に分ける（改行・「／」・「第N章」の前の空白）。番号だけの行・同じ行は落とす。 */
export function parseToc(raw) {
  const text = cleanText(raw);
  if (!text) return [];
  let lines = text.split('\n');
  // 1 行に詰まっている目次（「序章 … ／第1章 …」）は区切りで割る
  //（全角の「／」はいつも区切り。「第N章」の前の空白は、長い行か見出しが 2 つ以上ある行のときだけ区切りとみなす）
  lines = lines
    .flatMap((l) => l.split(TOC_SPLIT_SLASH))
    .flatMap((l) => (l.length > 40 || headingMarks(l) >= 2 ? l.split(TOC_SPLIT_INLINE) : [l]));
  const seen = new Set();
  const out = [];
  for (let l of lines) {
    l = l.replace(/^[・･●○■□◆◇▼▽\-–—*＊]\s*/, '').trim();
    if (!l) continue;
    if (/^(目次|もくじ|contents)[:：]?$/i.test(l)) continue;
    if ([...l].length > INFO_TOC_LINE_MAX) l = `${[...l].slice(0, INFO_TOC_LINE_MAX - 1).join('')}…`;
    const key = l.normalize('NFKC').replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length >= INFO_TOC_MAX_LINES) break;
  }
  // 1 行だけで、見出しらしい区切りの無い長文は目次とみなさない（紹介文の誤登録）
  if (out.length === 1 && [...out[0]].length > 60) return [];
  return out;
}

// ─── openBD ────────────────────────────────────────────────────────────
/** openBD の 1 冊分（配列の要素）から { title, description, toc, pages, pubdate }。 */
export function parseOpenbdRecord(rec) {
  const out = { title: '', description: '', toc: [], pages: 0, pubdate: '' };
  if (!rec || typeof rec !== 'object') return out;
  const s = rec.summary || {};
  out.title = String(s.title || '').trim();
  out.pubdate = normPubdate(s.pubdate);
  const onix = rec.onix || {};
  const texts = Array.isArray(onix?.CollateralDetail?.TextContent) ? onix.CollateralDetail.TextContent : [];
  const byType = (t) => texts.filter((x) => x && String(x.TextType) === t).map((x) => cleanText(x.Text)).filter(Boolean);
  const long = byType('03')[0] || '';
  const short = byType('02')[0] || '';
  // 長い内容紹介を先に。短い説明が長い紹介に含まれていれば長い方だけ、別の文なら短い方を頭に足さない（長い方で足りる）
  out.description = long || short;
  const tocRaw = byType('04')[0] || '';
  out.toc = parseToc(tocRaw);
  const extents = onix?.DescriptiveDetail?.Extent;
  for (const e of Array.isArray(extents) ? extents : []) {
    const n = parseInt(String(e?.ExtentValue || ''), 10);
    if (Number.isFinite(n) && n > 0 && n < 20000 && (!e.ExtentType || ['00', '11'].includes(String(e.ExtentType)))) { out.pages = n; break; }
  }
  return out;
}

async function openbdInfo(i13, { fetchImpl, timeoutMs }) {
  const r = await fetchImpl(`https://api.openbd.jp/v1/get?isbn=${i13}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) return { answered: false, status: r.status };
  const d = await r.json();
  const rec = Array.isArray(d) ? d[0] : null;
  return { answered: true, status: r.status, ...parseOpenbdRecord(rec) };
}

// 書名検索に渡す書名（副題の前まで・英語の書名は語の間の空白で切らない・大文字小文字はそのまま）。
function queryTitle(t) {
  const s = String(t || '').trim().slice(0, 200);
  if (/^[\x20-\x7E]+$/.test(s)) return s.split(/\s*[:|~—–]\s*|\s+-\s+/)[0].trim() || s;
  return s.split(/[\s\u3000:：|｜〜~－—–]/)[0] || s;
}

// ─── 楽天ブックス ─────────────────────────────────────────────────────
// 楽天の商品説明（itemCaption）。「BOOK」データベースの形（【内容情報】…【目次】…【著者情報】…）なら
// 内容と目次に分け、著者情報は落とす。目次の見出しが無ければ全体を紹介文に。
export function parseRakutenCaption(raw) {
  const text = cleanText(raw);
  if (!text) return { description: '', toc: [] };
  const sections = [];
  const re = /【([^】]{1,12})】(?:（[^）]{0,30}）)?/g;
  let m;
  const marks = [];
  while ((m = re.exec(text)) !== null) marks.push({ name: m[1], start: m.index, end: re.lastIndex });
  if (marks.length === 0) return { description: text, toc: [] };
  const lead = text.slice(0, marks[0].start).trim();
  if (lead) sections.push({ name: '内容', body: lead });
  marks.forEach((mk, i) => {
    const body = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : text.length).trim();
    sections.push({ name: mk.name, body });
  });
  const pick = (re2) => sections.filter((x) => re2.test(x.name)).map((x) => x.body).filter(Boolean);
  const toc = parseToc(pick(/目次/).join('\n'));
  const desc = pick(/^(内容|内容情報|内容紹介|商品説明|あらすじ)$/).join('\n');
  // 見出しはあるが内容の見出しが無い（【送料無料】など）ときは、著者・目次以外をつなぐ
  const fallback = sections.filter((x) => !/目次|著者|訳者|監修|プロフィール/.test(x.name)).map((x) => x.body).filter(Boolean).join('\n');
  return { description: (desc || fallback).trim(), toc };
}

function rakutenSalesDate(s) {
  const m = String(s || '').match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
  if (!m) return '';
  const mm = String(m[2]).padStart(2, '0');
  return m[3] ? `${m[1]}-${mm}-${String(m[3]).padStart(2, '0')}` : `${m[1]}-${mm}`;
}

async function rakutenInfo({ i13, title, author }, { rakutenGet, env }) {
  const appId = String(env.RAKUTEN_APPLICATION_ID || '').trim();
  const accessKey = String(env.RAKUTEN_ACCESS_KEY || '').trim();
  if (!rakutenGet || !appId || !accessKey) return { answered: false, skipped: true };
  const referer = String(env.RAKUTEN_APP_URL || '').trim();
  const params = new URLSearchParams({
    format: 'json', applicationId: appId, accessKey, hits: i13 ? '3' : '10', outOfStockFlag: '1',
    elements: 'title,subTitle,author,isbn,itemCaption,salesDate,booksGenreId',
  });
  if (i13) params.set('isbn', i13);
  else {
    params.set('title', queryTitle(title));
    const first = String(author || '').split(/[/／、,，;；&＆]/)[0].trim();
    if (first) params.set('author', first);
  }
  const resp = await rakutenGet(`https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404?${params.toString()}`, referer);
  if (!resp || resp.status < 200 || resp.status >= 300) return { answered: false, status: resp?.status || 0 };
  let data;
  try { data = JSON.parse(resp.body); } catch { return { answered: false, status: resp.status }; }
  const items = (Array.isArray(data?.Items) ? data.Items : []).map((x) => (x && x.Item ? x.Item : x)).filter((x) => x && typeof x === 'object');
  let it = null;
  if (i13) it = items[0] || null;
  else {
    it = items.find((x) => {
      const full = [x.title, x.subTitle].filter(Boolean).join(' ');
      return (strongTitleMatch(title, full) || strongTitleMatch(title, x.title || ''))
        && (!String(author || '').trim() || authorMatches(author, [x.author || '']));
    }) || null;
  }
  if (!it) return { answered: true, status: resp.status, title: '', description: '', toc: [] };
  const cap = parseRakutenCaption(it.itemCaption);
  return {
    answered: true,
    status: resp.status,
    title: [it.title, it.subTitle].filter(Boolean).join(' '),
    isbn: toIsbn13(it.isbn),
    description: cap.description,
    toc: cap.toc,
    pubdate: rakutenSalesDate(it.salesDate),
    genreIds: parseGenreIds(it.booksGenreId),
  };
}

// ─── Google Books ─────────────────────────────────────────────────────
export function parseGoogleVolume(v) {
  const vi = v?.volumeInfo || v || {};
  return {
    title: [vi.title, vi.subtitle].filter(Boolean).join(' '),
    description: cleanText(vi.description),
    pages: Number.isFinite(vi.pageCount) && vi.pageCount > 0 ? vi.pageCount : 0,
    pubdate: normPubdate(vi.publishedDate),
  };
}

const googleCooldown = createCooldown();
async function googleInfo(i13, { fetchImpl, env, timeoutMs }) {
  if (googleCooldown.blocked()) return { answered: false, status: 0 };
  const key = String(env.GOOGLE_BOOKS_API_KEY || '').trim();
  const r = await fetchImpl(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${i13}&maxResults=1&country=JP${key ? `&key=${encodeURIComponent(key)}` : ''}`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  googleCooldown.hit(r.status, { hasKey: !!key });
  if (!r.ok) return { answered: false, status: r.status };
  const d = await r.json();
  const v = Array.isArray(d?.items) ? d.items[0] : null;
  return { answered: true, status: r.status, ...(v ? parseGoogleVolume(v) : { title: '', description: '', pages: 0, pubdate: '' }) };
}

// ─── まとめ ───────────────────────────────────────────────────────────
export function normPubdate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{4})-?(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  m = t.match(/^(\d{4})$/);
  return m ? m[1] : '';
}

/** 取得元の書名が、求めた書名と同じ本か（書名が分からないときは照らせないので true）。 */
export function sameBookTitle(want, got) {
  if (!String(want || '').trim() || !String(got || '').trim()) return true;
  if (strongTitleMatch(want, got)) return true;
  const cw = coreOfTitle(want);
  const cg = coreOfTitle(got);
  if (cw.length >= 2 && cg.length >= 2 && (cw === cg || flatTitle(got).startsWith(cw) || flatTitle(want).startsWith(cg))) return true;
  return false;
}

// a が b と同じか、b の一部か（紹介文が目次の文そのもの・その切れ端か）。
const textWithin = (a, b) => {
  const fa = String(a || '').normalize('NFKC').replace(/\s+/g, '');
  const fb = String(b || '').normalize('NFKC').replace(/\s+/g, '');
  return !!fa && !!fb && fb.includes(fa);
};

/**
 * 紹介文・目次を集める。戻り値:
 *   { description, toc: string[], source: 'openbd'|'rakuten'|'google'|'', tocSource, pages, pubdate, isbn, genreIds, answered }
 *   genreIds ＝ 楽天ブックスのジャンル ID（本の分野を決める手がかり・2026-10-11）
 *   answered ＝ どれかの取得元が正常に答えた（0 件でも）。false なら「確かめられなかった」＝覚えない。
 */
export async function fetchBookInfo({ isbn = '', title = '', author = '' } = {}, deps = {}) {
  const {
    fetchImpl = globalThis.fetch,
    rakutenGet = null,
    env = (typeof process !== 'undefined' && process.env) || {},
    timeoutMs = FETCH_TIMEOUT_MS,
  } = deps;
  const out = { description: '', toc: [], source: '', tocSource: '', pages: 0, pubdate: '', isbn: '', genreIds: [], answered: false };
  let i13 = toIsbn13(isbn);
  const safe = (p) => p.catch(() => ({ answered: false }));

  // ISBN が無ければ、楽天の書名検索で本を決める（はっきり一致する本だけ）。
  let rk = null;
  if (!i13) {
    if (!String(title || '').trim()) return out;
    rk = await safe(rakutenInfo({ i13: '', title, author }, { rakutenGet, env }));
    if (rk.answered) out.answered = true;
    if (rk.isbn) i13 = rk.isbn;
    if (!i13 && !(rk.description || (rk.toc || []).length)) return out;
  }

  const [ob, rk2] = await Promise.all([
    i13 ? safe(openbdInfo(i13, { fetchImpl, timeoutMs })) : Promise.resolve({ answered: false }),
    rk ? Promise.resolve(rk) : safe(rakutenInfo({ i13, title, author }, { rakutenGet, env })),
  ]);
  rk = rk2;
  if (ob.answered || rk.answered) out.answered = true;
  const okOb = ob.answered && sameBookTitle(title, ob.title);
  const okRk = rk.answered && sameBookTitle(title, rk.title);

  if (okOb && ob.description) { out.description = ob.description; out.source = 'openbd'; }
  else if (okRk && rk.description) { out.description = rk.description; out.source = 'rakuten'; }
  if (okOb && ob.toc.length) { out.toc = ob.toc; out.tocSource = 'openbd'; }
  else if (okRk && (rk.toc || []).length) { out.toc = rk.toc; out.tocSource = 'rakuten'; }
  if (okOb && ob.pages) out.pages = ob.pages;
  out.pubdate = (okOb && ob.pubdate) || (okRk && rk.pubdate) || '';
  if (okRk && Array.isArray(rk.genreIds)) out.genreIds = rk.genreIds;

  // 紹介文がまだ無いときだけ Google（鍵なしは共有の枠が細いので、要るときだけ）
  if (!out.description && i13) {
    const g = await safe(googleInfo(i13, { fetchImpl, env, timeoutMs }));
    if (g.answered) out.answered = true;
    if (g.answered && sameBookTitle(title, g.title)) {
      if (g.description) { out.description = g.description; out.source = 'google'; }
      if (!out.pages && g.pages) out.pages = g.pages;
      if (!out.pubdate && g.pubdate) out.pubdate = g.pubdate;
    }
  }

  // 紹介文が目次そのもの（目次を内容紹介に登録した本）なら紹介文は出さない
  if (out.description && out.toc.length && textWithin(out.description, out.toc.join(''))) {
    out.description = '';
    out.source = '';
  }
  out.description = clampDescription(out.description);
  out.isbn = i13 || '';
  return out;
}

// ─── サーバーの控え（同じ本を何度も外へ聞かない）────────────────────────
const CACHE_MAX = 500;
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export function bookInfoCacheKey({ isbn = '', title = '', author = '' } = {}) {
  const i13 = toIsbn13(isbn);
  if (i13) return `i:${i13}|${flatTitle(title).slice(0, 60)}`;
  return `t:${flatTitle(title).slice(0, 100)}|${String(author || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase().slice(0, 60)}`;
}

/** 控えつきの fetchBookInfo（answered でないものは覚えない）。 */
export async function getBookInfoCached(q, deps = {}) {
  const key = bookInfoCacheKey(q);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now < hit.until) return hit.data;
  const data = await fetchBookInfo(q, deps);
  if (data.answered) {
    const found = !!(data.description || data.toc.length || (data.genreIds || []).length);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { data, until: now + (found ? HIT_TTL_MS : MISS_TTL_MS) });
  }
  return data;
}
export function _resetBookInfoCache() { cache.clear(); googleCooldown.reset(); }

/** 応答の形（answered は外に出さない）。 */
export function bookInfoResponse(data) {
  return {
    description: data.description || '',
    toc: Array.isArray(data.toc) ? data.toc : [],
    source: data.source || '',
    tocSource: data.tocSource || '',
    pages: data.pages || 0,
    pubdate: data.pubdate || '',
    isbn: data.isbn || '',
    genreIds: Array.isArray(data.genreIds) ? data.genreIds : [],
  };
}
