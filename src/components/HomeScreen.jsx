// 🏠 ホーム（下のタブ「ホーム」。コード上の tab キーは 'books' のまま）。
//
// SPEC.md §1 の構成そのもの。置くのは次のブロックだけ:
//   1. はじめの一歩（HomeFirstStep・本はあるがメモ 0 件のときだけ）→ 初日クイックスタート
//      メモが 1〜9 件の間は、同じ場所に静かな一行「あと N 件で相談相手が育ちます」（GrowthMeter・2026-10-02）
//   2. いま読んでいる本（最大 3 冊・各本に「メモを書く」＝ 1 タップでクイックメモ。その下に控えめな「読む」＝集中モード・2026-10-09）
//   3. 今日の行動（期限が今日まで・明日の行動があるときだけ・2026-10-10）› → 振り返り › 行動
//   4. すべての本（N 冊）› → ライブラリ画面（検索・絞り込み・並び替えはそちらへ）
// メモが 10 件になったのを見たあと 1 回だけ、題の下に「相談相手が育ちました」＋「相談してみる」（GrownLine・2026-10-10）。
// ホームのメモを書くで保存したメモに、ほかの本の似たメモがあれば、題の下に静かな 1 行（MemoLinks の line・2026-10-10）。
// 月末の 3 日間・12 月だけ、題の下に控えめな 1 行「◯月の読書を、1 枚の画像に」（ShareNudge・閉じられる・2026-10-08）。
// 本 0 冊のときは「はじめる」カード 1 枚だけ。
// 相談カード（旧 HomeConsult.jsx）は 2026-10-01 オーナー裁定「ホームには相談チャット不要」で外した
// （相談は下のタブ「相談」から）。思い出しカードはホームから外し「振り返り」へ（SPEC §1）。
// 上の行の「写真で共有」は App.jsx の全体ヘッダー（ホーム・振り返り・相談で同じ場所）。
// 見た目は DESIGN.md のトークンのみ。
import { useEffect, useMemo, useState } from 'react';
import { Library, ChevronRight, PencilLine, Plus, BookOpen, Timer, Target, Sprout, X, MessageCircle } from 'lucide-react';
import HomeFirstStep, { useHomeMemoState, MEMO_COUNT_WAIT_MS } from './HomeFirstStep';
import GrowthMeter from './GrowthMeter';
import ShareNudge, { useShareNudge } from './ShareNudge';
import { firstConsultDone, takeMemosReached, growthMeterText, rememberHomeMemoCount, lastHomeMemoCount, showGrowthPlaceholder, grownLinePending, markGrownLineDone, GROWTH_GOAL } from '../lib/firstDay';
import { useAllActions } from '../hooks/useAllActions';
import { homeActionsSummary } from '../lib/homeActions';
import { stripInlineMd } from '../lib/text';
import { appNow } from '../lib/appNow';
import { firstConsultQuestion } from '../lib/consultHelpers';
import { appPurposeTextFor, purposeConsultQuestion } from '../lib/appPurpose';
import { useAuth } from '../hooks/useAuth';
import { usePaywall } from '../state/PaywallContext';
import { fetchUsedMjpy } from '../lib/tokens';
import { prevMonthOf, tokensBackCandidate, shouldShowTokensBack, tokensBackText, readTokensBackDone, markTokensBackDone } from '../lib/tokensBack';
import { reaskCandidate, pickReask, reaskText, readReaskDone, markReaskDone } from '../lib/reaskNudge';
import { loadAllMemoRows } from '../hooks/useAllMemoRows';
import { supabase } from '../lib/supabase';
import MemoLinks from './MemoLinks';
import { useMemoLinkFinder } from '../hooks/useMemoLinkFinder';
import { track } from '../lib/analytics';
import { MiniCover } from './BookCards';
import { phrasePieces, withPhraseBreaks } from './TightBubble';
import { SkeletonBlock } from './Skeleton';
import ErrorMessage from './ErrorMessage';
import { btnPrimary, btnGhost, btnLink, btnLinkQuiet, btnTonal, card } from '../styles/ui';

