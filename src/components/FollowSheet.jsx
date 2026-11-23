// 👥 フォローのシート（2026-11-21 オーナー「フォロー、フォロワーにすることができるようにして、フォロー認証をされたら常に見ることができるように」）。
//   設定の「フォロー」の行と、相手のリンク（/?follow=<id>）から開く。VITE_SOCIAL のビルドだけ（lib/social.js）。
//   1 つのシートの中で 3 つの画面を行き来する: 一覧（申し込む・フォロー中・フォロワー・申し込み）→ 相手の本棚 → 本（まとめ・読みたいに追加）。
//   相手を探す欄は「リンクか ID」だけ（名前で探さない）。承認の前に「本棚とこの本のまとめをいつでも見られます」と確かめる。
//   ブロック・通報は相手の本棚・フォロワー・届いた申し込み・ID で見つけた人の行の「…」から（App 審査 1.2）。
//   通報は理由をえらぶ画面で受け、届いたかを確かめて知らせる（あわせてブロックもできる・2026-11-22）。
//   相手の本棚の上の「フォロー中 N」「フォロワー N」→ その人のつながりの画面（その場でフォロー・承認済みならその人の本棚へ・
//   2026-11-23）。自分の一覧を見せるかは一覧の下のスイッチ（オフ＝見せない・ほかの人の一覧にも出ない）。
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, ChevronLeft, ChevronRight, Check, Share } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ContextMenu from './ContextMenu';
import ToggleSwitch from './ToggleSwitch';
import UserAvatar from './UserAvatar';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLink, btnLinkQuiet, btnRow, btnTonal, input as inputBase, groupTitle, segTrack, segOption, scrollFade } from '../styles/ui';
import { Chip } from './formPrimitives';
import MiniCover from './MiniCover';
import AdvisorStoreLinks from './AdvisorStoreLinks';
import { STORE_DISCLOSURE_TEXT } from '../lib/rakutenLink';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import {
  publicIdFrom, previewProfile, requestFollow, followResultMessage, loadFollows, respondFollow, removeFollow,
  blockUser, unblockUser, reportProfile, loadFolloweeShelf, SHELF_ORDER, myIdShareText, summaryExcerpt,
  REPORT_REASONS, reportReasonText, loadFolloweeConnections, withRelation, setFollowsVisible,
} from '../lib/social';
import { track } from '../lib/analytics';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';

// ニックネームが無いと申し込めない・申し込まれない（supabase_follows.sql の no_profile）ので、その場でプロフィールを開く。
const ProfileSheet = lazy(() => import('./ProfileSheet'));

