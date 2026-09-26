// 💳 Stripe Checkout Session を作成するサーバーレス関数。
//
// 認証済みユーザー（Bearer トークン → supabase.auth.getUser）に対し、
// サブスクリプション（mode: 'subscription'）の Checkout Session を作成し、
// その URL を返す。クライアントはこの URL にリダイレクトする。
//
// 月額 / 年額の 2 プラン対応:
//   リクエストボディの `plan`（'monthly' | 'annual'）で使う Price ID を選ぶ。
//   - 'annual'  → STRIPE_PRICE_ID_ANNUAL
//   - 'monthly' → STRIPE_PRICE_ID_MONTHLY（無ければ旧 STRIPE_PRICE_ID にフォールバック）
//   plan 未指定 / 不正値は 'monthly' 扱い。
//   ★ 価格の実数（¥990 等）はコードに書かない。Stripe 側の Price 設定が真実。
//
// 認証・Supabase クライアントの組み立ては api/claude.js と同じ流儀。
//
// 必要な環境変数:
//   - STRIPE_SECRET_KEY        : Stripe シークレットキー（サーバー専用）
//   - STRIPE_PRICE_ID_MONTHLY  : 月額プランの Price ID（無ければ STRIPE_PRICE_ID）
//   - STRIPE_PRICE_ID_ANNUAL   : 年額プランの Price ID
//   - STRIPE_PRICE_ID          : （旧）月額プランの Price ID。monthly のフォールバック。
//   - SUPABASE_URL / SUPABASE_ANON_KEY : Bearer トークン検証用（api/claude.js と共通）
//
// 依存: `stripe`（package.json に未追加 → `npm i stripe` が必要）。

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// In-memory レート制限（per serverless instance）。決済セッションの乱発を抑止。
// api/claude.js と同流儀。低ボリュームでは十分。
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 6;
const rateLimitStore = new Map();
function checkRateLimit(userId) {
  const now = Date.now();
  const arr = (rateLimitStore.get(userId) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - arr[0])) / 1000));
    return { ok: false, retryAfter };
  }
  arr.push(now);
  rateLimitStore.set(userId, arr);
  return { ok: true };
}

let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  supabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

let stripeClient = null;
function getStripe() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = new Stripe(key, { apiVersion: '2024-06-20' });
  return stripeClient;
}

// service_role キーで作る Supabase クライアント（api/stripe-webhook.js と同一流儀）。
// ⚠️ subscriptions テーブルは RLS で「SELECT は本人のみ」— サーバーの素の anon
// クライアントはユーザーの JWT を運ばないため auth.uid() が null になり SELECT が
// 常に 0 行を返す。その結果 (a) 既存 customer の再利用が効かず毎回新規 customer が
// 作られ、(b) 既契約チェックが素通りして二重サブスクリプションが成立していた。
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

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

// plan（'monthly' | 'annual'）から使う Stripe Price ID を解決する。
// 価格の実数はここに書かず、env の Price ID に委ねる。
// 戻り値 null は「該当 env 未設定」を表す（呼び出し側で 500 を返す）。
function resolvePriceId(plan) {
  const normalized = plan === 'annual' ? 'annual' : 'monthly';
  if (normalized === 'annual') {
    return process.env.STRIPE_PRICE_ID_ANNUAL || null;
  }
  // monthly: 新 env を優先、無ければ旧 STRIPE_PRICE_ID にフォールバック。
  return process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID || null;
}

// Vercel のデフォルト bodyParser が JSON を req.body に展開するが、
// 念のため string の場合もパースしておく（堅牢性）。
function readPlan(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const plan = body && typeof body.plan === 'string' ? body.plan : 'monthly';
  return plan === 'annual' ? 'annual' : 'monthly';
}