// DESIGN §5「行の中の小さい副ボタン」（ui.js の btnRow・高さ 44・文字 15・600）。折り返した行では幅いっぱいに伸びる。
const btnRow = btnTonal;
// 行の表紙の幅（MiniCover）。「読む」はこの幅＋間 12 だけ右から始めて、書名の列にそろえる。
const ROW_COVER_W = 40;

const sectionTitle = {
  fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-3)', lineHeight: 1.3,
};

// 文字ボタン（DESIGN §5: btnLink＝高さ 44・15/600・栗色）。
const textRow = btnLink;

function StartCard({ onQuickstart, onAddBook, onAdvisor, onImport }) {
  // 「いま読んでいる本を追加する」なので、この入口だけ状態を読書中にして開く（onAddBook＝読書中のプリセット）。
  return (
    <section aria-labelledby="home-start-title" style={card}>
      {/* 「読むほど、自分だけの相談相手が育つ」はログインと初回ガイドで伝え済み。ここは行動だけを示す（同じことを二度言わない）。 */}
      {/* 題名で目的を伝える（初日クイックスタートの題名「相談相手をつくる」とそろえる・SPEC §1-1）。 */}
      <h2 id="home-start-title" style={{ ...sectionTitle, margin: 0 }}>相談相手をつくる</h2>
      {/* 題の下に 1 行だけ、積み重ねが相談の質になることを言う（2026-10-10 第 9 回 総点検・ボタンの名前と順番は変えない）。 */}
      <p style={{ margin: 'var(--space-1) 0 var(--space-4)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks('メモがたまるほど、あなたのメモから答えます')}
      </p>
      {/* data-first-step: 本が 0 冊で「写真で共有」を押したとき、ここへフォーカスを送る印（App.jsx の pointToFirstStep）。 */}
      {/* ボタンは横並びの箱なので、文節の切れ目つきの文字は span で 1 つにまとめる（切れ目ごとに別の項目に割れない）。 */}
      <button type="button" data-first-step="" onClick={onQuickstart} style={btnPrimary}><span>{withPhraseBreaks('読んだ本に一言ずつ残す')}</span></button>
      <button type="button" onClick={onAddBook} style={{ ...btnGhost, marginTop: 'var(--space-3)' }}><span>{withPhraseBreaks('いま読んでいる本を追加する')}</span></button>
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

// いま読んでいる本の 1 行（表紙・書名・著者、その下に操作のボタン）。読書中の本と、読書中が 0 冊のときの候補で共通。
function BookRow({ book: b, sub, onOpenBook, onCoverRetry, action, footer, divider = false }) {
  return (
    // 行はまとまりのカード（GroupCard）の中に並ぶ。2 行目からは上に区切り線（書名の列から右へ・iOS の一覧と同じ）。
    <div style={{ position: 'relative', padding: 'var(--space-3) var(--space-4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
      {divider && <span aria-hidden="true" data-divider="" style={{ position: 'absolute', top: 0, right: 0, left: `calc(var(--space-4) + ${ROW_COVER_W}px + var(--space-3))`, borderTop: '1px solid var(--separator)' }} />}
      <button
        type="button"
        onClick={() => onOpenBook(b)}
        aria-label={`『${b.title}』を開く`}
        // 書名の列は 7.5rem（約 8 字）＋表紙 40＋間 12。ふだんの大きさでは「メモを書く」と 1 行に並び（324 の行に 180＋12＋128）、
        // 文字を少しでも大きくしたらボタンを折り返して書名の列を広げる（2026-10-04 ui-critic）。
        style={{ flex: '1 1 100%', minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
      >
        <MiniCover book={b} width={ROW_COVER_W} onAutoRetry={onCoverRetry} />
        <span style={{ minWidth: 0 }}>
          {/* 書名は文節の切れ目でだけ折り返す（「イシューからは／じめよ」と語の途中で割れていた・2026-10-04）。 */}
          {/* 文節・文字の種類の切れ目でだけ折り返す。それでも入らない切れ端だけ … に切る（最後の手段・2026-10-04）。 */}
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{phraseChunks(b.title)}</span>
          {sub && <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
        </span>
      </button>
      {/* 操作は書名の下の 1 行に並べる（書名の列の左端にそろえる・「メモを書く」と「読む」を同じ形・同じ高さに・2026-10-16 第 4 回）。
          書名の横に置くと著者が「…」で切れ、「読む」だけ別の段に浮いていた。 */}
      <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', paddingLeft: `calc(${ROW_COVER_W}px + var(--space-3))` }}>
        {action}
        {footer}
      </div>
    </div>
  );
}

// ⏱ 読む（集中モード・2026-10-09）: 読書中の本の行の下に、書名の列（表紙 40＋間 12）にそろえた控えめな文字ボタン。
//   主役の「メモを書く」（枠の副ボタン）より弱く＝枠も塗りもない --text-2 の 15/600＋時計のアイコン。
//   押せる高さは 44 のまま、上の行との間（12）とカードの下の余白を負の余白で詰めて、カードを 24 だけ伸ばす。
function ReadLink({ book: b, onRead }) {
  return (
    <button
      type="button"
      onClick={() => onRead(b)}
      aria-label={`『${b.title}』を読む（集中モード）`}
      data-focus-entry=""
      // 主役は「メモを書く」1 つ（SPEC §1）。読むは控えめな文字ボタン（面にしない・2026-10-21 ui-critic「主役が 2 つに見える」）。
      style={{ ...btnLinkQuiet, gap: 'var(--space-1)' }}
    >
      <Timer size="1.1em" strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />読む
    </button>
  );
}

// 書名を切れ端ごとの inline-block に。切れ端は文節、長い文節はその中の文字の種類の切れ目（「アウトプット／大全」）まで分ける。
// 切れ端の切れ目でだけ折り返し、それでも列より長い切れ端だけ 1 行で … に切る（語の途中では割らない・2026-10-04）。
function phraseChunks(title) {
  const list = phrasePieces(title, { scriptBreaks: true }).filter((p) => p && p !== '\n');
  return list.map((p, i) => (
    <span key={i} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{p}</span>
  ));
}

const byUpdated = (a, b) => (b.updated_at || '').localeCompare(a.updated_at || '');
const byDone = (a, b) => (b.doneDate || '').localeCompare(a.doneDate || '') || byUpdated(a, b);

function ReadingNow({ books, onOpenBook, onWriteMemo, onStartReading, onAddBook, onSeeAllReading, onCoverRetry, onRead }) {
  const reading = books.filter((b) => b.status === 'reading').sort(byUpdated);
  const shown = reading.slice(0, 3);
  // 📗 読み終えてから 14 日以内の本（メモがいちばん出る時期・読了の 3 つの問いがある間）は、読書中があっても最後に 1 冊だけ
  //   （3 冊の上限の中で・2026-10-21）。2 行目に「読了」と書いて読書中の本と見分ける。
  const justDone = shown.length > 0 && shown.length < 3
    ? books.filter((b) => b.status === 'done' && b.doneDate && appNow() - Date.parse(b.doneDate) < 14 * 86400000).sort(byDone).slice(0, 1)
    : [];
  // 読書中 0 冊（2026-10-01 ui-critic・オーナー承認・SPEC §1）: 次に読む候補を最大 3 冊。見出しで何の一覧かを言う
  //   （積読＝「次に読む本」・読了＝「最近読み終えた本」）ので、2 行目は著者だけ（「積読 ·」を重ねない）。
  //   積読（新しく触った順）は「読み始める」（読み上げは「読書を開始する」・読書中へ・その場で変わる）、読了は「メモを書く」。
  //   候補も無ければ（読みたいの本だけなど）、見出し「いま読んでいる本」＋「読書中の本はありません」の 1 行。
  const stacked = shown.length === 0 ? books.filter((b) => b.status === 'before').sort(byUpdated).slice(0, 3) : [];
  const finished = shown.length === 0 && stacked.length === 0 ? books.filter((b) => b.status === 'done').sort(byDone).slice(0, 3) : [];
  const candidates = stacked.length ? stacked : finished;
  const heading = stacked.length ? '次に読む本' : finished.length ? '最近読み終えた本' : 'いま読んでいる本';
  const memoBtn = (b) => (
    <button type="button" onClick={() => onWriteMemo(b)} aria-label={`『${b.title}』にメモを書く`} style={btnRow}>
      <PencilLine size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} />メモを書く
    </button>
  );
  return (
    <section aria-labelledby="home-reading-title">
      {/* 見出しの右に「本を追加」（見出しの行の操作・2026-10-16 ui-critic「本を追加が段の間に浮いている」）。
          文字ボタンの右の 4 を打ち消して、文字の右端をカードの右端にそろえる。 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: 'var(--space-3)', flexWrap: 'wrap', margin: '0 calc(-1 * var(--space-1)) var(--space-2) 0' }}>
        <h2 id="home-reading-title" style={{ ...sectionTitle, margin: 0 }}>{heading}</h2>
        <button type="button" onClick={onAddBook} style={{ ...btnLink, gap: 'var(--space-1)' }}>
          <Plus size="1.2em" aria-hidden="true" />本を追加
        </button>
      </div>
      {shown.length === 0 && candidates.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>読書中の本はありません</p>
      ) : (
        // 本は 1 枚のまとまりに行で並べる（1 冊ずつのカードにしない・iOS の一覧と同じ）。
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {shown.map((b, i) => (
            <BookRow key={b.id} divider={i > 0} book={b} sub={b.author} onOpenBook={onOpenBook} onCoverRetry={onCoverRetry} action={memoBtn(b)} footer={onRead ? <ReadLink book={b} onRead={onRead} /> : null} />
          ))}
          {justDone.map((b) => (
            <BookRow key={b.id} divider book={b} sub={`読了 · ${b.author || ''}`.replace(/ · $/, '')} onOpenBook={onOpenBook} onCoverRetry={onCoverRetry} action={memoBtn(b)} />
          ))}
          {candidates.map((b, i) => (
            <BookRow
              key={b.id}
              divider={i > 0}
              book={b}
              sub={b.author}
              onOpenBook={onOpenBook}
              onCoverRetry={onCoverRetry}
              action={b.status === 'before' && onStartReading ? (
                <button type="button" onClick={() => onStartReading(b)} aria-label={`『${b.title}』の読書を開始する`} style={btnRow}>
                  {/* 見える名前は短い「読み始める」（「読書を開始する」だとボタンが折り返してカードが伸び、「すべての本」が 1 画面目から消えた・
                      2026-10-11 ui-critic）。読み上げは本の詳細と同じ「読書を開始する」。 */}
                  <BookOpen size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} />読み始める
                </button>
              ) : memoBtn(b)}
            />
          ))}
        </div>
      )}
      {reading.length > shown.length && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: 'var(--space-1) calc(-1 * var(--space-1)) 0 0' }}>
          <button type="button" onClick={onSeeAllReading} style={btnLink}>
            ほか {reading.length - shown.length} 冊を見る
          </button>
        </div>
      )}
    </section>
  );
}