const STATUS_LABEL = { reading: '読書中', done: '読了', before: '積読', want: '読みたい' };
const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, lineBreak: 'strict', textWrap: 'pretty', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
// 一覧の行: 区切り線は 2 行目から（DESIGN §5 一覧の行）。
const row = (first) => ({ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: 'var(--space-2) 0', borderTop: first ? 'none' : '1px solid var(--separator)' });
const nameStyle = { flex: 1, minWidth: 0, fontSize: 'var(--text-body)', color: 'var(--text)', overflowWrap: 'anywhere' };
const plainBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' };
// 一覧の行の主ボタン（承認・申し込む）は btnRow の形に塗り（15/600・高さ 44）。
const smallBtn = { ...btnRow, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' };
// 行の中の文字ボタン（断る・取り消す・ブロックを外す）は横も 44 以上。
const rowLink = { ...btnLinkQuiet, minWidth: 'var(--tap-min)', padding: '0 var(--space-2)', justifyContent: 'center' };
const iconBtn = { ...plainBtn, width: 'var(--tap-min)', height: 'var(--tap-min)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', flexShrink: 0 };

// 3 つの画面を行き来してもシートの高さが跳ねないように、中身の高さの下限をそろえる。
const sheetBody = { minHeight: 'min(64vh, 600px)' };

// 自分の本棚にもある本の小さな印（塗らない・--text-2）。
const OwnedMark = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-caption)', color: 'var(--text-2)', lineHeight: 1.5 }}>
    <Check size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)' }} />本棚にあります
  </span>
);
// 書名の頭の全角の英数字（「７つの習慣」）は、表示のときだけ半角に（左端が半字ずれないように）。
const shownTitle = (t) => String(t || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

const who = (p) => (p?.nickname ? `${p.nickname}さん` : 'この人');

const Cover = ({ book, width = 72 }) => <MiniCover title={shownTitle(book.title)} cover={book.cover} width={width} />;

function PersonRow({ person, children, onOpen, first = false }) {
  const body = (
    <>
      <UserAvatar avatarId={person.avatar} nickname={person.nickname} size={40} />
      <span style={nameStyle}>{person.nickname || 'ニックネームなし'}</span>
      {onOpen && !children && <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
    </>
  );
  return (
    <div role="listitem" style={row(first)}>
      {onOpen
        ? <button type="button" onClick={onOpen} style={{ ...plainBtn, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)' }}>{body}</button>
        : <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>{body}</span>}
      {children}
    </div>
  );
}

// 相手のフォロー中・フォロワーの数（押すとその一覧・2026-11-23）。読んでいる間は同じ高さの形、隠している・見られないときは出さない。
function ConnCounts({ conn, onOpen }) {
  if (conn === 'loading') return <SkeletonBlock height="var(--tap-min)" style={{ width: '60%', marginTop: 'var(--space-2)' }} />;
  if (!conn || typeof conn !== 'object' || !conn.visible) return null;
  const item = (tab, n, label) => (
    <button type="button" onClick={() => onOpen(tab)} aria-label={`${label} ${n} 人を見る`} style={{ ...plainBtn, display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-1)', minHeight: 'var(--tap-min)' }}>
      <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>{label}</span>
    </button>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-6)', marginTop: 'var(--space-1)', marginBottom: 'calc((1.5em - var(--tap-min)) / 2)' }}>
      {item('following', conn.following.length, 'フォロー中')}
      {item('followers', conn.followers.length, 'フォロワー')}
    </div>
  );
}

// 🗄 人の本棚（2026-11-22 オーナー「もう少し本棚感を出したい・絞り込みもつけたい」・公開のページ api/_profilePage.js と同じ形）。
//   棚（--fill の面）に表紙を 4 冊ずつ下をそろえて立て、行ごとに棚板（--separator の 8 の線）。書名は表紙と読み上げに任せる。
//   まとめのある本は上から少しはみ出す栞（--accent）、自分の本棚にもある本は左上に小さな印。上のチップで状態・まとめありに絞る。
//   「すべて」は状態ごとの棚に 8 冊まで＋「〈状態〉をすべて見る」。
const SHELF_ROW = 4;
const SHELF_PREVIEW = 8;
const shelfCase = { marginTop: 'var(--space-3)', paddingTop: 'var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)', overflow: 'hidden' };
const shelfRow = (first) => ({ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', margin: first ? 0 : 'var(--space-4) 0 0', padding: '0 var(--space-3)', borderBottom: 'var(--space-2) solid var(--shelf-plank)' });

function ShelfCase({ books, onOpen, hasBook }) {
  const rows = [];
  for (let i = 0; i < books.length; i += SHELF_ROW) rows.push(books.slice(i, i + SHELF_ROW));
  return (
    <div style={shelfCase}>
      {rows.map((r, ri) => (
        <div role="list" key={ri} style={shelfRow(ri === 0)}>
          {r.map((b) => {
            const owned = hasBook?.(b);
            return (
              <div role="listitem" key={b.id} style={{ position: 'relative', flex: '0 0 calc((100% - 3 * var(--space-2)) / 4)', minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => onOpen(b)}
                  style={{ ...plainBtn, display: 'block', width: '100%' }}
                  aria-label={`${b.title}${b.author ? `・${b.author}` : ''}・${STATUS_LABEL[b.status]}${b.rating ? `・評価 ${b.rating}` : ''}${b.summary ? '・まとめあり' : ''}${owned ? '・あなたの本棚にあります' : ''}`}
                >
                  <MiniCover title={shownTitle(b.title)} cover={b.cover} width="100%" />
                </button>
                {b.summary && <span aria-hidden="true" style={{ position: 'absolute', top: 'calc(-1 * var(--space-2))', right: 'var(--space-2)', width: 'var(--space-2)', height: 'var(--space-6)', background: 'var(--accent)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)' }} />}
                {owned && (
                  <span aria-hidden="true" style={{ position: 'absolute', left: 'var(--space-1)', top: 'var(--space-1)', width: '1.5em', height: '1.5em', borderRadius: '50%', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--separator)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontSize: 'var(--text-meta)' }}>
                    <Check size="1em" strokeWidth={2.5} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ShelfView({ books, filter, onFilter, onOpen, hasBook }) {
  const groups = SHELF_ORDER.map((st) => ({ id: st, label: STATUS_LABEL[st], books: books.filter((b) => b.status === st) })).filter((g) => g.books.length);
  const summaryCount = books.filter((b) => b.summary).length;
  const chips = [
    { id: '', label: 'すべて', n: books.length },
    ...groups.map((g) => ({ id: g.id, label: g.label, n: g.books.length })),
    ...(summaryCount ? [{ id: 'summary', label: 'まとめあり', n: summaryCount }] : []),
  ];
  const current = chips.some((c) => c.id === filter) ? filter : '';
  const owned = books.some((b) => hasBook?.(b));
  return (
    <>
      <div role="radiogroup" aria-label="本棚を絞る" style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', margin: 'var(--space-3) calc(-1 * var(--space-4)) 0', padding: '0 var(--space-4)', scrollbarWidth: 'none', ...scrollFade }}>
        {chips.map((c) => (
          <Chip key={c.id || 'all'} size="select" role="radio" aria-checked={current === c.id} active={current === c.id} onClick={() => onFilter(c.id)}>
            {c.label}<span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: current === c.id ? 'var(--accent)' : 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{c.n}</span>
          </Chip>
        ))}
      </div>
      {current === ''
        ? groups.map((g) => (
          <section key={g.id} style={{ marginTop: 'var(--space-6)' }}>
            <p style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', margin: 0, fontSize: 'var(--text-body)', fontWeight: 600 }}>
              {g.label}<span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)' }}>{g.books.length} 冊</span>
            </p>
            <ShelfCase books={g.books.slice(0, SHELF_PREVIEW)} onOpen={onOpen} hasBook={hasBook} />
            {g.books.length > SHELF_PREVIEW && (
              <button type="button" onClick={() => onFilter(g.id)} style={{ ...btnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>{g.label}をすべて見る（{g.books.length} 冊）</button>
            )}
          </section>
        ))
        : <ShelfCase books={current === 'summary' ? books.filter((b) => b.summary) : books.filter((b) => b.status === current)} onOpen={onOpen} hasBook={hasBook} />}
      {(summaryCount > 0 || owned) && (
        <p style={{ ...note, marginTop: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-4)', rowGap: 'var(--space-1)' }}>
          {summaryCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}><span aria-hidden="true" style={{ width: 'var(--space-2)', height: 'var(--space-3)', background: 'var(--accent)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)' }} />まとめあり</span>}
          {owned && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}><Check size="1em" aria-hidden="true" />あなたの本棚にもある本</span>}
        </p>
      )}
    </>
  );
}

// initialTab: 'following' | 'followers' | 'requests'（設定のプロフィールの「フォロー中 N」「フォロワー N」から開く・2026-11-22）
// initialReport: その人の通報の画面から開く（設定の届いた申し込みの「…」→「通報する」・戻ると一覧）
export default function FollowSheet({ onClose, initialId = '', onAddWant, initialRequestCount = 0, hasBook, initialTab = '', initialReport = null }) {
  const toast = useToast();
  const { user } = useAuth();
  const { profile: me, loading: meLoading } = useProfile(user?.id || '');
  const [profileOpen, setProfileOpen] = useState(false);
  const meReady = !!(me?.publicId && me?.nickname);
  const confirm = useConfirm();
  const inputId = useId();
  const [lists, setLists] = useState(null); // null＝読み込み中
  const [notReady, setNotReady] = useState(false);
  const [tab, setTab] = useState(initialTab || 'following');
  const [text, setText] = useState(initialId);
  const [preview, setPreview] = useState(null); // { person } | { missing: true }
  const [checking, setChecking] = useState(false);
  const [view, setView] = useState(initialReport ? { name: 'report', person: initialReport, back: { name: 'home' } } : initialTab ? { name: 'list' } : { name: 'home' }); // home | list | person { person, back } | conn { person, tab, back } | book { person, book, back } | report
  const [shelf, setShelf] = useState(null); // { profile, books } | 'loading' | 'none'
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [wantState, setWantState] = useState({});
  const [shelfFilter, setShelfFilter] = useState(''); // '' | 状態 | 'summary'
  const [reportForm, setReportForm] = useState({ reason: '', detail: '', alsoBlock: false, busy: false, failed: false });
  // 相手のフォロー中・フォロワー（public_id → { visible, following, followers } | 'loading' | 'none'）と、自分の一覧を見せるか。
  const [conns, setConns] = useState({});
  const [followsVisible, setFollowsVisibleState] = useState(true);
  const [visibleBusy, setVisibleBusy] = useState(false);
  // 画面（一覧 → 本棚 → 本）を移ったら、シートの中をいちばん上へ（下の本を押して開いた本が途中から見えないように）。
  const bodyRef = useRef(null);
  const viewKey = view.name === 'book' ? `b:${view.book.id}` : view.name === 'report' ? `r:${view.person.publicId}`
    : view.name === 'person' || view.name === 'conn' ? `${view.name}:${view.person.publicId}` : view.name;
  useEffect(() => {
    let el = bodyRef.current?.parentElement;
    while (el && el !== document.body) {
      if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { el.scrollTop = 0; break; }
      el = el.parentElement;
    }
  }, [viewKey]); // 本の id → 'busy' | 'added' | 'exists' | 'error'
  const addWant = async (book) => {
    if (!onAddWant || wantState[book.id] === 'busy') return;
    setWantState((m) => ({ ...m, [book.id]: 'busy' }));
    const r = await Promise.resolve(onAddWant(book)).catch(() => 'error');
    setWantState((m) => ({ ...m, [book.id]: r || 'added' }));
  };

  const reload = useCallback(async () => {
    try {
      const r = await loadFollows();
      if (!r.ok) { setNotReady(true); setLists({ following: [], followers: [], requests: [], sent: [], blocked: [] }); return; }
      setLists(r.lists);
      setFollowsVisibleState(r.followsVisible);
    } catch {
      setLists((prev) => prev || { following: [], followers: [], requests: [], sent: [], blocked: [] });
      toast.error('フォローの一覧を読めませんでした。通信状況を確認してください。');
    }
  }, [toast]);
  useEffect(() => { reload(); }, [reload]);
  // フォロー中が無く、送った申し込みだけあるときは「申し込み中」から（届いた申し込みはタブの外のいちばん上）。
  const firstTabRef = useRef(false);
  useEffect(() => {
    if (!lists || firstTabRef.current) return;
    firstTabRef.current = true;
    if (initialTab) return;
    if (!lists.following.length && lists.sent.length) setTab('requests');
  }, [lists]);

  const check = async (raw = text) => {
    const id = publicIdFrom(raw);
    if (!id) { setPreview({ missing: true }); return; }
    setChecking(true);
    try {
      const p = await previewProfile(id);
      if (p?.notReady) { setNotReady(true); setPreview(null); return; }
      setPreview(p ? { person: p } : { missing: true });
    } catch {
      toast.error('確かめられませんでした。通信状況を確認してください。');
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => { if (initialId) check(initialId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async (person) => {
    try {
      const result = await requestFollow(person.publicId);
      track('follow_request', { result });
      if (result === 'pending' || result === 'accepted') {
        toast.success(followResultMessage(result));
        setPreview((pv) => (pv?.person?.publicId === person.publicId ? { person: { ...person, relation: result } } : pv));
        // 相手のつながりの画面でフォローしたときも、その行をすぐ「承認を待っています」に。
        setConns((m) => Object.fromEntries(Object.entries(m).map(([k, c]) => [k, withRelation(c, person.publicId, result)])));
        if (result === 'pending') setTab('requests');
        reload();
      } else if (result === 'no_profile') {
        toast.error(followResultMessage(result));
        setProfileOpen(true);
      } else {
        toast.error(followResultMessage(result));
      }
    } catch {
      toast.error(followResultMessage(''));
    }
  };

  const respond = async (person, accept) => {
    if (accept) {
      const ok = await confirm({
        title: `${who(person)}のフォローを承認しますか？`,
        message: followsVisible
          ? '承認すると、この人はあなたの本棚と「この本のまとめ」、フォロー中・フォロワーの一覧を、いつでも見られます。あとでフォロワーから外せます。'
          : '承認すると、この人はあなたの本棚と「この本のまとめ」を、いつでも見られます。あとでフォロワーから外せます。',
        confirmLabel: '承認する',
        cancelLabel: 'キャンセル',
      });
      if (!ok) return;
    }
    try {
      const r = await respondFollow(person.publicId, accept);
      // 答えを確かめてから知らせる（相手が取り消した・使えないときに「承認しました」と言わない・2026-11-22）
      if (r !== 'accepted' && r !== 'declined') {
        toast.error(r === 'not_found' ? 'この申し込みは取り消されたようです。' : 'できませんでした。通信状況を確認してください。');
        reload();
        return;
      }
      track('follow_respond', { accept });
      toast.success(accept ? `${who(person)}を承認しました。` : '申し込みを断りました。');
      reload();
    } catch {
      toast.error('できませんでした。通信状況を確認してください。');
    }
  };

  const remove = async (person, as) => {
    const ok = await confirm({
      title: as === 'follower' ? `${who(person)}をフォロワーから外しますか？` : `${who(person)}のフォローをやめますか？`,
      message: as === 'follower' ? 'この人は、あなたの本棚を見られなくなります。相手に知らせは届きません。' : 'この人の本棚を見られなくなります。もう一度見るには、申し込み直して承認してもらいます。',
      confirmLabel: as === 'follower' ? '外す' : 'やめる',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    try {
      if (!(await removeFollow(person.publicId, as))) throw new Error('remove failed');
      if (view.name !== 'home' && view.name !== 'list') setView(rootOf(view));
      reload();
    } catch {
      toast.error('できませんでした。通信状況を確認してください。');
    }
  };

  const block = async (person, { quiet = false } = {}) => {
    const ok = quiet || await confirm({
      title: `${who(person)}をブロックしますか？`,
      message: 'お互いのフォローが外れ、この人はあなたを見つけることもフォローすることもできなくなります。相手に知らせは届きません。',
      confirmLabel: 'ブロックする',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return false;
    try {
      const done = await blockUser(person.publicId);
      if (!done) throw new Error('block failed');
      track('follow_block', {});
      if (!quiet) toast.success('ブロックしました。');
      setView({ name: 'home' }); setPreview(null);
      reload();
      return true;
    } catch {
      if (!quiet) toast.error('ブロックできませんでした。通信状況を確認してください。');
      return false;
    }
  };

  // 通報は理由をえらぶ画面へ（戻り先を覚えておく）。
  const report = (person) => {
    setReportForm({ reason: '', detail: '', alsoBlock: false, busy: false, failed: false });
    setView((v) => ({ name: 'report', person, back: v }));
  };
  // 設定の届いた申し込みの「…」から通報の画面だけを開いたときは、戻る・送ったあとはシートを閉じて設定へ（2026-11-22）。
  const leaveReport = (back) => {
    if (initialReport) { onClose(); return; }
    setView(back && back.name !== 'report' ? back : { name: 'home' });
  };
  const sendReport = async () => {
    if (view.name !== 'report' || !reportForm.reason || reportForm.busy) return;
    const { person, back } = view;
    setReportForm((f) => ({ ...f, busy: true, failed: false }));
    const result = await reportProfile(person.publicId, reportReasonText(reportForm.reason, reportForm.detail));
    track('follow_report', { reason: reportForm.reason, block: reportForm.alsoBlock });
    if (result !== 'ok') { setReportForm((f) => ({ ...f, busy: false, failed: result === 'rejected' ? 'rejected' : 'network' })); return; }
    if (reportForm.alsoBlock) {
      // 通報は済んでいるので、ブロックだけできなかったときも画面を戻す（もう一度押して二重に通報しないように）。
      if (await block(person, { quiet: true })) { toast.success('通報して、ブロックしました。'); if (initialReport) onClose(); return; }
      toast.error('通報は受け付けました。ブロックはできませんでした。');
      leaveReport(back);
      return;
    }
    toast.success('通報を受け付けました。');
    leaveReport(back);
  };

  const shareMyId = async () => {
    const { text, url } = myIdShareText(me);
    if (!text) return;
    track('follow_share_id', { public: !!url });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share(url ? { text, url } : { text }); return; }
      await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
      toast.success(url ? 'リンクをコピーしました。' : 'ID をコピーしました。');
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error('共有できませんでした。');
    }
  };

  const unblock = async (person) => {
    try {
      if (!(await unblockUser(person.publicId))) throw new Error('unblock failed');
      toast.success(`${who(person)}のブロックを外しました。`);
    } catch {
      toast.error('できませんでした。通信状況を確認してください。');
    }
    reload();
  };

  // 人の本棚から戻る先は、開いた画面（一覧・相手のつながり）。いちばん元（一覧かはじめの画面）は rootOf。
  const rootOf = (v) => {
    let cur = v;
    while (cur && cur.name !== 'home' && cur.name !== 'list') cur = cur.back;
    return cur || { name: 'home' };
  };
  const personReqRef = useRef(0);
  const shelfCacheRef = useRef(new Map());
  const loadConns = async (person, { force = false } = {}) => {
    const id = person.publicId;
    if (!force && conns[id] && conns[id] !== 'none') return;
    setConns((m) => ({ ...m, [id]: m[id] && m[id] !== 'none' ? m[id] : 'loading' }));
    try {
      const c = await loadFolloweeConnections(id);
      setConns((m) => ({ ...m, [id]: c || 'none' }));
    } catch {
      setConns((m) => ({ ...m, [id]: 'none' }));
    }
  };
  const openPerson = async (person, back = view) => {
    const req = personReqRef.current + 1;
    personReqRef.current = req;
    const from = back && (back.name === 'list' || back.name === 'conn' || back.name === 'home') ? back : { name: 'home' };
    setView({ name: 'person', person, back: from });
    setShelfFilter('');
    loadConns(person);
    const cached = shelfCacheRef.current.get(person.publicId);
    setShelf(cached || 'loading');
    try {
      const s = await loadFolloweeShelf(person.publicId);
      if (s) shelfCacheRef.current.set(person.publicId, s);
      if (personReqRef.current === req) setShelf(s || 'none'); // 別の人を開き直していたら、古い答えは捨てる
    } catch {
      if (personReqRef.current === req && !cached) setShelf('none');
    }
  };
  // 相手のつながりから戻るときは、その人の本棚を開き直す（間に別の人の本棚を見ていても、元の人の本棚に戻る）。
  const backFromConn = (v) => openPerson(v.person, v.back?.back || { name: 'home' });

  // 自分の一覧を見せるか（すぐ切り替え・できなければ戻す）。
  const toggleVisible = async () => {
    if (visibleBusy) return;
    const next = !followsVisible;
    setFollowsVisibleState(next);
    setVisibleBusy(true);
    try {
      const r = await setFollowsVisible(next);
      if (r !== 'ok') {
        setFollowsVisibleState(!next);
        toast.error(r === 'no_profile' ? '先にプロフィールでニックネームを決めてください。' : '切り替えられませんでした。少し時間をおいてお試しください。');
      } else {
        track('follow_lists_visible', { on: next });
      }
    } catch {
      setFollowsVisibleState(!next);
      toast.error('切り替えられませんでした。通信状況を確認してください。');
    } finally {
      setVisibleBusy(false);
    }
  };

  const openMenu = (e, items) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.right, y: r.bottom, items });
  };

  const profileSheet = profileOpen && (
    <Suspense fallback={null}>
      <ProfileSheet userId={user?.id || ''} onClose={() => setProfileOpen(false)} />
    </Suspense>
  );

  // まとめの行（表紙・書名・まとめの出だし 3 行・押すと本へ）。相手の考えがいちばん伝わるので本棚の上に置く。
  const SummaryRows = ({ person, books }) => (
    <div role="list">
      {books.map((b, i) => (
        <div role="listitem" key={b.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--separator)' }}>
          <button type="button" onClick={() => setView((v) => ({ name: 'book', person, book: b, back: v.name === 'book' ? v.back : v }))} style={{ ...plainBtn, width: '100%', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', padding: 'var(--space-4) 0' }}>
            <MiniCover title={shownTitle(b.title)} cover={b.cover} width={48} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(shownTitle(b.title), { scriptBreaks: true })}</span>
              <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 'var(--space-1)', fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.7, color: 'var(--text)', lineBreak: 'strict', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(summaryExcerpt(b.summary))}</span>
            </span>
          </button>
        </div>
      ))}
    </div>
  );

  // ─── 通報（理由をえらぶ・任意で書き足す・あわせてブロック） ───
  // 決める入口は下の「通報する」1 つ（右上は「キャンセル」）。送れた知らせはシートの上に出る（--z-toast）。
  if (view.name === 'report') {
    const { person, back } = view;
    const f = reportForm;
    const errText = f.failed === 'rejected'
      ? '通報を受け付けられませんでした。時間をおいて、もう一度送ってください。'
      : '通報を送れませんでした。通信状況を確認して、もう一度お試しください。';
    const footer = (
      <>
        {f.failed && <p role="alert" style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sub)', color: 'var(--error)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(errText)}</p>}
        {!f.reason && !f.failed && <p style={{ ...note, margin: '0 0 var(--space-2)', textAlign: 'center' }}>理由をえらんでください。</p>}
        <button type="button" onClick={sendReport} disabled={!f.reason || f.busy} aria-busy={f.busy || undefined} style={f.reason ? btnPrimary : btnPrimaryOff}>
          {f.busy ? '送っています…' : '通報する'}
        </button>
      </>
    );
    return createPortal(
      <BottomSheet title={`${who(person)}を通報`} onClose={onClose} layer="dialog" dismissLabel="キャンセル" footer={footer}>
        <div ref={bodyRef} style={sheetBody}>
        <button type="button" disabled={f.busy} onClick={() => leaveReport(back)} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
          <ChevronLeft size="1.1em" aria-hidden="true" />戻る
        </button>
        <p style={{ ...note, marginTop: 'var(--space-2)' }}>{withPhraseBreaks('運営が 24 時間以内に確かめ、利用規約に反する内容は表示を止めます。通報したことは相手に知らせません。')}</p>
        <p id={`${inputId}-why`} style={{ ...groupTitle, margin: 'var(--space-6) 0 var(--space-2)' }}>理由</p>
        <div role="radiogroup" aria-labelledby={`${inputId}-why`} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {REPORT_REASONS.map((r) => (
            <Chip key={r.id} size="select" role="radio" aria-checked={f.reason === r.id} active={f.reason === r.id} onClick={() => setReportForm((x) => ({ ...x, reason: r.id, failed: false }))}>
              {r.label}
            </Chip>
          ))}
        </div>
        <label htmlFor={`${inputId}-detail`} style={{ ...groupTitle, display: 'block', margin: 'var(--space-6) 0 var(--space-2)' }}>くわしく（任意）</label>
        <textarea
          id={`${inputId}-detail`}
          value={f.detail}
          onChange={(e) => setReportForm((x) => ({ ...x, detail: e.target.value }))}
          maxLength={400}
          rows={3}
          placeholder="例：自己紹介に、ほかのサービスへの誘いがある"
          style={{ ...inputBase, minHeight: 'calc(3 * 1.5em + var(--space-6))', lineHeight: 1.5, resize: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <span id={`${inputId}-blk`} style={{ fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5 }}>あわせてブロックする</span>
          <ToggleSwitch checked={f.alsoBlock} onChange={() => setReportForm((x) => ({ ...x, alsoBlock: !x.alsoBlock }))} ariaLabel="あわせてブロックする" />
        </div>
        <p style={note}>{withPhraseBreaks('お互いのフォローが外れ、申し込みも届かなくなります。')}</p>
        </div>
      </BottomSheet>,
      document.body,
    );
  }

  // ─── 相手の本（まとめ・読みたいに追加・本屋で見る） ───
  if (view.name === 'book') {
    const { person, book } = view;
    const st = wantState[book.id] || (hasBook?.(book) ? 'exists' : undefined);
    const loaded = shelf && typeof shelf === 'object' ? shelf : null;
    const others = (loaded?.books || []).filter((b) => b.summary && b.id !== book.id).slice(0, 3);
    return createPortal(
      <BottomSheet title={`${who(person)}の本棚`} onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
        {/* 相手の文（まとめ）を読む画面にも「…」（通報・ブロック・App 審査 1.2・2026-11-22） */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => setView(view.back?.name === 'person' ? view.back : { name: 'person', person, back: { name: 'home' } })} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
            <ChevronLeft size="1.1em" aria-hidden="true" />{who(person)}の本棚
          </button>
          <button
            type="button"
            aria-label={`${who(person)}の操作`}
            style={iconBtn}
            onClick={(e) => openMenu(e, [
              { label: 'フォローをやめる', onClick: () => remove(person, 'following') },
              { label: '通報する', onClick: () => report(person) },
              { label: 'ブロックする', destructive: true, onClick: () => block(person) },
            ])}
          >
            <MoreHorizontal size="1.25em" aria-hidden="true" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', marginTop: 'var(--space-3)' }}>
          <Cover book={book} width={96} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{withPhraseBreaks(shownTitle(book.title), { scriptBreaks: true })}</p>
            {book.author && <p style={{ ...note, marginTop: 'var(--space-1)', fontSize: 'var(--text-body)' }}>{book.author}</p>}
            <p style={{ ...note, marginTop: 'var(--space-2)' }}>{STATUS_LABEL[book.status]}{book.rating ? <span style={{ color: 'var(--accent)' }}>{'　'}{'★'.repeat(book.rating)}</span> : null}</p>
            {st === 'exists' && <p style={{ margin: 'var(--space-1) 0 0' }}><OwnedMark /></p>}
          </div>
        </div>
        {/* 主役はこの人のまとめ。無ければ見出しを出さず 1 行だけ。 */}
        {book.summary ? (
          <section style={{ marginTop: 'var(--space-8)' }}>
            <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.4 }}>{who(person)}の、この本のまとめ</p>
            <p style={{ margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.8, whiteSpace: 'pre-line', lineBreak: 'strict', textWrap: 'pretty' }}>{book.summary}</p>
          </section>
        ) : (
          <p style={{ ...note, marginTop: 'var(--space-6)', fontSize: 'var(--text-sub)' }}>まとめはまだありません。</p>
        )}
        {st === 'added' ? (
          <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 'var(--btn-h)', margin: 'var(--space-8) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>
            <Check size="1.1em" aria-hidden="true" style={{ color: 'var(--success)' }} />読みたいに追加しました
          </p>
        ) : st !== 'exists' && (
          <>
            <button type="button" onClick={() => addWant(book)} disabled={st === 'busy'} aria-busy={st === 'busy' || undefined} style={{ ...btnPrimary, marginTop: 'var(--space-8)' }}>
              {st === 'busy' ? '入れています…' : '読みたいに追加'}
            </button>
            {st === 'error' && <p role="alert" style={{ ...note, marginTop: 'var(--space-2)' }}>入れられませんでした。もう一度お試しください。</p>}
          </>
        )}
        {/* 本屋で見る（AI 選書と同じ控えめな文字リンク・開示の文は下に 1 回）。 */}
        <div style={{ marginTop: st === 'exists' ? 'var(--space-4)' : 'var(--space-3)' }}>
          <AdvisorStoreLinks book={book} />
        </div>
        {others.length > 0 && (
          <section style={{ marginTop: 'var(--space-8)' }}>
            <p style={{ ...groupTitle, margin: '0 0 var(--space-1)' }}>{who(person)}の、ほかのまとめ</p>
            <SummaryRows person={person} books={others} />
          </section>
        )}
        <p style={{ ...note, marginTop: 'var(--space-8)', color: 'var(--text-3)' }}>{withPhraseBreaks(STORE_DISCLOSURE_TEXT)}</p>
        </div>
      </BottomSheet>,
      document.body,
    );
  }

  // ─── 相手のフォロー中・フォロワー（その場でフォロー・承認済みの人は本棚へ・2026-11-23） ───
  if (view.name === 'conn') {
    const { person, tab: ctab } = view;
    const c = conns[person.publicId];
    const loaded = c && typeof c === 'object' ? c : null;
    const list = loaded?.visible ? (ctab === 'followers' ? loaded.followers : loaded.following) : [];
    const CTABS = [{ id: 'following', label: 'フォロー中' }, { id: 'followers', label: 'フォロワー' }];
    return createPortal(
      <BottomSheet title={who(person)} onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
        <button type="button" onClick={() => backFromConn(view)} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
          <ChevronLeft size="1.1em" aria-hidden="true" />{who(person)}の本棚
        </button>
        <div role="tablist" aria-label={`${who(person)}のフォロー中とフォロワー`} style={{ ...segTrack, marginTop: 'var(--space-3)' }}>
          {CTABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={ctab === t.id} onClick={() => setView({ ...view, tab: t.id })} style={segOption(ctab === t.id)}>
              {t.label}{loaded?.visible ? ` ${(t.id === 'followers' ? loaded.followers : loaded.following).length}` : ''}
            </button>
          ))}
        </div>
        {c === 'loading' && (
          <div role="status" aria-label="一覧を読んでいます" style={{ marginTop: 'var(--space-3)' }}>
            {[0, 1, 2].map((i) => <SkeletonBlock key={i} height="var(--tap-min)" style={{ margin: 'var(--space-2) 0' }} />)}
          </div>
        )}
        {c === 'none' && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <p style={note}>{withPhraseBreaks('一覧を読めませんでした。フォローが外れたか、通信がつながっていません。')}</p>
            <button type="button" onClick={() => loadConns(person, { force: true })} style={{ ...btnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>もう一度読む</button>
          </div>
        )}
        {loaded && !loaded.visible && <p style={{ ...note, marginTop: 'var(--space-4)' }}>{withPhraseBreaks(`${who(person)}は、フォロー中・フォロワーの一覧を見せていません。`)}</p>}
        {loaded?.visible && (list.length === 0
          ? <p style={{ ...note, marginTop: 'var(--space-4)' }}>{ctab === 'followers' ? 'フォロワーはいません。' : 'フォロー中の人はいません。'}</p>
          : (
            <div role="list" style={{ marginTop: 'var(--space-3)' }}>
              {list.map((p, i) => (
                <PersonRow key={p.publicId} first={i === 0} person={p} onOpen={p.relation === 'accepted' ? () => openPerson(p, view) : undefined}>
                  {p.relation === 'self' && <><span style={note}>あなた</span><span aria-hidden="true" style={{ width: 'var(--tap-min)', flexShrink: 0 }} /></>}
                  {p.relation === 'pending' && <span style={note}>承認を待っています</span>}
                  {/* 行ごとに並ぶので塗りにせず面の副ボタン（DESIGN §0-2・§5 btnTonal・2026-11-23 ui-critic） */}
                  {p.relation === 'none' && <button type="button" style={btnTonal} onClick={() => ask(p)}>フォロー</button>}
                  {(p.relation === 'none' || p.relation === 'pending') && (
                    <button
                      type="button"
                      aria-label={`${who(p)}の操作`}
                      style={iconBtn}
                      onClick={(e) => openMenu(e, [
                        { label: '通報する', onClick: () => report(p) },
                        { label: 'ブロックする', destructive: true, onClick: () => block(p) },
                      ])}
                    >
                      <MoreHorizontal size="1.25em" aria-hidden="true" />
                    </button>
                  )}
                </PersonRow>
              ))}
            </div>
          ))}
        {loaded?.visible && list.some((p) => p.relation === 'none') && (
          <p style={{ ...note, marginTop: 'var(--space-4)' }}>{withPhraseBreaks('フォローすると、相手が承認したときに本棚を見られます。')}</p>
        )}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
      </BottomSheet>,
      document.body,
    );
  }

  // ─── 相手の本棚（言葉 → まとめ → 本棚） ───
  if (view.name === 'person') {
    const { person } = view;
    const loaded = shelf && typeof shelf === 'object' ? shelf : null;
    const p = loaded?.profile || person;
    const withSummary = (loaded?.books || []).filter((b) => b.summary);
    const ordered = loaded ? SHELF_ORDER.flatMap((st) => loaded.books.filter((b) => b.status === st)) : [];
    return createPortal(
      <BottomSheet title={`${who(person)}の本棚`} onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => setView(view.back || { name: 'home' })} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', minWidth: 0 }}>
            <ChevronLeft size="1.1em" aria-hidden="true" />{view.back?.name === 'conn' ? `${who(view.back.person)}の${view.back.tab === 'followers' ? 'フォロワー' : 'フォロー中'}` : 'フォロー'}
          </button>
          <button
            type="button"
            aria-label={`${who(person)}の操作`}
            style={iconBtn}
            onClick={(e) => openMenu(e, [
              { label: 'フォローをやめる', onClick: () => remove(person, 'following') },
              { label: '通報する', onClick: () => report(person) },
              { label: 'ブロックする', destructive: true, onClick: () => block(person) },
            ])}
          >
            <MoreHorizontal size="1.25em" aria-hidden="true" />
          </button>
        </div>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <UserAvatar avatarId={p.avatar} nickname={p.nickname} size={56} />
          <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-heading)', fontWeight: 600, overflowWrap: 'anywhere' }}>{who(p)}</p>
          {p.bio && <p style={{ ...note, marginTop: 'var(--space-2)', fontSize: 'var(--text-body)', color: 'var(--text)', whiteSpace: 'pre-line' }}>{p.bio}</p>}
          <ConnCounts conn={conns[person.publicId]} onOpen={(tab) => setView({ name: 'conn', person, tab, back: view })} />
        </div>
        {/* 主役はその人の言葉。好きな言葉を大きく、その下に好きな本。 */}
        {p.favLine && (
          <blockquote style={{ margin: 'var(--space-6) 0 0', padding: 'var(--space-1) 0 var(--space-1) var(--space-4)', borderLeft: '2px solid var(--accent)', fontFamily: 'var(--font-read)', fontSize: [...String(p.favLine)].length > 40 ? 'var(--text-read)' : 'var(--text-heading)', lineHeight: 1.7, lineBreak: 'strict', textWrap: 'pretty', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(p.favLine)}
          </blockquote>
        )}
        {p.favTitle && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <MiniCover title={p.favTitle} cover={p.favCover} width={40} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', ...note }}>好きな本</span>
              <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>『{shownTitle(p.favTitle)}』</span>
              {p.favAuthor && <span style={{ display: 'block', ...note, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.favAuthor}</span>}
            </span>
          </div>
        )}
        {shelf === 'loading' && (
          <div role="status" aria-label="本棚を読んでいます" style={{ marginTop: 'var(--space-8)', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
            {[0, 1, 2].map((i) => <SkeletonBlock key={i} height="auto" style={{ aspectRatio: '2 / 3' }} />)}
          </div>
        )}
        {shelf === 'none' && <p style={{ ...note, marginTop: 'var(--space-8)' }}>{withPhraseBreaks('本棚を見られませんでした。フォローが外れたか、通信がつながっていません。')}</p>}
        {loaded && withSummary.length > 0 && (
          // 見出し「〈名前〉さんのまとめ」と説明の行は出さない（2026-11-23 オーナー「これは不要」・公開のページと同じ）。
          <section aria-label={`${who(p)}のまとめ`} style={{ marginTop: 'var(--space-6)' }}>
            <SummaryRows person={person} books={withSummary} />
          </section>
        )}
        {loaded && (
          <section style={{ marginTop: 'var(--space-8)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600 }}>本棚</p>
            {ordered.length === 0
              ? <p style={{ ...note, marginTop: 'var(--space-2)' }}>本棚にはまだ本がありません。</p>
              : <ShelfView person={person} books={ordered} filter={shelfFilter} onFilter={setShelfFilter} onOpen={(b) => setView((v) => ({ name: 'book', person, book: b, back: v }))} hasBook={hasBook} />}
          </section>
        )}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
      </BottomSheet>,
      document.body,
    );
  }

  // ─── 一覧 ───
  const counts = lists ? { following: lists.following.length, followers: lists.followers.length, requests: lists.requests.length + lists.sent.length } : null;
  const TABS = [
    { id: 'following', label: 'フォロー中' },
    { id: 'followers', label: 'フォロワー' },
    { id: 'requests', label: '送った申し込み' },
  ];
  const followingIds = new Set([...(lists?.following || []), ...(lists?.sent || [])].map((p) => p.publicId));
  const mutual = new Set((lists?.following || []).map((p) => p.publicId));
  const listsBlock = (
          <div>
            <div role="tablist" aria-label="フォローの一覧" style={segTrack}>
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={segOption(tab === t.id)}>{t.label}</button>
              ))}
            </div>
            {!lists ? <p role="status" style={{ ...note, marginTop: 'var(--space-4)' }}>読み込んでいます…</p> : (
              <div role="list" style={{ marginTop: 'var(--space-3)' }}>
                {tab === 'following' && (lists.following.length
                  ? lists.following.map((p, i) => <PersonRow key={p.publicId} first={i === 0} person={p} onOpen={() => openPerson(p)} />)
                  : <p style={note}>{withPhraseBreaks('フォロー中の人はいません。相手のリンクからフォローできます。')}</p>)}
                {tab === 'followers' && (lists.followers.length
                  ? lists.followers.map((p, i) => (
                    <PersonRow key={p.publicId} first={i === 0} person={p} onOpen={mutual.has(p.publicId) ? () => openPerson(p) : undefined}>
                      <button
                        type="button"
                        aria-label={`${who(p)}の操作`}
                        style={iconBtn}
                        onClick={(e) => openMenu(e, [
                          ...(followingIds.has(p.publicId) ? [] : [{ label: 'フォロー', onClick: () => ask(p) }]),
                          { label: 'フォロワーから外す', onClick: () => remove(p, 'follower') },
                          { label: '通報する', onClick: () => report(p) },
                          { label: 'ブロックする', destructive: true, onClick: () => block(p) },
                        ])}
                      >
                        <MoreHorizontal size="1.25em" aria-hidden="true" />
                      </button>
                    </PersonRow>
                  ))
                  : <p style={note}>{withPhraseBreaks(meReady ? 'フォロワーはいません。「あなたの ID」を渡すと、申し込みが届きます。' : 'フォロワーはいません。')}</p>)}
                {tab === 'requests' && (
                  <>
                    {lists.sent.length === 0 && <p style={note}>{withPhraseBreaks(lists.requests.length && view.name !== 'list' ? '送った申し込みはありません。届いた申し込みは上にあります。' : '送った申し込みはありません。')}</p>}
                    {lists.sent.length > 0 && <p style={{ ...note, margin: '0 0 var(--space-2)' }}>相手の承認を待っています。</p>}
                    {lists.sent.map((p, i) => (
                      <PersonRow key={`s-${p.publicId}`} first={i === 0} person={p}>
                        <button type="button" style={rowLink} onClick={() => remove(p, 'following')}>取り消す</button>
                      </PersonRow>
                    ))}
                  </>
                )}
              </div>
            )}
            {counts && lists.blocked.length > 0 && (
              <details style={{ marginTop: 'var(--space-6)' }}>
                <summary style={{ ...note, minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>ブロック中（{lists.blocked.length}）</summary>
                <div role="list">
                  {lists.blocked.map((p, i) => (
                    <PersonRow key={`b-${p.publicId}`} first={i === 0} person={p}>
                      <button type="button" style={rowLink} onClick={() => unblock(p)}>ブロックを外す</button>
                    </PersonRow>
                  ))}
                </div>
              </details>
            )}
            {/* 自分のフォロー中・フォロワーを見せるか（2026-11-23・既定は見せる＝オーナー裁定・承認した人にだけ） */}
            {lists && !notReady && meReady && (
              <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--separator)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)' }}>フォロー中・フォロワーを見せる</span>
                  <ToggleSwitch checked={followsVisible} onChange={toggleVisible} disabled={visibleBusy} ariaLabel="フォロー中・フォロワーを見せる" />
                </div>
                <p style={{ ...note, marginTop: 'var(--space-2)' }}>
                  {withPhraseBreaks(followsVisible
                    ? 'オフにすると、一覧を見せず、ほかの人の一覧にも出ません。'
                    : 'いまは、だれにも一覧を見せず、ほかの人の一覧にもあなたは出ません。')}
                </p>
              </div>
            )}
          </div>
  );

  // 設定の「フォロー中 N」「フォロワー N」から開いたとき＝一覧だけの画面（‹ フォロー で申し込む・あなたの ID の画面へ・2026-11-22）。
  if (view.name === 'list' && !notReady) {
    return (<>{createPortal(
      <BottomSheet title="フォロー" onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
          {listsBlock}
          {/* 申し込む・あなたの ID の画面へ（‹ は戻る専用の形なので使わない・設定のまとめの最後の行と同じ形・2026-11-22 ui-critic） */}
          <button type="button" onClick={() => setView({ name: 'home' })} style={{ ...plainBtn, width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', marginTop: 'var(--space-6)', padding: 'var(--space-3) 0', borderTop: '1px solid var(--separator)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', color: 'var(--text)' }}>ID でフォロー</span>
            <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </button>
          {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
      </BottomSheet>,
      document.body,
    )}{profileSheet}</>);
  }
  return (<>{createPortal(
    <BottomSheet title="フォロー" onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
      {notReady ? (
        <p style={note}>フォローはまだ使えません。少し時間をおいてお試しください。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* 届いた申し込みは、いちばん上で答えられるように（設定の「申し込みが N 件」から来た人がすぐ答えられる）。 */}
          {/* 一覧を読んでいる間は、設定の行が知っている件数ぶんの形を先に置く（読み終えて上に差し込まれ、下が押し下がらないように）。 */}
          {!lists && initialRequestCount > 0 && (
            <section aria-hidden="true">
              <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>届いた申し込み（{initialRequestCount}）</p>
              {Array.from({ length: Math.min(3, initialRequestCount) }, (_, i) => (
                <SkeletonBlock key={i} height="var(--tap-min)" style={{ margin: 'var(--space-2) 0' }} />
              ))}
            </section>
          )}
          {lists?.requests?.length > 0 && (
            <section aria-labelledby={`${inputId}-req`}>
              <p id={`${inputId}-req`} style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>届いた申し込み（{lists.requests.length}）</p>
              <div role="list">
                {lists.requests.map((p, i) => (
                  <PersonRow key={`r-${p.publicId}`} first={i === 0} person={p}>
                    <button type="button" style={rowLink} onClick={() => respond(p, false)}>断る</button>
                    <button type="button" style={btnRow} onClick={() => respond(p, true)}>承認</button>
                    <button
                      type="button"
                      aria-label={`${who(p)}の操作`}
                      style={iconBtn}
                      onClick={(e) => openMenu(e, [
                        { label: '通報する', onClick: () => report(p) },
                        { label: 'ブロックする', destructive: true, onClick: () => block(p) },
                      ])}
                    >
                      <MoreHorizontal size="1.25em" aria-hidden="true" />
                    </button>
                  </PersonRow>
                ))}
              </div>
            </section>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor={inputId} style={{ ...groupTitle, margin: 0 }}>ID でフォロー</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                id={inputId}
                value={text}
                onChange={(e) => { setText(e.target.value); setPreview(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); check(); } }}
                maxLength={200}
                placeholder="相手のリンクか ID"
                autoCapitalize="off"
                autoCorrect="off"
                enterKeyHint="go"
                style={{ ...inputBase, flex: 1, minWidth: 0, ...(preview?.missing ? { borderColor: 'var(--error)' } : {}) }}
                aria-invalid={preview?.missing || undefined}
              />
              <button type="button" onClick={() => check()} disabled={!text.trim() || checking} aria-busy={checking || undefined} style={{ ...btnGhost, width: 'auto', flexShrink: 0 }}>{checking ? '確かめています…' : '確かめる'}</button>
            </div>
            {!preview?.missing && <p style={note}>{withPhraseBreaks('相手のリンクか ID を入れてください。名前では探せません。')}</p>}
            {preview?.missing && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--error)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(followResultMessage('not_found'))}</p>}
            {preview?.person && (
              <div role="status" style={{ ...row(true), borderBottom: '1px solid var(--separator)' }}>
                <UserAvatar avatarId={preview.person.avatar} nickname={preview.person.nickname} size={40} />
                <span style={nameStyle}>{preview.person.nickname || 'ニックネームなし'}</span>
                {preview.person.relation === 'self' ? <span style={note}>あなたです</span>
                  : preview.person.relation === 'pending' ? <span style={note}>承認を待っています</span>
                    : preview.person.relation === 'accepted'
                      ? <button type="button" style={btnLink} onClick={() => openPerson(preview.person)}>本棚を見る</button>
                      : <button type="button" style={smallBtn} onClick={() => ask(preview.person)}>フォロー</button>}
                {preview.person.relation !== 'self' && (
                  <button
                    type="button"
                    aria-label={`${who(preview.person)}の操作`}
                    style={iconBtn}
                    onClick={(e) => openMenu(e, [
                      { label: '通報する', onClick: () => report(preview.person) },
                      { label: 'ブロックする', destructive: true, onClick: () => block(preview.person) },
                    ])}
                  >
                    <MoreHorizontal size="1.25em" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 自分の ID（相手に渡すと申し込みが届く）。ニックネームが無いと申し込まれないので、先にプロフィールへ。 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <p style={{ ...groupTitle, margin: 0 }}>あなたの ID</p>
              {meLoading ? (
                <SkeletonBlock height="var(--tap-min)" />
              ) : meReady ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', color: 'var(--text)', overflowWrap: 'anywhere', userSelect: 'all', WebkitUserSelect: 'all' }}>{me.publicId}</span>
                    <button type="button" onClick={shareMyId} style={{ ...btnRow, flexShrink: 0, gap: 'var(--space-2)' }}>
                      <Share size="1em" aria-hidden="true" />{me.isPublic ? 'リンクを渡す' : 'ID を渡す'}
                    </button>
                  </div>
                  <p style={note}>{withPhraseBreaks('相手がこの ID を「ID でフォロー」に入れると、あなたに申し込みが届きます。')}</p>
                </>
              ) : (
                <>
                  <p style={note}>{withPhraseBreaks('フォローし合うには、先にプロフィールでニックネームを決めます。')}</p>
                  <button type="button" onClick={() => setProfileOpen(true)} style={{ ...btnLink, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>ニックネームを決める</button>
                </>
              )}
            </div>

          {listsBlock}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      </div>
    </BottomSheet>,
    document.body,
  )}{profileSheet}</>);
}
