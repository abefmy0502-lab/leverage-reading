// 🔄 Cover auto-retry — 表紙が無い / 壊れている本に対して、バックグラウンドで
// 表紙を再解決する。本の追加・取り込み・初日クイックスタート・AI 選書の「裏で表紙を探す」も
// すべてこの 1 本のキューを通る（App.jsx resolveCoverInBackground）。docs/cover-pipeline.md。
//
// 設計の肝:
//   - 失敗は数回まで自動で再試行（2026-06-28）。成功するか、上限（MAX_ATTEMPTS）に達したときだけ諦める。
//   - 1 冊ずつ順番に（PACE_MS）。以前は取り込み 20 冊を同時に解決して Google が 429 になり、
//     20 冊とも ISBN 候補が「0 件」でキャッシュされていた（2026-09-30）。
//   - 「見つからない」（サーバーが答えたうえで無い）は 7 日おいてから探し直す（負のキャッシュ・
//     localStorage）。通信の失敗は覚えない。「表紙を取り直す」はいつでも探す（2026-09-30）。
//   - 保存済みの表紙が読めない（壊れた URL・openBD の 404 など）ときは、その URL だけは
//     差し替えてよい（brokenCover）。以前は「表紙が空の本」しか上書きせず、壊れた URL の本は
//     ずっとグラデーションのままだった（2026-09-30）。
//   - 本に ISBN が無く、書名から ISBN が分かったら一緒に返す（呼び出し側が保存する）。
//
// 制約:
//   - book.coverIsbn === 'manual' / 'removed' は絶対に触らない（手動アップロード / 意図的に消した）
//   - 同じ本が同時に複数キューに入らない（queuedOrInflight でデデュープ）
//   - 失敗してもトーストは出さない（UX を壊さない）
//   - 永続化は呼び出し側の saveBook に委譲（useBooks の cache / 楽観的 UI と整合）

import { findIsbnCandidates, findCoverFromGoogleBooks } from './bookSearch';
import {
  checkImageExists,
  normalizeIsbn,
  resolveCoverFromCandidates,
  resolveCoverViaServerDetailed,
} from './bookCover';

const MAX_ATTEMPTS = 3;
const PACE_MS = 1000;        // キュー内の連続処理ペース
const BACKOFF_BASE_MS = 4000; // 失敗時の再試行までの基準待ち（n 回目で n×）

// ─── 負のキャッシュ（「見つからない」を 7 日覚える）──────────────────────
// 探す手がかり（ISBN・書名・著者）が変わったら別の鍵になり、すぐ探し直す。
// 鍵の版（v1）を上げると全部忘れる（リゾルバを直したとき用）。
export const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEG_STORAGE_KEY = 'cover-not-found:v1';
const NEG_MAX_ENTRIES = 500;

