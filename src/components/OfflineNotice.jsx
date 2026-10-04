// 📶 オフラインの一行（2026-10-04・運営判断「静かに」）。
//
// つながっていない間だけ、画面の上の行のすぐ下に 1 行:「オフラインです。つながるまで保存できません。」
// 保存は端末にためておいて後で送る仕組みが無い（失敗する）ので、「つながると保存できます」とは言わない。保存を押すと、
// メモのシート・行動のモーダルは書いた内容を残したまま「オフラインです。つながってから、もう一度保存してください。」を出す（2026-10-04）。
// 見た目は DESIGN §5「オフラインの一行」: --fill の帯・lucide WifiOff 16・13/--text-2・左右 16。
// 出入りは高さを grid-template-rows（0fr ⇄ 1fr）で --duration-fast かけて動かす（下が一度に跳ねない・
// DESIGN §5「開いて出す欄」と同じ）。畳んでいる間は visibility: hidden（読み上げない）。
// 出るときに知らせ（トースト）は出さない。5 秒以上つながっていなかったあとに戻ったら、一度だけ「つながりました」。
//
// style: 置き場所に合わせた外側の余白（すべての本は「‹ ホーム」の行の下・左右いっぱい・畳んでいる間は行の間の空きを打ち消す）。

import { useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';

// 画面を切り替えても（部品が作り直されても）、いつから切れているかは 1 つだけ持つ。
let offlineSince = null;
const RECONNECT_TOAST_MIN_MS = 5000;
const OFFLINE_TEXT = 'オフラインです。つながるまで保存できません。';
const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0, visibility: 'visible',
};

export default function OfflineNotice({ style }) {
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
      style={{
        position: 'relative',
        flexShrink: 0,
        display: 'grid',
        gridTemplateRows: shown ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--duration-fast) var(--ease-out), visibility 0s linear ' + (shown ? '0s' : 'var(--duration-fast)'),
        visibility: shown ? 'visible' : 'hidden',
        ...style,
      }}
    >
      {/* 読み上げ: いつもある見えない status に、切れたときだけ文を入れる（入れた瞬間に読まれる）。
          帯そのものは見た目だけ（aria-hidden）。帯の visibility を切り替えるだけだと、出たときに読まれなかった（2026-10-04 ui-critic）。
          visibility: visible で、畳んでいる帯（hidden）の中でも読み上げの木に残す。 */}
      <span role="status" style={SR_ONLY}>{shown ? OFFLINE_TEXT : ''}</span>
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <p
          aria-hidden="true"
          data-offline-notice=""
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--fill)',
            color: 'var(--text-2)',
            fontSize: 'var(--text-meta)',
            lineHeight: 1.5,
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
          }}
        >
          <WifiOff size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>{withPhraseBreaks(OFFLINE_TEXT)}</span>
        </p>
      </div>
    </div>
  );
}
