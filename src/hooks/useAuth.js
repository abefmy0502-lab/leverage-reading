import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUpWithEmail = async (email, password, displayName) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: displayName ? { display_name: displayName } : undefined,
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) throw error;
    return data;
  };

  const signInWithEmail = async (email, password) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const resendConfirmation = async (email) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) throw error;
  };

  const sendPasswordResetEmail = async (email) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) return;
    // 共有端末対策①: 想起プッシュの購読をこの端末から解除する（サインアウト前・
    // RLS で自分の行を消せるうちに）。解除しないと、次に別のアカウントが使う
    // 端末に前ユーザーのメモ通知（本文抜粋つき）が届き続ける。失敗しても
    // サインアウト自体は止めない。
    try {
      const { unsubscribeFromPush } = await import('../lib/push');
      await unsubscribeFromPush();
    } catch { /* ignore */ }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // 共有端末対策②: 弱い PII になりうる自前 localStorage キャッシュ（書影検索の
    // クエリ/結果）をサインアウト時に消す。設定（オンボ完了・メモモード・解析
    // オプトアウト等）は保持。in-memory のメモ/写真キャッシュは AppDataCache 側で
    // onAuthStateChange('SIGNED_OUT') を購読して clearAll される。
    try { window.localStorage.removeItem('bookSearchCache'); } catch { /* ignore */ }
  };

  return {
    user,
    loading,
    signUpWithEmail,
    signInWithEmail,
    sendPasswordResetEmail,
    resendConfirmation,
    signOut,
  };
}
