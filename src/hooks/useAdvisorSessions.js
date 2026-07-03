// 🕒 useAdvisorSessions — AI 選書アドバイザーの会話履歴
//
// 1 行 = 1 セッション (= 1 つの会話)。BookAdvisor が最初のメッセージを送る瞬間に
// createSession で 1 行作り、以降のターンで messages / recommended_books を
// updateSession で上書きしていく。本棚に追加した本の UUID は added_book_ids に
// 蓄積。
//
// テーブル未作成 (= supabase_advisor_sessions.sql 未実行) でもアプリは
// 動かしたいので、SELECT エラーは silent fail。available フラグで「履歴
// 機能が使えない (未マイグレーション)」を呼び出し側に伝える。

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { isSchemaError } from '../lib/errors';

// 「テーブルが無い」「列が無い」を検知するゆるい判定。
// 実体は lib/errors.js の isSchemaError（判定条件の唯一の真実）に委譲。
// 名前だけこのファイルの語彙（missing relation = 未マイグレーション）を維持。
function isMissingRelation(error) {
  return isSchemaError(error);
}

export function useAdvisorSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const listSessions = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setSessions([]);
      setLoaded(true);
      return [];
    }
    const { data, error } = await supabase
      .from('advisor_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      if (isMissingRelation(error)) {
        // マイグレーション未適用 — UI 側は履歴ボタンを隠す。
        setAvailable(false);
        setSessions([]);
        setLoaded(true);
        return [];
      }
      // 一過性のネットエラー等は available のまま
      // eslint-disable-next-line no-console
      console.warn('[advisorSessions] list failed:', error?.message || error);
      setLoaded(true);
      return [];
    }
    setAvailable(true);
    setSessions(data || []);
    setLoaded(true);
    return data || [];
  }, [user]);

  const createSession = useCallback(
    async ({ messages = [], recommendedBooks = [] }) => {
      if (!user || !isSupabaseConfigured || !available) return null;
      const { data, error } = await supabase
        .from('advisor_sessions')
        .insert({
          user_id: user.id,
          messages,
          recommended_books: recommendedBooks,
        })
        .select()
        .single();
      if (error) {
        if (isMissingRelation(error)) setAvailable(false);
        // eslint-disable-next-line no-console
        console.warn('[advisorSessions] create failed:', error?.message || error);
        return null;
      }
      setSessions((prev) => [data, ...prev]);
      return data;
    },
    [user, available],
  );

  const updateSession = useCallback(
    async (sessionId, patch) => {
      if (!sessionId || !user || !isSupabaseConfigured || !available) return null;
      const { data, error } = await supabase
        .from('advisor_sessions')
        .update(patch)
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[advisorSessions] update failed:', error?.message || error);
        return null;
      }
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? data : s)));
      return data;
    },
    [user, available],
  );

  const deleteSession = useCallback(
    async (sessionId) => {
      if (!sessionId || !user || !isSupabaseConfigured || !available) return;
      const { error } = await supabase
        .from('advisor_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user.id);
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[advisorSessions] delete failed:', error?.message || error);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    [user, available],
  );

  // 本を追加した時に added_book_ids へ UUID をプッシュ。
  const addBookToSession = useCallback(
    async (sessionId, bookId) => {
      if (!sessionId || !bookId || !available) return;
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const next = Array.from(new Set([...(session.added_book_ids || []), bookId]));
      await updateSession(sessionId, { added_book_ids: next });
    },
    [sessions, updateSession, available],
  );

  useEffect(() => {
    if (user) {
      listSessions();
    } else {
      setSessions([]);
      setLoaded(false);
    }
  }, [user, listSessions]);

  return {
    sessions,
    available,
    loaded,
    listSessions,
    createSession,
    updateSession,
    deleteSession,
    addBookToSession,
  };
}
