// 👤 プロフィールの画面（2026-11-22 オーナー「設定とプロフィールを二つに分けた方がいい」「アイコンと歯車を並べる」）。
//   上の行の自分のアイコンから開く（歯車は設定）。設定の中にあったプロフィールとフォローをここへ移した。
//   上から: アイコン・名前・自己紹介 → 公開の状態の 1 行 → 「プロフィールを編集」「リンクを共有」 →（フォロー）フォロー中 N｜フォロワー N・
//   届いた申し込み（その場で承認・断る）・ID でフォロー → 好きな言葉・好きな本（公開のページと同じ見え方）。
//   登録せずに始めた人には「アカウントを作ると、公開とフォローができます。」と設定への入口。
//   2026-11-23 点検: 読めなかったときは ErrorMessage＋「もう一度」（前は空のプロフィールを出して「ニックネームを決める」を
//   すすめていた＝決めてあった人に誤って見えた）。フォローを読めなかったときも同じ ErrorMessage。
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Pencil } from 'lucide-react';
import BottomSheet from './BottomSheet';
import UserAvatar from './UserAvatar';
import MiniCover from './MiniCover';
import FollowSummary from './FollowSummary';
import { SkeletonBlock } from './Skeleton';
import ErrorMessage from './ErrorMessage';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { withPhraseBreaks } from './TightBubble';
import { btnGhost, btnPrimary, btnLink, groupTitle } from '../styles/ui';
import { useAuth } from '../hooks/useAuth';
import { useProfile, setProfileCache } from '../hooks/useProfile';
import { isGuestUser } from '../lib/guestAuth';
import { hasProfile, profileUrl, loadProfile } from '../lib/profile';
import { SOCIAL_ON, loadFollows } from '../lib/social';
import { track } from '../lib/analytics';

const ProfileSheet = lazy(() => import('./ProfileSheet'));
const FollowSheet = lazy(() => import('./FollowSheet'));
const PublishSheet = lazy(() => import('./PublishSheet'));

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: '0 var(--space-4)' };

