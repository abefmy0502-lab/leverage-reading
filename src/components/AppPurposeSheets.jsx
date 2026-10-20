// 🎯 Orime を入れた理由のシート 2 つ（2026-10-18 オーナー）。
//
// AppPurposeEditSheet: 設定の「Orime を入れた理由」から書き直す（チップ＋欄・下に「保存」）。
// PurposeCheckSheet:   解約（プランを管理）と退会の前に一度だけ「目的は達成できましたか？」。
//   入れた理由を見せて、「まだ途中」「達成できた」のどちらを押しても先へ進む（止めない・同じ重さの 2 つ・
//   どこへ進むかを 1 行で言う＝App Store の解約を妨げない）。閉じたら何もしない（もとの画面のまま）。
// どちらも設定の上に重ねる（layer='dialog'）。
import { useState } from 'react';
import { useToast } from './Toast';
import { createPortal } from 'react-dom';
import BottomSheet from './BottomSheet';
import AppPurposeField from './AppPurposeField';
import { btnPrimary, btnPrimaryOff, btnGhost, groupTitle } from '../styles/ui';
import { cleanPurposeText, saveAppPurpose, isPurposeSpecific } from '../lib/appPurpose';
import { fmtDateJa } from '../lib/dates';
import { track } from '../lib/analytics';
import { withPhraseBreaks } from './TightBubble';
import { FREE_TOKENS, answerCountLabel } from '../lib/tokenAmounts';

const quoteBox = { padding: 'var(--space-3) var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)' };
const quoteText = { margin: 'var(--space-1) 0 0', fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };

export function AppPurposeEditSheet({ purpose, onClose }) {
  const [text, setText] = useState(purpose?.text || '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // 変えていない間は押せない（押すと「M/D に書いた」の日付だけが今日に変わってしまう）。
  const ok = isPurposeSpecific(text) && cleanPurposeText(text) !== cleanPurposeText(purpose?.text);
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const res = await saveAppPurpose(text);
    track('app_purpose_set', { where: 'settings' });
    if (res && !res.synced) toast.info('この端末には保存しました。つながってから、もう一度保存してください。');
    onClose();
  };
  return createPortal(
    <BottomSheet
      title="Orime を入れた理由"
      onClose={onClose}
      dismissLabel="キャンセル"
      layer="dialog"
      footer={<button type="button" onClick={save} disabled={!ok || busy} style={ok ? { ...btnPrimary, opacity: 1 } : btnPrimaryOff}>{busy ? '保存しています…' : '保存'}</button>}
    >
      {/* 変えたときだけ「書いた日は今日に」・変えていない間は書いた日をそのまま */}
      <AppPurposeField
        value={text}
        onChange={setText}
        readyText={cleanPurposeText(text) !== cleanPurposeText(purpose?.text) ? '保存すると、書いた日は今日になります' : (purpose?.at ? `書いた日：${fmtDateJa(purpose.at)}` : '')}
      />
    </BottomSheet>,
    document.body,
  );
}

const CANCEL_REASSURE_LEAD = 'プランをやめても、';
const CANCEL_REASSURE_KEEP = '無料プラン（ずっと無料）で';
const CANCEL_REASSURE_REST = '続けられます。';
const CANCEL_REASSURE_NEXT = 'メモと行動はそのまま残り、';
const CANCEL_REASSURE_AMOUNT = `相談も毎月 AI の答え ${answerCountLabel(FREE_TOKENS)}。`;
export const CANCEL_REASSURE = `${CANCEL_REASSURE_LEAD}${CANCEL_REASSURE_KEEP}${CANCEL_REASSURE_REST}${CANCEL_REASSURE_NEXT}${CANCEL_REASSURE_AMOUNT}`;
// where: 'cancel'（プランを管理）| 'delete'（退会）。nextText: どちらを押しても進む先（1 行）。
export function PurposeCheckSheet({ purpose, where, nextText, onContinue, onClose }) {
  const answer = (result) => {
    track('purpose_check', { where, result });
    onContinue();
  };
  return createPortal(
    <BottomSheet
      title="目的は達成できましたか？"
      onClose={() => { track('purpose_check', { where, result: 'closed' }); onClose(); }}
      dismissLabel="キャンセル"
      layer="dialog"
      footer={(
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <button type="button" onClick={() => answer('ongoing')} style={{ ...btnGhost, flex: '1 1 7em', whiteSpace: 'nowrap' }}>まだ途中</button>
          <button type="button" onClick={() => answer('done')} style={{ ...btnGhost, flex: '1 1 7em', whiteSpace: 'nowrap' }}>達成できた</button>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={quoteBox}>
          <span style={{ ...groupTitle, display: 'block' }}>{purpose?.at ? `${fmtDateJa(purpose.at)} に書いた、Orime を入れた理由` : 'Orime を入れた理由'}</span>
          <p style={quoteText}>{withPhraseBreaks(purpose?.text || '')}</p>
        </div>
        {/* 解約の前: やめても続けられることを先に（2026-10-20 オーナー「課金している人・していない人それぞれの満足度」・止めない） */}
        {where === 'cancel' && (
          // 本文より一段下げる（主役は入れた理由・引き止めの文に見せない）。1 文ずつ改行・「無料プラン（ずっと無料）で」は割らない（2026-10-20 ui-critic）。
          <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(CANCEL_REASSURE_LEAD)}<span style={{ whiteSpace: 'nowrap' }}>{CANCEL_REASSURE_KEEP}</span>{withPhraseBreaks(CANCEL_REASSURE_REST)}
            <br />
            {withPhraseBreaks(CANCEL_REASSURE_NEXT)}<span style={{ whiteSpace: 'nowrap' }}>{CANCEL_REASSURE_AMOUNT}</span>
          </p>
        )}
        {nextText && (
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(nextText)}</p>
        )}
      </div>
    </BottomSheet>,
    document.body,
  );
}
