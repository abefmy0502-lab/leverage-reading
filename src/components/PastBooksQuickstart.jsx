// 📚 これまで読んだ本で、相談相手をつくる（初日クイックスタート）。
//
// 一番の価値「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を初日に体験させる。
// 入れたばかりの人はメモ 0 件で相談しても根拠が無い（最大の壁）。すでに読んだ本と
// 「覚えていること」を 5 分で入れてもらい、その場で複数の本をつなげた答えを返す。
// 設計: company/feature-past-books-quickstart.md（2026-09-26 オーナー承認・おすすめ案）
//   - 冊数: 3〜5 冊（3 冊で「次へ」が押せる）
//   - 入口: 初回ガイド最後の主ボタン ＋ はじめの一歩 ＋ ホームの相談カード（メモ 0 件時）
//   - 一言: 「思い出せない」でスキップ可（責めない）
// DB 変更なし（books は status='done' で、一言は book_memos のカード式メモとして入る）。
//
// 見た目は DESIGN.md に従う（2026-09-26 作り直し）: トークンだけ・主ボタンは各段階に 1 つ・
// 説明の補足文は置かない（§0-6）・選択はアクセント色の丸いチェック（iOS の選択リストの作法）。

import { useEffect, useRef, useState } from 'react';
import { X, Search, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { usePaywall } from '../state/PaywallContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { searchBooks } from '../lib/bookSearch';
import { findDuplicateBook } from '../lib/checkDuplicate';
import { invalidateKnowledgeCache } from '../lib/ai';
import { LIMITS, clamp } from '../lib/limits';
import { track, EVENTS } from '../lib/analytics';
import { btnPrimary, btnGhost, btnText, input as inputStyle, card } from '../styles/ui';
import { MiniCover } from './BookCards';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import Spinner from './Spinner';
import { SkeletonBlock } from './Skeleton';

const MIN_BOOKS = 3;
const MAX_BOOKS = 5;
const COVER_W = 36; // 一覧の表紙（高さは MiniCover が 1.42 倍で決める）

// ---- 画面の骨組み ----------------------------------------------------------
const overlay = {
  position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)', background: 'var(--bg)',
  display: 'flex', flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
};
const headerRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: 'var(--space-2) var(--space-1) 0', flexShrink: 0,
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

// 相談例（ホームの相談カードと同じ: --fill 面・枠なしの UI 文字）。
const askChip = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 48,
  padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-4)', textAlign: 'left',
  background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5,
};

const bookKey = (b) => (b.isbn ? `isbn:${b.isbn}` : `t:${b.title}|${b.author || ''}`);

// 入れた本から相談例を作る（AI を使わない＝原価ゼロ）。複数の本をつなげる問いを先に。
function suggestQuestions(entries) {
  const withMemo = entries.filter((e) => e.memo.trim());
  const titles = (withMemo.length >= 2 ? withMemo : entries).map((e) => e.book.title);
  const qs = [];
  if (titles.length >= 2) qs.push(`『${titles[0]}』と『${titles[1]}』から、いまの仕事で意識できることは？`);
  qs.push('最近、判断に迷うことがあります。私が読んだ本から、ヒントをください');
  return qs;
}

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
const btnPrimaryOff = { ...btnPrimary, background: 'var(--fill)', color: 'var(--text-2)', cursor: 'default', opacity: 1 }; // 全体の button:disabled{opacity:.4} を打ち消す

