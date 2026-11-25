// 🔎 1 行 1 冊の一覧・貼り付けの本を、書店の検索で確かめる（2026-11-25 オーナー「引越し機能をどのアプリよりもレベル高く、精度高く」）。
//   ISBN の行 → 同じ ISBN の本の書名・著者・表紙。書名の行 → 本棚の写真から追加と同じ照合（lib/shelfScan.js の matchShelfGuess）。
//   見つからない本も消さない（打った書名のまま入る＝あとで直せる）。AI は使わない。
import { matchShelfGuess } from './shelfScan';

/**
 * books: parsePlainList の本（needsLookup: true のものだけ確かめる）
 * search(query) → { ok, results }（lib/bookSearch.js の searchBooksOnServer と同じ形）
 * 戻り値: { books, found, loose, missing }
 *   found＝確かめた本・loose＝近い書名で当てた本（確かめる画面に「近い本に合わせました」）・missing＝見つからなかった本（打った書名のまま）
 */
export async function resolveListBooks(books, { search, concurrency = 3, onEach, signal } = {}) {
  const out = books.map((b) => ({ ...b }));
  const targets = out.map((b, i) => (b.needsLookup ? i : -1)).filter((i) => i >= 0);
  let found = 0; let loose = 0; let missing = 0; let doneCount = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      if (signal?.aborted) return;
      const i = targets[next]; next += 1;
      const b = out[i];
      let res = { ok: false, results: [] };
      try {
        // eslint-disable-next-line no-await-in-loop
        res = await search(b.isbn || `${b.title} ${b.author || ''}`.trim());
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
      const results = res?.ok && Array.isArray(res.results) ? res.results : [];
      let hit = null; let isLoose = false;
      if (b.isbn) {
        hit = results.find((r) => String(r.isbn || '') === b.isbn) || null;
      } else if (results.length) {
        const m = matchShelfGuess({ title: b.title, author: b.author || '' }, results);
        if (m.status === 'found') hit = m.book;
        else if (m.status === 'maybe') { hit = m.book; isLoose = true; }
      }
      if (hit && hit.title) {
        out[i] = {
          ...b,
          title: String(hit.title).slice(0, 200),
          author: String(hit.author || b.author || '').slice(0, 100),
          isbn: /^\d{13}$/.test(String(hit.isbn || '')) ? String(hit.isbn) : b.isbn,
          cover: /^https:\/\//.test(String(hit.cover || '')) ? String(hit.cover) : '',
          pages: Number(hit.pages) || 0,
          needsLookup: false,
          ...(isLoose ? { matchedLoosely: true, typedTitle: b.title } : {}),
        };
        if (isLoose) loose += 1; else found += 1;
      } else {
        out[i] = { ...b, needsLookup: false, unverified: true };
        missing += 1;
      }
      doneCount += 1;
      onEach?.(doneCount, targets.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  // 書名の行と ISBN の行が同じ本に行き着いたら 1 冊に（先に書いた行を残す）。
  const seen = new Set();
  const unique = out.filter((b) => {
    const key = b.isbn || `${String(b.title).replace(/\s+/g, '')}\u0000${String(b.author || '').replace(/\s+/g, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { books: unique, found, loose, missing, merged: out.length - unique.length };
}

/** 状態を決めつけた本（取り込み元に状態が無い・分からない値）をまとめて直す。 */
export function setGuessedStatus(result, status) {
  if (!result || !['want', 'before', 'reading', 'done'].includes(status)) return result;
  return { ...result, books: (result.books || []).map((b) => (b.statusGuessed ? { ...b, status } : b)) };
}
