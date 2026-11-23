// 👤 プロフィールの画面（2026-11-22 オーナー「設定とプロフィールを二つに分けた方がいい」「アイコンと歯車を並べる」）。
//   上の行の自分のアイコンから開く（歯車は設定）。設定の中にあったプロフィールとフォローをここへ移した。
//   上から: アイコン・名前・自己紹介 → 公開の状態の 1 行 → 「プロフィールを編集」「リンクを共有」 →（フォロー）フォロー中 N｜フォロワー N・
//   届いた申し込み（その場で承認・断る）・ID でフォロー → 好きな言葉・好きな本（公開のページと同じ見え方）。
//   登録せずに始めた人には「アカウントを作ると、公開とフォローができます。」と設定への入口。
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Pencil } from 'lucide-react';
import BottomSheet from './BottomSheet';
import UserAvatar from './UserAvatar';
import MiniCover from './MiniCover';
import FollowSummary from './FollowSummary';
import { SkeletonBlock } from './Skeleton';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';
import { btnGhost, btnPrimary, btnLink, groupTitle } from '../styles/ui';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { isGuestUser } from '../lib/guestAuth';
import { hasProfile, addressName, profileUrl } from '../lib/profile';
import { SOCIAL_ON, loadFollows } from '../lib/social';
import { track } from '../lib/analytics';

const ProfileSheet = lazy(() => import('./ProfileSheet'));
const FollowSheet = lazy(() => import('./FollowSheet'));

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: '0 var(--space-4)' };

