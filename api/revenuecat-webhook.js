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
// 冪等性:
//   - TRANSFER 以外は user_id を onConflict にした upsert なので、再送でも
//     最終状態は変わらず壊れない。
//   - TRANSFER だけは例外。「旧アカウントを canceled に書き換えてから、その
//     行を読んで新アカウントへ引き継ぐ」という自己言及的な構造のため、再送
//     されると 1 回目の書き込み結果を 2 回目の読み取りが拾ってしまい、引き継ぎ
//     判定が狂いうる（有効な購読者が誤って canceled になりうる）。そのため
//     event.id を supabase_revenuecat_events.sql のテーブルで claim し、
//     二度目以降は処理せずスキップする（api/stripe-webhook.js と同一流儀）。
//     テーブル未適用は fail-open（従来どおり処理・TRANSFER の再送耐性のみ無い）。
//
// 必要な環境変数:
//   - REVENUECAT_WEBHOOK_AUTH    : RevenueCat ダッシュボードで設定する
//                                  Webhook の Authorization ヘッダ値（共有シークレット）
//   - SUPABASE_URL               : Supabase プロジェクト URL
//   - SUPABASE_SERVICE_ROLE_KEY  : service_role キー（RLS バイパス。サーバー専用、
//                                  絶対にクライアントへ露出しないこと）

import { createClient } from '@supabase/supabase-js';
import { isTokenPackEvent, tokenCreditFromEvent } from './_tokenLots.js';
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isResolvableUserId(appUserId) {
  if (!appUserId || typeof appUserId !== 'string') return false;
  if (appUserId.startsWith('$RCAnonymousID')) return false;
  // Supabase の user.id は UUID。形式不一致は弾く（不正な行の生成・なりすまし対象の
  // 取り違えを早期に拒否）。entitlement の真実性は共有シークレットの秘匿に依存する点は
  // 別途運用で担保（強いシークレット・将来の HMAC 署名移行）。
  if (!UUID_RE.test(appUserId)) return false;
  return true;
}

// RevenueCat の event.type を subscriptions.status へマップする。
// CANCELLATION / EXPIRATION は expiration_at_ms を見て期限判定する。
function resolveStatus(type, expirationMs) {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE': {
      // 遅れて届いた RENEWAL などで、すでに期限が過ぎているなら active にしない
      // （EXPIRATION の後に古いイベントが着いて、ずっと active のまま残る事故の防止）。
      const exp = Number(expirationMs);
      if (Number.isFinite(exp) && exp > 0 && exp <= Date.now()) return 'canceled';
      return 'active';
    }
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

