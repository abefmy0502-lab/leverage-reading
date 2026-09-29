// 📚 これまで読んだ本で、相談相手をつくる（初日クイックスタート）。
//
// 一番の価値「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を初日に体験させる。
// 入れたばかりの人はメモ 0 件で相談しても根拠が無い（最大の壁）。すでに読んだ本と
// 「覚えていること」を 5 分で入れてもらい、その場で複数の本をつなげた答えを返す。
// 設計: company/feature-past-books-quickstart.md（2026-09-26 オーナー承認・おすすめ案）
//   - 冊数: 1〜5 冊（1 冊から「次へ」が押せる・3 冊がおすすめ＝「あと N 冊でもっと良くなります」・2026-09-29）
//   - 入口: 初回ガイド最後の主ボタン ＋ はじめの一歩 ＋ ホームの相談カード（メモ 0 件時）
//   - 一言: 「思い出せない」でスキップ可（責めない）
// DB 変更なし（books は status='done' で、一言は book_memos のカード式メモとして入る）。
//
// 見た目は DESIGN.md に従う（2026-09-26 作り直し）: トークンだけ・主ボタンは各段階に 1 つ・
// 説明の補足文は置かない（§0-6）・選択はアクセント色の丸いチェック（iOS の選択リストの作法）。

import { useEffect, useRef, useState } from 'react';
import NotifyOptInCard from './NotifyOptInCard';
import { quickstartWorries, countSummaryMemos, fmtTokens, consultsLeft } from '../lib/consultHelpers';
import { X, Search, SearchX, Check, ChevronLeft, Plus } from 'lucide-react';
import { usePaywall } from '../state/PaywallContext';
import { TOKEN_COSTS } from '../lib/tokens';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBlockEdgeSwipe } from '../hooks/useEdgeSwipeBack';
import { searchBooks } from '../lib/bookSearch';
import { findDuplicateBook } from '../lib/checkDuplicate';
import { invalidateKnowledgeCache } from '../lib/ai';
import { LIMITS, clamp } from '../lib/limits';
import { track, EVENTS } from '../lib/analytics';
import { btnPrimary, btnPrimaryOff, btnGhost, btnGhostOff, btnLink, input as inputStyle, card, groupTitle } from '../styles/ui';
import { MiniCover } from './BookCards';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';

const MIN_BOOKS = 1;
const RECOMMENDED_BOOKS = 3; // これより少ないときは「あと N 冊でもっと良くなります」（押せなくはしない）
const MAX_BOOKS = 5;

// 検索欄が空のときに出す、よく読まれているビジネス書（AI を使わない固定の一覧・押すとそのまま選べる）。
// 表紙は保存のあとに書名・著者から探す（App.jsx の resolveCoverInBackground）。
// 各本の困りごと（できあがりの画面の「たとえば」に先に出す）は lib/consultHelpers.js の BOOK_WORRIES。
const POPULAR_BOOKS = [
  ['7つの習慣', 'スティーブン・R・コヴィー'],
  ['人を動かす', 'D・カーネギー'],
  ['嫌われる勇気', '岸見一郎・古賀史健'],
  ['イシューからはじめよ', '安宅和人'],
  ['エッセンシャル思考', 'グレッグ・マキューン'],
  ['FACTFULNESS', 'ハンス・ロスリング'],
  ['影響力の武器', 'ロバート・B・チャルディーニ'],
  ['伝え方が9割', '佐々木圭一'],
  ['1兆ドルコーチ', 'エリック・シュミット'],
  ['数値化の鬼', '安藤広大'],
  ['思考の整理学', '外山滋比古'],
  ['夢をかなえるゾウ', '水野敬也'],
].map(([title, author]) => ({ title, author, isbn: '', cover: '', manual: true }));
const COVER_W = 36; // 一覧の表紙（高さは MiniCover が 1.42 倍で決める）

// ---- 画面の骨組み ----------------------------------------------------------
const overlay = {
  position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)', background: 'var(--bg)',
  display: 'flex', flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
};
const headerRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  // 左右 0: 44 のボタン内の余白＋アイコン内の余白で、× の見た目の右端がちょうど 16 になる（DESIGN §5）。
  padding: 'var(--space-2) 0 0', flexShrink: 0,
};
const iconBtn = {
  width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', padding: 0,
  color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
};
const body = {
  flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  padding: 'var(--space-2) var(--space-4) var(--space-6)',
};
const footer = {
  flexShrink: 0, padding: 'var(--space-3) var(--space-4) var(--space-4)',
  borderTop: '1px solid var(--separator)', background: 'var(--bg)',
};

