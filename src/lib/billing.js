// 💳 課金（Stripe）クライアントヘルパー。
//
// Web 版のハードペイウォール用。Checkout / Customer Portal の各サーバーレス
// 関数（api/stripe-checkout.js / api/stripe-portal.js）を Bearer 付きで叩き、
// 返ってきた `url` へリダイレクトするための薄いラッパ。
//
// ★ 価格の実数はここに持たない（Stripe 側の Price 設定が真実）。
//   表示用ラベルだけ env（VITE_PRICE_*_LABEL）で受け取り、未設定なら
//   ブランド基準（brand-messaging.md）の既定文言にフォールバックする。
//   ラベルは「表示専用」であり、決済金額には一切影響しない。
//
// ※ 将来 Capacitor（IAP / RevenueCat）対応を入れる時は、ここで
//   `Capacitor.isNativePlatform()` を見て分岐し、native は Stripe Web Checkout
//   ではなくストア課金フローへ振り分ける想定（今回は Web 専用でスコープ外）。

import { supabase, isSupabaseConfigured } from './supabase';
import { apiUrl } from './apiUrl';

// ───────────────────────────────────────────────────────────────────
// プラン表示ラベル（表示専用 / 金額の真実ではない）
// ───────────────────────────────────────────────────────────────────
const ENV_MONTHLY_LABEL = import.meta.env.VITE_PRICE_MONTHLY_LABEL;
const ENV_ANNUAL_LABEL = import.meta.env.VITE_PRICE_ANNUAL_LABEL;
const ENV_ANNUAL_NOTE = import.meta.env.VITE_PRICE_ANNUAL_NOTE;

export const PLAN_LABELS = {
  monthly: {
    id: 'monthly',
    name: '月額プラン',
    // 既定は brand-messaging.md の事実価格。env で上書き可能。
    // App 版（App Store IAP）の価格に統一。金額の真実はストア側設定。
    price: ENV_MONTHLY_LABEL || '月額 ¥1,480（税込）',
    note: 'いつでも解約OK・データは残ります',
  },
  annual: {
    id: 'annual',
    name: '年額プラン',
    price: ENV_ANNUAL_LABEL || '年額 ¥12,800（税込・月あたり約¥1,066）',
    // 年額の割引率などはストア側設定が真実。誇大にならない控えめな一言。
    note: ENV_ANNUAL_NOTE || 'まとめてお得・いつでも解約OK',
  },
};

// Supabase セッションから access token を取得（ai.js の getAccessToken と同じ流儀）。
async function getAccessToken() {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

async function postJson(path, body) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('ログインが必要です。');
  }
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body || {}),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON レスポンス */
  }

  if (!res.ok) {
    // error は文字列（従来）と { message } オブジェクト（already_subscribed 等の
    // 構造化エラー）の両形式がある。message を優先して人間向け文言を取り出す。
    const msg = data?.error?.message || data?.error || `エラー (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : 'エラーが発生しました。');
  }
  return data || {};
}

// 契約フロー: plan を指定して Checkout Session を作り、その URL へ遷移する。
// 成功時はページ遷移するので呼び出し側に戻らない。失敗時は throw。
export async function startCheckout(plan = 'monthly') {
  const normalized = plan === 'annual' ? 'annual' : 'monthly';
  const { url } = await postJson('/api/stripe-checkout', { plan: normalized });
  if (!url) throw new Error('決済ページの URL を取得できませんでした。');
  window.location.assign(url);
}

// プラン管理（解約・カード変更）: Customer Portal セッションを作り、URL へ遷移。
export async function openBillingPortal() {
  const { url } = await postJson('/api/stripe-portal', {});
  if (!url) throw new Error('プラン管理ページの URL を取得できませんでした。');
  window.location.assign(url);
}
