// 📥 ほかのアプリから取り込む（#4・2026-09-27）— 初日から相談の材料が揃うように。
//
// 対応する形式（どれも「ファイルを選ぶ」だけ・AI は使わない＝原価ゼロ）:
//   - ブクログ: 本棚のエクスポート CSV（Shift_JIS / UTF-8 のどちらでも）。
//       列: サービスID, アイテムID, 13桁ISBN, カテゴリ, 評価, 読書状況, レビュー, タグ,
//           読書メモ(非公開), 登録日時, 読了日, タイトル, 作者名, 出版社名, 発行年, ジャンル, ページ数
//       見出し行がある CSV（タイトル / 著者 / ISBN などの列名）もそのまま読める。
//   - Kindle 端末: 「My Clippings.txt」（ハイライトとメモ）。日本語・英語の端末どちらも。
//   - Kindle アプリ: ノートブックの「エクスポート」で届く HTML（ハイライトとメモ）。
//   - 読書メーター（2026-09-29）: 保存した「読んだ本」などのページ（HTML）・書き出しツールの CSV / JSON・
//       自分で作った表（タイトル・著者・読了日・感想 など）。詳しくは下の「読書メーター」の節。
//
// 返す形（どの形式でも同じ）:
//   { source, books: [{ title, author, isbn, status, rating, doneDate, tags, review,
//                       memos: [{ text, page, createdAt }] }] }
//   （読書メーターは asin / pages / reviewAt も付く。無ければ App 側は空として扱う）
// 画面は src/components/ImportSheet.jsx。保存は App 側（重複は既存の本に足す）。

import { findDuplicateBook } from './checkDuplicate';

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_BOOKS = 300;
export const IMPORT_MAX_MEMOS = 2000;

// ── 文字コード ─────────────────────────────────────────────────────────
// UTF-8 として読めればそれ、壊れていれば Shift_JIS（ブクログの既定）で読み直す。
export function decodeImportBytes(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    try { return new TextDecoder('shift_jis').decode(bytes); } catch { return new TextDecoder().decode(bytes); }
  }
}

// ── CSV（引用符・改行入りのセルに対応）───────────────────────────────
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 1; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

