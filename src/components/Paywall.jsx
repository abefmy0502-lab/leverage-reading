// 💳 Paywall — Web 版ハードペイウォール（全機能有料）。
//
// 認証済みかつ未課金（useSubscription の !isActive && !loading）のとき、
// AuthedApp の手前で全画面表示する。ここを越えないと本棚等に入れない。
//
// 設計方針（brand-messaging.md 準拠）:
//   - 静か・誠実・控えめ（Apple Notes / Reminders 級）。煽らない・断定しない。
//   - 上部に「価値プレビュー」を置き、コールドスタート（中身が見えない不安）を
//     和らげる。これがハードペイウォールの肝。
//   - 年額を主役（おすすめ・大きく）／月額を控えめに提示。
//   - 価格の実数は Stripe / env ラベル（PLAN_LABELS）が真実。ハードコードしない。
//   - 解約自由・データ保持の安心コピーを必ず添える。
//
// ※ 将来 Capacitor（IAP）対応時は、billing.js 側で native 課金へ分岐する想定。
//   このコンポーネント自体は Web 専用（Stripe.js 埋め込みはせずリダイレクト型）。

import { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { PLAN_LABELS } from '../lib/billing';
import {
  isNative,
  APP_PLAN_LABELS,
  getStoreLabels,
  purchasePlan,
  restorePurchases,
} from '../lib/iap';
import { toMessage } from '../lib/errors';
import { APP_STORE_URL, isAppStoreLive } from '../lib/appStore';
import { exportMemosAsMarkdown } from '../lib/exportData';
import { track, EVENTS } from '../lib/analytics';

// 価値プレビューの箇条書き（事実ベースの機能説明 / 誇大表現なし）。
const VALUE_POINTS = [
  {
    emoji: '🔄',
    title: 'あなたのメモが、忘れた頃に戻ってくる',
    body: '残した一行を、記憶に定着する間隔で自動的に呼び戻します。読みっぱなしが、身につく読書に変わる——Orime の核心です。',
  },
  {
    emoji: '🧠',
    title: '相談すると、あなたのメモから答えが返る',
    body: '「あの本、何て書いてあった？」を、過去のあなたのメモを根拠に AI が答えます。',
  },
  {
    emoji: '🎯',
    title: '読書を、行動に変える',
    body: '1 冊から具体的な行動リストへ。完了率・期限で続けやすく。',
  },
  {
    emoji: '🤖',
    title: '課題から、本を選ぶ',
    body: 'いま困っていることを話すと、AI 選書が日本語の本を提案します。',
  },
];

// 契約は App Store(IAP) 一本化。Web では決済せず App Store へ誘導する。
// URL は src/lib/appStore.js に一元化（実 URL 未設定なら isAppStoreLive=false）。

const cardStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-separator)',
  borderRadius: 'var(--radius-md)',
  padding: 16,
};

// 「※イメージ」ラベル（見本であることを明示。捏造UGC・偽データではない旨の誠実表示）。
function PreviewBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-tertiary)',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-separator)',
        borderRadius: 'var(--radius-sm)',
        padding: '1px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      ※イメージ
    </span>
  );
}

// 想起カードの見本。読みながら残した一行が、振り返りでこう戻ってくる、を視覚化。
// 引用・添字はすべて「例」であり、特定ユーザーの実データではない。
function RecallPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
          🔄 読みながら残した一行が、こう戻ってきます
        </p>
        <PreviewBadge />
      </div>
      {/* ランダム想起で表示されるメモカードの見本 */}
      <div
        style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-separator)',
          borderRadius: 'var(--radius-sm)',
          borderLeft: '3px solid var(--color-accent-strong)',
          padding: '12px 14px',
        }}
      >
        <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: '0 0 6px', lineHeight: 1.4 }}>
          3か月前のメモ・『嫌われる勇気』 p.118
        </p>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.7, color: 'var(--color-label)' }}>
          「課題の分離」。相手がどう思うかは、相手の課題。
        </p>
      </div>
    </div>
  );
}

