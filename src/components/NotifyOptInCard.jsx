// 🔔 思い出しの通知の案内（1 回だけ・閉じられる）— lib/notifyOptIn.js の決まりで出す。
// 見た目は DESIGN §5「閉じられる案内カード」（--surface＋枠 --separator＋角丸 12＋内側 16・アイコンなし・右上の ×）。
// ボタンは、画面にほかの主ボタンがあるとき（初日クイックスタートの「相談する」）は副ボタン（primary=false）。
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { btnPrimary, btnPrimaryOff, btnGhost, btnGhostOff } from '../styles/ui';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';
import { track } from '../lib/analytics';
import { canOfferNotify, enableNotify, isNotifyOptInDone, markNotifyOptInDone } from '../lib/notifyOptIn';

const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const closeBtn = {
  width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 999, color: 'var(--text-3)', cursor: 'pointer', padding: 0,
  // 押せる範囲 44 のまま、× の見た目をカードの余白 16 の角にそろえる
  margin: 'calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0',
};

// where: 'action'（はじめて行動に追加した直後）| 'quickstart'（初日クイックスタートを終えた直後）— 計測だけに使う
export default function NotifyOptInCard({ where = 'action', primary = true, style = null }) {
  const toast = useToast();
  const [state, setState] = useState(() => (isNotifyOptInDone() ? 'hidden' : 'checking')); // checking | shown | hidden
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state !== 'checking') return undefined;
    let alive = true;
    canOfferNotify()
      .then((ok) => {
        if (!alive) return;
        setState(ok ? 'shown' : 'hidden');
        if (ok) track('notify_optin', { action: 'shown', where });
      })
      .catch(() => { if (alive) setState('hidden'); });
    return () => { alive = false; };
  }, [state, where]);

  if (state !== 'shown') return null;

  const close = (action) => {
    markNotifyOptInDone();
    setState('hidden');
    track('notify_optin', { action, where });
  };
  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await enableNotify();
      if (res?.ok) {
        toast.success('思い出しの通知をオンにしました。');
        close('enabled');
      } else if (res?.reason === 'denied') {
        toast.info('通知は端末の設定でオフになっています。設定からオンにできます。');
        close('denied');
      } else {
        // 失敗は閉じない（もう一度押せる）
        toast.error('通知をオンにできませんでした。少し時間をおいて、もう一度お試しください。');
      }
    } finally {
      setBusy(false);
    }
  };
  const on = primary ? btnPrimary : btnGhost;
  const off = primary ? btnPrimaryOff : btnGhostOff;

  return (
    <section aria-labelledby={`notify-optin-${where}`} style={{ ...card, ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <h3 id={`notify-optin-${where}`} style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
          思い出しの通知を受け取りますか？
        </h3>
        <button type="button" onClick={() => close('dismiss')} aria-label="閉じる" style={closeBtn}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {/* 文節の切れ目（BudouX の <wbr>）でだけ折り返す（語の途中で割らない） */}
      <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks('多くても週に 1\u00a0回、前に残したメモを 1\u00a0件だけお届けします。設定からいつでもオフにできます。')}
      </p>
      <button type="button" onClick={enable} disabled={busy} style={{ ...(busy ? off : on), marginTop: 'var(--space-3)' }} aria-busy={busy || undefined}>
        {busy ? '設定しています…' : '通知を受け取る'}
      </button>
    </section>
  );
}
