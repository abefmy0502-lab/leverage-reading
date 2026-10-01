// 🏠 ホーム（下のタブ「ホーム」。コード上の tab キーは 'books' のまま）。
//
// SPEC.md §1 の構成そのもの。置くのは次のブロックだけ:
//   1. はじめの一歩（HomeFirstStep・本はあるがメモ 0 件のときだけ）→ 初日クイックスタート
//   2. いま読んでいる本（最大 3 冊・各本に「メモを書く」＝ 1 タップでクイックメモ）
//   3. すべての本（N 冊）› → ライブラリ画面（検索・絞り込み・並び替えはそちらへ）
// 本 0 冊のときは「はじめる」カード 1 枚だけ。
// 相談カード（旧 HomeConsult.jsx）は 2026-10-01 オーナー裁定「ホームには相談チャット不要」で外した
// （相談は下のタブ「相談」から）。思い出しカードはホームから外し「振り返り」へ（SPEC §1）。
// 上の行の「写真で共有」は App.jsx の全体ヘッダー（ホーム・振り返り・相談で同じ場所）。
// 見た目は DESIGN.md のトークンのみ。
import { Library, ChevronRight, PencilLine, Plus } from 'lucide-react';
import HomeFirstStep from './HomeFirstStep';
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

function ReadingNow({ books, onOpenBook, onWriteMemo, onAddBook, onSeeAllReading, onCoverRetry }) {
  const reading = books
    .filter((b) => b.status === 'reading')
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  const shown = reading.slice(0, 3);
  // 読書中 0 冊: 見出しもカードも出さず、1 行だけ（SPEC §1 のエッジケース）。
  if (shown.length === 0) {
    return (
      <button type="button" onClick={onAddBook} style={{ ...btnLink, alignSelf: 'flex-start', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
        <Plus size={18} aria-hidden="true" />本を追加
      </button>
    );
  }
  return (
    <section aria-labelledby="home-reading-title">
      <h2 id="home-reading-title" style={sectionTitle}>いま読んでいる本</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {shown.map((b) => (
            <div key={b.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <button
                type="button"
                onClick={() => onOpenBook(b)}
                aria-label={`『${b.title}』を開く`}
                style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
              >
                <MiniCover book={b} width={40} onAutoRetry={onCoverRetry} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{b.title}</span>
                  {b.author && <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.author}</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onWriteMemo(b)}
                aria-label={`『${b.title}』にメモを書く`}
                style={btnRow}
              >
                <PencilLine size={16} aria-hidden="true" />メモを書く
              </button>
            </div>
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

// 読み込み中のホームの形（いま読んでいる本＝見出し＋行カード 2 枚を 12 間隔／すべての本 ›）。
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
      </div>
      <SkeletonBlock height={56} radius="var(--radius)" style={skeletonCard} />
    </>
  );
}

export default function HomeScreen({
  books = [], loading = false, loadError = null, onRetry,
  onQuickstart, onAddBook, onAdvisor, onImport,
  onOpenBook, onWriteMemo, onOpenLibrary, onSeeAllReading, onCoverRetry,
}) {
  return (
    <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>ホーム</h1>

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
      ) : (
        <>
          <HomeFirstStep books={books} onQuickstart={onQuickstart} />
          <ReadingNow books={books} onOpenBook={onOpenBook} onWriteMemo={onWriteMemo} onAddBook={onAddBook} onSeeAllReading={onSeeAllReading} onCoverRetry={onCoverRetry} />
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
