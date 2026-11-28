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
import { MoreHorizontal, ChevronLeft, ChevronRight, ChevronDown, Check, Share, QrCode, Copy } from 'lucide-react';
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
import ErrorMessage from './ErrorMessage';
import { withPhraseBreaks } from './TightBubble';
import {
  publicIdFrom, previewProfile, requestFollow, followResultMessage, loadFollows, respondFollow, removeFollow,
  blockUser, unblockUser, reportProfile, loadFolloweeShelf, SHELF_ORDER, myIdShareText, summaryExcerpt,
  REPORT_REASONS, reportReasonText, loadFolloweeConnections, withRelation, setFollowsVisible,
} from '../lib/social';
import { track } from '../lib/analytics';
import { isDemo } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';

// ニックネームが無いと申し込めない・申し込まれない（supabase_follows.sql の no_profile）ので、その場でプロフィールを開く。
// お試しモード（開発だけ）: &clipboard=fail で、ID のコピーに失敗したときの知らせを撮れるように。
const demoClipboardFail = isDemo && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('clipboard') === 'fail';
const QrSheet = lazy(() => import('./QrSheet'));
const ProfileSheet = lazy(() => import('./ProfileSheet'));

const STATUS_LABEL = { reading: '読書中', done: '読了', before: '積読', want: '読みたい' };
const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, lineBreak: 'strict', textWrap: 'pretty', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
// 一覧の行: 区切り線は 2 行目から（DESIGN §5 一覧の行）。
const row = (first) => ({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: 'var(--space-2) 0', borderTop: first ? 'none' : '1px solid var(--separator)' });
// 名前は語の途中で割らない（文字がいちばん大きいとき「はる／か」と 1〜2 字ずつ並んでいた・2026-11-23 ui-critic）。
const nameStyle = { flex: '1 1 7em', minWidth: 0, fontSize: 'var(--text-body)', color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const plainBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' };
// 一覧の行の主ボタン（承認・申し込む）は btnRow の形に塗り（15/600・高さ 44）。
const smallBtn = { ...btnRow, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' };
// 行の中の文字ボタン（断る・取り消す・ブロックを外す）は横も 44 以上。
const rowLink = { ...btnLinkQuiet, minWidth: 'var(--tap-min)', padding: '0 var(--space-2)', justifyContent: 'center' };
// 一覧の行の右の関係（フォロー／承認を待っています／あなた）を入れる箱。いちばん長い「承認を待っています」が収まる幅。
// 文字が大きいときは箱が行の 3 分の 1 を超えず、収まらなければ次の行へ落ちる（名前が 1 字ずつ縦に並ばないように）。
const relBox = { display: 'inline-flex', justifyContent: 'flex-end', alignItems: 'center', minWidth: 'min(calc(9 * var(--text-meta) + var(--space-2)), 32%)', flexShrink: 0, marginLeft: 'auto' };
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

// ニックネームに「さん」を付けない（2026-11-28 オーナー「勝手にさんがつけられているが、さんをつけないで OK」）
const who = (p) => (p?.nickname ? String(p.nickname) : 'この人');

const Cover = ({ book, width = 72 }) => <MiniCover title={shownTitle(book.title)} cover={book.cover} width={width} />;

// 読了の冊数（数と「冊」を割らない）。
const doneLabel = (n) => `読了\u00a0${n}\u00a0冊`;

// 押す部分の幅の下限（12em）は本文の大きさで測る（ボタンの既定の文字で測ると、文字が大きいときに名前の欄が細く残り、
//   右のボタンが次の行へ落ちずに名前が 1〜2 字ずつ縦に並んだ・2026-11-23 ui-critic）。
//   ふつうの大きさ（17）で 9em＝153＝アイコン＋名前 6 字ほど。右の箱（フォロー・…）と並んで 1 行に収まる幅。
const personHit = { flex: '1 1 9em', minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', fontSize: 'var(--text-body)' };

// chevron: 押せる行の名前の後ろの ›。右に関係の箱（フォロー・承認を待っています）が並ぶ行は false にして、
//   › は行の右端の列に置く（名前のすぐ後ろ＝行の途中に浮いていた・2026-11-23 ui-critic）。
function PersonRow({ person, children, onOpen, first = false, sub = '', chevron = true }) {
  const body = (
    <>
      <UserAvatar avatarId={person.avatar} nickname={person.nickname} size={40} />
      {sub
        ? (
          <span style={{ ...nameStyle, display: 'flex', flexDirection: 'column' }}>
            <span>{person.nickname || 'ニックネームなし'}</span>
            <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{sub}</span>
          </span>
        )
        : <span style={nameStyle}>{person.nickname || 'ニックネームなし'}</span>}
      {/* 押せる行はボタンが並んでいても › を残す（押すと何かが開くと分かるように・2026-11-23） */}
      {onOpen && chevron && <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
    </>
  );
  return (
    <div role="listitem" style={row(first)}>
      {onOpen
        ? <button type="button" onClick={onOpen} style={{ ...plainBtn, ...personHit }}>{body}</button>
        : <span style={personHit}>{body}</span>}
      {children}
    </div>
  );
}

// 相手のフォロー中・フォロワーの数（押すとその一覧・2026-11-23）。読んでいる間は同じ高さの形、隠している・見られないときは出さない。
const COUNT_PULL = 'calc((1.5em - var(--tap-min)) / 2)'; // 押せる高さ 44 の余りを上下の空きと重ねる（文字の行は 1.5em）
function ConnCounts({ conn, onOpen, onRetry }) {
  if (conn === 'loading') return <SkeletonBlock height="1.5em" style={{ width: '60%', marginTop: 'var(--space-2)' }} />;
  // 読めなかったときは黙らずに 1 行（見せていない人とは分ける＝見せていない人は { visible: false } で何も出さない）。
  if (conn === 'none') {
    return (
      <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-2)', margin: `calc(var(--space-2) + ${COUNT_PULL}) 0 ${COUNT_PULL}`, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
        フォロー中・フォロワーを読めませんでした。
        <button type="button" onClick={onRetry} style={{ ...btnLink, minHeight: 'var(--tap-min)' }}>もう一度</button>
      </p>
    );
  }
  if (!conn || typeof conn !== 'object' || !conn.visible) return null;
  const item = (tab, n, label) => (
    <button type="button" onClick={() => onOpen(tab)} aria-label={`${label} ${n} 人を見る`} style={{ ...plainBtn, display: 'inline-flex', alignItems: 'center', minHeight: 'var(--tap-min)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-1)', lineHeight: 1.5 }}>
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
        <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>{label}</span>
      </span>
    </button>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-6)', marginTop: `calc(var(--space-2) + ${COUNT_PULL})`, marginBottom: COUNT_PULL }}>
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
                  {/* 表紙の下に書名を 2 行まで（2026-11-23 オーナー・自分の本棚と同じ・同じ段は同じ高さ） */}
                  <span aria-hidden="true" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: 'calc(2 * 1.4em)', margin: 'var(--space-1) 0 var(--space-2)', fontSize: 'var(--text-caption)', lineHeight: 1.4, color: 'var(--text-2)', textAlign: 'left', wordBreak: 'keep-all', overflowWrap: 'anywhere', lineBreak: 'strict' }}>{withPhraseBreaks(shownTitle(b.title), { scriptBreaks: true })}</span>
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
  // 🔳 QR コード（自分の QR・相手の QR を読む・2026-11-28）。読めたら、その ID をこの画面で確かめる。
  const [qrOpen, setQrOpen] = useState(false);
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
  // 一覧の人の様子（フォローする前に、どんな人かを見る・2026-11-23）: { person } | 'loading' | 'none'
  const [peek, setPeek] = useState(null);
  const [askingId, setAskingId] = useState(''); // フォローを送っている人（二重に送らない・押した手応え）
  const respondingRef = useRef(''); // 承認・断るを送っている人（2 回押して「断りました」と「取り消されたようです」が両方出ていた・2026-11-25 点検）
  const [respondingId, setRespondingId] = useState('');
  const [followsVisible, setFollowsVisibleState] = useState(true);
  const [visibleBusy, setVisibleBusy] = useState(false);
  // 画面（一覧 → 本棚 → 本）を移ったら、シートの中をいちばん上へ（下の本を押して開いた本が途中から見えないように）。
  const bodyRef = useRef(null);
  const viewKey = view.name === 'book' ? `b:${view.book.id}` : view.name === 'report' ? `r:${view.person.publicId}`
    : view.name === 'person' || view.name === 'conn' || view.name === 'peek' ? `${view.name}:${view.person.publicId}` : view.name;
  const scroller = () => {
    let el = bodyRef.current?.parentElement;
    while (el && el !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
      el = el.parentElement;
    }
    return null;
  };
  // 戻ってきた画面は、離れたときの位置に（一覧で押した行が見えるように・2026-11-23）。新しい画面はいちばん上から。
  useEffect(() => {
    const el = scroller();
    if (el) el.scrollTop = view.scrollTop || 0;
  }, [viewKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // いまの画面に、いまの位置を覚えさせた写し（戻り先に使う）。
  const here = () => ({ ...view, scrollTop: scroller()?.scrollTop || 0 }); // 本の id → 'busy' | 'added' | 'exists' | 'error'
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
    if (askingId) return;
    setAskingId(person.publicId);
    try {
      const result = await requestFollow(person.publicId);
      track('follow_request', { result });
      if (result === 'pending') {
        // 1 回押すと届くので、5 秒は元に戻せる（2026-11-23）。
        toast.undo({
          message: followResultMessage(result),
          onUndo: async () => {
            try {
              if (!(await removeFollow(person.publicId, 'following'))) throw new Error('undo failed');
              setConns((m) => Object.fromEntries(Object.entries(m).map(([k, c]) => [k, withRelation(c, person.publicId, 'none')])));
              setPeek((pk) => (pk && typeof pk === 'object' && pk.person.publicId === person.publicId ? { person: { ...pk.person, relation: 'none' } } : pk));
              setPreview((pv) => (pv?.person?.publicId === person.publicId ? { person: { ...pv.person, relation: 'none' } } : pv));
              reload();
            } catch {
              toast.error('取り消せませんでした。送った申し込みから取り消してください。');
            }
          },
        });
      } else if (result === 'accepted') {
        toast.success(followResultMessage(result));
      }
      if (result === 'pending' || result === 'accepted') {
        setPreview((pv) => (pv?.person?.publicId === person.publicId ? { person: { ...person, relation: result } } : pv));
        // 相手のつながりの画面でフォローしたときも、その行をすぐ「承認を待っています」に。
        setConns((m) => Object.fromEntries(Object.entries(m).map(([k, c]) => [k, withRelation(c, person.publicId, result)])));
        setPeek((pk) => (pk && typeof pk === 'object' && pk.person.publicId === person.publicId ? { person: { ...pk.person, relation: result } } : pk));
        if (result === 'pending' && (view.name === 'home' || view.name === 'list')) setTab('requests');
        reload();
      } else if (result === 'no_profile') {
        toast.error(followResultMessage(result));
        setProfileOpen(true);
      } else {
        toast.error(followResultMessage(result));
      }
    } catch {
      toast.error(followResultMessage(''));
    } finally {
      setAskingId('');
    }
  };

  const respond = async (person, accept) => {
    if (respondingRef.current) return;
    respondingRef.current = person.publicId;
    setRespondingId(person.publicId);
    try { await respondOnce(person, accept); } finally { respondingRef.current = ''; setRespondingId(''); }
  };
  const respondOnce = async (person, accept) => {
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

  const remove = async (person, as, { pending = person?.relation === 'pending' } = {}) => {
    // 承認を待っている申し込みの取り消しは、フォローをやめるとは別の言葉で確かめる（2026-11-23）。
    const cancel = as !== 'follower' && pending;
    const ok = await confirm({
      title: as === 'follower' ? `${who(person)}をフォロワーから外しますか？` : cancel ? `${who(person)}への申し込みを取り消しますか？` : `${who(person)}のフォローをやめますか？`,
      message: as === 'follower' ? 'この人は、あなたの本棚を見られなくなります。相手に知らせは届きません。' : cancel ? '相手に知らせは届きません。あとでもう一度フォローできます。' : 'この人の本棚を見られなくなります。もう一度見るには、申し込み直して承認してもらいます。',
      confirmLabel: as === 'follower' ? '外す' : cancel ? '取り消す' : 'やめる',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    try {
      if (!(await removeFollow(person.publicId, as))) throw new Error('remove failed');
      if (as !== 'follower') setConns((m) => Object.fromEntries(Object.entries(m).map(([k, c]) => [k, withRelation(c, person.publicId, 'none')])));
      if (view.name === 'peek') {
        setPeek((pk) => (pk && typeof pk === 'object' ? { person: { ...pk.person, relation: 'none' } } : pk));
      } else if (view.name === 'conn') {
        // 一覧の中で取り消したときは一覧のまま
      } else if (view.name !== 'home' && view.name !== 'list') {
        // 一覧から開いた人の本棚でやめたら、その一覧へ戻る（一覧の外まで飛ばさない）
        const to = view.name === 'book' ? view.back?.back : view.back;
        setView(to?.name === 'conn' ? to : rootOf(view));
      }
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
      // 一覧の人をブロックしたら一覧から外して、一覧にとどまる（はじめの画面まで飛ばさない・2026-11-23）。
      setConns((m) => Object.fromEntries(Object.entries(m).map(([k, c]) => [k, c && typeof c === 'object' && c.visible
        ? { ...c, following: c.following.filter((x) => x.publicId !== person.publicId), followers: c.followers.filter((x) => x.publicId !== person.publicId) }
        : c])));
      const backConn = view.name === 'conn' ? view : (view.back?.name === 'conn' ? view.back : null);
      setView(backConn && backConn.person.publicId !== person.publicId ? backConn : { name: 'home' }); setPreview(null);
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

  // ID だけを 1 回でコピー（2026-11-28 オーナー「ワンクリックで id だけコピーできるように」）
  const copyMyId = async () => {
    const id = me?.publicId;
    if (!id) return;
    track('follow_copy_id');
    try {
      if (demoClipboardFail) throw new Error('demo');
      await navigator.clipboard.writeText(id);
      toast.success('ID をコピーしました。');
    } catch {
      toast.error('コピーできません。', { action: { label: me.isPublic ? 'リンクを渡す' : 'ID を渡す', onClick: () => { shareMyId(); } } });
    }
  };

  const shareMyId = async () => {
    const { text, url } = myIdShareText(me);
    if (!text) return;
    track('follow_share_id', { public: !!url });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share(url ? { text, url } : { text }); return; }
      await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
      toast.success(url ? 'リンクをコピーしました。' : '誘いの文をコピーしました。');
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
  const openPerson = async (person, back = here(), { scrollTop = 0 } = {}) => {
    const req = personReqRef.current + 1;
    personReqRef.current = req;
    const from = back && (back.name === 'list' || back.name === 'conn' || back.name === 'home') ? back : { name: 'home' };
    setView({ name: 'person', person, back: from, scrollTop });
    setShelfFilter('');
    loadConns(person);
    const cached = shelfCacheRef.current.get(person.publicId);
    setShelf(cached || 'loading');
    try {
      const s = await loadFolloweeShelf(person.publicId);
      if (s) shelfCacheRef.current.set(person.publicId, s);
      if (personReqRef.current === req) setShelf(s || 'none'); // 別の人を開き直していたら、古い答えは捨てる
    } catch {
      if (personReqRef.current === req && !cached) setShelf('error');
    }
  };
  // 相手のつながりから戻るときは、その人の本棚を開き直す（間に別の人の本棚を見ていても、元の人の本棚に戻る）。
  const backFromConn = (v) => openPerson(v.person, v.back?.back || { name: 'home' }, { scrollTop: v.back?.scrollTop || 0 });
  // まだフォローしていない人・承認を待っている人の様子（自己紹介と好きな本は、その人が公開しているときだけ）。
  const peekReqRef = useRef(0);
  const openPeek = async (person, back = here()) => {
    const req = peekReqRef.current + 1;
    peekReqRef.current = req;
    setView({ name: 'peek', person, back });
    setPeek('loading');
    try {
      const p = await previewProfile(person.publicId);
      if (peekReqRef.current !== req) return;
      setPeek(p && !p.notReady ? { person: { ...person, ...p } } : 'none');
    } catch {
      if (peekReqRef.current === req) setPeek('none');
    }
  };

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

  const profileSheet = (<>
    {profileOpen && (
      <Suspense fallback={null}>
        <ProfileSheet userId={user?.id || ''} onClose={() => setProfileOpen(false)} />
      </Suspense>
    )}
    {qrOpen && (
      <Suspense fallback={null}>
        <QrSheet
          profile={me}
          onClose={() => setQrOpen(false)}
          onEditProfile={() => { setQrOpen(false); setProfileOpen(true); }}
          onFound={(id) => { setQrOpen(false); setText(id); check(id); }}
        />
      </Suspense>
    )}
  </>);

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
        {!f.reason && !f.failed && <p style={{ ...note, margin: '0 0 var(--space-2)', textAlign: 'center' }}>理由を選んでください。</p>}
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
        <p style={{ ...note, marginTop: 'var(--space-8)', color: 'var(--text-3)' }}>{withPhraseBreaks(STORE_DISCLOSURE_TEXT)}</p>
        </div>
      </BottomSheet>,
      document.body,
    );
  }

  // ─── 一覧の人の様子（フォローする前に・2026-11-23） ───
  // 主ボタンは「フォロー」1 つ。自己紹介・好きな言葉・好きな本は、その人が公開しているときだけ（profile_preview）。
  if (view.name === 'peek') {
    const { person, back } = view;
    const loaded = peek && typeof peek === 'object' ? peek.person : null;
    const p = loaded || person;
    const rel = loaded?.relation || person.relation || 'none';
    const backLabel = back?.name === 'conn' ? `${who(back.person)}の${back.tab === 'followers' ? 'フォロワー' : 'フォロー中'}` : 'フォロー';
    const footer = rel === 'none' && peek !== 'none'
      ? <button type="button" onClick={() => ask(p)} disabled={!!askingId} aria-busy={askingId === p.publicId || undefined} style={btnPrimary}>{askingId === p.publicId ? '送っています…' : 'フォロー'}</button>
      : null;
    return createPortal(
      <BottomSheet title={who(person)} onClose={onClose} layer="dialog" footer={footer}>
        <div ref={bodyRef} style={sheetBody}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => setView(back || { name: 'home' })} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', minWidth: 0 }}>
            <ChevronLeft size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} /><span>{withPhraseBreaks(backLabel)}</span>
          </button>
          <button
            type="button"
            aria-label={`${who(person)}の操作`}
            style={iconBtn}
            onClick={(e) => openMenu(e, [
              ...(rel === 'pending' ? [{ label: '申し込みを取り消す', onClick: () => remove(p, 'following') }] : []),
              { label: '通報する', onClick: () => report(p) },
              { label: 'ブロックする', destructive: true, onClick: () => block(p) },
            ])}
          >
            <MoreHorizontal size="1.25em" aria-hidden="true" />
          </button>
        </div>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <UserAvatar avatarId={p.avatar} nickname={p.nickname} size={56} />
          {/* 名前はシートの題に出ているので、本文では繰り返さない（2026-11-23 ui-critic） */}
          {loaded?.bio && <p style={{ ...note, marginTop: 'var(--space-2)', fontSize: 'var(--text-body)', color: 'var(--text)', whiteSpace: 'pre-line', overflowWrap: 'break-word' }}>{withPhraseBreaks(loaded.bio)}</p>}
          {/* 読書の積み重ね（本棚を公開している人か、承認済みのときだけ・profile_preview） */}
          {loaded && (loaded.doneCount > 0 || loaded.summaryCount > 0) && (
            <p style={{ ...note, marginTop: 'var(--space-2)', fontSize: 'var(--text-sub)' }}>
              {[loaded.doneCount > 0 ? doneLabel(loaded.doneCount) : '', loaded.summaryCount > 0 ? `まとめ ${loaded.summaryCount} 冊` : ''].filter(Boolean).join('　')}
            </p>
          )}
        </div>
        {peek === 'loading' && <SkeletonBlock height="calc(3 * var(--tap-min))" style={{ marginTop: 'var(--space-6)' }} />}
        {loaded?.favLine && (
          <blockquote style={{ margin: 'var(--space-6) 0 0', padding: 'var(--space-1) 0 var(--space-1) var(--space-4)', borderLeft: '2px solid var(--accent)', fontFamily: 'var(--font-read)', fontSize: [...String(loaded.favLine)].length > 40 ? 'var(--text-read)' : 'var(--text-heading)', lineHeight: 1.7, lineBreak: 'strict', textWrap: 'pretty', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(loaded.favLine)}
          </blockquote>
        )}
        {loaded?.favTitle && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <MiniCover title={loaded.favTitle} cover={loaded.favCover} width={40} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', ...note }}>好きな本</span>
              <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>『{shownTitle(loaded.favTitle)}』</span>
              {loaded.favAuthor && <span style={{ display: 'block', ...note, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loaded.favAuthor}</span>}
            </span>
          </div>
        )}
        {peek === 'none' && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <ErrorMessage title={`${who(person)}のプロフィールを読めませんでした`} description="通信状況を確認してください。" actions={[{ label: 'もう一度', onClick: () => openPeek(person, back) }]} />
          </div>
        )}
        {loaded && (
          <p style={{ ...note, marginTop: 'var(--space-8)' }}>
            {withPhraseBreaks(rel === 'pending'
              ? '承認を待っています。'
              : rel === 'accepted'
                ? 'フォローしています。'
                : '承認されると、本棚とまとめを見られます。')}
          </p>
        )}
        {rel === 'accepted' && <button type="button" onClick={() => openPerson(p, back)} style={{ ...btnGhost, marginTop: 'var(--space-3)' }}>本棚を見る</button>}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
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
      <BottomSheet title={`${who(person)}のフォロー中・フォロワー`} onClose={onClose} layer="dialog">
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
          <div style={{ marginTop: 'var(--space-6)' }}>
            <ErrorMessage title="フォロー中・フォロワーを読めませんでした" description="通信状況を確認してください。" actions={[{ label: 'もう一度', onClick: () => loadConns(person, { force: true }) }]} />
          </div>
        )}
        {loaded && !loaded.visible && <p style={{ ...note, marginTop: 'var(--space-4)' }}>{withPhraseBreaks(`${who(person)}は、フォロー中・フォロワーの一覧を見せていません。`)}</p>}
        {loaded?.visible && (list.length === 0
          ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              {/* 戻る先は上の「‹ 〈名前〉さんの本棚」だけ（同じ戻り先の文字ボタンを下にも置いていた・2026-11-23 ui-critic） */}
              <p style={note}>{ctab === 'followers' ? 'フォロワーはいません。' : 'フォロー中の人はいません。'}</p>
            </div>
          )
          : (
            <div role="list" style={{ marginTop: 'var(--space-3)' }}>
              {list.map((p, i) => (
                <PersonRow key={p.publicId} first={i === 0} person={p} sub={p.doneCount > 0 ? doneLabel(p.doneCount) : ''} chevron={false} onOpen={p.relation === 'accepted' ? () => openPerson(p) : p.relation === 'self' ? () => setProfileOpen(true) : () => openPeek(p)}>
                  {/* 右の関係はいつも同じ幅の箱に入れて、› と「…」の列をそろえる（2026-11-23 ui-critic） */}
                  <span style={relBox}>
                  {p.relation === 'self' && <span style={note}>あなた</span>}
                  {p.relation === 'pending' && <span style={note}>承認を待っています</span>}
                  {/* 行ごとに並ぶので塗りにせず面の副ボタン（DESIGN §0-2・§5 btnTonal・2026-11-23 ui-critic） */}
                  {p.relation === 'none' && <button type="button" style={btnTonal} disabled={!!askingId} aria-busy={askingId === p.publicId || undefined} onClick={() => ask(p)}>{askingId === p.publicId ? '送っています…' : 'フォロー'}</button>}
                  </span>
                  {/* 本棚・プロフィールへ進む行は、右端の列に ›（自分の一覧の › と同じ右端・行の押す部分と同じ先へ） */}
                  {(p.relation === 'self' || p.relation === 'accepted') && (
                    <button type="button" tabIndex={-1} aria-hidden="true" onClick={p.relation === 'self' ? () => setProfileOpen(true) : () => openPerson(p)} style={{ ...iconBtn, justifyContent: 'flex-end', color: 'var(--text-3)' }}>
                      <ChevronRight size="1.1em" />
                    </button>
                  )}
                  {(p.relation === 'none' || p.relation === 'pending') && (
                    <button
                      type="button"
                      aria-label={`${who(p)}の操作`}
                      style={iconBtn}
                      onClick={(e) => openMenu(e, [
                        ...(p.relation === 'pending' ? [{ label: '申し込みを取り消す', onClick: () => remove(p, 'following') }] : []),
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
        {loaded?.visible && !followsVisible && (
          <p style={{ ...note, marginTop: 'var(--space-4)' }}>{withPhraseBreaks('あなたは一覧を見せない設定です。')}</p>
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
    const ordered = loaded ? SHELF_ORDER.flatMap((st) => loaded.books.filter((b) => b.status === st)) : [];
    return createPortal(
      <BottomSheet title={`${who(person)}の本棚`} onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => setView(view.back || { name: 'home' })} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', minWidth: 0 }}>
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
          {p.bio && <p style={{ ...note, marginTop: 'var(--space-2)', fontSize: 'var(--text-body)', color: 'var(--text)', whiteSpace: 'pre-line', overflowWrap: 'break-word' }}>{withPhraseBreaks(p.bio)}</p>}
          <ConnCounts conn={conns[person.publicId]} onOpen={(tab) => setView({ name: 'conn', person, tab, back: here() })} onRetry={() => loadConns(person, { force: true })} />
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
        {/* 見られない理由は 2 つに分ける: フォローが外れた（答えが空）／つながらない（失敗）。どちらも行き止まりにしない。 */}
        {shelf === 'none' && (
          <div style={{ marginTop: 'var(--space-8)' }}>
            <ErrorMessage title="この本棚は、いまは見られません" description="フォローが外れたようです。もう一度フォローして承認されると、また見られます。" actions={[{ label: 'フォローの一覧へ', onClick: () => setView(rootOf(view)) }]} />
          </div>
        )}
        {shelf === 'error' && (
          <div style={{ marginTop: 'var(--space-8)' }}>
            <ErrorMessage title="本棚を読めませんでした" description="通信状況を確認してください。" actions={[{ label: 'もう一度', onClick: () => openPerson(person, view.back, { scrollTop: 0 }) }]} />
          </div>
        )}
        {/* まとめのある本を本棚の上に並べる行はやめた（2026-11-23 オーナー「まとめありのこの二つの表示不要」・公開のページと同じ）。
            まとめは本棚の本（栞の印・「まとめあり」で絞れる）を押した先で読む。 */}
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
            <div role="tablist" aria-label="フォローの一覧" style={{ ...segTrack, flexWrap: 'wrap' }}>
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{ ...segOption(tab === t.id), flex: '1 1 auto', minWidth: 'max-content', padding: '0 var(--space-2)' }}>{t.label}</button>
              ))}
            </div>
            {!lists ? <p role="status" style={{ ...note, marginTop: 'var(--space-4)' }}>読み込んでいます…</p> : (
              <div role="list" style={{ marginTop: 'var(--space-3)' }}>
                {tab === 'following' && (lists.following.length
                  ? lists.following.map((p, i) => <PersonRow key={p.publicId} first={i === 0} person={p} onOpen={() => openPerson(p)} />)
                  : <p style={note}>{withPhraseBreaks('フォロー中の人はいません。')}</p>)}
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
                  : <p style={note}>{withPhraseBreaks('フォロワーはいません。')}</p>)}
                {tab === 'requests' && (
                  <>
                    {lists.sent.length === 0 && <p style={note}>{'送った申し込みはありません。'}</p>}
                    {lists.sent.length > 0 && <p style={{ ...note, margin: '0 0 var(--space-2)' }}>相手の承認を待っています。</p>}
                    {lists.sent.map((p, i) => (
                      <PersonRow key={`s-${p.publicId}`} first={i === 0} person={p}>
                        <button type="button" style={rowLink} onClick={() => remove(p, 'following', { pending: true })}>取り消す</button>
                      </PersonRow>
                    ))}
                  </>
                )}
              </div>
            )}
            {counts && lists.blocked.length > 0 && (
              <details style={{ marginTop: 'var(--space-6)' }}>
                {/* 畳む見出し（DESIGN §5）: 右端に ⌄（Safari の三角は components.css が消している） */}
                <summary style={{ ...note, minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', cursor: 'pointer' }}>
                  <span>ブロック中（{lists.blocked.length}）</span>
                  <ChevronDown className="fold-chevron" size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                </summary>
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
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', color: 'var(--text)' }}>ID・QR コードでフォロー</span>
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
        <p style={note}>フォローはまだ使えません。</p>
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
                    {/* 操作はひとまとまり（文字が大きくて折り返すときも、断る・承認・… が離れない） */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', marginLeft: 'auto' }}>
                    <button type="button" style={rowLink} disabled={respondingId === p.publicId} onClick={() => respond(p, false)}>断る</button>
                    <button type="button" style={btnRow} disabled={respondingId === p.publicId} onClick={() => respond(p, true)}>承認</button>
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
                    </span>
                  </PersonRow>
                ))}
              </div>
            </section>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor={inputId} style={{ ...groupTitle, margin: 0 }}>ID・QR コードでフォロー</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
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
                style={{ ...inputBase, flex: '1 1 9em', minWidth: 0, ...(preview?.missing ? { border: '1px solid var(--error)' } : {}) }}
                aria-invalid={preview?.missing || undefined}
              />
              <button type="button" onClick={() => check()} disabled={!text.trim() || checking} aria-busy={checking || undefined} style={{ ...btnGhost, width: 'auto', flexShrink: 0 }}>{checking ? '確かめています…' : '確かめる'}</button>
              {/* QR コード（自分の QR を見せる・相手の QR を読む）。ID の入力の横に 1 つ（2026-11-28 オーナー「ID でフォローと QR コードでフォローを一つに」） */}
              {meReady && (
                <button type="button" aria-label="QR コード" onClick={() => { track('follow_qr', { action: 'open', from: 'follow_sheet' }); setQrOpen(true); }} style={{ ...btnGhost, width: 'var(--btn-h)', padding: 0, flexShrink: 0 }}>
                  <QrCode size="1.25em" aria-hidden="true" />
                </button>
              )}
            </div>
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
                    {/* ID を押すと ID だけをコピー（右のボタンは共有のシート） */}
                    <button
                      type="button"
                      onClick={copyMyId}
                      aria-label={`あなたの ID ${me.publicId} をコピー`}
                      style={{ flex: '1 1 auto', minWidth: 0, minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 'var(--text-body)', color: 'var(--text)' }}
                    >
                      <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{me.publicId}</span>
                      <Copy size="1em" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--accent)' }} />
                    </button>
                    <button type="button" onClick={shareMyId} style={{ ...btnRow, flexShrink: 0, gap: 'var(--space-2)' }}>
                      <Share size="1em" aria-hidden="true" />{me.isPublic ? 'リンクを渡す' : 'ID を渡す'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={note}>{withPhraseBreaks('ニックネームを決めると使えます。')}</p>
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