// ---- 文字 ------------------------------------------------------------------
const title = {
  fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, margin: 0,
};
const sub = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, margin: 'var(--space-2) 0 0' };
const sectionLabel = {
  fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-2)',
};
const oneLine = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// ---- 一覧（本をえらぶ） ----------------------------------------------------
const listGroup = { ...card, padding: 0, overflow: 'hidden', listStyle: 'none', margin: 0 };
const rowBtn = (first) => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'left',
  padding: 'var(--space-3) var(--space-4)', minHeight: 64, cursor: 'pointer', fontFamily: 'inherit',
  background: 'transparent', border: 'none', borderTop: first ? 'none' : '1px solid var(--separator)',
  color: 'var(--text)',
});
// iOS の選択リストと同じ丸いチェック。選択中だけアクセント（DESIGN §3-2「選択中」）。
const checkCircle = (on) => ({
  width: 24, height: 24, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: on ? 'var(--accent)' : 'transparent',
  border: on ? 'none' : '2px solid var(--border)',
  color: 'var(--accent-ink)',
});

// DESIGN §5 のチップ: 見た目 32・押せる範囲 44（App.jsx の ShelfChip と同じ形）。
const chipHit = {
  display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, flexShrink: 0,
  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', maxWidth: 200,
};
const chipFace = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', height: 32, maxWidth: '100%',
  padding: '0 var(--space-2) 0 var(--space-3)', borderRadius: 'var(--radius)', boxSizing: 'border-box',
  background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-meta)', whiteSpace: 'nowrap',
};

// 相談例（ホームの相談カードと同じ: --fill 面・枠なしの UI 文字・全幅で縦に並べる）。
const askChip = {
  display: 'block', width: '100%', minHeight: 44, padding: 'var(--space-3)', textAlign: 'left',
  background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5,
};
// 選ぶためのチップ（DESIGN §5: 高さ 44・15px・余白 8/12・選択中は --accent-soft 面＋--accent 文字 600）。
const pickChip = (on) => ({
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.3, textAlign: 'left',
  background: on ? 'var(--accent-soft)' : 'var(--fill)', color: on ? 'var(--accent)' : 'var(--text)',
  fontSize: 'var(--text-sub)', fontWeight: on ? 600 : 400,
});

const bookKey = (b) => (b.isbn ? `isbn:${b.isbn}` : `t:${b.title}|${b.author || ''}`);

function BookRow({ book, on, first, onToggle }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-pressed={on} style={rowBtn(first)}>
        <MiniCover book={book} width={COVER_W} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...oneLine, fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.4 }}>{book.title}</span>
          {book.author && (
            <span style={{ ...oneLine, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, marginTop: 'var(--space-1)' }}>
              {book.author}
            </span>
          )}
        </span>
        <span style={checkCircle(on)} aria-hidden="true">
          {on && <Check size={16} strokeWidth={3} />}
        </span>
      </button>
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div style={listGroup} role="status" aria-label="探しています">
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ ...rowBtn(i === 0), cursor: 'default' }}>
          <SkeletonBlock width={COVER_W} height={Math.round(COVER_W * 1.42)} radius={4} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <SkeletonBlock width="70%" height={16} radius="var(--radius-full)" />
            <SkeletonBlock width="40%" height={12} radius="var(--radius-full)" />
          </span>
        </div>
      ))}
    </div>
  );
}

// 押せない主ボタン。薄くすると「あと N 冊」が読めなくなるので、面と文字の色で押せないことを示す。

