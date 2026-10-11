// 🪙📊 トークンの使い方（2026-10-11 オーナー「現在のトークン利用料の可視化をしたい。そこから追加課金の動線も作りたい」）。
//
// 開くのは 設定の「プラン・お支払い」の残りの行と、相談の上の行の残りの数。
// 組み立て（BottomSheet・題「トークンの使い方」・右上「完了」）:
//   ① 今の枠の残り（「今月の残り」・7 日間無料は「無料期間の残り」）＝大きな数「590」＋「/ 800 トークン」→ AI の答え 約 N 回
//      → 細い 1 本の棒（使った／残り・残りが枠の 20% 以下は --warning）→ 次に戻る日
//   ② 追加分（買い足し・期限内）＝ロットごとに「120 トークン」と「2027年3月10日まで」（期限の近い順）
//   ③ 今月の使い道（用途ごとのトークン・多い順・足すと使ったトークン）。無料プランは写真から書き起こしの残りの回数も
//   ④ 下の決定欄: プランの人は「トークンを追加」／無料プランは「プランを見る」（今月の無料のトークンを使い切った人で
//      7 日間無料を使えるときだけ「7 日間無料で試す」＝すすめてよい場面 ①・lib/tokenUsage.js の usageSheetAction）
// %・順位・バッジは出さない。止めるのはサーバー（ここは表示だけ・真実は ai_usage と ai_token_lots）。

import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useAuth } from '../hooks/useAuth';
import { usePaywall } from '../state/PaywallContext';
import { periodKeyFor, remainingAnswersLabel, monthDayLabelJa, FREE_TOKENS, PAID_TOKENS } from '../lib/tokens';
import { usageBreakdown, isLowTokens, usedRatio, usageSheetAction, fetchUsageDetail, fetchTokenLots } from '../lib/tokenUsage';
import { nextResetLabelJa } from '../lib/freeTrial';
import { normalizeTrialLabel } from '../lib/trialNudge';
import { getIntroOffer } from '../lib/iap';
import { isDemo } from '../lib/supabase';
import { track } from '../lib/analytics';
import { btnPrimary, btnGhost, groupTitle } from '../styles/ui';

const fmt = (n) => (Number(n) || 0).toLocaleString('ja-JP');
const nowrap = { whiteSpace: 'nowrap' };
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const sectionGap = { marginTop: 'var(--space-6)' };
const row = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)',
  padding: 'var(--space-3) 0', borderTop: '1px solid var(--separator)',
};
const rowLabel = { fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const rowValue = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 };

// 日本時間の「11月1日」（今年でなければ「2027年3月10日」）。
function dateLabelJa(time) {
  const t = typeof time === 'number' ? time : Date.parse(time || '');
  if (!Number.isFinite(t)) return '';
  const JST = 9 * 3600 * 1000;
  const y = new Date(t + JST).getUTCFullYear();
  return `${y !== new Date(Date.now() + JST).getUTCFullYear() ? `${y}年` : ''}${monthDayLabelJa(t)}`;
}

// 7 日間無料を使えるか（無料プランで今月のトークンを使い切ったときだけ聞く・相談の FreeUsedCard と同じ決め方）。
function useTrialOffer(wanted, hadPlan, userId) {
  const [offer, setOffer] = useState('');
  useEffect(() => {
    if (!wanted || hadPlan) { setOffer(''); return undefined; }
    if (isDemo) {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('trial');
      setOffer(t === 'off' || ['on', 'store'].includes(sp.get('founding')) ? '' : normalizeTrialLabel(t || '7日間無料'));
      return undefined;
    }
    let alive = true;
    getIntroOffer(userId)
      .then((r) => { if (alive) setOffer(r.status === 'eligible' && r.plan !== 'monthly' ? normalizeTrialLabel(r.label) : ''); })
      .catch(() => { if (alive) setOffer(''); });
    return () => { alive = false; };
  }, [wanted, hadPlan, userId]);
  return offer;
}