// ホームの下の行（今日の行動・すべての本）: 1 枚のまとまりの中の行（2026-10-16 ui-critic「カードが 1 行ずつ並んで重い」）。
const navRow = { width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-body)', textAlign: 'left', color: 'inherit' };
const navValue = { whiteSpace: 'nowrap', fontSize: 'var(--text-sub)', color: 'var(--text-3)', flexShrink: 0 };
// 行の間の区切り線は、文字の頭（アイコンの右）から右端まで。
const navDivider = <span aria-hidden="true" style={{ display: 'block', marginLeft: 'calc(var(--space-4) + 1.2em + var(--space-3))', borderTop: '1px solid var(--separator)' }} />;

// 🎯 今日の行動（2026-10-10・SPEC §1）: 期限が今日まで（過ぎたものも）・明日の行動があるときだけ、すべての本の上に 1 行。
//   形は「すべての本」の行と同じ（カードの面・左にアイコン・右に ›）。2 行目はいちばん先にやる 1 件の文（1 行で … に切る）。
//   押すと 振り返り › 行動。数字の演出（%・連続日数）はしない。
function HomeActionsRow({ summary, onOpen }) {
  if (!summary) return null;
  const firstText = stripInlineMd(String(summary.first?.text || '')).replace(/\s+/g, ' ').trim();
  return (
    <button
      type="button"
      data-home-actions=""
      onClick={() => onOpen?.(summary)}
      aria-label={`${summary.label} ${summary.count} 件。${firstText ? `${firstText.replace(/[。．.！!？?]+$/, '')}。` : ''}行動を開く`}
      style={navRow}
    >
      <Target size="1.2em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>{summary.label}</span>
        {firstText && (
          <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, overflow: 'hidden', overflowWrap: 'anywhere' }}>{firstText}</span>
        )}
      </span>
      {/* 数は右の › と同じ高さの中央に（行の右の値・iOS の設定の一覧と同じ） */}
      <span style={navValue}>{summary.count} 件</span>
      <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </button>
  );
}

