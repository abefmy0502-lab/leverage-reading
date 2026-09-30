// 🔄 Cover backfill v5 — 起動時に、表紙が無いまま保存されている本を探し直す。
//
// v4 までの問題（2026-09-30 に作り直し）:
//   - 1 回だけ（端末ごとのフラグ）しか走らず、そのとき取れなかった本はずっと表紙なし
//   - 端末だけで探していた（NDL の CORS・Google の 429 で取りこぼす）。サーバーは楽天・NDL で
//     正しく答えられるのに使っていなかった
//   - 探せなかったとき NDL の書影 URL を「壊れた印」とみなして消していた。いまは NDL の書影は
//     サーバーが確かめて返す正しい表紙なので、新しい端末でログインすると正しい表紙が消えていた
//
// v5:
//   - 対象は「表紙が空」の本だけ（cover が null / ''）。手動アップロード（'manual'）・
//     意図的に消した本（'removed'）は触らない。今ある表紙は消さない（壊れた URL は
//     本棚に表示したときに coverAutoRetry が差し替える）
//   - 探し方は本棚の自動の再取得と同じ resolveCoverForBook（サーバー → 端末）
//   - 取れた表紙と、本に ISBN が無ければ分かった ISBN も保存する（同じ ISBN の本があれば ISBN は付けない）
//   - 「見つからない」は 7 日おく（coverAutoRetry の負のキャッシュ）。通信の失敗は覚えない
//   - 1 日 1 回まで。通信の失敗があった回は、次の起動でまた走る
//   - 1 冊ずつ順番に（外部へ一度に投げない）

import { resolveCoverForBook, createNegativeCache } from './coverAutoRetry';

const LAST_RUN_KEY = 'cover-backfill-v5-at';
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 50;
const PACE_MS = 800;

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

const isSchemaError = (err) => /cover_isbn|column/i.test(String(err?.message || ''));
const isUniqueErr = (err) => err?.code === '23505' || /duplicate key|unique/i.test(String(err?.message || ''));

// 表紙（と ISBN）を保存する。列が無い DB・同じ ISBN の本がある DB でも落ちない。
async function saveCover(supabase, row, { url, coverIsbn, isbn }) {
  let payload = { cover: url, cover_isbn: coverIsbn || null };
  if (isbn && !row.isbn) payload = { ...payload, isbn };
  let res = await supabase.from('books').update(payload).eq('id', row.id);
  if (res.error && payload.isbn && isUniqueErr(res.error)) {
    payload = { cover: url, cover_isbn: coverIsbn || null };
    res = await supabase.from('books').update(payload).eq('id', row.id);
  }
  if (res.error && isSchemaError(res.error)) {
    const min = { cover: url };
    if (payload.isbn) min.isbn = payload.isbn;
    res = await supabase.from('books').update(min).eq('id', row.id);
    if (res.error && min.isbn && isUniqueErr(res.error)) {
      res = await supabase.from('books').update({ cover: url }).eq('id', row.id);
    }
  }
  return !res.error;
}

// 戻り値: DB の行を実際に書き換えたら true。呼び出し側（App.jsx）はこれが
// true のときだけ refreshBooks する。
export async function backfillCovers(supabase, userId, {
  resolve = resolveCoverForBook,
  storage = defaultStorage(),
  negativeCache = createNegativeCache({ storage }),
  now = () => Date.now(),
  paceMs = PACE_MS,
} = {}) {
  if (!supabase || !userId) return false;
  try {
    const last = Number(storage?.getItem(LAST_RUN_KEY) || 0);
    if (last && now() - last < RUN_INTERVAL_MS) return false;
  } catch { /* 読めなければ走る */ }

  let data;
  try {
    const q = await supabase
      .from('books')
      .select('id, title, author, isbn, cover, cover_isbn')
      .eq('user_id', userId)
      .or('cover.is.null,cover.eq.')
      .limit(BATCH_LIMIT);
    if (q.error) {
      console.warn('[backfillCovers v5] fetch failed:', q.error?.message || q.error);
      return false;
    }
    data = q.data || [];
  } catch (e) {
    console.warn('[backfillCovers v5] error:', e?.message || e);
    return false;
  }

  let resolved = 0;
  let transient = 0;
  for (const row of data) {
    try {
      if (row.cover) continue;
      if (row.cover_isbn === 'manual' || row.cover_isbn === 'removed') continue;
      if (!row.isbn && !(row.title && row.title.trim())) continue;
      const book = { id: row.id, title: row.title || '', author: row.author || '', isbn: row.isbn || '' };
      if (negativeCache.has(book)) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await resolve(book);
      if (r?.url) {
        // eslint-disable-next-line no-await-in-loop
        if (await saveCover(supabase, row, r)) resolved += 1;
      } else if (r?.outcome === 'not_found') {
        negativeCache.add(book);
      } else {
        transient += 1;
      }
      // eslint-disable-next-line no-await-in-loop
      if (paceMs > 0) await new Promise((res) => { setTimeout(res, paceMs); });
    } catch (e) {
      transient += 1;
      console.warn('[backfillCovers v5] book failed:', row?.title, e?.message || e);
    }
  }

  // 通信の失敗が無かった回だけ「今日は済んだ」と覚える（失敗があれば次の起動でまた探す）。
  if (transient === 0) {
    try { storage?.setItem(LAST_RUN_KEY, String(now())); } catch { /* ignore */ }
  }
  return resolved > 0;
}