// onAdd: 「トークンを追加」（シートは閉じてから呼ぶ）。onPlans(reason): 有料プランの画面を開く。
// from: 'settings' | 'consult'（計測だけ）。layer: 'dialog' は設定の上に重ねるとき。
export default function TokenUsageSheet({ onClose, onAdd, onPlans, from = 'consult', layer = null }) {
  const { user } = useAuth();
  const {
    plan, trialEndsAt, tokensRemaining, tokenAllowance, tokenNextAllowance, freeFirstMonth,
    purchasedTokens, hadPlan, freeOcrLimit, freeOcrRemaining,
  } = usePaywall();
  const trial = plan === 'trial';
  const free = plan === 'free';
  const periodKey = plan && plan !== 'admin' ? periodKeyFor(plan, { periodEnd: trialEndsAt }) : null;
  // undefined＝読み込み中・null＝読めなかった
  const [detail, setDetail] = useState(undefined);
  const [lots, setLots] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetchUsageDetail(user?.id, periodKey).then((d) => { if (alive) setDetail(d); });
    fetchTokenLots(user?.id).then((l) => { if (alive) setLots(l); });
    return () => { alive = false; };
  }, [user?.id, periodKey]);
  useEffect(() => { track('token_usage', { action: 'open', from, plan: plan || 'unknown' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usedUp = tokensRemaining != null && tokensRemaining <= 0;
  const trialOffer = useTrialOffer(free && usedUp, hadPlan, user?.id);
  const action = usageSheetAction({ plan, remaining: tokensRemaining, trialOffer, hadPlan });
  const low = isLowTokens(tokensRemaining, tokenAllowance, purchasedTokens);
  const ratio = usedRatio(tokensRemaining, tokenAllowance);
  // 内訳: 列が無い DB（未適用）・読めない・使った分が全部「数える前」のときは null（＝段を出さない）。
  const breakdownRaw = detail && detail.purposeMjpy ? usageBreakdown(detail.purposeMjpy, detail.costMjpy) : null;
  const breakdown = breakdownRaw && !(breakdownRaw.length === 0 && detail.costMjpy > 0) ? breakdownRaw : null;
  const usedSome = tokensRemaining != null && tokenAllowance != null && tokensRemaining < tokenAllowance;

  // 次に戻る日（データだけ）。
  let resetLine = null;
  if (trial) {
    const end = trialEndsAt ? dateLabelJa(trialEndsAt) : '';
    resetLine = end
      ? <>無料期間は<span style={nowrap}>{end}まで。</span>そのあとは<span style={nowrap}>毎月 {fmt(PAID_TOKENS)} トークン</span></>
      : <>無料期間のあとは<span style={nowrap}>毎月 {fmt(PAID_TOKENS)} トークン</span></>;
  } else if (free && freeFirstMonth) {
    resetLine = <><span style={nowrap}>はじめの月だけ {fmt(tokenAllowance)} トークン。</span><span style={nowrap}>{nextResetLabelJa()}から</span> <span style={nowrap}>毎月 {fmt(tokenNextAllowance ?? FREE_TOKENS)} トークン</span></>;
  } else if (tokenAllowance != null) {
    resetLine = usedSome
      ? <><span style={nowrap}>{nextResetLabelJa()}に</span> <span style={nowrap}>{fmt(tokenNextAllowance ?? tokenAllowance)} トークンに戻ります</span></>
      : <><span style={nowrap}>毎月 1 日に</span> <span style={nowrap}>{fmt(tokenNextAllowance ?? tokenAllowance)} トークンに戻ります</span></>;
  }

  const press = () => {
    if (!action) return;
    track('token_usage', { action: action.kind, from, plan: plan || 'unknown' });
    if (action.kind === 'add') onAdd?.();
    else onPlans?.(action.reason ?? null);
  };

  const periodName = trial ? '無料期間' : '今月';
  const lotsShown = Array.isArray(lots) && lots.length > 0;

  return (
    <BottomSheet
      title="トークンの使い方"
      onClose={onClose}
      layer={layer}
      footer={action ? (
        // 無料プランで、まだ残りがあるときの「プランを見る」は枠線（すすめすぎない）。ほかは主ボタン。
        <button type="button" onClick={press} style={action.kind === 'plans' && !usedUp ? btnGhost : btnPrimary}>
          {action.label}
        </button>
      ) : null}
    >
      {/* ① 今の枠の残り */}
      <section aria-label={`${periodName}の残り`}>
        <p style={{ ...meta, fontSize: 'var(--text-sub)' }}>{periodName}の残り</p>
        {tokensRemaining == null ? (
          <div role="status" aria-label="残りのトークンを読み込んでいます" style={{ padding: 'var(--space-2) 0' }}>
            <SkeletonBlock width="50%" height="var(--text-title)" radius="var(--radius)" />
          </div>
        ) : (
          <>
            <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: low ? 'var(--warning)' : 'var(--text)' }}>{fmt(tokensRemaining)}</span>
              <span style={{ ...nowrap, fontSize: 'var(--text-body)', color: 'var(--text-2)' }}> / {fmt(tokenAllowance)} トークン</span>
            </p>
            {/* 量の目安は追加分も含めた残りで（「AI の答え 約 N 回」・GLOSSARY）。使い切って追加分も無いときは出さない。 */}
            {tokensRemaining + (purchasedTokens || 0) > 0 && (
              <p style={{ ...meta, fontSize: 'var(--text-sub)' }}>
                <span style={nowrap}>AI の答え {remainingAnswersLabel(tokensRemaining + (purchasedTokens || 0))}</span>
                {purchasedTokens > 0 && <span style={nowrap}>（追加分 {fmt(purchasedTokens)} トークンを含む）</span>}
              </p>
            )}
            {ratio != null && (
              // 使った量の細い 1 本の棒（読み上げは数の文で足りるので飾り）。
              <div aria-hidden="true" style={{ height: 'var(--space-1)', borderRadius: 'var(--radius-full)', background: 'var(--fill)', margin: 'var(--space-3) 0 var(--space-2)', overflow: 'hidden' }}>
                <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 'var(--radius-full)', background: low || (usedUp && !(purchasedTokens > 0)) ? 'var(--warning)' : 'var(--accent)' }} />
              </div>
            )}
            {resetLine && <p style={meta}>{resetLine}</p>}
          </>
        )}
      </section>

      {/* ② 追加分（期限の近い順） */}
      {lotsShown && (
        <section aria-label="追加分" style={sectionGap}>
          <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>追加分</h3>
          {lots.map((l) => (
            <div key={l.id} style={row}>
              <span style={rowLabel}>{fmt(l.left)} トークン</span>
              <span style={rowValue}>{dateLabelJa(l.expiresAt)}まで</span>
            </div>
          ))}
          <p style={{ ...meta, marginTop: 'var(--space-2)' }}>
            {withPhraseBreaks(trial
              ? '無料期間のトークンを使い切ってから、期限の近い順に使われます。'
              : 'その月のトークンを使い切ってから、期限の近い順に使われます。')}
          </p>
        </section>
      )}

      {/* ③ 使い道（用途ごと） */}
      {detail === undefined ? (
        <section aria-label="使い道を読み込んでいます" style={sectionGap}>
          <SkeletonBlock width="30%" height="var(--text-caption)" radius="var(--radius)" style={{ marginBottom: 'var(--space-2)' }} />
          {[0, 1, 2].map((i) => (
            <div key={i} style={row}><SkeletonBlock width={`${40 - i * 8}%`} height="var(--text-sub)" radius="var(--radius)" /></div>
          ))}
        </section>
      ) : breakdown ? (
        <section aria-label={`${periodName}の使い道`} style={sectionGap}>
          <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>{periodName}の使い道</h3>
          {breakdown.length === 0 ? (
            <p style={{ ...meta, fontSize: 'var(--text-sub)' }}>{periodName}は、まだ AI を使っていません</p>
          ) : breakdown.map((b) => (
            <div key={b.key} style={row}>
              <span style={rowLabel}>{withPhraseBreaks(b.label)}</span>
              <span style={rowValue}>{fmt(b.tokens)} トークン</span>
            </div>
          ))}
          {/* 無料プランの写真から書き起こしは、トークンとは別の回数（毎月 10 回）。 */}
          {free && freeOcrRemaining != null && (
            <div style={{ ...row, ...(breakdown.length === 0 ? { marginTop: 'var(--space-3)' } : null) }}>
              <span style={rowLabel}>
                {withPhraseBreaks('写真から書き起こし')}
                <span style={{ ...meta, display: 'block' }}>トークンとは別に<span style={nowrap}>毎月 {fmt(freeOcrLimit)} 回</span></span>
              </span>
              <span style={rowValue}>残り {fmt(freeOcrRemaining)} 回</span>
            </div>
          )}
        </section>
      ) : null}

      {/* 無料プランの説明（買えないことと、プランで変わること・1 回だけ）。 */}
      {free && (
        <p style={{ ...meta, marginTop: 'var(--space-6)' }}>
          {withPhraseBreaks('無料プランの AI は、相談とこの本で学べることと写真から書き起こし。プランは')}
          <span style={nowrap}>毎月 {fmt(PAID_TOKENS)} トークン</span>
          {withPhraseBreaks('で、すべての AI 機能を使えます。')}
        </p>
      )}
    </BottomSheet>
  );
}
