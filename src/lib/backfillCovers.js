// 🔄 Cover backfill v3 — 既存 DB に残った「壊れた cover URL」も
// 対象に含めて新リゾルバで再解決する。
//
// v2 までの問題: cover IS NULL の行しか触っておらず、過去に NDL の
// 「No image」placeholder URL や Google Books の動的 URL が cover 列
// に保存されてしまった本 (例: レバレッジ・リーディング ISBN 4492042695)
// は永久に再解決されないままだった。
//
// v3 の対象:
//   - cover IS NULL
//   - cover が NDL サムネ URL (ndlsearch.ndl.go.jp/thumbnail を含む)
//   - cover が Google Books の動的 URL (books.google.com/books/content を含む)
//   - cover_isbn IS NULL (新システム未適用)
//   ただし cover_isbn = 'manual' (手動アップロード済み) は除外。
//
// 解決失敗時は cover を null にリセットして手動アップロード待ちに。
// 壊れた URL を残しても再解決のループが永遠に止まらないため。

import { resolveCoverFromCandidates } from './bookCover';
import { findIsbnCandidates } from './bookSearch';

// v4: タイトル類似度フィルタを導入した findIsbnCandidates で再解決させる。
// 旧 v3 で「タイトル似てるだけの違う本」の表紙を採用してしまったケースを
// 修正するため、もう一度全本を走らせる。
const FLAG_KEY = 'cover-backfill-v4-done';
const BATCH_LIMIT = 50;

export async function backfillCovers(supabase, userId) {
  if (!supabase || !userId) return;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY)) return;
  } catch { /* ignore */ }

  try {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, isbn, cover, cover_isbn')
      .eq('user_id', userId)
      .or(
        [
          'cover.is.null',
          'cover.eq.',
          'cover.like.%ndlsearch.ndl.go.jp/thumbnail%',
          'cover.like.%books.google.com/books/content%',
          'cover_isbn.is.null',
        ].join(','),
      )
      .limit(BATCH_LIMIT);
    if (error) {
      console.warn('[backfillCovers v3] fetch failed:', error?.message || error);
      return;
    }
    if (!data || data.length === 0) {
      try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
      return;
    }

    let resolved = 0;
    let cleared = 0;
    for (const row of data) {
      try {
        // 手動アップロード済みは絶対に触らない。
        if (row.cover_isbn === 'manual') continue;

        const altIsbns = await findIsbnCandidates(row.title, row.author);
        const ordered = [row.isbn, ...altIsbns].filter(Boolean);

        // ISBN 候補ゼロの本はリゾルバに渡しても結果は出ない。null 化のみ。
        if (ordered.length === 0) {
          if (row.cover) {
            // eslint-disable-next-line no-await-in-loop
            const res = await supabase.from('books').update({ cover: null }).eq('id', row.id);
            if (!res.error) cleared += 1;
          }
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const { isbn, url } = await resolveCoverFromCandidates(ordered);

        if (url) {
          // 解決成功 → cover + cover_isbn を更新。schema-error fallback。
          const fullPayload = { cover: url, cover_isbn: isbn || null };
          const minPayload = { cover: url };
          // eslint-disable-next-line no-await-in-loop
          let res = await supabase.from('books').update(fullPayload).eq('id', row.id);
          if (res.error && /cover_isbn|column/.test(String(res.error?.message || ''))) {
            // eslint-disable-next-line no-await-in-loop
            res = await supabase.from('books').update(minPayload).eq('id', row.id);
          }
          if (!res.error) {
            resolved += 1;
          }
        } else if (row.cover) {
          // 解決失敗 + 既に壊れた URL がある → null にリセットして
          // 手動アップロード待ちに。次回起動の再ループ防止にもなる。
          const fullPayload = { cover: null, cover_isbn: null };
          // eslint-disable-next-line no-await-in-loop
          let res = await supabase.from('books').update(fullPayload).eq('id', row.id);
          if (res.error && /cover_isbn|column/.test(String(res.error?.message || ''))) {
            // eslint-disable-next-line no-await-in-loop
            res = await supabase.from('books').update({ cover: null }).eq('id', row.id);
          }
          if (!res.error) {
            cleared += 1;
          }
        }
      } catch (e) {
        console.warn('[backfillCovers v3] book failed:', row?.title, e?.message || e);
      }
    }

    try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
  } catch (e) {
    console.warn('[backfillCovers v3] error:', e?.message || e);
  }
}
