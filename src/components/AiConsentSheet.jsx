// 🤝 AI に送る内容について（同意のシート・App Store 審査ガイドライン 5.1.2(i)・2026-10-01）。
//
// はじめて AI を使う操作のときに lib/aiConsent.js の requestAiConsent が合図を出し、ここ（AiConsentGate）が
// シートを開いて答えを返す。送るもの・送り先は lib/aiProcessors.js（api/_aiRouting.js と同じ・テストで確かめる）。
//   ask:    「今はやめる」／「同意して使う」（その操作のときだけ聞く）
//   manage: ⚙️ 設定の「AI へのデータ送信」から。同意済みなら「同意を取り消す」、まだなら「同意する」
// 見た目は BottomSheet（layer='dialog'＝メモを書くシート・設定の上に重ねる）。DESIGN §5「シート」。
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { useBackLayer } from '../hooks/useHistoryBack';
import { btnPrimary, btnGhost, btnLink, card } from '../styles/ui';
import { PRIVACY_URL } from '../lib/legalLinks';
import { AI_FEATURES, AI_PROVIDER_NAMES, AI_FALLBACK_PROVIDER, providersFor, featureForPurpose } from '../lib/aiProcessors';
import {
  AI_CONSENT_REQUEST_EVENT, readAiConsent, grantAiConsent, withdrawAiConsent, isAiConsentCurrent,
} from '../lib/aiConsent';