// 🌱 相談相手が育ちました（2026-10-10）: メモが 10 件になったのを見たあと 1 回だけ、題の下（育つまでの一行と同じ場所）に。
//   見た目は育つまでの一行（芽 1.2em・--text-3＋13/--text-2）＋右に文字ボタン「相談してみる」と ×。押しても閉じても二度と出さない。
//   7 日間無料はここではすすめない（ホームではすすめない・相談の画面の案内 ③ はそのまま）。
function GrownLine({ onConsult, onDismiss, text = null, icon: Icon = Sprout, actionLabel = '相談してみる', mark = 'grown' }) {
  return (
    <div data-grown-line={mark} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)', margin: '0 calc(-1 * var(--space-3)) 0 0' }}>
      <p style={{ flex: '1 1 10em', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0 }}>
          <Icon size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)' }} />
        </span>
        <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{typeof text === 'string' || !text ? withPhraseBreaks(text || `メモが ${GROWTH_GOAL}\u00a0件になり、相談相手が育ちました`) : text}</span>
      </p>
      {/* 1 行に収まるときは右へ（文が伸びて押す）。折り返したときは文の頭（芽の右）にそろえる（2026-10-10 ui-critic）。 */}
      <span style={{ display: 'flex', alignItems: 'center', paddingLeft: 'calc(var(--text-meta) * 1.2)' }}>
        <button type="button" onClick={onConsult} style={{ ...btnLink, fontSize: 'min(var(--text-sub), var(--text-bar-max))', whiteSpace: 'nowrap' }}>{actionLabel}</button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="この案内を閉じる"
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-full)', padding: 0, cursor: 'pointer', color: 'var(--text-3)' }}
        >
          <X size="1.2em" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

