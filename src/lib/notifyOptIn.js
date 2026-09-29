// 🔔 思い出しの通知の「1 回だけの」案内（2026-09-29・SPEC §1-1 / §3）。
//
// 案内する時: はじめて「行動に追加」した直後／初日クイックスタートを終えた直後の、先に来たほう。
// 一度でも「閉じる」「通知を受け取る」を押したら二度と出さない。振り返りの思い出しカードの案内
// （Review.jsx）と同じ端末の印（PUSH_OPTIN_KEY）を使うので、どこで答えてもほかでは出ない。
// 押しつけない: 端末が通知を使えない・もう許可／拒否を決めている人には出さない
// （ブラウザのタブで開いた iPhone など、押しても通知が使えない人には案内しない）。
// 文は LP・FAQ と同じ約束（思い出しの通知は多くても週に 1 回・メモ 1 件・いつでもオフ）。

import { isPushSupported, isPushConfigured, getPermission, subscribeToPush } from './push';
import { isNativePushCapable, getNativePushPermission, subscribeNativePush } from './nativePush';
import { isDemo } from './supabase';

export const PUSH_OPTIN_KEY = 'orime-recall-push-optin-v1';

export function isNotifyOptInDone() {
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(PUSH_OPTIN_KEY) === '1';
  } catch {
    return true; // 覚えられない環境では出さない（毎回出るよりよい）
  }
}

export function markNotifyOptInDone() {
  try { localStorage.setItem(PUSH_OPTIN_KEY, '1'); } catch { /* ignore */ }
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
