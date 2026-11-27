// ✍️ 著者のシート（2026-11-25 オーナー「著者をお気に入り登録できるようにして・新作が出たらおすすめする」）。
//   本の詳細の著者の名前を押す → この著者の本（書店の新しい順・これから出る本も）と「お気に入りに入れる」。
//   お気に入りに入れると、新しい本が出たらホームの 1 行で知らせる（hooks/useFavoriteAuthors.js）。
//   設定の「お気に入りの著者」からは一覧（list）→ 押すとその著者。AI は使わない。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Star, ChevronRight, MessageCircle } from 'lucide-react';
import { isLargeText } from '../lib/largeText';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import EmptyState from './EmptyState';
import MiniCover from './MiniCover';
import { Chip } from './formPrimitives';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { btnGhost, btnLinkQuiet, btnTonal } from '../styles/ui';
import {
  fetchAuthorBooks, cachedAuthorBooks, isRecentBook, isUpcoming, releaseLabel, newBooksFor, authorKey, splitAuthorNames,
} from '../lib/favoriteAuthors';
import { track } from '../lib/analytics';
import { toSaveMessage } from '../lib/errors';
import { useOnline } from '../hooks/useOnline';

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };

/**
 * props:
 *   names      … 著者の名前の配列（本の著者の欄から・1〜5 人）。空なら一覧（お気に入りの著者）から始める
 *   fav        … useFavoriteAuthors の戻り値（favs・isFavorite・add・remove・dismiss）
 *   onAddWant  … (book) => 'added' | 'exists' | 'error'（App.jsx の addWantFromOther）
 *   hasBook    … (book) => 本棚にあるか
 *   reason     … 本の詳細から開いたときの、その本（『考え方』★5 など・なぜこの著者か）
 */