/** onOpenSettings: 設定を開く（登録せずに始めた人の「アカウントを作る」）。onProfileSaved / onAddWant / hasBook は今までどおり。 */
export default function ProfileScreen({ onClose, onOpenSettings, onProfileSaved, onAddWant, hasBook }) {
  const toast = useToast();
  const { user } = useAuth();
  const uid = user?.id || '';
  const { profile, stored, loading, error: profileError } = useProfile(uid);
  const confirm = useConfirm();
  // 読めなかったプロフィールを読み直す（useProfile は覚えた値を配るので、読めたら setProfileCache で全画面へ）。
  const [retrying, setRetrying] = useState(false);
  const retryProfile = () => {
    if (!uid || retrying) return;
    setRetrying(true);
    loadProfile(uid)
      .then((r) => setProfileCache(uid, r.profile, r.stored))
      .catch(() => toast.error('プロフィールを読み込めませんでした。'))
      .finally(() => setRetrying(false));
  };
  const guest = isGuestUser(user);
  const [editOpen, setEditOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false); // false | { tab, report, initialId }
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

  // 「公開のページを見る」は公開していなくても出す（2026-11-28 オーナー「オフでも見るのボタンは表示」「押したら公開しますか？と選べるように」）。
  //   押すと、一緒に見せるもの（本棚・本のまとめ・フォロー中/フォロワー）を選ぶシートから公開し、そのままページを開く（ニックネームが無ければ、編集へ）。
  const canOpenPage = !guest && stored !== 'local';
  const openPage = (pageUrl) => {
    const href = `${pageUrl}?me=1`;
    let win = null;
    // 'noopener' を付けると開けても null が返るので付けず、開いたあとで opener を外す。
    try { win = window.open(href, '_blank'); if (win) win.opener = null; } catch { win = null; }
    // 待ったあとの window.open は端末が止めることがあるので、そのときは知らせのボタンから開く。
    if (!win) toast.show({ type: 'success', message: '公開しました。', action: { label: 'ページを開く', onClick: () => { try { const w = window.open(href, '_blank'); if (w) w.opener = null; } catch { /* ignore */ } } } });
  };
  const publishAndOpen = async () => {
    if (!String(profile.nickname || '').trim()) {
      const ok = await confirm({
        title: '公開するには、ニックネームが要ります',
        message: 'ニックネームを入れると、公開のページを見られます。',
        confirmLabel: 'ニックネームを決める',
        cancelLabel: 'キャンセル',
      });
      if (ok) setEditOpen(true);
      return;
    }
    // 本棚・本のまとめ・フォロー中/フォロワーも、ここでまとめて選んでから公開する（2026-11-28 オーナー「一気にできるように」）。
    setPublishOpen(true);
  };
  const [publishOpen, setPublishOpen] = useState(false);
  const onPublished = (saved, notes = []) => {
    setPublishOpen(false);
    onProfileSaved?.({ before: profile, after: saved });
    if (notes.length) toast.info(`${notes.join('・')}は、まだ準備ができていません。プロフィールは公開しました。`);
    openPage(profileUrl(saved.publicId));
  };

  // 「さん」は付けない（2026-11-28 オーナー）
  const name = hasProfile(profile) ? (String(profile.nickname || '').trim() || 'ニックネームなし') : 'ニックネームはまだありません';
  const status = guest ? '' : profile.isPublic
    ? '公開中'
    : '非公開';
  const followReady = followLists && typeof followLists === 'object';
  const requests = followReady ? followLists.requests.length : 0;

  return (
    <>
      {createPortal(
        <BottomSheet title="プロフィール" onClose={onClose}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {loading || retrying ? (
              <div aria-busy="true" aria-label="プロフィールを読み込み中" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                <SkeletonBlock width="64px" height="64px" radius="50%" />
                <SkeletonBlock width="40%" height="1.4em" />
              </div>
            ) : profileError ? (
              <ErrorMessage
                title="プロフィールを読み込めませんでした"
                description="通信状況を確認して、もう一度お試しください。"
                actions={[{ label: 'もう一度', onClick: retryProfile }]}
              />
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
                {/* 2 つのボタンは 1 行に入らなければ縦に積む（「プロフィール／を編集」と割れていた・2026-11-28 点検） */}
                {profile.nickname && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                  <button type="button" onClick={() => setEditOpen(true)} style={{ ...btnGhost, flex: '1 1 auto', whiteSpace: 'nowrap', gap: 'var(--space-2)' }}>
                    <Pencil size="1em" aria-hidden="true" />プロフィールを編集
                  </button>
                  {url && (
                    <button type="button" onClick={shareLink} style={{ ...btnGhost, flex: '1 1 auto', whiteSpace: 'nowrap', gap: 'var(--space-2)' }}>
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
                {/* 黙って消さない（2026-11-22 審査の点検）。つながらないときは理由ともう一度（ほかの画面と同じ ErrorMessage・2026-11-23）。 */}
                <ErrorMessage
                  title="フォローを読み込めませんでした"
                  description="通信状況を確認して、もう一度お試しください。"
                  actions={[{ label: 'もう一度', onClick: () => { setFollowLists(null); reloadFollows(); } }]}
                />
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
            {/* 本人が開いたときは ?me=1＝通報とフォローのボタンを出さない（api/_profilePage.js の SELF_Q・2026-11-25） */}
            {url ? (
              <a href={`${url}?me=1`} target="_blank" rel="noopener noreferrer" style={{ ...btnLink, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>公開のページを見る</a>
            ) : canOpenPage && !loading && !retrying && !profileError ? (
              <button type="button" onClick={publishAndOpen} style={{ ...btnLink, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>
                公開のページを見る
              </button>
            ) : null}
          </div>
        </BottomSheet>,
        document.body,
      )}
      {editOpen && (
        <Suspense fallback={null}>
          <ProfileSheet userId={user?.id || ''} onClose={() => setEditOpen(false)} onSaved={onProfileSaved} />
        </Suspense>
      )}
      {publishOpen && (
        <Suspense fallback={null}>
          <PublishSheet uid={uid} profile={profile} onClose={() => setPublishOpen(false)} onPublished={onPublished} />
        </Suspense>
      )}
      {followOpen && (
        <Suspense fallback={null}>
          <FollowSheet initialRequestCount={requests} initialTab={followOpen.tab || ''} initialReport={followOpen.report || null} initialId={followOpen.initialId || ''} onClose={() => { setFollowOpen(false); reloadFollows(); }} onAddWant={onAddWant} hasBook={hasBook} />
        </Suspense>
      )}
    </>
  );
}
