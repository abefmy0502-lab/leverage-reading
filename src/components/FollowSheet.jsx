// 👥 フォローのシート（2026-11-21 オーナー「フォロー、フォロワーにすることができるようにして、フォロー認証をされたら常に見ることができるように」）。
//   設定の「フォロー」の行と、相手のリンク（/?follow=<id>）から開く。VITE_SOCIAL のビルドだけ（lib/social.js）。
//   1 つのシートの中で 3 つの画面を行き来する: 一覧（申し込む・フォロー中・フォロワー・申し込み）→ 相手の本棚 → 本（まとめ・読みたいに追加）。
//   相手を探す欄は「リンクか ID」だけ（名前で探さない）。承認の前に「本棚とこの本のまとめをいつでも見られます」と確かめる。
//   ブロック・通報は相手の本棚の「…」とフォロワーの行の「…」から（App 審査 1.2）。
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, ChevronLeft, ChevronRight, Check, Share } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ContextMenu from './ContextMenu';
import UserAvatar from './UserAvatar';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { btnPrimary, btnGhost, btnLink, btnLinkQuiet, btnRow, input as inputBase, groupTitle, segTrack, segOption } from '../styles/ui';
import MiniCover from './MiniCover';
import BookStoreLinks from './BookStoreLinks';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import {
  publicIdFrom, previewProfile, requestFollow, followResultMessage, loadFollows, respondFollow, removeFollow,
  blockUser, unblockUser, reportProfile, loadFolloweeShelf, SHELF_ORDER, myIdShareText, summaryExcerpt,
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
const iconBtn = { ...plainBtn, width: 'var(--tap-min)', height: 'var(--tap-min)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', flexShrink: 0 };

// 3 つの画面を行き来してもシートの高さが跳ねないように、中身の高さの下限をそろえる。
const sheetBody = { minHeight: 'min(64vh, 600px)' };

// 自分の本棚にもある本の小さな印（塗らない・--text-2）。
const ownedTag = { alignSelf: 'flex-start', flexShrink: 0, fontSize: 'var(--text-caption)', color: 'var(--text-2)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: '0 var(--space-2)', lineHeight: 1.7, whiteSpace: 'nowrap' };

const who = (p) => (p?.nickname ? `${p.nickname}さん` : 'この人');

const Cover = ({ book, width = 72 }) => <MiniCover title={book.title} cover={book.cover} width={width} />;

function PersonRow({ person, children, onOpen, first = false }) {
  const body = (
    <>
      <UserAvatar avatarId={person.avatar} nickname={person.nickname} size={40} />
      <span style={nameStyle}>{person.nickname || 'ニックネームなし'}</span>
      {onOpen && <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
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

export default function FollowSheet({ onClose, initialId = '', onAddWant, initialRequestCount = 0, hasBook }) {
  const toast = useToast();
  const { user } = useAuth();
  const { profile: me, loading: meLoading } = useProfile(user?.id || '');
  const [profileOpen, setProfileOpen] = useState(false);
  const meReady = !!(me?.publicId && me?.nickname);
  const confirm = useConfirm();
  const inputId = useId();
  const [lists, setLists] = useState(null); // null＝読み込み中
  const [notReady, setNotReady] = useState(false);
  const [tab, setTab] = useState('following');
  const [text, setText] = useState(initialId);
  const [preview, setPreview] = useState(null); // { person } | { missing: true }
  const [checking, setChecking] = useState(false);
  const [view, setView] = useState({ name: 'home' }); // home | person { person } | book { person, book }
  const [shelf, setShelf] = useState(null); // { profile, books } | 'loading' | 'none'
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [wantState, setWantState] = useState({});
  // 画面（一覧 → 本棚 → 本）を移ったら、シートの中をいちばん上へ（下の本を押して開いた本が途中から見えないように）。
  const bodyRef = useRef(null);
  const viewKey = view.name === 'book' ? `b:${view.book.id}` : view.name;
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
        message: '承認すると、この人はあなたの本棚と「この本のまとめ」を、いつでも見られます。あとでフォロワーから外せます。',
        confirmLabel: '承認する',
        cancelLabel: 'キャンセル',
      });
      if (!ok) return;
    }
    try {
      await respondFollow(person.publicId, accept);
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
      await removeFollow(person.publicId, as);
      if (view.name !== 'home') setView({ name: 'home' });
      reload();
    } catch {
      toast.error('できませんでした。通信状況を確認してください。');
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
      await blockUser(person.publicId);
      track('follow_block', {});
      toast.success('ブロックしました。');
      setView({ name: 'home' }); setPreview(null);
      reload();
    } catch {
      toast.error('ブロックできませんでした。通信状況を確認してください。');
    }
  };

  const report = async (person) => {
    const ok = await confirm({
      title: `${who(person)}を運営に通報しますか？`,
      message: '運営が 24 時間以内に確かめ、利用規約に反する内容は表示を止めます。通報したことは相手に知らせません。',
      confirmLabel: '通報する',
      cancelLabel: 'キャンセル',
    });
    if (!ok) return;
    const sent = await reportProfile(person.publicId, 'アプリのフォローの画面から');
    track('follow_report', {});
    if (sent) toast.success('通報を受け付けました。ありがとうございました。');
    else toast.error('通報を送れませんでした。通信状況を確認してください。');
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
      await unblockUser(person.publicId);
      toast.success(`${who(person)}のブロックを外しました。`);
    } catch {
      toast.error('できませんでした。通信状況を確認してください。');
    }
    reload();
  };

  const openPerson = async (person) => {
    setView({ name: 'person', person });
    setShelf('loading');
    try {
      const s = await loadFolloweeShelf(person.publicId);
      setShelf(s || 'none');
    } catch {
      setShelf('none');
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
          <button type="button" onClick={() => setView({ name: 'book', person, book: b })} style={{ ...plainBtn, width: '100%', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', padding: 'var(--space-4) 0' }}>
            <MiniCover title={b.title} cover={b.cover} width={48} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(b.title, { scriptBreaks: true })}</span>
              <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 'var(--space-1)', fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.7, color: 'var(--text)', lineBreak: 'strict', overflowWrap: 'anywhere' }}>{summaryExcerpt(b.summary)}</span>
            </span>
          </button>
        </div>
      ))}
    </div>
  );

  // ─── 相手の本（まとめ・読みたいに追加・本屋で見る） ───
  if (view.name === 'book') {
    const { person, book } = view;
    const st = wantState[book.id] || (hasBook?.(book) ? 'exists' : undefined);
    const done = st === 'added' || st === 'exists';
    const loaded = shelf && typeof shelf === 'object' ? shelf : null;
    const others = (loaded?.books || []).filter((b) => b.summary && b.id !== book.id).slice(0, 3);
    return createPortal(
      <BottomSheet title="フォロー" onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
        <button type="button" onClick={() => setView({ name: 'person', person })} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
          <ChevronLeft size="1.1em" aria-hidden="true" />{who(person)}の本棚
        </button>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', marginTop: 'var(--space-3)' }}>
          <Cover book={book} width={96} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 700, lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{withPhraseBreaks(book.title, { scriptBreaks: true })}</p>
            {book.author && <p style={{ ...note, marginTop: 'var(--space-1)', fontSize: 'var(--text-body)' }}>{book.author}</p>}
            <p style={{ ...note, marginTop: 'var(--space-2)' }}>{STATUS_LABEL[book.status]}{book.rating ? `・評価 ${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}` : ''}</p>
          </div>
        </div>
        <p style={{ ...groupTitle, margin: 'var(--space-8) 0 var(--space-2)' }}>{who(person)}の、この本のまとめ</p>
        {book.summary
          ? <p style={{ margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.8, whiteSpace: 'pre-line', lineBreak: 'strict', textWrap: 'pretty' }}>{book.summary}</p>
          : <p style={note}>{withPhraseBreaks('この本のまとめは、まだ書かれていません。')}</p>}
        {done ? (
          <p role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', minHeight: 'var(--btn-h)', margin: 'var(--space-8) 0 0', fontSize: 'var(--text-body)', color: 'var(--text-2)' }}>
            <Check size="1.1em" aria-hidden="true" style={{ color: 'var(--success)' }} />
            {st === 'added' ? '読みたいに追加しました' : 'あなたの本棚にあります'}
          </p>
        ) : (
          <>
            <button type="button" onClick={() => addWant(book)} disabled={st === 'busy'} aria-busy={st === 'busy' || undefined} style={{ ...btnPrimary, marginTop: 'var(--space-8)' }}>
              {st === 'busy' ? '入れています…' : '読みたいに追加'}
            </button>
            {st === 'error' && <p role="alert" style={{ ...note, marginTop: 'var(--space-2)', textAlign: 'center' }}>入れられませんでした。もう一度お試しください。</p>}
          </>
        )}
        {/* 本屋で見る（本の詳細と同じ Amazon・楽天の 2 つ・開示の文つき）。 */}
        <div style={{ marginTop: 'var(--space-3)' }}>
          <BookStoreLinks book={book} variant="cta" />
        </div>
        {others.length > 0 && (
          <section style={{ marginTop: 'var(--space-6)' }}>
            <p style={{ ...groupTitle, margin: '0 0 var(--space-1)' }}>{who(person)}の、ほかのまとめ</p>
            <SummaryRows person={person} books={others} />
          </section>
        )}
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
    const counts = loaded ? SHELF_ORDER.map((st) => [st, loaded.books.filter((b) => b.status === st).length]).filter(([, n]) => n) : [];
    return createPortal(
      <BottomSheet title="フォロー" onClose={onClose} layer="dialog">
        <div ref={bodyRef} style={sheetBody}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => setView({ name: 'home' })} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
            <ChevronLeft size="1.1em" aria-hidden="true" />フォロー
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
          <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-heading)', fontWeight: 700, overflowWrap: 'anywhere' }}>{who(p)}</p>
          {p.bio && <p style={{ ...note, marginTop: 'var(--space-2)', fontSize: 'var(--text-body)', color: 'var(--text)', whiteSpace: 'pre-line' }}>{p.bio}</p>}
        </div>
        {/* 主役はその人の言葉。好きな言葉を大きく、その下に好きな本。 */}
        {p.favLine && (
          <blockquote style={{ margin: 'var(--space-6) 0 0', padding: 'var(--space-1) 0 var(--space-1) var(--space-4)', borderLeft: '2px solid var(--accent)', fontFamily: 'var(--font-read)', fontSize: 'var(--text-heading)', lineHeight: 1.7, lineBreak: 'strict', textWrap: 'pretty', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(p.favLine)}
          </blockquote>
        )}
        {p.favTitle && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <MiniCover title={p.favTitle} cover={p.favCover} width={40} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', ...note }}>好きな本</span>
              <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>『{p.favTitle}』</span>
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
          <section style={{ marginTop: 'var(--space-8)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 700 }}>{who(p)}のまとめ</p>
            <p style={{ ...note, marginTop: 'var(--space-1)' }}>{withPhraseBreaks(`読んだ本について、${who(p)}が書いたこと`)}</p>
            <div style={{ marginTop: 'var(--space-1)' }}><SummaryRows person={person} books={withSummary} /></div>
          </section>
        )}
        {loaded && (
          <section style={{ marginTop: 'var(--space-8)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 700 }}>本棚</p>
            {ordered.length === 0
              ? <p style={{ ...note, marginTop: 'var(--space-2)' }}>本棚にはまだ本がありません。</p>
              : <>
                <p style={{ ...note, marginTop: 'var(--space-1)' }}>{counts.map(([st, n]) => `${STATUS_LABEL[st]} ${n} 冊`).join('・')}</p>
                <div role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-6) var(--space-3)', marginTop: 'var(--space-4)' }}>
                  {ordered.map((b) => {
                    const owned = hasBook?.(b);
                    return (
                      <div role="listitem" key={b.id}>
                        <button type="button" onClick={() => setView({ name: 'book', person, book: b })} style={{ ...plainBtn, width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }} aria-label={`${b.title}・${STATUS_LABEL[b.status]}${b.summary ? '・まとめあり' : ''}${owned ? '・あなたの本棚にあります' : ''}`}>
                          <Cover book={b} width="100%" />
                          {/* 表紙の無い本は代用表紙に書名が出るので、下の書名は出さない（読み上げは aria-label）。 */}
                          {b.cover && <span style={{ fontSize: 'var(--text-meta)', fontWeight: 600, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{withPhraseBreaks(b.title, { scriptBreaks: true })}</span>}
                          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-2)', lineHeight: 1.5 }}>
                            {STATUS_LABEL[b.status]}{b.rating ? <span style={{ color: 'var(--accent)' }}> {'★'.repeat(b.rating)}</span> : null}
                          </span>
                          {owned && <span style={ownedTag}>本棚にあります</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>}
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
    { id: 'requests', label: '申し込み中' },
  ];
  const followingIds = new Set([...(lists?.following || []), ...(lists?.sent || [])].map((p) => p.publicId));
  const mutual = new Set((lists?.following || []).map((p) => p.publicId));
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
                    <button type="button" style={btnLinkQuiet} onClick={() => respond(p, false)}>断る</button>
                    <button type="button" style={smallBtn} onClick={() => respond(p, true)}>承認</button>
                  </PersonRow>
                ))}
              </div>
            </section>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor={inputId} style={{ ...groupTitle, margin: 0 }}>フォローを申し込む</label>
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
            {preview?.missing && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--error)', lineHeight: 1.6 }}>{withPhraseBreaks(followResultMessage('not_found'))}</p>}
            {preview?.person && (
              <div role="status" style={{ ...row(true), borderBottom: '1px solid var(--separator)' }}>
                <UserAvatar avatarId={preview.person.avatar} nickname={preview.person.nickname} size={40} />
                <span style={nameStyle}>{preview.person.nickname || 'ニックネームなし'}</span>
                {preview.person.relation === 'self' ? <span style={note}>あなたです</span>
                  : preview.person.relation === 'pending' ? <span style={note}>承認を待っています</span>
                    : preview.person.relation === 'accepted'
                      ? <button type="button" style={btnLink} onClick={() => openPerson(preview.person)}>本棚を見る</button>
                      : <button type="button" style={smallBtn} onClick={() => ask(preview.person)}>申し込む</button>}
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
                  <p style={note}>{withPhraseBreaks('相手がこの ID を「フォローを申し込む」に入れると、あなたに申し込みが届きます。')}</p>
                </>
              ) : (
                <>
                  <p style={note}>{withPhraseBreaks('フォローし合うには、先にプロフィールでニックネームを決めます。')}</p>
                  <button type="button" onClick={() => setProfileOpen(true)} style={{ ...btnLink, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>ニックネームを決める</button>
                </>
              )}
            </div>

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
                  : <p style={note}>{withPhraseBreaks('フォロー中の人はいません。相手のリンクから申し込めます。')}</p>)}
                {tab === 'followers' && (lists.followers.length
                  ? lists.followers.map((p, i) => (
                    <PersonRow key={p.publicId} first={i === 0} person={p} onOpen={mutual.has(p.publicId) ? () => openPerson(p) : undefined}>
                      <button
                        type="button"
                        aria-label={`${who(p)}の操作`}
                        style={iconBtn}
                        onClick={(e) => openMenu(e, [
                          ...(followingIds.has(p.publicId) ? [] : [{ label: 'フォローを申し込む', onClick: () => ask(p) }]),
                          { label: 'フォロワーから外す', onClick: () => remove(p, 'follower') },
                          { label: '通報する', onClick: () => report(p) },
                          { label: 'ブロックする', destructive: true, onClick: () => block(p) },
                        ])}
                      >
                        <MoreHorizontal size="1.25em" aria-hidden="true" />
                      </button>
                    </PersonRow>
                  ))
                  : <p style={note}>{withPhraseBreaks(meReady ? 'フォロワーはいません。上の「あなたの ID」を渡すと、申し込みが届きます。' : 'フォロワーはいません。')}</p>)}
                {tab === 'requests' && (
                  <>
                    {lists.sent.length === 0 && <p style={note}>{withPhraseBreaks(lists.requests.length ? '送った申し込みはありません。届いた申し込みは上にあります。' : '送った申し込みはありません。')}</p>}
                    {lists.sent.length > 0 && <p style={{ ...note, margin: '0 0 var(--space-2)' }}>相手の承認を待っています。</p>}
                    {lists.sent.map((p, i) => (
                      <PersonRow key={`s-${p.publicId}`} first={i === 0} person={p}>
                        <button type="button" style={btnLinkQuiet} onClick={() => remove(p, 'following')}>取り消す</button>
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
                      <button type="button" style={btnLinkQuiet} onClick={() => unblock(p)}>ブロックを外す</button>
                    </PersonRow>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      </div>
    </BottomSheet>,
    document.body,
  )}{profileSheet}</>);
}