const negKey = (book) => [
  book?.id || '',
  normalizeIsbn(book?.isbn || ''),
  (book?.title || '').trim(),
  (book?.author || '').trim(),
].join('|');

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function createNegativeCache({ storage = defaultStorage(), ttlMs = NEGATIVE_TTL_MS, now = () => Date.now() } = {}) {
  const read = () => {
    try {
      const raw = storage && storage.getItem(NEG_STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  };
  const write = (obj) => {
    try { if (storage) storage.setItem(NEG_STORAGE_KEY, JSON.stringify(obj)); } catch { /* 容量・プライベート: 覚えないだけ */ }
  };
  return {
    // true = 最近「見つからない」だったので、まだ探し直さない
    has(book) {
      const at = read()[negKey(book)];
      return typeof at === 'number' && now() - at < ttlMs;
    },
    add(book) {
      const obj = read();
      obj[negKey(book)] = now();
      // 古いもの・期限切れを捨てて大きくしない
      const entries = Object.entries(obj).filter(([, t]) => typeof t === 'number' && now() - t < ttlMs);
      entries.sort((a, b) => b[1] - a[1]);
      write(Object.fromEntries(entries.slice(0, NEG_MAX_ENTRIES)));
    },
    remove(book) {
      const obj = read();
      if (negKey(book) in obj) { delete obj[negKey(book)]; write(obj); }
    },
  };
}
const negativeCache = createNegativeCache();
export const clearCoverNotFound = (book) => negativeCache.remove(book);

// ─── 1 冊の表紙を探す（すべての入口で同じ順番）─────────────────────────
// 戻り値 { url, coverIsbn, isbn, outcome }:
//   outcome 'found'（url あり）/ 'not_found'（サーバーは答えた・どこにも無い）/ 'transient'（通信の失敗）
//   isbn: 本に ISBN が無いとき、書名から分かった ISBN（保存してよい）。本に ISBN があれば ''（上書きしない）。
//   coverIsbn: 表紙を取った ISBN（違う版のこともある。本の ISBN の表紙がいつも先）。
//   skipUrl: 読めなかった表紙の URL（同じものを採らない）。
export async function resolveCoverForBook(book, { skipUrl = '', deps = {} } = {}) {
  const server = deps.resolveCoverViaServerDetailed || resolveCoverViaServerDetailed;
  const googleThumb = deps.findCoverFromGoogleBooks || findCoverFromGoogleBooks;
  const isbnCandidates = deps.findIsbnCandidates || findIsbnCandidates;
  const fromCandidates = deps.resolveCoverFromCandidates || resolveCoverFromCandidates;
  const check = deps.checkImageExists || checkImageExists;

  const title = (book?.title || '').trim();
  const author = (book?.author || '').trim();
  const primary = normalizeIsbn(book?.isbn || '');
  const learnedIsbn = (i) => (!primary && i ? normalizeIsbn(i) : '');

  // ⓪ サーバー（楽天・NDL・openBD・Google を横断・端末の 429 / CORS に強い）
  let sv = { status: 'error', url: '', isbn: '' };
  try { sv = await server({ title, author, isbn: primary }, { skipUrl }); } catch { /* error のまま */ }
  if (sv.status === 'found' && sv.url) {
    return { url: sv.url, coverIsbn: sv.isbn || primary, isbn: learnedIsbn(sv.isbn), outcome: 'found' };
  }
  const serverIsbn = sv.isbn || '';

  // ① 端末から Google Books の検証済みサムネ（本の ISBN → サーバーが見つけた ISBN → 書名＋著者）
  try {
    const gb = await googleThumb({ title, author, isbn: primary || serverIsbn });
    if (gb && gb !== skipUrl && await check(gb)) {
      return { url: gb, coverIsbn: primary || serverIsbn, isbn: learnedIsbn(serverIsbn), outcome: 'found' };
    }
  } catch { /* 次へ */ }

  // ② ISBN から鍵なしの取得元（本の ISBN が先 → サーバーの ISBN → 書名から探した ISBN）
  let altIsbns = [];
  try { altIsbns = (title || author) ? await isbnCandidates(title, author) : []; } catch { altIsbns = []; }
  const ordered = [primary, serverIsbn, ...altIsbns].filter(Boolean);
  if (ordered.length > 0) {
    try {
      const r = await fromCandidates(ordered);
      if (r?.url && r.url !== skipUrl) {
        // 書名から探した ISBN は厳格な照合（isSameBook）を通ったものだけ。本に ISBN が無ければ保存してよい。
        return { url: r.url, coverIsbn: r.isbn || '', isbn: learnedIsbn(serverIsbn || r.isbn), outcome: 'found' };
      }
    } catch { /* 次へ */ }
  }

  return {
    url: '',
    coverIsbn: '',
    isbn: learnedIsbn(serverIsbn),
    // サーバーが答えたうえで無いなら「見つからない」。サーバーに届かなかったら通信の失敗（覚えない）。
    outcome: sv.status === 'error' ? 'transient' : 'not_found',
  };
}

// ─── キュー ────────────────────────────────────────────────────────────
// book.id -> これまでの失敗回数（MAX_ATTEMPTS 到達 or 成功で打ち止め）
const attempts = new Map();
// book.id -> 現在キュー / 処理中 / 再試行待機中（重複投入の防止）
const queuedOrInflight = new Set();
const queue = [];
let processing = false;

/**
 * @param {Object}   params
 * @param {Object}   params.book        camelCase の本オブジェクト (id, title, author, isbn, coverIsbn, cover)
 * @param {Function} params.saveBook    ({ id, cover, coverIsbn, isbn, brokenCover }) を受けて保存する
 * @param {Function} [params.getBook]   id -> 最新の本 を返すアクセサ。保存直前に必ず最新へ
 *   rebase する（saveBook は actions 等を差分同期するため、enqueue 時の古い
 *   スナップショットで保存すると、その間のユーザー編集を巻き戻してしまう）。
 * @param {string}   [params.brokenCover] 読めなかった保存済みの表紙 URL（これだけは差し替えてよい）
 */
export function enqueueCoverRetry({ book, saveBook, getBook, brokenCover = '' }) {
  if (!book || !book.id) return;
  if (book.coverIsbn === 'manual') return;
  if (book.coverIsbn === 'removed') return; // ユーザーが意図的に表紙を消した本は復活させない
  // 検索の手がかりが何も無い本はスキップ（title も isbn も無い空行など）
  if (!book.isbn && !(book.title && book.title.trim())) return;
  if (typeof saveBook !== 'function') return;
  // 表紙があって、それが壊れているとも言われていない本は探さない
  if (book.cover && book.cover !== brokenCover) return;
  // 既にキュー/処理中/再試行待機中なら二重投入しない
  if (queuedOrInflight.has(book.id)) return;
  // 上限まで失敗済みなら諦める（無限ハンマリング防止）
  if ((attempts.get(book.id) || 0) >= MAX_ATTEMPTS) return;
  // 最近「見つからない」だった本は 7 日おく（起動のたびに外部へ問い合わせ直さない）
  if (negativeCache.has(book)) return;

  queuedOrInflight.add(book.id);
  queue.push({ book, saveBook, getBook, brokenCover });
  if (!processing) processQueue();
}

// 保存してよいか: 手動・削除の印が無く、表紙が空か、壊れていると言われた URL のまま。
export function canReplaceCover(latest, brokenCover = '') {
  if (!latest) return false;
  if (latest.coverIsbn === 'manual' || latest.coverIsbn === 'removed') return false;
  return !latest.cover || (!!brokenCover && latest.cover === brokenCover);
}

async function processQueue() {
  processing = true;
  while (queue.length > 0) {
    const { book, saveBook, getBook, brokenCover } = queue.shift();
    let outcome = 'transient';
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await resolveCoverForBook(book, { skipUrl: brokenCover });
      outcome = r.outcome;
      if (r.url) {
        // 保存直前に最新の本へ rebase。enqueue 時の古いスナップショットで
        // saveBook すると、その間のユーザー編集（行動・タグ・ステータス等）が
        // 差分同期で巻き戻る/消えるため。削除済み・手動アップ済み・削除意図
        // (removed)・既に（別の）表紙ありの本には触らない。
        const latest = typeof getBook === 'function' ? getBook(book.id) : book;
        if (canReplaceCover(latest, brokenCover)) {
          // eslint-disable-next-line no-await-in-loop
          await saveBook({ id: book.id, cover: r.url, coverIsbn: r.coverIsbn, isbn: r.isbn, brokenCover });
        }
      }
    } catch (e) {
      // 失敗してもユーザーには見せない
      // eslint-disable-next-line no-console
      console.warn('[auto-retry] error:', book?.title, e?.message || e);
      outcome = 'transient';
    }

    if (outcome === 'found') {
      attempts.set(book.id, MAX_ATTEMPTS); // 確定（以後は試さない）
      queuedOrInflight.delete(book.id);
    } else if (outcome === 'not_found') {
      // サーバーが答えたうえで無い → 7 日おく（このセッションでも、もう探さない）
      negativeCache.add(book);
      attempts.set(book.id, MAX_ATTEMPTS);
      queuedOrInflight.delete(book.id);
    } else {
      const n = (attempts.get(book.id) || 0) + 1;
      attempts.set(book.id, n);
      if (n < MAX_ATTEMPTS) {
        // まだ余地あり → バックオフして再キュー（queuedOrInflight は保持＝二重投入防止）。
        // ⚠️ getBook を必ず引き継ぐ（stale スナップショットでの保存を防ぐ）。
        const delay = BACKOFF_BASE_MS * n;
        setTimeout(() => {
          queue.push({ book, saveBook, getBook, brokenCover });
          if (!processing) processQueue();
        }, delay);
      } else {
        // 上限到達 → このセッションは諦める（通信の失敗なので負のキャッシュには入れない＝次の起動で探す）。
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
