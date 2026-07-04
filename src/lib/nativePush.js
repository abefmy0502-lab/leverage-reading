// 🔔📱 ネイティブ(iOS/APNs)プッシュ通知 — Capacitor 専用クライアント。
//
// 設計の肝（iap.js と同流儀）:
//   - Web(ブラウザ/PWA)では一切ロードしない。@capacitor/push-notifications は
//     `isNativePushCapable` ガードの内側で **dynamic import** するだけなので、
//     Web バンドルには実質含まれず、Web 実行時には評価もされない。
//     Web の想起通知は従来どおり Web Push(push.js)を使う（現状は WKWebView 非対応で
//     ネイティブは APNs、ブラウザ standalone は Web Push、と経路が分かれる）。
//   - graceful degradation 最優先: プラグイン未導入 / 権限拒否 / Supabase 未設定 —
//     どの経路でも throw せず静かに無効化する（呼び出し側は {ok:false,reason} で分岐）。
//   - 購読情報は push_subscriptions に「クライアント直 upsert」（RLS 本人限定）。
//     ネイティブ行は platform='ios' / apns_token=<device token> / endpoint='apns:<token>'
//     （web 行との UNIQUE(user_id,endpoint) 衝突回避）。p256dh/auth は null。
//     送信のみ service_role の api/push-cron が担当（APNs 送信は同ファイルに実装）。
//
// ⚠️ 実機（Apple Developer 設定）が必要:
//    - Xcode の iOS プロジェクトに Push Notifications capability + Background Modes
//      (Remote notifications) を追加
//    - APNs 認証キー(.p8)を発行し、サーバー env(APNS_*)に設定（api/push-cron.js 参照）
//    本モジュールは全呼び出しを try/catch + フォールバックで包み、API 差異や
//    プラグイン未導入でも Web を一切壊さない（native 限定）よう防御している。

import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured } from './supabase';

// ネイティブ(Capacitor)実行時のみ true。Web では false → 全 API が即無効。
export const isNativePushCapable = Capacitor.isNativePlatform();

let _PN = null;
async function loadPN() {
  if (!isNativePushCapable) return null;
  if (_PN) return _PN;
  try {
    const mod = await import('@capacitor/push-notifications');
    _PN = mod.PushNotifications;
    return _PN;
  } catch {
    return null; // プラグイン未導入 = 機能無効（fail-safe）
  }
}

