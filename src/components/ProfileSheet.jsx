// 👤 設定の「プロフィール」のシート（2026-11-21）。ニックネーム・好きな本・おすすめの 1 行と「公開する」。
//   公開すると、リンク（SITE_URL/u/<id>）を知っている人が見られる。既定は公開しない。
//   本棚も公開する（公開するがオンのときだけ）・自己紹介（2026-11-21 2 回目）。
//   保存は lib/profile.js（表が無ければ端末に控える＝公開はできない）。好きな本・1 行が変わったら本棚へ（onSaved）。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2 } from 'lucide-react';
import { withPhraseBreaks } from './TightBubble';
import BottomSheet from './BottomSheet';
import ProfileForm from './ProfileForm';
import ToggleSwitch from './ToggleSwitch';
import { useToast } from './Toast';
import { btnPrimary, btnPrimaryOff, btnGhost } from '../styles/ui';
import { profileUrl, normalizeProfile } from '../lib/profile';
import { saveProfileShared, useProfile } from '../hooks/useProfile';
import { toMessage } from '../lib/errors';
import { profileIssues, profileIssueMessage } from '../lib/profileFilter';
import { track } from '../lib/analytics';
import { useAuth } from '../hooks/useAuth';
import { isGuestUser } from '../lib/guestAuth';
import { SOCIAL_ON } from '../lib/social';
import { supabase } from '../lib/supabase';

// 本棚の本（好きな本を選ぶ・VITE_SOCIAL）。読めなければ空。
async function loadShelfBooks(userId) {
  if (!userId || !supabase) return [];
  try {
    const { data, error } = await supabase.from('books').select('id, title, author, cover, isbn').eq('user_id', userId).order('updated_at', { ascending: false }).limit(2000);
    if (error) return [];
    return (data || []).filter((b) => String(b.title || '').trim());
  } catch { return []; }
}
// その本のメモ（好きな言葉を選ぶ）。
async function loadBookMemos(userId, book) {
  if (!userId || !book?.id || !supabase) return [];
  const { data, error } = await supabase.from('book_memos').select('id, text').eq('user_id', userId).eq('book_id', book.id).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []).filter((m) => String(m.text || '').trim());
}

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, lineBreak: 'strict' };

