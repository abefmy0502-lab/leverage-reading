// 💳 RevenueCat Webhook ハンドラ（App 決済 / IAP の entitlement 同期）。
//
// App Store / Google Play のアプリ内課金（IAP）を RevenueCat 経由で扱い、
// RevenueCat の Webhook を受け取って既存の `subscriptions` テーブルを
// service_role キーで upsert する。これが（Web の Stripe と並んで）課金
// entitlement の真実の源になる。`useSubscription().isActive = status==='active'`
// は無改修でそのまま流用できる（status の意味は Stripe と揃えてある）。
//
// ───────────────────────────────────────────────────────────────────
// ★ 認証は「署名」ではなく「Authorization ヘッダの共有シークレット」
//   Stripe と違い RevenueCat は raw body 署名ではなく、ダッシュボードで
//   設定した固定ヘッダ（Authorization）を Webhook に付ける。よって raw
//   body は不要で、通常の JSON bodyParser のままでよい。
//   `process.env.REVENUECAT_WEBHOOK_AUTH` と完全一致しなければ 401。
// ───────────────────────────────────────────────────────────────────
//
// ★ user_id の解決
//   RevenueCat の `app_user_id` をそのまま Supabase の user.id として扱う。
//   これは購入前にクライアントで `Purchases.logIn(user.id)`（RevenueCat SDK）
//   を呼び、app_user_id = Supabase の認証ユーザー ID に揃える前提に依存する。
//   匿名 ID（`$RCAnonymousID:...`）等で user.id に解決できない場合は処理を
//   スキップしてログだけ残す（不正な行を作らない）。
//
// ★ status マッピング（Stripe の status 語彙に正規化）
//   INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE → active
//   CANCELLATION / EXPIRATION                                    → 期限判定（下記）
//   BILLING_ISSUE                                                → past_due
//
//   CANCELLATION は「自動更新をオフにしただけで期間内はまだ有効」を意味する
//   ことが多い。理想は期限まで active を維持すること。そこで CANCELLATION /
//   EXPIRATION は `expiration_at_ms` を見て、未来なら active のまま、過去
//   （または不明）なら canceled、と判定する。EXPIRATION は通常期限到来後に
//   届くので大抵 canceled に落ちる。
//
// 冪等性: user_id を onConflict にした upsert なので、RevenueCat の再送
//   （at-least-once 配信）でも壊れない。Stripe webhook と同一流儀。
//
// 必要な環境変数:
//   - REVENUECAT_WEBHOOK_AUTH    : RevenueCat ダッシュボードで設定する
//                                  Webhook の Authorization ヘッダ値（共有シークレット）
//   - SUPABASE_URL               : Supabase プロジェクト URL
//   - SUPABASE_SERVICE_ROLE_KEY  : service_role キー（RLS バイパス。サーバー専用、
//                                  絶対にクライアントへ露出しないこと）

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

// 共有シークレットを定数時間で比較する（タイミング攻撃でシークレットを 1 文字ずつ
// 推測されるのを防ぐ）。長さが違う時点で false だが、長さの差自体が漏れないよう
// 先に長さチェック → 同長なら timingSafeEqual。api/stripe-webhook.js と同流儀。
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// service_role キーで作る Supabase クライアント。RLS をバイパスして
// subscriptions に書き込めるのは Webhook（=このサーバー）だけ。
// api/stripe-webhook.js の getServiceSupabase() と同一流儀。
let serviceClient = null;
function getServiceSupabase() {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

// RevenueCat の Authorization ヘッダを共有シークレットと定数時間で比較する。
function isAuthorized(req) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) return false; // 未設定なら全拒否（fail-closed）
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof raw !== 'string' || !raw) return false;
  // ダッシュボードの設定値をそのまま（例: "Bearer xxx" でも素の "xxx" でも）一致比較。
  // タイミング攻撃対策で定数時間比較を使う。
  return safeEqual(raw, expected);
}

function toIsoFromMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

// RevenueCat の store 表記を正規化する。
function normalizeStore(store) {
  if (!store) return null;
  const s = String(store).toUpperCase();
  if (s === 'APP_STORE') return 'app_store';
  if (s === 'PLAY_STORE') return 'play_store';
  if (s === 'MAC_APP_STORE') return 'app_store';
  if (s === 'STRIPE') return 'stripe';
  return s.toLowerCase();
}

// app_user_id が Supabase の user.id（UUID）として使えるか判定する。
// RevenueCat の匿名 ID は `$RCAnonymousID:...` のように prefix を持つ。
function isResolvableUserId(appUserId) {
  if (!appUserId || typeof appUserId !== 'string') return false;
  if (appUserId.startsWith('$RCAnonymousID')) return false;
  return true;
}

// RevenueCat の event.type を subscriptions.status へマップする。
// CANCELLATION / EXPIRATION は expiration_at_ms を見て期限判定する。
function resolveStatus(type, expirationMs) {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
      return 'active';
    case 'BILLING_ISSUE':
      return 'past_due';
    case 'CANCELLATION':
    case 'EXPIRATION': {
      // 自動更新オフだが期間内（expiration が未来）なら active を維持。
      // 期限が過去 or 不明なら canceled に落とす。
      const exp = Number(expirationMs);
      if (Number.isFinite(exp) && exp > Date.now()) return 'active';
      return 'canceled';
    }
    default:
      return null; // 関心の無いイベント（TRANSFER / SUBSCRIPTION_PAUSED 等）
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) 認証（共有シークレットの一致検証）
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase service role not configured' });
  }

  try {
    // RevenueCat のペイロードは { event: {...}, api_version: "1.0" } 形式。
    const body = req.body || {};
    const event = body.event || {};
    const type = event.type;

    const appUserId = event.app_user_id;
    if (!isResolvableUserId(appUserId)) {
      // 匿名 ID 等で user.id に解決できない → 行を作らずスキップ（200 で受け流し）。
      console.warn('RevenueCat webhook: unresolvable app_user_id, skipping', {
        type,
        app_user_id: appUserId,
      });
      return res.status(200).json({ received: true, skipped: 'unresolvable_app_user_id' });
    }

    const status = resolveStatus(type, event.expiration_at_ms);
    if (!status) {
      // 関心の無いイベントは 200 で受け流し（RevenueCat に再送させない）。
      return res.status(200).json({ received: true, ignored: type || 'unknown' });
    }

    // subscriptions 行を組み立てる。stripe_* 列は触らず NULL のまま温存（Web/IAP 併存）。
    const patch = {
      user_id: appUserId,
      provider: 'revenuecat',
      store: normalizeStore(event.store),
      rc_app_user_id: appUserId,
      status,
      price_id: event.product_id || null, // RevenueCat の product_id を price_id 相当に格納
      current_period_end: toIsoFromMs(event.expiration_at_ms),
    };

    const { error } = await supabase
      .from('subscriptions')
      .upsert(patch, { onConflict: 'user_id' });
    if (error) throw error;

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('RevenueCat webhook handler error:', error);
    // 5xx を返すと RevenueCat が再送する。冪等な upsert なので再送は安全。
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
