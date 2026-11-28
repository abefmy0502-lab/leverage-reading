// 🌐 公開する前の 1 枚（2026-11-28 オーナー「本棚の公開、本のまとめ、フォロー、フォロワーの選択も一気にできるように」）。
//   プロフィールの画面の「公開のページを見る」を、公開していないときに押すと開く。
//   上から: 何が見えるかの 1 行 → 本棚も公開する → 本のまとめも公開する（本棚がオンのときだけ）→
//   フォロー中・フォロワーを見せる（フォローが使えるビルドで、読めたときだけ）→ 下に固定の「公開して見る」。
//   選んだものをまとめて保存してから、公開のページを開く（開くのは呼び出し側＝onPublished）。
//   切り替えの文言とふるまいは ProfileSheet（プロフィールを編集）と同じ。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from './BottomSheet';
import ToggleSwitch from './ToggleSwitch';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary } from '../styles/ui';
import { saveProfileShared } from '../hooks/useProfile';
import { SOCIAL_ON, loadFollows, setFollowsVisible } from '../lib/social';
import { track } from '../lib/analytics';

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' };
const label = (on) => ({ fontSize: 'var(--text-body)', color: on ? 'var(--text)' : 'var(--text-3)' });

/** uid / profile: 今のプロフィール。onPublished(saved): 公開できたら（ページを開くのは呼び出し側）。 */
export default function PublishSheet({ uid, profile, onClose, onPublished }) {
  // はじめて公開する人は、本棚もオンから（見に来た人に中身が見えるように）。前に選んだ人はその選び方のまま。
  const firstTime = !profile.isPublic && !profile.shelfPublic && !profile.summaryPublic;
  const [shelf, setShelf] = useState(firstTime ? true : !!profile.shelfPublic);
  const [summary, setSummary] = useState(!!profile.summaryPublic);
  const [lists, setLists] = useState(null); // null＝読めていない（行を出さない）
  const [listsOrig, setListsOrig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!SOCIAL_ON) return undefined;
    let alive = true;
    loadFollows().then((r) => { if (alive && r?.ok) { setLists(r.followsVisible); setListsOrig(r.followsVisible); } }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { profile: saved, shelfReady, summaryReady } = await saveProfileShared(uid, {
        ...profile, isPublic: true, shelfPublic: shelf, summaryPublic: shelf && summary,
      });
      if (!saved?.isPublic || !saved.publicId) {
        setError(saved?.hidden ? 'このプロフィールは、運営が確かめるまで公開を止めています。' : '公開にできませんでした。通信状況を確認して、もう一度お試しください。');
        return;
      }
      // フォロー中・フォロワーの見せ方は、変えたときだけ送る（失敗しても公開はできているので、理由を添えて開く）。
      let listsFailed = false;
      if (lists !== null && listsOrig !== null && lists !== listsOrig) {
        let r = 'error';
        try { r = await setFollowsVisible(lists); } catch { r = 'error'; }
        listsFailed = r !== 'ok';
      }
      const notes = [];
      if (shelf && shelfReady === false) notes.push('本棚の公開');
      if (shelf && summary && summaryReady === false) notes.push('本のまとめの公開');
      if (listsFailed) notes.push('フォロー中・フォロワーの見せ方');
      track('profile_set', { from: 'publish_sheet', pub: true, shelf: !!saved.shelfPublic, summary: !!saved.summaryPublic });
      onPublished?.(saved, notes);
    } catch {
      setError('公開にできませんでした。通信状況を確認して、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <BottomSheet
      title="プロフィールを公開する"
      onClose={onClose}
      dismissLabel="キャンセル"
      layer="dialog"
      footer={(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {error && <p role="alert" style={{ ...note, color: 'var(--error)' }}>{error}</p>}
          <button type="button" onClick={publish} disabled={busy} aria-busy={busy || undefined} style={btnPrimary}>{busy ? '公開しています…' : '公開して見る'}</button>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <p style={{ ...note, fontSize: 'var(--text-sub)', color: 'var(--text)' }}>
          {withPhraseBreaks('メモは公開されません。')}
        </p>

        <div style={{ ...rowStyle, marginTop: 'var(--space-4)' }}>
          <span style={label(true)}>本棚も公開する</span>
          <ToggleSwitch checked={shelf} onChange={() => { setShelf((v) => !v); if (shelf) setSummary(false); }} disabled={busy} ariaLabel="本棚も公開する" />
        </div>

        {SOCIAL_ON && (
          <>
            <div style={{ ...rowStyle, marginTop: 'var(--space-4)' }}>
              <span style={label(shelf)}>本のまとめも公開する</span>
              <ToggleSwitch checked={shelf && summary} onChange={() => setSummary((v) => !v)} disabled={busy || !shelf} ariaLabel="本のまとめも公開する" />
            </div>
            {lists !== null && (
              <>
                <div style={{ ...rowStyle, marginTop: 'var(--space-4)' }}>
                  <span style={label(true)}>フォロー中・フォロワーを見せる</span>
                  <ToggleSwitch checked={lists} onChange={() => setLists((v) => !v)} disabled={busy} ariaLabel="フォロー中・フォロワーを見せる" />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </BottomSheet>,
    document.body,
  );
}