// 🔁 「今月の相談が戻りました」（lib/tokensBack.js・2026-10-20）。先月の使った量を読み終えるか MEMO_COUNT_WAIT_MS まで待って
//   1 回だけ決める（あとから差し込んでホームを押し下げない）。戻り値: { ready, show, text, close(action) }。
function useTokensBack(active) {
  const { user } = useAuth();
  const { freeMode, tokensRemaining } = usePaywall();
  const [now] = useState(() => appNow().getTime());
  const [doneMonth] = useState(() => readTokensBackDone(user?.id));
  const need = active && !!user?.id && tokensBackCandidate({ freeMode, now, doneMonth });
  const [prevUsed, setPrevUsed] = useState(undefined); // undefined＝まだ・null＝読めない
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!need) return undefined;
    let alive = true;
    fetchUsedMjpy(user.id, `free-${prevMonthOf(now).key}`).then((v) => { if (alive) setPrevUsed(v); });
    const t = setTimeout(() => { if (alive) setTimedOut(true); }, MEMO_COUNT_WAIT_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [need, user?.id, now]);
  const ready = !need || prevUsed !== undefined || timedOut;
  const [decided, setDecided] = useState(undefined);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!ready || decided !== undefined || !active) return;
    setDecided(need && prevUsed !== undefined && shouldShowTokensBack({ prevUsedMjpy: prevUsed, createdAt: user?.created_at || null, now, remaining: tokensRemaining }));
  }, [ready, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = (action) => {
    markTokensBackDone(user?.id, now);
    setClosed(true);
    track('tokens_back', { action });
  };
  return { ready, show: !!decided && !closed, text: tokensBackText(tokensRemaining ?? 30), close };
}

