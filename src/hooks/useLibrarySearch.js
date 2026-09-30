// 🔎 すべての本の検索（書名・著者・タグ＋自分のメモの言葉・2026-09-30）。
//
// - 打ち終わってから 150ms 待って探す（打っている間に何度も並べ直さない）
// - メモは検索を始めたときに 1 回だけ全部読む（hooks/useAllMemoRows.js・メモが答える相談／本と本がつながると共通）。
//   読んだメモは画面を開いている間は覚えておき、次の検索では読み直さない。
//   メモを書いた・直した・消した本は、本ごとのメモの控え（AppDataCache）で上書きして探す。
//   取り込みなどで控えを通さずにメモが増えたら、次に検索を始めたときに読み直す。
// - 並べ替え・一節の作り方は lib/librarySearch.js（AI も通信も使わない）。
import { useEffect, useMemo, useState } from 'react';
import { buildLibraryIndex, searchLibrary } from '../lib/librarySearch';
import { useAllMemoRows } from './useAllMemoRows';

export const LIBRARY_SEARCH_DEBOUNCE_MS = 150;

export function useLibrarySearch({ userId, books, query, active = true }) {
  const typed = active ? String(query || '').trim() : '';
  const [debounced, setDebounced] = useState(typed);
  useEffect(() => {
    // 消したときはすぐ（一覧をすぐ元に戻す）。打っているときは少し待つ。
    if (!typed) { setDebounced(''); return undefined; }
    const t = setTimeout(() => setDebounced(typed), LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typed]);

  const searching = !!debounced;
  const { rows, status, retry } = useAllMemoRows({ userId, books, active: searching && !!userId });

  // 本に結びつかないメモ（学び）は buildLibraryIndex が外す。
  const index = useMemo(() => (searching ? buildLibraryIndex(books || [], rows || []) : null), [searching, books, rows]);

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
    // ログインしていない（お試し前など）ときはメモを読まない＝読み終えたものとして扱う
    memoStatus: searching ? (userId ? status : 'ready') : 'idle',
    retry,
  };
}
