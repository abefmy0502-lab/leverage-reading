import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
// push.js は App.jsx 等から static import 済み（= 主バンドルに常在）。ここだけ
// dynamic import すると「同一モジュールの static/dynamic 混在」でビルド警告が出て
// コード分割も効かないため、static に統一する。
import { unsubscribeFromPush } from '../lib/push';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // 🔴 Supabase が応答しない場合（プロジェクトの一時停止・ネットワーク不調・
  // キー不整合等）の保険。getSession() には元々タイムアウトが無く、応答が
  // 永久に来ないと loading=true のまま固まり、画面がローディングドットで
  // 無限に止まる事故が起きていた（実例: 数週間アクセスが無く Supabase 無料
  // プランのプロジェクトが自動一時停止 → 起動画面が永久ロード）。
  // タイムアウト後も購読は生かしたままにする — 遅れて応答が来れば正しく反映される。
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    const AUTH_TIMEOUT_MS = 10000;
    const timeoutId = setTimeout(() => {
      if (!active) return;
      setLoading(false);
      setAuthTimedOut(true);
    }, AUTH_TIMEOUT_MS);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      clearTimeout(timeoutId);
      setUser(session?.user ?? null);
      setLoading(false);
      setAuthTimedOut(false);
    }).catch(() => {
      if (!active) return;
      clearTimeout(timeoutId);
      setLoading(false);
      setAuthTimedOut(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      clearTimeout(timeoutId);
      setUser(session?.user ?? null);
      setLoading(false);
      setAuthTimedOut(false);
    });

    return () => {
      active = false;
      clearTimeout(timeoutId);
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
    authTimedOut,
    signUpWithEmail,
    signInWithEmail,
    sendPasswordResetEmail,
    resendConfirmation,
    signOut,
  };
}
