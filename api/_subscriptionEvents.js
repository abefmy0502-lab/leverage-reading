// 💳📜 契約の履歴（subscription_events）— 追記だけの記録。
//
// subscriptions は 1 人 1 行で、7 日間無料 → 有料に変わると同じ行の period_type が
// 'trial' から 'normal' に書き換わる。あとから「無料期間を始めた人のうち何人が
// 有料に進んだか」（ローンチの 4 つの数字の 4 つ目）を数えられないので、Webhook が
// 受けた契約の出来事を 1 件ずつ残す（supabase_subscription_events.sql）。
//
// - 書くのは Webhook（service_role）だけ。表が無い（SQL 未適用）・書けないときは
//   警告を出すだけで Webhook は止めない（契約の同期が本筋・こちらは計測）。
// - 同じイベントの再送は (provider, source_event_id) の UNIQUE で 1 件にまとまる（23505 は無視）。
// - 中身は契約の種類と日時だけ（メール・金額・レシートは入れない）。

// 'trial' だけが無料期間（7 日間無料）。'intro' は有料の初回価格（創業メンバー価格「1 年目 ¥9,800」）で、
// 記録はそのまま残すが、集計（supabase_admin_launch_kpis.sql の 7 日間無料 → 有料）では無料期間に数えない（2026-10-02）。
const PERIOD_TYPES = ['trial', 'intro', 'normal'];

function clip(v, n = 120) {
  if (v == null) return null;
  const s = String(v);
  return s ? s.slice(0, n) : null;
}

function isoFromMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

function isoFromSeconds(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function normalizePeriod(v) {
  const p = typeof v === 'string' ? v.toLowerCase() : '';
  return PERIOD_TYPES.includes(p) ? p : null;
}

// RevenueCat のイベント（契約のもの）＋ subscriptions に書いた patch → 履歴の 1 行。
// patch は revenuecat-webhook.js が組み立てたもの（status・period_type・store・price_id）。
export function rcSubscriptionEventRow(event, patch) {
  if (!event || !patch?.user_id) return null;
  return {
    user_id: patch.user_id,
    provider: 'revenuecat',
    source_event_id: clip(event.id),
    event_type: clip(event.type, 60),
    status: clip(patch.status, 30),
    period_type: normalizePeriod(event.period_type) || normalizePeriod(patch.period_type),
    product_id: clip(event.product_id || patch.price_id),
    store: clip(patch.store, 30),
    environment: event.environment === 'SANDBOX' ? 'sandbox' : 'production',
    // RENEWAL のうち「無料期間から有料への最初の更新」に RevenueCat が付ける印。
    is_trial_conversion: event.is_trial_conversion === true ? true : null,
    event_at: isoFromMs(event.event_timestamp_ms) || isoFromMs(event.purchased_at_ms) || new Date().toISOString(),
  };
}

// Stripe のイベント＋ subscriptions に書いた fields → 履歴の 1 行。
// fields は stripe-webhook.js の subscriptionFields（status・period_type・price_id）。
export function stripeSubscriptionEventRow(event, userId, fields) {
  if (!event || !userId || !fields) return null;
  return {
    user_id: userId,
    provider: 'stripe',
    source_event_id: clip(event.id),
    event_type: clip(event.type, 60),
    status: clip(fields.status, 30),
    period_type: normalizePeriod(fields.period_type),
    product_id: clip(fields.price_id),
    store: 'stripe',
    environment: event.livemode === false ? 'sandbox' : 'production',
    is_trial_conversion: null,
    event_at: isoFromSeconds(event.created) || new Date().toISOString(),
  };
}

let warnedMissing = false;
const MISSING_RE = /does not exist|could not find the table|schema cache/i;

// 1 行を足す。どんな失敗でも投げない（Webhook を止めない）。
// 戻り値: 'ok' | 'dup' | 'missing' | 'error' | 'skip'（テスト・ログ用）。
export async function recordSubscriptionEvent(supabase, row) {
  if (!supabase || !row?.user_id) return 'skip';
  try {
    const { error } = await supabase.from('subscription_events').insert(row);
    if (!error) return 'ok';
    if (error.code === '23505') return 'dup';
    if (error.code === '42P01' || MISSING_RE.test(error.message || '')) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn('[subscription-events] table missing — run supabase_subscription_events.sql to keep trial→paid history');
      }
      return 'missing';
    }
    console.warn('[subscription-events] insert failed (non-fatal):', error.message);
    return 'error';
  } catch (e) {
    console.warn('[subscription-events] insert threw (non-fatal):', e?.message);
    return 'error';
  }
}
