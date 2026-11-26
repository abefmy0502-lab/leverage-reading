// 🔎 1 行 1 冊の一覧・貼り付けの本を、書店の検索で確かめる（2026-11-25 オーナー「引越し機能をどのアプリよりもレベル高く、精度高く」）。
//   ISBN の行 → 同じ ISBN の本の書名・著者・表紙。書名の行 → 本棚の写真から追加と同じ照合（lib/shelfScan.js の matchShelfGuess）。
//   見つからない本も消さない（打った書名のまま入る＝あとで直せる）。AI は使わない。
import { matchShelfGuess } from './shelfScan';

/**
 * books: parsePlainList の本（needsLookup: true のものだけ確かめる）
 * search(query) → { ok, results }（lib/bookSearch.js の searchBooksOnServer と同じ形）
 * 戻り値: { books, found, loose, missing, failed, merged, mergedBooks, mergedLines }
 *   failed＝書店の検索が失敗した本（通信など・打った書名のまま・checkFailed）
 *   found＝確かめた本・loose＝近い書名で当てた本（確かめる画面に「近い本に合わせました」）・missing＝見つからなかった本（打った書名のまま）
 */
const sleep = (ms, signal) => new Promise((resolve) => {
  if (!ms) { resolve(); return; }
  const t = setTimeout(resolve, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});
export async function resolveListBooks(books, { search, concurrency = 3, onEach, signal, retryWaitMs = 20000 } = {}) {
  const out = books.map((b) => ({ ...b }));
  const targets = out.map((b, i) => (b.needsLookup ? i : -1)).filter((i) => i >= 0);
  let found = 0; let loose = 0; let missing = 0; let failed = 0; let doneCount = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      if (signal?.aborted) return;
      const i = targets[next]; next += 1;
      const b = out[i];
      let res = { ok: false, results: [] };
      // 書店の検索そのものが失敗した（通信・サーバー）のは「見つからない」と分ける（2026-11-25 ui-critic）。
      let reqFailed = false;
      const q = b.isbn || `${b.title} ${b.author || ''}`.trim();
      // 検索の回数の上限（1 分 120 回・429）に当たったら、少し待って 3 回まで聞き直す
      //   （長い一覧の後半が「確かめられなかった」になっていた・2026-11-26 点検）。
      for (let attempt = 0; attempt < 4; attempt += 1) {
        reqFailed = false;
        try {
          // eslint-disable-next-line no-await-in-loop
          res = await search(q);
          if (!res?.ok) reqFailed = true;
        } catch (e) {
          if (e?.name === 'AbortError') return;
          reqFailed = true;
        }
        if (!(reqFailed && res?.status === 429) || attempt === 3 || signal?.aborted) break;
        // eslint-disable-next-line no-await-in-loop
        await sleep(retryWaitMs * (attempt + 1), signal);
      }
      if (signal?.aborted) return;
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
      } else if (reqFailed) {
        out[i] = { ...b, needsLookup: false, unverified: true, checkFailed: true };
        failed += 1;
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
  const keyOf = (b) => b.isbn || `${String(b.title).replace(/\s+/g, '')}\u0000${String(b.author || '').replace(/\s+/g, '')}`;
  const counts = new Map();
  out.forEach((b) => { const k = keyOf(b); counts.set(k, (counts.get(k) || 0) + 1); });
  const seen = new Set();
  const unique = out.filter((b) => {
    const key = keyOf(b);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // まとめた冊数（mergedBooks）と、その元の行の数（mergedLines）＝「同じ本の行 2 つを 1 冊に」。
  const dup = [...counts.values()].filter((n) => n > 1);
  // 数は 1 冊にまとめたあとの本で数え直す（まとめた行が「近い書名」だったときも合うように・2026-11-26 点検）。
  const looked = new Set(targets.map((i) => out[i]));
  const kept = unique.filter((b) => looked.has(b));
  if (kept.length || targets.length) {
    found = kept.filter((b) => !b.unverified && !b.matchedLoosely).length;
    loose = kept.filter((b) => !b.unverified && b.matchedLoosely).length;
    missing = kept.filter((b) => b.unverified && !b.checkFailed).length;
    failed = kept.filter((b) => b.checkFailed).length;
  }
  return {
    books: unique, found, loose, missing, failed,
    merged: out.length - unique.length,
    mergedBooks: dup.length,
    mergedLines: dup.reduce((a, n) => a + n, 0),
  };
}

/** 状態を決めつけた本（取り込み元に状態が無い・分からない値）をまとめて直す。 */
//   メモか感想のある本は、積読・読みたいを選んでも読了で入れる（本の詳細は読書中・読了でしかメモを出さない＝
//   持ってきたハイライトが見えなくなる・2026-11-25 ui-critic）。
export const hasNotes = (b) => (Array.isArray(b?.memos) && b.memos.length > 0) || !!String(b?.review || '').trim();
export function setGuessedStatus(result, status) {
  if (!result || !['want', 'before', 'reading', 'done'].includes(status)) return result;
  const keepDone = status === 'want' || status === 'before';
  return { ...result, guessChoice: status, books: (result.books || []).map((b) => (b.statusGuessed ? { ...b, status: keepDone && hasNotes(b) ? 'done' : status } : b)) };
}
