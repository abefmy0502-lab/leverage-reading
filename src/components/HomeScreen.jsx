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
import { progressLabel, progressSpoken, hasProgress } from '../lib/readingProgress';
import { useEffect, useMemo, useState } from 'react';
import { isUpcoming, shortPubdate } from '../lib/favoriteAuthors';
import { Library, ChevronRight, PencilLine, Plus, BookOpen, Timer, Sprout, X, MessageCircle, CalendarCheck, CalendarDays, Compass, Camera, History } from 'lucide-react';
import { useReturnMoment } from '../hooks/useReturnMoment';
import { isLocalReminderCapable, isLocalReminderOn, rescheduleLocalReminders } from '../lib/localReminder';
import HomeFirstStep, { useHomeMemoState, MEMO_COUNT_WAIT_MS } from './HomeFirstStep';
import GrowthMeter from './GrowthMeter';
import ShareNudge, { useShareNudge } from './ShareNudge';
import { firstConsultDone, takeMemosReached, growthMeterText, rememberHomeMemoCount, lastHomeMemoCount, showGrowthPlaceholder, grownLinePending, markGrownLineDone, GROWTH_GOAL } from '../lib/firstDay';
import { displayTitle } from '../lib/bookTitle';
import { appNow } from '../lib/appNow';
import { firstConsultQuestion, memoConsultQuestion } from '../lib/consultHelpers';
import { appPurposeTextFor, purposeConsultQuestion } from '../lib/appPurpose';
import { useAuth } from '../hooks/useAuth';
import { usePaywall } from '../state/PaywallContext';
import { fetchUsedMjpy } from '../lib/tokens';
import { prevMonthOf, tokensBackCandidate, shouldShowTokensBack, tokensBackText, readTokensBackDone, markTokensBackDone } from '../lib/tokensBack';
import { reaskCandidate, pickReask, reaskText, readReaskDone, markReaskDone } from '../lib/reaskNudge';
import { renewalCandidate, yearReviewStats, hasAnything, renewalText, daysUntil, readRenewalDone, markRenewalDone } from '../lib/renewalReview';
import { annualNudgeCandidate, annualNudgeText, readAnnualNudgeDone, markAnnualNudgeDone } from '../lib/annualNudge';
import { readingSessions, useReadingSessions } from '../hooks/useReadingSessions';
import NotifyOptInCard from './NotifyOptInCard';
import { useGoals } from '../hooks/useGoals';
import { todayPlanItem } from '../lib/goalRoadmap';
import { ALL_GOALS_KEY, hasAnyGoal } from '../lib/goals';
import { toLocalYmd } from '../lib/dates';
import { fmtMd } from '../lib/readingPlan';
import { loadAllMemoRows } from '../hooks/useAllMemoRows';
import { supabase } from '../lib/supabase';
import MemoLinks from './MemoLinks';
import { useMemoLinkFinder } from '../hooks/useMemoLinkFinder';
import { track } from '../lib/analytics';
import { MiniCover } from './BookCards';
import { phrasePieces, withPhraseBreaks } from './TightBubble';
import { SkeletonBlock } from './Skeleton';
import ErrorMessage from './ErrorMessage';
import { useToast } from './Toast';
import { btnPrimary, btnGhost, btnLink, btnLinkQuiet, btnTonal, card } from '../styles/ui';

// DESIGN §5「行の中の小さい副ボタン」（ui.js の btnRow・高さ 44・文字 15・600）。折り返した行では幅いっぱいに伸びる。
const btnRow = btnTonal;
// 行の表紙の幅（MiniCover）。「読む」はこの幅＋間 12 だけ右から始めて、書名の列にそろえる。
const ROW_COVER_W = 40;

// 見出しの行の高さ（文字 × 行の高さ 1.3）と押せる高さ 44 の差の半分だけ、ボタンの上下を打ち消す（文字が大きく見出しの方が高いときは 0）。
const ADD_BTN_TRIM = 'min(0px, calc((1.3 * var(--text-heading) - var(--tap-min)) / 2))';

const sectionTitle = {
  fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-3)', lineHeight: 1.3,
};

// 文字ボタン（DESIGN §5: btnLink＝高さ 44・15/600・栗色）。
const textRow = btnLink;

