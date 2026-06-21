import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';

// 💳 ログインユーザーの課金状態を取得するフック。
//
// 全機能有料モデル（フリーミアム無し・無料トライアル無し）の entitlement 判定に使う。
// `isActive = status === 'active'` のみを「有料権利あり」とみなす。
//   - トライアルは無いので 'trialing' は不要。
//   - past_due（支払い遅延）を猶予として一時的に許可したい場合は、
//     下の isActive 算出を `['active', 'past_due'].includes(status)` に拡張する。
//     デフォルトは厳格に 'active' のみ。
//
// supabase_subscriptions.sql 未適用（テーブル無し）の DB でも落ちないように
// graceful fallback する（他の *_full.sql フォールバックと同じ流儀）。
// その場合 isActive=false / subscription=null で静かに縮退する。

// テーブルが存在しない等の「スキーマ未適用」エラーを判定する。
function isSchemaError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('not exist') ||
    msg.includes('relation') ||
    msg.includes('schema cache') ||
    error?.code === '42P01' || // undefined_table
    error?.code === 'PGRST205' // PostgREST: table not found in schema cache
  );
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
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

export function useSubscription() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchSubscription = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setSubscription(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbError) {
        // テーブル未適用なら課金未導入とみなして静かに縮退（未課金扱い）。
        if (isSchemaError(dbError)) {
          setSubscription(null);
          setError(null);
          return;
        }
        throw dbError;
      }
      setSubscription(transformSubscription(data));
      setError(null);
    } catch (e) {
      console.error('課金状態の取得エラー:', e);
      // 詰み防止 / fail-open: ネットワーク等の一時的失敗で直前まで判明していた
      // 課金状態（active 等）を null に潰さない。潰すと、契約済みユーザーが
      // 一時的な通信エラー（タブ復帰・?checkout=success のリトライ等）の度に
      // isActive=false へ落ち、ペイウォールにロックされてしまう。
      // last-known-good を温存し、error だけ surface する（schema-error 判定は別途）。
      // 未契約（subscription=null）のユーザーはそのまま null のままなので
      // ペイウォールは弱まらない。
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchSubscription();
    } else {
      setSubscription(null);
      setError(null);
      setLoading(false);
    }
  }, [user, fetchSubscription]);

  // entitlement 判定: 厳格に status='active' のみ許可。
  const isActive = subscription?.status === 'active';

  return {
    subscription,
    isActive,
    loading,
    error,
    refresh: fetchSubscription,
  };
}