/** onOpenSettings: 設定を開く（登録せずに始めた人の「アカウントを作る」）。onProfileSaved / onAddWant / hasBook は今までどおり。 */
export default function ProfileScreen({ onClose, onOpenSettings, onProfileSaved, onAddWant, hasBook }) {
  const toast = useToast();
  const { user } = useAuth();
  const { profile, loading } = useProfile(user?.id || '');
  const guest = isGuestUser(user);
  const [editOpen, setEditOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false); // false | { tab, report }
  const [followLists, setFollowLists] = useState(null); // null＝読んでいる・'none'＝まだ使えない・'error'＝読めなかった
  const reloadFollows = useCallback(() => {
    if (!SOCIAL_ON) return;
    loadFollows()
      .then((r) => setFollowLists((prev) => (r.ok ? r.lists : r.reason === 'not_ready' ? 'none' : (prev && typeof prev === 'object' ? prev : 'error'))))
      .catch(() => setFollowLists((prev) => (prev && typeof prev === 'object' ? prev : 'error')));
  }, []);
  useEffect(() => { reloadFollows(); }, [reloadFollows]);

  const url = profile.isPublic ? profileUrl(profile.publicId) : '';
  const shareLink = async () => {
    if (!url) return;
    track('profile_link', { from: 'profile_screen' });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share({ url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success('リンクをコピーしました。');
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error('リンクを共有できませんでした。');
    }
  };

  const name = hasProfile(profile) ? (addressName(profile) || 'ニックネームなし') : 'ニックネームはまだありません';
  const status = guest ? '' : profile.isPublic
    ? (profile.shelfPublic ? (profile.summaryPublic ? '公開中・本棚と本のまとめも' : '公開中・本棚も') : '公開中')
    : '公開していません';
  const followReady = followLists && typeof followLists === 'object';
  const requests = followReady ? followLists.requests.length : 0;

  return (
    <>
      {createPortal(
        <BottomSheet title="プロフィール" onClose={onClose}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {loading ? (
              <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                <SkeletonBlock width="64px" height="64px" radius="50%" />
                <SkeletonBlock width="40%" height="1.4em" />
              </div>
            ) : (
              <section aria-label="あなたのプロフィール">
                <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                  <UserAvatar avatarId={profile.avatar} nickname={profile.nickname} size={64} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {/* ニックネームが無い人は、名前の代わりに主ボタン「ニックネームを決める」（申し込むにも申し込まれるにも要る・2026-11-22 ui-critic）。 */}
                    {profile.nickname
                      ? <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.4, color: 'var(--text)', overflowWrap: 'anywhere' }}>{name}</p>
                      : <button type="button" onClick={() => setEditOpen(true)} style={btnPrimary}>ニックネームを決める</button>}
                    {status && <p style={{ ...note, marginTop: 'var(--space-1)' }}>{status}</p>}
                  </div>
                </div>
                {profile.bio && <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{profile.bio}</p>}
                {profile.nickname && <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                  <button type="button" onClick={() => setEditOpen(true)} style={{ ...btnGhost, flex: 1, gap: 'var(--space-2)' }}>
                    <Pencil size="1em" aria-hidden="true" />プロフィールを編集
                  </button>
                  {url && (
                    <button type="button" onClick={shareLink} style={{ ...btnGhost, flex: 1, gap: 'var(--space-2)' }}>
                      <Link2 size="1em" aria-hidden="true" />リンクを共有
                    </button>
                  )}
                </div>}
              </section>
            )}

            {guest && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <p style={note}>{withPhraseBreaks('アカウントを作ると、プロフィールの公開とフォローができます。')}</p>
                <button type="button" onClick={onOpenSettings} style={{ ...btnLink, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>アカウントを作る（設定）</button>
              </div>
            )}

            {/* 👥 フォロー（VITE_SOCIAL のビルドだけ・使えない DB では出さない） */}
            {SOCIAL_ON && !guest && followLists === 'error' && (
              <section aria-label="フォロー">
                <p style={{ ...groupTitle, margin: '0 0 var(--space-2) var(--space-4)' }}>フォロー</p>
                {/* 黙って消さない（2026-11-22 審査の点検）。つながらないときは理由ともう一度。 */}
                <div role="alert" style={{ ...card, padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <p style={note}>{withPhraseBreaks('フォローを読み込めませんでした。')}</p>
                  <button type="button" onClick={() => { setFollowLists(null); reloadFollows(); }} style={{ ...btnLink, flexShrink: 0 }}>もう一度</button>
                </div>
              </section>
            )}
            {SOCIAL_ON && !guest && followLists !== 'none' && followLists !== 'error' && (
              <section aria-label="フォロー">
                <p style={{ ...groupTitle, margin: '0 0 var(--space-2) var(--space-4)' }}>フォロー</p>
                <div style={card}>
                  {/* FollowSummary は上に区切り線を持つので、カードの先頭は線を消す */}
                  <div style={{ marginTop: -1 }}>
                    <FollowSummary
                      lists={followLists}
                      onOpen={(tab) => setFollowOpen({ tab })}
                      onReport={(person) => setFollowOpen({ report: person })}
                      onChanged={reloadFollows}
                    />
                  </div>
                </div>
              </section>
            )}

            {(profile.favLine || profile.favTitle) && (
              <section aria-label="好きな言葉と好きな本">
                {profile.favLine && (
                  <blockquote style={{ margin: 0, padding: 'var(--space-1) 0 var(--space-1) var(--space-4)', borderLeft: '2px solid var(--accent)', fontFamily: 'var(--font-read)', fontSize: [...String(profile.favLine)].length > 40 ? 'var(--text-read)' : 'var(--text-heading)', lineHeight: 1.7, lineBreak: 'strict', textWrap: 'pretty', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                    {withPhraseBreaks(profile.favLine)}
                  </blockquote>
                )}
                {profile.favTitle && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: profile.favLine ? 'var(--space-4)' : 0 }}>
                    <MiniCover title={profile.favTitle} cover={profile.favCover} width={40} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', ...note }}>好きな本</span>
                      <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>『{profile.favTitle}』</span>
                      {profile.favAuthor && <span style={{ display: 'block', ...note }}>{profile.favAuthor}</span>}
                    </span>
                  </div>
                )}
              </section>
            )}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btnLink, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>公開のページを見る</a>
            )}
          </div>
        </BottomSheet>,
        document.body,
      )}
      {editOpen && (
        <Suspense fallback={null}>
          <ProfileSheet userId={user?.id || ''} onClose={() => setEditOpen(false)} onSaved={onProfileSaved} />
        </Suspense>
      )}
      {followOpen && (
        <Suspense fallback={null}>
          <FollowSheet initialRequestCount={requests} initialTab={followOpen.tab || ''} initialReport={followOpen.report || null} onClose={() => { setFollowOpen(false); reloadFollows(); }} onAddWant={onAddWant} hasBook={hasBook} />
        </Suspense>
      )}
    </>
  );
}