export default function PastBooksQuickstart({ books = [], onSaveBook, onAsk, onClose, onWriteMemo, onImport }) {
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
  const [summary, setSummary] = useState({ books: [], memos: 0 });
  const memoRef = useRef(null);
  const searchRef = useRef(null);

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

  const isPicked = (b) => picked.some((p) => bookKey(p.book) === bookKey(b));
  const toggle = (b) => {
    if (isPicked(b)) {
      setPicked((arr) => arr.filter((p) => bookKey(p.book) !== bookKey(b)));
      return;
    }
    if (picked.length >= MAX_BOOKS) {
      toast.info(`えらべるのは ${MAX_BOOKS} 冊までです`);
      return;
    }
    setPicked((arr) => [...arr, { book: b, memo: '' }]);
    // 次の 1 冊をすぐ打てるように、入力欄を空にする（結果の一覧はそのまま残す）。
    setQuery('');
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
    const savedBooks = [];
    const memoRows = [];
    for (const e of entries) {
      try {
        // 既に本棚にある本は追加せず、その本に一言だけ足す（重複登録しない）。
        const existing = findDuplicateBook(books, e.book);
        const saved = existing || await onSaveBook?.(e.book);
        if (!saved?.id) continue;
        savedBooks.push({ ...e.book, ...saved });
        const text = clamp(e.memo.trim(), LIMITS.memoText);
        if (text) memoRows.push({ user_id: user.id, book_id: saved.id, text, page_number: null, tags: [], photo_path: null });
      } catch (err) {
        console.warn('[quickstart] book save failed:', err?.message || err);
      }
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
        track(EVENTS.MEMO_ADDED, { via: 'quickstart', count: memoCount });
      }
    }
    track('quickstart_completed', { books: savedBooks.length, memos: memoCount });
    setSummary({ books: savedBooks, memos: memoCount });
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
      <button type="button" aria-label="閉じる" onClick={onClose} disabled={step === 'saving'}
        style={{ ...iconBtn, opacity: step === 'saving' ? 0.4 : 1 }}>
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
            <p style={sub}>{MIN_BOOKS}〜{MAX_BOOKS} 冊えらんでください</p>
            {onImport && (
              <button type="button" onClick={onImport} style={{ ...btnText, padding: 0, marginTop: 'var(--space-1)' }}>
                ブクログ・Kindle の記録から取り込む
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
                    onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              {/* 主ボタンは下の「次へ」だけ（DESIGN §0-2）。検索は副ボタン。 */}
              <button type="button" onClick={() => runSearch()} disabled={!query.trim() || searching}
                style={{ ...btnGhost, width: 'auto', flexShrink: 0, ...(query.trim() && !searching ? {} : { color: 'var(--text-3)', borderColor: 'var(--separator)', cursor: 'default' }) }}>
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
                  icon={<Search size={28} aria-hidden="true" />}
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
                    style={{ ...btnText, minHeight: 44, padding: 'var(--space-3) 0', marginTop: 'var(--space-1)', fontSize: 'var(--text-sub)', justifyContent: 'flex-start', textAlign: 'left', maxWidth: '100%' }}>
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
            <button type="button" style={{ ...btnText, width: '100%' }} onClick={skipMemo}>
              思い出せないので飛ばす
            </button>
          </div>
        </>
      )}

      {/* ===== 保存中 ===== */}
      {step === 'saving' && (
        <div style={{ ...body, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner message="本棚に入れています…" />
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
                <p style={sub}>あなたの {summary.books.length} 冊・メモ {summary.memos} 件から答えます</p>
              </>
            ) : (
              <>
                {/* メモが無いと相談の根拠が無いので「相談相手ができた」とは言わない（正直に）。 */}
                <h1 style={{ ...title, marginTop: 'var(--space-6)' }}>{summary.books.length} 冊を本棚に入れました</h1>
                <p style={sub}>まだメモがありません</p>
              </>
            )}

            {summary.memos > 0 && (
              <section aria-labelledby="qs-ask" style={{ marginTop: 'var(--space-8)' }}>
                <h2 id="qs-ask" style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '0 0 var(--space-3)' }}>
                  相談してみる
                </h2>
                {freeMode && freeRemaining > 0 && (
                  <p style={{ ...sub, margin: 'calc(-1 * var(--space-2)) 0 var(--space-3)' }}>お試しで {freeRemaining} 回まで、無料で相談できます</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {suggestQuestions(picked).map((q) => (
                    <button key={q} type="button" style={askChip}
                      onClick={() => { track('quickstart_first_consult'); onAsk?.(q); }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{q}</span>
                      <ChevronRight size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
                    </button>
                  ))}
                </div>
              </section>
            )}
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
                <button type="button" style={{ ...btnText, width: '100%' }} onClick={onClose}>あとで</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