export default function AuthorSheet({ names = [], fav, onAddWant, hasBook, onClose, reason = null, books = [], onTalk = null }) {
  const toast = useToast();
  const online = useOnline();
  const [current, setCurrent] = useState(names[0] || '');
  const [state, setState] = useState({ status: 'idle', books: [] });
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(() => new Set());
  const bodyRef = useRef(null);

  // 読み込みは 1 つだけ（「もう一度」の読み込みも、著者を替えたら止める＝前の著者の本で上書きしない・2026-11-26 点検）。
  const loadCtrlRef = useRef(null);
  const load = (name, { force = false } = {}) => {
    loadCtrlRef.current?.abort();
    loadCtrlRef.current = null;
    if (!name) return () => {};
    const hit = cachedAuthorBooks(name);
    // 覚えている本があれば先に出し、6 時間より古ければ裏で読み直す。
    if (hit && !force) setState({ status: 'ready', books: hit.books });
    else setState({ status: 'loading', books: [] });
    if (hit && !force && Date.now() - hit.at < 6 * 60 * 60 * 1000) return () => {};
    const ctrl = new AbortController();
    loadCtrlRef.current = ctrl;
    fetchAuthorBooks(name, { signal: ctrl.signal }).then((r) => {
      if (ctrl.signal.aborted) return;
      if (r.ok) setState({ status: 'ready', books: r.books });
      else if (!hit) setState({ status: 'error', books: [] });
    }).catch(() => {});
    return () => ctrl.abort();
  };

  useEffect(() => load(current), [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const favorite = current ? fav.isFavorite(current) : false;
  // 🌐 この著者の本と話す（2026-11-25・対話の世界）: 本棚の読書中・読了の本（この著者が書いた本）を話し相手に相談を開く。
  const talkIds = useMemo(() => {
    const k = authorKey(current);
    if (!k) return [];
    return (books || []).filter((b) => (b.status === 'reading' || b.status === 'done') && splitAuthorNames(b.author).some((n) => authorKey(n) === k)).map((b) => b.id);
  }, [books, current]);
  const favRec = fav.favs.find((f) => f.key === authorKey(current));
  const newIsbns = useMemo(
    () => new Set(favRec ? newBooksFor(favRec, state.books, { isOwned: (b) => !!hasBook?.(b) }).map((b) => b.isbn) : []),
    [favRec, state.books, hasBook],
  );

  const toggleFavorite = async () => {
    if (busy || !current) return;
    setBusy(true);
    try {
      if (favorite) {
        await fav.remove(current);
        track('fav_author_remove', {});
        toast.info(`${current}さんを、お気に入りから外しました。`);
      } else {
        await fav.add(current);
        track('fav_author_add', { from: reason ? 'book' : 'list' });
        toast.success(`${current}さんを、お気に入りに入れました。`);
      }
    } catch (e) {
      toast.error(toSaveMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const addWant = async (book) => {
    const r = await onAddWant?.(book);
    if (r === 'added' || r === 'exists') {
      setAdded((s) => new Set(s).add(book.isbn));
      // 読みたいに入れた本は、もう新しい本として知らせない。
      if (favRec) fav.dismiss(favRec.key, [book.isbn]);
      track('fav_author_want', { fresh: newIsbns.has(book.isbn) });
    }
  };

  const large = isLargeText();
  const wantControl = (b, owned) => (owned ? (
    <span style={{ display: 'inline-block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', whiteSpace: 'nowrap', ...(large ? { marginTop: 'var(--space-2)' } : null) }}>本棚にあります</span>
  ) : (
    <button type="button" onClick={() => addWant(b)} style={{ ...btnTonal, minHeight: 'var(--tap-min)', padding: '0 var(--space-3)', fontSize: 'var(--text-sub)', whiteSpace: 'nowrap', flexShrink: 0, ...(large ? { marginTop: 'var(--space-2)' } : null) }}>読みたいに追加</button>
  ));

  const openAuthor = (name) => {
    setCurrent(name);
    bodyRef.current?.closest('[data-sheet-scroll]')?.scrollTo?.({ top: 0 });
  };

  // ---- お気に入りの著者の一覧（設定から開いたとき） ----
  if (!current) {
    return (
      <BottomSheet title="お気に入りの著者" onClose={onClose}>
        {fav.favs.length === 0 ? (
          <EmptyState
            icon={<Star size={28} />}
            title="お気に入りの著者は、まだいません"
            description="本の詳細で著者の名前を押すと、お気に入りに入れられます。新しい本が出たら、ホームでお知らせします。"
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {fav.favs.map((f, i) => {
              const hit = cachedAuthorBooks(f.name);
              const n = hit ? newBooksFor(f, hit.books, { isOwned: (b) => !!hasBook?.(b) }).length : 0;
              return (
                <li key={f.key} style={{ borderBottom: i < fav.favs.length - 1 ? '1px solid var(--separator)' : 'none' }}>
                  <button type="button" onClick={() => openAuthor(f.name)} style={{ width: '100%', minHeight: 'calc(var(--btn-h) + var(--space-2))', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'none', border: 'none', padding: 'var(--space-2) 0', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600 }}>{f.name}</span>
                      {n > 0 && <span style={{ display: 'block', fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)' }}>新しい本 {n}&nbsp;冊</span>}
                    </span>
                    <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </BottomSheet>
    );
  }

  const fromList = names.length === 0;
  return (
    <BottomSheet title={`${current}`} onClose={onClose}>
      <div ref={bodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {fromList && (
          <button type="button" onClick={() => setCurrent('')} style={{ ...btnLinkQuiet, alignSelf: 'flex-start' }}>‹ お気に入りの著者</button>
        )}
        {names.length > 1 && (
          <div role="tablist" aria-label="著者" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {names.map((n) => (
              <Chip key={n} size="select" role="tab" aria-selected={n === current} active={n === current} onClick={() => openAuthor(n)}>{n}</Chip>
            ))}
          </div>
        )}
        {reason && <p style={note}>{withPhraseBreaks(reason)}</p>}

        {favorite ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <p style={{ ...note, flex: '1 1 12em', display: 'flex', gap: 'var(--space-1)', alignItems: 'flex-start', color: 'var(--text)' }}>
              <Star size="1.2em" aria-hidden="true" fill="currentColor" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '0.15em' }} />
              <span>お気に入りの著者です</span>
            </p>
            <button type="button" onClick={toggleFavorite} disabled={busy} style={{ ...btnLinkQuiet, minWidth: 'var(--tap-min)', justifyContent: 'flex-end', marginRight: 'calc(-1 * var(--space-1))' }}>外す</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <button type="button" onClick={toggleFavorite} disabled={busy} style={{ ...btnGhost, gap: 'var(--space-2)' }}>
              <Star size="1.1em" aria-hidden="true" />お気に入りに入れる
            </button>
            <p style={{ ...note, color: 'var(--text-3)' }}>{withPhraseBreaks('新しい本が出たら、ホームでお知らせします。')}</p>
          </div>
        )}

        {onTalk && talkIds.length > 0 && (
          <button type="button" onClick={() => { track('dialogue_pick', { kind: 'author_sheet', books: talkIds.length }); onTalk(talkIds, current || null); }} style={{ ...btnGhost, gap: 'var(--space-2)' }}>
            <MessageCircle size="1.1em" aria-hidden="true" />{talkIds.length > 1 ? `この著者の本と話す（${talkIds.length} 冊）` : 'この著者の本と話す'}
          </button>
        )}
        <section aria-labelledby="author-books-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <h3 id="author-books-h" style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text-2)' }}>この著者の本（新しい順）</h3>
        {state.status === 'loading' && (
          <div aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <SkeletonBlock width={44} height={66} radius="var(--radius-cover)" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <SkeletonBlock width="70%" height={14} />
                  <SkeletonBlock width="40%" height={12} />
                </div>
              </div>
            ))}
          </div>
        )}
        {state.status === 'error' && (
          <ErrorMessage title="この著者の本を読めませんでした" description={online ? '書店から本の一覧を受け取れませんでした。少し時間をおいて、もう一度お試しください。' : 'オフラインです。つながってから、もう一度お試しください。'} actions={[{ label: 'もう一度', onClick: () => load(current, { force: true }) }]} />
        )}
        {state.status === 'ready' && state.books.length === 0 && (
          <p style={note}>{withPhraseBreaks('書店で、この著者の本が見つかりませんでした。')}</p>
        )}
        {state.status === 'ready' && state.books.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {state.books.map((b) => {
              const owned = added.has(b.isbn) || !!hasBook?.(b);
              const fresh = newIsbns.has(b.isbn) || (isRecentBook(b) && !owned);
              return (
                // 文字が大きいときは「読みたいに追加」を書名の下へ（右の押せる欄に書名が押されて「エリック／・／シュミ…」と細切れになっていた・2026-11-27 点検）。
                <li key={b.isbn} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: large ? 'flex-start' : 'center', padding: 'var(--space-3) 0', ...(b === state.books[0] ? { paddingTop: 0 } : null), borderBottom: '1px solid var(--separator)' }}>
                  <MiniCover title={b.title} cover={b.cover} width={44} />
                  {/* 書名は 3 行まで・長い語はカタカナと漢字の境で割る（「エリック・シュミットの、…」で本が見分けられなかった・2026-11-26 点検）。 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(b.title, { scriptBreaks: true })}</p>
                    <p style={{ ...note, color: 'var(--text-3)', marginTop: 'var(--space-1)', display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)' }}>
                      {fresh && <span style={{ color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{isUpcoming(b) ? 'これから出る本' : '新しい本'}</span>}
                      <span style={{ whiteSpace: 'nowrap' }}>{releaseLabel(b)}</span>
                    </p>
                    {large && wantControl(b, owned)}
                  </div>
                  {!large && wantControl(b, owned)}
                </li>
              );
            })}
          </ul>
        )}
        </section>
      </div>
    </BottomSheet>
  );
}
