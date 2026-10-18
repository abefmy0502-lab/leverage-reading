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
import { cleanPurposeText, saveAppPurpose } from '../lib/appPurpose';
import { fmtDateJa } from '../lib/dates';
import { track } from '../lib/analytics';
import { withPhraseBreaks } from './TightBubble';

const quoteBox = { padding: 'var(--space-3) var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)' };
const quoteText = { margin: 'var(--space-1) 0 0', fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };

export function AppPurposeEditSheet({ purpose, onClose }) {
  const [text, setText] = useState(purpose?.text || '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // 変えていない間は押せない（押すと「M/D に書いた」の日付だけが今日に変わってしまう）。
  const ok = !!cleanPurposeText(text) && cleanPurposeText(text) !== cleanPurposeText(purpose?.text);
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const res = await saveAppPurpose(text);
    track('app_purpose_set', { where: 'settings' });
    if (res && !res.synced) toast.error('この端末には保存しました。つながってから、もう一度保存してください。');
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
      <AppPurposeField value={text} onChange={setText} />
    </BottomSheet>,
    document.body,
  );
}

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
        {nextText && (
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(nextText)}</p>
        )}
      </div>
    </BottomSheet>,
    document.body,
  );
}
