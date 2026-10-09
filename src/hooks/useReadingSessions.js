// ⏱📚 読書の時間の記録を画面で使う（集中モード・写真で共有・2026-10-09）。
// 一覧は lib/readingSessions.js の 1 つの入れ物を全画面で共有する（読み込みは利用者ごとに 1 回）。
import { useEffect, useReducer } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { createReadingSessionStore } from '../lib/readingSessions';
import { useAuth } from './useAuth';

export const readingSessions = createReadingSessionStore({
  getClient: () => (isSupabaseConfigured ? supabase : null),
});

// 戻り値: { rows, loaded, save(row) }
export function useReadingSessions() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => readingSessions.subscribe(bump), []);
  useEffect(() => { readingSessions.load(userId); }, [userId]);
  return {
    rows: readingSessions.rows(),
    loaded: readingSessions.isLoaded(userId),
    save: (row) => readingSessions.save(userId, row),
  };
}

export default useReadingSessions;