// canceled_at 列が未適用の DB では「列が無い」エラーになるため、その時だけ
// 列を抜いて再試行する（既存挙動を壊さない schema fallback）。
async function upsertSubscriptionRow(supabase, row) {
  let { error } = await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id' });
  if (error && 'canceled_at' in row && /canceled_at/i.test(error.message || '')) {
    const { canceled_at: _omit, ...rest } = row;
    ({ error } = await supabase.from('subscriptions').upsert(rest, { onConflict: 'user_id' }));
  }
  if (error) throw error;
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

  // event / eventId は catch 節（claim 解放）でも参照するため try の外で宣言する。
  let eventId = null;
  let eventClaimed = false;
  try {
    // RevenueCat のペイロードは { event: {...}, api_version: "1.0" } 形式。
    const body = req.body || {};
    const event = body.event || {};
    const type = event.type;
    eventId = typeof event.id === 'string' && event.id ? event.id : null;

    // 🪙➕ 追加トークン（消耗型の App 内課金・NON_RENEWING_PURCHASE）。subscriptions は触らず、
    // ai_token_lots に 1 ロット足す（supabase_ai_token_credits.sql の credit_token_lot）。
    // 二重に足さない鍵は取引 ID（transaction_id UNIQUE）＋下の event.id の claim の二重。
    // SANDBOX でも足す（App 審査の官が買ったトークンが届かないと却下になるため・environment='sandbox' で
    // 見分けられる）。止めたいときは RC_SANDBOX_TOKENS=false。顧客指標（subscriptions）は汚さない。
    if (isTokenPackEvent(event)) {
      const r = tokenCreditFromEvent(event, { isUserId: isResolvableUserId });
      if (r.skip) return res.status(200).json({ received: true, skipped: r.skip });
      if (eventId) {
        const { error: dedupErr } = await supabase.from('revenuecat_events').insert({ event_id: eventId, type });
        if (dedupErr?.code === '23505') return res.status(200).json({ received: true, deduped: true });
        if (!dedupErr) eventClaimed = true;
      }
      const c = r.credit;
      const { data: credited, error: creditErr } = await supabase.rpc('credit_token_lot', {
        p_user_id: c.userId,
        p_transaction_id: c.transactionId,
        p_product_id: c.productId,
        p_tokens: c.tokens,
        p_purchased_at: c.purchasedAt,
        p_environment: c.environment,
      });
      if (creditErr) throw creditErr; // 5xx → RevenueCat が再送（claim は catch で解放）
      return res.status(200).json({ received: true, credited: Number(credited) || 0 });
    }

    // 🧪 SANDBOX イベント（TestFlight / 開発ビルドの課金）は既定でスキップする。
    // 本番 subscriptions とチャーン/CVR 等の顧客指標をテスト課金で汚さないため。
    // クライアントの entitlement は RevenueCat SDK 直読（nativeEntitled）で成立
    // するので、skip してもテスターのロック解除は壊れない。webhook 込みの通し
    // 検証をしたい期間だけ env RC_ALLOW_SANDBOX=true にする。
    if (event.environment === 'SANDBOX' && process.env.RC_ALLOW_SANDBOX !== 'true') {
      return res.status(200).json({ received: true, skipped: 'sandbox' });
    }

    // 冪等性ガード: 処理済み event.id は二度処理しない。「先に claim → 失敗時は
    // 解放（delete）」で 5xx 再送時の取りこぼしも防ぐ（api/stripe-webhook.js と
    // 同一流儀）。event.id 欠落 / テーブル未適用（42P01）は fail-open。
    if (eventId) {
      try {
        const { error: dedupErr } = await supabase
          .from('revenuecat_events')
          .insert({ event_id: eventId, type });
        if (!dedupErr) {
          eventClaimed = true;
        } else if (dedupErr.code === '23505') {
          // 既に処理済み → 静かにスキップ（200 で RevenueCat に再送させない）。
          return res.status(200).json({ received: true, deduped: true });
        } else {
          console.warn('[revenuecat-webhook] dedup insert non-fatal (proceeding):', dedupErr.message);
        }
      } catch (e) {
        console.warn('[revenuecat-webhook] dedup threw (proceeding):', e?.message);
      }
    }

    // TRANSFER: 同じ Apple ID の購入が別の app_user_id（別 Supabase アカウント）へ
    // 「購入を復元」で移った。無視すると (a) 旧アカウントが永久 active のまま残り
    // （以後の RENEWAL/EXPIRATION は新 ID 宛にしか届かない）、(b) 新アカウントは
    // Web/PWA 側でロックされ続ける。旧→canceled / 新→active に同期する。
    if (type === 'TRANSFER') {
      const from = Array.isArray(event.transferred_from) ? event.transferred_from : [];
      const to = Array.isArray(event.transferred_to) ? event.transferred_to : [];
      const fromIds = from.filter((id) => isResolvableUserId(id));
      const toIds = to.filter((id) => isResolvableUserId(id));

      // TRANSFER ペイロードには expiration_at_ms / product_id が乗らないことが
      // ある。無条件に active を upsert すると「失効済みの購入を復元しただけ」で
      // 永久 active を配ってしまうため、旧アカウントの行から権利を“引き継ぐ”。
      // 旧行が無く expiration も不明なら行を作らない（直後に RevenueCat が送る
      // INITIAL_PURCHASE/RENEWAL 側が正しく作る）。
      let carry = null;
      if (fromIds.length > 0) {
        const { data: oldRows } = await supabase
          .from('subscriptions')
          .select('status, price_id, current_period_end')
          .in('user_id', fromIds)
          .eq('provider', 'revenuecat');
        carry = (oldRows || [])
          .sort((a, b) => String(b.current_period_end || '').localeCompare(String(a.current_period_end || '')))[0] || null;
      }

      // fromIds は独立した行の更新（互いの結果に依存しない）ので並列実行する。
      await Promise.all(fromIds.map(async (uid) => {
        let { error } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled', canceled_at: new Date().toISOString() })
          .eq('user_id', uid)
          .eq('provider', 'revenuecat');
        if (error && /canceled_at/i.test(error.message || '')) {
          ({ error } = await supabase.from('subscriptions')
            .update({ status: 'canceled' }).eq('user_id', uid).eq('provider', 'revenuecat'));
        }
        if (error) throw error;
      }));

      const expIso = toIsoFromMs(event.expiration_at_ms) || carry?.current_period_end || null;
      // 引き継げる根拠（旧行 or ペイロードの期限）が何も無ければ作らない。
      if (toIds.length > 0 && (carry || expIso)) {
        // 期限が過去なら canceled として引き継ぐ（失効済み転送に active を配らない）。
        const stillValid = expIso ? Date.parse(expIso) > Date.now() : (carry?.status === 'active');
        const status = stillValid ? (carry?.status === 'past_due' ? 'past_due' : 'active') : 'canceled';
        // toIds も独立した行の upsert なので並列実行する。
        await Promise.all(toIds.map(async (uid) => {
          const row = {
            user_id: uid,
            provider: 'revenuecat',
            store: normalizeStore(event.store),
            rc_app_user_id: uid,
            status,
            price_id: event.product_id || carry?.price_id || null,
            current_period_end: expIso,
          };
          if (status === 'canceled') row.canceled_at = new Date().toISOString();
          else if (status === 'active') row.canceled_at = null;
          await upsertSubscriptionRow(supabase, row);
        }));
      }
      return res.status(200).json({ received: true, transferred: { from: fromIds.length, to: toIds.length } });
    }

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
    // 会員内訳（admin_revenue の trial/intro 集計）用。RC イベントの period_type は
    // 'TRIAL' | 'INTRO' | 'NORMAL'。未知値/欠落は書かない（既存値を上書きしない）。
    const periodType = typeof event.period_type === 'string' ? event.period_type.toLowerCase() : '';
    if (['trial', 'intro', 'normal'].includes(periodType)) patch.period_type = periodType;
    // 📉 チャーン計測: canceled への遷移時刻を残す（supabase_subscriptions_canceled_at.sql）。
    if (status === 'canceled') patch.canceled_at = new Date().toISOString();
    // 再開したら解約時刻を消す（戻ってきた人を解約に数え続けないように）。
    else if (status === 'active') patch.canceled_at = null;

    // 二重 provider(Web=Stripe と IAP=RevenueCat)対策。subscriptions は user_id 1 行
    // なので、RC の expire/cancel イベントが「現在 active な Stripe 購読」を上書きして
    // 誤って canceled 化するのを防ぐ。RC が active を通知する時（＝IAP 購入という正当な
    // 移行）だけ provider を RC に引き継ぎ、それ以外で既存が Stripe active なら触らない。
    try {
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('provider, status, stripe_subscription_id')
        .eq('user_id', appUserId)
        .maybeSingle();
      // provider='stripe' 明示行に加え、provider が NULL のレガシー行でも
      // stripe_subscription_id を持つ＝Stripe 管理下とみなして保護する
      // （provider 列を書き始める前に作られた行の後方互換）。
      const managedByStripe = existing
        && (existing.provider === 'stripe' || (!existing.provider && existing.stripe_subscription_id));
      if (managedByStripe && existing.status === 'active' && status !== 'active') {
        return res.status(200).json({ received: true, skipped: 'stripe_active_preserved' });
      }
    } catch { /* 読み取り失敗時は従来どおり upsert に進む（fail-open） */ }

    await upsertSubscriptionRow(supabase, patch);

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('RevenueCat webhook handler error:', error);
    // 処理失敗 → claim を解放して、RevenueCat の再送（5xx 起因）で確実に
    // 再処理できるようにする（api/stripe-webhook.js と同一流儀）。
    if (eventClaimed && eventId) {
      try {
        await supabase.from('revenuecat_events').delete().eq('event_id', eventId);
      } catch { /* 解放失敗は致命ではない（最悪その1イベントが再処理されない） */ }
    }
    // 5xx を返すと RevenueCat が再送する。冪等な upsert なので再送は安全。
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
