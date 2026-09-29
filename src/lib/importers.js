// 📥 ほかのアプリから取り込む（#4・2026-09-27）— 初日から相談の材料が揃うように。
//
// 対応する形式（どれも「ファイルを選ぶ」だけ・AI は使わない＝原価ゼロ）:
//   - ブクログ: 本棚のエクスポート CSV（Shift_JIS / UTF-8 のどちらでも）。
//       列: サービスID, アイテムID, 13桁ISBN, カテゴリ, 評価, 読書状況, レビュー, タグ,
//           読書メモ(非公開), 登録日時, 読了日, タイトル, 作者名, 出版社名, 発行年, ジャンル, ページ数
//       見出し行がある CSV（タイトル / 著者 / ISBN などの列名）もそのまま読める。
//   - Kindle 端末: 「My Clippings.txt」（ハイライトとメモ）。日本語・英語の端末どちらも。
//   - Kindle アプリ: ノートブックの「エクスポート」で届く HTML（ハイライトとメモ）。
//
// 返す形（どの形式でも同じ）:
//   { source, books: [{ title, author, isbn, status, rating, doneDate, tags, review,
//                       memos: [{ text, page, createdAt }] }] }
// 画面は src/components/ImportSheet.jsx。保存は App 側（重複は既存の本に足す）。

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
  if (/読み終|読了|finished|read$/i.test(s)) return 'done';
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
    const isbn = clean(get(r, 'isbn'), 20).replace(/[^0-9Xx]/g, '');
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

// ── 入口: ファイル名と中身から形式を当てる ─────────────────────────────
export function parseImportText(fileName, text) {
  const name = String(fileName || '').toLowerCase();
  const t = String(text || '');
  if (name.endsWith('.html') || name.endsWith('.htm') || /class=["']noteText["']/.test(t)) return parseKindleNotebookHtml(t);
  if (name.endsWith('.txt') || /^={5,}\s*$/m.test(t)) return parseKindleClippings(t);
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
  let memoCount = 0;
  for (const r of list) {
    for (const b of r.books) {
      const key = `${String(b.title || '').trim()}\u0000${String(b.author || '').trim()}`;
      if (!byKey.has(key)) {
        if (byKey.size >= IMPORT_MAX_BOOKS) continue;
        byKey.set(key, { ...b, memos: [] });
      }
      const book = byKey.get(key);
      if (!book.review && b.review) book.review = b.review;
      if (!book.isbn && b.isbn) book.isbn = b.isbn;
      for (const m of b.memos || []) {
        if (memoCount >= IMPORT_MAX_MEMOS) break;
        if (book.memos.some((x) => x.text === m.text)) continue;
        book.memos.push(m);
        memoCount += 1;
      }
    }
  }
  return { source: sources.length === 1 ? sources[0] : 'mixed', books: [...byKey.values()] };
}

export function summarizeImport(result) {
  const books = result?.books || [];
  const memos = books.reduce((n, b) => n + (b.memos?.length || 0) + (b.review ? 1 : 0), 0);
  return { books: books.length, memos };
}
