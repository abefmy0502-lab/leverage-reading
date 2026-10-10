// ⏱📚 読書の時間の記録を画面で使う（集中モード・写真で共有・2026-10-09）。
// 一覧は lib/readingSessions.js の 1 つの入れ物を全画面で共有する（読み込みは利用者ごとに 1 回）。
import { useEffect, useReducer } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { createReadingSessionStore } from '../lib/readingSessions';
import { useAuth, registerBeforeSignOut } from './useAuth';

export const readingSessions = createReadingSessionStore({
  getClient: () => (isSupabaseConfigured ? supabase : null),
});

// 🚪 ログアウトの前に、途中の集中モードを記録してから途中の状態を消す（2026-10-10 監査）。
//   端末の控えは利用者ごとの鍵なので、次にログインした別の人には数えない。
registerBeforeSignOut((userId) => readingSessions.flushBeforeSignOut(userId));

// 戻り値: { rows, loaded, save(row) }
export function useReadingSessions() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => readingSessions.subscribe(bump), []);
  // 読み込みの失敗は中で扱う（控えで数える）。思わぬ例外も未処理の Promise にしない（2026-10-10 第 9 回 総点検）。
  useEffect(() => { readingSessions.load(userId).catch(() => {}); }, [userId]);
  // 読み込みに失敗していたら、つながったとき・画面に戻ったときにもう一度（端末の控えもそのとき表に送る）。
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return undefined;
    const retry = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      readingSessions.load(userId).then(() => { if (readingSessions.hasLocal()) readingSessions.syncLocal(userId); }).catch(() => {});
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [userId]);
  return {
    rows: readingSessions.rows(),
    loaded: readingSessions.isLoaded(userId),
    save: (row) => readingSessions.save(userId, row),
  };
}

export default useReadingSessions;
