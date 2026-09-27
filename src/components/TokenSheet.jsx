// 🪙➕ 「トークンを追加」のシート（プランの人だけ・2026-09-27 オーナー裁定）。
//
// App Store の消耗型の App 内課金（RevenueCat）で、300 / 1,000 トークンを買い足す。
// 価格はストアの値（取れなければ既定の表示）。届いたトークンの真実は ai_token_lots（webhook が足す）なので、
// 買ったあとは残りを数回取り直して、増えたら「追加しました」。
// 開くのは App の PaywallGate（openTokenSheet）。相談・AI 選書・テーマまとめの上限の案内と設定から。
//
// 🧪 お試しモード（開発専用）では、購入の代わりにその場でロットを 1 つ足す（画面の確認用）。

import { useEffect, useState } from 'react';
import { Circle, CircleCheck } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { useToast } from './Toast';
import { useAuth } from '../hooks/useAuth';
import { TOKEN_PACKS, TOKEN_LOT_DAYS } from '../lib/tokens';
import { isNative, getTokenPackPrices, purchaseTokenPack } from '../lib/iap';
import { isDemo, supabase } from '../lib/supabase';
import { toMessage } from '../lib/errors';
import { btnPrimary, btnPrimaryOff } from '../styles/ui';

const optionBase = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 44,
  padding: 'var(--space-3) var(--space-4)', textAlign: 'left', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer',
};
const meta = { display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };

// 🧪 開発専用: お試しモードの &native=1&price=loading|fail で、アプリ版の価格の読み込み中・失敗を撮る
// （本番は isDemo=false で常に off。購入の実行可否は isNative / isDemo で決める）。
const preview = (() => {
  if (!isDemo || typeof window === 'undefined') return { on: false, price: '' };
  const sp = new URLSearchParams(window.location.search);
  return { on: sp.get('native') === '1', price: sp.get('price') || '' };
})();
const showNative = isNative || preview.on;

// onPurchased: 買えたあとに残りを取り直す（増えたら true を返す）。
export default function TokenSheet({ onClose, onPurchased }) {
  const { user } = useAuth();
  const toast = useToast();
  const [selected, setSelected] = useState(TOKEN_PACKS[TOKEN_PACKS.length - 1]?.id);
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState(false);
  // アプリ版の価格（ストアの値）: 'loading' | 'ready' | 'failed'。Web は既定の表示のまま（最初から ready）。
  const [priceState, setPriceState] = useState(
    isNative ? 'loading' : preview.on && preview.price === 'fail' ? 'failed' : preview.on && preview.price === 'loading' ? 'loading' : 'ready',
  );
  const [priceTry, setPriceTry] = useState(0);

  useEffect(() => {
    if (!isNative) return undefined;
    let alive = true;
    setPriceState('loading');
    getTokenPackPrices(TOKEN_PACKS.map((p) => p.id), user?.id)
      .then((m) => {
        if (!alive) return;
        const got = m || {};
        setPrices(got);
        // ストアから 1 つも取れなければ失敗（その国の通貨と違う既定の ¥ で買わせない）。
        setPriceState(Object.keys(got).length > 0 ? 'ready' : 'failed');
      })
      .catch(() => { if (alive) setPriceState('failed'); });
    return () => { alive = false; };
  }, [user?.id, priceTry]);

  const pricesReady = !showNative || priceState === 'ready';
  const canBuy = (isNative || isDemo) && pricesReady;

  const buy = async () => {
    if (busy || !selected) return;
    const pack = TOKEN_PACKS.find((p) => p.id === selected);
    setBusy(true);
    try {
      if (isNative) {
        const res = await purchaseTokenPack(selected, user?.id);
        if (res?.cancelled) { setBusy(false); return; }
      } else if (isDemo) {
        // お試しモード: webhook の代わりにその場で 1 ロット足す。
        const now = Date.now();
        await supabase.from('ai_token_lots').insert({
          tokens_total: pack.tokens, tokens_left: pack.tokens, source: 'iap',
          transaction_id: `demo-${now}`, product_id: pack.id, environment: 'sandbox',
          purchased_at: new Date(now).toISOString(),
          expires_at: new Date(now + TOKEN_LOT_DAYS * 86400000).toISOString(),
        });
      }
      // webhook が足すまで少し待つことがある。数回取り直して、増えたら知らせる。
      let arrived = false;
      for (const ms of [0, 1500, 3000, 5000, 8000]) {
        // eslint-disable-next-line no-await-in-loop
        if (ms) await new Promise((r) => setTimeout(r, ms));
        // eslint-disable-next-line no-await-in-loop
        if (await onPurchased?.()) { arrived = true; break; }
      }
      toast.success(arrived ? `${pack.tokens.toLocaleString()} トークンを追加しました。` : '購入しました。反映まで少しお待ちください。');
      onClose?.();
    } catch (e) {
      toast.error(toMessage(e, '購入できませんでした。少し時間をおいて、もう一度お試しください。'));
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title="トークンを追加"
      onClose={onClose}
      dismissLabel="キャンセル"
      dismissible={!busy}
      footer={(
        <button
          type="button"
          onClick={buy}
          disabled={busy || !canBuy}
          style={{ ...(canBuy ? btnPrimary : btnPrimaryOff), cursor: busy || !canBuy ? 'default' : 'pointer', opacity: 1 }}
        >
          {busy ? '購入手続き中…' : (isNative || isDemo) ? '購入する' : 'App Store のアプリで購入できます'}
        </button>
      )}
    >
      {showNative && priceState === 'failed' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <ErrorMessage
            title="価格を読み込めませんでした"
            description="通信の状態を確かめて、もう一度お試しください。"
            actions={[{ label: '再読み込み', onClick: () => { if (isNative) setPriceTry((n) => n + 1); } }]}
          />
        </div>
      )}
      <div role="radiogroup" aria-label="追加するトークン" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {TOKEN_PACKS.map((p) => {
          const on = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => { if (!busy) setSelected(p.id); }}
              style={{
                ...optionBase,
                background: on ? 'var(--accent-soft)' : 'var(--surface)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--separator)'}`,
                boxShadow: on ? 'inset 0 0 0 1px var(--accent)' : 'none',
              }}
            >
              {on
                ? <CircleCheck size={24} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />
                : <Circle size={24} aria-hidden="true" style={{ color: 'var(--border)', flexShrink: 0 }} />}
              <span style={{ flex: 1, minWidth: 0 }}>
                {/* 量は脇（15/400/--text-2）・価格が主（17/600/--text）。 */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sub)', fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{p.tokens.toLocaleString()} トークン</span>
                  {p.tag && <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)' }}>{p.tag}</span>}
                </span>
                <span style={meta}>相談 {p.consults}</span>
              </span>
              <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {!showNative
                  ? (prices[p.id] || p.fallbackPrice)
                  : priceState === 'loading'
                    ? <SkeletonBlock width={56} height="var(--text-body)" radius="var(--radius)" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                    : priceState === 'ready' ? (prices[p.id] || p.fallbackPrice) : '—'}
              </span>
            </button>
          );
        })}
      </div>
      <p style={{ ...meta, margin: 'var(--space-3) 0 0' }}>
        購入から {TOKEN_LOT_DAYS} 日有効。その月のトークンを使い切ってから使われます。お支払いは App Store を通じて行われます。
      </p>
    </BottomSheet>
  );
}