async function getUserId() {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

// 現在の通知許可状態を返す（'granted' | 'denied' | 'prompt' | 'unsupported'）。
// Capacitor の checkPermissions().receive は 'granted'|'denied'|'prompt'|'prompt-with-rationale'。
export async function getNativePushPermission() {
  const PN = await loadPN();
  if (!PN) return 'unsupported';
  try {
    const res = await PN.checkPermissions();
    const r = res?.receive || 'prompt';
    if (r === 'granted') return 'granted';
    if (r === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

// この端末（ユーザー）が現在 iOS プッシュを購読済みか（DB 上に platform='ios' 行があるか）。
// トグルの初期状態用。失敗時は false（throw しない）。
export async function isNativePushSubscribed() {
  if (!isNativePushCapable || !isSupabaseConfigured || !supabase) return false;
  try {
    const userId = await getUserId();
    if (!userId) return false;
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'ios')
      .eq('enabled', true)
      .limit(1);
    if (error) return false; // 列/テーブル未適用は静かに false
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

// APNs デバイストークンを push_subscriptions に upsert（RLS 本人限定）。
async function upsertNativeToken(token, { frequency = 'weekly' } = {}) {
  if (!isSupabaseConfigured || !supabase || !token) return false;
  try {
    const userId = await getUserId();
    if (!userId) return false;
    const tzOffsetMin = -new Date().getTimezoneOffset(); // JST = +540
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: `apns:${token}`, // UNIQUE(user_id,endpoint) キー。web 行と衝突しない
          apns_token: token,
          platform: 'ios',
          // p256dh/auth は web(VAPID)専用。ネイティブ行では NULL（SQL 側で NOT NULL 解除）。
          enabled: true,
          frequency,
          tz_offset_min: tzOffsetMin,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      );
    if (error) {
      console.warn('[nativePush] upsert failed (ignored):', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[nativePush] upsert threw (ignored):', e?.message);
    return false;
  }
}

// 想起通知を購読する（トグル ON 時に呼ぶ。必ずユーザージェスチャ内）。
// 戻り値: { ok: boolean, reason?: 'unsupported'|'denied'|'register-failed'|'save-failed' }
//
// フロー: 権限要求 → register()（APNs 登録）→ 'registration' イベントで device token を
//        受け取り → DB へ upsert。register の結果はイベントで返るため Promise 化して待つ。
export async function subscribeNativePush({ frequency = 'weekly', timeoutMs = 12000 } = {}) {
  const PN = await loadPN();
  if (!PN) return { ok: false, reason: 'unsupported' };

  try {
    // 許可要求（prompt のときだけ実際に OS ダイアログが出る）。
    let perm = await PN.checkPermissions();
    if (perm?.receive === 'prompt' || perm?.receive === 'prompt-with-rationale') {
      perm = await PN.requestPermissions();
    }
    if (perm?.receive !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    // register() は 'registration'(成功) / 'registrationError'(失敗) イベントで返る。
    const token = await new Promise((resolve) => {
      let settled = false;
      const done = (val) => { if (!settled) { settled = true; resolve(val); } };
      let okHandle = null;
      let errHandle = null;
      const cleanup = () => {
        try { okHandle && okHandle.remove && okHandle.remove(); } catch { /* ignore */ }
        try { errHandle && errHandle.remove && errHandle.remove(); } catch { /* ignore */ }
      };
      // addListener は Promise<PluginListenerHandle> を返すので then で握る。
      PN.addListener('registration', (t) => { cleanup(); done(t?.value || null); })
        .then((h) => { okHandle = h; if (settled) { try { h.remove(); } catch { /* ignore */ } } });
      PN.addListener('registrationError', () => { cleanup(); done(null); })
        .then((h) => { errHandle = h; if (settled) { try { h.remove(); } catch { /* ignore */ } } });
      // タイムアウト保険（イベントが来ないケースで固まらない）。
      setTimeout(() => { cleanup(); done(null); }, timeoutMs);
      // 実際の登録トリガ。
      PN.register().catch(() => { cleanup(); done(null); });
    });

    if (!token) return { ok: false, reason: 'register-failed' };

    const saved = await upsertNativeToken(token, { frequency });
    if (!saved) return { ok: false, reason: 'save-failed' };
    return { ok: true };
  } catch (e) {
    console.warn('[nativePush] subscribe failed (ignored):', e?.message);
    return { ok: false, reason: 'register-failed' };
  }
}

// 購読解除（トグル OFF 時）。DB 行を削除し、OS 登録も解除する。throw しない。
export async function unsubscribeNativePush() {
  try {
    if (isSupabaseConfigured && supabase) {
      const userId = await getUserId();
      if (userId) {
        try {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('platform', 'ios');
        } catch { /* ignore */ }
      }
    }
    const PN = await loadPN();
    if (PN) {
      try { await PN.unregister(); } catch { /* ignore */ }
    }
    return { ok: true };
  } catch (e) {
    console.warn('[nativePush] unsubscribe failed (ignored):', e?.message);
    return { ok: false };
  }
}

// 通知タップ時のディープリンク（/?recall=<memoId>）を SPA 内遷移につなぐ。
// アプリ起動時に1回だけ呼ぶ（native のみ）。onNavigate(url) が呼ばれる。
// 戻り値: リスナー解除関数（呼ぶと remove。native/未導入では no-op 関数）。
export async function initNativePushNav(onNavigate) {
  const PN = await loadPN();
  if (!PN) return () => {};
  try {
    const handle = await PN.addListener('pushNotificationActionPerformed', (action) => {
      try {
        const data = action?.notification?.data || {};
        const url = data.url || (data.recall ? `/?recall=${encodeURIComponent(data.recall)}` : null);
        if (url && typeof onNavigate === 'function') onNavigate(url);
      } catch { /* ignore */ }
    });
    return () => { try { handle && handle.remove && handle.remove(); } catch { /* ignore */ } };
  } catch {
    return () => {};
  }
}
