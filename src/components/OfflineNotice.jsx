// 📶 オフラインの一行（2026-10-04・運営判断「静かに」）。
//
// つながっていない間だけ、画面の上の行のすぐ下に 1 行:「オフラインです。つながると保存できます。」
// 見た目は DESIGN §5「オフラインの一行」: --fill の帯・lucide WifiOff 16・13/--text-2・左右 16。
// 出入りは高さを grid-template-rows（0fr ⇄ 1fr）で --duration-fast かけて動かす（下が一度に跳ねない・
// DESIGN §5「開いて出す欄」と同じ）。畳んでいる間は visibility: hidden（読み上げない）。
// 出るときに知らせ（トースト）は出さない。5 秒以上つながっていなかったあとに戻ったら、一度だけ「つながりました」。
//
// safeTop: 上に画面の上の行が無い画面（すべての本）で、帯がノッチの下に来るようにセーフエリアを取る。

import { useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';

// 画面を切り替えても（部品が作り直されても）、いつから切れているかは 1 つだけ持つ。
let offlineSince = null;
const RECONNECT_TOAST_MIN_MS = 5000;

export default function OfflineNotice({ safeTop = false }) {
  const online = useOnline();
  const toast = useToast();
  const prevOnline = useRef(online);

  useEffect(() => {
    if (!online) {
      if (offlineSince == null) offlineSince = Date.now();
    } else if (!prevOnline.current && offlineSince != null) {
      const away = Date.now() - offlineSince;
      offlineSince = null;
      if (away >= RECONNECT_TOAST_MIN_MS) toast.success('つながりました');
    } else if (online) {
      offlineSince = null;
    }
    prevOnline.current = online;
  }, [online, toast]);

  const shown = !online;
  return (
    <div
      aria-hidden={!shown || undefined}
      style={{
        flexShrink: 0,
        display: 'grid',
        gridTemplateRows: shown ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--duration-fast) var(--ease-out), visibility 0s linear ' + (shown ? '0s' : 'var(--duration-fast)'),
        visibility: shown ? 'visible' : 'hidden',
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <p
          role="status"
          data-offline-notice=""
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: safeTop
              ? 'calc(var(--space-2) + env(safe-area-inset-top, 0px)) var(--space-4) var(--space-2)'
              : 'var(--space-2) var(--space-4)',
            background: 'var(--fill)',
            color: 'var(--text-2)',
            fontSize: 'var(--text-meta)',
            lineHeight: 1.5,
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
          }}
        >
          <WifiOff size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>{withPhraseBreaks('オフラインです。つながると保存できます。')}</span>
        </p>
      </div>
    </div>
  );
}
