// 🔎 すべての本の検索（書名・著者・タグ＋自分のメモの言葉・2026-09-30）。
//
// - 打ち終わってから 150ms 待って探す（打っている間に何度も並べ直さない）
// - メモは検索を始めたときに 1 回だけ全部読む（本に結びついたメモの本文・ページ・タグだけ）。
//   読んだメモは画面を開いている間は覚えておき、次の検索では読み直さない。
//   メモを書いた・直した・消した本は、本ごとのメモの控え（AppDataCache）で上書きして探す。
//   取り込みなどで控えを通さずにメモが増えたら、次に検索を始めたときに読み直す。
// - 並べ替え・一節の作り方は lib/librarySearch.js（AI も通信も使わない）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAllRows';
import { buildLibraryIndex, searchLibrary } from '../lib/librarySearch';
import { useAppDataCache } from '../state/AppDataCache';

export const LIBRARY_SEARCH_DEBOUNCE_MS = 150;

// 画面を開いている間のメモの控え（ログイン中の人ごと）。stale＝控えを通さずにメモが動いたかもしれない。
let memoRowsCache = { userId: null, rows: null, stale: false };

export function useLibrarySearch({ userId, books, query, active = true }) {
  const cache = useAppDataCache();
  const typed = active ? String(query || '').trim() : '';
  const [debounced, setDebounced] = useState(typed);
  useEffect(() => {
    // 消したときはすぐ（一覧をすぐ元に戻す）。打っているときは少し待つ。
    if (!typed) { setDebounced(''); return undefined; }
    const t = setTimeout(() => setDebounced(typed), LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typed]);

  const searching = !!debounced;
  const [rows, setRows] = useState(() => (memoRowsCache.userId === userId ? memoRowsCache.rows : null));
  const [status, setStatus] = useState(() => (memoRowsCache.userId === userId && memoRowsCache.rows ? 'ready' : 'idle'));
  const [reload, setReload] = useState(0);
  const lastReloadRef = useRef(0);
  // どの本のメモが動いても、本ごとの控えで上書きし直す（数えるだけ・読み直さない）。
  const [memoTick, setMemoTick] = useState(0);
  useEffect(() => cache?.subscribeAnyMemo?.(() => {
    memoRowsCache.stale = true;
    setMemoTick((t) => t + 1);
  }), [cache]);

  useEffect(() => {
    if (!searching || !userId) return undefined;
    const forced = reload !== lastReloadRef.current;
    lastReloadRef.current = reload;
    const fresh = memoRowsCache.userId === userId && memoRowsCache.rows && !memoRowsCache.stale;
    if (fresh && !forced) {
      setRows(memoRowsCache.rows);
      setStatus('ready');
      return undefined;
    }
    if (!isSupabaseConfigured) { setRows([]); setStatus('ready'); return undefined; }
    let alive = true;
    // 前に読んだメモがあれば出したまま読み直す（一覧を空にしない）
    setStatus((s) => (memoRowsCache.userId === userId && memoRowsCache.rows ? s : 'loading'));
    (async () => {
      const { data, error } = await fetchAllRows(() => supabase
        .from('book_memos')
        .select('id, book_id, text, page_number, tags, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }));
      if (!alive) return;
      if (error && !(data && data.length)) { setStatus('error'); return; }
      const got = (data || []).filter((m) => m.book_id != null);
      memoRowsCache = { userId, rows: got, stale: false };
      setRows(got);
      setStatus('ready');
    })().catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
    // 検索を始めたとき・もう一度を押したときだけ読む（打つたびには読まない）
  }, [searching, userId, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setReload((n) => n + 1), []);

  // 本ごとの控え（メモを書いた・開いた本）があれば、その本のメモは控えのほうを使う（書いた直後でも見つかる）。
  const index = useMemo(() => {
    if (!searching) return null;
    const cachedBooks = new Set();
    const extra = [];
    for (const b of books || []) {
      const m = cache?.getMemos?.(b.id);
      if (Array.isArray(m)) { cachedBooks.add(b.id); extra.push(...m); }
    }
    const base = (rows || []).filter((m) => !cachedBooks.has(m.book_id));
    return buildLibraryIndex(books || [], [...base, ...extra]);
  }, [searching, books, rows, memoTick, cache]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => (index ? searchLibrary(index, debounced) : null), [index, debounced]);
  // bookId → 結果（並び順つき）。一覧の絞り込みと状態のチップの件数に使う。
  const hits = useMemo(() => {
    if (!result) return null;
    const m = new Map();
    result.results.forEach((r, i) => m.set(r.book.id, { ...r, rank: i }));
    return m;
  }, [result]);

  return {
    query: debounced,
    // 打った言葉がまだ検索に反映されていない（待っている間）
    pending: typed !== debounced,
    hits,
    memoStatus: searching ? (status === 'idle' ? 'loading' : status) : 'idle',
    retry,
  };
}