const clean = (v, max = 2000) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const isoDate = (v) => {
  const m = String(v || '').match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (!m) return '';
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return Number.isNaN(Date.parse(d)) ? '' : d;
};
const toIsoTimestamp = (v) => {
  const d = isoDate(v);
  if (!d) return null;
  const t = String(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return t ? `${d}T${t[1].padStart(2, '0')}:${t[2]}:${t[3] || '00'}+09:00` : `${d}T12:00:00+09:00`;
};

// ブクログの読書状況 → Orime の状態
export function mapStatus(v) {
  const s = String(v || '');
  if (/読み終|読了|読んだ|finished|read$/i.test(s)) return 'done';
  if (/いま読|読んでる|読書中|reading/i.test(s)) return 'reading';
  if (/積読|積ん/.test(s)) return 'before';
  if (/読みたい|want/i.test(s)) return 'want';
  return 'done';
}

const BOOKLOG_ORDER = ['service', 'itemId', 'isbn', 'category', 'rating', 'status', 'review', 'tags', 'memo', 'addedAt', 'doneDate', 'title', 'author'];
const HEADER_ALIASES = {
  title: ['タイトル', '書名', 'title', '本のタイトル'],
  author: ['作者名', '著者', '著者名', 'author', '作者'],
  isbn: ['13桁isbn', 'isbn', 'isbn13', 'isbn-13'],
  rating: ['評価', 'rating', '星'],
  status: ['読書状況', '状態', 'status', 'ステータス'],
  review: ['レビュー', '感想', 'review'],
  tags: ['タグ', 'tags', 'tag'],
  memo: ['読書メモ(非公開)', '読書メモ', '非公開メモ', 'メモ', 'memo', 'note', 'notes'],
  addedAt: ['登録日時', '登録日', 'added', 'created'],
  doneDate: ['読了日', '読み終わった日', 'finished', 'date read'],
};

export function parseBooklogCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { source: 'booklog', books: [] };
  // 見出し行があれば列名で、無ければブクログのエクスポートの列順で読む。
  const head = rows[0].map((h) => clean(h, 40).toLowerCase());
  let map = null;
  if (head.some((h) => HEADER_ALIASES.title.includes(h))) {
    map = {};
    for (const [key, names] of Object.entries(HEADER_ALIASES)) {
      const i = head.findIndex((h) => names.includes(h));
      if (i >= 0) map[key] = i;
    }
    rows.shift();
  } else {
    map = Object.fromEntries(BOOKLOG_ORDER.map((k, i) => [k, i]));
  }
  const get = (r, k) => (map[k] == null ? '' : r[map[k]]);
  const books = [];
  for (const r of rows) {
    const title = clean(get(r, 'title'), 200);
    // 13桁ISBN が空でも、アイテムID（Amazon の ASIN＝紙の本なら ISBN-10）から ISBN-13 を作る
    // （読書メーター → ブクログ形式の移行ツールは 13桁ISBN と書名を空で書く）。
    const isbn = clean(get(r, 'isbn'), 20).replace(/[^0-9Xx]/g, '') || asinToIsbn13(get(r, 'itemId'));
    if (!title && !isbn) continue;
    const memos = [];
    const memo = clean(get(r, 'memo'), 4000);
    const addedAt = toIsoTimestamp(get(r, 'addedAt'));
    if (memo) memos.push({ text: memo, page: null, createdAt: addedAt });
    const rating = Math.max(0, Math.min(5, Math.round(Number(get(r, 'rating')) || 0)));
    books.push({
      title: title || `ISBN ${isbn}`,
      author: clean(get(r, 'author'), 100),
      isbn,
      status: mapStatus(get(r, 'status')),
      rating,
      doneDate: isoDate(get(r, 'doneDate')),
      tags: clean(get(r, 'tags'), 300).split(/[,、\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
      review: clean(get(r, 'review'), 8000),
      memos,
    });
  }
  return { source: 'booklog', books: books.slice(0, IMPORT_MAX_BOOKS) };
}

// ── Kindle: My Clippings.txt ─────────────────────────────────────────
// 1 件 = 「書名 (著者)」「- メタ行」「空行」「本文」を ========== で区切ったもの。
const splitTitleAuthor = (line) => {
  const s = clean(line, 300).replace(/^﻿/, '');
  const m = s.match(/^(.*)\s*\(([^()]*)\)\s*$/);
  return m ? { title: m[1].trim(), author: m[2].trim() } : { title: s, author: '' };
};
const clippingDate = (meta) => {
  const ja = meta.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^\d]*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (ja) return `${ja[1]}-${ja[2].padStart(2, '0')}-${ja[3].padStart(2, '0')}T${ja[4].padStart(2, '0')}:${ja[5]}:${ja[6] || '00'}+09:00`;
  const en = meta.match(/Added on\s+(.+)$/i);
  if (en) {
    const t = Date.parse(en[1].replace(/^[A-Za-z]+,\s*/, ''));
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
};

export function parseKindleClippings(text) {
  const byKey = new Map();
  const entries = String(text || '').split(/^={5,}\s*$/m);
  let count = 0;
  for (const raw of entries) {
    const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines.length < 3) continue;
    const { title, author } = splitTitleAuthor(lines[0]);
    const meta = lines[1] || '';
    if (/ブックマーク|Bookmark/i.test(meta)) continue; // しおりは本文が無い
    const body = clean(lines.slice(2).join('\n'), 4000);
    if (!title || !body) continue;
    const page = Number((meta.match(/(\d+)\s*ページ/) || meta.match(/page\s+(\d+)/i) || [])[1]) || null;
    const key = `${title}\u0000${author}`;
    if (!byKey.has(key)) byKey.set(key, { title, author, isbn: '', status: 'done', rating: 0, doneDate: '', tags: [], review: '', memos: [] });
    const book = byKey.get(key);
    // 同じ箇所を引き直したハイライトは、最後のものだけ残す（Kindle は上書きしても両方残る）
    if (book.memos.some((m) => m.text === body)) continue;
    book.memos.push({ text: body, page, createdAt: clippingDate(meta) });
    count += 1;
    if (count >= IMPORT_MAX_MEMOS) break;
  }
  return { source: 'kindle', books: [...byKey.values()].slice(0, IMPORT_MAX_BOOKS) };
}

// ── Kindle アプリのノートブック（HTML エクスポート）────────────────────
// 文字参照だけを戻す（属性の値＝読書メーターの data-modal の JSON にも使う）。&amp; は最後に。
const decodeHtmlEntities = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; } })
  .replace(/&amp;/g, '&');
