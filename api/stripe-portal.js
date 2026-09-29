// 💳 Stripe Customer Portal セッションを作成するサーバーレス関数。
//
// 認証済みユーザーの stripe_customer_id から Customer Portal セッションを
// 生成し、その URL を返す。解約・カード変更・請求履歴の導線はすべて
// Stripe 側の Portal に委譲する（自前 UI を最小化）。
//
// 認証・Supabase クライアントの組み立ては api/claude.js と同じ流儀。
//
// 必要な環境変数:
//   - STRIPE_SECRET_KEY : Stripe シークレットキー（サーバー専用）
//   - SUPABASE_URL / SUPABASE_ANON_KEY : Bearer トークン検証用
//
// 依存: `stripe`（package.json に未追加 → `npm i stripe` が必要）。

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// In-memory レート制限（per serverless instance）。api/stripe-checkout.js と
// 同流儀（決済まわりのエンドポイントは揃えてガードする）。
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

// service_role キーで作る Supabase クライアント（api/stripe-webhook.js と同一流儀）。
// ⚠️ subscriptions テーブルは RLS で「SELECT は本人のみ」— サーバーの素の anon
// クライアントはユーザーの JWT を運ばないため auth.uid() が null になり、
// SELECT が常に 0 行を返す（＝全有料ユーザーが「課金情報なし」の 404 になる）。
// RLS をバイパスできる service_role で読むのが正解。api/claude.js の
// checkEntitlement と同パターン。
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

let stripeClient = null;
function getStripe() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = new Stripe(key, { apiVersion: '2024-06-20' });
  return stripeClient;
}

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

// return_url の origin を許可リストで確定（Origin/Host の verbatim 利用による
// オープンリダイレクトを防ぐ）。詳細は api/stripe-checkout.js の同名関数を参照。
function getAllowedOrigins() {
  const list = [];
  if (process.env.APP_ORIGIN) list.push(process.env.APP_ORIGIN.replace(/\/+$/, ''));
  if (process.env.VERCEL_URL) list.push(`https://${process.env.VERCEL_URL}`);
  list.push('https://orime.vercel.app', 'https://orime.jp', 'https://www.orime.jp');
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
    // どの env が欠けているかをクライアントに漏らさない（詳細はサーバーログのみ）。
    console.error('[stripe-portal] STRIPE_SECRET_KEY not configured');
    return res.status(500).json({ error: '決済機能が一時的に利用できません。' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[stripe-portal] Supabase server credentials not configured');
    return res.status(500).json({ error: '決済機能が一時的に利用できません。' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  const user = userData.user;

  // レート制限（Portal セッション乱発による Stripe API 増幅の抑止）。
  const rl = checkRateLimit(user.id);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'リクエストが多すぎます。少し時間をおいて、やり直してください。' });
  }

  const origin = getOrigin(req);
  if (!origin) {
    return res.status(400).json({ error: 'Could not determine request origin' });
  }

  try {
    // subscriptions の読み取りは service_role で行う（RLS バイパス）。
    // service_role 未設定環境では anon にフォールバック（RLS で 0 行 = 従来挙動）。
    const dbClient = getServiceSupabase() || supabase;
    const { data: subRow, error: subErr } = await dbClient
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subErr) {
      console.error('Stripe portal subscription lookup error:', subErr);
      return res.status(500).json({ error: 'Failed to look up subscription' });
    }

    const customerId = subRow?.stripe_customer_id;
    if (!customerId) {
      // まだ一度も課金したことがない（customer 未作成）。Portal は出せない。
      return res.status(404).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/?portal=return`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
}
