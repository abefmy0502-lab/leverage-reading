// 📥 Data export — CSV per table.
//
// The previous JSON export was complete but Excel-unfriendly. CSV is the
// pragmatic interchange format users actually open. We emit one CSV per
// table (books / book_memos / book_tags / actions / chat_messages /
// theme_reports / advisor_sessions / book_collections) and
// trigger sequential downloads. ZIP packaging would require pulling in
// JSZip (~100 KB) — the user-spec marked it optional, so we skip it.
//
// Encoding: UTF-8 with BOM (﻿) so Excel auto-detects 日本語 instead
// of treating it as Shift_JIS and corrupting characters.
//
// Columns are derived from the union of keys across every row so a column
// that's null on row 1 but populated on row 5 still appears.

import { supabase } from './supabase';

export const EXPORT_TABLES = [
  'books',
  'book_memos',
  'book_tags',
  'actions',
  'chat_messages',
  // 「あなたのデータはいつでも書き出せる」の約束を守る: 退会時に削除される
  // データは全てエクスポート対象に含める。未適用 DB は per-table soft-fail が
  // skipped 扱いにするので互換。
  'theme_reports',      // 📐 レバレッジメモ（テーマまとめ）履歴
  'advisor_sessions',   // 🕒 AI 選書の会話履歴
  'book_collections',   // 🗂 本棚フォルダの割当
];

const UTF8_BOM = '﻿';

function escapeCell(value) {
  if (value == null) return '';
  let str;
  if (typeof value === 'object') {
    // Arrays / nested objects → embed as JSON. Escape inner double quotes.
    try { str = JSON.stringify(value); }
    catch { str = String(value); }
  } else {
    str = String(value);
  }
  // CSV formula injection guard: a cell starting with = + - @ (or a leading
  // tab / CR that Excel strips before evaluating) is executed as a formula
  // when opened in Excel / Sheets. Prefix a single quote to neutralise it
  // while keeping the displayed text intact. Memo/タグ text is user-controlled.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function arrayToCSV(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return UTF8_BOM;
  // Union of keys across all rows — preserves a key that's null on the
  // first row but populated later (otherwise we'd drop it silently).
  const headerSet = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((k) => headerSet.add(k));
    }
  }
  const headers = Array.from(headerSet);
  const headerLine = headers.map(escapeCell).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCell(row?.[h])).join(','),
  );
  return UTF8_BOM + [headerLine, ...dataLines].join('\n');
}

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 1s is plenty — Safari sometimes complains if revoked too early.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Fetch every supported table for the user, build a CSV per table, and
 * trigger downloads. Returns a summary array describing each file
 * (table / row count) for the caller's UI confirmation.
 *
 * Sequential downloads with a small spacer delay so browsers don't
 * collapse them into a single prompt and don't hit the "block multiple
 * downloads?" warning. ~250ms is the sweet spot we tested.
 */