// 文は文節の切れ目でだけ折り返す（BudouX の <wbr>＋keep-all・DESIGN §5）。
// 「AI」と「の」の間は折り返さない空き（\u00a0）。BudouX が「AI の」を分けて「AI / の会社」で割れていた（2026-10-01 ui-critic）。
const NB = '\u00a0';
const leadStyle = { margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all' };
const metaStyle = { margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };
const listStyle = { ...card, listStyle: 'none', margin: 'var(--space-4) 0 0', padding: '0 var(--space-4)' };
const rowStyle = { padding: 'var(--space-3) 0' };
const rowHead = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' };
const nameStyle = { fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 };
const providerStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'nowrap', flexShrink: 0 };
// 送るものは 13（シートの高さに収めて、プライバシーポリシーまでスクロールせずに見えるように）。
const sendsStyle = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };
const noteStyle = { margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all' };
const linkStyle = {
  ...btnLink,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  textDecoration: 'none',
  // 文字の端を本文の左端にそろえる（DESIGN §5 文字ボタン）
  marginLeft: 'calc(-1 * var(--space-1))',
  marginTop: 'var(--space-1)',
};
const footerRow = { display: 'flex', gap: 'var(--space-3)' };
const withdrawStyle = { ...btnGhost, color: 'var(--error)' };

// 「10月1日」（今年でなければ「2025年10月1日」）。日本時間。
function dateLabel(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const JST = 9 * 3600 * 1000;
  const d = new Date(t + JST);
  const thisYear = new Date(Date.now() + JST).getUTCFullYear();
  return `${d.getUTCFullYear() !== thisYear ? `${d.getUTCFullYear()}年` : ''}${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
export { dateLabel as aiConsentDateLabel };

// 送るものと送り先の一覧（機能ごとに 1 行）。first: いま使おうとしている機能の id（先頭に出す）。
export function AiConsentDetails({ first = null }) {
  const features = first
    ? [...AI_FEATURES.filter((f) => f.id === first), ...AI_FEATURES.filter((f) => f.id !== first)]
    : AI_FEATURES;
  return (
    <>
      <ul style={listStyle} aria-label="送るものと送り先">
        {features.map((f, i) => (
          <li key={f.id} style={{ ...rowStyle, ...(i > 0 ? { borderTop: '1px solid var(--separator)' } : {}) }}>
            <div style={rowHead}>
              <span style={nameStyle}>{f.name}</span>
              <span style={providerStyle}>{providersFor(f).join('・')}</span>
            </div>
            <p style={sendsStyle}>{f.sends}</p>
          </li>
        ))}
      </ul>
      <p style={noteStyle}>
        {withPhraseBreaks(`ほかの会社で答えられないときは、${AI_PROVIDER_NAMES[AI_FALLBACK_PROVIDER]}${NB}が代わりに答えます。どの会社も、契約により、送った内容を AI${NB}の学習に使いません。`)}
      </p>
      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        プライバシーポリシー
        <ExternalLink size={16} aria-hidden="true" />
      </a>
    </>
  );
}

export default function AiConsentSheet({ purpose = null, mode = 'ask', record = null, busy = false, onAgree, onDecline, onWithdraw }) {
  const consented = isAiConsentCurrent(record);
  const feature = featureForPurpose(purpose);
  const manage = mode === 'manage';
  // 同意は機能ごとではなく AI の機能すべてに効くので、「〈機能〉など」と範囲を言う（2026-10-01 ui-critic）。
  const lead = feature && !manage
    ? `${feature.name.replace(/ /g, NB)}など AI${NB}の機能を使うと、次の内容を外部の AI${NB}サービスに送ります。`
    : `AI${NB}の機能を使うと、次の内容を外部の AI${NB}サービスに送ります。`;

  const footer = manage && consented ? (
    <button type="button" style={{ ...withdrawStyle, opacity: 1 }} onClick={onWithdraw} disabled={busy} aria-busy={busy || undefined}>
      {busy ? '取り消しています…' : '同意を取り消す'}
    </button>
  ) : (
    <div style={footerRow}>
      <button type="button" style={{ ...btnGhost, flex: 1 }} onClick={onDecline}>今はやめる</button>
      {/* 処理中も薄くしない（DESIGN §5 押せないボタン）。全体の button:disabled{opacity:.4} を打ち消して文言で示す。 */}
      <button type="button" style={{ ...btnPrimary, flex: 1, opacity: 1 }} onClick={onAgree} disabled={busy} aria-busy={busy || undefined}>
        {busy ? '同意しています…' : manage ? '同意する' : '同意して使う'}
      </button>
    </div>
  );

  return (
    <BottomSheet
      // 設定から開いたときは設定の行と同じ名前（何の設定かが分かるように・2026-10-01 ui-critic）。
      title={manage ? 'AI へのデータ送信' : 'AI に送る内容について'}
      onClose={onDecline}
      footer={footer}
      // 同意済みの確認（設定から）は右上の「完了」で閉じる。聞くときは下の「今はやめる」1 つ（閉じる入口を 2 つにしない）。
      dismissLabel={manage && consented ? '完了' : null}
      layer="dialog"
    >
      <p style={leadStyle}>{withPhraseBreaks(lead)}</p>
      {manage && consented && record?.at && (
        <p style={metaStyle}>{dateLabel(record.at)}に同意しました</p>
      )}
      <AiConsentDetails first={manage ? null : feature?.id || null} />
    </BottomSheet>
  );
}

// アプリに 1 つだけ置く受け手（App.jsx の PaywallGate）。requestAiConsent の合図でシートを開き、答えを返す。
export function AiConsentGate() {
  const toast = useToast();
  const [req, setReq] = useState(null); // { purpose, mode, resolve, record }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onReq = (e) => {
      const d = e?.detail;
      if (!d || typeof d.resolve !== 'function') return;
      d.handled = true;
      setReq({ purpose: d.purpose || null, mode: d.mode || 'ask', resolve: d.resolve, record: null });
      // 設定から開いたときは、いまの同意（日付）を出す。
      if (d.mode === 'manage') {
        readAiConsent().then((record) => setReq((r) => (r && r.resolve === d.resolve ? { ...r, record } : r)), () => {});
      }
    };
    window.addEventListener(AI_CONSENT_REQUEST_EVENT, onReq);
    return () => window.removeEventListener(AI_CONSENT_REQUEST_EVENT, onReq);
  }, []);

  const reqRef = useRef(null);
  reqRef.current = req;
  const finish = useCallback((ok) => {
    const r = reqRef.current;
    reqRef.current = null;
    setReq(null);
    setBusy(false);
    if (r) r.resolve(ok);
  }, []);
  const decline = useCallback(() => finish(false), [finish]);

  const agree = async () => {
    if (busy) return;
    setBusy(true);
    await grantAiConsent();
    finish(true);
  };
  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await withdrawAiConsent();
    if (ok) toast.success('同意を取り消しました');
    else toast.error('取り消せませんでした。通信の状態を確かめて、もう一度お試しください。');
    finish(false);
  };

  const open = !!req;
  // ブラウザ / Android の「戻る」は、このシートだけを閉じる（＝今はやめる）。
  useBackLayer(open, decline, { overBlock: true });
  // Esc はこのシートだけを閉じる（下のメモを書くシート・設定まで一緒に閉じない）。
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      decline();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, decline]);

  if (!req) return null;
  return (
    <AiConsentSheet
      purpose={req.purpose}
      mode={req.mode}
      record={req.record}
      busy={busy}
      onAgree={agree}
      onDecline={decline}
      onWithdraw={withdraw}
    />
  );
}
