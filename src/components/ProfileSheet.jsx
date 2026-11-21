// 👤 設定の「プロフィール」のシート（2026-11-21）。ニックネーム・好きな本・おすすめの 1 行と「公開する」。
//   公開すると、リンク（SITE_URL/u/<id>）を知っている人が見られる。既定は公開しない。
//   保存は lib/profile.js（表が無ければ端末に控える＝公開はできない）。好きな本・1 行が変わったら本棚へ（onSaved）。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2 } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ProfileForm from './ProfileForm';
import ToggleSwitch from './ToggleSwitch';
import { useToast } from './Toast';
import { btnPrimary, btnPrimaryOff, btnGhost } from '../styles/ui';
import { profileUrl, normalizeProfile } from '../lib/profile';
import { saveProfileShared, useProfile } from '../hooks/useProfile';
import { toMessage } from '../lib/errors';
import { track } from '../lib/analytics';

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
  const canPublish = stored !== 'local';

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true); setError('');
    try {
      const { profile: saved, stored: where } = await saveProfileShared(userId, draft);
      track('profile_set', { from: 'settings', book: !!saved.favTitle, line: !!saved.favLine, pub: saved.isPublic });
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
      footer={<button type="button" onClick={save} disabled={!dirty || busy} aria-busy={busy || undefined} style={dirty ? btnPrimary : btnPrimaryOff}>{busy ? '保存しています…' : '保存'}</button>}
    >
      {loading ? (
        <p role="status" style={note}>読み込んでいます…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <ProfileForm value={draft} onChange={change} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--separator)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)' }}>公開する</span>
              <ToggleSwitch checked={!!draft.isPublic} onChange={() => change({ ...draft, isPublic: !draft.isPublic })} disabled={!canPublish} ariaLabel="プロフィールを公開する" />
            </div>
            <p style={note}>
              {canPublish
                ? <>オンにすると、リンクを知っている人が<br />ニックネーム・好きな本・おすすめの 1 行を見られます。<br />本棚やメモは見えません。</>
                : 'いまは公開できません。この端末にだけ保存されます。'}
            </p>
            {profile.isPublic && url && !dirty && (
              <button type="button" onClick={shareLink} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
                <Link2 size="1em" aria-hidden="true" />リンクを共有
              </button>
            )}
          </div>
          {error && <p role="alert" style={{ ...note, color: 'var(--error)' }}>{error}</p>}
        </div>
      )}
    </BottomSheet>,
    document.body,
  );
}
