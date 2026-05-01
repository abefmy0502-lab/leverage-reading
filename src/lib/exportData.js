// 📥 Data export — CSV per table.
//
// The previous JSON export was complete but Excel-unfriendly. CSV is the
// pragmatic interchange format users actually open. We emit one CSV per
// table (books / book_memos / book_tags / actions / chat_messages) and
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
export async function exportUserDataAsCSV(userId, { onProgress } = {}) {
  if (!userId) throw new Error('ログインが必要です。');
  const date = todayYMD();
  const summary = [];

  for (let i = 0; i < EXPORT_TABLES.length; i += 1) {
    const table = EXPORT_TABLES[i];
    onProgress?.({ table, index: i, total: EXPORT_TABLES.length });
    let rows = [];
    try {
      const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
      if (error) {
        // Soft-fail per table — chat_messages may not exist if migration unrun.
        console.warn(`exportUserDataAsCSV: ${table} fetch failed`, error?.message || error);
        summary.push({ table, count: 0, skipped: true });
        continue;
      }
      rows = data || [];
    } catch (e) {
      console.warn(`exportUserDataAsCSV: ${table} threw`, e?.message || e);
      summary.push({ table, count: 0, skipped: true });
      continue;
    }

    const csv = arrayToCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `leverage-reading-${table}-${date}.csv`;
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
