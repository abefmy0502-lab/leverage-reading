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
    // 月額 12 か月分と比べた割引（既定ラベル用。ストアから取れたときはストアの実数で計算し直す）。
    save: savingsLabel(1480, 12800),
  },
};

// 「月額プランより N% お得」。どちらも同じストア（同じ通貨）の実数から計算するので、
// 価格を変えても表示がずれない。差が小さい（5% 未満）ときは出さない。
export function savingsLabel(monthlyPrice, annualPrice) {
  const m = Number(monthlyPrice);
  const a = Number(annualPrice);
  if (!(m > 0) || !(a > 0)) return '';
  const pct = Math.floor((1 - a / (m * 12)) * 100);
  return pct >= 5 ? `月額プランより ${pct}% お得` : '';
}

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
    // 匿名 ID のまま購入されると、サーバー（webhook）がどのユーザーの購入か分からず、
    // 課金したのに AI が使えない状態になる。1 回だけやり直し、それでも駄目なら false を返す
    // （購入の前に呼ぶ purchasePlan はここで止めて、あとで試すよう案内する）。
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await Purchases.logIn({ appUserID: userId });
        _loggedInAs = userId;
        break;
      } catch {
        _loggedInAs = null;
      }
    }
  }
  return true;
}
let _loggedInAs = null;

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

// RevenueCat の introPrice から「無料トライアル」ラベルを作る。
// App Store Connect で Introductory Offer（無料）を設定した時だけ非空になる
// （未設定なら ''＝表示しない＝虚偽表示にならない）。割引イントロ（price>0）は無料扱いしない。
function formatFreeTrial(product) {
  const ip = product?.introPrice;
  if (!ip) return '';
  const price = Number(ip.price);
  if (Number.isFinite(price) && price > 0) return ''; // 無料ではない（割引イントロ）
  const n = Number(ip.periodNumberOfUnits) || 0;
  const unit = String(ip.periodUnit || '').toUpperCase();
  if (!n) return '';
  // 数字と単位の間に空きを入れる（「7 日間無料」・アプリのほかの数字の書き方とそろえる）。
  const label = unit === 'DAY' ? `${n} 日間`
    : unit === 'WEEK' ? `${n} 週間`
      : unit === 'MONTH' ? `${n} ヶ月`
        : unit === 'YEAR' ? `${n} 年間` : '';
  return label ? `${label}無料` : '';
}

// 🌱 この人が無料期間（Introductory Offer）を使えるか（相談の「相談相手が育ってきました」用）。
//   { status: 'eligible', label: '7 日間無料' } … ストアに無料期間があり、まだ使っていない
//   { status: 'ineligible', label: '' }          … 無料期間が無い・もう使った
//   { status: 'unknown', label: '' }             … ネイティブでない・読み込めなかった
// 分からないときは無料期間を約束しない側に倒す（呼び出し側は「プランを見る」の文にする）。
// 起動中は 1 回だけ確かめる（ストアへの問い合わせを繰り返さない）。
let introOfferCache = null;
export async function getIntroOffer(userId) {
  if (!isNative) return { status: 'unknown', label: '' };
  if (introOfferCache && introOfferCache.userId === userId) return introOfferCache.result;
  let result = { status: 'unknown', label: '' };
  try {
    const l = await getStoreLabels(userId);
    if (l?.ok) {
      const label = l.annual?.trial || l.monthly?.trial || '';
      result = label ? { status: 'eligible', label } : { status: 'ineligible', label: '' };
    }
  } catch { /* unknown のまま */ }
  if (result.status !== 'unknown') introOfferCache = { userId, result };
  return result;
}

