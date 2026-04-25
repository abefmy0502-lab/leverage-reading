import { useState, useEffect, useCallback } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';

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

export function useBookMemos(bookId, { sortBy = 'page' } = {}) {
  const { user } = useAuth();
  const [memos, setMemos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isUsableBookId = Boolean(bookId) && UUID_RE.test(bookId);

  const fetchMemos = useCallback(async () => {
    if (!user || !isSupabaseConfigured || !isUsableBookId) {
      setMemos([]);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from('book_memos')
        .select('*')
        .eq('book_id', bookId)
        .eq('user_id', user.id);

      if (sortBy === 'page') {
        query = query
          .order('page_number', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setMemos((data || []).map(transformMemo));
      setError(null);
    } catch (e) {
      console.error('book_memos fetch error', e);
      setError(e);
      setMemos([]);
    } finally {
      setLoading(false);
    }
  }, [user, bookId, sortBy, isUsableBookId]);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

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
      await fetchMemos();
      return transformMemo(data);
    } catch (e) {
      if (photoPath) await removePhoto(photoPath);
      throw e;
    }
  };

  const updateMemo = async (memoId, { pageNumber, text, photoFile, tags, removePhotoFlag }) => {
    if (!user || !isSupabaseConfigured) throw new Error('Supabase 未接続');
    const { data: existing, error: gErr } = await supabase
      .from('book_memos')
      .select('photo_path')
      .eq('id', memoId)
      .single();
    if (gErr) throw gErr;

    let photoPath = existing?.photo_path || null;
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
      if (photoFile && photoPath && photoPath !== existing?.photo_path) await removePhoto(photoPath);
      throw upErr;
    }

    if (oldToDelete) await removePhoto(oldToDelete);
    await fetchMemos();
    return transformMemo(data);
  };

  const deleteMemo = async (memoId) => {
    if (!user || !isSupabaseConfigured) return;
    const { data: existing } = await supabase
      .from('book_memos')
      .select('photo_path')
      .eq('id', memoId)
      .single();
    const { error: delErr } = await supabase.from('book_memos').delete().eq('id', memoId);
    if (delErr) throw delErr;
    if (existing?.photo_path) await removePhoto(existing.photo_path);
    await fetchMemos();
  };

  return {
    memos,
    loading,
    error,
    isUsableBookId,
    refresh: fetchMemos,
    createMemo,
    updateMemo,
    deleteMemo,
  };
}
