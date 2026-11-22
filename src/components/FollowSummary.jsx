// 👥 設定のプロフィールの下の「フォロー中 N・フォロワー N」と届いた申し込み（2026-11-22 オーナー
//   「ここにフォロー、フォロワーが何人か見ることができて、押したら誰をフォローしているか・誰にフォローされているかがわかる。
//    フォローリクエストも表示されて yes・no 押せる感じ」）。VITE_SOCIAL のビルドだけ（AccountSettings から）。
//   数を押すとフォローのシートをそのタブで開く。届いた申し込みはその場で 承認（確かめる）・断る・「…」（通報・ブロック）。
//   いちばん下の 1 行「ID でフォローを申し込む」はシートの最初の画面（申し込む・あなたの ID）。
import { useState } from 'react';
import { MoreHorizontal, ChevronRight } from 'lucide-react';
import UserAvatar from './UserAvatar';
import ContextMenu from './ContextMenu';
import { SkeletonBlock } from './Skeleton';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { btnRow, btnLinkQuiet } from '../styles/ui';
import { respondFollow, blockUser } from '../lib/social';
import { track } from '../lib/analytics';

const SHOWN_REQUESTS = 3;
const who = (p) => (p?.nickname ? `${p.nickname}さん` : 'この人');
const plain = { background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' };
const smallBtn = { ...btnRow, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' };
const quietBtn = { ...btnLinkQuiet, minWidth: 'var(--tap-min)', padding: '0 var(--space-2)', justifyContent: 'center' };
const iconBtn = { ...plain, width: 'var(--tap-min)', height: 'var(--tap-min)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', flexShrink: 0 };
const divider = { borderTop: '1px solid var(--separator)' };

function Stat({ n, label, onClick, inset = false }) {
  return (
    <button type="button" onClick={onClick} style={{ ...plain, flex: 1, minWidth: 0, minHeight: 'var(--tap-min)', padding: inset ? 'var(--space-3) 0 var(--space-3) var(--space-4)' : 'var(--space-3) 0', display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }} aria-label={`${label} ${n ?? ''} 人`}>
      {n == null
        ? <SkeletonBlock width="2em" height="1.2em" />
        : <span style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{n}</span>}
      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>{label}</span>
    </button>
  );
}

/**
 * lists: loadFollows の lists（null＝読んでいる）。onOpen(tab) でシートを開く（tab: '' | 'following' | 'followers'）。
 * onReport(person) で通報の画面を開く。onChanged() で数え直す。
 */
export default function FollowSummary({ lists, onOpen, onReport, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState(null);
  const requests = lists?.requests || [];

  const respond = async (person, accept) => {
    if (busy) return;
    if (accept) {
      const ok = await confirm({
        title: `${who(person)}のフォローを承認しますか？`,
        message: '承認すると、この人はあなたの本棚と「この本のまとめ」を、いつでも見られます。あとでフォロワーから外せます。',
        confirmLabel: '承認する',
        cancelLabel: 'キャンセル',
      });
      if (!ok) return;
    }
    setBusy(person.publicId);
    try {
      await respondFollow(person.publicId, accept);
      track('follow_respond', { accept, from: 'settings' });
      toast.success(accept ? `${who(person)}を承認しました。` : '申し込みを断りました。');
      onChanged?.();
    } catch {
      toast.error('できませんでした。通信状況を確認してください。');
    } finally {
      setBusy('');
    }
  };

  const block = async (person) => {
    const ok = await confirm({
      title: `${who(person)}をブロックしますか？`,
      message: 'お互いのフォローが外れ、この人はあなたを見つけることも申し込むこともできなくなります。相手に知らせは届きません。',
      confirmLabel: 'ブロックする',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    try {
      if (!(await blockUser(person.publicId))) throw new Error('block failed');
      track('follow_block', { from: 'settings' });
      toast.success('ブロックしました。');
      onChanged?.();
    } catch {
      toast.error('ブロックできませんでした。通信状況を確認してください。');
    }
  };

  return (
    <>
      <div style={{ ...divider, display: 'flex' }}>
        <Stat n={lists ? lists.following.length : null} label="フォロー中" onClick={() => onOpen('following')} />
        <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: 'var(--space-3) 0', background: 'var(--separator)' }} />
        <Stat n={lists ? lists.followers.length : null} label="フォロワー" onClick={() => onOpen('followers')} inset />
      </div>
      {requests.length > 0 && (
        <section aria-label="届いた申し込み" style={{ ...divider, padding: 'var(--space-3) 0 var(--space-1)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--accent)' }}>届いた申し込み（{requests.length}）</p>
          <div role="list">
            {requests.slice(0, SHOWN_REQUESTS).map((p, i) => (
              <div role="listitem" key={p.publicId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 'var(--tap-min)', padding: 'var(--space-2) 0', ...(i ? divider : null) }}>
                <UserAvatar avatarId={p.avatar} nickname={p.nickname} size={32} />
                <span style={{ flex: 1, minWidth: 0, marginLeft: 'var(--space-1)', fontSize: 'var(--text-body)', color: 'var(--text)', overflowWrap: 'anywhere' }}>{p.nickname || 'ニックネームなし'}</span>
                <button type="button" style={quietBtn} disabled={!!busy} onClick={() => respond(p, false)}>断る</button>
                <button type="button" style={smallBtn} disabled={!!busy} aria-busy={busy === p.publicId || undefined} onClick={() => respond(p, true)}>承認</button>
                <button
                  type="button"
                  aria-label={`${who(p)}の操作`}
                  style={iconBtn}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ x: r.right, y: r.bottom, items: [
                      { label: '通報する', onClick: () => onReport(p) },
                      { label: 'ブロックする', destructive: true, onClick: () => block(p) },
                    ] });
                  }}
                >
                  <MoreHorizontal size="1.25em" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {requests.length > SHOWN_REQUESTS && (
            <button type="button" onClick={() => onOpen('')} style={{ ...plain, display: 'flex', alignItems: 'center', minHeight: 'var(--tap-min)', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--accent)' }}>
              ほかの申し込み（{requests.length - SHOWN_REQUESTS}）を見る
            </button>
          )}
        </section>
      )}
      <button type="button" onClick={() => onOpen('')} style={{ ...plain, ...divider, width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: 'var(--space-3) 0' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', color: 'var(--text)' }}>ID でフォローを申し込む</span>
        <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}