const decodeEntities = (s) => decodeHtmlEntities(String(s || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ''));

export function parseKindleNotebookHtml(html) {
  const s = String(html || '');
  const pick = (cls) => {
    const m = s.match(new RegExp(`class=["']${cls}["'][^>]*>([\\s\\S]*?)</div>`, 'i'));
    return m ? clean(decodeEntities(m[1]), 300) : '';
  };
  const title = pick('bookTitle');
  const author = pick('authors');
  if (!title) return { source: 'kindle', books: [] };
  const memos = [];
  const re = /class=["']noteHeading["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["']noteText["'][^>]*>([\s\S]*?)<\/(?:div|h3)>/gi;
  let m;
  while ((m = re.exec(s)) && memos.length < IMPORT_MAX_MEMOS) {
    const heading = decodeEntities(m[1]);
    const text = clean(decodeEntities(m[2]), 4000);
    if (!text || memos.some((x) => x.text === text)) continue;
    const page = Number((heading.match(/(?:ページ|Page)\s*(\d+)/i) || [])[1]) || null;
    memos.push({ text, page, createdAt: null });
  }
  return { source: 'kindle', books: [{ title, author, isbn: '', status: 'done', rating: 0, doneDate: '', tags: [], review: '', memos }] };
}

// ── 読書メーター（2026-09-29）────────────────────────────────────────
// 読書メーターには公式の書き出しが無い。よく使われている 3 つの持ち出し方に対応する:
//   (1) ブラウザで保存した「読んだ本」「読んでる本」「積読本」「読みたい本」のページ（.html）。
//       本は <li class="group__book"> 1 つずつ。書名・著者・ASIN・ページ数は data-modal（JSON）と
//       .detail__title / .detail__authors / .detail__date / .detail__page から読む。感想は「リスト」表示の
//       ページにだけある（.detail__edit の data-modal の review.text・review.read_at）。
//   (2) 書き出しツールの CSV / JSON。見出しの名前で読む（どれも UTF-8。BOM があっても可）:
//       bookmeter-exporter（bookTitle, bookAuthor, bookAsin, bookPage, reviewDate, reviewText, bookcaseNames。
//         ファイル名 finished-books / reading-books / reading-list-books / wish-list-books で状態を決める）
//       bookmeterjson（title, author, asin, pages, date, review.text, review.read_at, bookcases・{id}-{read|reading|stacked|wish}-日付.json）
//       export_bookmeter（title, author(s), cover）／ bookmeter_exporter（見出しなし: ASIN, 読了日, 感想）
//   (3) 自分で作った表（タイトル/書名・著者・読了日/読んだ日・感想/レビュー・ページ数・ASIN/ISBN・本棚）。
// 感想はブクログのレビューと同じ扱い（新しい本は「この本のまとめ」・もとからある本はメモ）。本棚はタグ。
// ASIN が ISBN-10（紙の本）なら ISBN-13 にして重複判定と表紙に使う。Kindle 版の ASIN（B0…）は ASIN のまま。

// ISBN-10（チェックディジットが合うもの）→ ISBN-13。合わなければ ''。
export function asinToIsbn13(v) {
  const s = String(v || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(s)) return s;
  if (!/^\d{9}[\dX]$/.test(s)) return '';
  let sum10 = 0;
  for (let i = 0; i < 10; i += 1) sum10 += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  if (sum10 % 11 !== 0) return '';
  const core = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}

// 読書メーターの棚（URL・ページの題・ファイル名）→ Orime の状態。分からなければ ''。
export function bookmeterStatusHint(v) {
  const t = String(v || '').toLowerCase();
  if (/積読|stacked|reading-list/.test(t)) return 'before';
  if (/読みたい|wish/.test(t)) return 'want';
  if (/読んでる|reading/.test(t)) return 'reading';
  if (/読んだ|finished|(^|[^a-z])read([^a-z]|$)/.test(t)) return 'done';
  return '';
}

const normKey = (h) => String(h ?? '').replace(/^﻿/, '').toLowerCase().replace(/[\s_　]/g, '');
const BM_FIELDS = Object.fromEntries(Object.entries({
  title: ['タイトル', '書名', '本のタイトル', 'title', 'booktitle', 'book.title'],
  author: ['著者', '著者名', '作者', '作者名', 'author', 'authors', 'author(s)', 'bookauthor', 'book.author', 'detail_authors'],
  asin: ['asin', 'bookasin', 'book.asin'],
  isbn: ['isbn', 'isbn13', 'isbn-13', '13桁isbn', 'isbn10', 'isbn-10'],
  doneDate: ['読了日', '読んだ日', '読み終わった日', '読了', 'date', 'readdate', 'read_date', 'read_at', 'reviewdate', 'review.read_at', 'finished', 'date read'],
  review: ['感想', 'レビュー', '感想・レビュー', 'コメント', 'review', 'reviewtext', 'review.text', 'comment'],
  pages: ['ページ数', 'ページ', 'pages', 'page', 'bookpage', 'book.page', 'detail_pages'],
  tags: ['本棚', 'タグ', 'bookcasenames', 'bookcases', 'tags'],
  status: ['読書状況', '状態', 'ステータス', 'status'],
}).map(([k, names]) => [k, names.map(normKey)]));
// 読書メーターの CSV だと分かる見出し（ブクログにない名前）
const BM_HEADER_HINTS = ['booktitle', 'bookasin', 'reviewtext', 'reviewdate', 'bookcasenames', 'author(s)', '感想', '感想・レビュー', '読んだ日', '本棚', 'asin'].map(normKey);
const BOOKLOG_ONLY = ['サービスid', 'アイテムid', '13桁isbn', '読書メモ(非公開)', '読書状況'].map(normKey);

// { 見出し: 値 } → 読書メーターの 1 冊（読めなければ null）
function bookmeterBook(rec, statusHint) {
  const get = (k) => {
    for (const name of BM_FIELDS[k]) {
      const v = rec[name];
      if (v != null && String(v).trim() !== '') return v;
    }
    return '';
  };
  const asinRaw = clean(get('asin'), 40).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const isbnRaw = clean(get('isbn'), 20);
  const isbn = asinToIsbn13(isbnRaw) || asinToIsbn13(asinRaw);
  const asin = /^[0-9A-Z]{10}$/.test(asinRaw) ? asinRaw : '';
  let title = clean(get('title'), 200);
  if (!title && !isbn && !asin) return null;
  // 書名の無い書き出し（見出しなしの ASIN・読了日・感想）は ISBN / ASIN を仮の書名に（あとで直せる）。
  if (!title) title = isbn ? `ISBN ${isbn}` : `ASIN ${asin}`;
  const doneDate = isoDate(get('doneDate'));
  const statusRaw = clean(get('status'), 40);
  let tags = get('tags');
  if (typeof tags === 'string' && /^\s*\[/.test(tags)) { try { tags = JSON.parse(tags); } catch { /* 文字のまま */ } }
  tags = (Array.isArray(tags) ? tags.map((t) => (t && typeof t === 'object' ? t.name : t)).join('、') : clean(tags, 300));
  const pages = Math.max(0, Math.min(99999, Math.round(Number(String(get('pages')).replace(/[^0-9]/g, '')) || 0)));
  return {
    title,
    author: clean(get('author'), 100),
    isbn,
    asin,
    status: statusRaw ? mapStatus(statusRaw) : (statusHint || 'done'),
    rating: 0,
    doneDate,
    tags: String(tags || '').split(/[,、]+/).map((t) => clean(t, 40)).filter(Boolean).slice(0, 10),
    review: clean(get('review'), 8000),
    // 感想をもとからある本のメモにするときの日付（読了日の昼）
    reviewAt: doneDate ? toIsoTimestamp(doneDate) : null,
    pages,
    memos: [],
  };
}

const dedupeBooks = (books) => {
  const seen = new Set();
  return books.filter((b) => {
    const key = `${b.title}\u0000${b.author}\u0000${b.isbn || b.asin}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// CSV の見出しが読書メーターのものか（ファイル名に bookmeter / 読書メーター があるときも）
export function looksLikeBookmeterCsv(fileName, text) {
  const name = String(fileName || '').toLowerCase();
  const rows = parseCsv(String(text || '').slice(0, 4000));
  if (!rows.length) return false;
  const head = rows[0].map(normKey);
  if (head.some((h) => BOOKLOG_ONLY.includes(h))) return false;
  if (head.some((h) => BM_HEADER_HINTS.includes(h))) return true;
  if (/bookmeter|読書メーター|finished-books|wish-list-books|reading-list-books|reading-books/.test(name)) return true;
  // 見出しなしの「ASIN, 読了日, 感想」（bookmeter_exporter）／「ASIN, 書名, 日付, 感想」
  const r = rows[0];
  return r.length >= 2 && r.length <= 4 && /^[0-9A-Z]{10}$/.test(String(r[0]).trim()) && !/^\d{1,3}$/.test(String(r[0]).trim());
}

export function parseBookmeterCsv(text, fileName = '') {
  const rows = parseCsv(text);
  if (!rows.length) return { source: 'bookmeter', books: [] };
  const hint = bookmeterStatusHint(fileName);
  const head = rows[0].map(normKey);
  const known = new Set(Object.values(BM_FIELDS).flat());
  const books = [];
  if (head.some((h) => known.has(h))) {
    for (const r of rows.slice(1)) {
      const rec = {};
      head.forEach((h, i) => { if (h && rec[h] == null) rec[h] = r[i]; });
      const b = bookmeterBook(rec, hint);
      if (b) books.push(b);
    }
  } else {
    // 見出しなし: 3 列＝ASIN・読了日・感想／4 列＝ASIN・書名・日付・感想
    for (const r of rows) {
      const rec = r.length >= 4
        ? { asin: r[0], title: r[1], date: r[2], review: r[3] }
        : { asin: r[0], date: r[1], review: r[2] };
      const b = bookmeterBook(rec, hint);
      if (b) books.push(b);
    }
  }
  return { source: 'bookmeter', books: dedupeBooks(books).slice(0, IMPORT_MAX_BOOKS) };
}

// JSON（書き出しツール）: 配列、または { books: [...] }。入れ子は「review.text」のように平らにする。
export function parseBookmeterJson(text, fileName = '') {
  let data;
  try { data = JSON.parse(String(text || '').replace(/^﻿/, '')); } catch { return { source: 'bookmeter', books: [] }; }
  const list = Array.isArray(data) ? data : (Array.isArray(data?.books) ? data.books : []);
  const hint = bookmeterStatusHint(fileName);
  const books = [];
  const flat = (obj, prefix, out) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = normKey(prefix ? `${prefix}.${k}` : k);
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
      else if (out[key] == null) out[key] = v;
      // 入れ子の名前（book.title）でも、末尾だけ（title）でも引けるように
      const leaf = normKey(k);
      if (prefix && !(v && typeof v === 'object' && !Array.isArray(v)) && out[leaf] == null) out[leaf] = v;
    }
    return out;
  };
  for (const item of list.slice(0, IMPORT_MAX_BOOKS * 2)) {
    if (!item || typeof item !== 'object') continue;
    const rec = flat(item, '', {});
    if (Array.isArray(rec.authors)) rec.authors = rec.authors.join('、');
    const b = bookmeterBook(rec, hint);
    if (b) books.push(b);
  }
  return { source: 'bookmeter', books: dedupeBooks(books).slice(0, IMPORT_MAX_BOOKS) };
}

// 保存したページ（.html）
export function isBookmeterHtml(html) {
  const s = String(html || '');
  return /class=["'][^"']*\bgroup__book\b/.test(s) || (/bookmeter\.com/.test(s) && /\bdetail__title\b/.test(s));
}

const attr = (tag, name) => {
  const m = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? '') : '';
};
// class に cls を含む最初の要素の中身（閉じタグ tag まで）
const inner = (s, cls, tag = 'div') => {
  const m = String(s || '').match(new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
};

// ページの棚（読んだ本・読んでる本・積読本・読みたい本）: 保存元の URL → ページの題 → ファイル名の順で見る。
// 本文のリンク（ほかの棚へのタブ）は見ない。
function bookmeterPageStatus(s, fileName) {
  const urls = [
    (s.match(/<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i) || [])[1],
    attr((s.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0], 'href'),
    attr((s.match(/<meta\b[^>]*property=["']og:url["'][^>]*>/i) || [])[0], 'content'),
  ].filter(Boolean);
  for (const u of urls) {
    const m = u.match(/\/books\/(read|reading|stacked|wish)(?:[/?#]|$)/);
    if (m) return { read: 'done', reading: 'reading', stacked: 'before', wish: 'want' }[m[1]];
  }
  const title = decodeEntities((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  return bookmeterStatusHint(title) || bookmeterStatusHint(fileName);
}

// ページの上に出ている棚の冊数（.content__count。「1,234」「1234冊」など）。読めなければ 0。
// 一覧はページに分かれている（1 ページ 20〜40 冊）ので、保存したページの冊数より多ければ「残りのページも」と伝える。
export function bookmeterPageTotal(html) {
  // 数は div の中の span などに入っていることもあるので、最初の閉じタグまでを見る（タグの種類を問わない）。
  const m0 = String(html || '').match(/class=["'][^"']*\bcontent__count\b[^"']*["'][^>]*>([\s\S]{0,200}?)<\/[a-z]+>/i);
  const raw = decodeEntities(m0 ? m0[1] : '');
  const m = raw.replace(/[,，\s]/g, '').match(/\d+/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) && n > 0 && n < 1000000 ? n : 0;
}

export function parseBookmeterHtml(html, fileName = '') {
  const s = String(html || '');
  const pageStatus = bookmeterPageStatus(s, fileName);
  const total = bookmeterPageTotal(s);
  const parts = s.split(/<li\b[^>]*class=["'][^"']*\bgroup__book\b[^"']*["'][^>]*>/i).slice(1);
  const books = [];
  for (const block of parts) {
    // data-modal（JSON）: 「登録」ボタンに book、「編集する」ボタンに review と bookcases。
    const modal = { book: null, review: null, bookcases: null, author: '', pages: 0 };
    const re = /data-modal\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let m;
    while ((m = re.exec(block))) {
      try {
        const d = JSON.parse(decodeHtmlEntities(m[1] ?? m[2] ?? ''));
        if (d?.book && !modal.book) modal.book = d.book;
        if (d?.review && !modal.review) modal.review = d.review;
        if (Array.isArray(d?.bookcases) && !modal.bookcases) modal.bookcases = d.bookcases;
        if (d?.author && !modal.author) modal.author = d.author;
        if (d?.pages && !modal.pages) modal.pages = d.pages;
      } catch { /* 壊れた JSON は画面の文字から読む */ }
    }
    const imgTag = (block.match(/<img\b[^>]*\bcover__image\b[^>]*>/i) || [])[0] || '';
    const authorsHtml = inner(block, 'detail__authors', 'ul');
    const authorLinks = [...authorsHtml.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((x) => clean(decodeEntities(x[1]), 100)).filter(Boolean);
    const dateText = clean(decodeEntities(inner(block, 'detail__date')), 40);
    const pageText = clean(decodeEntities(inner(block, 'detail__page')), 20);
    const amazon = (block.match(/amazon\.co\.jp\/(?:[^"'\s]*\/)?dp\/(?:product\/)?([0-9A-Z]{10})/) || [])[1] || '';
    const rec = {
      // 一覧の書名（.detail__title）は長いと途中で切れるので、JSON → 表紙の alt → 一覧の順
      title: modal.book?.title || attr(imgTag, 'alt') || decodeEntities(inner(block, 'detail__title')),
      author: authorLinks.join('、') || modal.author || modal.book?.author || '',
      asin: modal.book?.asin || amazon,
      date: isoDate(dateText) || modal.review?.read_at || '',
      review: modal.review?.text || '',
      pages: pageText || modal.pages || modal.book?.page || '',
      bookcases: modal.bookcases || '',
    };
    const b = bookmeterBook(Object.fromEntries(Object.entries(rec).map(([k, v]) => [normKey(k), v])), pageStatus || (rec.date ? 'done' : ''));
    if (b) books.push(b);
  }
  // total: 棚の全冊数（ページの上の数・読めたときだけ）。shelf: どの棚のページか（'done' など・分からなければ ''）。
  return { source: 'bookmeter', books: dedupeBooks(books).slice(0, IMPORT_MAX_BOOKS), ...(total ? { total, shelf: pageStatus || '' } : null) };
}

// 棚の全冊数と、選んだファイルで読めた冊数（読書メーターの保存したページのとき・2026-09-29）。
// 全冊数が読めた冊数より多い＝保存していないページがある。{ total, found, shelf } か null。
//   いくつかのファイルをまとめた結果は found（全冊数のある読書メーターのページから読めた冊数）を使う
//   （Kindle など別のファイルの本を足して「足りている」ように見せない・mergeImportResults）。
export function importShortfall(result) {
  const total = Number(result?.total) || 0;
  const found = Number.isFinite(result?.found) ? result.found : (Array.isArray(result?.books) ? result.books.length : 0);
  if (!total || total <= found) return null;
  return { total, found, shelf: result.shelf || '' };
}

// ── 入口: ファイル名と中身から形式を当てる ─────────────────────────────
export function parseImportText(fileName, text) {
  const name = String(fileName || '').toLowerCase();
  const t = String(text || '');
  if (name.endsWith('.html') || name.endsWith('.htm') || /class=["']noteText["']/.test(t) || isBookmeterHtml(t)) {
    return isBookmeterHtml(t) ? parseBookmeterHtml(t, fileName) : parseKindleNotebookHtml(t);
  }
  if (name.endsWith('.json') || /^\s*[[{]/.test(t.replace(/^﻿/, ''))) return parseBookmeterJson(t, fileName);
  if (name.endsWith('.txt') || /^={5,}\s*$/m.test(t)) return parseKindleClippings(t);
  if (looksLikeBookmeterCsv(fileName, t)) return parseBookmeterCsv(t, fileName);
  return parseBooklogCsv(t);
}

// いくつかのファイルを一度に選んだとき（Kindle のノートブックは 1 冊 1 ファイル）: 1 つの結果にまとめる。
//   同じ本（書名＋著者）は 1 冊にまとめ、同じ文のメモは 1 つだけ残す。取り込み元がそろっていればその名前、
//   混ざっていれば 'mixed'（見出しに取り込み元を出さない）。上限（300 冊・2,000 件）はまとめたあとにも守る。
export function mergeImportResults(results) {
  const list = (Array.isArray(results) ? results : []).filter((r) => r && Array.isArray(r.books));
  if (list.length === 1) return list[0];
  const sources = [...new Set(list.map((r) => r.source).filter(Boolean))];
  const byKey = new Map();
  // 同じ本: ISBN（または ASIN）が同じ、または書名＋著者が同じ（著者の書き方が違っても ISBN で 1 冊に）。
  const byId = new Map();
  let memoCount = 0;
  // 全冊数（total）のある結果＝読書メーターの棚のページから読めた本（同じ本は 1 冊）。
  const shelfBooks = new Set();
  for (const r of list) {
    const fromShelf = Number(r.total) > 0;
    for (const b of r.books) {
      const key = `${String(b.title || '').trim()}\u0000${String(b.author || '').trim()}`;
      const id = b.isbn || b.asin || '';
      let book = byKey.get(key) || (id ? byId.get(id) : null);
      if (!book) {
        if (byKey.size >= IMPORT_MAX_BOOKS) continue;
        book = { ...b, memos: [] };
        byKey.set(key, book);
      }
      if (id && !byId.has(id)) byId.set(id, book);
      if (fromShelf) shelfBooks.add(book);
      if (!book.review && b.review) book.review = b.review;
      if (!book.isbn && b.isbn) book.isbn = b.isbn;
      if (!book.asin && b.asin) book.asin = b.asin;
      if (!book.doneDate && b.doneDate) { book.doneDate = b.doneDate; book.reviewAt = book.reviewAt || b.reviewAt; }
      for (const m of b.memos || []) {
        if (memoCount >= IMPORT_MAX_MEMOS) break;
        if (book.memos.some((x) => x.text === m.text)) continue;
        book.memos.push(m);
        memoCount += 1;
      }
    }
  }
  // 読書メーターの棚の全冊数: 同じ棚のページどうしは同じ数なので棚ごとに 1 つ、棚が違えば足す。
  const totals = new Map();
  list.forEach((r) => { if (r.total > 0) totals.set(r.shelf || '', Math.max(totals.get(r.shelf || '') || 0, r.total)); });
  const total = [...totals.values()].reduce((n, v) => n + v, 0);
  const shelf = totals.size === 1 ? [...totals.keys()][0] : '';
  return {
    source: sources.length === 1 ? sources[0] : 'mixed',
    books: [...new Set(byKey.values())],
    // found: 棚の全冊数と比べる冊数（読書メーターのページから読めた本だけ）。
    ...(total ? { total, shelf, found: shelfBooks.size } : null),
  };
}

// 確かめる画面の数え方（2026-09-29）。取り込み（App の importLibrary）と同じ決まりで本棚と突き合わせる:
//   - 同じ本（findDuplicateBook: ISBN、または書名＋著者）が本棚にあれば、その本にメモとして足す（レビュー・感想もメモに。
//     ただし本棚の本の「この本のまとめ」と同じ文なら足さない）
//   - 新しい本のレビュー・感想は「この本のまとめ」に入る＝メモ 1 件として数える（ホームの「メモ N 件」と同じ）
// 返り値: { rows: [{ book, existing }], newBooks, existingBooks, memos, summaries }
//   memos はまとめを含むメモの件数（すでに同じ文のメモがあるときは、取り込みで足されないので少し減ることがある）。
export function planImport(result, shelf) {
  const books = Array.isArray(result?.books) ? result.books : [];
  const plan = { rows: [], newBooks: 0, existingBooks: 0, memos: 0, summaries: 0 };
  books.forEach((b) => {
    const isbn = String(b.isbn || '').replace(/[^0-9Xx]/g, '');
    const target = findDuplicateBook(shelf, { title: b.title, author: b.author, isbn });
    const cards = b.memos?.length || 0;
    const review = String(b.review || '').trim();
    if (target) {
      plan.existingBooks += 1;
      const reviewAsMemo = review && review !== String(target.leverageMemo || '').trim() ? 1 : 0;
      plan.memos += cards + reviewAsMemo;
      plan.rows.push({ book: b, existing: true, memos: cards + reviewAsMemo, summary: false });
    } else {
      plan.newBooks += 1;
      plan.memos += cards + (review ? 1 : 0);
      plan.summaries += review ? 1 : 0;
      plan.rows.push({ book: b, existing: false, memos: cards, summary: !!review });
    }
  });
  return plan;
}

export function summarizeImport(result) {
  const books = result?.books || [];
  const memos = books.reduce((n, b) => n + (b.memos?.length || 0) + (b.review ? 1 : 0), 0);
  return { books: books.length, memos };
}
