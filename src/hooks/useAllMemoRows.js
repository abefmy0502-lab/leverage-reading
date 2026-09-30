// 📚 自分のメモを全部（本文・ページ・タグ・日付だけ）読んで、画面を開いている間は覚えておく（2026-10-01）。
//
// すべての本の検索（useLibrarySearch）・メモが答える相談（MyBookBrain）・本と本がつながる（useMemoLinkFinder）で共通。
// - 使い始めたとき（active）に 1 回だけ読む（1,000 件ずつ最大 1 万件・fetchAllRows）。次からは読み直さない
// - メモを書いた・直した・消した本は、本ごとの控え（AppDataCache）で上書きして使う（書いた直後でも見つかる）
// - 取り込みなどで控えを通さずにメモが動いたら（subscribeAnyMemo）、次に使い始めたときに読み直す
// AI も使わない（トークンを使わない）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAllRows';
import { useAppDataCache } from '../state/AppDataCache';

// 画面を開いている間のメモの控え（ログイン中の人ごと）。stale＝控えを通さずにメモが動いたかもしれない。
let memoRowsCache = { userId: null, rows: null, stale: false };
let inflight = null; // { userId, promise }

// 学び（本に結びつかないメモ）も含めて読む（すべての本の検索は本に結びつくメモだけを使う）。
async function fetchRows(userId) {
  const run = (cols) => fetchAllRows(() => supabase
    .from('book_memos')
    .select(cols)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }));
  let res = await run('id, book_id, text, page_number, tags, created_at, source_type');
  // source_type の列が無い古い DB では外して読み直す
  if (res.error && !(res.data && res.data.length)) res = await run('id, book_id, text, page_number, tags, created_at');
  return res;
}

// 読む（同じ人の読み込みが進んでいれば相乗り）。force: 覚えていても読み直す。
export function loadAllMemoRows(userId, { force = false } = {}) {
  if (!userId) return Promise.resolve({ rows: [], error: null });
  const fresh = memoRowsCache.userId === userId && memoRowsCache.rows && !memoRowsCache.stale;
  if (fresh && !force) return Promise.resolve({ rows: memoRowsCache.rows, error: null });
  if (!isSupabaseConfigured) return Promise.resolve({ rows: [], error: null });
  if (inflight && inflight.userId === userId) return inflight.promise;
  const promise = (async () => {
    try {
      const { data, error } = await fetchRows(userId);
      if (error && !(data && data.length)) return { rows: null, error };
      const rows = data || [];
      memoRowsCache = { userId, rows, stale: false };
      return { rows, error: null };
    } catch (e) {
      return { rows: null, error: e };
    } finally {
      inflight = null;
    }
  })();
  inflight = { userId, promise };
  return promise;
}

export function peekAllMemoRows(userId) {
  return memoRowsCache.userId === userId ? memoRowsCache.rows : null;
}

// 本ごとの控え（メモを書いた・開いた本）で上書きしたメモの一覧。同じ材料なら同じ配列を返す
// （lib/memoLinks.js の索引は配列ごとに覚えるので、作り直さない）。
let mergedMemo = { rows: null, version: -1, books: null, out: null };
function mergeWithCache(rows, books, cache, version) {
  if (mergedMemo.rows === rows && mergedMemo.version === version && mergedMemo.books === books) return mergedMemo.out;
  const cachedBooks = new Set();
  const extra = [];
  for (const b of books || []) {
    const m = cache?.getMemos?.(b.id);
    if (Array.isArray(m)) { cachedBooks.add(b.id); extra.push(...m); }
  }
  const base = (rows || []).filter((m) => m.book_id == null || !cachedBooks.has(m.book_id));
  const out = [...base, ...extra];
  mergedMemo = { rows, version, books, out };
  return out;
}

// どの本のメモが動いたか（控えで上書きし直す合図）。画面をまたいで 1 つの数え方。
let memoVersion = 0;
const NO_ROWS = [];

// active: 使い始めたら true（それまでは読まない）。books: 本（控えの上書きに使う）。
// 返り値: { rows（控えで上書きしたメモ・読む前は控えの分だけ）, status: 'idle'|'loading'|'ready'|'error', retry }
export function useAllMemoRows({ userId, books, active = true }) {
  const cache = useAppDataCache();
  const [rows, setRows] = useState(() => peekAllMemoRows(userId));
  const [status, setStatus] = useState(() => (peekAllMemoRows(userId) ? 'ready' : 'idle'));
  const [reload, setReload] = useState(0);
  const lastReloadRef = useRef(0);
  const [version, setVersion] = useState(memoVersion);
  useEffect(() => cache?.subscribeAnyMemo?.(() => {
    memoRowsCache.stale = true;
    memoVersion += 1;
    setVersion(memoVersion);
  }), [cache]);

  useEffect(() => {
    if (!active || !userId) return undefined;
    const forced = reload !== lastReloadRef.current;
    lastReloadRef.current = reload;
    const known = peekAllMemoRows(userId);
    const fresh = known && !memoRowsCache.stale;
    if (fresh && !forced) { setRows(known); setStatus('ready'); return undefined; }
    let alive = true;
    // 前に読んだメモがあれば出したまま読み直す（一覧を空にしない）
    setStatus((s) => (known ? s : 'loading'));
    loadAllMemoRows(userId, { force: forced }).then(({ rows: got, error }) => {
      if (!alive) return;
      if (error || !got) { setStatus('error'); return; }
      setRows(got);
      setStatus('ready');
    });
    return () => { alive = false; };
    // 使い始めたとき・もう一度を押したときだけ読む
  }, [active, userId, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setReload((n) => n + 1), []);
  // 読む前・読んでいる間も、控えにある本のメモは使う（書いた直後の本は見つかる）。
  const merged = useMemo(() => mergeWithCache(rows || NO_ROWS, books, cache, version), [rows, books, cache, version]);
  return { rows: merged, status: active ? (status === 'idle' ? 'loading' : status) : 'idle', retry };
}
