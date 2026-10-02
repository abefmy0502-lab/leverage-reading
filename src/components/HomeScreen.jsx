// 🏠 ホーム（下のタブ「ホーム」。コード上の tab キーは 'books' のまま）。
//
// SPEC.md §1 の構成そのもの。置くのは次のブロックだけ:
//   1. はじめの一歩（HomeFirstStep・本はあるがメモ 0 件のときだけ）→ 初日クイックスタート
//      メモが 1〜9 件の間は、同じ場所に静かな一行「あと N 件で相談相手が育ちます」（GrowthMeter・2026-10-02）
//   2. いま読んでいる本（最大 3 冊・各本に「メモを書く」＝ 1 タップでクイックメモ）
//   3. すべての本（N 冊）› → ライブラリ画面（検索・絞り込み・並び替えはそちらへ）
// 本 0 冊のときは「はじめる」カード 1 枚だけ。
// 相談カード（旧 HomeConsult.jsx）は 2026-10-01 オーナー裁定「ホームには相談チャット不要」で外した
// （相談は下のタブ「相談」から）。思い出しカードはホームから外し「振り返り」へ（SPEC §1）。
// 上の行の「写真で共有」は App.jsx の全体ヘッダー（ホーム・振り返り・相談で同じ場所）。
// 見た目は DESIGN.md のトークンのみ。
import { useEffect } from 'react';
import { Library, ChevronRight, PencilLine, Plus, BookOpen } from 'lucide-react';
import HomeFirstStep, { useHomeMemoState } from './HomeFirstStep';
import GrowthMeter from './GrowthMeter';
import { takeMemosReached, growthMeterText } from '../lib/firstDay';
import { track } from '../lib/analytics';
import { MiniCover } from './BookCards';
import { SkeletonBlock } from './Skeleton';
import ErrorMessage from './ErrorMessage';
import { btnPrimary, btnGhost, btnLink, card } from '../styles/ui';

// DESIGN §5「行の中の小さい副ボタン」（高さ 44・文字 15・600）。
const btnRow = { ...btnGhost, width: 'auto', flexShrink: 0, padding: 'var(--space-2) var(--space-3)', minHeight: 44, fontSize: 'var(--text-sub)' };

const sectionTitle = {
  fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-3)', lineHeight: 1.3,
};

// 文字ボタン（DESIGN §5: btnLink＝高さ 44・15/600・栗色）。
const textRow = btnLink;

function StartCard({ onQuickstart, onAddBook, onAdvisor, onImport }) {
  return (
    <section aria-labelledby="home-start-title" style={card}>
      {/* 「読むほど、自分だけの相談相手が育つ」はログインと初回ガイドで伝え済み。ここは行動だけを示す（同じことを二度言わない）。 */}
      {/* 題名で目的を伝える（初日クイックスタートの題名「相談相手をつくる」とそろえる・SPEC §1-1）。 */}
      <h2 id="home-start-title" style={{ ...sectionTitle, margin: '0 0 var(--space-4)' }}>相談相手をつくる</h2>
      <button type="button" onClick={onQuickstart} style={btnPrimary}>これまで読んだ本から始める</button>
      <button type="button" onClick={onAddBook} style={{ ...btnGhost, marginTop: 'var(--space-3)' }}>いま読んでいる本を追加する</button>
      {/* 脇役の文字ボタンは 1 つだけ（2 つ並ぶとアクセント色が強すぎる）。AI 選書は「相談」タブから開ける。
          文字ボタンの上下の余り（高さ 44 のため）をカードの内側余白と相殺し、上下の見た目をそろえる。 */}
      {onImport ? (
        <div style={{ display: 'flex', justifyContent: 'center', margin: 'var(--space-3) 0 calc(-1 * var(--space-2))' }}>
          {/* 1 行に収まる短い名前（「読書メー／ター」「取り／込む」のように語の途中で割れていた・2026-09-29）。
              どのアプリから取り込めるかは、開いたシートの題名の下で言う。設定の「ほかのアプリから取り込む」と同じ名前。 */}
          <button type="button" onClick={onImport} style={textRow}>ほかのアプリから取り込む</button>
        </div>
      ) : onAdvisor ? (
        <div style={{ display: 'flex', justifyContent: 'center', margin: 'var(--space-3) 0 calc(-1 * var(--space-2))' }}>
          <button type="button" onClick={onAdvisor} style={textRow}>悩みから、次に読む本を選んでもらう</button>
        </div>
      ) : null}
    </section>
  );
}

