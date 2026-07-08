// 🔄 Cover auto-retry — 表紙が無い / 壊れている本に対して、バックグラウンドで
// 表紙を再解決する。
//
// 設計の肝（2026-06-28 改修）:
//   旧版は book.id で「成功 / 失敗を問わず」セッション内 1 回だけに固定していた。
//   そのため最初の 1 回が一時的な失敗（429 / ネット瞬断 / タイムアウト）だと、
//   その本は灰色のままセッション中ずっと固定され、ユーザーが手動で「取り直す」
//   まで表紙が付かなかった。「取り直すと付く」= 表紙は実在する = 最初の失敗は
//   一時的、という事実から、本改修では【失敗は数回まで自動で再試行】する。
//   成功するか、上限（MAX_ATTEMPTS）に達したときだけ諦める。
//
// 制約:
//   - book.coverIsbn === 'manual' は絶対に触らない（手動アップロード済み）
//   - 1 冊あたり最大 MAX_ATTEMPTS 回まで。成功で確定。
//   - 同じ本が同時に複数キューに入らない（queuedOrInflight でデデュープ）
//   - 失敗時は指数的に間隔を空けて再キュー（NDL/openBD/Google のレート制限回避）
//   - 失敗してもトーストは出さない（UX を壊さない）
//   - 永続化は呼び出し側の saveBook に委譲（useBooks の cache / 楽観的 UI と整合）

import { findIsbnCandidates, findCoverFromGoogleBooks } from './bookSearch';
import { resolveCoverFromCandidates, checkImageExists, resolveCoverViaServer } from './bookCover';

const MAX_ATTEMPTS = 3;
const PACE_MS = 1000;        // キュー内の連続処理ペース
const BACKOFF_BASE_MS = 4000; // 失敗時の再試行までの基準待ち（n 回目で n×）

// book.id -> これまでの失敗回数（MAX_ATTEMPTS 到達 or 成功で打ち止め）
const attempts = new Map();
// book.id -> 現在キュー / 処理中 / 再試行待機中（重複投入の防止）
const queuedOrInflight = new Set();
const queue = [];
let processing = false;

/**
 * @param {Object}   params
 * @param {Object}   params.book      camelCase の本オブジェクト (id, title, author, isbn, coverIsbn)
 * @param {Function} params.saveBook  useBooks の saveBook。{...book, cover, coverIsbn} を渡す
 * @param {Function} [params.getBook] id -> 最新の本 を返すアクセサ。保存直前に必ず最新へ
 *   rebase する（saveBook は actions 等を差分同期するため、enqueue 時の古い
 *   スナップショットで保存すると、その間のユーザー編集を巻き戻してしまう）。
 */
export function enqueueCoverRetry({ book, saveBook, getBook }) {
  if (!book || !book.id) return;
  if (book.coverIsbn === 'manual') return;
  if (book.coverIsbn === 'removed') return; // ユーザーが意図的に表紙を消した本は復活させない
  // 検索の手がかりが何も無い本はスキップ（title も isbn も無い空行など）
  if (!book.isbn && !(book.title && book.title.trim())) return;
  if (typeof saveBook !== 'function') return;
  // 既にキュー/処理中/再試行待機中なら二重投入しない
  if (queuedOrInflight.has(book.id)) return;
  // 上限まで失敗済みなら諦める（無限ハンマリング防止）
  if ((attempts.get(book.id) || 0) >= MAX_ATTEMPTS) return;

  queuedOrInflight.add(book.id);
  queue.push({ book, saveBook, getBook });
  if (!processing) processQueue();
}

// 1 冊分の解決を試みる。成功で url を返し、見つからなければ ''。
async function resolveOne(book) {
  let url = '';
  let coverIsbn = '';
  // ⓪ サーバーサイドリゾルバ /api/cover を最優先（端末の Google 429 / NDL CORS 回避）。
  try {
    const sv = await resolveCoverViaServer({ title: book.title, author: book.author, isbn: book.isbn });
    if (sv?.url && await checkImageExists(sv.url)) { url = sv.url; coverIsbn = sv.isbn || book.isbn || ''; }
  } catch { /* 次へ */ }
  // ① Google Books サムネ（ISBN 直引き → タイトル＋著者 → 緩い上位ヒット）。
  if (!url) try {
    const gb = await findCoverFromGoogleBooks({ title: book.title, author: book.author, isbn: book.isbn });
    if (gb && await checkImageExists(gb)) { url = gb; coverIsbn = book.isbn || ''; }
  } catch { /* 次へ */ }
  // ② ISBN ベース multi-source（NDL / openBD / Open Library / Amazon）。
  if (!url) {
    const altIsbns = await findIsbnCandidates(book.title, book.author);
    const ordered = [book.isbn, ...altIsbns].filter(Boolean);
    if (ordered.length > 0) {
      const r = await resolveCoverFromCandidates(ordered);
      if (r.url) { url = r.url; coverIsbn = r.isbn || ''; }
    }
  }
  return { url, coverIsbn };
}

async function processQueue() {
  processing = true;
  while (queue.length > 0) {
    const { book, saveBook, getBook } = queue.shift();
    let succeeded = false;
    try {
      // eslint-disable-next-line no-await-in-loop
      const { url, coverIsbn } = await resolveOne(book);
      if (url) {
        // 保存直前に最新の本へ rebase。enqueue 時の古いスナップショットで
        // saveBook すると、その間のユーザー編集（行動・タグ・ステータス等）が
        // 差分同期で巻き戻る/消えるため。削除済み・手動アップ済み・削除意図
        // (removed)・既に表紙ありの本には触らない。
        const latest = typeof getBook === 'function' ? getBook(book.id) : book;
        if (latest && latest.coverIsbn !== 'manual' && latest.coverIsbn !== 'removed' && !latest.cover) {
          // eslint-disable-next-line no-await-in-loop
          await saveBook({ ...latest, cover: url, coverIsbn });
        }
        succeeded = true; // 見つかった事実は確定（触らなかった場合も再試行不要）
      }
    } catch (e) {
      // 失敗してもユーザーには見せない
      // eslint-disable-next-line no-console
      console.warn('[auto-retry] error:', book?.title, e?.message || e);
    }

    if (succeeded) {
      attempts.set(book.id, MAX_ATTEMPTS); // 確定（以後は試さない）
      queuedOrInflight.delete(book.id);
    } else {
      const n = (attempts.get(book.id) || 0) + 1;
      attempts.set(book.id, n);
      if (n < MAX_ATTEMPTS) {
        // まだ余地あり → バックオフして再キュー（queuedOrInflight は保持＝二重投入防止）。
        // ⚠️ getBook を必ず引き継ぐ。落とすと再試行の成功時に enqueue 時点の古い
        // スナップショットで saveBook され、その間のユーザー編集（行動・タグ・
        // ステータス）が差分同期で巻き戻る（上の rebase コメントの事故そのもの）。
        const delay = BACKOFF_BASE_MS * n;
        setTimeout(() => {
          queue.push({ book, saveBook, getBook });
          if (!processing) processQueue();
        }, delay);
      } else {
        // 上限到達 → 諦める（手動アップロードに委ねる）。
        queuedOrInflight.delete(book.id);
      }
    }

    // レート制限対策。
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  processing = false;
}

// テスト / 手動デバッグ用。本番コードからは呼ばない。
export function _resetCoverAutoRetry() {
  attempts.clear();
  queuedOrInflight.clear();
  queue.length = 0;
  processing = false;
}
