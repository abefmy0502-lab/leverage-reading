// 🔄 Cover auto-retry — 表紙が無い / 壊れている本に対して、
// セッション内で 1 度だけバックグラウンドで再解決を試みる。
//
// 起動時 1 回の `backfillCovers` (lib/backfillCovers.js v3) では、
// 解決失敗した本は `cover = null` に落とされる。それでも DB から本棚に
// 並ぶ時点で「カードが灰色のプレースホルダ」になるので、見栄えが悪い。
// このモジュールは、本棚レンダリング時に各 BookCard が「自分は表紙が
// 無い / 壊れている」と気付いたら裏で再試行できる仕組み。
//
// 重要な制約:
//   - セッション内 1 回のみ (book.id でデデュープ)。成功 / 失敗を問わず。
//   - book.coverIsbn === 'manual' は絶対に触らない (手動アップロード済み)
//   - キュー化して 1 秒に 1 冊までしか走らせない (NDL / openBD / Google Books
//     のレート制限を踏まないため)
//   - 失敗時はトーストを出さない (UX の邪魔にならない)
//   - 永続化は呼び出し側が渡す `saveBook` に任せる。useBooks の cache /
//     楽観的 UI と整合させるため、生 supabase を直接叩かない。

import { findIsbnCandidates } from './bookSearch';
import { resolveCoverFromCandidates } from './bookCover';

const triedThisSession = new Set();
const queue = [];
let processing = false;

const PACE_MS = 1000;

/**
 * @param {Object}   params
 * @param {Object}   params.book      camelCase の本オブジェクト (id, title, author, isbn, coverIsbn)
 * @param {Function} params.saveBook  useBooks の saveBook。{...book, cover, coverIsbn} を渡す
 */
export function enqueueCoverRetry({ book, saveBook }) {
  if (!book || !book.id) return;
  if (triedThisSession.has(book.id)) return;
  if (book.coverIsbn === 'manual') return;
  // 検索の手がかりが何も無い本はスキップ (title も isbn も無い空行など)
  if (!book.isbn && !(book.title && book.title.trim())) return;
  if (typeof saveBook !== 'function') return;

  triedThisSession.add(book.id);
  queue.push({ book, saveBook });
  if (!processing) processQueue();
}

async function processQueue() {
  processing = true;
  while (queue.length > 0) {
    const { book, saveBook } = queue.shift();
    try {
      // eslint-disable-next-line no-await-in-loop
      const altIsbns = await findIsbnCandidates(book.title, book.author);
      const ordered = [book.isbn, ...altIsbns].filter(Boolean);
      if (ordered.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const { url, isbn } = await resolveCoverFromCandidates(ordered);
        if (url) {
          // useBooks.saveBook を経由することで、全 BookCard の React state が
          // 自動で更新される (= UI がリアルタイムに表紙ありに切り替わる)。
          // eslint-disable-next-line no-await-in-loop
          await saveBook({ ...book, cover: url, coverIsbn: isbn || '' });
        }
      }
    } catch (e) {
      // 失敗してもユーザーには見せない (UX を壊さない)
      // eslint-disable-next-line no-console
      console.warn('[auto-retry] error:', book?.title, e?.message || e);
    }
    // レート制限対策。最後の 1 冊の後でも待つが大した影響はない。
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  processing = false;
}

// テスト / 手動デバッグ用。本番コードからは呼ばない。
export function _resetCoverAutoRetry() {
  triedThisSession.clear();
  queue.length = 0;
  processing = false;
}
