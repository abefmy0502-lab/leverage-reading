import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toHttps = (url) => {
  if (!url || typeof url !== 'string') return url;
  return url.startsWith('http://') ? 'https://' + url.slice(7) : url;
};

const transformBook = (book) => ({
  ...book,
  cover: toHttps(book.cover),
  tags: (book.book_tags || []).map((t) => t.tag_name),
  actions: [...(book.actions || [])].sort((a, b) =>
    (a.created_at || '').localeCompare(b.created_at || '')
  ),
  startDate: book.start_date,
  doneDate: book.done_date,
  currentPage: book.current_page,
  totalPages: book.total_pages,
  investPurpose: book.invest_purpose,
  aiAnalysis: book.ai_analysis,
  aiStrategy: book.ai_strategy,
  leverageMemo: book.leverage_memo,
  aiSummary: book.ai_summary,
  roiSummary: book.roi_summary,
  // Default to 'search' for legacy rows that pre-date the column.
  addedVia: book.added_via || 'search',
  // ISBN/ASIN power Amazon Associate links (lib/amazonLink.js). They're
  // optional — links fall back to a title search when missing.
  isbn: book.isbn || '',
  asin: book.asin || '',
  // Multi-ISBN cover resolver で実際に表紙が取れた ISBN を記録する任意
  // カラム (supabase_books_cover_isbn.sql)。マイグレーション未適用の DB
  // では undefined のまま。
  coverIsbn: book.cover_isbn || '',
  // AI 選書から本を追加した時の元クエリ (supabase_books_source_query.sql)。
  // セットアップシートの投資目的にプレフィルする。マイグレーション未適用の
  // DB では undefined のまま空文字に縮退。
  sourceQuery: book.source_query || '',
});

