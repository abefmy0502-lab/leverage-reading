// 👤 登録せずに始める（2026-11-19・App 審査 5.1.1(v)「登録しないと課金できない」の直し）。
//
// - 「登録せずに始める」で Supabase の匿名のアカウントを作る（メール・名前は聞かない）。本・メモ・行動・課金はそのアカウントに入る。
// - あとで設定の「アカウントを作る」から Apple ID かメールアドレスをつなぐと、同じアカウントのまま（利用者の id は変わらない）
//   ほかの端末でも使えるようになる。つながない間は、アプリを消すとそのアカウントに戻れない。
// - Supabase の設定で「匿名のサインイン」と「手動でつなぐ（Manual linking）」を有効にしておく（docs: company/launch-2026-11/review-2026-11-19.md）。
// - 無料の AI の量は、はじめの月の多い量にしない（api/claude.js・App.jsx）。
import { supabase, isDemo } from './supabase';
import { isNativeApple } from './appleAuth';

const demoParams = isDemo && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const demoNative = Boolean(demoParams && demoParams.get('native') === '1');
// 🧪 お試しモードの &native=1: ログインの画面をアプリと同じ並びで撮る（Apple のボタンあり・Web だけの行なし）
export const NATIVE_PREVIEW = demoNative;
// 🧪 &apple=wait: Apple の画面が返ってこない（「サインイン中…」と「やめる」を撮る）
export const DEMO_APPLE_WAIT = Boolean(demoParams && demoParams.get('apple') === 'wait');
// 🧪 &linkfail=apple|email: つなぐときのエラー（もう使われている）を撮る
export const DEMO_LINK_FAIL = demoParams ? demoParams.get('linkfail') || '' : '';

// 入口を出すのは iPhone・iPad のアプリだけ（Web はアプリへの案内の画面なので出さない）。お試しモードは &native=1。
export const GUEST_START_AVAILABLE = isNativeApple || demoNative || import.meta.env.VITE_GUEST_WEB === 'true';

/** 登録せずに始めた人か（Apple・メールをまだつないでいない） */
export function isGuestUser(user) {
  return !!user && user.is_anonymous === true;
}

/** 匿名のアカウントで始める */
export async function startAsGuest() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data;
}

/** いまのアカウントにメールアドレスをつなぐ（確認のメールのリンクを開くとつながる）。パスワードは同時に決める。 */
export async function linkEmailToCurrentUser(email, password) {
  if (DEMO_LINK_FAIL === 'email') { const e = new Error('A user with this email address has already been registered'); e.code = 'email_exists'; throw e; } // 🧪
  const redirect = typeof window !== 'undefined' && !isNativeApple ? window.location.origin : undefined;
  const opts = redirect ? { emailRedirectTo: redirect } : undefined;
  const attrs = password ? { email, password } : { email };
  const { data, error } = await supabase.auth.updateUser(attrs, opts);
  if (!error) return data;
  // メールと同時のパスワードを断る設定・版のときは、メールだけで送る（パスワードはメールの確認のあと「パスワードをお忘れの方」で決められる）
  if (password && /password/i.test(String(error.message || '')) && !/weak|short|least|characters/i.test(String(error.message || ''))) {
    const retry = await supabase.auth.updateUser({ email }, opts);
    if (retry.error) throw retry.error;
    return { ...retry.data, passwordSkipped: true };
  }
  throw error;
}

/** つなぐときのエラーを利用者の言葉に（null＝ほかの共通の文に任せる） */
export function linkErrorMessage(err) {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  if (code === 'identity_already_exists' || msg.includes('already linked') || msg.includes('identity is already')) {
    return 'この Apple ID は、もう別のアカウントで使われています。いまのアカウントには、メールアドレスでつないでください。';
  }
  if (code === 'email_exists' || msg.includes('already been registered') || msg.includes('already registered')) {
    return 'このメールアドレスは、もう別のアカウントで使われています。ほかのメールアドレスか、Apple でつないでください。';
  }
  if (code === 'manual_linking_disabled' || msg.includes('manual linking')) {
    return 'いまはアカウントをつなげません。しばらくしてから、もう一度お試しください。';
  }
  if (code === 'apple_authorize_timeout' || code === 'apple_session_timeout') {
    return 'Apple でのつなぎ方が終わりませんでした。もう一度押すか、メールアドレスでつないでください。';
  }
  return null;
}
