// 🪙📊 トークンの使い方（2026-10-11 オーナー「現在のトークン利用料の可視化をしたい。そこから追加課金の動線も作りたい」）。
//
// 開くのは 設定の「プラン・お支払い」の残りの行と、相談の上の行の残りの数。
// 組み立て（BottomSheet・題「トークンの使い方」・右上「完了」）:
//   ① 今の枠の残り（「今月の残り」・7 日間無料は「無料期間の残り」）＝大きな数「590」＋「/ 800 トークン」→ AI の答え 約 N 回
//      → 細い 1 本の棒（使った／残り・残りが枠の 20% 以下は --warning）→ 次に戻る日
//   ② 追加分（買い足し・期限なし＝2026-10-11）＝ロットごとに「120 トークン」と「9月27日に購入」（買った順）
//   ③ 今月の使い道（用途ごとのトークン・多い順・足すと使ったトークン）。無料プランは写真から書き起こしの残りの回数も
//   ④ 下の決定欄: プランの人は「トークンを追加」／無料プランは「プランを見る」（今月の無料のトークンを使い切った人で
//      7 日間無料を使えるときだけ「7 日間無料で試す」＝すすめてよい場面 ①・lib/tokenUsage.js の usageSheetAction）
// %・順位・バッジは出さない。止めるのはサーバー（ここは表示だけ・真実は ai_usage と ai_token_lots）。

