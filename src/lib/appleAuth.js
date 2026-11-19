// 🍎 Sign in with Apple — Web / iOS(Capacitor) 両対応の薄いラッパ。
//
// 設計（iap.js / nativePush.js と同流儀）:
//   - iOS(ネイティブ): @capacitor-community/apple-sign-in を **dynamic import** で
//     ロードし、ネイティブの Apple フローで idToken(+nonce) を取得 →
//     supabase.auth.signInWithIdToken({ provider:'apple', token, nonce }) でセッション化。
//     プラグイン未導入でも Web バンドルに影響せず、呼び出し側は throw を捕捉して
//     メール認証にフォールバックできる。
//   - Web(ブラウザ/PWA): supabase.auth.signInWithOAuth({ provider:'apple' }) で
//     Apple のリダイレクト認証に飛ばす（メール確認不要）。
//   - graceful degradation 最優先: Supabase 未設定 / プラグイン未導入 / ユーザーキャンセルは
//     いずれも静かに扱えるよう、呼び出し側で分岐しやすいエラーを投げる。
//
// ⚠️ 実機で動かすための外部設定（コードだけでは完結しない）:
//   1. Apple Developer:
//      - App ID で "Sign In with Apple" capability を有効化
//      - Service ID を作成（Web 経路の client_id）
//      - サインイン用の秘密鍵(.p8)を発行（Key ID を控える）
//   2. Supabase Dashboard → Authentication → Providers → Apple を有効化:
//      - Service ID / Team ID / Key ID / .p8 の中身を登録
//      - Redirect URL（Supabase が発行する `/auth/v1/callback`）を Apple 側の
//        Return URLs に登録
//   3. iOS(Xcode): App のターゲットに "Sign in with Apple" capability を追加し、
//      `npm i @capacitor-community/apple-sign-in` 後に `npx cap sync`。
//
// これらが未設定の場合、ボタンは押せてもエラーになる（Web は Apple/Supabase 側で、
// iOS はプラグイン未導入で）。UI 側は isAppleSignInAvailable() で iOS のみ常時表示、
// Web は任意表示にできる。

import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured } from './supabase';

// ネイティブ(Capacitor iOS)実行時のみ true。
export const isNativeApple = Capacitor.isNativePlatform();

// ランダム nonce（ネイティブ Apple フローのリプレイ防止）。Apple には SHA-256 の
// ハッシュを渡し、Supabase には生の nonce を渡して突き合わせる。
function randomNonce(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  (globalThis.crypto || window.crypto).getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[arr[i] % chars.length];
  return out;
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await (globalThis.crypto || window.crypto).subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 待ちの上限（2026-11-19・App 審査 2.1(a)「サインイン中… のまま」）。
// 長すぎると、直しが効かない端末でまた止まって見える。パスワードを打つ人もいるので 60 秒（終わらなければもう一度押してもらう）。
// ボタンの下の「やめる」でもすぐ戻せる（AuthScreen）。返ってきたあとの Supabase は短め。
export const APPLE_AUTHORIZE_TIMEOUT_MS = 60000;
export const APPLE_SESSION_TIMEOUT_MS = 30000;

/** p が ms 以内に終わらなければ code つきのエラーで終える */
export function withTimeout(p, ms, code) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => { const e = new Error(code); e.code = code; reject(e); }, ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

let _plugin = null;
async function loadPlugin() {
  if (!isNativeApple) return null;
  if (_plugin) return _plugin;
  try {
    const mod = await import('@capacitor-community/apple-sign-in');
    _plugin = mod.SignInWithApple;
    return _plugin;
  } catch {
    return null; // プラグイン未導入 = ネイティブ経路は使えない（fail-safe）
  }
}

// UI がボタンを出すかの判定。iOS は常に出す（HIG 準拠）。Web は Apple/Supabase の
// 設定が済んでいれば出せるが、その真偽はクライアントから確実には分からないため、
// 呼び出し側で明示フラグ（例: 環境変数）と併用するのを推奨。ここでは
// 「Supabase 設定済み」を最低条件として返す。
export function isAppleSignInAvailable() {
  return isSupabaseConfigured;
}

// ネイティブの Apple の画面で idToken を受け取る（時間の上限つき）。キャンセルは e.canceled。
async function authorizeNative(plugin) {
  const rawNonce = randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);
  let res;
  try {
    res = await withTimeout(plugin.authorize({
      // Apple にはハッシュ化した nonce を渡す（Supabase 側で生 nonce と突合）。
      nonce: hashedNonce,
      scopes: 'name email',
    }), APPLE_AUTHORIZE_TIMEOUT_MS, 'apple_authorize_timeout');
  } catch (err) {
    if (err?.code === 'apple_authorize_timeout') throw err;
    // ユーザーキャンセル等は呼び出し側で静かに扱えるようフラグ化。
    const e = new Error(err?.message || 'apple-authorize-failed');
    e.canceled = /cancel/i.test(String(err?.message || '')) || err?.code === '1001';
    throw e;
  }
  const idToken = res?.response?.identityToken;
  if (!idToken) throw new Error('apple-no-identity-token');
  const fullName = [res?.response?.givenName, res?.response?.familyName].filter(Boolean).join(' ').trim();
  return { idToken, rawNonce, fullName };
}

// 初回のみ Apple が氏名を返す（2回目以降は null）。表示名が空なら埋める。
// 待たない（ここで待つと、つながりにくいときにサインインが終わらない）。
function fillDisplayName(user, fullName) {
  if (!fullName || !user || user.user_metadata?.display_name) return;
  supabase.auth.updateUser({ data: { display_name: fullName } }).catch(() => { /* 任意 */ });
}

// 登録せずに始めた人（匿名）のいまのアカウントに Apple ID をつなぐ（2026-11-19・App 審査 5.1.1(v)）。
// 本・メモ・課金はそのまま引き継ぐ（利用者の id は変わらない）。Supabase の「手動でつなぐ」が有効なことが前提。
export async function linkAppleToCurrentUser() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  if (isNativeApple) {
    const plugin = await loadPlugin();
    if (!plugin) {
      const e = new Error('apple-plugin-missing');
      e.code = 'plugin_missing';
      throw e;
    }
    const { idToken, rawNonce, fullName } = await authorizeNative(plugin);
    const { data, error } = await withTimeout(supabase.auth.linkIdentity({
      provider: 'apple',
      token: idToken,
      nonce: rawNonce,
    }), APPLE_SESSION_TIMEOUT_MS, 'apple_session_timeout');
    if (error) throw error;
    fillDisplayName(data?.user, fullName);
    return data;
  }
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'apple',
    options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
  });
  if (error) throw error;
  return data;
}

// Apple でサインイン。成功で Supabase セッションが確立する（onAuthStateChange が発火）。
// キャンセルは { canceled: true } を投げる想定で、呼び出し側はトーストを出さない。
export async function signInWithApple() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  if (isNativeApple) {
    const plugin = await loadPlugin();
    if (!plugin) {
      const e = new Error('apple-plugin-missing');
      e.code = 'plugin_missing';
      throw e;
    }
    const { idToken, rawNonce, fullName } = await authorizeNative(plugin);
    const { data, error } = await withTimeout(supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
      nonce: rawNonce,
    }), APPLE_SESSION_TIMEOUT_MS, 'apple_session_timeout');
    if (error) throw error;
    fillDisplayName(data?.user, fullName);
    return data;
  }

  // Web 経路: Apple のリダイレクト認証（メール確認不要）。戻り先は現在のオリジン。
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
  return data; // リダイレクトが発生するため、以降のコードは通常実行されない。
}
