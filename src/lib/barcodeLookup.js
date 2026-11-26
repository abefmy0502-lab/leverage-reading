// 📷 バーコードで読んだ ISBN の確かめと、本の引き当て（2026-11-26 オーナー「本のバーコードの読み取りのスピードを上げたい・
//   めっちゃ快適にレベルが高いものに」）。
import { searchBooksOnServer, searchBooksAdvanced } from './bookSearch';

/** 本の ISBN-13（978 / 979 始まり・13 桁・チェックディジットが合う）か。読み違い（1 桁ずれ）をここで落とす。 */
export function isBookIsbn13(code) {
  const s = String(code || '').replace(/[^0-9]/g, '');
  if (s.length !== 13 || !(s.startsWith('978') || s.startsWith('979'))) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

/** 同じバーコードが続けて読めても 1 回に（直前の ISBN と、その時刻から ms 以内は無視）。 */
export function isRepeatScan(last, isbn, now = Date.now(), ms = 2500) {
  return !!last && last.isbn === isbn && now - last.at < ms;
}

/**
 * ISBN から本を 1 冊引き当てる。書店の検索（サーバー）→ だめなら端末の検索（openBD・NDL）。
 * 返り値: { ok: true, book } ／ { ok: true, book: null }（見つからない）／ { ok: false }（つながらない）
 */
export async function lookupIsbn(isbn, { signal } = {}) {
  const code = String(isbn || '').replace(/[^0-9]/g, '');
  const pick = (list) => (Array.isArray(list) ? (list.find((b) => String(b?.isbn || '') === code) || null) : null);
  let serverOk = false;
  try {
    const r = await searchBooksOnServer(code, { signal });
    if (r?.ok) {
      serverOk = true;
      const hit = pick(r.results) || (r.results?.length === 1 ? r.results[0] : null);
      if (hit) return { ok: true, book: { ...hit, isbn: hit.isbn || code } };
    }
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
  }
  try {
    const r = await searchBooksAdvanced({ isbn: code }, { signal });
    const list = Array.isArray(r) ? r : r?.results;
    if (r && r.ok === false && !serverOk) return { ok: false };
    const hit = pick(list) || (Array.isArray(list) && list.length === 1 ? list[0] : null);
    if (hit) return { ok: true, book: { ...hit, isbn: hit.isbn || code } };
    return { ok: true, book: null };
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return serverOk ? { ok: true, book: null } : { ok: false };
  }
}