// ストアのローカライズ価格ラベルを返す。失敗時は App 既定ラベル。
// 戻り値の ok=false は「ストアの価格が取れなかった」。料金画面はコードに書いた ¥ を見せず、
// 「読み込めませんでした＋再読み込み」にする（他国のストアで通貨・金額が食い違わないように）。
export async function getStoreLabels(userId) {
  const fallback = { ...APP_PLAN_LABELS, ok: false };
  if (!(await ensureConfigured(userId))) return fallback;
  try {
    const offering = await getCurrentOffering();
    if (!offering) return fallback;
    const m = pickPackage(offering, 'monthly');
    const a = pickPackage(offering, 'annual');
    if (!m?.product?.priceString || !a?.product?.priceString) return fallback;
    const eligible = await trialEligibility([m.product, a.product]);
    return {
      ok: true,
      monthly: { ...APP_PLAN_LABELS.monthly, price: `月額 ${m.product.priceString}`, trial: eligible(m.product) ? formatFreeTrial(m.product) : '' },
      annual: {
        ...APP_PLAN_LABELS.annual,
        // 月あたりの額もストアの値から（「年額 ¥12,800（月あたり ¥1,066）」）。
        price: a.product.pricePerMonthString
          ? `年額 ${a.product.priceString}（月あたり ${a.product.pricePerMonthString}）`
          : `年額 ${a.product.priceString}`,
        save: savingsLabel(m.product.price, a.product.price),
        trial: eligible(a.product) ? formatFreeTrial(a.product) : '',
      },
    };
  } catch {
    return fallback;
  }
}

// 無料期間を「使える人」にだけ出す（過去に試用した人に「無料で始める」と出さない）。
// 判定できなかったときは出さない側に倒す（誤解を招く表示を避ける）。
async function trialEligibility(products) {
  try {
    const Purchases = await loadPurchases();
    const ids = products.map((p) => p?.identifier).filter(Boolean);
    if (!Purchases || ids.length === 0) return () => false;
    const res = await Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: ids });
    // INTRO_ELIGIBILITY_STATUS_ELIGIBLE = 2
    return (p) => Number(res?.[p?.identifier]?.status) === 2;
  } catch {
    return () => false;
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
  if (userId && _loggedInAs !== userId) {
    throw new Error('購入の準備ができませんでした。通信の良い場所で、もう一度お試しください。');
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

// 🪙➕ 追加トークン（消耗型の App 内課金）。
// ⚠️ 消耗型は RevenueCat の entitlement に付けない（付けると hasActiveEntitlement が「契約中」と誤判定する）。
//    消耗型は「購入を復元」の対象外（使えば無くなるため）。届いたトークンの真実は ai_token_lots（webhook が足す）。
// ストアの価格（priceString）。取れなければ {}（画面は fallbackPrice を出す）。
export async function getTokenPackPrices(productIds, userId) {
  if (!(await ensureConfigured(userId))) return {};
  try {
    const Purchases = await loadPurchases();
    const res = await Purchases.getProducts({ productIdentifiers: productIds, type: 'NON_SUBSCRIPTION' });
    const out = {};
    for (const p of res?.products || []) {
      if (p?.identifier && p.priceString) out[p.identifier] = p.priceString;
    }
    return out;
  } catch {
    return {};
  }
}

// 追加トークンを買う。戻り値 { ok: true } / { ok: false, cancelled: true }。その他の失敗は throw。
export async function purchaseTokenPack(productId, userId) {
  if (!(await ensureConfigured(userId))) {
    throw new Error('App内課金を初期化できませんでした。');
  }
  if (userId && _loggedInAs !== userId) {
    throw new Error('購入の準備ができませんでした。通信の良い場所で、もう一度お試しください。');
  }
  const Purchases = await loadPurchases();
  let product = null;
  try {
    const res = await Purchases.getProducts({ productIdentifiers: [productId], type: 'NON_SUBSCRIPTION' });
    product = (res?.products || []).find((p) => p?.identifier === productId) || null;
  } catch { /* 下で案内 */ }
  if (!product) throw new Error('購入できる商品が見つかりませんでした。');
  try {
    await Purchases.purchaseStoreProduct({ product });
    return { ok: true };
  } catch (e) {
    const code = String(e?.code || '');
    const msg = String(e?.message || e?.underlyingErrorMessage || '').toLowerCase();
    const cancelled = e?.userCancelled === true || code === 'PURCHASE_CANCELLED_ERROR' || code === 'PURCHASE_CANCELLED' || /cancel/.test(msg);
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
  // ログイン（logIn）に失敗して匿名 ID のまま復元すると、RevenueCat が購入をその匿名 ID へ移し
  // （TRANSFER）、webhook がこの人の subscriptions を canceled にしてしまう（払っているのに AI が止まる）。
  // 購入と同じく、この人として紐付いていないときは復元しない。
  if (userId && _loggedInAs !== userId) {
    throw new Error('復元の準備ができませんでした。通信の良い場所で、もう一度お試しください。');
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
