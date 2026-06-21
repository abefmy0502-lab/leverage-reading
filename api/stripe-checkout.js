// 💳 Stripe Checkout Session を作成するサーバーレス関数。
//
// 認証済みユーザー（Bearer トークン → supabase.auth.getUser）に対し、
// 月額サブスクリプション（mode: 'subscription'、STRIPE_PRICE_ID 1 点）の
// Checkout Session を作成し、その URL を返す。クライアントはこの URL に
// リダイレクトする。
//
// 認証・Supabase クライアントの組み立ては api/claude.js と同じ流儀。
//
// 必要な環境変数:
//   - STRIPE_SECRET_KEY : Stripe シークレットキー（サーバー専用）
//   - STRIPE_PRICE_ID   : 月額 ¥1,000 プランの Price ID
//   - SUPABASE_URL / SUPABASE_ANON_KEY : Bearer トークン検証用（api/claude.js と共通）
//
// 依存: `stripe`（package.json に未追加 → `npm i stripe` が必要）。

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

// success_url / cancel_url を組み立てるための origin を、信頼できる
// リクエストヘッダー（origin → 無ければ host + proto）から導出する。
function getOrigin(req) {
  const origin = req.headers?.origin;
  if (typeof origin === 'string' && /^https?:\/\//.test(origin)) return origin;
  const host = req.headers?.host;
  if (host) {
    const proto = req.headers?.['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripe();
  if (!stripe) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
  }
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return res.status(500).json({ error: 'STRIPE_PRICE_ID not configured' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase server credentials not configured' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  const user = userData.user;

  const origin = getOrigin(req);
  if (!origin) {
    return res.status(400).json({ error: 'Could not determine request origin' });
  }

  try {
    // 既に Stripe customer がある場合は再利用して重複顧客を防ぐ。
    // 行が無い / テーブル未適用でも checkout は成立させたいので best-effort。
    let existingCustomerId = null;
    try {
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (subRow?.stripe_customer_id) existingCustomerId = subRow.stripe_customer_id;
    } catch {
      // subscriptions テーブル未適用などは無視して新規 customer 扱いにする。
    }

    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Webhook が user.id を引き当てるための紐付け。
      client_reference_id: user.id,
      // entitlement を user に確実に結びつけるため metadata にも入れておく。
      subscription_data: { metadata: { user_id: user.id } },
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