// マイ読書脳の見本。質問→過去メモを根拠にした回答→参照本、のミニ会話。
// 会話文も「例」であり、実際の回答は各ユーザーのメモに応じて変わる。
function BrainPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
          🧠 あなたの過去のメモを根拠に答えます
        </p>
        <PreviewBadge />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* 質問（ユーザー側の吹き出し） */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <p
            style={{
              fontSize: 13,
              margin: 0,
              lineHeight: 1.6,
              color: 'var(--color-text-inverse)',
              background: 'var(--color-accent-strong)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              maxWidth: '85%',
            }}
          >
            迷ったときの判断軸は？
          </p>
        </div>
        {/* 回答（マイ読書脳側の吹き出し＋参照本） */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div
            style={{
              maxWidth: '90%',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-separator)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
            }}
          >
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.7, color: 'var(--color-label)' }}>
              あなたのメモには「自分で決められる範囲に集中する」とありました。まずそこから整理してみては。
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: '6px 0 0', lineHeight: 1.5 }}>
              参照：『7つの習慣』『嫌われる勇気』
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Paywall({ onPurchased }) {
  const { signOut, user } = useAuth();
  const toast = useToast();
  // 📊 課金転換率（CVR = purchase÷view）の分母。定義だけ存在して未配線だった。
  useEffect(() => { track(EVENTS.PAYWALL_VIEWED); }, []);
  // 購入導線の待機ラベル（Web=決済ページ遷移 / ネイティブ=App Store 購入シート）。
  const pendingLabel = isNative ? '購入手続き中…' : '決済ページへ移動中…';
  // どちらのボタンを押下中かを保持して二度押しを防ぐ。
  const [pending, setPending] = useState(null);
  const [exporting, setExporting] = useState(false); // 'monthly' | 'annual' | null
  const [restoring, setRestoring] = useState(false);
  // 表示ラベル: ネイティブ=App 既定(¥1,480)→ストア価格で上書き。
  // （Web/Stripe パスは App-only ピボットで休眠中。billing.js のフォールバックは ¥1,480 に統一済み）
  const [labels, setLabels] = useState(isNative ? APP_PLAN_LABELS : PLAN_LABELS);
  const trapRef = useFocusTrap(true);

  // ネイティブ時のみ、App Store のローカライズ価格をストアから取得して上書きする。
  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    getStoreLabels(user?.id)
      .then((l) => { if (alive && l) setLabels(l); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id]);

  const handleSubscribe = async (plan) => {
    if (pending) return;
    setPending(plan);
    // 📊 課金ファネルの計測（購入導線に入る直前・plan の enum だけ・PII なし）。
    if (plan === 'monthly' || plan === 'annual') track(EVENTS.CHECKOUT_STARTED, { plan });
    try {
      if (isNative) {
        // ネイティブ: App Store の購入シート（RevenueCat）。
        const res = await purchasePlan(plan, user?.id);
        if (res?.cancelled) { setPending(null); return; }
        // 購入成功 → 端末ローカルの entitlement で即アンロック（webhook 反映を待たない）。
        // onPurchased=PaywallGate の refresh → useSubscription が RevenueCat の
        // ローカル権利を見て isActive=true → App が自動で Paywall を外す。
        // webhook は DB(subscriptions) を裏で durable に同期する。
        track(EVENTS.CHECKOUT_COMPLETED, { plan });
        toast.success('ご契約ありがとうございます。');
        await onPurchased?.();
        setPending(null);
        return;
      }
      // Web: 課金は App Store(IAP) 一本化。Web では決済せず App Store へ誘導する
      // （UI 上もこの分岐には到達しないが、念のため Stripe を呼ばず App へ送る）。
      // 実 URL 未確定の間はプレースホルダーに飛ばさない（App Store の 404 回避）。
      if (isAppStoreLive) {
        window.location.assign(APP_STORE_URL);
      } else {
        toast.info('iOS アプリは近日公開予定です。公開までいましばらくお待ちください。');
      }
      setPending(null);
    } catch (e) {
      toast.error(toMessage(e, '購入手続きを開始できませんでした。少し時間をおいて再試行してください。'));
      setPending(null);
    }
  };

  // 購入の復元（Apple 必須要件・ネイティブのみ）。
  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ok = await restorePurchases(user?.id);
      if (ok) {
        // 端末ローカル権利が有効 → 即アンロック（restore は webhook が出ない場合がある）。
        toast.success('購入を復元しました。');
        await onPurchased?.();
        setRestoring(false);
      } else {
        toast.info('復元できる購入が見つかりませんでした。');
        setRestoring(false);
      }
    } catch (e) {
      toast.error(toMessage(e, '購入の復元に失敗しました。'));
      setRestoring(false);
    }
  };

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding:
          'calc(24px + env(safe-area-inset-top, 0px)) 20px calc(32px + env(safe-area-inset-bottom, 0px))',
        fontFamily: 'var(--font-app)',
        color: 'var(--color-label)',
      }}
    >
      <div style={{ maxWidth: 460, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* ヘッダー */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--color-tertiary)', letterSpacing: 1 }}>Orime</div>
          <h1 id="paywall-title" style={{ fontSize: 22, fontWeight: 600, margin: '6px 0 4px', lineHeight: 1.4 }}>
            読みっぱなしを、やめる。
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-secondary)', margin: 0, lineHeight: 1.7 }}>
            すべての機能をお使いいただくには、プランのご契約が必要です。
          </p>
        </div>

        {/* 価値プレビュー（コールドスタート対策の肝） */}
        <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {VALUE_POINTS.map((v) => (
            <div key={v.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 22, lineHeight: 1.2 }} aria-hidden="true">{v.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>{v.title}</p>
                <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: '2px 0 0', lineHeight: 1.7 }}>
                  {v.body}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* 価値の見本（"こう戻ってくる" "こう答える" を視覚化。すべて※イメージ） */}
        <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <RecallPreview />
          <div style={{ height: 1, background: 'var(--color-separator)' }} aria-hidden="true" />
          <BrainPreview />
        </section>

        {/* 🎁 無料トライアル（App Store Connect で Introductory Offer を設定した時だけ表示）。
            未設定なら labels.trial は '' で出ない＝虚偽表示にならない。 */}
        {labels.trial && (
          <p style={{
            textAlign: 'center', fontSize: 14, fontWeight: 700, margin: 0,
            color: 'var(--color-label)', background: 'var(--color-accent-soft)',
            borderRadius: 'var(--radius-md)', padding: '10px 12px',
          }}>
            🎁 まずは{labels.trial}　その後、自動更新
          </p>
        )}

        {/* プラン提示：年額を主役、月額を控えめに。
            ※ 契約は App Store(IAP) 一本化。Web では決済せず App Store へ誘導する。 */}
        {!isNative ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={cardStyle}>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>ご契約は iOS アプリから</p>
              <p style={{ fontSize: 13, color: 'var(--color-secondary)', lineHeight: 1.8, margin: '0 0 12px' }}>
                Orime の有料プラン（{labels.annual.price} / {labels.monthly.price}）のご契約は、iPhone・iPad アプリ（App Store）から行えます。お支払い・解約はすべて App Store で管理されます。
              </p>
              {isAppStoreLive ? (
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    minHeight: 48, padding: '13px 18px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-accent-strong)', color: 'var(--color-text-inverse)',
                    fontSize: 15, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  App Store で入手
                </a>
              ) : (
                <p
                  style={{
                    display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    minHeight: 48, padding: '13px 18px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-fill-tertiary, #f0ece3)', color: 'var(--color-secondary)',
                    fontSize: 15, fontWeight: 600, margin: 0,
                  }}
                >
                  App Store で近日公開
                </p>
              )}
            </div>
          </section>
        ) : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 年額（おすすめ・大きく） */}
          <div
            style={{
              ...cardStyle,
              border: '1.5px solid var(--color-accent-strong)',
              background: 'var(--color-accent-soft)',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -10,
                left: 16,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-text-inverse)',
                background: 'var(--color-accent-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '2px 10px',
              }}
            >
              おすすめ
            </span>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '4px 0 2px' }}>{labels.annual.name}</p>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px', color: 'var(--color-label)' }}>
              {labels.annual.price}
            </p>
            {/* 💰 価格アンカリング: 月額×12（¥17,760）に対する割引を可視化して「お得さ」を
                届ける。日本専用アプリ（iPhone/日本語書籍）のため ¥ 固定提示で誤表示なし。
                paywall-design.md 指定の「取り消し線＋割引バッジ」を実装。 */}
            <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: '0 0 4px' }}>
              月額プランなら年 <s>¥17,760</s> → <strong style={{ color: 'var(--color-label)' }}>約28%お得</strong>（月あたり約¥1,066・3.3ヶ月分オフ）
            </p>
            {labels.annual.note && (
              <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: '0 0 12px' }}>
                {labels.annual.note}
              </p>
            )}
            <button
              type="button"
              onClick={() => handleSubscribe('annual')}
              disabled={!!pending}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '13px 18px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'var(--color-accent-strong)',
                color: 'var(--color-text-inverse)',
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: 600,
                cursor: pending ? 'default' : 'pointer',
                opacity: pending && pending !== 'annual' ? 0.5 : 1,
              }}
            >
              {pending === 'annual'
                ? pendingLabel
                : (labels.trial ? `まずは${labels.trial}で試す` : '年額プランで契約する')}
            </button>
          </div>

          {/* 月額（控えめ） */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{labels.monthly.name}</p>
              <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{labels.monthly.price}</p>
            </div>
            {labels.monthly.note && (
              <p style={{ fontSize: 12, color: 'var(--color-tertiary)', margin: '2px 0 12px' }}>
                {labels.monthly.note}
              </p>
            )}
            <button
              type="button"
              onClick={() => handleSubscribe('monthly')}
              disabled={!!pending}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '11px 18px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-separator)',
                background: 'transparent',
                color: 'var(--color-secondary)',
                fontFamily: 'inherit',
                fontSize: 14,
                cursor: pending ? 'default' : 'pointer',
                opacity: pending && pending !== 'monthly' ? 0.5 : 1,
              }}
            >
              {pending === 'monthly'
                ? pendingLabel
                : (labels.trial ? `まずは${labels.trial}で試す（月額）` : '月額プランで契約する')}
            </button>
          </div>
        </section>
        )}

        {/* 購入の復元（Apple 必須・ネイティブのみ） */}
        {isNative && (
          <button
            type="button"
            onClick={handleRestore}
            disabled={restoring}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-secondary)',
              fontSize: 13,
              cursor: restoring ? 'default' : 'pointer',
              fontFamily: 'inherit',
              textDecoration: 'underline',
              padding: '8px 12px',
              minHeight: 44,
              alignSelf: 'center',
            }}
          >
            {restoring ? '復元中…' : '購入を復元'}
          </button>
        )}

        {/* 安心コピー（チャネル別の必須開示） */}
        {isNative ? (
          // iOS/IAP: Apple 3.1.2 の自動更新条件を明示（審査必須）。返金は Apple 経由。
          <p style={{ fontSize: 12, color: 'var(--color-secondary)', textAlign: 'center', lineHeight: 1.8, margin: 0 }}>
            {labels.trial && <>無料期間（{labels.trial}）の終了後、自動的に有料へ移行します。<br /></>}
            サブスクリプションは自動更新です。期間終了の24時間前までに解約しない限り、同額で自動更新されます。<br />
            解約・プラン変更は App Store のアカウント設定からいつでも行えます。<br />
            解約後もデータは削除されません（再契約でいつでも再開できます）。お支払いは App Store を通じて行われます。
          </p>
        ) : (
          // App-only 配信: Web から開かれた場合も課金は App Store(IAP) に一本化。
          // ここで Stripe/決済ページに言及すると、実際の入手導線（App Store）と
          // 食い違い、表示と請求の不一致（景表法リスク）になるため触れない。
          <p style={{ fontSize: 12, color: 'var(--color-secondary)', textAlign: 'center', lineHeight: 1.8, margin: 0 }}>
            ご契約・お支払い・解約はすべて App Store（iOS アプリ）で行われます。<br />
            サブスクリプションは自動更新です。期間終了前に解約しない限り、同額で自動更新されます。<br />
            いつでも解約でき、解約後もデータは削除されません。再契約するといつでも再開できます。
          </p>
        )}

        {/* 📥 「解約後もデータは保持されます」の約束を実効化する導線。
            ペイウォールは未課金/解約後ユーザーの唯一の画面なので、ここに出さないと
            解約者は自分のメモを見ることも持ち出すこともできない（データ可搬性）。 */}
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              if (exporting) return;
              setExporting(true);
              try {
                const { memos } = await exportMemosAsMarkdown(user?.id);
                toast.success(`メモ ${memos} 件を書き出しました。`);
              } catch (e) {
                toast.error(toMessage(e, 'データの書き出しに失敗しました。'));
              } finally {
                setExporting(false);
              }
            }}
            style={{
              background: 'none', border: 'none', cursor: exporting ? 'default' : 'pointer',
              fontSize: 12, color: 'var(--color-secondary)', textDecoration: 'underline',
              fontFamily: 'inherit', minHeight: 44, opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? '書き出し中…' : '📥 メモをダウンロード（Markdown）'}
          </button>
        </div>

        {/* 法的リンク（サブスク必須開示の導線） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-secondary)', textDecoration: 'underline' }}>
            利用規約
          </a>
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-secondary)', textDecoration: 'underline' }}>
            プライバシーポリシー
          </a>
          {/* 特商法リンクはネイティブでは反ステアリング順守のため非表示にし、価格開示は
              App Store に委ねる（特商法ページ自体は ¥1,480 / App Store 課金前提に更新済み）。 */}
          {!isNative && (
            <a href="/legal/sct" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-secondary)', textDecoration: 'underline' }}>
              特定商取引法に基づく表記
            </a>
          )}
        </div>

        {/* アカウント切替（別アカウントで入り直したい人向け） */}
        <div style={{ textAlign: 'center' }}>
          {user?.email && (
            <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: '0 0 6px', wordBreak: 'break-all' }}>
              {user.email} でログイン中
            </p>
          )}
          <button
            type="button"
            onClick={async () => { try { await signOut(); } catch { /* オフライン等 — 画面は変わらないが再タップで再試行できる */ } }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-tertiary)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '8px 12px',
              minHeight: 44,
            }}
          >
            別のアカウントでログイン
          </button>
          {/* まだ決めかねている人をサービス紹介(LP)へ逃がす導線。
              LP は価格(¥1,480)と比較表を含むため、反ステアリング順守で
              ネイティブでは非表示（Web のみ）。 */}
          {!isNative && (
            <div>
              <a
                href="/lp"
                style={{
                  display: 'inline-flex',
                  minHeight: 44,
                  alignItems: 'center',
                  padding: '8px 12px',
                  color: 'var(--color-tertiary)',
                  fontSize: 12,
                }}
              >
                ← サービス紹介を見る
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
