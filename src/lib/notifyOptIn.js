// 🔔 思い出しの通知の「1 回だけの」案内（2026-09-29・SPEC §1-1 / §3）。
//
// 案内する時: はじめて「行動に追加」した直後／初日クイックスタートを終えた直後の、先に来たほう。
// 一度でも「閉じる」「通知を受け取る」を押したら二度と出さない。振り返りの思い出しカードの案内
// （Review.jsx）と同じ端末の印（PUSH_OPTIN_KEY）を使うので、どこで答えてもほかでは出ない。
// 押しつけない: 端末が通知を使えない・もう許可／拒否を決めている人には出さない
// （ブラウザのタブで開いた iPhone など、押しても通知が使えない人には案内しない）。
// 文は LP・FAQ と同じ約束（思い出しの通知は多くても週に 1 回・メモ 1 件・いつでもオフ）。
// スイッチは 1 つで、行動の期限の通知（期限の日の朝に 1 回）も同じスイッチで届く（2026-09-29 オーナー裁定）。
// 案内の文（NotifyOptInCard）・設定の説明にも「行動は期限の日の朝に 1 回」を必ず書く。

import { isPushSupported, isPushConfigured, getPermission, subscribeToPush } from './push';
import { isNativePushCapable, getNativePushPermission, subscribeNativePush } from './nativePush';
import { isDemo } from './supabase';

export const PUSH_OPTIN_KEY = 'orime-recall-push-optin-v1';

// 閉じた（まだ価値を感じる前の ×）は 14 日たったらもう一度だけ出してよい。受け取る・断った（'1'）はずっと出さない。
export const OPTIN_DISMISS_DAYS = 14;
export function isNotifyOptInDone(now = Date.now()) {
  try {
    if (typeof localStorage === 'undefined') return true;
    const v = localStorage.getItem(PUSH_OPTIN_KEY);
    if (v === '1') return true;
    if (!v) return false;
    const m = /^dismissed:(\d+):(\d+)$/.exec(v);
    if (!m) return true;
    const [, at, times] = m;
    if (Number(times) >= 2) return true; // もう一度閉じたら、それ以上は出さない
    return now - Number(at) < OPTIN_DISMISS_DAYS * 86400000;
  } catch {
    return true; // 覚えられない環境では出さない（毎回出るよりよい）
  }
}

// action: 'enabled' / 'denied' はずっと出さない。'dismiss'（×）は 14 日後にもう一度だけ。
export function markNotifyOptInDone(action = 'enabled', now = Date.now()) {
  try {
    if (action !== 'dismiss') { localStorage.setItem(PUSH_OPTIN_KEY, '1'); return; }
    const m = /^dismissed:\d+:(\d+)$/.exec(localStorage.getItem(PUSH_OPTIN_KEY) || '');
    const times = m ? Number(m[1]) + 1 : 1;
    localStorage.setItem(PUSH_OPTIN_KEY, `dismissed:${now}:${times}`);
  } catch { /* ignore */ }
}

// お試しモード（開発専用）: &notify=1 のときだけ「通知を使える人」として案内を出す（ほかの撮影を変えない）。
const demoNotify = () => {
  if (!isDemo || typeof window === 'undefined') return false;
  try { return new URLSearchParams(window.location.search).get('notify') === '1'; } catch { return false; }
};

// この端末で、案内を出してよいか（通知を使えて、まだ許可を決めていない）。
export async function canOfferNotify() {
  if (isDemo) return demoNotify();
  if (isNativePushCapable) {
    try { return (await getNativePushPermission()) === 'prompt'; } catch { return false; }
  }
  return isPushSupported() && isPushConfigured() && getPermission() === 'default';
}

// 通知をオンにする（必ずボタンを押した中で呼ぶ）。{ ok, reason }
export async function enableNotify() {
  if (isDemo) return { ok: true };
  return isNativePushCapable
    ? subscribeNativePush({ frequency: 'weekly' })
    : subscribeToPush({ frequency: 'weekly' });
}

// ⭐️ レビューの依頼と、通知の案内・許可の確認を同じ時に重ねない（2026-10-10）。案内を出した・許可を聞いた時刻を
//   この起動の間だけ覚え、そこから 1 分の間はレビューを頼まない（lib/reviewRequest.js を呼ぶ側が確かめる）。
let lastNotifyPromptAt = 0;
export function noteNotifyPrompt(at = Date.now()) {
  lastNotifyPromptAt = at;
}
export function notifyPromptedWithin(ms = 60000, now = Date.now()) {
  return lastNotifyPromptAt > 0 && now - lastNotifyPromptAt < ms;
}
