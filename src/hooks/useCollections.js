import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';

const transformCollection = (c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  color: c.color,
  position: c.position,
  memoTexts: c.memo_texts || [],
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

export function useCollections() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchCollections = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setCollections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setCollections((data || []).map(transformCollection));
    } catch (error) {
      console.error('コレクション取得エラー:', error);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchCollections();
    } else {
      setCollections([]);
      setLoading(false);
    }
  }, [user, fetchCollections]);

  const createCollection = async ({ name, description = null, color = null, memoTexts = [] }) => {
    if (!user || !isSupabaseConfigured) return null;
    const position = collections.length;
    const { data, error } = await supabase
      .from('collections')
      .insert([
        {
          user_id: user.id,
          name,
          description,
          color,
          position,
          memo_texts: memoTexts,
        },
      ])
      .select()
      .single();
    if (error) {
      console.error('コレクション作成エラー:', error);
      throw error;
    }
    await fetchCollections();
    return transformCollection(data);
  };

  const updateCollection = async (id, updates) => {
    if (!user || !isSupabaseConfigured) return;
    const payload = {};
    if ('name' in updates) payload.name = updates.name;
    if ('description' in updates) payload.description = updates.description;
    if ('color' in updates) payload.color = updates.color;
    if ('position' in updates) payload.position = updates.position;
    if ('memoTexts' in updates) payload.memo_texts = updates.memoTexts;

    const { error } = await supabase
      .from('collections')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      console.error('コレクション更新エラー:', error);
      throw error;
    }
    await fetchCollections();
  };

  const deleteCollection = async (id) => {
    if (!user || !isSupabaseConfigured) return;
    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      console.error('コレクション削除エラー:', error);
      throw error;
    }
    await fetchCollections();
  };

  return {
    collections,
    loading,
    createCollection,
    updateCollection,
    deleteCollection,
    refreshCollections: fetchCollections,
  };
}