function StartCard({ onQuickstart, onAddBook, onAdvisor, onImport, onShelfScan = null }) {
  // 「いま読んでいる本を追加する」なので、この入口だけ状態を読書中にして開く（onAddBook＝読書中のプリセット）。
  // 2026-11-25 オーナー「まずは自分の本棚にある本を追加するみたいなものが欲しい」: 副ボタンを「本棚の写真からまとめて追加」に。
  //   1 冊ずつの追加と取り込みは、下の文字ボタンの行に並べる（控えめな色・アクセントが強すぎないように）。
  return (
    <section aria-labelledby="home-start-title" style={card}>
      {/* 「読むほど、自分だけの相談相手が育つ」はログインと初回ガイドで伝え済み。ここは行動だけを示す（同じことを二度言わない）。 */}
      {/* 題名で目的を伝える（初日クイックスタートの題名「相談相手をつくる」とそろえる・SPEC §1-1）。 */}
      <h2 id="home-start-title" style={{ ...sectionTitle, margin: 0 }}>相談相手をつくる</h2>
      {/* 題の下に 1 行だけ、積み重ねが相談の質になることを言う（2026-10-10 第 9 回 総点検）。 */}
      <p style={{ margin: 'var(--space-1) 0 var(--space-4)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks('メモがたまるほど、相談の答えが深くなります')}
      </p>
      {/* data-first-step: 本が 0 冊で「写真で共有」を押したとき、ここへフォーカスを送る印（App.jsx の pointToFirstStep）。 */}
      {/* ボタンは横並びの箱なので、文節の切れ目つきの文字は span で 1 つにまとめる（切れ目ごとに別の項目に割れない）。 */}
      <button type="button" data-first-step="" onClick={onQuickstart} style={btnPrimary}><span>{withPhraseBreaks('読んだ本の一文をメモする')}</span></button>
      {onShelfScan ? (
        <button type="button" onClick={onShelfScan} style={{ ...btnGhost, marginTop: 'var(--space-3)', gap: 'var(--space-2)' }}><Camera size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} /><span>{withPhraseBreaks('本棚の写真からまとめて追加')}</span></button>
      ) : (
        <button type="button" onClick={onAddBook} style={{ ...btnGhost, marginTop: 'var(--space-3)' }}><span>{withPhraseBreaks('いま読んでいる本を追加する')}</span></button>
      )}
      {/* 文字ボタンの上下の余り（高さ 44 のため）をカードの内側余白と相殺し、上下の見た目をそろえる。 */}
      {(onImport || onShelfScan) && (
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', columnGap: 'var(--space-4)', margin: onAdvisor ? 'var(--space-3) 0 0' : 'var(--space-3) 0 calc(-1 * var(--space-2))' }}>
          {onShelfScan && <button type="button" onClick={onAddBook} style={btnLinkQuiet}><span style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('1 冊ずつ追加する')}</span></button>}
          {/* どのアプリから取り込めるかは、開いたシートの題名の下で言う。設定の「ほかのアプリから取り込む」と同じ名前。 */}
          {onImport && <button type="button" onClick={onImport} style={onShelfScan ? btnLinkQuiet : textRow}><span style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('ほかのアプリから取り込む')}</span></button>}
        </div>
      )}
      {/* 🌱 まだ読んだ本が無い人の入口（2026-11-25 オーナー方針「これから読書を始める人にも」）。AI 選書（無料プランも）に下書きを入れて開く。
          区切りの線の下に 1 行（本がある人の入口と混ぜない）。 */}
      {onAdvisor && (
        <div style={{ borderTop: '1px solid var(--separator)', margin: 'var(--space-4) 0 calc(-1 * var(--space-2))', paddingTop: 'var(--space-1)', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--space-1)' }}>
          {/* 前の文は付随情報の強さ（13/--text-3）に下げ、ボタンは灰の文字＋ › で押せると分かる形に
              （同じ強さだと 1 つの文に見えた・2026-11-26 ui-critic）。強弱は 塗り → 枠 → 文字 の 3 段のまま。 */}
          {/* 2026-11-26（継続の点検）: 読書の習慣がない人の入口が灰の小さな文字だけだったので、ボタンを栗色の文字（btnLink）に上げた。
              強弱は 塗り（一文をメモする）→ 枠（本棚の写真）→ 文字 の 3 段のまま。 */}
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>まだ読んだ本がなければ</span>
          <button type="button" onClick={onAdvisor} style={{ ...textRow, gap: 'var(--space-1)' }}>最初の 1 冊を探す<ChevronRight size="1em" aria-hidden="true" style={{ flexShrink: 0 }} /></button>
        </div>
      )}
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
        // 読んだところも読み上げる（名前がボタンの中身を置き換えるため・2026-11-26 点検）
        aria-label={`『${b.title}』を開く${hasProgress({ unit: b.progressUnit, current: b.currentPage, total: b.totalPages }) ? `・${progressSpoken({ unit: b.progressUnit, current: b.currentPage, total: b.totalPages })}` : ''}`}
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
      style={{ ...btnLinkQuiet, gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}
    >
      <Timer size="1.1em" strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />読む
    </button>
  );
}

// 書名を切れ端ごとの inline-block に。切れ端は文節、長い文節はその中の文字の種類の切れ目（「アウトプット／大全」）まで分ける。
// 切れ端の切れ目でだけ折り返し、それでも列より長い切れ端だけ 1 行で … に切る（語の途中では割らない・2026-10-04）。
function phraseChunks(title) {
  const list = phrasePieces(displayTitle(title), { scriptBreaks: true }).filter((p) => p && p !== '\n');
  return list.map((p, i) => (
    <span key={i} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{p}</span>
  ));
}

const byUpdated = (a, b) => (b.updated_at || '').localeCompare(a.updated_at || '');
const byDone = (a, b) => (b.doneDate || '').localeCompare(a.doneDate || '') || byUpdated(a, b);

function ReadingNow({ books: allBooks, onOpenBook, onWriteMemo, onStartReading, onAddBook, onSeeAllReading, onCoverRetry, onRead }) {
  // 🗄 アーカイブした本は出さない（読書中・積読から外したい本・2026-11-26）
  const books = allBooks.filter((b) => !b.archivedAt);
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
  // 🌱 読みたいの本だけの人（最初の 1 冊を AI 選書で見つけた人など・2026-11-25 オーナー方針「読書を始める人にも」）:
  //   「読書中の本はありません」で行き止まりにせず、読みたいの本（新しく触った順・3 冊）に「読み始める」。
  const wanted = shown.length === 0 && stacked.length === 0 && finished.length === 0 ? books.filter((b) => b.status === 'want').sort(byUpdated).slice(0, 3) : [];
  const candidates = stacked.length ? stacked : finished.length ? finished : wanted;
  const heading = stacked.length ? '次に読む本' : finished.length ? '最近読み終えた本' : wanted.length ? '読みたい本' : 'いま読んでいる本';
  const memoBtn = (b) => (
    <button type="button" onClick={() => onWriteMemo(b)} aria-label={`『${b.title}』にメモを書く`} style={btnRow}>
      <PencilLine size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} />メモを書く
    </button>
  );
  return (
    <section aria-labelledby="home-reading-title">
      {/* 見出しの右に「本を追加」（見出しの行の操作・2026-10-16 ui-critic「本を追加が段の間に浮いている」）。
          文字ボタンの右の 4 を打ち消して、文字の右端をカードの右端にそろえる。 */}
      {/* 押せる高さ 44 の「本を追加」が行を見出しより高くし、見出し → カードの空きがカードとカードの間（24）と同じに見えていた
          （2026-11-23 点検）。ボタンの上下を見出しの行の高さまで打ち消して（押せる 44 はそのまま）、見出し → カードを 12 に。 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: 'var(--space-3)', flexWrap: 'wrap', margin: '0 calc(-1 * var(--space-1)) var(--space-3) 0' }}>
        <h2 id="home-reading-title" style={{ ...sectionTitle, margin: 0 }}>{heading}</h2>
        {/* 見出しの下に折り返したときも左端を見出しにそろえる（＋ の内側の空きと文字ボタンの左の余白のぶん左へ・文字最大の点検 2026-11-18） */}
        <button type="button" onClick={onAddBook} style={{ ...btnLink, gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-2))', marginTop: ADD_BTN_TRIM, marginBottom: ADD_BTN_TRIM }}>
          <Plus size="1.2em" aria-hidden="true" />本を追加
        </button>
      </div>
      {shown.length === 0 && candidates.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>読書中の本はありません</p>
      ) : (
        // 本は 1 枚のまとまりに行で並べる（1 冊ずつのカードにしない・iOS の一覧と同じ）。
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {shown.map((b, i) => (
            // 📖 どこまで読んだかを記録した本は、著者の後ろに「p.120 / 320」（2026-11-26）
            <BookRow key={b.id} divider={i > 0} book={b} sub={[b.author, progressLabel({ current: b.currentPage, total: b.totalPages, unit: b.progressUnit })].filter(Boolean).join(' · ')} onOpenBook={onOpenBook} onCoverRetry={onCoverRetry} action={memoBtn(b)} footer={onRead ? <ReadLink book={b} onRead={onRead} /> : null} />
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
              action={(b.status === 'before' || b.status === 'want') && onStartReading ? (
                <button type="button" onClick={() => onStartReading(b)} aria-label={`『${b.title}』を読み始める`} style={btnRow}>
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
// 📅 読書計画の 1 行（2026-11-16 オーナー C 案「読書計画を作った人だけ、ホームに今日の本を 1 行」）。
//   作っていない人には出さない（ホームで機能をすすめない）。押すと読書計画（GoalScreen の plan）。
function usePlanToday(books, enabled) {
  const { roadmaps, loaded: goalsLoaded, seeded } = useGoals();
  const loaded = goalsLoaded || seeded; // 端末の控えで先に描く（後から差し込まない・2026-11-21）
  const { rows: sessions } = useReadingSessions();
  return useMemo(() => {
    if (!enabled || !loaded) return null;
    const rec = roadmaps?.[ALL_GOALS_KEY];
    if (!rec?.roadmap) return null;
    const item = todayPlanItem(rec, books, sessions, toLocalYmd(appNow()));
    // 読書計画を作った人で、読む本が尽きたら（区切りが進んだ・読み終えた）次の 3 か月の本を選ぶ入口に（2026-11-17）。
    if (!item) return rec.plan ? { kind: 'choose' } : null;
    const book = books.find((b) => b.id === item.bookId);
    return book ? { ...item, book } : null;
  }, [enabled, loaded, roadmaps, books, sessions]);
}

// 🧭 目標を書いていない人のホームの 1 行（2026-11-17 オーナー「目立たないので知らないまま進みそう・わかりやすいところに」）。
//   本が 1 冊以上・メモがある（初日のメモ → 相談の流れは邪魔しない）・目標が 1 つも無い・閉じていないときだけ。
//   × で閉じたら、その端末とその人には出さない（振り返り › 行動 のいちばん上からはいつでも書ける）。
const GOAL_NUDGE_KEY = 'orime.home.goalNudge.closed:';
function readGoalNudgeClosed(uid) { try { return !!uid && localStorage.getItem(GOAL_NUDGE_KEY + uid) === '1'; } catch { return false; } }
function useGoalNudge(enabled, uid) {
  const { goals, loaded: goalsLoaded, seeded } = useGoals();
  const loaded = goalsLoaded || seeded;
  const [closed, setClosed] = useState(() => readGoalNudgeClosed(uid));
  useEffect(() => { setClosed(readGoalNudgeClosed(uid)); }, [uid]);
  const show = enabled && loaded && !closed && !hasAnyGoal(goals);
  const close = () => { setClosed(true); try { if (uid) localStorage.setItem(GOAL_NUDGE_KEY + uid, '1'); } catch { /* ignore */ } };
  // 閉じた直後の「元に戻す」（2026-11-23 点検・× 1 回で知らせなしに二度と出なかった）。
  const reopen = () => { try { if (uid) localStorage.removeItem(GOAL_NUDGE_KEY + uid); } catch { /* ignore */ } setClosed(false); };
  return { show, close, reopen };
}

function HomeGoalRow({ onOpen, onClose }) {
  // › はほかの枠の行と同じ縦の中央。× は › の右の別の列（押せる 44・縦は行いっぱい）に置いて、
  //   進む › と閉じる × を横に離す（右上に重ねると › と近すぎた／› を下にそろえると行ごとに位置が違った・2026-11-18 ui-critic 3 回）。
  return (
    <div data-home-goal="" style={{ ...card, padding: 0, display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
      <button type="button" onClick={onOpen} aria-label="目標を書く" style={{ ...navRow, flex: 1, minWidth: 0, width: 'auto', paddingRight: 'var(--space-1)' }}>
        <Compass size="1.2em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('目標を書く')}</span>
        </span>
        <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>
      <button type="button" onClick={onClose} aria-label="目標の案内を閉じる" style={{ width: 'var(--tap-min)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderLeft: '1px solid var(--separator)', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>
        <X size="1.1em" aria-hidden="true" />
      </button>
    </div>
  );
}

function HomePlanRow({ plan, onOpen }) {
  const title = displayTitle(plan.book?.title || '');
  const sub = plan.kind === 'choose' ? '次に読む本を選びましょう' : plan.kind === 'today' ? `今日は『${title}』` : `${fmtMd(plan.start)} から『${title}』`;
  return (
    <button type="button" data-home-plan="" onClick={onOpen} aria-label={`読書計画。${sub}。読書計画を開く`} style={navRow}>
      <CalendarDays size="1.2em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>読書計画</span>
        <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, overflow: 'hidden', overflowWrap: 'anywhere' }}>{sub}</span>
      </span>
      <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </button>
  );
}

// 🌱 相談相手が育ちました（2026-10-10）: メモが 10 件になったのを見たあと 1 回だけ、題の下（育つまでの一行と同じ場所）に。
//   見た目は育つまでの一行（芽 1.2em・--text-3＋13/--text-2）＋右に文字ボタン「相談してみる」と ×。押しても閉じても二度と出さない。
//   7 日間無料はここではすすめない（ホームではすすめない・相談の画面の案内 ③ はそのまま）。
// stack: 文が長い 1 行（更新の前・年額）は文を全幅にし、ボタンと × を次の行の右へ（1 行 14 字に縮めない・2026-10-22 ui-critic）。
// 「稲盛和夫さんの新しい本『…』が出ました」／発売前は「…が、2026年12月中旬に出ます」（ほかにもあれば「ほか N 冊」）。
//   書名は文節で割らない（『…（』で行が終わっていた・2026-11-25 ui-critic）＝書名の中は keep-all・はみ出すときだけ割る。
export function authorNewsText({ fav, book, more = 0 }) {
  const t = String(book?.title || '');
  const title = t.length > 24 ? `${t.slice(0, 23)}…` : t;
  const when = shortPubdate(book?.pubdate);
  const upcoming = isUpcoming(book);
  return (
    <>
      {withPhraseBreaks(`${fav.name}さんの新しい本`)}
      <span style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>『{title}』</span>
      {withPhraseBreaks(upcoming ? `が、${when}に出ます` : 'が出ました')}
      {more > 0 && <span style={{ whiteSpace: 'nowrap' }}>（ほか {more}&nbsp;冊）</span>}
    </>
  );
}

// secondary: 2 つ目の文字ボタン（{ label, onClick, aria }・はじめて 1 年の「この 1 年を 1 枚に」・2026-11-27）。
function GrownLine({ onConsult, onDismiss, text = null, icon: Icon = Sprout, actionLabel = '相談してみる', actionAria = null, mark = 'grown', stack = false, secondary = null }) {
  // 積み重ねの形（stack）は × を右上の角に（「読み返す ×」が 1 つの組に見えない・iOS の閉じる位置・2026-11-26 ui-critic）。
  const closeBtn = (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="この案内を閉じる"
      style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-full)', padding: 0, cursor: 'pointer', color: 'var(--text-3)', ...(stack ? { position: 'absolute', top: 'calc((var(--text-meta) * 1.5 - var(--tap-min)) / 2)', right: 0 } : null) }}
    >
      <X size="1.2em" aria-hidden="true" />
    </button>
  );
  return (
    <div data-grown-line={mark} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)', margin: '0 calc(-1 * var(--space-3)) 0 0', ...(stack ? { position: 'relative' } : null) }}>
      {/* 積み重ねの形の × の空きは、1 行目（前置き）だけ（引用は全幅＝1 行増えない・2026-11-27 ui-critic）。前置きは呼び手が [data-lead] で包む。 */}
      <p style={{ flex: stack ? '1 1 100%' : '1 1 10em', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0 }}>
          <Icon size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)' }} />
        </span>
        <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere', ...(stack && (typeof text === 'string' || !text) ? { paddingRight: 'var(--tap-min)' } : null) }}>{typeof text === 'string' || !text ? withPhraseBreaks(text || `メモが ${GROWTH_GOAL}\u00a0件になり、相談相手が育ちました`) : text}</span>
      </p>
      {/* 1 行に収まるときは右へ（文が伸びて押す）。折り返したときは文の頭（芽の右）にそろえる（2026-10-10 ui-critic）。 */}
      <span style={{ display: 'flex', alignItems: 'center', paddingLeft: 'calc(var(--text-meta) * 1.2)' }}>
        <button type="button" onClick={onConsult} aria-label={actionAria || undefined} style={{ ...btnLink, fontSize: 'min(var(--text-sub), var(--text-bar-max))', whiteSpace: 'nowrap' }}>{actionLabel}</button>
        {secondary && (
          <button type="button" onClick={secondary.onClick} aria-label={secondary.aria || undefined} style={{ ...btnLinkQuiet, fontSize: 'min(var(--text-sub), var(--text-bar-max))', whiteSpace: 'nowrap', marginLeft: 'var(--space-2)' }}>{secondary.label}</button>
        )}
        {!stack && closeBtn}
      </span>
      {stack && closeBtn}
    </div>
  );
}

const localReminderSet = new Set(); // 端末の中の通知を置き直した利用者（その回に 1 度だけ）

// ホームの時期の案内が読んだ結果を、アプリを開いている間だけ覚える（10 分・2026-11-21）。
//   前はホームに戻るたびに読み直し、その時期は毎回、形だけの表示で最大まで待っていた。値が null（出さない）でも覚える。
const HOME_PEEK_TTL_MS = 10 * 60 * 1000;
const homePeekCache = new Map();
function readHomePeek(key) {
  const hit = key ? homePeekCache.get(key) : null;
  return hit && Date.now() - hit.at < HOME_PEEK_TTL_MS ? hit : null;
}
function writeHomePeek(key, value) {
  if (key) homePeekCache.set(key, { value, at: Date.now() });
}

// 🔁 「今月の相談が戻りました」（lib/tokensBack.js・2026-10-20）。先月の使った量を読み終えるか MEMO_COUNT_WAIT_MS まで待って
//   1 回だけ決める（あとから差し込んでホームを押し下げない）。戻り値: { ready, show, text, close(action) }。
function useTokensBack(active) {
  const { user } = useAuth();
  const { freeMode, tokensRemaining } = usePaywall();
  const [now] = useState(() => appNow().getTime());
  const [doneMonth] = useState(() => readTokensBackDone(user?.id));
  const need = active && !!user?.id && tokensBackCandidate({ freeMode, now, doneMonth });
  const peekKey = user?.id ? `tokensBack:${user.id}:${prevMonthOf(now).key}` : null;
  const [prevUsed, setPrevUsed] = useState(() => { const h = readHomePeek(peekKey); return h ? h.value : undefined; }); // undefined＝まだ・null＝読めない
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!need || prevUsed !== undefined) return undefined;
    let alive = true;
    fetchUsedMjpy(user.id, `free-${prevMonthOf(now).key}`).then((v) => { writeHomePeek(peekKey, v); if (alive) setPrevUsed(v); });
    const t = setTimeout(() => { if (alive) setTimedOut(true); }, MEMO_COUNT_WAIT_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [need, user?.id, now]);
  const ready = !need || prevUsed !== undefined || timedOut;
  const [decided, setDecided] = useState(undefined);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!ready || decided !== undefined || !active) return;
    setDecided(need && prevUsed !== undefined && shouldShowTokensBack({ prevUsedMjpy: prevUsed, createdAt: user?.is_anonymous ? null : (user?.created_at || null), now, remaining: tokensRemaining }));
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
  const peekKey = user?.id ? `reask:${user.id}` : null;
  const [picked, setPicked] = useState(() => { const h = readHomePeek(peekKey); return h ? h.value : undefined; }); // undefined＝まだ・null＝出さない
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!need || picked !== undefined) return undefined;
    let alive = true;
    (async () => {
      try {
        const [{ data }, memos] = await Promise.all([
          supabase.from('chat_messages').select('content, created_at').eq('user_id', user.id).eq('role', 'user').order('created_at', { ascending: false }).limit(20),
          loadAllMemoRows(user.id),
        ]);
        const memoTimes = (memos?.rows || []).map((m) => Date.parse(m.created_at || '')).filter(Number.isFinite);
        const v = pickReask({ consults: data || [], memoTimes, now });
        writeHomePeek(peekKey, v);
        if (alive) setPicked(v);
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

// 📅 年額プランの更新の前に「この 1 年に残したもの」（lib/renewalReview.js・2026-10-22）。更新まで 30 日以内の年額の人だけ。
//   メモの作成日時と読書の時間を読み終えるか MEMO_COUNT_WAIT_MS まで待って 1 回だけ決める（あとから差し込まない）。
function useRenewalReview(active, books) {
  const { user } = useAuth();
  const { plan, planPeriod, periodEnd } = usePaywall();
  const [now] = useState(() => appNow().getTime());
  const [doneKey] = useState(() => readRenewalDone(user?.id));
  const need = active && !!user?.id && renewalCandidate({ plan, priceId: planPeriod, periodEnd, now, doneKey });
  const peekKey = user?.id ? `renewal:${user.id}:${periodEnd || ''}` : null;
  const [stats, setStats] = useState(() => { const h = readHomePeek(peekKey); return h ? h.value : undefined; }); // undefined＝まだ・null＝出さない
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!need || stats !== undefined) return undefined;
    let alive = true;
    (async () => {
      try {
        const [memos] = await Promise.all([loadAllMemoRows(user.id), readingSessions.load(user.id).catch(() => {})]);
        const memoTimes = (memos?.rows || []).map((m) => Date.parse(m.created_at || '')).filter(Number.isFinite);
        const st = yearReviewStats({ books, memoTimes, sessions: readingSessions.rows(), now });
        const v = hasAnything(st) ? st : null;
        writeHomePeek(peekKey, v);
        if (alive) setStats(v);
      } catch { if (alive) setStats(null); }
    })();
    const t = setTimeout(() => { if (alive) setTimedOut(true); }, MEMO_COUNT_WAIT_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [need, user?.id, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !need || stats !== undefined || timedOut;
  const [closed, setClosed] = useState(false);
  const close = (action) => {
    markRenewalDone(user?.id, periodEnd);
    setClosed(true);
    track('renewal_review', { action });
  };
  return { ready, show: !!stats && !closed, text: stats ? renewalText({ days: daysUntil(periodEnd, now) ?? 0, stats }) : null, close };
}

// 📅 12 月・1 月に、月額プランの人へ年額プランを 1 行（lib/annualNudge.js・2026-10-22）。
function useAnnualNudge(active) {
  const { user } = useAuth();
  const { plan, planPeriod } = usePaywall();
  const [now] = useState(() => appNow().getTime());
  const [doneSeason] = useState(() => readAnnualNudgeDone(user?.id));
  const show0 = active && !!user?.id && annualNudgeCandidate({ plan, priceId: planPeriod, now, doneSeason });
  const [closed, setClosed] = useState(false);
  const close = (action) => {
    markAnnualNudgeDone(user?.id, now);
    setClosed(true);
    track('annual_nudge', { action });
  };
  return { show: show0 && !closed, text: show0 ? annualNudgeText(now) : null, close };
}

// 🔗 ホームのメモを書くで保存したメモと似たことを、ほかの本でも書いていたら題の下に 1 行（MemoLinks の line・× で閉じる）。
//   見つからなければ何も出さない（全部のメモを読むのは保存したときだけ）。
// offerNotify: 似たメモが無いときに、思い出しの通知の 1 回だけの案内（自分のメモが 3 件以上・2026-11-26）を出す。
function HomeSavedLinks({ books, saved, onOpen, onDismiss, offerNotify = false }) {
  const { find } = useMemoLinkFinder({ books, enabled: !!saved });
  const links = useMemo(() => (saved ? find({ text: saved.text, bookId: saved.bookId, memoId: saved.id }) : []), [saved, find]);
  if (!saved) return null;
  if (links.length === 0) return offerNotify ? <NotifyOptInCard where="memo3" primary={false} /> : null;
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
      {/* 見出し → カードは本物と同じ 12（本物は「本を追加」の上下を見出しの行の高さまで打ち消している・2026-11-23）。 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* 大きさは文字に比例（文字最大でも本物と同じ形・見出しの下に「本を追加」が回るのも同じ・2026-11-18）。
            行の高さは見出し 1 行ぶん（文字 × 1.3）＝本物の見出しの行と同じ（44 にしていて、読み込んだあと約 13 跳ねた・2026-11-23 ui-critic）。 */}
        <div style={{ minHeight: 'calc(1.3 * var(--text-heading))', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 'var(--space-2)', fontSize: 'var(--text-heading)' }}>
          <SkeletonBlock width="7.5em" height="1.2em" radius="var(--radius)" style={{ maxWidth: '100%' }} />
          <SkeletonBlock width="4em" height="1em" radius="var(--radius)" style={{ fontSize: 'var(--text-sub)' }} />
        </div>
        {/* いま読んでいる本の行カードの形（表紙・書名と著者の 2 行・「メモを書く」の面）を 2 冊ぶん。高さも本物にそろえて、
            読み込んだあとに下が跳ばないように（2026-11-18 ui-critic）。区切り線は本物と同じ書名の列から。 */}
        {/* 行の組み立ては本物の BookRow と同じ（上下 12・左右 16 → 表紙 40×57 と書名・著者 → 12 → 44 の操作の行・2 行目は上に書名の列からの区切り線）。
            前は余白 16・行の間 16 の別の組み立てで、読み込んだあとにカードが約 7 伸びた（2026-11-23）。 */}
        <div style={{ ...skeletonCard, background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ position: 'relative', padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {i > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, left: `calc(var(--space-4) + ${ROW_COVER_W}px + var(--space-3))`, borderTop: '1px solid var(--separator)' }} />}
              <div style={{ minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <SkeletonBlock width={ROW_COVER_W} height={57} radius="var(--radius-sm, 4px)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <div style={{ height: 'calc(var(--text-body) * 1.4)', display: 'flex', alignItems: 'center' }}>
                    <SkeletonBlock width="70%" height="calc(var(--text-body) * 1.2)" radius="var(--radius)" />
                  </div>
                  <div style={{ height: 'calc(var(--text-meta) * 1.4)', display: 'flex', alignItems: 'center' }}>
                    <SkeletonBlock width="45%" height="var(--text-meta)" radius="var(--radius)" />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', paddingLeft: `calc(${ROW_COVER_W}px + var(--space-3))`, fontSize: 'var(--text-sub)' }}>
                <SkeletonBlock width="7em" height="var(--tap-min)" radius="var(--radius)" style={{ maxWidth: '100%', minHeight: 'calc(1.5em + var(--space-4))' }} />
                <SkeletonBlock width="3.5em" height="var(--tap-min)" radius="var(--radius)" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 下の行のまとまり（行動＝題と 1 行の 2 段・すべての本＝1 段）。本物の行と同じ高さ・同じ区切り線の位置。 */}
      <div style={{ ...skeletonCard, background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)' }}>
        <div style={{ minHeight: 68, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', boxSizing: 'border-box' }}>
          <SkeletonBlock width="1.2em" height="1.2em" radius="var(--radius)" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <SkeletonBlock width="40%" height={20} radius="var(--radius)" />
            <SkeletonBlock width="75%" height={14} radius="var(--radius)" />
          </div>
        </div>
        {navDivider}
        <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', boxSizing: 'border-box' }}>
          <SkeletonBlock width="1.2em" height="1.2em" radius="var(--radius)" />
          <SkeletonBlock width="35%" height={20} radius="var(--radius)" />
        </div>
      </div>
    </>
  );
}

export default function HomeScreen({
  books = [], loading = false, loadError = null, onRetry,
  onQuickstart, onAddBook, onAddReadingBook, onAdvisor, onImport, onShelfScan = null, authorNews = null,
  onOpenBook, onWriteMemo, onStartReading, onOpenLibrary, onSeeAllReading, onCoverRetry, onShareNudge, onRead,
  onOpenActions, onConsultDraft, savedMemo = null, onDismissSavedMemo, onOpenMemo, onAddOneLines = null, onOpenConsult = null,
  onOpenRecord = null, onOpenPlan = null, onOpenReadingPlan = null, onOpenGoals = null, onReadFirst = null, onResumeConsult = null,
}) {
  const { user } = useAuth();
  const toast = useToast();
  // 🌱 育つまでの一行の右の次の一歩（2026-10-20）: はじめての相談の前は「相談してみる」（入れた理由かメモから下書き・送らない）、
  //   相談したあとは「一文をメモする」（メモの無い読んだ本へ・初日クイックスタートの一言の段）。どちらか 1 つだけ。
  const growthAction = !onConsultDraft ? null : !firstConsultDone()
    // 書いたばかりのメモがあれば、そのメモから（入れた理由より先＝いま書いた言葉が答えのもとになるのが見える・2026-11-27）。
    ? { label: '相談してみる', onClick: () => { track('home_growth_action', { action: 'consult' }); onConsultDraft(memoConsultQuestion(savedMemo?.text) || purposeConsultQuestion(appPurposeTextFor(user)) || firstConsultQuestion({ books, memoCount: memoState.count }), 'growth'); } }
    : onAddOneLines ? { label: '一文をメモする', onClick: () => { track('home_growth_action', { action: 'one_line' }); onAddOneLines(); } } : null;
  // メモがあるか（はじめの一歩を出すか）。分かるまではスケルトン（カードを遅れて差し込まない・最大 800ms）。
  const memoState = useHomeMemoState(books);
  // 月末・12 月の 1 行（数えるのはメモの件数と同じ時点・決まるまでホームは形のまま＝あとから差し込まない）。
  const shareNudge = useShareNudge(books, !!onShareNudge && !loading && !loadError && books.length > 0);
  // 無料プランで先月のトークンを使い切った人に、月のはじめの 7 日間だけ「今月の相談が戻りました」（2026-10-20）。
  const tokensBack = useTokensBack(!!onOpenConsult && !loading && !loadError && books.length > 0);
  const reask = useReaskNudge(!!onConsultDraft && !loading && !loadError && books.length > 0);
  // 🌙 また開いたときの 1 行（2 日以上あけた日の前のメモ・7 日以上で「おかえりなさい」・はじめて 1 か月〜1 年・lib/returnMoments.js・2026-11-26）。
  const returnMoment = useReturnMoment(!!onOpenMemo && !loading && !loadError && books.length > 0, books, MEMO_COUNT_WAIT_MS);
  // 🔔📱 端末の中だけの思い出しの通知（lib/localReminder.js）: ホームを開くたびに先の予定を置き直す
  //   ＝開いている人には届かず、開かなくなったときだけ 3・10・24 日後に届く。その回に 1 度だけ。
  useEffect(() => {
    if (loading || loadError || !user?.id || localReminderSet.has(user.id) || !isLocalReminderCapable() || !isLocalReminderOn()) return;
    localReminderSet.add(user.id);
    loadAllMemoRows(user.id).then((r) => {
      const memos = (r?.rows || []).filter((m) => m.book_id).map((m) => ({ id: m.id, bookId: m.book_id, text: m.text || '', createdAt: m.created_at, sourceType: m.source_type || null }));
      return rescheduleLocalReminders({ memos, books });
    }).catch(() => {});
  }, [loading, loadError, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 集中モードで 2 回以上読んだ読みかけの本（メモ 0 件のホームのカードを問いに替える・HomeFirstStep）。
  const { rows: homeSessions } = useReadingSessions();
  const moment = returnMoment.moment;
  // 1 語の問いの本（2026-11-27 模擬 6 回目「集中モードを使わない人には、何日たっても同じ催促が出る」「上の行と別の本を指す」）。
  //   読書中の本があれば、集中モードを使っていなくても出す。上の 1 行が読書中の本を指していれば、その本にそろえる
  //   → 無ければ最後に集中モードで読んだ本 → 無ければいちばん最近さわった読書中の本。
  const focusReadingBook = useMemo(() => {
    const reading = books.filter((b) => b.status === 'reading' && !b.archivedAt);
    if (reading.length === 0) return null;
    const momentId = moment?.book?.id || moment?.memo?.bookId || moment?.bookId || null;
    const same = momentId ? reading.find((b) => b.id === momentId) : null;
    if (same) return same;
    const rows = Array.isArray(homeSessions) ? homeSessions : [];
    const last = [...rows].sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || ''))).find((r) => reading.some((b) => b.id === r.book_id));
    if (last) return reading.find((b) => b.id === last.book_id);
    return [...reading].sort((a, b) => String(b.updated_at || b.updatedAt || '').localeCompare(String(a.updated_at || a.updatedAt || '')))[0];
  }, [homeSessions, books, moment]);
  const momentBook = !moment ? null : moment.book ? books.find((b) => b.id === moment.book.id) || null : books.find((b) => b.id === (moment.memo?.bookId || moment.bookId)) || null;
  // 押した先（読み返す＝メモを開く・いまの考えと比べる＝相談の下書き・読み始める＝一覧の「読み始める」と同じ）。押す先が用意されていなければ出さない。
  // 期限が来た行動は、月末の共有の 1 行より先（使う目的が「仕事で使う」人に、共有の案内が行動を押しのけていた・2026-11-26 体験した人の声）。
  //   その日は共有の 1 行を出さない（題の下は 1 行）。
  const momentGo = !moment ? null
    : moment.action === 'advisor' ? (onAdvisor ? () => onAdvisor('本棚の本は、いまの気分に合わないみたい。いまの悩みに合う本を 1 冊探したい。') : null)
    : moment.action === 'resume' ? (onResumeConsult ? () => onResumeConsult(moment.question) : null)
    : !momentBook ? null
    : moment.action === 'open' ? () => onOpenBook(momentBook)
    : moment.action === 'compare' ? (onConsultDraft ? () => onConsultDraft(moment.question, 'moment') : null)
    : moment.action === 'focus' ? (onReadFirst ? () => onReadFirst(momentBook) : null)
    : moment.action === 'actions' ? (onOpenActions ? () => onOpenActions() : null)
    : () => onOpenMemo(momentBook, moment.memo.id);
  // 年額の更新の前の 1 行（30 日前から）と、12〜1 月の月額の人への年額の 1 行（2026-10-22）。どちらも 1 行ずつ・ほかの 1 行より先。
  const renewal = useRenewalReview(!!onOpenRecord && !loading && !loadError && books.length > 0, books);
  const annual = useAnnualNudge(!!onOpenPlan && !loading && !loadError && books.length > 0);
  const planToday = usePlanToday(books, !!onOpenReadingPlan && !loading && !loadError && books.length > 0);
  // 🧭 目標を書いていない人に、ホームで 1 行（初日のメモがまだの人には出さない）。
  const goalNudge = useGoalNudge(!!onOpenGoals && !loading && !loadError && books.length > 0 && memoState.known && memoState.hasMemos, user?.id);
  const homeKnown = memoState.known && shareNudge.ready && tokensBack.ready && reask.ready && renewal.ready && returnMoment.ready;
  // ✍️ お気に入りの著者の新しい本は、ホームが落ち着いたときにもう分かっていたときだけ出す（裏で聞き直して
  //   あとから分かった本は、次にホームを開いたときに＝見ている途中で中身を押し下げない・2026-11-26 点検）。
  const [newsAllowed, setNewsAllowed] = useState(null);
  useEffect(() => {
    if (homeKnown && newsAllowed === null) setNewsAllowed(!!authorNews?.news);
  }, [homeKnown, newsAllowed, authorNews?.news]);
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
  // 期限が来た行動は「相談相手が育ちました」と月末の共有の 1 行より先（その日はそれらを出さない・題の下は 1 行）。
  const actionFirst = moment?.kind === 'action';
  const momentShown = homeKnown && !!momentGo && !tokensBack.show && !renewal.show && !annual.show && !reask.show && (actionFirst || (!showGrown && !shareNudge.nudge));
  // 出したその回だけ（閉じるまで残し続けると、ほかの日の 1 行＝前のメモとの再会を何日も押しのけていた・2026-11-26 体験した人の声）。
  //   出した時点で済みにし、この回のうちは閉じるまで出したまま（次に開いたときは出さない）。
  const grownVisible = showGrown && homeKnown && books.length > 0 && !(momentShown && actionFirst);
  useEffect(() => { if (grownVisible) markGrownLineDone(); }, [grownVisible]);
  const closeGrown = (action) => {
    markGrownLineDone();
    setGrown(false);
    track('grown_card', { action });
  };
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
      {/* 題「ホーム」は 2026-11-25 にやめた（下のタブで分かる・オーナー「左上のホームという表記とロゴは消していい」）。読み上げには見えない題を残す。
          題の下に並べていた一行（育つまでの一行など）の箱は、中身が無いときは出さない（.home-notes:empty＝空の箱が間 24 を取って上が空いていた）。 */}
      <h1 style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>ホーム</h1>
      <div className="home-notes">
        {books.length > 0 && !homeKnown ? (showGrowthPlaceholder(lastCount) && (
          <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-meta) * 1.5)' }}>
            <SkeletonBlock width="56%" height={14} radius="var(--radius-full)" />
          </span>
        )) : books.length > 0 && growthMeterText(memoState.count) ? (
          <GrowthMeter memoCount={memoState.count} action={growthAction} />
        ) : books.length > 0 && showGrown && !(momentShown && actionFirst) ? (
          <GrownLine
            // 実際の件数で（取り込んだ 240 件の人に「10 件になり」と出していた・2026-11-27 体験した人の声）
            text={memoState.count != null && memoState.count > GROWTH_GOAL ? `メモが ${memoState.count}\u00a0件になり、相談相手が育ちました` : null}
            onConsult={() => { closeGrown('open'); onConsultDraft(purposeConsultQuestion(appPurposeTextFor(user)) || firstConsultQuestion({ books, memoCount: memoState.count }), 'grown'); }}
            onDismiss={() => closeGrown('dismiss')}
          />
        ) : null}
        {/* 🔗 ホームのメモを書くで保存したメモの似たメモ（題の下の静かな 1 行・2026-10-10）。 */}
        {/* 🔔 思い出しの通知の 1 回だけの案内は、似たメモが無かったときだけ（HomeSavedLinks の中・2026-11-27 体験した人の声
            「重なりの発見と通知の案内が同時に出て、いちばんいい瞬間が埋もれる」）。 */}
        {homeKnown && books.length > 0 && <HomeSavedLinks books={books} saved={savedMemo} onOpen={onOpenMemo} onDismiss={onDismissSavedMemo} offerNotify={memoState.count != null && memoState.count >= 3} />}
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
        {homeKnown && renewal.show && (
          <GrownLine
            mark="renewal"
            stack
            icon={CalendarCheck}
            text={renewal.text.lead}
            actionLabel={renewal.text.action}
            onConsult={() => { renewal.close('open'); onOpenRecord(); }}
            onDismiss={() => renewal.close('dismiss')}
          />
        )}
        {/* 12 月は「今年の読書を、1 枚の画像に」が先（2 行重ねない・閉じた次に出る）。 */}
        {homeKnown && annual.show && !renewal.show && !shareNudge.nudge && (
          <GrownLine
            mark="annual"
            stack
            icon={CalendarDays}
            text={annual.text.lead}
            actionLabel={annual.text.action}
            onConsult={() => { annual.close('open'); onOpenPlan(); }}
            onDismiss={() => annual.close('dismiss')}
          />
        )}
        {homeKnown && reask.show && !tokensBack.show && !showGrown && !renewal.show && !annual.show && (
          <GrownLine
            mark="reask"
            icon={MessageCircle}
            text={reask.text.lead}
            actionLabel={reask.text.action}
            onConsult={() => { reask.close('open'); onConsultDraft(reask.question, 'reask'); }}
            onDismiss={() => reask.close('dismiss')}
          />
        )}
        {/* 🌙 また開いたときの 1 行（ほかの時期の案内が出ている日は出さない＝2 行にしない・押すとそのメモを開く）。 */}
        {momentShown && (
          <GrownLine
            mark={`moment-${moment.kind}`}
            stack
            icon={moment.kind === 'anniv' ? Sprout : moment.kind === 'action' ? CalendarCheck : moment.action === 'resume' ? MessageCircle : History}
            text={<><span data-lead style={{ display: 'block', paddingRight: 'var(--tap-min)' }}>{withPhraseBreaks(moment.lead)}</span>{moment.quote ? <span style={{ display: 'block', marginTop: 'var(--space-1)', fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)' }}>{withPhraseBreaks(moment.quote)}</span> : null}</>}
            actionLabel={moment.actionLabel}
            // 読み上げは本の名前つき（同じ画面の一覧の「『書名』を読み始める」と見分ける・ui-critic）
            actionAria={!momentBook ? (moment.action === 'advisor' ? 'いまの悩みに合う本を AI 選書で 1 冊探す' : moment.action === 'resume' ? '前の相談の続きを話す' : null) : moment.action === 'focus' ? (moment.actionLabel === '手元にあれば読む' ? `『${momentBook.title}』が手元にあれば読む` : `『${momentBook.title}』を${moment.actionLabel === '続きを 15 分' ? '続きから' : ''} 15 分だけ読む`) : moment.action === 'open' ? `『${momentBook.title}』を開く` : moment.action === 'read' ? `『${momentBook.title}』のメモを読み返す` : null}
            onConsult={() => { returnMoment.close('open'); momentGo(); }}
            // はじめて 1 年（以後毎年）は「この 1 年を 1 枚に」＝写真で共有の「この 1 年」（はじめてからいままで・2026-11-27 体験した人の声）
            secondary={moment.kind === 'anniv' && Number(String(moment.key || '').split(':')[1]) >= 365 && onShareNudge && user?.created_at
              ? { label: 'この 1 年を 1 枚に', onClick: () => { track('return_moment', { kind: 'anniv', action: 'share' }); onShareNudge('year', { since: new Date(user.created_at).getTime() }); } }
              // 1 行の 2 つ目（読みたいの本の「本を見る」・期限を過ぎた行動の「やってみた結果を話す」・2026-11-27）
              : moment.secondary?.action === 'open' && momentBook
              ? { label: moment.secondary.label, onClick: () => { returnMoment.close('open'); onOpenBook(momentBook); } }
              : moment.secondary?.action === 'resume' && onResumeConsult
              ? { label: moment.secondary.label, onClick: () => { returnMoment.close('open'); track('return_moment', { kind: moment.kind, action: 'resume' }); onResumeConsult(moment.secondary.question); } }
              : moment.secondary?.action === 'result' && onConsultDraft
              ? { label: moment.secondary.label, onClick: () => { returnMoment.close('open'); onConsultDraft(moment.secondary.question, 'moment_result'); } }
              : null}
            onDismiss={() => returnMoment.close('dismiss')}
          />
        )}
        {/* ✍️ お気に入りの著者の新しい本（2026-11-25・hooks/useFavoriteAuthors.js）。押すと著者のシート・× でその本はもう知らせない。 */}
        {homeKnown && newsAllowed && authorNews?.news && !(books.length > 0 && growthMeterText(memoState.count)) && !tokensBack.show && !showGrown && !renewal.show && !annual.show && !reask.show && !shareNudge.nudge && !momentShown && (
          <GrownLine
            mark="author-news"
            stack
            icon={BookOpen}
            text={authorNewsText(authorNews.news)}
            actionLabel="見る"
            onConsult={authorNews.onOpen}
            onDismiss={authorNews.onDismiss}
          />
        )}
        {/* 月末・12 月の 1 行（本を読み込んで、ホームの中身を出すときに一緒に出す＝あとから差し込んで押し下げない）。 */}
        {homeKnown && !(momentShown && actionFirst) && <ShareNudge nudge={shareNudge.nudge} onOpen={onShareNudge} onDismiss={shareNudge.dismiss} />}
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
          description="本とメモは消えていません。通信状況を確認して、もう一度お試しください。"
          actions={onRetry ? [{ label: 'もう一度', onClick: onRetry, variant: 'primary' }] : []}
        />
      ) : books.length === 0 ? (
        <StartCard onQuickstart={onQuickstart} onAddBook={onAddReadingBook || onAddBook} onAdvisor={onAdvisor} onImport={onImport} onShelfScan={onShelfScan} />
      ) : !homeKnown ? (
        <div role="status" aria-busy="true" aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <HomeBlocksSkeleton />
        </div>
      ) : (
        <>
          {/* 読みたい・積読の本だけの人（読書の習慣がない人に多い）には出さない＝まだ読んだ本が無いのに「読んだ本の一文をメモする」を
              主役にしない。すぐ下の「読みたい本／次に読む本 → 読み始める」が次の一歩（2026-11-26 継続の点検）。 */}
          {!memoState.hasMemos && books.some((b) => (b.status === 'reading' || b.status === 'done') && !b.archivedAt) && <HomeFirstStep bookCount={books.filter((b) => !b.archivedAt).length} onQuickstart={onQuickstart} onImport={onImport} readingBook={focusReadingBook} onWriteMemo={onWriteMemo} />}
          <ReadingNow books={books} onOpenBook={onOpenBook} onWriteMemo={onWriteMemo} onStartReading={onStartReading} onAddBook={onAddBook} onSeeAllReading={onSeeAllReading} onCoverRetry={onCoverRetry} onRead={onRead} />
          {/* 読書計画とすべての本は、1 枚のまとまりの行（区切り線でつなぐ）。 */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {planToday && (
            <>
              <HomePlanRow plan={planToday} onOpen={() => { track('home_plan_row', { kind: planToday.kind }); onOpenReadingPlan(planToday.kind === 'choose' ? 'roadmap' : 'plan'); }} />
              {navDivider}
            </>
          )}
          {/* 今日までの行動・相談の行は 2026-11-26 オーナー「読書計画と全ての本のみにしよう」でやめた（行動は振り返り、相談は下のタブから）。 */}
          <button type="button" onClick={onOpenLibrary} style={navRow}>
            <Library size="1.2em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>すべての本</span>
            <span style={navValue}>{books.filter((b) => !b.archivedAt).length} 冊</span>
            <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </button>
          </div>
          {/* 目標の案内は、いま読んでいる本（主役）の下に（上にあると「メモを書く」を押し下げていた・2026-11-18 ui-critic）。 */}
          {goalNudge.show && (
            <HomeGoalRow
              onOpen={() => { track('home_goal_row', { action: 'open' }); onOpenGoals(); }}
              onClose={() => {
                track('home_goal_row', { action: 'close' });
                goalNudge.close();
                // 閉じたあとにどこから書けるかを言い、5 秒は元に戻せる（2026-11-23 点検）。
                toast.undo({
                  message: '目標は 振り返り › 行動 から書けます。',
                  onUndo: () => { track('home_goal_row', { action: 'undo' }); goalNudge.reopen(); },
                });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
