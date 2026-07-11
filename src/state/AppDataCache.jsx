// In-memory cache for cross-screen data so navigation doesn't refetch.
// Two stores live here:
//   1. memoCache:   Map<bookId, BookMemo[]>            — survives BookMemoList unmount
//   2. photoCache:  Map<photoPath, { url, fetchedAt }> — signed-URL cache (50min TTL)
//
// Mutations from useBookMemos go through here so optimistic updates and
// background refetches stay consistent across every consumer.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { invalidateKnowledgeCache } from '../lib/ai';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const PHOTO_BUCKET = 'book-memo-photos';
const PHOTO_TTL_MS = 50 * 60 * 1000; // refresh slightly before the 60min signed-URL expiry

const AppDataCacheContext = createContext(null);

export function AppDataCacheProvider({ children }) {
  // Refs (not state) — these are pure caches; consumers re-render via their own state.
  const memoStoreRef = useRef(new Map());
  const photoStoreRef = useRef(new Map()); // path -> { url, fetchedAt, promise? }
  const memoSubsRef = useRef(new Map()); // bookId -> Set<callback>

  // ===== memo cache =====
  const getMemos = useCallback((bookId) => {
    if (!bookId) return null;
    return memoStoreRef.current.get(bookId) || null;
  }, []);

  const notifyMemos = (bookId, memos) => {
    const set = memoSubsRef.current.get(bookId);
    if (!set) return;
    set.forEach((cb) => {
      try { cb(memos); } catch { /* ignore subscriber errors */ }
    });
  };

  const setMemos = useCallback((bookId, memos) => {
    if (!bookId) return;
    memoStoreRef.current.set(bookId, memos);
    notifyMemos(bookId, memos);
    // メモが動いたら AI の知識キャッシュ（gatherKnowledge）を無効化 —
    // 「書いた直後にマイ読書脳へ聞く」でも常に最新の知識で答えるため。
    invalidateKnowledgeCache();
  }, []);

  const patchMemos = useCallback((bookId, fn) => {
    if (!bookId) return;
    const current = memoStoreRef.current.get(bookId) || [];
    const next = fn(current);
    memoStoreRef.current.set(bookId, next);
    notifyMemos(bookId, next);
    invalidateKnowledgeCache();
  }, []);

  // 🚿 メモ取得の in-flight 共有（photoCache の promise パターンと同思想）。
  // 本詳細を開くと App の currentMemoOps と BookMemoList 内の useBookMemos が
  // 同じ bookId で同時に fetch を発行する（= 毎回 2 クエリ）。同時同一 bookId の
  // 取得を 1 本の Promise に相乗りさせて重複クエリを消す。
  const memoFetchesRef = useRef(new Map()); // bookId -> Promise<rows>
  const dedupeMemoFetch = useCallback((bookId, fetcher) => {
    if (!bookId) return Promise.resolve().then(fetcher);
    const inflight = memoFetchesRef.current.get(bookId);
    if (inflight) return inflight;
    const p = Promise.resolve()
      .then(fetcher)
      .finally(() => {
        if (memoFetchesRef.current.get(bookId) === p) memoFetchesRef.current.delete(bookId);
      });
    memoFetchesRef.current.set(bookId, p);
    return p;
  }, []);

  const subscribeMemos = useCallback((bookId, cb) => {
    if (!bookId || typeof cb !== 'function') return () => {};
    if (!memoSubsRef.current.has(bookId)) memoSubsRef.current.set(bookId, new Set());
    const set = memoSubsRef.current.get(bookId);
    set.add(cb);
    return () => {
      set.delete(cb);
      if (set.size === 0) memoSubsRef.current.delete(bookId);
    };
  }, []);

  const clearMemos = useCallback((bookId) => {
    if (bookId === undefined) {
      memoStoreRef.current.clear();
    } else {
      memoStoreRef.current.delete(bookId);
    }
  }, []);

  // ===== photo URL cache =====
  const isFresh = (entry) => entry && Date.now() - entry.fetchedAt < PHOTO_TTL_MS;

  // 期限切れ（かつ in-flight でない）エントリを掃除する。署名 URL は 50 分で
  // 失効し再取得されるが、エントリ自体は明示削除しないと残り続ける。長時間
  // セッションで大量の写真を閲覧した際のメモリ肥大を防ぐため、batch 取得の
  // ついでに掃く（軽量・副作用なし）。in-flight（promise 保持）は触らない。
  const prunePhotoStore = () => {
    const store = photoStoreRef.current;
    const now = Date.now();
    for (const [path, entry] of store) {
      if (entry && !entry.promise && now - entry.fetchedAt >= PHOTO_TTL_MS) {
        store.delete(path);
      }
    }
  };

  const getCachedPhotoUrl = useCallback((path) => {
    if (!path) return null;
    const entry = photoStoreRef.current.get(path);
    return isFresh(entry) ? entry.url : null;
  }, []);

  const fetchPhotoUrl = useCallback(async (path) => {
    if (!path || !isSupabaseConfigured) return null;
    const cached = photoStoreRef.current.get(path);
    if (isFresh(cached)) return cached.url;
    if (cached?.promise) return cached.promise;

    const promise = supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (error) {
          photoStoreRef.current.delete(path);
          return null;
        }
        const url = data?.signedUrl || null;
        if (url) {
          photoStoreRef.current.set(path, { url, fetchedAt: Date.now() });
        } else {
          photoStoreRef.current.delete(path);
        }
        return url;
      })
      .catch(() => {
        photoStoreRef.current.delete(path);
        return null;
      });

    photoStoreRef.current.set(path, {
      ...(cached || {}),
      promise,
    });
    return promise;
  }, []);

  const fetchPhotoUrlsBatch = useCallback(async (paths) => {
    prunePhotoStore(); // 期限切れエントリを掃除（メモリ肥大防止）
    const result = new Map();
    if (!paths || paths.length === 0 || !isSupabaseConfigured) return result;

    const unique = Array.from(new Set(paths.filter(Boolean)));
    const missing = [];
    for (const p of unique) {
      const cached = photoStoreRef.current.get(p);
      if (isFresh(cached)) {
        result.set(p, cached.url);
      } else {
        missing.push(p);
      }
    }

    if (missing.length === 0) return result;

    try {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(missing, 3600);
      if (!error && Array.isArray(data)) {
        const now = Date.now();
        data.forEach((row) => {
          // Supabase returns { path, signedUrl, error }
          const path = row.path;
          if (!path) return;
          if (row.signedUrl) {
            photoStoreRef.current.set(path, { url: row.signedUrl, fetchedAt: now });
            result.set(path, row.signedUrl);
          } else {
            photoStoreRef.current.delete(path);
          }
        });
      }
    } catch {
      // Fallback to per-path on bulk failure.
      await Promise.all(
        missing.map(async (p) => {
          const url = await fetchPhotoUrl(p);
          if (url) result.set(p, url);
        })
      );
    }

    return result;
  }, [fetchPhotoUrl]);

  const invalidatePhotoUrl = useCallback((path) => {
    if (!path) return;
    photoStoreRef.current.delete(path);
  }, []);

  const clearAll = useCallback(() => {
    memoStoreRef.current.clear();
    photoStoreRef.current.clear();
    memoSubsRef.current.clear();
  }, []);

  // 共有端末対策: サインアウト時に in-memory のメモ本文・署名写真URLキャッシュを
  // 確実に破棄する（次に同タブを使う別ユーザーへのデータ残留を防ぐ多層防御）。
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearAll();
    });
    return () => { try { data?.subscription?.unsubscribe(); } catch { /* ignore */ } };
  }, [clearAll]);

  const value = useMemo(
    () => ({
      getMemos,
      setMemos,
      patchMemos,
      subscribeMemos,
      dedupeMemoFetch,
      clearMemos,
      getCachedPhotoUrl,
      fetchPhotoUrl,
      fetchPhotoUrlsBatch,
      invalidatePhotoUrl,
      clearAll,
    }),
    [
      getMemos,
      setMemos,
      patchMemos,
      subscribeMemos,
      dedupeMemoFetch,
      clearMemos,
      getCachedPhotoUrl,
      fetchPhotoUrl,
      fetchPhotoUrlsBatch,
      invalidatePhotoUrl,
      clearAll,
    ]
  );

  return (
    <AppDataCacheContext.Provider value={value}>{children}</AppDataCacheContext.Provider>
  );
}

export function useAppDataCache() {
  const ctx = useContext(AppDataCacheContext);
  if (!ctx) {
    throw new Error('useAppDataCache must be used within an AppDataCacheProvider');
  }
  return ctx;
}