export default function PastBooksQuickstart({ books = [], onSaveBook, onAsk, onClose, onWriteMemo, onImport, onMarkRead, onMemosAdded }) {
  const { user } = useAuth();
  const toast = useToast();
  const { freeMode, freeRemaining } = usePaywall();
  const trapRef = useFocusTrap(true);
  const [step, setStep] = useState('pick'); // 'pick' | 'memo' | 'saving' | 'done'
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(''); // 結果を出している検索語
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null); // null=未検索
  const [searchError, setSearchError] = useState(false);
  const [picked, setPicked] = useState([]); // [{ book, memo }]
  const [idx, setIdx] = useState(0);
  const [summary, setSummary] = useState({ books: [], memos: 0, totalMemos: 0, totalBooks: 0 });
  // できあがりの画面の「いま困っていること」（そのまま相談へ送る）
  const [askText, setAskText] = useState('');
  const askRef = useRef(null);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 }); // 保存中の進み具合（冊）
  const memoRef = useRef(null);
  const searchRef = useRef(null);
  // 選んだ本・書いた一言がまだ保存されていない間は、ブラウザの「戻る」でアプリごと離れて消えないようにする。
  useBlockEdgeSwipe(picked.length > 0 && (step === 'pick' || step === 'memo' || step === 'saving'));

  useEffect(() => { track('quickstart_started'); }, []);
  useEffect(() => { if (step === 'memo') memoRef.current?.focus(); }, [step, idx]);

  // 本棚にすでにある読書中・読了の本（本はあるがメモ 0 件の人向け）。未検索のときだけ出す。
  const shelfBooks = books.filter((b) => b.status === 'done' || b.status === 'reading').slice(0, 8);

  const runSearch = async (raw = query) => {
    const q = raw.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(false);
    setSearched(q);
    try {
      const r = await searchBooks(q);
      if (!r.ok) setSearchError(true);
      setResults(r.ok ? r.results.slice(0, 8) : []);
    } catch {
      setSearchError(true);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // 同じ本か（ISBN の一致、または書名の一致＝著者は両方あるときだけ比べる）。
  // 検索結果の本と「『X』を書名だけで追加」が同じ本として二重に入らないように（2026-09-27）。
  const pickedMatch = (b) => {
    const hit = findDuplicateBook(picked.map((p) => p.book), b);
    return hit ? picked.find((p) => p.book === hit) : null;
  };
  const isPicked = (b) => !!pickedMatch(b);
  const toggle = (b) => {
    const hit = pickedMatch(b);
    if (hit) {
      setPicked((arr) => arr.filter((p) => p !== hit));
      return;
    }
    if (picked.length >= MAX_BOOKS) {
      toast.info(`えらべるのは ${MAX_BOOKS} 冊までです。`);
      return;
    }
    setPicked((arr) => [...arr, { book: b, memo: '' }]);
    // 次の 1 冊をすぐ打てるように、入力欄と前の検索結果を消す（よく読まれている本・本棚の本の一覧に戻る）。
    setQuery('');
    setResults(null);
    setSearched('');
    setSearchError(false);
  };
  const titleOnlyBook = searched
    ? { title: clamp(searched, LIMITS.bookTitle), author: '', isbn: '', cover: '', manual: true }
    : null;

  const setMemo = (text) => setPicked((arr) => arr.map((p, i) => (i === idx ? { ...p, memo: text } : p)));
  const nextMemo = () => {
    if (idx < picked.length - 1) setIdx(idx + 1);
    else saveAll();
  };
  const skipMemo = () => {
    setMemo('');
    if (idx < picked.length - 1) setIdx(idx + 1);
    else saveAll(picked.map((p, i) => (i === idx ? { ...p, memo: '' } : p)));
  };

  const saveAll = async (entries = picked) => {
    if (!user || !isSupabaseConfigured) return;
    setStep('saving');
    setSaveProgress({ done: 0, total: entries.length });
    const savedBooks = [];
    const memoRows = [];
    let newBooks = 0;
    for (const e of entries) {
      try {
        // 既に本棚にある本は追加せず、その本に一言だけ足す（重複登録しない）。
        const existing = findDuplicateBook(books, e.book);
        const saved = existing || await onSaveBook?.(e.book);
        if (!saved?.id) continue;
        if (!existing) newBooks += 1;
        savedBooks.push({ ...e.book, ...saved });
        const text = clamp(e.memo.trim(), LIMITS.memoText);
        if (text) memoRows.push({ user_id: user.id, book_id: saved.id, text, page_number: null, tags: [], photo_path: null });
        // 本棚にあった「読みたい・積読」の本に一言を足したら読了にする（メモが本の詳細に出るように）
        if (text && existing && (existing.status === 'want' || existing.status === 'before')) onMarkRead?.(existing.id);
      } catch (err) {
        console.warn('[quickstart] book save failed:', err?.message || err);
      }
      setSaveProgress((p) => ({ ...p, done: Math.min(p.done + 1, p.total) }));
    }
    let memoCount = 0;
    if (memoRows.length) {
      const { error } = await supabase.from('book_memos').insert(memoRows);
      if (error) {
        console.warn('[quickstart] memo insert failed:', error.message);
        toast.error('メモを保存できませんでした。本は本棚に追加されています。');
      } else {
        memoCount = memoRows.length;
        invalidateKnowledgeCache();
        onMemosAdded?.(); // ホームの相談の件数などを取り直す
        track(EVENTS.MEMO_ADDED, { via: 'quickstart', count: memoCount });
      }
    }
    track('quickstart_completed', { books: savedBooks.length, memos: memoCount });
    // 「メモ N 件」はホーム・相談と同じ数え方（カード式＋学びの全件＋「この本のまとめ」の入っている本）。
    // 数えられなければ今回の件数。
    let totalMemos = memoCount;
    try {
      const { count, error } = await supabase.from('book_memos').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
      if (!error && typeof count === 'number') totalMemos = Math.max(count, memoCount) + countSummaryMemos(books);
    } catch { /* 今回の件数のまま */ }
    setSummary({ books: savedBooks, memos: memoCount, totalMemos, totalBooks: books.length + newBooks });
    setStep('done');
  };

  const stepLabel = step === 'pick' ? '1 / 3' : step === 'memo' ? '2 / 3' : step === 'done' ? '3 / 3' : '';

  const header = (
    <div style={headerRow}>
      {step === 'memo' ? (
        <button type="button" aria-label="戻る" onClick={() => (idx > 0 ? setIdx(idx - 1) : setStep('pick'))} style={iconBtn}>
          <ChevronLeft size={28} aria-hidden="true" />
        </button>
      ) : <span style={{ width: 44 }} aria-hidden="true" />}
      {/* 題名で「相談相手をつくっている」ことを 3 ステップの間ずっと見せる（補足文ではなく題名で伝える）。 */}
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
        {/* 3/3 は見出しが「できました」を言うので、題名は出さない（同じ言葉を二度言わない）。 */}
        {step !== 'done' && <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>相談相手をつくる</span>}
        {stepLabel && (
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{stepLabel}</span>
        )}
      </span>
      {/* 保存中は閉じられない。薄くせず（opacity）文字色で示す（DESIGN §5「押せないボタン」）。 */}
      <button type="button" aria-label="閉じる" onClick={onClose} disabled={step === 'saving'}
        style={{ ...iconBtn, opacity: 1, color: step === 'saving' ? 'var(--text-3)' : 'var(--text)', cursor: step === 'saving' ? 'default' : 'pointer' }}>
        <X size={24} aria-hidden="true" />
      </button>
    </div>
  );

  const current = picked[idx];
  const titlePicked = titleOnlyBook && isPicked(titleOnlyBook);

  return (
    <div ref={trapRef} role="dialog" aria-modal="true" aria-label="これまで読んだ本から始める" style={overlay}>
      {header}

      {/* ===== 1 / 3 本をえらぶ ===== */}
      {step === 'pick' && (
        <>
          <div style={body}>
            <h1 style={title}>これまで読んで、<br />印象に残っている本は？</h1>
            {/* 句のまとまりで折り返す（「はじめられ／ます」と割らない） */}
            <p style={sub}>
              <span style={{ display: 'inline-block' }}>{RECOMMENDED_BOOKS} 冊ほどがおすすめです。</span>
              <span style={{ display: 'inline-block' }}>{MIN_BOOKS} 冊からでもはじめられます</span>
            </p>
            {onImport && (
              <button type="button" onClick={onImport} style={{ ...btnLink, padding: 0, marginTop: 'var(--space-1)' }}>
                ブクログ・読書メーター・Kindle から取り込む
              </button>
            )}

            <div role="search" style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search size={20} aria-hidden="true"
                  style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
                  placeholder="書名や著者名"
                  aria-label="書名や著者名で探す"
                  maxLength={LIMITS.bookTitle}
                  enterKeyHint="search"
                  autoComplete="off"
                  ref={searchRef}
                  style={{ ...inputStyle, paddingLeft: 'calc(var(--space-3) + 20px + var(--space-2))', paddingRight: query ? 'var(--space-12)' : undefined }}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="入力を消す"
                    onClick={() => { setQuery(''); setResults(null); setSearched(''); setSearchError(false); searchRef.current?.focus(); }}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              {/* 主ボタンは下の「次へ」だけ（DESIGN §0-2）。検索は副ボタン。 */}
              <button type="button" onClick={() => runSearch()} disabled={!query.trim() || searching}
                style={{ ...(query.trim() && !searching ? btnGhost : btnGhostOff), width: 'auto', flexShrink: 0 }}>
                検索
              </button>
            </div>

            <div style={{ marginTop: 'var(--space-4)' }} aria-live="polite">
              {searching && <ResultsSkeleton />}

              {!searching && searchError && (
                <ErrorMessage
                  title="検索できませんでした"
                  description="通信状況を確かめて、もう一度お試しください。"
                  actions={[
                    { label: 'もう一度', onClick: () => runSearch(searched) },
                    // 検索が落ちていても先へ進めるように（書名だけでも相談相手にできる）。
                    ...(searched ? [{
                      label: titlePicked ? '追加しました' : '書名だけで追加',
                      ariaLabel: titlePicked ? `「${searched}」を外す` : `「${searched}」を書名だけで追加`,
                      variant: 'ghost',
                      onClick: () => toggle(titleOnlyBook),
                    }] : []),
                  ]}
                />
              )}

              {!searching && !searchError && results && results.length === 0 && (
                <EmptyState
                  icon={<SearchX size={32} aria-hidden="true" />}
                  title="見つかりませんでした"
                  description="書名だけでも追加できます"
                  actions={[{
                    label: titlePicked ? '追加しました' : '書名だけで追加',
                    ariaLabel: titlePicked ? `「${searched}」を外す` : `「${searched}」を書名だけで追加`,
                    variant: 'secondary',
                    icon: titlePicked ? <Check size={20} /> : <Plus size={20} />,
                    onClick: () => toggle(titleOnlyBook),
                  }]}
                />
              )}

              {!searching && !searchError && results && results.length > 0 && (
                <>
                  <ul style={listGroup}>
                    {results.map((b, i) => (
                      <BookRow key={bookKey(b)} book={b} first={i === 0} on={isPicked(b)} onToggle={() => toggle(b)} />
                    ))}
                  </ul>
                  <button type="button" onClick={() => toggle(titleOnlyBook)} aria-pressed={!!titlePicked}
                    style={{ ...btnLink, padding: 'var(--space-3) 0', marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', justifyContent: 'flex-start', textAlign: 'left', maxWidth: '100%' }}>
                    {titlePicked ? <Check size={20} aria-hidden="true" style={{ flexShrink: 0 }} /> : <Plus size={20} aria-hidden="true" style={{ flexShrink: 0 }} />}
                    <span style={{ ...oneLine, minWidth: 0 }}>「{searched}」を書名だけで追加</span>
                  </button>
                </>
              )}

              {!searching && !results && shelfBooks.length > 0 && (
                <section aria-label="本棚の本">
                  <h2 style={sectionLabel}>本棚の本</h2>
                  <ul style={listGroup}>
                    {shelfBooks.map((b, i) => (
                      <BookRow key={b.id || bookKey(b)} book={b} first={i === 0} on={isPicked(b)} onToggle={() => toggle(b)} />
                    ))}
                  </ul>
                </section>
              )}

              {/* 検索欄が空のとき: よく読まれている本（押すとそのまま選べる・AI は使わない） */}
              {!searching && !results && !query.trim() && (
                <section aria-labelledby="qs-popular" style={shelfBooks.length > 0 ? { marginTop: 'var(--space-6)' } : null}>
                  <h2 id="qs-popular" style={sectionLabel}>よく読まれている本</h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {POPULAR_BOOKS.map((b) => {
                      const on = isPicked(b);
                      return (
                        <button key={b.title} type="button" onClick={() => toggle(b)} aria-pressed={on} aria-label={`『${b.title}』${b.author}`} style={pickChip(on)}>
                          {on && <Check size={16} aria-hidden="true" style={{ flexShrink: 0 }} />}
                          {b.title}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>

          <div style={footer}>
            {picked.length > 0 && (
              <div style={{ display: 'flex', columnGap: 'var(--space-2)', overflowX: 'auto', margin: '0 calc(-1 * var(--space-4)) var(--space-2)', padding: '0 var(--space-4)', scrollbarWidth: 'none' }}>
                {picked.map((p) => (
                  <button key={bookKey(p.book)} type="button" onClick={() => toggle(p.book)} aria-label={`『${p.book.title}』を外す`} style={chipHit}>
                    <span style={chipFace}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.book.title}</span>
                      <X size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-2)' }} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {/* 1 冊から進めるが、3 冊ほどあると本をまたいだ答えになる（押せなくはしない・ヒントだけ） */}
            {picked.length > 0 && picked.length < RECOMMENDED_BOOKS && (
              <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                あと {RECOMMENDED_BOOKS - picked.length} 冊でもっと良くなります
              </p>
            )}
            <button type="button" style={picked.length >= MIN_BOOKS ? btnPrimary : btnPrimaryOff}
              disabled={picked.length < MIN_BOOKS}
              onClick={() => { setIdx(0); setStep('memo'); }}>
              {picked.length >= MIN_BOOKS ? `次へ（${picked.length} 冊）` : `あと ${MIN_BOOKS - picked.length} 冊`}
            </button>
          </div>
        </>
      )}

      {/* ===== 2 / 3 覚えていることを一言 ===== */}
      {step === 'memo' && current && (
        <>
          <div style={body}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <MiniCover book={current.book} width={48} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{
                  margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {current.book.title}
                </p>
                {current.book.author && (
                  <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, ...oneLine }}>
                    {current.book.author}
                  </p>
                )}
                <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
                  {idx + 1} 冊目 / {picked.length} 冊
                </p>
              </div>
            </div>

            <h1 style={{ ...title, marginTop: 'var(--space-6)' }}>この本で、いちばん<br />覚えていることは？</h1>
            <p style={sub}>うろ覚え・一言で大丈夫です</p>
            <textarea
              ref={memoRef}
              value={current.memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              maxLength={LIMITS.memoText}
              placeholder="例：やらないことを決めるのが、一番大事な仕事"
              aria-label={`『${current.book.title}』でいちばん覚えていること`}
              style={{
                ...inputStyle, display: 'block', marginTop: 'var(--space-4)', resize: 'none', minHeight: 128,
                // メモは「読む文章」（DESIGN §2: 明朝 18・行間 1.6）
                fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6,
              }}
            />
          </div>
          <div style={{ ...footer, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <button type="button" style={current.memo.trim() ? btnPrimary : btnPrimaryOff}
              disabled={!current.memo.trim()} onClick={nextMemo}>
              {idx < picked.length - 1 ? '次の本へ' : '相談相手をつくる'}
            </button>
            <button type="button" style={{ ...btnLink, width: '100%' }} onClick={skipMemo}>
              思い出せないので飛ばす
            </button>
          </div>
        </>
      )}

      {/* ===== 保存中 ===== */}
      {step === 'saving' && (
        // できあがりの画面と同じ形（えらんだ本の表紙＋見出し 2 行）の骨組みで待たせる（跳ねない）。
        <div style={body} role="status" aria-live="polite">
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }} aria-hidden="true">
            {picked.map((p) => <MiniCover key={bookKey(p.book)} book={p.book} width={56} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
            <SkeletonBlock width="70%" height="var(--text-title)" radius="var(--radius)" />
            <SkeletonBlock width="45%" height="var(--text-title)" radius="var(--radius)" />
          </div>
          <p style={sub}>
            {saveProgress.total > 0
              ? `本棚に入れています（${saveProgress.done} / ${saveProgress.total} 冊）`
              : '本棚に入れています'}
          </p>
        </div>
      )}

      {/* ===== 3 / 3 できあがり ===== */}
      {step === 'done' && summary.books.length === 0 && (
        <>
          <div style={{ ...body, paddingTop: 'var(--space-8)' }}>
            <ErrorMessage
              title="本を追加できませんでした"
              description="通信状況を確かめて、もう一度お試しください。"
              actions={[{ label: 'もう一度', onClick: () => saveAll(picked) }]}
            />
          </div>
          <div style={footer}>
            <button type="button" style={btnGhost} onClick={onClose}>閉じる</button>
          </div>
        </>
      )}

      {step === 'done' && summary.books.length > 0 && (
        <>
          <div style={body}>
            {/* えらんだ本の表紙を並べる＝「この本たちが相談相手」をひと目で */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }} aria-hidden="true">
              {summary.books.map((b) => <MiniCover key={b.id || bookKey(b)} book={b} width={56} />)}
            </div>
            {summary.memos > 0 ? (
              <>
                <h1 style={{ ...title, marginTop: 'var(--space-6)' }}>あなたの相談相手が<br />できました</h1>
                {/* ホームの相談カードと同じ数え方・同じ言葉（あなたの N 冊・メモ M 件） */}
                <p style={{ ...sub, fontVariantNumeric: 'tabular-nums' }}>あなたの {summary.totalBooks || summary.books.length} 冊・メモ {summary.totalMemos || summary.memos} 件から答えます</p>
              </>
            ) : (
              <>
                {/* メモが無いと相談の根拠が無いので「相談相手ができた」とは言わない（正直に）。 */}
                <h1 style={{ ...title, marginTop: 'var(--space-6)' }}>{summary.books.length} 冊を本棚に入れました</h1>
                <p style={sub}>まだメモがありません</p>
              </>
            )}

            {summary.memos > 0 && (
              // 最初の相談は、本からの例ではなく「いま困っていること」をそのまま（相談は困りごとから始まる）。
              <section aria-labelledby="qs-ask" style={{ marginTop: 'var(--space-8)' }}>
                <h2 id="qs-ask" style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '0 0 var(--space-3)' }}>
                  いま困っていること
                </h2>
                {freeMode && freeRemaining > 0 && (
                  <p style={{ ...sub, margin: 'calc(-1 * var(--space-2)) 0 var(--space-3)' }}>今月の残り {fmtTokens(freeRemaining)} トークン（相談 約 {consultsLeft(freeRemaining, TOKEN_COSTS.consult)} 回）</p>
                )}
                <textarea
                  ref={askRef}
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  rows={2}
                  maxLength={LIMITS.aiQuestion}
                  placeholder="例：上司への報告がうまくいかない"
                  aria-labelledby="qs-ask"
                  style={{ ...inputStyle, display: 'block', resize: 'none', lineHeight: 1.5 }}
                />
                <button
                  type="button"
                  style={{ ...btnPrimary, marginTop: 'var(--space-3)' }}
                  onClick={() => {
                    const q = askText.trim();
                    // 空のまま押したら入力欄へ（主ボタンは薄くしない・ホームの相談カードと同じ）
                    if (!q) { askRef.current?.focus(); return; }
                    track('quickstart_first_consult', { example: false });
                    onAsk?.(q);
                  }}
                >
                  相談する
                </button>
                <p style={{ ...groupTitle, margin: 'var(--space-4) 0 var(--space-2)' }}>たとえば</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {/* えらんだ本の困りごとを先に（AI を使わない・本ごとに決めた 1 つ）。 */}
                  {quickstartWorries(summary.books, 2).map((q) => (
                    <button key={q} type="button" style={askChip}
                      onClick={() => { track('quickstart_first_consult', { example: true }); onAsk?.(q); }}>
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {/* 🔔 初日クイックスタートを終えた直後に 1 回だけ（行動に追加の直後と、先に来たほう）。主ボタンは「相談する」なので副ボタンで。 */}
            {summary.memos > 0 && <NotifyOptInCard where="quickstart" primary={false} style={{ marginTop: 'var(--space-8)' }} />}
          </div>
          <div style={footer}>
            {/* 相談例がある時はそちらが主役なので、完了は副ボタン。
                メモが 0 件なら行き止まりにせず「メモを書く」（1 冊目を開いてメモのシート）を主役に。 */}
            {summary.memos > 0 ? (
              <button type="button" style={btnGhost} onClick={onClose}>完了</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <button type="button" style={btnPrimary}
                  onClick={() => (onWriteMemo && summary.books[0]?.id ? onWriteMemo(summary.books[0].id) : onClose())}>
                  メモを書く
                </button>
                <button type="button" style={{ ...btnLink, width: '100%' }} onClick={onClose}>あとで</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
