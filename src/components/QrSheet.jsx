// 🔳 QR コード（2026-11-28 オーナー「インスタグラムのように QR コードでアカウント交換できるようにしたい」）。
//   プロフィールの「フォロー」のカードの「QR コード」と、フォローの画面の「あなたの ID」から開く。
//   上から: 白い札（真ん中に自分のアイコンを重ねた QR）→ ニックネーム・ID → 1 行の説明 →
//   主ボタン「QR コードを読み取る」（相手の QR を読む＝QrScanner）・副ボタン「リンクを共有」。
//   読めたら onFound(publicId)（呼んだ側がフォローの確かめの画面を開く）。
//   QR はフォローのリンク（lib/followQr.js）＝スマホのカメラで読んでも、フォローの画面が開く。
//   札は明暗どちらでも白地に墨（読み取りのため）＝ --on-cover と --focus-bg。この画面で大胆さを使う 1 か所。
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScanLine, Share } from 'lucide-react';
import BottomSheet from './BottomSheet';
import UserAvatar from './UserAvatar';
import QrScanner from './QrScanner';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary, btnGhost, btnLink } from '../styles/ui';
import { followLink, qrPath } from '../lib/followQr';
import { track } from '../lib/analytics';

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, textAlign: 'center', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const QR_PX = 216;

/** profile: 自分のプロフィール（nickname・avatar・publicId）。onFound(publicId)・onEditProfile()・onClose()。 */
export default function QrSheet({ profile, onFound, onEditProfile, onClose }) {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const publicId = profile?.publicId || '';
  const ready = !!(publicId && String(profile?.nickname || '').trim());
  const link = ready ? followLink(publicId) : '';
  // 真ん中にアイコンを重ねるので、誤り訂正を Q（25%）に上げる
  const qr = useMemo(() => (link ? qrPath(link, 'Q') : null), [link]);

  const share = async () => {
    if (!link) return;
    track('follow_qr', { action: 'share_link' });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share({ url: link }); return; }
      await navigator.clipboard.writeText(link);
      toast.success('リンクをコピーしました。');
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error('リンクを共有できませんでした。');
    }
  };

  if (scanning) {
    return (
      <QrScanner
        myPublicId={publicId}
        onClose={() => setScanning(false)}
        onFound={(id) => { setScanning(false); onFound?.(id); }}
      />
    );
  }

  return createPortal(
    <BottomSheet title="QR コード" onClose={onClose} layer="dialog">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', paddingBottom: 'var(--space-2)' }}>
        {ready && qr ? (
          <>
            <div
              role="img"
              aria-label={`${profile.nickname}さんをフォローする QR コード`}
              style={{ position: 'relative', padding: 'var(--space-4)', background: 'var(--on-cover)', borderRadius: 'var(--radius)', border: '1px solid var(--separator)', lineHeight: 0 }}
            >
              <svg viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} width={QR_PX} height={QR_PX} shapeRendering="crispEdges" aria-hidden="true">
                <path d={qr.d} fill="var(--focus-bg)" />
              </svg>
              {/* 真ん中のアイコン（白い縁で QR のマスから離す） */}
              <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: 4, borderRadius: 'var(--radius-full)', background: 'var(--on-cover)', lineHeight: 0 }}>
                <UserAvatar avatarId={profile.avatar} nickname={profile.nickname} size={44} />
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{profile.nickname}</p>
              <p style={{ ...note, marginTop: 'var(--space-1)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>{`ID ${publicId}`}</p>
            </div>
            <p style={note}>{withPhraseBreaks('相手がこの QR を読むと、あなたにフォローの申し込みができます。スマホのカメラで読んでも開きます。')}</p>
          </>
        ) : (
          <>
            <p style={{ ...note, fontSize: 'var(--text-sub)', color: 'var(--text)' }}>{withPhraseBreaks('ニックネームを決めると、あなたの QR コードを作れます。')}</p>
            {onEditProfile && <button type="button" onClick={onEditProfile} style={{ ...btnLink }}>ニックネームを決める</button>}
          </>
        )}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <button type="button" onClick={() => { track('follow_qr', { action: 'open_scanner' }); setScanning(true); }} style={{ ...btnPrimary, gap: 'var(--space-2)' }}>
            <ScanLine size="1.1em" aria-hidden="true" />QR コードを読み取る
          </button>
          {ready && (
            <button type="button" onClick={share} style={{ ...btnGhost, gap: 'var(--space-2)' }}>
              <Share size="1em" aria-hidden="true" />リンクを共有
            </button>
          )}
        </div>
      </div>
    </BottomSheet>,
    document.body,
  );
}
