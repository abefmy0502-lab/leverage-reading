// useBookCover — upload a manually-supplied cover image for a book.
//
// Stores into a public Supabase Storage bucket `book-covers` so the resulting
// public URL can be saved straight into `books.cover` (same column the
// search-flow stores Google Books / openBD URLs into). No signed-URL
// indirection — covers aren't sensitive, and treating them as plain URLs
// keeps every <img src> render path simple.
//
// Bucket setup is in supabase_added_via.sql (idempotent). Run that once in
// the Supabase SQL editor before this hook is exercised in production.

import { useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { validateImageFile, ALLOWED_IMAGE_EXT } from '../lib/limits';

const BUCKET = 'book-covers';

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function compressForCover(file) {
  if (!file) return null;
  try {
    // 動的 import: アップロード時のみ必要な 57KB 級ライブラリを初回バンドルから外す。
    const { default: imageCompression } = await import('browser-image-compression');
    return await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 800,
      useWebWorker: true,
    });
  } catch {
    return file;
  }
}

export function useBookCover() {
  const { user } = useAuth();

  const uploadCover = useCallback(async (file) => {
    if (!user || !isSupabaseConfigured) {
      throw new Error('ログインが必要です');
    }
    const validationError = validateImageFile(file);
    if (validationError) throw new Error(validationError);

    const compressed = await compressForCover(file);
    const rawExt = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ext = ALLOWED_IMAGE_EXT.includes(rawExt) ? rawExt : 'jpg';
    const path = `${user.id}/${newId()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, compressed, {
      upsert: false,
      contentType: compressed.type || file.type || 'image/jpeg',
    });
    if (uploadError) {
      // Helpful hint when the bucket hasn't been created yet.
      const hint =
        uploadError.statusCode === '404' || /bucket.*not.*found/i.test(uploadError.message || '')
          ? '`book-covers` バケットが未作成です。supabase_added_via.sql を Supabase SQL Editor で実行してください。'
          : uploadError.message || 'アップロードに失敗しました';
      throw new Error(hint);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }, [user]);

  return { uploadCover };
}