// Supabase 既定の max-rows (1000) を超えるテーブルでも黙って切り捨てないよう
// range でページング全件取得する（「あなたのデータはいつでも書き出せます」の
// 約束を守る）。上限 20 ページ (2万行) は安全弁。
async function fetchAllRows(table, userId) {
  const PAGE = 1000;
  let rows = [];
  for (let page = 0; page < 20; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      // ORDER BY なしの range は Postgres で順序保証がなく、ページ間で行の重複・
      // 欠落が起き得る（このヘルパーの存在理由を確率的に裏切る）。id で安定化。
      .order('id', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function exportUserDataAsCSV(userId, { onProgress } = {}) {
  if (!userId) throw new Error('ログインが必要です。');
  const date = todayYMD();
  const summary = [];

  for (let i = 0; i < EXPORT_TABLES.length; i += 1) {
    const table = EXPORT_TABLES[i];
    onProgress?.({ table, index: i, total: EXPORT_TABLES.length });
    let rows = [];
    try {
      rows = await fetchAllRows(table, userId);
    } catch (e) {
      console.warn(`exportUserDataAsCSV: ${table} threw`, e?.message || e);
      summary.push({ table, count: 0, skipped: true });
      continue;
    }

    const csv = arrayToCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `orime-${table}-${date}.csv`;
    downloadBlob(filename, blob);
    summary.push({ table, count: rows.length, filename, skipped: false });

    // Pace the downloads — without this, several browsers (Chrome, Brave)
    // collapse the prompts and only the last file lands.
    if (i < EXPORT_TABLES.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return summary;
}

function mdLine(s) {
  // Single-line for a list item: drop CR, collapse newlines to spaces.
  return String(s || '').replace(/\r/g, '').replace(/\n+/g, ' ').trim();
}

/**
 * Export all memos as a single human-readable Markdown file, grouped by book.
 *
 * Why: Markdown is tool-independent — users can drop the file straight into
 * NotebookLM / Obsidian / any editor to do their own AI synthesis or writing.
 * It also removes any "my notes are locked in" fear (data portability /
 * trust). One file (not per-table CSV) is the friendliest for those tools.
 */
export async function exportMemosAsMarkdown(userId) {
  if (!userId) throw new Error('ログインが必要です。');
  const date = todayYMD();

  let books = [];
  try {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, leverage_memo')
      .eq('user_id', userId);
    if (!error) books = data || [];
  } catch (e) {
    console.warn('exportMemosAsMarkdown: books fetch failed', e?.message || e);
  }

  let memos = [];
  try {
    // メモは 1000 件超があり得る主テーブル — range ページングで全件（切り捨て防止）。
    const PAGE = 1000;
    for (let page = 0; page < 20; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('book_memos')
        .select('id, text, page_number, tags, source_type, book_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      .order('id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) break;
      memos = memos.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    console.warn('exportMemosAsMarkdown: memos fetch failed', e?.message || e);
  }

  const lines = [];
  lines.push(`# Orime 読書メモ（${date}）`, '');
  lines.push(
    '> Orime からの書き出しです。Markdown 形式なので、NotebookLM や Obsidian などにそのまま取り込んで活用できます。',
    '',
  );

  let bookCount = 0;
  for (const b of books) {
    const bookMemos = memos.filter((m) => m.book_id === b.id && m.source_type !== 'personal');
    const hasSummary = b.leverage_memo && String(b.leverage_memo).trim();
    if (!bookMemos.length && !hasSummary) continue; // メモの無い本は出さない
    bookCount += 1;
    const author = b.author ? ` — ${b.author}` : '';
    lines.push(`## ${b.title || '（無題）'}${author}`, '');
    if (hasSummary) {
      lines.push('### まとめメモ', '', String(b.leverage_memo).replace(/\r/g, '').trim(), '');
    }
    if (bookMemos.length) {
      lines.push('### カード式メモ', '');
      for (const m of bookMemos) {
        const page = Number.isFinite(m.page_number) ? `（p.${m.page_number}）` : '';
        const tags = Array.isArray(m.tags)
          ? m.tags
              .filter((t) => typeof t === 'string' && !t.startsWith('@'))
              .map((t) => `#${t.replace(/^#/, '')}`)
              .join(' ')
          : '';
        const meta = [page, tags].filter(Boolean).join(' ');
        const dt = (m.created_at || '').slice(0, 10);
        lines.push(`- ${mdLine(m.text)}${meta ? ` ${meta}` : ''}${dt ? `  _(${dt})_` : ''}`);
      }
      lines.push('');
    }
  }

  const personal = memos.filter((m) => m.source_type === 'personal');
  if (personal.length) {
    lines.push('## 本以外の学び', '');
    for (const m of personal) {
      const cat = Array.isArray(m.tags)
        ? m.tags.find((t) => typeof t === 'string' && t.startsWith('@')) || ''
        : '';
      const catLabel = cat ? `[${cat.slice(1)}] ` : '';
      const dt = (m.created_at || '').slice(0, 10);
      lines.push(`- ${catLabel}${mdLine(m.text)}${dt ? `  _(${dt})_` : ''}`);
    }
    lines.push('');
  }

  const md = lines.join('\n');
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  downloadBlob(`orime-memos-${date}.md`, blob);
  return { books: bookCount, memos: memos.length };
}