import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useAuth } from '../hooks/useAuth';
import { usePaywall } from '../state/PaywallContext';
import { periodKeyFor, remainingAnswersLabel, monthDayLabelJa, FREE_TOKENS, PAID_TOKENS } from '../lib/tokens';
import { usageBreakdown, isLowTokens, remainingRatio, usageSheetAction, fetchUsageDetail, fetchTokenLots, fetchPeriodValue, periodValueSince } from '../lib/tokenUsage';
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
  // 使い道を読めなかったときの「もう一度」（使い道だけ読み直す）。
  const [usageTry, setUsageTry] = useState(0);
  // 追加分を読めなかったときの「もう一度」（追加分だけ読み直す）。
  const [lotsTry, setLotsTry] = useState(0);
  useEffect(() => {
    let alive = true;
    setLots(undefined);
    fetchTokenLots(user?.id).then((l) => { if (alive) setLots(l); });
    return () => { alive = false; };
  }, [user?.id, lotsTry]);
  useEffect(() => {
    let alive = true;
    setDetail(undefined);
    fetchUsageDetail(user?.id, periodKey).then((d) => { if (alive) setDetail(d); });
    return () => { alive = false; };
  }, [user?.id, periodKey, usageTry]);
  // 🌿 この期間に相談から得たもの（相談 N 件・完了した行動 N 件）。読めない・どちらも 0 なら出さない。
  //   使い道と一緒に出す（あとから差し込んで使い道を押し下げない）。読み終えるか 800ms まで待つ（undefined＝読み込み中）。
  const [value, setValue] = useState(undefined);
  useEffect(() => {
    let alive = true;
    setValue(undefined);
    fetchPeriodValue(user?.id, periodValueSince({ trial: plan === 'trial', trialEndsAt })).then((v) => { if (alive) setValue((cur) => (cur === null ? null : v)); }); // 800ms で打ち切ったあとの値は捨てる
    const t = setTimeout(() => { if (alive) setValue((cur) => (cur === undefined ? null : cur)); }, 800);
    return () => { alive = false; clearTimeout(t); };
  }, [user?.id, plan, trialEndsAt]);
  useEffect(() => { track('token_usage', { action: 'open', from, plan: plan || 'unknown' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usedUp = tokensRemaining != null && tokensRemaining <= 0;
  const hasLots = purchasedTokens > 0;
  // 月の分を使い切り、追加分も無い（使える量が 0）。
  const outAll = usedUp && !hasLots;
  // 月の分を使い切って、追加分で使っている（大きな数は追加分の合計にする）。
  const onLots = usedUp && hasLots;
  const trialOffer = useTrialOffer(free && usedUp, hadPlan, user?.id);
  const low = isLowTokens(tokensRemaining, tokenAllowance, purchasedTokens);
  const action = usageSheetAction({ plan, remaining: tokensRemaining, purchased: purchasedTokens, trialOffer, hadPlan, low });
  // 注意の色（数字と棒で同じ条件）: 残りが少ない・使い切った（追加分も無い）。
  const warn = low || outAll;
  const ratio = remainingRatio(tokensRemaining, tokenAllowance);
  // 内訳: 列が無い DB（未適用）・読めない・使った分が全部「数える前」のときは null（＝段を出さない）。
  //   読めなかった（detail === null）ときは段を消さずに「読み込めませんでした」（下）。
  const breakdownRaw = detail && detail.purposeMjpy ? usageBreakdown(detail.purposeMjpy, detail.costMjpy) : null;
  const breakdown = breakdownRaw && !(breakdownRaw.length === 0 && detail.costMjpy > 0) ? breakdownRaw : null;
  const usageFailed = detail === null;
  const usedSome = tokensRemaining != null && tokenAllowance != null && tokensRemaining < tokenAllowance;

  // 次に戻る日（データだけ）。
  let resetLine = null;
  if (trial) {
    const end = trialEndsAt ? dateLabelJa(trialEndsAt) : '';
    resetLine = end
      ? <>無料期間は<span style={nowrap}>{end}まで。</span>そのあとは<span style={nowrap}>毎月 {fmt(PAID_TOKENS)} トークン</span></>
      : <>無料期間のあとは<span style={nowrap}>毎月 {fmt(PAID_TOKENS)} トークン</span></>;
  } else if (free && freeFirstMonth) {
    resetLine = <><span style={nowrap}>はじめの 2 か月は {fmt(tokenAllowance)} トークン。</span><span style={nowrap}>{nextResetLabelJa()}に</span> <span style={nowrap}>{fmt(tokenNextAllowance ?? FREE_TOKENS)} トークンに戻ります</span></>;
  } else if (tokenAllowance != null) {
    resetLine = usedSome
      ? <><span style={nowrap}>{nextResetLabelJa()}に</span> <span style={nowrap}>{fmt(tokenNextAllowance ?? tokenAllowance)} トークンに戻ります</span></>
      : <><span style={nowrap}>毎月 1 日に</span> <span style={nowrap}>{fmt(tokenNextAllowance ?? tokenAllowance)} トークン</span></>;
  }

  const press = () => {
    if (!action) return;
    track('token_usage', { action: action.kind, from, plan: plan || 'unknown' });
    if (action.kind === 'add') onAdd?.();
    else onPlans?.(action.reason ?? null);
  };

  const periodName = trial ? '無料期間' : '今月';
  const lotsShown = Array.isArray(lots) && lots.length > 0;
  // 追加分があるはずなのに一覧を読めなかった（lots === null）。
  const lotsFailed = lots === null && purchasedTokens > 0;

  return (
    <BottomSheet
      title="トークンの使い方"
      onClose={onClose}
      layer={layer}
      footer={action ? (
        // 塗りは 残りが少ない・使い切った・「7 日間無料で試す」のときだけ。余裕があるときは枠線（強く買わせない）。
        <button type="button" onClick={press} style={action.strong ? btnPrimary : btnGhost}>
          {action.label}
        </button>
      ) : null}
    >
      {/* ① 今の枠の残り */}
      <section aria-label={`${periodName}の残り`}>
        {/* 月の分を使い切って追加分で使っているときは「使えるトークン」（大きな数は追加分の合計）。 */}
        <p style={{ ...meta, fontSize: 'var(--text-sub)' }}>{onLots ? '使えるトークン' : `${periodName}の残り`}</p>
        {tokensRemaining == null ? (
          <div role="status" aria-label="残りのトークンを読み込んでいます" style={{ padding: 'var(--space-2) 0' }}>
            <SkeletonBlock width="50%" height="var(--text-title)" radius="var(--radius)" />
          </div>
        ) : (
          <>
            {onLots ? (
              // 月の分を使い切って追加分で使っているとき: 大きな数は使える量（追加分の合計）。棒は出さない（月の分の棒は満ちているだけ）。
              <>
                <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: warn ? 'var(--warning)' : 'var(--text)' }}>{fmt(purchasedTokens)}</span>
                  <span style={{ ...nowrap, fontSize: 'var(--text-body)', color: 'var(--text-2)' }}> トークン</span>
                </p>
                <p style={{ ...meta, fontSize: 'var(--text-sub)' }}>
                  <span style={nowrap}>追加分のトークン</span><span style={nowrap}>（{periodName}の分は使い切りました）</span>
                </p>
                <p style={{ ...meta, fontSize: 'var(--text-sub)', marginBottom: 'var(--space-2)' }}>
                  <span style={nowrap}>AI の答え {remainingAnswersLabel(purchasedTokens)}</span>
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: warn ? 'var(--warning)' : 'var(--text)' }}>{fmt(tokensRemaining)}</span>
                  <span style={{ ...nowrap, fontSize: 'var(--text-body)', color: 'var(--text-2)' }}> / {fmt(tokenAllowance)} トークン</span>
                </p>
                {/* 量の目安は追加分も含めた残りで（「AI の答え 約 N 回」・GLOSSARY）。使い切ったときは出さない。 */}
                {tokensRemaining + (purchasedTokens || 0) > 0 && (
                  <p style={{ ...meta, fontSize: 'var(--text-sub)' }}>
                    <span style={nowrap}>AI の答え {remainingAnswersLabel(tokensRemaining + (purchasedTokens || 0))}</span>
                    {hasLots && <span style={nowrap}>（追加分 {fmt(purchasedTokens)} トークンを含む）</span>}
                  </p>
                )}
                {/* 残りが 0 のときは棒を出さない（空の棒は何も伝えない・2026-10-11 ui-critic）。 */}
                {ratio != null && ratio > 0 && (
                  // 残りの細い 1 本の棒（見出しの「残り」と合わせて残りで埋める・使い切ったら空・読み上げは数の文で足りるので飾り）。色は数字と同じ条件。
                  <div aria-hidden="true" style={{ height: 'var(--space-1)', borderRadius: 'var(--radius-full)', background: 'var(--fill)', margin: 'var(--space-3) 0 var(--space-2)', overflow: 'hidden' }}>
                    <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 'var(--radius-full)', background: warn ? 'var(--warning)' : 'var(--accent)' }} />
                  </div>
                )}
              </>
            )}
            {resetLine && <p style={meta}>{resetLine}</p>}
          </>
        )}
      </section>

      {/* ② 追加分（買った順・期限なし） */}
      {lotsShown && (
        <section aria-label="追加分" style={sectionGap}>
          <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>追加分</h3>
          {lots.map((l) => (
            <div key={l.id} style={row}>
              <span style={rowLabel}>{fmt(l.left)} トークン</span>
              {dateLabelJa(l.purchasedAt) && <span style={rowValue}>{dateLabelJa(l.purchasedAt)}に購入</span>}
            </div>
          ))}
          <p style={{ ...meta, marginTop: 'var(--space-2)' }}>
            {withPhraseBreaks(trial
              ? '無料期間のトークンを使い切ったあと、買った順に使われます。'
              : 'その月のトークンを使い切ったあと、買った順に使われます。')}
          </p>
        </section>
      )}

      {lotsFailed && (
        <section aria-label="追加分" style={sectionGap}>
          <ErrorMessage
            title="追加分を読み込めませんでした"
            description="通信状況を確認して、もう一度お試しください。"
            actions={[{ label: 'もう一度', onClick: () => setLotsTry((n) => n + 1) }]}
          />
        </section>
      )}

      {/* 🌿 この期間に相談から得たもの（数だけ・2026-10-20） */}
      {value && detail !== undefined && (value.consults > 0 || value.done > 0) && (
        <section aria-label={`${periodName}の相談`} style={sectionGap}>
          <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>{periodName}の相談</h3>
          {value.consults > 0 && (
            <div style={row}>
              <span style={rowLabel}>相談の AI の答え</span>
              <span style={rowValue}>{fmt(value.consults)} 回</span>
            </div>
          )}
          {value.done != null && value.done > 0 && (
            <div style={row}>
              <span style={rowLabel}>完了した行動</span>
              <span style={rowValue}>{fmt(value.done)} 件</span>
            </div>
          )}
        </section>
      )}

      {/* ③ 使い道（用途ごと） */}
      {detail === undefined || value === undefined ? (
        <section aria-label="使い道を読み込んでいます" style={sectionGap}>
          <SkeletonBlock width="30%" height="var(--text-caption)" radius="var(--radius)" style={{ marginBottom: 'var(--space-2)' }} />
          {[0, 1, 2].map((i) => (
            <div key={i} style={row}><SkeletonBlock width={`${40 - i * 8}%`} height="var(--text-sub)" radius="var(--radius)" /></div>
          ))}
        </section>
      ) : usageFailed ? (
        <section aria-label={`${periodName}の使い道`} style={sectionGap}>
          <ErrorMessage
            title="使い道を読み込めませんでした"
            description="通信状況を確認して、もう一度お試しください。"
            actions={[{ label: 'もう一度', onClick: () => setUsageTry((n) => n + 1) }]}
          />
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
        </section>
      ) : null}

      {/* 無料プランの写真から書き起こしは、トークンとは別の回数（毎月 10 回）＝使い道とは別の見出しの 1 行。 */}
      {free && freeOcrRemaining != null && (
        <section aria-label="写真から書き起こし" style={sectionGap}>
          <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>写真から書き起こし</h3>
          <p style={{ ...meta, fontSize: 'var(--text-sub)', color: 'var(--text)' }}>
            <span style={nowrap}>今月の残り {fmt(freeOcrRemaining)} 回</span>
            <span style={{ ...nowrap, color: 'var(--text-2)' }}>（トークンとは別に毎月 {fmt(freeOcrLimit)} 回）</span>
          </p>
        </section>
      )}

      {/* 無料プランの説明（買えないことと、プランで変わること・1 回だけ）。使い切ったら、メモが答える相談のことも 1 行。 */}
      {free && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          {usedUp && (
            <p style={{ ...meta, fontSize: 'var(--text-sub)', color: 'var(--text)', marginBottom: 'var(--space-2)' }}>
              {withPhraseBreaks('メモが答える相談は、そのまま使えます')}
            </p>
          )}
          <p style={meta}>
            {withPhraseBreaks('無料プランの AI は、相談・この本で学べること・写真から書き起こしの 3 つです。プランなら')}
            <span style={nowrap}>毎月 {fmt(PAID_TOKENS)} トークン</span>
            {withPhraseBreaks('で、すべての AI 機能を使えます。')}
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
