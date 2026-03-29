import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useBooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // 初回ロード
  useEffect(() => {
    if (user) {
      fetchBooks();
    } else {
      setBooks([]);
      setLoading(false);
    }
  }, [user]);

  // 本の一覧を取得（tags と actions を結合）
  const fetchBooks = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // 1. booksテーブルから取得
      const { data: booksData, error: booksError } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (booksError) throw booksError;

      // 2. 各bookのtagsとactionsを取得
      const booksWithRelations = await Promise.all(
        (booksData || []).map(async (book) => {
          // tags取得
          const { data: tagsData } = await supabase
            .from('book_tags')
            .select('tag_name')
            .eq('book_id', book.id);

          // actions取得
          const { data: actionsData } = await supabase
            .from('actions')
            .select('*')
            .eq('book_id', book.id)
            .order('created_at', { ascending: true });

          return {
            ...book,
            tags: (tagsData || []).map(t => t.tag_name),
            actions: actionsData || [],
            // Snake_caseをcamelCaseに変換
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
          };
        })
      );

      setBooks(booksWithRelations);
    } catch (error) {
      console.error('本の取得エラー:', error);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  // 本を保存（新規追加または更新）
  const saveBook = async (book) => {
    if (!user) return;

    try {
      // camelCase → snake_case 変換
      const bookData = {
        user_id: user.id,
        title: book.title,
        author: book.author || null,
        cover: book.cover || null,
        status: book.status,
        rating: book.rating || 0,
        start_date: book.startDate || null,
        done_date: book.doneDate || null,
        current_page: book.currentPage || 0,
        total_pages: book.totalPages || 0,
        invest_purpose: book.investPurpose || null,
        ai_analysis: book.aiAnalysis || null,
        ai_strategy: book.aiStrategy || null,
        leverage_memo: book.leverageMemo || null,
        ai_summary: book.aiSummary || null,
        roi_summary: book.roiSummary || null,
      };

      // 既存の本かチェック
      const { data: existingBook } = await supabase
        .from('books')
        .select('id')
        .eq('id', book.id)
        .single();

      let savedBookId = book.id;

      if (existingBook) {
        // 更新
        const { error } = await supabase
          .from('books')
          .update(bookData)
          .eq('id', book.id);
        if (error) throw error;
      } else {
        // 新規追加
        const { data, error } = await supabase
          .from('books')
          .insert([bookData])
          .select()
          .single();
        if (error) throw error;
        savedBookId = data.id;
      }

      // タグを更新（既存削除→新規追加）
      await supabase.from('book_tags').delete().eq('book_id', savedBookId);
      
      if (book.tags && book.tags.length > 0) {
        const tagInserts = book.tags.map(tag => ({
          book_id: savedBookId,
          user_id: user.id,
          tag_name: tag,
        }));
        await supabase.from('book_tags').insert(tagInserts);
      }

      // アクションを更新（既存削除→新規追加）
      await supabase.from('actions').delete().eq('book_id', savedBookId);
      
      if (book.actions && book.actions.length > 0) {
        const actionInserts = book.actions.map(action => ({
          book_id: savedBookId,
          user_id: user.id,
          text: action.text,
          deadline: action.deadline || null,
          done: action.done || false,
        }));
        await supabase.from('actions').insert(actionInserts);
      }

      // 再取得
      await fetchBooks();
    } catch (error) {
      console.error('本の保存エラー:', error);
      throw error;
    }
  };

  // 本を削除
  const deleteBook = async (bookId) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId);

      if (error) throw error;

      // 再取得
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