export default function ProfileSheet({ userId, onClose, onSaved }) {
  const { profile, stored, loading } = useProfile(userId);
  const [draft, setDraft] = useState(profile);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  useEffect(() => { if (!touched) setDraft(profile); }, [profile, touched]);
  const change = (next) => { setTouched(true); setDraft(next); };
  const dirty = JSON.stringify(normalizeProfile(draft)) !== JSON.stringify(normalizeProfile(profile));
  const url = profileUrl(profile.publicId);
  // 登録せずに始めた人は公開できない（データベースでも止める・App 審査 1.2）。
  const { user } = useAuth();
  const guest = isGuestUser(user);
  const canPublish = stored !== 'local' && !guest;
  // 本棚の公開の列がまだ無い DB（前の版の SQL だけ）では本棚は公開できない（saveProfile が shelfReady: false を返す）。
  const [shelfUnready, setShelfUnready] = useState(false);
  const [shelfBooks, setShelfBooks] = useState([]);
  useEffect(() => {
    if (!SOCIAL_ON) return undefined;
    let alive = true;
    loadShelfBooks(userId).then((list) => { if (alive) setShelfBooks(list); });
    return () => { alive = false; };
  }, [userId]);

  const save = async () => {
    if (!dirty || busy) return;
    // 公開に向かない言葉・連絡先は保存の前に止める（App 審査 1.2・lib/profileFilter.js）。
    const issue = profileIssueMessage(profileIssues(draft));
    if (issue) { setError(issue); return; }
    setBusy(true); setError('');
    try {
      const { profile: saved, stored: where, shelfReady } = await saveProfileShared(userId, draft);
      if (shelfReady === false && draft.shelfPublic) { setShelfUnready(true); setTouched(false); setError('本棚の公開は、まだ準備ができていません。ほかの内容は保存しました。'); setBusy(false); return; }
      track('profile_set', { from: 'settings', book: !!saved.favTitle, line: !!saved.favLine, pub: saved.isPublic, shelf: saved.isPublic && saved.shelfPublic, bio: !!saved.bio });
      onSaved?.({ before: profile, after: saved });
      if (where === 'local') toast.info('この端末に保存しました。公開はまだできません。');
      setTouched(false);
      onClose();
    } catch (e) {
      setError(toMessage(e, '保存できませんでした。通信状況を確認して、もう一度お試しください。'));
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    if (!url) return;
    track('profile_link', {});
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share({ url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success('リンクをコピーしました。');
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error('リンクを共有できませんでした。');
    }
  };

  return createPortal(
    <BottomSheet
      title="プロフィール"
      onClose={onClose}
      dismissLabel="キャンセル"
      layer="dialog"
      footer={(
        // 保存できなかった理由は保存のボタンのすぐ上に（シートの下まで送らなくても見える・2026-11-21 確認で）。
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {error && <p role="alert" style={{ ...note, color: 'var(--error)' }}>{error}</p>}
          <button type="button" onClick={save} disabled={!dirty || busy} aria-busy={busy || undefined} style={dirty ? btnPrimary : btnPrimaryOff}>{busy ? '保存しています…' : '保存'}</button>
        </div>
      )}
    >
      {loading ? (
        <p role="status" style={note}>読み込んでいます…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <ProfileForm value={draft} onChange={change} showBio showAvatar fromShelf={SOCIAL_ON} shelfBooks={shelfBooks} loadMemos={(book) => loadBookMemos(userId, book)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--separator)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)' }}>公開する</span>
              <ToggleSwitch checked={!!draft.isPublic} onChange={() => change({ ...draft, isPublic: !draft.isPublic, shelfPublic: draft.isPublic ? false : draft.shelfPublic, summaryPublic: draft.isPublic ? false : draft.summaryPublic })} disabled={!canPublish} ariaLabel="プロフィールを公開する" />
            </div>
            <p style={note}>
              {canPublish
                ? <>オンにすると、リンクを知っている人が<br />ニックネーム・自己紹介・好きな本を見られます。<br />メモは見えません。</>
                : guest ? 'アカウントを作ると公開できます（設定のいちばん上から）。' : 'いまは公開できません。この端末にだけ保存されます。'}
            </p>
            {/* 本棚も公開する（2026-11-21・公開するがオンのときだけ押せる・メモは出さない）。 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-body)', color: draft.isPublic ? 'var(--text)' : 'var(--text-3)' }}>本棚も公開する</span>
              <ToggleSwitch checked={!!draft.isPublic && !!draft.shelfPublic} onChange={() => change({ ...draft, shelfPublic: !draft.shelfPublic, summaryPublic: draft.shelfPublic ? false : draft.summaryPublic })} disabled={!canPublish || !draft.isPublic || shelfUnready} ariaLabel="本棚も公開する" />
            </div>
            <p style={note}>
              {shelfUnready
                ? 'いまは本棚を公開できません。'
                : <>本の書名・表紙・状態・評価も見せます。<br />見せたくない本は、本の詳細の「…」から外せます。</>}
            </p>
            {SOCIAL_ON && (
              <>
                {/* 本のまとめも公開する（2026-11-21 3 回目・既定オフ・本棚も公開するのオンが前提）。 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-body)', color: draft.isPublic && draft.shelfPublic ? 'var(--text)' : 'var(--text-3)' }}>本のまとめも公開する</span>
                  <ToggleSwitch checked={!!draft.isPublic && !!draft.shelfPublic && !!draft.summaryPublic} onChange={() => change({ ...draft, summaryPublic: !draft.summaryPublic })} disabled={!canPublish || !draft.isPublic || !draft.shelfPublic || shelfUnready} ariaLabel="本のまとめも公開する" />
                </div>
                <p style={note}>本を押すと、あなたの「この本のまとめ」を読めます。<br />メモの一覧は見せません。</p>
                {/* 公開の切り替えとは別に、承認したフォロワーには見えることを書いておく（App 審査 5.1.1・2026-11-22）。 */}
                <p style={{ ...note, marginTop: 'var(--space-2)' }}>{withPhraseBreaks('フォローを承認した人は、公開の切り替えにかかわらず、本棚と「この本のまとめ」を見られます。')}</p>
              </>
            )}
            {profile.isPublic && url && !dirty && (
              <button type="button" onClick={shareLink} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
                <Link2 size="1em" aria-hidden="true" />リンクを共有
              </button>
            )}
          </div>
        </div>
      )}
    </BottomSheet>,
    document.body,
  );
}
