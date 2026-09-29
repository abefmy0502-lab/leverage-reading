import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { validateImageFile, ALLOWED_IMAGE_EXT } from '../lib/limits';
import { track, EVENTS } from '../lib/analytics';

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
    // 動的 import: 写真アップロード時しか使わない 57KB 級のライブラリを
    // 初回バンドルから外す（ZXing / Sentry と同じ流儀）。
    const { default: imageCompression } = await import('browser-image-compression');
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
  // Defense-in-depth: re-validate at the storage boundary even though the
  // editor already checked. Cheap, prevents bypass via direct hook callers.
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const compressed = await compressForUpload(file);
  const rawExt = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = ALLOWED_IMAGE_EXT.includes(rawExt) ? rawExt : 'jpg';
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
  // mutation が「クロージャに閉じ込めた古い rawMemos」から次状態を計算すると、
  // 素早い連続操作（スワイプ削除2連続など）で先の変更が巻き戻る。常に最新を
  // 参照できるよう ref を同期させ、mutation は updater 関数で書く。
  const rawMemosRef = useRef(rawMemos);

  // 開いたら true に戻す（開発中の StrictMode は「開く→閉じる→開く」を二度行うので、
  // 閉じたときの false のままだと読み込みが終わっても loading が消えなかった）。
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // 同じフックのまま別の本に切り替わったら、前の本のメモを持ち越さない
  // （前の本のメモが一瞬出る・その間に書いたメモが前の本の一覧ごと新しい本のキャッシュに入る事故の防止）。
  const lastBookIdRef = useRef(bookId);
  if (lastBookIdRef.current !== bookId) {
    lastBookIdRef.current = bookId;
    const seeded = isUsableBookId ? (cache.getMemos(bookId) || []) : [];
    rawMemosRef.current = seeded;
  }
  useEffect(() => {
    const cached = isUsableBookId ? cache.getMemos(bookId) : null;
    const seeded = cached || [];
    rawMemosRef.current = seeded;
    setRawMemos(seeded);
    // キャッシュが無い本に切り替わったら、取得が終わるまで「読み込み中」（空の一覧を一瞬出してから
    // メモで押し下げると画面が跳ねる・2026-09-29）。
    if (isUsableBookId && !cached) setLoading(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const writeBoth = useCallback(
    (nextOrUpdater) => {
      const next = typeof nextOrUpdater === 'function'
        ? nextOrUpdater(rawMemosRef.current)
        : nextOrUpdater;
      rawMemosRef.current = next;
      setRawMemos(next);
      if (isUsableBookId) cache.setMemos(bookId, next);
    },
    [bookId, isUsableBookId, cache]
  );

  // リクエスト世代トークン。同一フックインスタンスで bookId が切り替わった時、
  // 遅れて解決した旧 bookId のレスポンスが state を上書きして「別の本のメモが
  // 表示されたまま」になるアウトオブオーダーを防ぐ（キャッシュへの書込は
  // bookId 付きクロージャなので stale でも安全 = 温存する）。
  const fetchGenRef = useRef(0);

  const fetchMemos = useCallback(
    async ({ silent = false } = {}) => {
      const gen = ++fetchGenRef.current;
      const isCurrent = () => aliveRef.current && gen === fetchGenRef.current;
      if (!user || !isSupabaseConfigured || !isUsableBookId) {
        writeBoth([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        // 同時同一 bookId の取得は 1 本の Promise に相乗り（App の currentMemoOps と
        // BookMemoList の二重フェッチを 1 クエリに）。
        const fresh = await cache.dedupeMemoFetch(bookId, async () => {
          const { data, error: qErr } = await supabase
            .from('book_memos')
            .select('*')
            .eq('book_id', bookId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
          if (qErr) throw qErr;
          return (data || []).map(transformMemo);
        });
        if (isCurrent()) {
          writeBoth(fresh);
          setError(null);
        } else {
          // Unmounted / superseded during fetch — still update the cache so
          // the next mount (of this bookId) sees fresh data.
          if (isUsableBookId) cache.setMemos(bookId, fresh);
        }
      } catch (e) {
        console.error('book_memos fetch error', e);
        if (isCurrent()) setError(e);
      } finally {
        if (isCurrent()) setLoading(false);
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
      rawMemosRef.current = next;
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
      writeBoth((prev) => [...prev, inserted]);
      // 📊 計測（新規作成パスのみ・insert 成功後）。PII は送らず enum/真偽のみ。
      track(EVENTS.MEMO_ADDED, {
        mode: 'card',
        has_photo: Boolean(inserted.photoPath),
        has_page: Number.isFinite(inserted.pageNumber),
      });
      return inserted;
    } catch (e) {
      if (photoPath) await removePhoto(photoPath);
      throw e;
    }
  };

  const updateMemo = async (memoId, { pageNumber, text, photoFile, tags, removePhotoFlag }) => {
    if (!user || !isSupabaseConfigured) throw new Error('Supabase 未接続');
    const existing = rawMemosRef.current.find((m) => m.id === memoId);
    let photoPath = existing?.photoPath || null;
    let oldToDelete = null;
    // この update で「今アップロードした」新写真。DB 更新が失敗したら孤児に
    // なるので、catch で Storage から消す（旧写真 oldToDelete は温存）。
    let newlyUploaded = null;

    if (photoFile) {
      // アップロードは時間がかかる。失敗時 (回線断など) はそのまま伝播させ、
      // 呼び出し側 (BookMemoEditor) の保存ボタン loading が解除される。
      const newPath = await uploadPhoto(photoFile, user.id, bookId);
      newlyUploaded = newPath;
      if (photoPath) oldToDelete = photoPath;
      photoPath = newPath;
    } else if (removePhotoFlag && photoPath) {
      oldToDelete = photoPath;
      photoPath = null;
    }

    try {
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
      if (upErr) throw upErr;

      // DB 更新成功後にのみ旧写真を破棄する（失敗時は旧写真を残して復元可能に）。
      if (oldToDelete) {
        await removePhoto(oldToDelete);
        cache.invalidatePhotoUrl(oldToDelete);
      }
      const updated = transformMemo(data);
      writeBoth((prev) => prev.map((m) => (m.id === memoId ? updated : m)));
      return updated;
    } catch (e) {
      // (a) 孤児防止: この update でアップロードした新写真だけ削除。旧写真には
      //     触れない（DB の photo_path は旧値のままなので整合する）。
      if (newlyUploaded) {
        try {
          await removePhoto(newlyUploaded);
        } catch (cleanupErr) {
          // 後始末の失敗は本筋のエラーを覆い隠さない
          console.error('orphan photo cleanup failed', cleanupErr);
        }
      }
      // (b) 失敗を握り潰さず呼び出し側へ伝播
      throw e;
    }
  };

  const deleteMemo = async (memoId) => {
    if (!user || !isSupabaseConfigured) return;
    const target = rawMemosRef.current.find((m) => m.id === memoId);
    const { error: delErr } = await supabase.from('book_memos').delete().eq('id', memoId);
    if (delErr) throw delErr;
    if (target?.photoPath) {
      await removePhoto(target.photoPath);
      cache.invalidatePhotoUrl(target.photoPath);
    }
    writeBoth((prev) => prev.filter((m) => m.id !== memoId));
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
    writeBoth((prev) => [...prev, inserted]);
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
