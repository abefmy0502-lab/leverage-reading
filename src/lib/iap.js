// 📱 In-App Purchase (RevenueCat) ラッパ — iOS / Capacitor 専用。
//
// 設計の肝:
//   - Web (ブラウザ / PWA) では一切ロードしない。RevenueCat SDK は `isNative`
//     ガードの内側で **dynamic import** するだけなので、Web バンドルには含まれず
//     (遅延チャンク)、Web 実行時には評価もされない。Web の課金は従来どおり
//     Stripe (billing.js) を使う。
//   - 課金の最終的な真実は Supabase `subscriptions` テーブル (RevenueCat webhook
//     が同期) で、`useSubscription` がそれを読む。本モジュールの役割は「購入シート
//     を出す」「復元する」「ストア価格ラベルを取る」「ストアのサブスク管理を開く」
//     の4つだけ。
//   - 価格はコードに焼かない。表示は App Store が返すローカライズ価格 (priceString)
//     を最優先し、取れない時だけ App チャネルの既定ラベル (¥1,480/¥12,800・月あたり約¥1,066) に
//     フォールバックする。金額の真実は App Store Connect の商品設定。
//
// ⚠️ RevenueCat の実 API はネイティブ実機 (Mac/TestFlight) で最終検証する。
//    本モジュールは全呼び出しを try/catch + フォールバックで包み、API 差異が
//    あっても Web を一切壊さない (native 限定) よう防御している。

import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

// RevenueCat Public SDK Key (apple)。公開鍵なのでクライアント露出 OK。
const RC_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY;

// App(IAP) の既定表示ラベル。ストアから価格が取れない時のフォールバック。
// 金額の真実は App Store Connect の商品設定 (コード非依存)。
export const APP_PLAN_LABELS = {
  monthly: {
    id: 'monthly',
    name: '月額プラン',
    price: '月額 ¥1,480（税込）',
    note: 'いつでも解約OK・データは残ります',
  },
  annual: {
    id: 'annual',
    name: '年額プラン',
    price: '年額 ¥12,800（税込・月あたり約¥1,066）',
    note: 'まとめてお得・いつでも解約OK',
  },
};

let _Purchases = null;
let _configured = false;

async function loadPurchases() {
  if (!isNative) return null;
  if (_Purchases) return _Purchases;
  const mod = await import('@revenuecat/purchases-capacitor');
  _Purchases = mod.Purchases;
  return _Purchases;
}

// SDK 設定 + ユーザー紐付け (冪等)。購入 / 復元 / 価格取得の前に必ず通す。
// app_user_id を Supabase user.id に揃えることで、webhook の UUID 検証
// (api/revenuecat-webhook.js) と突き合う。
export async function ensureConfigured(userId) {
  if (!isNative || !RC_IOS_KEY) return false;
  const Purchases = await loadPurchases();
  if (!Purchases) return false;
  if (!_configured) {
    await Purchases.configure({ apiKey: RC_IOS_KEY });
    _configured = true;
  }
  if (userId) {
    try {
      await Purchases.logIn({ appUserID: userId });
    } catch {
      /* ログイン失敗は致命ではない (匿名IDのまま購入は可能) */
    }
  }
  return true;
}

async function getCurrentOffering() {
  const Purchases = await loadPurchases();
  if (!Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings?.current || null;
  } catch {
    return null;
  }
}

// monthly / annual のパッケージを offering から引く。packageType 優先、
// 取れなければ identifier の部分一致でフォールバック。
function pickPackage(offering, plan) {
  const pkgs = offering?.availablePackages;
  if (!Array.isArray(pkgs) || pkgs.length === 0) return null;
  const wantType = plan === 'annual' ? 'ANNUAL' : 'MONTHLY';
  return (
    pkgs.find((p) => p.packageType === wantType) ||
    pkgs.find((p) => String(p.identifier || '').toLowerCase().includes(plan)) ||
    null
  );
}

// ストアのローカライズ価格ラベルを返す。失敗時は App 既定ラベル。
export async function getStoreLabels(userId) {
  const fallback = APP_PLAN_LABELS;
  if (!(await ensureConfigured(userId))) return fallback;
  try {
    const offering = await getCurrentOffering();
    if (!offering) return fallback;
    const m = pickPackage(offering, 'monthly');
    const a = pickPackage(offering, 'annual');
    return {
      monthly: {
        ...fallback.monthly,
        price: m?.product?.priceString ? `月額 ${m.product.priceString}` : fallback.monthly.price,
      },
      annual: {
        ...fallback.annual,
        price: a?.product?.priceString ? `年額 ${a.product.priceString}` : fallback.annual.price,
      },
    };
  } catch {
    return fallback;
  }
}

// 購入。戻り値:
//   { ok: true }                  — 購入成功 (webhook が subscriptions を更新)
//   { ok: false, cancelled: true } — ユーザーがシートをキャンセル
//   throw                          — その他の失敗 (呼び出し側で humanize)
export async function purchasePlan(plan, userId) {
  if (!(await ensureConfigured(userId))) {
    throw new Error('App内課金を初期化できませんでした。');
  }
  const Purchases = await loadPurchases();
  const offering = await getCurrentOffering();
  const pkg = pickPackage(offering, plan);
  if (!pkg) throw new Error('購入可能なプランが見つかりませんでした。');
  try {
    const res = await Purchases.purchasePackage({ aPackage: pkg });
    const active = res?.customerInfo?.entitlements?.active || {};
    return { ok: true, active: Object.keys(active).length > 0 };
  } catch (e) {
    // RevenueCat はキャンセルを userCancelled フラグ / 専用コード(文字列)で返す。
    // v13 の error.code は 'PURCHASE_CANCELLED_ERROR'（数値 '1' ではない）。
    // userCancelled は hybrid SDK で取りこぼす報告があるため複数経路で冗長判定。
    const code = String(e?.code || '');
    const msg = String(e?.message || e?.underlyingErrorMessage || '').toLowerCase();
    const cancelled =
      e?.userCancelled === true ||
      code === 'PURCHASE_CANCELLED_ERROR' ||
      code === 'PURCHASE_CANCELLED' ||
      /cancel/.test(msg);
    if (cancelled) return { ok: false, cancelled: true };
    throw e;
  }
}

// 端末ローカルの entitlement（RevenueCat customerInfo）が有効か。
// webhook→DB 反映を待たずに、購入/復元直後の本人を即アンロックするための即時判定。
// （Web では isNative=false で即 false。RevenueCat SDK もロードされない＝無害）
export async function hasActiveEntitlement(userId) {
  if (!(await ensureConfigured(userId))) return false;
  const Purchases = await loadPurchases();
  if (!Purchases) return false;
  try {
    const res = await Purchases.getCustomerInfo();
    const active = res?.customerInfo?.entitlements?.active || {};
    return Object.keys(active).length > 0;
  } catch {
    return false;
  }
}

// 購入の復元 (Apple 必須要件)。戻り値 true = 有効な entitlement あり。
export async function restorePurchases(userId) {
  if (!(await ensureConfigured(userId))) {
    throw new Error('購入の復元を初期化できませんでした。');
  }
  const Purchases = await loadPurchases();
  const res = await Purchases.restorePurchases();
  const active = res?.customerInfo?.entitlements?.active || {};
  return Object.keys(active).length > 0;
}

// iOS のサブスク管理 (解約・プラン変更) は App Store のアカウント設定で行う。
export async function openManageSubscriptions() {
  try {
    window.open('https://apps.apple.com/account/subscriptions', '_blank', 'noopener');
  } catch {
    /* noop */
  }
}
