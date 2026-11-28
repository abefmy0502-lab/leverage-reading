// 🔳 QR コード（2026-11-28 オーナー「インスタグラムのように QR コードでアカウント交換できるようにしたい」）。
//   プロフィールの「フォロー」のカードの「QR コード」と、フォローの画面の「あなたの ID」から開く。
//   上から: 白い札（真ん中に自分のアイコンを重ねた QR）→ ニックネーム・ID → 1 行の説明 →
//   主ボタン「QR コードを読み取る」（相手の QR を読む＝QrScanner）・副ボタン「リンクを共有」。
//   読めたら onFound(publicId)（呼んだ側がフォローの確かめの画面を開く）。
//   QR はフォローのリンク（lib/followQr.js）＝スマホのカメラで読んでも、フォローの画面が開く。
//   札は明暗どちらでも白地に墨（読み取りのため）＝ --on-cover と --focus-bg。この画面で大胆さを使う 1 か所。
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScanLine, Share, Copy } from 'lucide-react';
import BottomSheet from './BottomSheet';
import UserAvatar from './UserAvatar';
import QrScanner from './QrScanner';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary, btnGhost } from '../styles/ui';
import { followLink, qrPath } from '../lib/followQr';
import { avatarById } from '../lib/avatars';
import { track } from '../lib/analytics';
import { isDemo } from '../lib/supabase';

// お試しモード（開発だけ）: &clipboard=fail で、ID のコピーに失敗したときの知らせを撮れるように。
const demoClipboardFail = isDemo && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('clipboard') === 'fail';

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, textAlign: 'center', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const QR_PX = 216;

/** profile: 自分のプロフィール（nickname・avatar・publicId）。onFound(publicId)・onEditProfile()・onClose()。 */
export default function QrSheet({ profile, onFound, onEditProfile, onClose }) {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const publicId = profile?.publicId || '';
  const named = !!String(profile?.nickname || '').trim();
  const ready = !!(publicId && named);
  const link = ready ? followLink(publicId) : '';
  // 真ん中にアイコンを重ねるので、誤り訂正を Q（25%）に上げる
  const qr = useMemo(() => (link ? qrPath(link, 'Q') : null), [link]);

  const copyId = async () => {
    if (!publicId) return;
    track('follow_copy_id', { from: 'qr' });
    try {
      if (demoClipboardFail) throw new Error('demo');
      await navigator.clipboard.writeText(publicId);
      toast.success('ID をコピーしました。');
    } catch {
      // 下に固定した「リンクを共有」が見えているので、知らせには道のボタンを重ねない
      toast.error('コピーできません。');
    }
  };

  const share = async () => {
    if (!link) return;
    track('follow_qr', { action: 'share_link' });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share({ url: link }); return; }
      await navigator.clipboard.writeText(link);
      toast.success('リンクをコピーしました。');
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error('リンクを共有できませんでした。もう一度お試しください。');
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
    <BottomSheet
      title="QR コード"
      onClose={onClose}
      layer="dialog"
      // 下に固定（知らせが主ボタンを隠さず、その上に浮かぶ＝DESIGN §5 のトースト・2026-11-28 ui-critic）
      footer={(
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* ニックネームが無いとフォローできない（読み取っても先で止まる）ので、主ボタンは「ニックネームを決める」だけ（2026-11-28 ui-critic） */}
          {!ready && !named && onEditProfile && <button type="button" onClick={onEditProfile} style={btnPrimary}>ニックネームを決める</button>}
          {!ready && named && <button type="button" onClick={onClose} style={btnGhost}>閉じる</button>}
          {ready && (
            <button type="button" onClick={() => { track('follow_qr', { action: 'open_scanner' }); setScanning(true); }} style={{ ...btnPrimary, gap: 'var(--space-2)' }}>
              <ScanLine size="1.1em" aria-hidden="true" />QR コードを読み取る
            </button>
          )}
          {ready && (
            <button type="button" onClick={share} style={{ ...btnGhost, gap: 'var(--space-2)' }}>
              <Share size="1em" aria-hidden="true" />リンクを共有
            </button>
          )}
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', paddingBottom: 'var(--space-2)' }}>
        {ready && qr ? (
          <>
            <div
              role="img"
              aria-label={`${profile.nickname}をフォローする QR コード`}
              style={{ position: 'relative', padding: 'var(--space-4)', background: 'var(--on-cover)', borderRadius: 'var(--radius)', border: '1px solid var(--separator)', lineHeight: 0 }}
            >
              <svg viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} width={QR_PX} height={QR_PX} shapeRendering="crispEdges" aria-hidden="true">
                <path d={qr.d} fill="var(--focus-bg)" />
              </svg>
              {/* 真ん中のアイコン（白い縁で QR のマスから離す） */}
              <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: 'var(--space-1)', borderRadius: 'var(--radius-full)', background: 'var(--on-cover)', lineHeight: 0 }}>
                {/* アイコンを選んでいない人の丸も、札の中は明暗どちらでも白地に墨（暗い画面で穴のように見えた・2026-11-28 ui-critic） */}
                <UserAvatar
                  avatarId={profile.avatar}
                  nickname={profile.nickname}
                  size={44}
                  style={avatarById(profile.avatar) ? null : { background: 'var(--on-cover)', color: 'var(--focus-bg)', boxShadow: 'inset 0 0 0 1px var(--focus-bg)' }}
                />
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{profile.nickname}</p>
              {/* ID を押すと ID だけをコピー（フォローの画面の「あなたの ID」と同じ） */}
              <button
                type="button"
                onClick={copyId}
                aria-label={`あなたの ID ${publicId} をコピー`}
                style={{ ...note, minHeight: 'var(--tap-min)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-2)', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {`ID ${publicId}`}<Copy size="1em" aria-hidden="true" style={{ color: 'var(--accent)' }} />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ニックネームはあるのに ID がまだ届いていない（保存の直後・つながらない）ときは、決め直しをすすめない */}
            <p role={named ? 'alert' : undefined} style={{ ...note, fontSize: 'var(--text-sub)', color: 'var(--text)' }}>{withPhraseBreaks(named ? 'QR コードを用意できませんでした。閉じて、もう一度開いてください。' : 'ニックネームを決めると、あなたの QR コードを作れます。')}</p>
          </>
        )}
      </div>
    </BottomSheet>,
    document.body,
  );
}
