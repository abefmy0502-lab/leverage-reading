// 🔄 Cover backfill v2 — multi-ISBN リゾルバを使って既存 cover=null
// の本に表紙を埋める。v1 (= openBD URL を素直に書く) では「openBD に
// 載っていない単行本」が ?マークのままだった。今回は同タイトル+著者で
// 取れる別エディション ISBN も試すため、ハードカバーで取れない本でも
// 文庫版で取れる確率が上がる。
//
// フラグキー: cover-backfill-v2-done — v1 (`coverBackfill:done:v1`) を
// 既に走らせたユーザーにも、v2 を 1 回追加で走らせる狙い。

import { resolveCoverFromCandidates } from './bookCover';
import { findIsbnCandidates } from './bookSearch';

const FLAG_KEY = 'cover-backfill-v2-done';
const BATCH_LIMIT = 50;

export async function backfillCovers(supabase, userId) {
  if (!supabase || !userId) return;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY)) return;
  } catch { /* ignore */ }

  try {
    // cover が NULL or 空文字の本を対象。ISBN 必須にしないのは、
    // タイトル+著者検索で alt ISBN を見つけられるケースのため。
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, isbn')
      .eq('user_id', userId)
      .or('cover.is.null,cover.eq.')
      .limit(BATCH_LIMIT);
    if (error) {
      console.warn('[backfillCovers v2] fetch failed:', error?.message || error);
      return;
    }
    if (!data || data.length === 0) {
      try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
      return;
    }

    let updated = 0;
    for (const row of data) {
      try {
        const altIsbns = await findIsbnCandidates(row.title, row.author);
        const ordered = [row.isbn, ...altIsbns].filter(Boolean);
        if (ordered.length === 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const { isbn, url } = await resolveCoverFromCandidates(ordered);
        if (!url) continue;

        // schema-error フォールバック: cover_isbn 列が無くても cover だけは保存
        const payload = { cover: url };
        const fullPayload = isbn ? { ...payload, cover_isbn: isbn } : payload;
        // eslint-disable-next-line no-await-in-loop
        let res = await supabase.from('books').update(fullPayload).eq('id', row.id);
        if (res.error && /cover_isbn|column/.test(String(res.error?.message || ''))) {
          // 列なし → cover のみで再試行
          // eslint-disable-next-line no-await-in-loop
          res = await supabase.from('books').update(payload).eq('id', row.id);
        }
        if (!res.error) updated += 1;
      } catch (e) {
        console.warn('[backfillCovers v2] book failed:', row?.title, e?.message || e);
      }
    }

    try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
    if (updated > 0) {
      console.log(`[backfillCovers v2] updated ${updated}/${data.length} books`);
    }
  } catch (e) {
    console.warn('[backfillCovers v2] error:', e?.message || e);
  }
}
