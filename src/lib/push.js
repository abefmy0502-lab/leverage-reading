// 🔔 想起プッシュ通知 — クライアント側の購読/解除/機能検出。
//
// 設計方針（CLAUDE.md 思想ガード + 設計書 §2）:
//   - 完全オプトイン。ここに自動で許可を求める処理は無い。必ず UI 上の
//     ユーザージェスチャ（トグル ON）からのみ subscribeToPush() を呼ぶ。
//   - graceful degradation 最優先: 鍵未設定 / 非対応端末 / iOS タブ /
//     許可拒否 / Supabase 未設定 — どの経路でも throw せず静かに無効化する。
//   - 購読情報は RLS で本人限定の push_subscriptions に「クライアント直 upsert」。
//     送信のみ service_role の api/push-cron が担当。
//
// ⚠️ VAPID 公開鍵は import.meta.env.VITE_VAPID_PUBLIC_KEY。
//    未設定なら isPushSupported() が false を返し、UI 側は「準備中」表示に倒す。

import { supabase, isSupabaseConfigured } from './supabase';
import { getServiceWorkerRegistration } from './swUpdate';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// base64url の VAPID 公開鍵を applicationServerKey 用の Uint8Array に変換。
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// この端末が standalone（ホーム画面に追加した PWA）として起動しているか。
// iOS は Web Push に standalone 起動が必須。Android/Desktop は不問だが共通で使える。
export function isStandalonePWA() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch { /* ignore */ }
  // iOS Safari 独自プロパティ。
  return Boolean(window.navigator && window.navigator.standalone);
}

// だいたい iOS / iPadOS かどうか（A2HS 案内の出し分け用、厳密判定は不要）。
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSLike = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ は Mac を騙るのでタッチ有無で補完。
  const iPadOS = ua.includes('Macintosh') && 'ontouchend' in document;
  return iOSLike || iPadOS;
}

// Web Push がこの環境で利用可能か。
//   - SW / PushManager / Notification API が存在
//   - VAPID 公開鍵が設定済み
//   - iOS の場合は standalone 起動であること（タブ内は Push API 自体が無い）
// 1 つでも欠ければ false（UI は「未対応 / 準備中 / ホーム画面に追加」へ分岐）。
export function isPushSupported() {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;
  if (!VAPID_PUBLIC_KEY) return false;
  // iOS はタブ内だと PushManager がそもそも露出しないが、念のため standalone を要求。
  if (isIOS() && !isStandalonePWA()) return false;
  return true;
}

// VAPID 公開鍵が env に入っているか（UI の「準備中」表示判定に使う）。
export function isPushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY);
}

// 現在の通知許可状態（'default' | 'granted' | 'denied' | 'unsupported'）。
export function getPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

// 現在この端末が購読済みかどうかを返す（UI のトグル初期状態用）。
// 失敗時は false（throw しない）。
export async function isSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg || !reg.pushManager) return false;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

// 購読情報を push_subscriptions に upsert（RLS で本人限定）。
// frequency は思想ガードで既定 'weekly'。schema 未適用 / 未認証なら静かに諦める。
async function upsertSubscription(sub, { frequency = 'weekly' } = {}) {
  if (!isSupabaseConfigured || !supabase || !sub) return false;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;

    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys && json.keys.p256dh;
    const auth = json.keys && json.keys.auth;
    if (!endpoint || !p256dh || !auth) return false;

    const tzOffsetMin = -new Date().getTimezoneOffset(); // JST = +540

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          enabled: true,
          frequency,
          tz_offset_min: tzOffsetMin,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      );
    if (error) {
      // テーブル未適用（schema error）含め静かに無効化。
      console.warn('[push] upsert failed (ignored):', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[push] upsert threw (ignored):', e?.message);
    return false;
  }
}

// 想起通知を購読する（トグル ON 時に呼ぶ。必ずユーザージェスチャ内）。
// 戻り値: { ok: boolean, reason?: string }
//   reason: 'unsupported' | 'denied' | 'no-registration' | 'subscribe-failed' | 'save-failed'
export async function subscribeToPush({ frequency = 'weekly' } = {}) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  // 許可要求（ユーザージェスチャ内で呼ばれる前提）。
  let permission = getPermission();
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return { ok: false, reason: 'unsupported' };
    }
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg || !reg.pushManager) return { ok: false, reason: 'no-registration' };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    if (!sub) return { ok: false, reason: 'subscribe-failed' };

    const saved = await upsertSubscription(sub, { frequency });
    if (!saved) return { ok: false, reason: 'save-failed' };
    return { ok: true };
  } catch (e) {
    console.warn('[push] subscribe failed (ignored):', e?.message);
    return { ok: false, reason: 'subscribe-failed' };
  }
}

// 購読を解除する（トグル OFF 時）。ブラウザ側 unsubscribe + DB 行削除。
// 失敗しても throw しない。
export async function unsubscribeFromPush() {
  try {
    const reg = await getServiceWorkerRegistration();
    if (reg && reg.pushManager) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.toJSON().endpoint;
        try { await sub.unsubscribe(); } catch { /* ignore */ }
        // DB からも本人の行を削除（RLS で本人限定）。
        if (isSupabaseConfigured && supabase && endpoint) {
          try {
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData?.user?.id;
            if (userId) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('user_id', userId)
                .eq('endpoint', endpoint);
            }
          } catch { /* ignore */ }
        }
      }
    }
    return { ok: true };
  } catch (e) {
    console.warn('[push] unsubscribe failed (ignored):', e?.message);
    return { ok: false };
  }
}

// 既に許可済み（granted）で購読が DB と乖離している場合に再同期する自己修復。
// pushsubscriptionchange 後の起動時などに呼ぶと安全（任意・throw しない）。
//
// ⚠️ 自己修復は「本人が過去にオンにした（＝本人の行が既に存在する）」場合に
// 限定する。無条件に upsert すると、共有端末でアカウントを切り替えた瞬間に
// 通知をオンにしていないユーザーの行が勝手に作られ、前のユーザーのメモ通知と
// 混ざって届き続ける（プライバシー事故）。初回の行作成は必ず設定画面の
// 明示的なオン操作（subscribePush）だけが行う。
export async function ensurePushSubscription() {
  if (!isPushSupported()) return;
  if (getPermission() !== 'granted') return;
  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg || !reg.pushManager) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    if (!isSupabaseConfigured || !supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;
    const endpoint = sub.toJSON()?.endpoint;
    if (!endpoint) return;
    const { data: existing, error } = await supabase
      .from('push_subscriptions')
      .select('user_id')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .maybeSingle();
    if (error || !existing) return; // 本人の行が無ければ何もしない
    await upsertSubscription(sub);
  } catch { /* ignore */ }
}