export function useBooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchBooks = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setBooks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*, book_tags(tag_name), actions(*)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setBooks((data || []).map(transformBook));
    } catch (error) {
      console.error('本の取得エラー:', error);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchBooks();
    } else {
      setBooks([]);
      setLoading(false);
    }
  }, [user, fetchBooks]);

  const saveBook = async (book) => {
    if (!user || !isSupabaseConfigured) return null;

    try {
      const bookData = {
        user_id: user.id,
        title: book.title,
        author: book.author || null,
        cover: toHttps(book.cover) || null,
        status: book.status,
        rating: book.rating || 0,
        start_date: book.startDate || null,
        done_date: book.doneDate || null,
        current_page: book.currentPage || 0,
        total_pages: book.totalPages || 0,
        invest_purpose: book.investPurpose || null,
        ai_analysis: book.aiAnalysis || null,
        ai_strategy: book.aiStrategy || null,
        leverage_memo: typeof book.leverageMemo === 'string' ? book.leverageMemo : null,
        ai_summary: book.aiSummary || null,
        roi_summary: book.roiSummary || null,
        added_via: book.addedVia === 'manual' ? 'manual' : 'search',
        isbn: book.isbn ? String(book.isbn).replace(/[-\s]/g, '') : null,
        asin: book.asin ? String(book.asin).trim() : null,
      };
      // 任意カラム: マイグレーション未適用の DB だと UNDEFINED COLUMN エラーで
      // save が止まるため schema-error fallback で段階的に剥がす。
      //   1. cover_isbn (supabase_books_cover_isbn.sql)
      //   2. source_query (supabase_books_source_query.sql)
      const coverIsbnValue = book.coverIsbn ? String(book.coverIsbn).replace(/[-\s]/g, '') : null;
      // sourceQuery は明示的に空文字を NULL として書きたい (UI 上クリアした時)。
      // ただし sourceQuery プロパティが本オブジェクトに「存在しない」場合は
      // 触らないため、`'sourceQuery' in book` で意図的判別。
      const includeSourceQuery = Object.prototype.hasOwnProperty.call(book, 'sourceQuery');
      const sourceQueryValue = includeSourceQuery ? (book.sourceQuery || null) : undefined;

      let savedBookId;
      const isUUID = UUID_RE.test(book.id || '');

      // schema-error フォールバック付きヘルパー: 任意カラムが無い DB でも
      // 通常の保存は成功する。エラーメッセージに当該列名 or 'column' が
      // 含まれていたらその列を payload から落としてリトライする。
      const writeWithFallback = async (op) => {
        const fullPayload = { ...bookData };
        if (coverIsbnValue) fullPayload.cover_isbn = coverIsbnValue;
        if (includeSourceQuery) fullPayload.source_query = sourceQueryValue;
        let r = await op(fullPayload);
        if (!r.error) return r;
        let msg = String(r.error?.message || '');
        // source_query 列が無い → 落として再試行
        if (msg.includes('source_query') || (msg.includes('column') && includeSourceQuery)) {
          const without = { ...fullPayload };
          delete without.source_query;
          r = await op(without);
          if (!r.error) return r;
          msg = String(r.error?.message || '');
        }
        // cover_isbn 列が無い → 落として再試行
        if (msg.includes('cover_isbn') || (msg.includes('column') && coverIsbnValue)) {
          return op(bookData);
        }
        return r;
      };

      if (isUUID) {
        const { error } = await writeWithFallback((payload) =>
          supabase.from('books').update(payload).eq('id', book.id),
        );
        if (error) throw error;
        savedBookId = book.id;
      } else {
        const { data, error } = await writeWithFallback((payload) =>
          supabase.from('books').insert([payload]).select().single(),
        );
        if (error) throw error;
        savedBookId = data.id;
      }

      // Tags: delete + re-insert (no stable client-side ids)
      await supabase.from('book_tags').delete().eq('book_id', savedBookId);
      if (book.tags && book.tags.length > 0) {
        const tagInserts = book.tags.map((tag) => ({
          book_id: savedBookId,
          user_id: user.id,
          tag_name: tag,
        }));
        const { error } = await supabase.from('book_tags').insert(tagInserts);
        if (error) throw error;
      }

      // Actions: upsert by id, then delete removed rows
      const incoming = book.actions || [];
      const existingIds = incoming
        .map((a) => a.id)
        .filter((id) => typeof id === 'string' && UUID_RE.test(id));

      if (existingIds.length === 0) {
        await supabase.from('actions').delete().eq('book_id', savedBookId);
      } else {
        await supabase
          .from('actions')
          .delete()
          .eq('book_id', savedBookId)
          .not('id', 'in', `(${existingIds.join(',')})`);
      }

      if (incoming.length > 0) {
        const actionsPayload = incoming.map((a) => {
          const base = {
            book_id: savedBookId,
            user_id: user.id,
            text: a.text,
            deadline: a.deadline || null,
            done: a.done || false,
          };
          return a.id && UUID_RE.test(a.id) ? { id: a.id, ...base } : base;
        });
        const { error } = await supabase
          .from('actions')
          .upsert(actionsPayload, { onConflict: 'id' });
        if (error) throw error;
      }

      // Fetch fresh row with relations to return
      const { data: freshRow, error: freshErr } = await supabase
        .from('books')
        .select('*, book_tags(tag_name), actions(*)')
        .eq('id', savedBookId)
        .single();
      if (freshErr) throw freshErr;

      const savedBook = transformBook(freshRow);
      await fetchBooks();
      return savedBook;
    } catch (error) {
      console.error('本の保存エラー:', error);
      throw error;
    }
  };

  const deleteBook = async (bookId) => {
    if (!user || !isSupabaseConfigured) return;
    try {
      const { error } = await supabase.from('books').delete().eq('id', bookId);
      if (error) throw error;
      await fetchBooks();
    } catch (error) {
      console.error('本の削除エラー:', error);
      throw error;
    }
  };

  // Snapshot a book + all its related rows (tags / actions / memos) so we can
  // re-INSERT them after a true DB delete. Returns the raw rows; relation
  // arrays are nested under their relation name (book_tags, actions, book_memos).
  const captureBookSnapshot = async (bookId) => {
    if (!user || !isSupabaseConfigured || !bookId) return null;
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*, book_tags(*), actions(*), book_memos(*)')
        .eq('id', bookId)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('本のスナップショット取得エラー:', error);
      return null;
    }
  };

  // Re-INSERT a book + its relations from a snapshot (used by Undo).
  // Photos in book_memos are gone (Storage delete is non-undoable), so memos
  // are restored with photo_path: null. Caller is expected to surface that.
  const restoreBookFromSnapshot = async (snapshot) => {
    if (!snapshot || !user || !isSupabaseConfigured) return;
    const { book_tags = [], actions = [], book_memos = [], ...bookRow } = snapshot;
    // Reset updated_at so the restored row floats to the top of "更新順".
    const bookPayload = { ...bookRow, updated_at: new Date().toISOString() };

    const { error: bErr } = await supabase.from('books').insert([bookPayload]);
    if (bErr) throw bErr;

    if (book_tags.length > 0) {
      const tagRows = book_tags.map((t) => ({
        book_id: snapshot.id,
        user_id: user.id,
        tag_name: t.tag_name,
      }));
      const { error: tErr } = await supabase.from('book_tags').insert(tagRows);
      if (tErr) console.warn('タグ復元の一部失敗:', tErr);
    }

    if (actions.length > 0) {
      const actionRows = actions.map((a) => ({ ...a }));
      const { error: aErr } = await supabase.from('actions').insert(actionRows);
      if (aErr) console.warn('行動リスト復元の一部失敗:', aErr);
    }

    if (book_memos.length > 0) {
      const memoRows = book_memos.map((m) => ({ ...m, photo_path: null }));
      const { error: mErr } = await supabase.from('book_memos').insert(memoRows);
      if (mErr) console.warn('メモ復元の一部失敗:', mErr);
    }

    await fetchBooks();
  };

  return {
    books,
    loading,
    saveBook,
    deleteBook,
    captureBookSnapshot,
    restoreBookFromSnapshot,
    refreshBooks: fetchBooks,
  };
}
