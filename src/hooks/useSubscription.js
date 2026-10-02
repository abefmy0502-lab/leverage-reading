import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { isNative, hasActiveEntitlement } from '../lib/iap';
import { isSchemaError } from '../lib/errors';

// 💳 ログインユーザーの課金状態を取得するフック。
//
// フリーミアム（2026-09-27〜）: 契約が無くてもアプリは使える（無料プラン）。ここはプランの判定に使う。
// `isActive = status === 'active'` のみを「有料権利あり」とみなす。
//   - App Store の Introductory Offer（無料期間）は RevenueCat 経由でも
//     status='active'（subscriptions.period_type='trial'/'intro' で区別）として
//     届くため、この判定のままトライアル会員も通る。'trialing' という別 status は
//     使っていない。
//   - past_due（支払い遅延）を猶予として一時的に許可したい場合は、
//     下の isActive 算出を `['active', 'past_due'].includes(status)` に拡張する。
//     デフォルトは厳格に 'active' のみ。
//
// supabase_subscriptions.sql 未適用（テーブル無し）の DB でも落ちないように
// graceful fallback する（他の *_full.sql フォールバックと同じ流儀）。
// その場合 isActive=false / subscription=null で静かに縮退する。

// テーブルが存在しない等の「スキーマ未適用」エラー判定は lib/errors.js の
// isSchemaError に一極集中（旧ローカル実装より広い和集合）。ここで判定が漏れる
// と下の catch（一時障害扱い）に落ちて error が surface されるだけだが、逆に
// 「schema error なのに拾えず縮退できない」事故を防ぐため共通判定を使う。

// 🛟 最後に確認できた entitlement の端末キャッシュ（詰み防止・fail-open）。
// 初回マウント時の SELECT がオフライン/一時障害で失敗すると last-known-good が
// メモリに存在せず、課金済みユーザーが機内モードで PWA を開いただけで
// ペイウォールにロックされる。active を確認できた時だけ書き、7日で失効。
const ENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const entKey = (uid) => `orime-entitlement:${uid}`;

function readCachedEntitlement(uid) {
  try {
    const raw = localStorage.getItem(entKey(uid));
    if (!raw) return null;
    const { at } = JSON.parse(raw);
    if (!at || Date.now() - at > ENT_TTL_MS) return null;
    return { status: 'active', fromCache: true };
  } catch { return null; }
}

function writeCachedEntitlement(uid, active) {
  try {
    if (active) localStorage.setItem(entKey(uid), JSON.stringify({ at: Date.now() }));
    else localStorage.removeItem(entKey(uid));
  } catch { /* ignore */ }
}

const transformSubscription = (row) => {
  if (!row) return null;
  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    status: row.status || null,
    priceId: row.price_id || null,
    currentPeriodEnd: row.current_period_end || null,
    // 'trial' = 無料期間（7 日間無料）。'normal' / null / 'intro'（有料の初回価格＝創業メンバー価格「1 年目 ¥9,800」）= 有料。
    // トークンの量と行が変わる（2026-10-02 に 'intro' を有料へ）。
    periodType: row.period_type || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

export function useSubscription() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // ネイティブ(iOS/IAP) の端末ローカル entitlement。webhook→DB 反映を待たず
  // 購入/復元直後に本人をアンロックするための即時真実。Web では常に false。
  const [nativeEntitled, setNativeEntitled] = useState(false);
  const { user } = useAuth();
  // fetchSubscription の in-flight 混線ガード用（常に最新のユーザー id を参照）。
  const userRef = useRef(user?.id ?? null);
  // 読み込み表示（loading=true）は、そのユーザーの最初の 1 回だけ。2 回目以降の確認
  // （購入後の refresh 等）で loading に戻すと、課金の門（PaywallGate）が読み込み表示に
  // 替わってアプリ全体が作り直され、書きかけが消える。
  const loadedForRef = useRef(null);
  useEffect(() => { userRef.current = user?.id ?? null; }, [user?.id]);

  const fetchSubscription = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setSubscription(null);
      setNativeEntitled(false);
      setError(null);
      setLoading(false);
      return;
    }
    // アカウント切替の in-flight 混線ガード: 発行時のユーザーを控え、応答時に
    // 変わっていたら破棄する（前ユーザー宛の SELECT が後着して別人の課金状態で
    // アンロック/ロックされるのを防ぐ）。
    const forUserId = user.id;
    const isCurrent = () => userRef.current === forUserId;
    if (loadedForRef.current !== forUserId) setLoading(true);
    let dbActive = false;
    try {
      const { data, error: dbError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isCurrent()) return; // ユーザーが切り替わった — この応答は破棄
      if (dbError) {
        // テーブル未適用なら課金未導入とみなして静かに縮退（未課金扱い）。
        if (isSchemaError(dbError)) {
          setSubscription(null);
        } else {
          throw dbError;
        }
      } else {
        setSubscription(transformSubscription(data));
        dbActive = data?.status === 'active';
        // 確認できた真実を端末にも控える（次回の初回ロード失敗に備える）。
        writeCachedEntitlement(user.id, dbActive);
      }
      setError(null);
    } catch (e) {
      console.error('課金状態の取得エラー:', e);
      // 詰み防止 / fail-open: ネットワーク等の一時的失敗で直前まで判明していた
      // 課金状態（active 等）を null に潰さない。潰すと、契約済みユーザーが
      // 一時的な通信エラー（タブ復帰・?checkout=success のリトライ等）の度に
      // isActive=false へ落ち、ペイウォールにロックされてしまう。
      // last-known-good を温存し、初回ロード（メモリに何も無い）では端末
      // キャッシュ（7日TTL）で補う。error だけ surface する。
      setSubscription((prev) => prev || readCachedEntitlement(user.id));
      setError(e);
    }
    // ネイティブのみ: DB が active でない場合、端末ローカル(RevenueCat)の
    // entitlement を確認する。これにより webhook が遅延/未発火でも、購入/復元
    // 直後の本人が確実にアンロックされる（「払ったのにロック」事故の根治）。
    // Web では hasActiveEntitlement が即 false を返す＝無害。
    if (!dbActive && isNative) {
      try {
        setNativeEntitled(await hasActiveEntitlement(user.id));
      } catch {
        /* keep previous */
      }
    } else if (dbActive) {
      setNativeEntitled(false); // DB が真実のときはそちらを優先
    }
    if (isCurrent()) loadedForRef.current = forUserId;
    setLoading(false);
  // user オブジェクトではなく id に依存する（同じ人の別オブジェクトで取り直さない）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      fetchSubscription();
    } else {
      loadedForRef.current = null;
      setSubscription(null);
      setNativeEntitled(false);
      setError(null);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchSubscription]);

  // entitlement 判定: DB の status='active'（Stripe/IAP webhook 同期済み）
  // または ネイティブ端末ローカルの RevenueCat entitlement。
  const isActive = subscription?.status === 'active' || nativeEntitled;

  return {
    subscription,
    isActive,
    loading,
    error,
    refresh: fetchSubscription,
  };
}