// 🔁 「先月の相談『…』のあと、メモが N 件増えました」→ もう一度相談する（月のはじめの 7 日間・lib/reaskNudge.js・2026-10-21）。
function useReaskNudge(active) {
  const { user } = useAuth();
  const [now] = useState(() => appNow().getTime());
  const [doneMonth] = useState(() => readReaskDone(user?.id));
  const need = active && !!user?.id && reaskCandidate({ now, doneMonth });
  const [picked, setPicked] = useState(undefined); // undefined＝まだ・null＝出さない
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!need) return undefined;
    let alive = true;
    (async () => {
      try {
        const [{ data }, memos] = await Promise.all([
          supabase.from('chat_messages').select('content, created_at').eq('user_id', user.id).eq('role', 'user').order('created_at', { ascending: false }).limit(20),
          loadAllMemoRows(user.id),
        ]);
        const memoTimes = (memos?.rows || []).map((m) => Date.parse(m.created_at || '')).filter(Number.isFinite);
        if (alive) setPicked(pickReask({ consults: data || [], memoTimes, now }));
      } catch { if (alive) setPicked(null); }
    })();
    const t = setTimeout(() => { if (alive) setTimedOut(true); }, MEMO_COUNT_WAIT_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [need, user?.id, now]);
  const ready = !need || picked !== undefined || timedOut;
  const [closed, setClosed] = useState(false);
  const close = (action) => {
    markReaskDone(user?.id, now);
    setClosed(true);
    track('reask_nudge', { action });
  };
  return { ready, show: !!picked && !closed, question: picked?.question || '', text: picked ? reaskText(picked) : null, close };
}

// 🔗 ホームのメモを書くで保存したメモと似たことを、ほかの本でも書いていたら題の下に 1 行（MemoLinks の line・× で閉じる）。
//   見つからなければ何も出さない（全部のメモを読むのは保存したときだけ）。
function HomeSavedLinks({ books, saved, onOpen, onDismiss }) {
  const { find } = useMemoLinkFinder({ books, enabled: !!saved });
  const links = useMemo(() => (saved ? find({ text: saved.text, bookId: saved.bookId, memoId: saved.id }) : []), [saved, find]);
  if (!saved || links.length === 0) return null;
  return <MemoLinks variant="line" links={links} onOpen={onOpen} onDismiss={onDismiss} />;
}

// 読み込み中のホームの形（いま読んでいる本＝見出し＋行カード 2 枚を 12 間隔＋「＋ 本を追加」の 44 の行／すべての本 ›）。
// 起動直後の読み込み（App.jsx の HomeLoadingSkeleton）と、本の読み込み中（下の HomeScreen）で同じものを使う（2026-09-29）。
// カードの形はどれも本物と同じ枠 --separator（明るい画面で背景に溶けないように）。
const skeletonCard = { border: '1px solid var(--separator)', boxSizing: 'border-box' };
export function HomeBlocksSkeleton() {
  // 本物と同じ形: 見出しの行（右に「本を追加」）→ 2 冊の行のまとまり → 下の行のまとまり（2026-10-16）。
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SkeletonBlock width="40%" height={26} radius="var(--radius)" />
          <SkeletonBlock width={80} height={20} radius="var(--radius)" />
        </div>
        <SkeletonBlock height={180} radius="var(--radius)" style={skeletonCard} />
      </div>
      <SkeletonBlock height={56} radius="var(--radius)" style={skeletonCard} />
    </>
  );
}