// いま読んでいる本の 1 行（表紙・書名・2 行目・右に副ボタン 1 つ）。読書中の本と、読書中が 0 冊のときの候補で共通。
function BookRow({ book: b, sub, onOpenBook, onCoverRetry, action }) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <button
        type="button"
        onClick={() => onOpenBook(b)}
        aria-label={`『${b.title}』を開く`}
        style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
      >
        <MiniCover book={b} width={40} onAutoRetry={onCoverRetry} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{b.title}</span>
          {sub && <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
        </span>
      </button>
      {action}
    </div>
  );
}

const byUpdated = (a, b) => (b.updated_at || '').localeCompare(a.updated_at || '');
const byDone = (a, b) => (b.doneDate || '').localeCompare(a.doneDate || '') || byUpdated(a, b);

function ReadingNow({ books, onOpenBook, onWriteMemo, onStartReading, onAddBook, onSeeAllReading, onCoverRetry }) {
  const reading = books.filter((b) => b.status === 'reading').sort(byUpdated);
  const shown = reading.slice(0, 3);
  // 読書中 0 冊（2026-10-01 ui-critic・オーナー承認・SPEC §1）: 次に読む候補を最大 3 冊。見出しで何の一覧かを言う
  //   （積読＝「次に読む本」・読了＝「最近読み終えた本」）ので、2 行目は著者だけ（「積読 ·」を重ねない）。
  //   積読（新しく触った順）は「読み始める」（読書中へ・その場で変わる）、読了は「メモを書く」。
  //   候補も無ければ（読みたいの本だけなど）、見出し「いま読んでいる本」＋「読書中の本はありません」の 1 行。
  const stacked = shown.length === 0 ? books.filter((b) => b.status === 'before').sort(byUpdated).slice(0, 3) : [];
  const finished = shown.length === 0 && stacked.length === 0 ? books.filter((b) => b.status === 'done').sort(byDone).slice(0, 3) : [];
  const candidates = stacked.length ? stacked : finished;
  const heading = stacked.length ? '次に読む本' : finished.length ? '最近読み終えた本' : 'いま読んでいる本';
  const memoBtn = (b) => (
    <button type="button" onClick={() => onWriteMemo(b)} aria-label={`『${b.title}』にメモを書く`} style={btnRow}>
      <PencilLine size={16} aria-hidden="true" />メモを書く
    </button>
  );
  return (
    <section aria-labelledby="home-reading-title">
      <h2 id="home-reading-title" style={sectionTitle}>{heading}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {shown.map((b) => (
            <BookRow key={b.id} book={b} sub={b.author} onOpenBook={onOpenBook} onCoverRetry={onCoverRetry} action={memoBtn(b)} />
          ))}
          {shown.length === 0 && candidates.length === 0 && (
            <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>読書中の本はありません</p>
          )}
          {candidates.map((b) => (
            <BookRow
              key={b.id}
              book={b}
              sub={b.author}
              onOpenBook={onOpenBook}
              onCoverRetry={onCoverRetry}
              action={b.status === 'before' && onStartReading ? (
                <button type="button" onClick={() => onStartReading(b)} aria-label={`『${b.title}』を読み始める`} style={btnRow}>
                  <BookOpen size={16} aria-hidden="true" />読み始める
                </button>
              ) : memoBtn(b)}
            />
          ))}
          {/* 「本を追加」はいつもここに（ヘルプの「いま読んでいる本の『本を追加』」と同じ場所・2026-09-29）。
              文字ボタンの左右 4 を打ち消して、文字の端をカードの端（16）にそろえる。 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 'var(--space-4)', margin: 'calc(-1 * var(--space-1)) calc(-1 * var(--space-1)) 0' }}>
            <button type="button" onClick={onAddBook} style={{ ...btnLink, gap: 'var(--space-1)' }}>
              <Plus size={18} aria-hidden="true" />本を追加
            </button>
            {reading.length > shown.length && (
              <button type="button" onClick={onSeeAllReading} style={btnLink}>
                ほか {reading.length - shown.length} 冊を見る
              </button>
            )}
          </div>
      </div>
    </section>
  );
}

// 読み込み中のホームの形（いま読んでいる本＝見出し＋行カード 2 枚を 12 間隔＋「＋ 本を追加」の 44 の行／すべての本 ›）。
// 起動直後の読み込み（App.jsx の HomeLoadingSkeleton）と、本の読み込み中（下の HomeScreen）で同じものを使う（2026-09-29）。
// カードの形はどれも本物と同じ枠 --separator（明るい画面で背景に溶けないように）。
const skeletonCard = { border: '1px solid var(--separator)', boxSizing: 'border-box' };
export function HomeBlocksSkeleton() {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SkeletonBlock width="40%" height={26} radius="var(--radius)" />
        <SkeletonBlock height={90} radius="var(--radius)" style={skeletonCard} />
        <SkeletonBlock height={90} radius="var(--radius)" style={skeletonCard} />
        {/* 「＋ 本を追加」の文字ボタン（高さ 44・上は本物と同じく 4 詰める）。形は文字の幅だけ。 */}
        <div style={{ height: 44, marginTop: 'calc(-1 * var(--space-1))', display: 'flex', alignItems: 'center' }}>
          <SkeletonBlock width={96} height={20} radius="var(--radius)" />
        </div>
      </div>
      <SkeletonBlock height={56} radius="var(--radius)" style={skeletonCard} />
    </>
  );
}

