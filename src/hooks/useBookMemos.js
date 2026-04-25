import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useAppDataCache } from '../state/AppDataCache';

const BUCKET = 'book-memo-photos';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const transformMemo = (m) => ({
  id: m.id,
  bookId: m.book_id,
  pageNumber: m.page_number ?? null,
  text: m.text || '',
  photoPath: m.photo_path || null,
  tags: Array.isArray(m.tags) ? m.tags : [],
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function compressForUpload(file) {
  if (!file) return null;
  try {
    return await imageCompression(file, {
      maxSizeMB: 0.3,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
    });
  } catch {
    return file;
  }
}

async function uploadPhoto(file, userId, bookId) {
  const compressed = await compressForUpload(file);
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/${bookId}/${newId()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    upsert: false,
    contentType: compressed.type || file.type || 'image/jpeg',
  });
  if (error) throw error;
  return path;
}

async function removePhoto(path) {
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore — orphaned files can be GC'd later */
  }
}

// Legacy export — direct fetch without cache. Prefer the cache via
// useAppDataCache().fetchPhotoUrl in new code.
export async function getMemoPhotoUrl(path) {
  if (!path || !isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

function applySort(list, sortBy) {
  const arr = [...list];
  if (sortBy === 'page') {
    arr.sort((a, b) => {
      const ap = Number.isFinite(a.pageNumber);
      const bp = Number.isFinite(b.pageNumber);
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      if (ap && bp && a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  } else {
    arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  return arr;
}

export function useBookMemos(bookId, { sortBy = 'page' } = {}) {
  const { user } = useAuth();
  const cache = useAppDataCache();
  const isUsableBookId = Boolean(bookId) && UUID_RE.test(bookId);

  // Seed from cache so navigation feels instant.
  const initialFromCache = isUsableBookId ? cache.getMemos(bookId) : null;
  const [rawMemos, setRawMemos] = useState(initialFromCache || []);
  const [loading, setLoading] = useState(!initialFromCache && isUsableBookId);
  const [error, setError] = useState(null);
  const aliveRef = useRef(true);

  useEffect(() => () => {
    aliveRef.current = false;
  }, []);

  const writeBoth = useCallback(
    (next) => {
      setRawMemos(next);
      if (isUsableBookId) cache.setMemos(bookId, next);
    },
    [bookId, isUsableBookId, cache]
  );

  const fetchMemos = useCallback(
    async ({ silent = false } = {}) => {
      if (!user || !isSupabaseConfigured || !isUsableBookId) {
        writeBoth([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const { data, error: qErr } = await supabase
          .from('book_memos')
          .select('*')
          .eq('book_id', bookId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        if (qErr) throw qErr;
        const fresh = (data || []).map(transformMemo);
        if (aliveRef.current) {
          writeBoth(fresh);
          setError(null);
        } else {
          // Component unmounted during fetch — still update the cache so the
          // next mount sees fresh data.
          if (isUsableBookId) cache.setMemos(bookId, fresh);
        }
      } catch (e) {
        console.error('book_memos fetch error', e);
        if (aliveRef.current) setError(e);
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    },
    [user, bookId, isUsableBookId, cache, writeBoth]
  );

  // Refetch when bookId/user changes; if cache hit was already shown, refresh silently.
  useEffect(() => {
    fetchMemos({ silent: Boolean(initialFromCache) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, bookId]);

  // Stay in sync with mutations from other useBookMemos instances or cache writes.
  useEffect(() => {
    if (!isUsableBookId) return undefined;
    return cache.subscribeMemos(bookId, (next) => {
      setRawMemos(next);
    });
  }, [bookId, isUsableBookId, cache]);

  const memos = useMemo(() => applySort(rawMemos, sortBy), [rawMemos, sortBy]);

  // ===== Mutations =====
  const createMemo = async ({ pageNumber, text, photoFile, tags }) => {
    if (!user || !isUsableBookId || !isSupabaseConfigured) {
      throw new Error('メモを保存できません（本が未保存の可能性があります）');
    }
    let photoPath = null;
    if (photoFile) photoPath = await uploadPhoto(photoFile, user.id, bookId);
    try {
      const { data, error: insErr } = await supabase
        .from('book_memos')
        .insert([
          {
            book_id: bookId,
            user_id: user.id,
            page_number: Number.isFinite(pageNumber) ? pageNumber : null,
            text: text || '',
            photo_path: photoPath,
            tags: tags || [],
          },
        ])
        .select()
        .single();
      if (insErr) throw insErr;
      const inserted = transformMemo(data);
      writeBoth([...rawMemos, inserted]);
      return inserted;
    } catch (e) {
      if (photoPath) await removePhoto(photoPath);
      throw e;
    }
  };

  const updateMemo = async (memoId, { pageNumber, text, photoFile, tags, removePhotoFlag }) => {
    if (!user || !isSupabaseConfigured) throw new Error('Supabase 未接続');
    const existing = rawMemos.find((m) => m.id === memoId);
    let photoPath = existing?.photoPath || null;
    let oldToDelete = null;

    if (photoFile) {
      const newPath = await uploadPhoto(photoFile, user.id, bookId);
      if (photoPath) oldToDelete = photoPath;
      photoPath = newPath;
    } else if (removePhotoFlag && photoPath) {
      oldToDelete = photoPath;
      photoPath = null;
    }

    const { data, error: upErr } = await supabase
      .from('book_memos')
      .update({
        page_number: Number.isFinite(pageNumber) ? pageNumber : null,
        text: text || '',
        photo_path: photoPath,
        tags: tags || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoId)
      .select()
      .single();
    if (upErr) {
      if (photoFile && photoPath && photoPath !== existing?.photoPath) await removePhoto(photoPath);
      throw upErr;
    }

    if (oldToDelete) {
      await removePhoto(oldToDelete);
      cache.invalidatePhotoUrl(oldToDelete);
    }
    const updated = transformMemo(data);
    writeBoth(rawMemos.map((m) => (m.id === memoId ? updated : m)));
    return updated;
  };

  const deleteMemo = async (memoId) => {
    if (!user || !isSupabaseConfigured) return;
    const target = rawMemos.find((m) => m.id === memoId);
    const { error: delErr } = await supabase.from('book_memos').delete().eq('id', memoId);
    if (delErr) throw delErr;
    if (target?.photoPath) {
      await removePhoto(target.photoPath);
      cache.invalidatePhotoUrl(target.photoPath);
    }
    writeBoth(rawMemos.filter((m) => m.id !== memoId));
  };

  // Re-INSERT a previously-deleted memo from a snapshot (used by Undo).
  // The Storage photo is already gone (delete is non-reversible), so we restore
  // with photo_path: null. Caller is expected to surface that to the user.
  const restoreMemoFromSnapshot = async (snapshot) => {
    if (!snapshot || !user || !isSupabaseConfigured) return null;
    const payload = {
      id: snapshot.id,
      book_id: snapshot.bookId || bookId,
      user_id: user.id,
      page_number: Number.isFinite(snapshot.pageNumber) ? snapshot.pageNumber : null,
      text: snapshot.text || '',
      photo_path: null,
      tags: snapshot.tags || [],
    };
    if (snapshot.createdAt) payload.created_at = snapshot.createdAt;

    const { data, error: insErr } = await supabase
      .from('book_memos')
      .insert([payload])
      .select()
      .single();
    if (insErr) throw insErr;
    const inserted = transformMemo(data);
    writeBoth([...rawMemos, inserted]);
    return inserted;
  };

  // Pre-warm signed URLs for any memo with a photo so cards render the image
  // without a per-card round trip. Background only — no error surfacing.
  useEffect(() => {
    if (!isUsableBookId) return;
    const paths = rawMemos.map((m) => m.photoPath).filter(Boolean);
    if (paths.length === 0) return;
    cache.fetchPhotoUrlsBatch(paths).catch(() => {});
  }, [rawMemos, isUsableBookId, cache]);

  return {
    memos,
    loading,
    error,
    isUsableBookId,
    refresh: fetchMemos,
    createMemo,
    updateMemo,
    deleteMemo,
    restoreMemoFromSnapshot,
  };
}
