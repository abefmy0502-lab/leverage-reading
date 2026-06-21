// 💳 Stripe Webhook ハンドラ。
//
// Stripe からの Webhook を受け取り、署名を検証してから Supabase の
// `subscriptions` テーブルを service_role キーで upsert / 更新する。
// これが課金 entitlement の真実の源（status='active' なら有料機能を許可）。
//
// ───────────────────────────────────────────────────────────────────
// ★ raw body が必須
//   stripe.webhooks.constructEvent は「Stripe が署名したのと完全に同一の
//   生バイト列」を必要とする。Vercel / Next 系のデフォルト JSON bodyParser
//   が走ると body が再シリアライズされ、署名検証が必ず失敗する。
//   そのため下の `export const config` で bodyParser を無効化し、
//   req のストリームを自前で読んで Buffer を constructEvent に渡す。
// ───────────────────────────────────────────────────────────────────
//
// ハンドルするイベント:
//   - checkout.session.completed      : 初回購入完了 → customer/subscription を確定
//   - customer.subscription.updated   : 更新（status / 期間 / プラン変更）
//   - customer.subscription.deleted   : 解約完了 → status を canceled に
//   - invoice.payment_failed          : 支払い失敗 → status を past_due 等に同期
//
// 冪等性: いずれも user_id を PK にした upsert / update なので、同一イベントの
// 再送（Stripe は at-least-once 配信）でも壊れない。
//
// 必要な環境変数:
//   - STRIPE_SECRET_KEY          : Stripe シークレットキー
//   - STRIPE_WEBHOOK_SECRET      : Webhook 署名シークレット（whsec_...）
//   - SUPABASE_URL               : Supabase プロジェクト URL
//   - SUPABASE_SERVICE_ROLE_KEY  : service_role キー（RLS バイパス。サーバー専用、
//                                  絶対にクライアントへ露出しないこと）

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Vercel の Node ランタイムにデフォルト bodyParser を切らせる。
// これにより req は生のストリームとして届き、署名検証に使える。
export const config = {
  api: {
    bodyParser: false,
  },
};

let stripeClient = null;
function getStripe() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = new Stripe(key, { apiVersion: '2024-06-20' });
  return stripeClient;
}

// service_role キーで作る Supabase クライアント。RLS をバイパスして
// subscriptions に書き込めるのは Webhook（=このサーバー）だけ。
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

// req（Node IncomingMessage）の生バイト列を Buffer にまとめる。
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function toIso(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

// subscription オブジェクトから subscriptions テーブル用の patch を作る。
function subscriptionFields(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id || null;
  return {
    stripe_subscription_id: sub?.id || null,
    status: sub?.status || null,
    price_id: priceId,
    current_period_end: toIso(sub?.current_period_end),
  };
}

// user_id を解決する。subscription / session の metadata や client_reference_id を
// 第一に使い、無ければ既存行を stripe_customer_id で逆引きする。
async function resolveUserId(supabase, { metadataUserId, customerId }) {
  if (metadataUserId) return metadataUserId;
  if (customerId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
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
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET not configured' });
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase service role not configured' });
  }

  // 1) 署名検証（raw body 必須）
  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err?.message);
    return res.status(400).json({ error: `Webhook signature verification failed` });
  }

  // 2) イベント処理
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id || null;
        const userId = await resolveUserId(supabase, {
          metadataUserId: session.client_reference_id || session.metadata?.user_id,
          customerId,
        });
        if (!userId) {
          console.error('checkout.session.completed: could not resolve user_id', session.id);
          break;
        }

        // subscription を取得して status / 期間 / price を確定させる。
        let fields = {};
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          fields = subscriptionFields(sub);
        }

        const { error } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              ...fields,
            },
            { onConflict: 'user_id' },
          );
        if (error) throw error;
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null;
        const userId = await resolveUserId(supabase, {
          metadataUserId: sub.metadata?.user_id,
          customerId,
        });
        if (!userId) {
          console.error(`${event.type}: could not resolve user_id`, sub.id);
          break;
        }

        const { error } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              ...subscriptionFields(sub),
            },
            { onConflict: 'user_id' },
          );
        if (error) throw error;
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id || null;
        const userId = await resolveUserId(supabase, {
          metadataUserId: invoice.metadata?.user_id,
          customerId,
        });
        if (!userId) {
          console.error('invoice.payment_failed: could not resolve user_id', invoice.id);
          break;
        }

        // 最新の subscription status を Stripe から取り直して同期する
        // （past_due / unpaid 等）。取得できなければ past_due で埋める。
        let fields = { status: 'past_due' };
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            fields = subscriptionFields(sub);
          } catch {
            /* fall back to past_due */
          }
        }

        const { error } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              ...fields,
            },
            { onConflict: 'user_id' },
          );
        if (error) throw error;
        break;
      }

      default:
        // 関心のないイベントは 200 で受け流す（Stripe に再送させない）。
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler error:', error);
    // 5xx を返すと Stripe が再送する。冪等な upsert なので再送は安全。
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