export default function HomeScreen({
  books = [], loading = false, loadError = null, onRetry,
  onQuickstart, onAddBook, onAdvisor, onImport,
  onOpenBook, onWriteMemo, onStartReading, onOpenLibrary, onSeeAllReading, onCoverRetry,
}) {
  // メモがあるか（はじめの一歩を出すか）。分かるまではスケルトン（カードを遅れて差し込まない・最大 800ms）。
  const memoState = useHomeMemoState(books);
  // 📊 memos_reached_10（lib/firstDay.js）: 10 件より少ないのを見たあとで 10 件以上になったら 1 回だけ。
  useEffect(() => {
    if (!loading && !loadError && memoState.known && takeMemosReached(memoState.count)) track('memos_reached_10', { memos: memoState.count, where: 'home' });
  }, [loading, loadError, memoState.known, memoState.count]);
  return (
    <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* 題と、メモが 1〜9 件の間だけ題の下 8 に出す一行（10 件で消える・カードにせず点数・バッジにしない・2026-10-02）。
          一行が無いときは題だけ（間 8 は一行があるときだけ）。件数を数えている間は同じ高さの形（あとから差し込んで下を押し下げない）。 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>ホーム</h1>
        {books.length > 0 && !memoState.known ? (
          <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-meta) * 1.5)' }}>
            <SkeletonBlock width="56%" height={14} radius="var(--radius-full)" />
          </span>
        ) : books.length > 0 && growthMeterText(memoState.count) ? (
          <GrowthMeter memoCount={memoState.count} />
        ) : null}
      </div>

      {loading && books.length === 0 ? (
        // 読み込み中は形だけ（既存ユーザーに新規用の「はじめる」カードを一瞬見せない）。
        <div role="status" aria-busy="true" aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <HomeBlocksSkeleton />
        </div>
      ) : loadError && books.length === 0 ? (
        // 読み込みに失敗したときに、既存ユーザーへ初回用の「はじめましょう」を見せない。
        // この画面の主役は「もう一度」（相談カードを外したので主ボタンに・2026-10-01）。
        <ErrorMessage
          title="本を読み込めませんでした"
          description="通信環境を確認して、もう一度お試しください。"
          actions={onRetry ? [{ label: 'もう一度', onClick: onRetry, variant: 'primary' }] : []}
        />
      ) : books.length === 0 ? (
        <StartCard onQuickstart={onQuickstart} onAddBook={onAddBook} onAdvisor={onAdvisor} onImport={onImport} />
      ) : !memoState.known ? (
        <div role="status" aria-busy="true" aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <HomeBlocksSkeleton />
        </div>
      ) : (
        <>
          {!memoState.hasMemos && <HomeFirstStep bookCount={books.length} onQuickstart={onQuickstart} />}
          <ReadingNow books={books} onOpenBook={onOpenBook} onWriteMemo={onWriteMemo} onStartReading={onStartReading} onAddBook={onAddBook} onSeeAllReading={onSeeAllReading} onCoverRetry={onCoverRetry} />
          <button
            type="button"
            onClick={onOpenLibrary}
            style={{ ...card, width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <Library size={20} aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>すべての本</span>
            <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-3)' }}>{books.length} 冊</span>
            <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
          </button>
        </>
      )}
    </div>
  );
}
