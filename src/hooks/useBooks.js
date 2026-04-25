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
      };

      let savedBookId;
      const isUUID = UUID_RE.test(book.id || '');

      if (isUUID) {
        const { error } = await supabase.from('books').update(bookData).eq('id', book.id);
        if (error) throw error;
        savedBookId = book.id;
      } else {
        const { data, error } = await supabase
          .from('books')
          .insert([bookData])
          .select()
          .single();
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

  return {
    books,
    loading,
    saveBook,
    deleteBook,
    refreshBooks: fetchBooks,
  };
}
