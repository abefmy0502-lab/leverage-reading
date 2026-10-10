import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
// push.js は App.jsx 等から static import 済み（= 主バンドルに常在）。ここだけ
// dynamic import すると「同一モジュールの static/dynamic 混在」でビルド警告が出て
// コード分割も効かないため、static に統一する。
import { unsubscribeFromPush } from '../lib/push';
import { isNative } from '../lib/iap';
import { unsubscribeNativePush } from '../lib/nativePush';
import { clearFirstDayDeviceData } from '../lib/firstDay';

// 🔐 認証状態はアプリ全体で 1 つだけ持つ（AuthProvider）。
// 以前は useAuth() を呼ぶ約 20 箇所がそれぞれ getSession() と onAuthStateChange を
// 張っていたため、supabase-js 内部のセッション lock を奪い合い、通信不調時に
// 「Lock was not released within 5000ms」「Lock broken by another request with the
// 'steal' option」が大量に出て、トークン更新のリトライも多重化していた。
// 各画面の useAuth() は Context を読むだけにし、戻り値の形は従来と同一に保つ。
const AuthContext = createContext(null);

const AUTH_TIMEOUT_MS = 10000;

async function signUpWithEmail(email, password, displayName) {
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
}

async function signInWithEmail(email, password) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function resendConfirmation(email) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
}

async function sendPasswordResetEmail(email) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
  });
  if (error) throw error;
}

// 🚪 ログアウトの前に（まだ表に書けるうちに）片付けるもの（2026-10-10 監査）。
// 例: 読書の時間（hooks/useReadingSessions.js）＝途中の集中モードを 1 回分として残し、途中の状態を消す。
// useAuth を読むモジュールから登録する（ここから import すると循環するため）。失敗してもログアウトは止めない。
const beforeSignOut = new Set();
export function registerBeforeSignOut(fn) {
  beforeSignOut.add(fn);
  return () => beforeSignOut.delete(fn);
}
export async function runBeforeSignOut(userId) {
  for (const fn of [...beforeSignOut]) {
    // eslint-disable-next-line no-await-in-loop
    try { await fn(userId); } catch { /* 止めない */ }
  }
}

async function signOut() {
  if (!isSupabaseConfigured) return;
  let userId = null;
  try { userId = (await supabase.auth.getSession())?.data?.session?.user?.id || null; } catch { userId = null; }
  await runBeforeSignOut(userId);
  // 共有端末対策①: 想起プッシュの購読をこの端末から解除する（サインアウト前・
  // RLS で自分の行を消せるうちに）。解除しないと、次に別のアカウントが使う
  // 端末に前ユーザーのメモ通知（本文抜粋つき）が届き続ける。失敗しても
  // サインアウト自体は止めない。
  // iOS アプリは APNs の購読（platform='ios'）なので、Web 用とは別に解除する（以前は Web 用しか
  // 解除しておらず、同じ iPhone で別アカウントに替えると前の人のメモが届いていた）。
  try {
    if (isNative) {
      await unsubscribeNativePush();
    } else {
      await unsubscribeFromPush();
    }
  } catch { /* ignore */ }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  // 共有端末対策②: 弱い PII になりうる自前 localStorage キャッシュ（書影検索の
  // クエリ/結果）をサインアウト時に消す。設定（オンボ完了・メモモード・解析
  // オプトアウト等）は保持。in-memory のメモ/写真キャッシュは AppDataCache 側で
  // onAuthStateChange('SIGNED_OUT') を購読して clearAll される。
  try { window.localStorage.removeItem('bookSearchCache'); } catch { /* ignore */ }
  // 初日の印（はじめての相談・10 件・選んだ道）と、ホームの前回のメモの件数（lib/firstDay.js・2026-10-02）。
  try { clearFirstDayDeviceData(); } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
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
      return undefined;
    }

    let active = true;
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
      // タブ/App の復帰（SIGNED_IN）や 1 時間ごとの TOKEN_REFRESHED でも、中身が同じ
      // ユーザーの別オブジェクトが届く。そのまま入れると [user] に依存する処理が全部
      // 走り直し、課金の確認→読み込み表示でアプリ全体が作り直されて書きかけが消える。
      // 同じ人（id とメールが同じ）なら前のオブジェクトを使い続ける。
      const next = session?.user ?? null;
      setUser((prev) => (prev && next && prev.id === next.id && prev.email === next.email ? prev : next));
      setLoading(false);
      setAuthTimedOut(false);
    });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    authTimedOut,
    signUpWithEmail,
    signInWithEmail,
    sendPasswordResetEmail,
    resendConfirmation,
    signOut,
  }), [user, loading, authTimedOut]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Provider の外で呼ぶのはプログラムの誤り。黙って loading=true を返すと
    // 「永久ローディング」の再来になるので、はっきり落として気づけるようにする。
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
