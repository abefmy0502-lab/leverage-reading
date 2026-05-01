// 🔄 一度だけ走るバックフィル: 既存 DB に cover が NULL かつ ISBN が
// 入っている本に対して openBD URL を導出して保存する。
//
// 実行回数の制御: localStorage の `coverBackfill:done:v1` を確認。済なら
// no-op。新たな fix が必要な時はキー名のサフィックス (v2 など) を更新。
//
// 設計トレードオフ:
//   - resolveCoverUrl で実在検証するのが理想だが 1 件 ~3 秒 × 50 件 で
//     遅くなりすぎる。バックフィルは「URL を素直に保存」する版にして、
//     表示側 (BookCoverCard / SwipeableBookCard) の naturalWidth check で
//     1×1 placeholder を弾く方針。
//   - 失敗しても起動を遅らせない (try/catch で握り潰し)。

import { getCoverCandidates } from './bookCover';

const FLAG_KEY = 'coverBackfill:done:v1';
const BATCH_LIMIT = 50;

export async function backfillCovers(supabase, userId) {
  if (!supabase || !userId) return;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY)) return;
  } catch { /* ignore */ }

  try {
    const { data, error } = await supabase
      .from('books')
      .select('id, isbn')
      .eq('user_id', userId)
      .is('cover', null)
      .not('isbn', 'is', null)
      .limit(BATCH_LIMIT);
    if (error) {
      // エラー時はフラグを立てない (次回再試行)
      console.warn('[backfillCovers] fetch failed:', error?.message || error);
      return;
    }
    if (!data || data.length === 0) {
      try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
      return;
    }

    let updated = 0;
    for (const row of data) {
      if (!row?.isbn) continue;
      const candidates = getCoverCandidates(row.isbn);
      const cover = candidates[0];
      if (!cover) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await supabase.from('books').update({ cover }).eq('id', row.id);
        updated += 1;
      } catch (e) {
        console.warn('[backfillCovers] update failed:', e?.message || e);
      }
    }

    try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
    if (updated > 0) {
      console.log(`[backfillCovers] updated ${updated} books`);
    }
  } catch (e) {
    console.warn('[backfillCovers] error:', e?.message || e);
  }
}