// success_url / cancel_url の origin を「許可リスト」で確定する。
// 以前は req.headers.origin / host を verbatim で使っていたため、
// Origin: https://evil.com を投げると Stripe 決済後に攻撃者ドメインへ
// リダイレクトされる（オープンリダイレクト）穴があった。
// 許可元: APP_ORIGIN（任意・カスタムドメイン用）/ VERCEL_URL（Vercel が
// サーバー側で注入する自デプロイのホスト＝偽装不可）/ 既知の本番ドメイン。
// リクエストの Origin が許可リストに無ければ正規 origin にフォールバックする
// （＝攻撃者ドメインへは絶対に行かせない）。
function getAllowedOrigins() {
  const list = [];
  if (process.env.APP_ORIGIN) list.push(process.env.APP_ORIGIN.replace(/\/+$/, ''));
  if (process.env.VERCEL_URL) list.push(`https://${process.env.VERCEL_URL}`);
  list.push('https://orime.jp', 'https://www.orime.jp');
  list.push('https://leverage-reading.vercel.app');
  return [...new Set(list)];
}
function getOrigin(req) {
  const allowed = getAllowedOrigins();
  const reqOrigin = (req.headers?.origin || '').replace(/\/+$/, '');
  if (reqOrigin && allowed.includes(reqOrigin)) return reqOrigin;
  return allowed[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripe();
  if (!stripe) {
    // 内部 env 変数名はクライアントに出さない。詳細はログのみ。
    console.error('[stripe-checkout] STRIPE_SECRET_KEY not configured');
    return res.status(500).json({ error: '決済機能が一時的に利用できません。' });
  }
  const plan = readPlan(req);
  const priceId = resolvePriceId(plan);
  if (!priceId) {
    console.error(
      `[stripe-checkout] price id not configured for plan=${plan} ` +
        '(STRIPE_PRICE_ID_ANNUAL / STRIPE_PRICE_ID_MONTHLY)',
    );
    return res.status(500).json({ error: '決済機能が一時的に利用できません。' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[stripe-checkout] Supabase server credentials not configured');
    return res.status(500).json({ error: '決済機能が一時的に利用できません。' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  const user = userData.user;

  // レート制限（決済セッション乱発による Stripe API 増幅・ノイズの抑止）。
  const rl = checkRateLimit(user.id);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'リクエストが多すぎます。少し時間をおいて再試行してください。' });
  }

  const origin = getOrigin(req);
  if (!origin) {
    return res.status(400).json({ error: 'Could not determine request origin' });
  }

  try {
    // 既に Stripe customer がある場合は再利用して重複顧客を防ぐ。
    // 読み取りは service_role（RLS バイパス）。行が無い / テーブル未適用 /
    // service_role 未設定でも checkout は成立させたいので best-effort。
    let existingCustomerId = null;
    let existingStatus = null;
    try {
      const dbClient = getServiceSupabase() || supabase;
      const { data: subRow } = await dbClient
        .from('subscriptions')
        .select('stripe_customer_id, status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (subRow?.stripe_customer_id) existingCustomerId = subRow.stripe_customer_id;
      if (subRow?.status) existingStatus = subRow.status;
    } catch {
      // subscriptions テーブル未適用などは無視して新規 customer 扱いにする。
    }

    // 🛡 二重課金ガード①: DB 上で既に有効な購読（active / trialing / past_due）
    // があるのに再度 checkout すると、同一ユーザーに 2 本目のサブスクリプションが
    // 成立して二重請求になる。409 で止め、クライアントは Portal（プラン管理）へ
    // 誘導する。
    if (['active', 'trialing', 'past_due'].includes(existingStatus)) {
      return res.status(409).json({
        error: { message: 'すでに有効なプランをご契約中です。プランの変更・確認は「プラン管理」から行えます。' },
        error_code: 'already_subscribed',
      });
    }

    // 🛡 二重課金ガード②: DB が canceled / 行無しでも、Webhook 遅延・未達で
    // Stripe 側には生きた購読が残っている可能性がある。customer が分かる場合は
    // Stripe を直接確認する（best-effort — 失敗しても checkout は通す）。
    if (existingCustomerId) {
      try {
        const live = await stripe.subscriptions.list({
          customer: existingCustomerId,
          status: 'active',
          limit: 1,
        });
        if (live?.data?.length > 0) {
          return res.status(409).json({
            error: { message: 'すでに有効なプランをご契約中です。プランの変更・確認は「プラン管理」から行えます。' },
            error_code: 'already_subscribed',
          });
        }
      } catch (e) {
        console.warn('[stripe-checkout] live subscription check failed (proceeding):', e?.message);
      }
    }

    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Webhook が user.id を引き当てるための紐付け。
      client_reference_id: user.id,
      // entitlement を user に確実に結びつけるため metadata にも入れておく。
      // plan は分析用（entitlement 判定には使わない — status='active' が真実）。
      subscription_data: { metadata: { user_id: user.id, plan } },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      allow_promotion_codes: true,
    };

    if (existingCustomerId) {
      params.customer = existingCustomerId;
    } else {
      params.customer_email = user.email || undefined;
    }

    const session = await stripe.checkout.sessions.create(params);
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