export default function HomeScreen({
  books = [], loading = false, loadError = null, onRetry,
  onQuickstart, onAddBook, onAddReadingBook, onAdvisor, onImport,
  onOpenBook, onWriteMemo, onStartReading, onOpenLibrary, onSeeAllReading, onCoverRetry, onShareNudge, onRead,
  onOpenActions, onConsultDraft, savedMemo = null, onDismissSavedMemo, onOpenMemo, onAddOneLines = null, onOpenConsult = null,
}) {
  const { user } = useAuth();
  // 🌱 育つまでの一行の右の次の一歩（2026-10-20）: はじめての相談の前は「相談してみる」（入れた理由かメモから下書き・送らない）、
  //   相談したあとは「一言ずつ残す」（メモの無い読んだ本へ・初日クイックスタートの一言の段）。どちらか 1 つだけ。
  const growthAction = !onConsultDraft ? null : !firstConsultDone()
    ? { label: '相談してみる', onClick: () => { track('home_growth_action', { action: 'consult' }); onConsultDraft(purposeConsultQuestion(appPurposeTextFor(user)) || firstConsultQuestion({ books, memoCount: memoState.count }), 'growth'); } }
    : onAddOneLines ? { label: '一言ずつ残す', onClick: () => { track('home_growth_action', { action: 'one_line' }); onAddOneLines(); } } : null;
  // メモがあるか（はじめの一歩を出すか）。分かるまではスケルトン（カードを遅れて差し込まない・最大 800ms）。
  const memoState = useHomeMemoState(books);
  // 月末・12 月の 1 行（数えるのはメモの件数と同じ時点・決まるまでホームは形のまま＝あとから差し込まない）。
  const shareNudge = useShareNudge(books, !!onShareNudge && !loading && !loadError && books.length > 0);
  // 無料プランで先月のトークンを使い切った人に、月のはじめの 7 日間だけ「今月の相談が戻りました」（2026-10-20）。
  const tokensBack = useTokensBack(!!onOpenConsult && !loading && !loadError && books.length > 0);
  const reask = useReaskNudge(!!onConsultDraft && !loading && !loadError && books.length > 0);
  const homeKnown = memoState.known && shareNudge.ready && tokensBack.ready && reask.ready;
  // 📊 memos_reached_10（lib/firstDay.js）: 10 件より少ないのを見たあとで 10 件以上になったら 1 回だけ。
  // 🌱 「相談相手が育ちました」（10 件を越えたのを見たあと 1 回だけ・相談の画面で先に越えても、ホームに戻ったら出す）。
  const [grown, setGrown] = useState(grownLinePending);
  useEffect(() => {
    if (!loading && !loadError && memoState.known && takeMemosReached(memoState.count)) {
      track('memos_reached_10', { memos: memoState.count, where: 'home' });
      setGrown(grownLinePending());
    }
  }, [loading, loadError, memoState.known, memoState.count]);
  const showGrown = grown && !!onConsultDraft && memoState.known && (memoState.count == null || memoState.count >= GROWTH_GOAL);
  const closeGrown = (action) => {
    markGrownLineDone();
    setGrown(false);
    track('grown_card', { action });
  };
  // 🎯 今日の行動（本の行動から作る＝本と一緒に分かる・あとから差し込まない）。
  const { allActions } = useAllActions(books);
  const actionsSummary = useMemo(() => homeActionsSummary(allActions, appNow()), [allActions]);
  // 前回の件数（開いたときに 1 回だけ読む）。数えている間の形は、前回 1〜9 件だった人にだけ出す。
  const [lastCount] = useState(lastHomeMemoCount);
  useEffect(() => {
    if (memoState.known && memoState.count != null) rememberHomeMemoCount(memoState.count);
  }, [memoState.known, memoState.count]);
  return (
    <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* 題と、メモが 1〜9 件の間だけ題の下 8 に出す一行（10 件で消える・カードにせず点数・バッジにしない・2026-10-02）。
          一行が無いときは題だけ（間 8 は一行があるときだけ）。件数を数えている間は、前回 1〜9 件だった人にだけ同じ高さの形
          （端末に覚えた前回の件数・はじめて開いたときと 0 件・10 件以上の人には出さない＝出してから縮んで跳ねないように）。 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>ホーム</h1>
        {books.length > 0 && !homeKnown ? (showGrowthPlaceholder(lastCount) && (
          <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-meta) * 1.5)' }}>
            <SkeletonBlock width="56%" height={14} radius="var(--radius-full)" />
          </span>
        )) : books.length > 0 && growthMeterText(memoState.count) ? (
          <GrowthMeter memoCount={memoState.count} action={growthAction} />
        ) : books.length > 0 && showGrown ? (
          <GrownLine
            onConsult={() => { closeGrown('open'); onConsultDraft(purposeConsultQuestion(appPurposeTextFor(user)) || firstConsultQuestion({ books, memoCount: memoState.count }), 'grown'); }}
            onDismiss={() => closeGrown('dismiss')}
          />
        ) : null}
        {/* 🔗 ホームのメモを書くで保存したメモの似たメモ（題の下の静かな 1 行・2026-10-10）。 */}
        {homeKnown && books.length > 0 && <HomeSavedLinks books={books} saved={savedMemo} onOpen={onOpenMemo} onDismiss={onDismissSavedMemo} />}
        {homeKnown && tokensBack.show && (
          <GrownLine
            mark="tokens-back"
            icon={MessageCircle}
            text={<>{withPhraseBreaks(tokensBack.text.lead)}<span style={{ whiteSpace: 'nowrap' }}>{tokensBack.text.count}</span></>}
            actionLabel="相談する"
            onConsult={() => { tokensBack.close('open'); onOpenConsult(); }}
            onDismiss={() => tokensBack.close('dismiss')}
          />
        )}
        {/* 🔁 先月の相談をいまのメモでもう一度（月のはじめ 7 日・「今月の相談が戻りました」が出る月は出さない＝2 行にしない）。 */}
        {homeKnown && reask.show && !tokensBack.show && !showGrown && (
          <GrownLine
            mark="reask"
            icon={MessageCircle}
            text={reask.text.lead}
            actionLabel={reask.text.action}
            onConsult={() => { reask.close('open'); onConsultDraft(reask.question, 'reask'); }}
            onDismiss={() => reask.close('dismiss')}
          />
        )}
        {/* 月末・12 月の 1 行（本を読み込んで、ホームの中身を出すときに一緒に出す＝あとから差し込んで押し下げない）。 */}
        {homeKnown && <ShareNudge nudge={shareNudge.nudge} onOpen={onShareNudge} onDismiss={shareNudge.dismiss} />}
      </div>

      {loading && books.length === 0 ? (
        // 読み込み中は形だけ（既存ユーザーに新規用の「はじめる」カードを一瞬見せない）。
        <div role="status" aria-busy="true" aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <HomeBlocksSkeleton />
        </div>
      ) : loadError && books.length === 0 ? (
        // 読み込みに失敗したときに、既存ユーザーへ初回用の「はじめましょう」を見せない。
        // この画面の主役は「もう一度」（ErrorMessage の主の操作は、どの画面でも枠の同じ形・2026-10-10）。
        <ErrorMessage
          title="本を読み込めませんでした"
          description="通信状況を確認して、もう一度お試しください。"
          actions={onRetry ? [{ label: 'もう一度', onClick: onRetry, variant: 'primary' }] : []}
        />
      ) : books.length === 0 ? (
        <StartCard onQuickstart={onQuickstart} onAddBook={onAddReadingBook || onAddBook} onAdvisor={onAdvisor} onImport={onImport} />
      ) : !homeKnown ? (
        <div role="status" aria-busy="true" aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <HomeBlocksSkeleton />
        </div>
      ) : (
        <>
          {!memoState.hasMemos && <HomeFirstStep bookCount={books.length} onQuickstart={onQuickstart} onImport={onImport} />}
          <ReadingNow books={books} onOpenBook={onOpenBook} onWriteMemo={onWriteMemo} onStartReading={onStartReading} onAddBook={onAddBook} onSeeAllReading={onSeeAllReading} onCoverRetry={onCoverRetry} onRead={onRead} />
          {/* 今日の行動とすべての本は、1 枚のまとまりの 2 行（区切り線でつなぐ）。 */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {onOpenActions && actionsSummary && (
            <>
              <HomeActionsRow
                summary={actionsSummary}
                onOpen={(sm) => { track('home_actions_row', { kind: sm.kind, count: sm.count }); onOpenActions(); }}
              />
              {navDivider}
            </>
          )}
          <button type="button" onClick={onOpenLibrary} style={navRow}>
            <Library size="1.2em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>すべての本</span>
            <span style={navValue}>{books.length} 冊</span>
            <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </button>
          </div>
        </>
      )}
    </div>
  );
}
