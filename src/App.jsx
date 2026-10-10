import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from "react";
import { useAuth } from './hooks/useAuth';
import { useBooks } from './hooks/useBooks';
import { sanitizeForPrompt, invalidateKnowledgeCache, generateBookBrief } from './lib/ai';
import { markActivation } from './lib/activation';
import { OPEN_MEMO_EVENT } from './lib/openMemo';
import { advisorDraftFor, classifyBook, fieldsOf, isBookField, splitLegacyTags, withFields, BOOK_FIELDS } from './lib/bookFields';
import { markFieldStage } from './lib/bookFieldsAuto';
import { useBookFieldsAuto, infoFeatures } from './hooks/useBookFieldsAuto';
import { BookFieldLinks } from './components/BookFields';
import { useAppDataCache } from './state/AppDataCache';
import { streamClaude } from './lib/streamClaude';
import { PROMPTS } from './lib/prompts';
// ⚡ 最初の画面に要らない重い部品は、使うときに読む（Suspense 付きの薄い包み・components/lazyParts.jsx）。
import { AuthScreen, AuthCallback, BookMemoList, BookSearchModal, BookMemoEditor, ActionList, MarkdownSections, AuthorThankYou, OverlayFallback } from './components/lazyParts';
import { BookCoverCard, SwipeableBookCard, MiniCover, StatusLabel } from './components/BookCards';
import { STATUSES, getSt } from './lib/status';
import { isStrictMatch } from './lib/bookMatch';
const BookAdvisor = lazy(() => import('./components/BookAdvisor'));
const QuickMemoSheet = lazy(() => import('./components/QuickMemoSheet'));
// すべての本を開いた最初の描画で出す冊数（残りは手が空いたときに足す）。
const LIBRARY_FIRST = 12;
const PastBooksQuickstart = lazy(() => import('./components/PastBooksQuickstart'));
const ImportSheet = lazy(() => import('./components/ImportSheet'));
const WhatsNewSheet = lazy(() => import('./components/WhatsNewSheet'));
import MemoFab, { FAB_CLEARANCE } from './components/MemoFab';
// 読了にした直後の本の詳細の下の余白（右下の「メモを書く」＋「読了にしました。」の知らせ 64）。
// 押し込まれた画面の上の行の「‹ 戻り先」の文字。文字サイズの設定に合わせて大きくなるが、タブの画面の上の行と同じ
// 上限（--text-bar-max）で止めて 1 行に収める（「‹ すべての／本」と 2 行に割れていた・2026-10-04）。
const BACK_LABEL_SIZE = 'min(var(--text-body), var(--text-bar-max))';
const JUST_DONE_CLEARANCE = `calc(${FAB_CLEARANCE} + var(--space-16))`;
import { frequentMemoTags } from './lib/memoTags';
const HomeQuickMemo = lazy(() => import('./components/HomeQuickMemo'));
// ⏱ 集中モード（読書の時間・2026-10-09）。使うときに読む。
const FocusStartSheet = lazy(() => import('./components/FocusStartSheet'));
const FocusMode = lazy(() => import('./components/FocusMode'));
import { startFocus, pauseFocus, loadFocusState, saveFocusState } from './lib/readingTime';
import { BookReadingTime } from './components/ReadingTimeCard';
import { readingSessions } from './hooks/useReadingSessions';
import Onboarding, { isOnboardingCompleted, clearOnboardingCompletion } from './components/Onboarding';
import {
  Search as IcSearch, Plus as IcPlus, Library as IcLibrary, Sparkles as IcSparkles,
  SearchX as IcSearchX, Brain as IcBrain,
  LayoutGrid as IcGrid, List as IcList,
  Lightbulb as IcBulb,
  BookOpen as IcBook, Map as IcMap, RefreshCw as IcRefresh, Bot as IcBot,
  CheckCircle2 as IcCheck,
  SlidersHorizontal as IcFilter, ArrowUpDown as IcSort, Star as IcStar, Folder as IcFolder, X as IcX,
} from 'lucide-react';


// 本棚ツールバー（シート化）用の共通スタイル。
const SHELF_CHIP_ORDER = ['reading', 'done', 'before', 'want'];
const SORT_LABELS = { updated: '更新順', created: '登録順', title: '書名順', rating: '評価順' };
// 状態・フォルダのチップ（DESIGN §5: 見た目は --fill 面・13px・高さ 32、押せる範囲は 44）。
function ShelfChip({ active, onClick, children, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', height: 32, padding: '0 var(--space-3)',
          borderRadius: 'var(--radius)', fontSize: 'var(--text-meta)', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
          background: active ? 'var(--accent-soft)' : 'var(--fill)',
          color: active ? 'var(--accent)' : 'var(--text)',
        }}
      >
        {children}
      </span>
    </button>
  );
}
// すべての本から開くシート（絞り込み・並び替え・状態・フォルダ・本を選ぶ）の共通スタイル。
const sheetLabel = { fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-1)' };
const sheetChips = { display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', marginBottom: 'var(--space-4)' };
const sheetSubtitle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: '0 0 var(--space-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const sheetOption = (active) => ({
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 48,
  padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)',
  border: '1px solid var(--separator)', background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)', fontSize: 'var(--text-body)', fontWeight: active ? 600 : 400,
  fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
});
const bookshelfIconBtn = {
  width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 999, color: 'var(--text-2)', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};
const HelpModal = lazy(() => import('./components/HelpModal'));
const Review = lazy(() => import('./components/Review'));
const MyBookBrain = lazy(() => import('./components/MyBookBrain'));
import { useAdvisorSessions } from './hooks/useAdvisorSessions';
const ActionEditModal = lazy(() => import('./components/ActionEditModal'));
// 📊 記録サブタブ（読了/メモ/行動の累計・月別推移・成果/定着のつながり・タグ分布）。
// 開いた時だけロードする。
const ReadingRecord = lazy(() => import('./components/ReadingRecord'));
import BottomSheet from './components/BottomSheet';
const AddBookModal = lazy(() => import('./components/AddBookModal'));
import { useBookCover } from './hooks/useBookCover';
import { searchBooksFlat as searchBooksAPIFlat } from './lib/bookSearch';
import { tryCoverForIsbn, verifyBookExists } from './lib/bookCover';
import { verifyPlanRelatedBooks, hasMalformedRelatedBooks } from './lib/planRelatedBooks';
import { dropUnknownChapters, focusLinesOf } from './lib/planChapters';
import { hasVisibleSections } from './lib/markdownSections';
import { backfillCovers } from './lib/backfillCovers';
import { enqueueCoverRetry, resolveCoverForBook, canReplaceCover, clearCoverNotFound } from './lib/coverAutoRetry';
import { MODEL_SMART } from './lib/models';
import { findDuplicateBook, findImportDuplicate, STATUS_LABEL, isUniqueViolation } from './lib/checkDuplicate';
import { saveStrategyHistory, popStrategyHistory, hasStrategyHistory, clearStrategyHistory } from './lib/strategyHistory';
const CoverFixModal = lazy(() => import('./components/CoverFixModal'));
// 📤 一文をシェア（この本の一文を 1 枚の画像に・SPEC §2-1）
const ShareSheet = lazy(() => import('./components/ShareSheet'));
import { hasFinishedThisMonth, yearChoiceAllowed } from './lib/shareOverlay';
import { appNow } from './lib/appNow';
import { clearShareMemoCaches } from './lib/shareMemoCache';
const Landing = lazy(() => import('./pages/Landing'));
const TermsPage = lazy(() => import('./legal/TermsPage'));
const PrivacyPage = lazy(() => import('./legal/PrivacyPage'));
const SctPage = lazy(() => import('./legal/SctPage'));
import { supabase as supabaseClient, isDemo, demoScenario } from './lib/supabase';
import { track, trackAppOpen, EVENTS } from './lib/analytics';
const AccountSettings = lazy(() => import('./components/AccountSettings'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
import SplashScreen from './components/SplashScreen';
import { markAppReady } from './lib/appReady';
import Spinner from './components/Spinner';
import { TabPanelSkeleton } from './components/lazyParts';
import EmptyState from './components/EmptyState';
import ErrorMessage from './components/ErrorMessage';
import { useFocusTrap } from './hooks/useFocusTrap';
import HomeScreen, { HomeBlocksSkeleton } from './components/HomeScreen';
import { initServiceWorker } from './lib/swUpdate';
import { ensurePushSubscription } from './lib/push';
import { isNative } from './lib/iap';
import { storeLinkFor, isAppStoreLive } from './lib/appStore';
import { initNativePushNav } from './lib/nativePush';
import UpdateBanner from './components/UpdateBanner';
import { useWhatsNew } from './hooks/useWhatsNew';
import OfflineNotice from './components/OfflineNotice';
import { SkeletonBlock, BookListSkeleton, BookGridSkeleton } from './components/Skeleton';
import SwipeableCard from './components/SwipeableCard';
import ContextMenu from './components/ContextMenu';
import PullToRefresh from './components/PullToRefresh';
import { useHaptic } from './hooks/useHaptic';
import { useMemoLinkFinder } from './hooks/useMemoLinkFinder';
import { useLongPress } from './hooks/useLongPress';
import { useEdgeSwipeBack, isBackBlocked, useBackBlocked } from './hooks/useEdgeSwipeBack';
import { useHistoryBack, useBackLayer, useBackLayerCount, topBackLayer } from './hooks/useHistoryBack';
import { useKeyboardOpen } from './hooks/useKeyboardOpen';
import { useSubscription } from './hooks/useSubscription';
const Paywall = lazy(() => import('./components/Paywall'));
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmDialog';
import { toMessage, toSaveMessage, fieldRequiredMessage, isSchemaError } from './lib/errors';
import { LIMITS, clamp } from './lib/limits';
import { ensureHttps } from './lib/url';
import { PAYWALL_EVENT, AI_USED_EVENT } from './lib/freeTrial';
import { AiConsentGate } from './components/AiConsentSheet';
import { ensureAiConsent } from './lib/aiConsent';
import { periodKeyFor, fetchUsedMjpy, fetchLotBalance, remainingTokens, allowanceFor as allowanceForPlan, nextMonthAllowanceFor, isFreeFirstMonth, runCostLine, TOKEN_COSTS } from './lib/tokens';
import { FREE_OCR_PER_MONTH, freeOcrPeriodKey, fetchFreeOcrUsed, freeOcrRemaining } from './lib/freeOcr';
// 🪙➕ トークンを追加（買い足し）のシート
const TokenSheet = lazy(() => import('./components/TokenSheet'));
import { PaywallContext, usePaywall } from './state/PaywallContext';
import { todayLocal, tomorrowLocal, fmtDateJa, isScheduledLater } from './lib/dates';
import { completedActionMessage } from './lib/actionMessages';
// 🧩 #9 App.jsx 分割: 本フォーム共通プリミティブと Phase エディタは別ファイルへ抽出。
import { Stars, inp, btnS } from './components/formPrimitives';
import { btnGhost, btnGhostOff, btnText, btnPrimary, btnPrimaryOff, btnLink, btnRow, groupTitle } from './styles/ui';
import { WantPhase, BeforePhase, ReadingPhase, DonePhase, EditSaveBar } from './components/lazyParts';
import { getAmazonLink } from './lib/amazonLink';
import BookStoreLinks from './components/BookStoreLinks';
import { getRakutenLink } from './lib/rakutenLink';
import { loadNavState, saveNavState } from './lib/navState';
import { consultCanLeave } from './lib/consultBack';
import { actionGist, firstConsultQuestion } from './lib/consultHelpers';
import { takeOnboardPathDone } from './lib/firstDay';
import { withPhraseBreaks } from './components/TightBubble';
import {
  BookOpen,
  Home,
  PencilLine,
  Circle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  MoreHorizontal,
  ImagePlus,
  ImageOff,
  ShoppingBag,
  Upload,
  Share,
  Camera,
  Trash2,
  RotateCcw,
  Brain,
  HelpCircle,
  Settings as SettingsIcon,
  Target,
  MessageCircle,
  Smartphone,
  Shapes as IcShapes,
  ScrollText,
  Timer,
} from 'lucide-react';
import { useBookMemos } from './hooks/useBookMemos';
import { useBookInfo } from './hooks/useBookInfo';
import BookAbout from './components/BookAbout';
import BookBrief from './components/BookBrief';
import { hasBriefMaterial, storedBriefOf, briefForPrompt, appendHypothesis, isUsableBrief, parseBrief, briefLabels, BRIEF_NO_MATERIAL_TEXT } from './lib/bookBrief';
import { loadBookInfo, bookInfoForPrompt, hasBookInfo, peekBookInfo } from './lib/bookInfo';
// 🔎 すべての本の検索（書名・著者・タグ＋メモの言葉・2026-09-30）
import { useLibrarySearch } from './hooks/useLibrarySearch';
import { LibrarySearchResults, ConsultSearchLink, LibrarySearchHitSkeleton } from './components/LibrarySearchHit';
import { consultQuestionFor, highlightSegments } from './lib/librarySearch';
// 重い画面の切り替え（すべての本を開く）は後回しにできる更新にして、押した形を先に描く（lib/pressFeedback.js と組）。
import { startTransition } from 'react';



/* ========== AI ========== */
// AI prompts now live in src/lib/prompts.js — single source of truth for
// every generative flow. Do not re-introduce inline prompts here.

// Amazon Associate links live in src/lib/amazonLink.js — the tag and
// URL-priority logic (ASIN > ISBN > title) belong there, not inline.

// ADVISOR_SYSTEM lives in src/lib/prompts.js as PROMPTS.bookAdvisor.system


/* ========== ISBN / Search ==========
 * Lives in src/lib/bookSearch.js — NDL → openBD → Google Books pipeline
 * with localStorage cache. Don't add a fetch call here; extend the lib.
 */


/* ========== Primitives ========== */

function Modal({ open, onClose, children, ariaLabel }) {
  const trapRef = useFocusTrap(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.isComposing) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // 本の編集画面から開く検索。iPhone では下からのシート（本の追加と同じ・キーボードで結果が隠れにくい）。
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--backdrop)",
        backdropFilter: "var(--backdrop-blur)",
        WebkitBackdropFilter: "var(--backdrop-blur)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius) var(--radius) 0 0",
          padding: "var(--space-2) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom, 0px))",
          width: "min(520px, 100%)",
          maxHeight: "92dvh",
          overflowY: "auto",
          boxShadow: "var(--shadow-overlay)",
        }}
      >
        <div className="lvg-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}



// 振り返り › メモを開いた直後（画面の部品を読み込む間）の形。Review の読み込み中と同じ形・同じ余白なので、
// 読み込みが終わって Review 自身の形に替わっても跳ねない（くるくるだと一瞬なにも無く見えた・2026-09-29）。
function ReviewNoteFallback() {
  return (
    <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div role="status" aria-busy="true" aria-label="メモを読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SkeletonBlock height={20} width="40%" radius="var(--radius)" />
        <SkeletonBlock height={180} radius="var(--radius)" />
        <SkeletonBlock height={120} radius="var(--radius)" />
      </div>
    </div>
  );
}

// 起動直後（ログイン確認・課金の確認待ち）の読み込み表示。ホームの形（題「ホーム」・見出し・
// いま読んでいる本 2 冊・本を追加の行・すべての本の行）のスケルトン（DESIGN §5「読み込みは Skeleton」）。
// グループの間は 24、いま読んでいる本（見出し＋2 冊）の中は一覧と同じ 12（DESIGN §1）。
function HomeLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="読み込み中"
      style={{ flex: 1, padding: 'var(--space-2) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
    >
      {/* 題「ホーム」の行（28/700・行間 1.3＝高さ 36）。本物と同じ高さで、読み込み後に中身が下へずれない。 */}
      <SkeletonBlock width={96} height={36} radius="var(--radius)" />
      {/* 中身はホームの読み込み中と同じもの（HomeScreen.jsx の HomeBlocksSkeleton・2026-09-29 に 1 つにまとめた）。 */}
      <HomeBlocksSkeleton />
    </div>
  );
}

// 長文（目的・課題・仮説 等）は 4 行で畳み「すべて表示」で開く。
// 旧: maxHeight 400 + 内部スクロールで、詳細のファーストビューを長文が
// 独占し、ページ内スクロールと入れ子スクロールが競合していた。
// 書名を文節で折り返す（BudouX）。「1兆ドル／コーチ」のような語の途中の改行を避ける。
// word-break: keep-all と組み合わせ、文節の切れ目（<wbr>）でだけ折り返す。
// 英語などで 1 文節が行より長いときは overflow-wrap: anywhere で折る。
function titleWithPhraseBreaks(title) {
  // 長い 1 文節の中も文字の種類の切れ目（「アウトプット／大全」「エリック・／シュミット」）で折り返してよい（2026-10-04）。
  return withPhraseBreaks(title, { scriptBreaks: true });
}

// カードの中の 1 まとまり（小さな見出し＋本文・長い文は 4 行で切って「すべて表示」）。
function CardBody({ label, text }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (text || '').length > 130;
  return (
    <div>
      <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-2)' }}>{label}</p>
      <p
        style={{
          fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0,
          // 文節の切れ目でだけ折り返す（「持／てない」「身／につく」と語の途中で割れていた・2026-10-04）。
          wordBreak: 'keep-all', overflowWrap: 'anywhere',
          ...(isLong && !expanded
            ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
            : {}),
        }}
      >
        {withPhraseBreaks(text)}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          style={{ background: 'none', border: 'none', padding: 0, minHeight: 'var(--tap-min)', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? '閉じる' : 'すべて表示'}
        </button>
      )}
    </div>
  );
}

// DESIGN §5 のカード（--surface＋枠 --separator＋角丸 12＋内側 16・影なし）。
const cardBoxStyle = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', marginTop: 'var(--space-2)' };
function Card({ label, text, style }) {
  return (
    <div style={{ ...cardBoxStyle, ...style }}>
      <CardBody label={label} text={text} />
    </div>
  );
}
// 積読の得たいこと・課題・仮説を 1 枚のカードに（小さな見出しのまとまりを間 16 で縦に・2026-10-08 ui-critic 第 3 回）。
//   カードを 1 枚ずつ並べると枠と余白のぶん「読書を開始する」が 390×844 の最初の画面から押し出されていた。
function PlanCard({ items, style }) {
  return (
    <div data-plan-card="" style={{ ...cardBoxStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', ...style }}>
      {items.map((p) => <CardBody key={p.label} label={p.label} text={p.text} />)}
    </div>
  );
}




/* ========== Data ========== */
const emptyBook = () => ({
  id: "", title: "", author: "", cover: "", rating: 0, status: "want",
  startDate: "", doneDate: "", tags: [], collections: [], currentPage: 0, totalPages: 0,
  investPurpose: "", aiAnalysis: "", aiStrategy: "",
  leverageMemo: "", aiSummary: "",
  actions: [], roiSummary: "",
  // Tracks how the book entered the bookshelf so AI features can lean into
  // search-derived metadata or stay basic for manually-typed entries.
  // Persisted as books.added_via (see supabase_added_via.sql).
  addedVia: "search",
  // AI 選書アドバイザーで本を追加した時のユーザーの元クエリ。空でなければ
  // 読書計画シートの投資目的にプレフィルし、引き継ぎバナーを表示する。
  // Persisted as books.source_query (see supabase_books_source_query.sql).
  sourceQuery: "",
  // AI 選書の会話を構造化要約してプレフィルする 3 フィールド
  // (supabase_books_setup_fields.sql)。bookReason は読み取り専用。
  currentChallenge: "",
  hypothesis: "",
  bookReason: "",
  // Persisted via supabase_books_isbn.sql — used by the Amazon Associate
  // link helper to route to the product page when available.
  isbn: "",
  asin: "",
  // 表紙取得時に「実際にどの ISBN で画像が取れたか」を記録する任意フィールド。
  // multi-ISBN リゾルバ (lib/bookCover.resolveCoverFromCandidates) が決定する。
  coverIsbn: "",
});



/* ========== Bottom Nav ========== */
function BottomNav({ tab, setTab, hidden = false }) {
  // 3 タブ。flex-shrink: 0 の通常の flex child として配置し、
  // hidden=true (= キーボード開) のときは .is-hidden クラスで畳む。
  // body.keyboard-open とのダブルセレクタ + !important で確実に勝たせる。
  const tabs = [
    { key: "books", Icon: Home, label: "ホーム" },
    { key: "review", Icon: RotateCcw, label: "振り返り" },
    { key: "ai", Icon: MessageCircle, label: "相談" },
  ];
  // 実際の高さ（下の安全域を除く）を --tabbar-live-h に入れる。文字を大きくするとタブが --tabbar-h（66）より高くなり、
  // その上に浮かべる新しい版の知らせ・知らせ（Toast）・「メモを書く」がタブに重なっていた（2026-10-05 ui-critic）。
  // 畳んでいる間（キーボード表示中）は 0 なので前の値を残す。外れたら消す（--tabbar-h に戻る）。MemoFab の --fab-live-h と同じやり方。
  const navRef = useRef(null);
  useEffect(() => {
    const el = navRef.current;
    const rootStyle = typeof document !== 'undefined' ? document.documentElement.style : null;
    if (!el || !rootStyle) return undefined;
    const put = () => {
      const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const h = Math.ceil(el.getBoundingClientRect().height - pad);
      if (h > 0) rootStyle.setProperty('--tabbar-live-h', `${h}px`);
    };
    put();
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(put); ro.observe(el); }
    return () => { if (ro) ro.disconnect(); rootStyle.removeProperty('--tabbar-live-h'); };
  }, []);
  return (
    <nav
      ref={navRef}
      className={`bottom-nav${hidden ? ' is-hidden' : ''}`}
      aria-hidden={hidden ? 'true' : undefined}
      style={{
        flexShrink: 0,
        // iOS タブバー風: 半透明＋うっすらブラー＋極細ヘアライン。
        // iOS タブバー風: 背景と同じ面＋極細の区切り線（明暗ともトークンで切り替わる）。
        background: "var(--bg)",
        borderTop: "0.5px solid var(--separator)",
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.key;
        const Icon = t.Icon;
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            // hidden(キーボード表示中)は aria-hidden の nav 配下＝フォーカス可能要素を
            // 残すと SR/キーボードが「見えないタブ」に到達できてしまう。tabIndex=-1 +
            // disabled でフォーカス対象から確実に外す。
            tabIndex={hidden ? -1 : undefined}
            disabled={hidden || undefined}
            style={{
              flex: 1,
              padding: "var(--space-3) 0 var(--space-2)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-1)",
              position: "relative",
              minHeight: 56,
              // 非アクティブも secondary 色にして「ある」と視認できるように。
              // 非選択は --text-2（半透明にするとコントラストが落ちるので opacity は使わない）。
              color: active ? "var(--accent)" : "var(--text-2)",
              transition: "color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-spring)",
            }}
          >
            <Icon size={24} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
            {/* 文字サイズの設定を大きくしても、上の行と同じ上限（--text-bar-max）で止める（下のタブが太って本文を隠さない・2026-10-01 ui-critic）。 */}
            <span style={{ fontSize: 'min(var(--text-caption), var(--text-bar-max))', letterSpacing: "0.02em", fontWeight: active ? 600 : 400 }}>{t.label}</span>
            {/* iOS タブバーはアクセントバーを使わず、アイコン/ラベルの色で示す。 */}
          </button>
        );
      })}
    </nav>
  );
}

/* ========== Shell ========== */
function Shell({ children }) {
  return (
    <div
      style={{
        // #root が 100dvh flex column のため Shell は flex: 1 で
        // 残りを取る。min-height: 0 を明示しないと flex の入れ子で
        // overflow が崩れる (重要)。
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
        fontFamily: "var(--font-app)",
        color: "var(--color-label)",
        overflow: "hidden",
      }}
    >
      {/* フォントは OS 標準に全面移行済み（index.html 参照）。かつてここにあった
          Google Fonts の @import はレンダーブロッキングで初回表示を遅らせるため撤去。 */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: .2 } 50% { opacity: 1 } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--color-quaternary); border-radius: 2px; }
      `}</style>
      {children}
    </div>
  );
}

// メモを書くシートの保存のあとの知らせ: シートは onCreate が終わってから閉じ始める（data-closing）ので、
// 次のフレームまで待ってから出す（知らせが開いたシートを避けて画面の下端に出て、すぐタブの上へ跳ねないように・2026-09-30）。
const afterSheetCloses = (fn) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else fn();
};

// 本の詳細・編集の「上の行＋中身」の箱（左端スワイプで一緒に動かす・2026-09-30）。
const swipeScreenStyle = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' };

/* ========== 押し込まれた画面の上部の 1 行 ========== */
// 「‹ 戻り先」のシェブロンの見た目の左端を、画面の余白 16 にそろえる左の負の余白（2026-10-01 ui-critic: 約 14.7 だった）。
// lucide の ChevronLeft（20）は線の左端が箱の左から 20×8/24 ≈ 6.67 のところにあるので、行の内側 16 から 6.67 戻す＝
// var(--space-2) − var(--space-1)/3。ボタンの押せる範囲（44）は変えない。
const BACK_CHEVRON_PULL = 'calc(var(--space-1) / 3 - var(--space-2))';
// 本の詳細・編集の「‹ 戻り先」の行。スクロールの箱の外（上）に置いて、下へ送っても行が残るようにする
// （iOS のナビゲーションバーと同じ・相談の topRow と同じ形）。一番上では線を出さず、中身を下へ送ったら
// 下に --separator の線（線の太さぶんはいつも取って高さを変えない・DESIGN §5「画面上部の 1 行」・2026-09-29）。
function PushedTopBar({ scrollRef, children }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    const onScroll = () => {
      const v = el.scrollTop > 0;
      setScrolled((p) => (p === v ? p : v));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);
  return (
    <div
      className="detail-enter"
      style={{
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-2)',
        // ノッチはこの行が吸収する（すべての本の「‹ ホーム」の行と同じ）。
        padding: 'max(env(safe-area-inset-top, 0px), var(--space-2)) var(--space-4) 0',
        background: 'var(--bg)',
        borderBottom: `1px solid ${scrolled ? 'var(--separator)' : 'transparent'}`,
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
    >
      {children}
    </div>
  );
}

/* ========== MAIN APP ========== */
// 設定から開いた「トークンを追加」を閉じたら、設定に戻る（PaywallGate → AuthedApp・2026-09-29）。
const OPEN_SETTINGS_EVENT = 'orime:open-settings';

function AuthedApp() {
  const { signOut, user } = useAuth();
  const appCache = useAppDataCache();
  // 📷 写真で共有の「今月」「今年」のメモの控えは、メモが動いたら捨てる（次に開いたときに読み直す・2026-10-08）。
  useEffect(() => appCache?.subscribeAnyMemo?.(clearShareMemoCaches), [appCache]);
  // 仮想キーボード表示中は BottomNav を消し、入力欄に重ならないようにする。
  // viewport meta の interactive-widget=resizes-content と併用すると iOS
  // で「BottomNav が押し上げられる」現象が完全になくなる。
  const keyboardOpen = useKeyboardOpen();
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('keyboard-open', keyboardOpen);
    return () => document.body.classList.remove('keyboard-open');
  }, [keyboardOpen]);
  // 📊 起動のたびに 1 回＋前面に戻ったとき（その端末の日付で 1 日に多くても 1 回）計測（fail-silent・2026-10-10）。
  //   iOS のアプリを裏から戻したときも WKWebView の visibilitychange で拾う。
  useEffect(() => {
    trackAppOpen('launch');
    if (typeof document === 'undefined') return undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') trackAppOpen('foreground'); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  // 🛰️ 管理者判定（is_app_admin RPC）。非管理者・未適用 DB では静かに false。
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseClient.rpc('is_app_admin');
        if (alive && !error) setIsAdmin(data === true);
      } catch { /* 未適用 DB 等は false のまま */ }
    })();
    return () => { alive = false; };
  }, [user]);
  const {
    books: rawBooks,
    loading: booksLoading,
    loadError: booksLoadError,
    saveBook,
    deleteBook,
    mutateBookLocal,
    saveBookBrief,
    saveBookTaxonomy,
    captureBookSnapshot,
    restoreBookFromSnapshot,
    refreshBooks,
  } = useBooks();
  const haptic = useHaptic();
  const toast = useToast();
  const confirm = useConfirm();
  // AI 選書の会話履歴。advisor_sessions テーブル未マイグレーションなら
  // available=false で UI 側が履歴ボタンを隠す。
  const advisorSessions = useAdvisorSessions();

  // アプリを離れて戻ると（特に iOS PWA の再読込で）毎回 books に戻るのを防ぐ。
  // 直近のタブを localStorage に保存し、起動時に復元する。'books'/'review'/'ai' のみ許可。
  // 🔁 画面復元スナップショット（lib/navState.js）。iOS はアプリを少し離れた
  // だけでプロセスを破棄→リロードすることがあるため、60 分以内の再起動なら
  // 直前の画面（タブ/サブタブ/開いていた本）に静かに戻す。初回マウントで
  // 一度だけ読む（以後の保存で上書きされるスナップショットを固定するため）。
  const [resumeNav] = useState(() => loadNavState());
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem('activeTab');
      return ['books', 'review', 'ai'].includes(saved) ? saved : 'books';
    } catch { return 'books'; }
  });
  useEffect(() => {
    try { localStorage.setItem('activeTab', tab); } catch { /* ignore */ }
  }, [tab]);
  // 本棚の表示モード。
  // - 'auto' (デフォルト): 3 冊以下→list / 4 冊以上→grid（数が少ない時に
  //   表紙だけポツポツ並ぶのを避ける）
  // - 'list' / 'grid': ユーザーが明示的に選んだ場合のみ尊重
  // localStorage に保存しているのは override の選択のみ。
  const [bookshelfViewMode, setBookshelfViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('bookshelfView');
      if (saved === 'list' || saved === 'grid' || saved === 'auto') return saved;
      return 'auto';
    } catch { return 'auto'; }
  });
  useEffect(() => {
    try { localStorage.setItem('bookshelfView', bookshelfViewMode); } catch { /* ignore */ }
  }, [bookshelfViewMode]);

  // 実際に使う表示モード。auto なら冊数で自動判定。冊数は filtered ではなく
  // rawBooks 全体で見る（フィルタ後の見え方で勝手に切替わると混乱する）。
  const effectiveBookshelfView = bookshelfViewMode === 'auto'
    ? (rawBooks.length <= 3 ? 'list' : 'grid')
    : bookshelfViewMode;
  // 読み込み中（rawBooks がまだ空）は auto だと必ず list になり、読み終わると grid に
  // 切り替わって形が跳ねる。前回実際に出した形を覚えておき、読み込み中の骨組みに使う。
  const [lastBookshelfView] = useState(() => {
    try {
      const v = localStorage.getItem('bookshelfViewLast');
      // まだ一度も出していないときは、auto が本のある人に実際に出す形（4 冊以上＝表紙）に合わせる。
      return v === 'grid' || v === 'list' ? v : 'grid';
    } catch { return 'grid'; }
  });
  useEffect(() => {
    if (booksLoading || rawBooks.length === 0) return;
    try { localStorage.setItem('bookshelfViewLast', effectiveBookshelfView); } catch { /* ignore */ }
  }, [booksLoading, rawBooks.length, effectiveBookshelfView]);
  const skeletonBookshelfView = bookshelfViewMode === 'auto' ? lastBookshelfView : bookshelfViewMode;
  // 親タブ「振り返り」「相談」内のサブタブ。
  // 入口は常に固定（永続化しない）: 振り返り＝💭ノート / 相談＝🧠マイ読書脳。
  // 相談タブの入口をマイ読書脳にするのは、一番の価値「読むほど、自分だけの相談相手が
  // 育つ」（CLAUDE.md）の本体だから（2026-09-26。旧: 🔍AI選書が入口）。
  // 直前に見ていたサブタブに毎回飛ぶと「タブを押したのに違うものが出る」分かり
  // にくさになるため、毎回の起点を一定にする。振り返り＝行動をやり切る場所（SPEC §4・
  // 2026-09-26）なので、起点は常に「行動」（起動時の復元でも、タブの切替でも）。
  // 個別画面への明示遷移（思い出しの通知→メモ 等）は setReviewSubTab で上書きする。
  // 相談タブ（aiSubTab）は 60 分以内の再起動なら直前のサブタブへ戻す（下）。
  const [reviewSubTab, setReviewSubTab] = useState('action');
  // 🔁 同じ起動の間は、振り返りのサブタブを覚えておく（2026-10-10）。ほかのタブから振り返りに戻ったら、前に開いていた
  //   行動／メモ／記録へ（メモで思い出して相談 → 戻ってメモの続き、の行き来をしやすく）。アプリを開いたときは、いつも行動から
  //   （SPEC §4・端末には覚えない）。
  const lastReviewSubRef = useRef('action');
  useEffect(() => { lastReviewSubRef.current = reviewSubTab; }, [reviewSubTab]);
  const [aiSubTab, setAiSubTab] = useState(() => (
    // テーマまとめ（'report'）は 2026-09-30 に廃止。前に開いていた人は相談から（下の一覧に無いので 'brain'）。
    ['advisor', 'brain'].includes(resumeNav?.aiSubTab) ? resumeNav.aiSubTab : 'brain'
  ));
  // 相談の中で押し込まれた画面（過去の相談・学びを書く・根拠にできる情報）を開いている間は、
  // サブタブの行を隠す（押し込まれた画面は「‹ 相談」の 1 行だけ・切り替えを 2 段にしない）。
  // MyBookBrain が onPushedViewChange で知らせる。相談タブ・相談サブタブを離れたら戻す。
  const [consultPushed, setConsultPushed] = useState(false);
  // AI 選書の過去の AI 選書（1）・その中身（2）も同じく押し込まれた画面（BookAdvisor の onPushedViewChange・2026-10-04）。
  const [advisorPushed, setAdvisorPushed] = useState(0);
  // 📊 記録の「実行した行動」から行動を開いたとき、完了した行動を開いて見せる（押した時刻で毎回区別）。
  const [actionShowDoneNonce, setActionShowDoneNonce] = useState(null);
  // 相談の「行動に追加しました 見る」から来たときに光らせる行動（{ bookId, text, nonce }）。
  const [actionFocus, setActionFocus] = useState(null);
  // 🏠→🧠 本棚ホームの「相談する」から渡す質問。MyBookBrain が履歴読込後に 1 回送る。
  const [askPreset, setAskPreset] = useState(null); // { question, nonce } | null
  // 相談タブのサブタブ（相談｜AI 選書）の行の右端。相談の 🕒・…／AI 選書の履歴・新規はここへ portal で出す（2026-10-01 ui-critic）。
  const [aiBarSlot, setAiBarSlot] = useState(null);
  // 🔎 トークンを使い切った相談から「メモを検索して探す」: 振り返り › メモの検索欄に入れる言葉（2026-09-29）。
  const [memoSearchPreset, setMemoSearchPreset] = useState(null); // { query, tag?, nonce } | null
  // 🏷 記録の「分野」の「この分野の本を探す」→ AI 選書の最初の悩みに入れる言葉（送らない・2026-10-08）。
  const [advisorDraft, setAdvisorDraft] = useState(null); // { text, nonce } | null
  // 📖→🧠 本詳細の「この本に相談する」: 相談相手をその本に絞ってマイ読書脳を開く。
  const [scopePreset, setScopePreset] = useState(null); // { bookIds, nonce } | null
  // 🏠 ホームタブ（tab キー 'books'）の中の画面: 'home'＝ホーム / 'library'＝すべての本（SPEC §1）。
  // お試しモードだけ ?shelf=library で「すべての本」から開ける（読み込み中・失敗の表示の確認用）。
  const [shelfMode, setShelfMode] = useState(() => (isDemo && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('shelf') === 'library' ? 'library' : 'home'));
  // 「すべての本」をどこから開いたか。'record'＝振り返りの記録（「‹ 記録」で記録へ戻す）/ null＝ホーム。
  const [libraryFrom, setLibraryFrom] = useState(null);
  // 'book'＝本の詳細の分野から（「‹ この本」でその本へ戻す・2026-10-11）。戻る先の本と、開く前のすべての本の様子。
  const libraryFromBookRef = useRef(null); // { id, shelfMode, libraryFrom, tagFilter }
  // ⚡ すべての本を開いた最初の 1 枚は、上の LIBRARY_FIRST 冊だけ描く。残りは手が空いたときに足す
  // （冊数が多いと開くまでに間が空いていた・2026-09-29）。ホームに戻ったらまた最初から。
  const [libraryRenderAll, setLibraryRenderAll] = useState(false);
  useEffect(() => {
    if (!(tab === 'books' && shelfMode === 'library')) { setLibraryRenderAll(false); return undefined; }
    if (libraryRenderAll || typeof window === 'undefined') return undefined;
    const ric = window.requestIdleCallback;
    const id = ric ? ric(() => setLibraryRenderAll(true), { timeout: 400 }) : window.setTimeout(() => setLibraryRenderAll(true), 60);
    return () => { if (ric) window.cancelIdleCallback?.(id); else window.clearTimeout(id); };
  }, [tab, shelfMode, libraryRenderAll]);
  // ⚡ ヘッダーの「？」「⚙️」で開く画面は、最初の画面を描き終えて手が空いたときに読み込んでおく
  // （押してから読み込むと、初回だけシートが出るまで間が空いていた・2026-09-29）。1 回だけ。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const warm = () => {
      import('./components/HelpModal').catch(() => {});
      import('./components/AccountSettings').catch(() => {});
    };
    const ric = window.requestIdleCallback;
    const id = ric ? ric(warm, { timeout: 3000 }) : window.setTimeout(warm, 1500);
    return () => { if (ric) window.cancelIdleCallback?.(id); else window.clearTimeout(id); };
  }, []);
  // 🏠✍️ ホームの「メモ」で開くクイックメモの対象本（詳細画面に移らずホームの上に重ねる）。
  const [homeMemoBook, setHomeMemoBook] = useState(null);
  // 🔗 ホームのメモを書くで保存したメモ（{ id, bookId, text, nonce }）。似たメモがほかの本にあれば、ホームに 1 行（2026-10-10）。
  //   ホームを離れたら消す（戻ってきたときに古い 1 行を出さない）。
  const [homeSavedMemo, setHomeSavedMemo] = useState(null);
  // 📚 初日クイックスタート（これまで読んだ本で相談相手をつくる）の表示。
  const [showQuickstart, setShowQuickstart] = useState(false);
  // 取り込みの完了画面から開くとき: 一言を足す本（本棚に入っている本・一言の段から始める）。ふだんは null。
  const [quickstartSeed, setQuickstartSeed] = useState(null);
  const [showImport, setShowImport] = useState(false); // 📥 ほかのアプリから取り込む
  // クイックスタートをメモ 0 件で終えたとき「メモを書く」→ 本が読み込まれたらその本を開いてメモのシートを出す。
  const [pendingMemoBookId, setPendingMemoBookId] = useState(null);
  // 📷 初回ガイドの「本のページを撮る」（2026-10-02）: 本を選ぶ（追加する）→ メモのシートを「写真から書き起こす」が
  //   見える形で開く → 最初のメモを保存したら「相談してみる」。押した時刻（15 分で切れる＝途中でやめた人の、あとの
  //   ふだんのメモのシートを写真の形で開かないように）。
  const [ocrIntentAt, setOcrIntentAt] = useState(null);
  const ocrIntentActive = ocrIntentAt != null && Date.now() - ocrIntentAt < 15 * 60 * 1000;
  // 最初のメモを保存したあとも、その本の詳細の「この本に相談する」は「相談してみる」と同じ道にする（知らせは 10 秒で消えるので・
  //   2026-10-02 ui-critic）。{ bookId, at } | null・15 分か、使ったら消える。
  const [ocrBridge, setOcrBridge] = useState(null);

  // 下部ナビでタブを切り替えるときの共通処理。同一セッション内で前回見ていた
  // サブタブが状態に残っていても、入口を「振り返り＝ノート / 相談＝マイ読書脳」に
  // 必ずリセットしてから切り替える（タブを押すたびに起点が一定になる）。
  const navigateTab = (t) => {
    // 既にアクティブなタブの再タップではサブタブをリセットしない —
    // リセットするとサブ画面（🧠 マイ読書脳等）がアンマウントされ、
    // 入力中の質問ドラフトが黙って消える。入口リセットは「別のタブから
    // 切り替えてきた時」だけの仕事。
    if (t === tab) {
      // ホームタブの再タップは「すべての本」からホームへ戻る（iOS のタブの作法）。
      if (t === 'books') { setShelfMode('home'); setLibraryFrom(null); }
      return;
    }
    // 記録から開いた「すべての本」は振り返りの中の寄り道（下のタブも振り返りが選択中＝navTab）。
    // そこで振り返りを押したら、行動ではなく元の記録へ戻す（‹ 記録 と同じ・2026-09-29）。
    if (t === 'review' && tab === 'books' && libraryFrom === 'record') { leaveLibrary(); return; }
    // 記録から開いた「すべての本」は寄り道なので、別のタブへ移ったらホームに戻しておく。
    if (tab === 'books' && libraryFrom) { setShelfMode('home'); setLibraryFrom(null); }
    if (t === 'review') { setActionShowDoneNonce(null); setReviewSubTab(lastReviewSubRef.current || 'action'); }
    else if (t === 'ai') setAiSubTab('brain');
    setTab(t);
  };
  // 📊 記録の数字・タグ・著者から「すべての本」を開く（‹ 記録 で記録へ戻れるように印を付ける）。
  const openLibraryFromRecord = () => {
    navigateTab('books'); goList(); setShelfMode('library'); setLibraryFrom('record');
  };
  // 🏷 本の詳細の分野から「すべての本」をその分野で絞って開く（2026-10-11）。
  //   「‹ この本」でその本の詳細へ戻す（開く前のすべての本の様子も戻す）。
  const openLibraryByField = (field) => {
    if (current?.id) libraryFromBookRef.current = { id: current.id, shelfMode, libraryFrom, tagFilter };
    setSearch(''); setMinRating(0); setFolderFilter(null); setStatusFilter('all');
    setTagFilter([field]);
    goList(); setShelfMode('library'); setLibraryFrom(current?.id ? 'book' : null);
  };
  // 下のタブで選択中に見せるタブ。記録から開いた「すべての本」（と、そこから開いた本）は振り返りの中の
  // 寄り道なので、ホームではなく振り返りを選択中にする（戻る先の「‹ 記録」と合わせる・2026-09-29）。
  const navTab = tab === 'books' && libraryFrom === 'record' ? 'review' : tab;
  // 🌱 初日の「相談してみる」（2026-10-02・lib/firstDay.js）: 取り込み・ページを撮る を終えたあと、自分のメモから作った
  //   相談を入力欄に入れて相談を開く（送らない＝トークンは送ったときだけ）。from: 'import' | 'ocr'。
  //   bookIds: 相談相手をその本に絞って開く（本の詳細の「この本に相談する」から来たとき）。
  const openConsultDraft = (question, from, bookIds = null) => {
    track('try_consult', { from });
    setAskPreset({ question, nonce: Date.now(), draft: true, from: 'firstDay', ...(Array.isArray(bookIds) && bookIds.length ? { bookIds } : null) });
    setView('list'); setAiSubTab('brain'); setTab('ai');
  };
  // 📷 本のページを撮る → 最初のメモ → 「相談してみる」（知らせ・この本に相談する のどちらからでも）。
  const ocrBridgeActiveFor = (bookId) => !!bookId && (ocrIntentActive || (ocrBridge?.bookId === bookId && Date.now() - ocrBridge.at < 15 * 60 * 1000));
  //   本の詳細の「この本に相談する」から（scoped）は相談相手をその本に絞る。知らせの「相談してみる」はすべての本のまま。
  const openOcrConsult = (book, { scoped = false } = {}) => {
    setOcrBridge(null);
    openConsultDraft(firstConsultQuestion({ books: [book, ...books.filter((b) => b.id !== book.id)], memoBookIds: new Set([book.id]) }), 'ocr', scoped ? [book.id] : null);
  };
  // 🔁 毎日の輪から相談へ（2026-10-10）: 行動の結果・思い出しカードのメモ・ホームの「相談相手が育ちました」から、
  //   相談の入力欄に下書きを入れて開く（送らない＝トークンは送ったときだけ）。bookIds があれば相談相手をその本に絞る。
  const openConsultWith = (question, { bookIds = null } = {}) => {
    if (!question) return;
    //   カーソルは置かない（キーボードで戻り先・相談相手の行が隠れないように・押せばすぐ書ける＝2026-10-10 ui-critic）。
    setAskPreset({ question, nonce: Date.now(), draft: true, focus: false, ...(Array.isArray(bookIds) && bookIds.length ? { bookIds } : null) });
    setView('list'); setAiSubTab('brain'); setTab('ai');
  };
  // 🔎 すべての本の検索から「相談で探す」: 相談を開いて入力欄に問いを入れるだけ（送らない＝トークンは送ったときだけ・2026-09-30）。
  const openConsultSearch = (q) => {
    setAskPreset({ question: consultQuestionFor(q), nonce: Date.now(), draft: true });
    setView('list'); setAiSubTab('brain'); setTab('ai');
  };
  // 🎁 7 日間無料が始まった直後の知らせの「相談してみる」（Paywall はアプリの外側に重なるので、知らせから合図で受ける・2026-10-10）。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOpen = () => { setView('list'); setCurrent(null); setAiSubTab('brain'); setTab('ai'); };
    window.addEventListener('orime:open-consult', onOpen);
    return () => window.removeEventListener('orime:open-consult', onOpen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 「すべての本」から戻る: 記録から来たなら 振り返り → 記録 へ、それ以外はホームへ。
  const leaveLibrary = () => {
    if (libraryFrom === 'book') {
      const back = libraryFromBookRef.current;
      libraryFromBookRef.current = null;
      setLibraryFrom(back?.libraryFrom ?? null);
      setTagFilter(back?.tagFilter || []);
      setShelfMode(back?.shelfMode || 'home');
      const b = back && rawBooks.find((x) => x.id === back.id);
      if (b) openDetail(b);
      return;
    }
    if (libraryFrom === 'record') {
      setLibraryFrom(null);
      setShelfMode('home');
      setReviewSubTab('record');
      setTab('review');
      return;
    }
    setShelfMode('home');
  };

  // 🔔 想起プッシュ通知のディープリンク受信。
  //   通知タップ → /?recall=<memoId> で起動 / 既存ウィンドウに navigate される。
  //   ここでは「振り返りタブ（💭 ノート）を開く」ところまで最小限で対応する
  //   （個別メモへのスクロール先指定は将来拡張。まずは想起導線に確実に乗せる）。
  //   recall クエリは消費後に URL から消す（リロードで再発火させない）。
  // 想起ディープリンクで開きたいメモ ID。books 読込後に「そのメモの本」を直接開く
  // ためのペンディング（HomeRecall カードと同じ着地＝本詳細に揃える）。
  //   { memoId, bookId }（bookId は 2026-10-10 からの通知＝/?book=<本>&memo=<メモ>。memoId だけは前の通知の /?recall=<メモ>）
  const [pendingRecallMemoId, setPendingRecallMemoId] = useState(null);
  // 通知から開いた（行き先がある）ときは、前回の画面の復元（下の navRestoredRef の effect）をしない。
  //   これが無いと、起動から開いた期限の通知が 振り返り › 行動 を開いたあと、本の読み込みが済んだところで
  //   前回開いていた本の詳細に戻されていた（2026-10-10）。
  const pushNavRef = useRef(false);
  const handleRecallDeepLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    let sp;
    try { sp = new URLSearchParams(window.location.search); } catch { return; }
    // 📊 通知から開いた（push=recall|action_deadline・2026-10-10）。数えたら URL から消す。
    const pushKind = sp.get('push');
    if (pushKind) {
      if (pushKind === 'recall' || pushKind === 'action_deadline') track(EVENTS.PUSH_OPENED, { kind: pushKind });
      sp.delete('push');
      try {
        const qs = sp.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
      } catch { /* ignore */ }
    }
    // 行動の期限の通知 → /?tab=review&sub=action で振り返り → 行動を開く。
    if (sp.get('tab') === 'review') {
      const sub = sp.get('sub');
      pushNavRef.current = true;
      setTab('review');
      setView('list');
      setCurrent(null);
      if (sub === 'action' || sub === 'note' || sub === 'record') setReviewSubTab(sub);
      try {
        sp.delete('tab'); sp.delete('sub');
        const qs = sp.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
      } catch { /* ignore */ }
      return;
    }
    // 思い出しの通知 → /?book=<本>&memo=<メモ>（2026-10-10〜）か /?recall=<メモ>（前の通知）。
    const bookId = sp.get('book');
    const memoId = sp.get('recall') || sp.get('memo');
    if (!memoId && !bookId) return;
    pushNavRef.current = true;
    // 本を直接開くのは books 読込後（下の resolver）。ここでは対象を控えるだけ。
    // 解決できない場合は resolver が振り返り（💭ノート）へフォールバックする。
    setPendingRecallMemoId({ memoId: memoId || null, bookId: bookId || null });
    // クエリを掃除（hash / 他クエリは温存）— リロードで再発火させない。
    try {
      sp.delete('recall'); sp.delete('book'); sp.delete('memo');
      const qs = sp.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
      window.history.replaceState(null, '', next);
    } catch { /* ignore */ }
  }, []);

  // 起動時に 1 度（クエリに recall があれば）。
  useEffect(() => { handleRecallDeepLink(); }, [handleRecallDeepLink]);

  // アプリが既に開いている時に通知タップ → SW が postMessage('recall-navigate')。
  // navigate でクエリ付き URL に変わるので、それを読んで誘導する。
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    const onMsg = (event) => {
      // 念のため: 自分の SW（同一オリジン）以外からの postMessage は無視する
      // （防御的措置。SW message は本来同一オリジンに限られるが二重防御）。
      if (event.source && navigator.serviceWorker.controller && event.source !== navigator.serviceWorker.controller) return;
      const data = event.data;
      if (data && data.type === 'recall-navigate') {
        handleRecallDeepLink();
      } else if (data && data.type === 'pushsubscriptionchange') {
        // プッシュサービスが endpoint をローテーション → SW が再 subscribe して
        // 通知してくる。新しい購読を Supabase に再同期する（自己修復）。これが
        // 無いと endpoint ローテーション後に通知が恒久的に届かなくなる。
        ensurePushSubscription();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [handleRecallDeepLink]);

  // 起動時に 1 度、購読 endpoint と DB を再同期（許可済み・購読済みのみ。それ以外は
  // no-op）。ウィンドウを閉じている間に endpoint がローテーションした取りこぼしを
  // 次回起動で回復する。（native では isPushSupported()=false で即 no-op）
  useEffect(() => { ensurePushSubscription(); }, []);

  // 🔔📱 ネイティブ(APNs)通知タップのディープリンク配線。通知の data.url
  //   (/?recall=<id>) を URL に反映してから既存の recall ハンドラを起動する
  //   （Web の SW postMessage 経路と同じ着地に合流させる）。native のみ。
  useEffect(() => {
    if (!isNative) return undefined;
    let cancelled = false;
    let removeListener = null;
    initNativePushNav((url) => {
      if (cancelled || !url) return;
      try { window.history.replaceState(null, '', url); } catch { /* ignore */ }
      handleRecallDeepLink();
    }).then((remove) => {
      if (cancelled) { try { remove?.(); } catch { /* ignore */ } }
      else removeListener = remove;
    });
    return () => { cancelled = true; try { removeListener?.(); } catch { /* ignore */ } };
  }, [handleRecallDeepLink]);
  const [view, setView] = useState("list"); // list | detail | edit
  // 🔗 ホームを離れたら、ホームで保存したメモの似たメモの 1 行は消す（homeSavedMemo・2026-10-10）。
  useEffect(() => { if (tab !== 'books' || view !== 'list') setHomeSavedMemo(null); }, [tab, view]);
  // 実行時点の最新 view を読むための ref（handleSave の長い await 後に「ユーザーが
  // まだ編集画面にいるか」を判定する用。formRef/booksRef と同じ流儀）。
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  // 相談タブ・相談サブタブ・一覧画面を離れたら、押し込まれた画面の状態を戻す（戻ったときは会話から）。
  useEffect(() => {
    if (tab !== 'ai' || aiSubTab !== 'brain' || view !== 'list') setConsultPushed(false);
    if (tab !== 'ai' || aiSubTab !== 'advisor' || view !== 'list') setAdvisorPushed(0);
  }, [tab, aiSubTab, view]);
  const [current, setCurrent] = useState(null);
  // 🔔 本に結びついた知らせ（「保存しました。」＋行動に追加・「仮説に入れました」＋元に戻す）。
  //   別の本の詳細を開いたら閉じる（前の本の「行動に追加」が別の本の画面まで付いてきていた・2026-10-09）。
  //   閉じるだけで、元に戻すなどの処理は走らせない（skipExpire）。
  const bookToastsRef = useRef(new Map()); // 知らせの id → 本の id
  const bindToastToBook = (bookId, id) => {
    if (bookId && id) {
      bookToastsRef.current.set(id, bookId);
      if (bookToastsRef.current.size > 20) bookToastsRef.current.delete(bookToastsRef.current.keys().next().value);
    }
    return id;
  };
  useEffect(() => {
    const openId = (view === 'detail' || view === 'edit') ? current?.id : null;
    if (!openId) return;
    bookToastsRef.current.forEach((bookId, id) => {
      if (bookId === openId) return;
      toast.dismiss(id, { skipExpire: true });
      bookToastsRef.current.delete(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, view]);

  // ── 画面復帰（iOS PWA リロード対策）─────────────────────────────────
  // バックグラウンドでメモリから落とされると、戻った時にアプリがまるごと
  // リロードされ state が初期化される。タブ（activeTab で別途復元）に加えて
  // サブタブと「開いていた本/詳細」を lib/navState.js（60 分 TTL）に保存し、
  // 一定時間内の再起動なら同じ画面へ静かに戻す。復元スナップショットは
  // 上の resumeNav（初回マウントで一度だけ読む）— この persist effect が
  // 上書きする前に確定している。
  useEffect(() => {
    saveNavState({
      tab,
      reviewSubTab,
      aiSubTab,
      view,
      bookId: current?.id || null,
    });
  }, [tab, reviewSubTab, aiSubTab, view, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const navRestoredRef = useRef(false);
  const [form, setForm] = useState(emptyBook());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated"); // updated | created | title | rating
  const [searchOpen, setSearchOpen] = useState(false);
  // 本棚の絞り込み拡張＋シート化ツールバー。常時表示のピル/セレクトを畳み、
  // 「絞り込み / 並び」をボトムシートに隠して本棚をスッキリさせる。
  const [minRating, setMinRating] = useState(0);             // 0=指定なし / 1〜5=その星以上
  const [tagFilter, setTagFilter] = useState([]);            // 選択タグ（AND ではなく OR）
  const [folderFilter, setFolderFilter] = useState(null);    // 選択中フォルダ名（null=すべて）
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  // The "+" button opens this first; from here the user picks the
  // search path (default) or jumps to manual entry.
  const [addBookModalOpen, setAddBookModalOpen] = useState(false);
  // 検索結果の「追加済み」から開いた本の id（詳細の ‹・戻るで検索結果へ戻すため）。
  const [detailFromSearchId, setDetailFromSearchId] = useState(null);
  // 新しく本を追加するフォームの「‹ 戻り先」。openAdd を押した場所（'home' / 'library'）と、
  // 検索（AddBookModal）から来たときの検索語（null＝検索を通っていない）。
  const [addOrigin, setAddOrigin] = useState('library');
  // AI 選書の確認から「書名で探す」へ進んだときの読書準備（課題・得たいこと・選書理由）。本の追加を別の入口から開いたら消す。
  const advisorSetupRef = useRef(null);
  const [addFromSearchQuery, setAddFromSearchQuery] = useState(null);
  // Carries an initial query from AddBookModal → BookSearchModal so a search
  // typed there auto-runs without re-typing.
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [searchInitialAuthor, setSearchInitialAuthor] = useState('');
  const [searchInitialIsbn, setSearchInitialIsbn] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [recentlyDoneId, setRecentlyDoneId] = useState(null);
  const recentlyDoneTimerRef = useRef(null);
  // 本ごとの「ステータスを元に戻す」トーストの id。同じ本のステータスがまた変わった・本を消したときに
  // 古いトーストを閉じる（古い「元に戻す」で別の段階へ巻き戻したり、消した本を保存しようとしてエラーになるのを防ぐ）。
  const statusUndoToastRef = useRef(new Map());
  // 「積読に積んで、読書計画シートを作っています」の知らせ（{ bookId, id }）。シートを保存したら下げる（2026-09-30）。
  const planProgressToastRef = useRef(null);
  const dismissPlanProgress = (bookId) => {
    const cur = planProgressToastRef.current;
    if (!cur || cur.bookId !== bookId) return;
    planProgressToastRef.current = null;
    toast.dismiss(cur.id, { skipExpire: true });
  };
  const dismissStatusUndo = (bookId) => {
    const id = statusUndoToastRef.current.get(bookId);
    if (id) toast.dismiss(id);
    statusUndoToastRef.current.delete(bookId);
  };
  // 本詳細のスクロール可能コンテナへの ref。フェーズ遷移 (status 変化) の
  // たびにスクロールトップへ戻すために使う — 旧実装は前フェーズの最下部
  // (例: 読書前で「読書を開始する」ボタン直前) のままだったため、新フェーズ
  // で画面が下から始まる症状があった。
  const detailScrollRef = useRef(null);
  // 本の編集・追加の画面のスクロールの箱（上部の行の線を出すため）。
  const editScrollRef = useRef(null);
  // 本棚のスクロール位置を本詳細から戻った時に復元する（「迷子にならない」動線）。
  // listScrollRef = 本棚スクロール要素 / savedShelfScroll = 離脱直前の scrollTop /
  // prevViewRef = 直前の view（detail/edit から list に戻った時だけ復元）。
  const listScrollRef = useRef(null);
  const savedShelfScroll = useRef(0);
  // 本棚以外（振り返りの 行動｜メモ｜記録）のスクロール位置。`${tab}:${reviewSubTab}` ごとに控え、
  // 本の詳細から戻ったとき・タブを行き来したときに同じ位置から続ける（2026-09-29）。
  const savedTabScroll = useRef({});
  const scrollKeyFor = (t, sub) => `${t}:${t === 'review' ? sub : ''}`;
  const prevViewRef = useRef('list');
  // 本の詳細・編集から一覧へ戻った直後だけ、一覧を左から出す（押し込みの逆向き・components.css の .screen-pop）。
  // prevViewRef は描画のあとで更新されるので、描画中は「直前の画面」を指している。
  // 付けたクラスは、その一覧が出ている間は外さない（外すと別の出方の動きが途中で始まり直す）。
  const popTabRef = useRef(null);
  if (view !== 'list' || (popTabRef.current && popTabRef.current !== tab)) popTabRef.current = null;
  if (view === 'list' && prevViewRef.current !== 'list') popTabRef.current = tab;
  const screenPop = view === 'list' && popTabRef.current === tab;
  // 編集フォームの「未保存変更」検知用ベースライン（編集に入った時点のスナップショット）。
  const editBaselineRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 本の詳細を開いたときに示すメモ（openDetail の 2 つ目の引数）。
  const [detailFocusMemoId, setDetailFocusMemoId] = useState(null);
  // 振り返りの月ごとのメモを押したとき: そのメモまで送ってから編集を開く（2026-09-30）。
  const [detailEditMemoId, setDetailEditMemoId] = useState(null);
  // 🛰️ 運営ダッシュボード（管理者のみ）。isAdmin は起動時に1回だけ判定。
  const [adminOpen, setAdminOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Long-press context menu (book cards on bookshelf)
  const [bookContextMenu, setBookContextMenu] = useState(null); // { x, y, book }
  // 📗🗂 本棚の長押しから開く「ステータスを変える」「フォルダに入れる」シート。
  // 本を開かずにその場で管理できるようにする（管理の最頻操作を1手に）。
  const [statusPickerBook, setStatusPickerBook] = useState(null);
  const [folderPickerBook, setFolderPickerBook] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  // 詳細画面の「⋯」kebab メニュー位置 (button 近くに表示する)
  const [detailKebab, setDetailKebab] = useState(null);
  // すべての本: 検索欄の開閉と「…」メニュー（並び替え・絞り込み・表示）。
  const [librarySearchOpen, setLibrarySearchOpen] = useState(false);
  const [libraryMenu, setLibraryMenu] = useState(null);
  // 本の追加・編集の画面の右上「…」のメニュー（ヘルプ・2026-09-30）
  const [editMenu, setEditMenu] = useState(null);
  // 読書中・読了の本の購入リンクは「⋯ → この本を買う」のシートへ（2026-09-26 オーナー判断）。
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  // 以前の AI 解析（2026-09-27 に廃止した「AIで本を解析する」の保存済みの結果）は「⋯ → 以前の AI 解析を見る」のシートで（2026-10-09）。
  const [analysisSheetOpen, setAnalysisSheetOpen] = useState(false);
  // 📷 画像で共有のシート（SPEC §2-1）: { book?, initialMemoId?, photoFile?, fromHome?, initialSubject?, from }。
  //   fromHome＝上の行（ホーム・振り返り・相談のタブ）の入口＝本棚の本を渡して「どの本？」を選べるように。
  //   カメラの入口（タブの上の行・本の詳細の上の行・読了した直後）は、撮った写真を持って開く。
  //   メモの「…」→「この一文をシェア」・本の「…」／本棚の長押し →「画像で共有」は写真なしで開く。
  const [shareSheet, setShareSheet] = useState(null);
  // 読了にした直後だけ、その本の下に「読了を写真で共有」を 1 つ出す（押した指の下に現れないよう少し待つ・本を離れたら消す）。
  const [justDoneId, setJustDoneId] = useState(null);
  const justDoneTimerRef = useRef(null);
  // 📷 カメラを直接開く（input の capture。iOS はカメラ・パソコンはファイルを選ぶ画面）。
  // 押した瞬間に（await を挟まずに）開く必要があるので、隠した input を 1 つだけ置いて使い回す。
  // 写真はこの端末の中だけで使う（アップロードしない）。撮るのをやめたら（input の cancel）、写真なしのシートを開く
  // （「写真を選ぶ」でアルバムから選べる・紙や夜でも共有できる・SPEC §2-1）。
  const shareCameraRef = useRef(null);
  const shareCameraTargetRef = useRef(null);
  const openShareCamera = (target) => {
    shareCameraTargetRef.current = target;
    const el = shareCameraRef.current;
    if (!el) { setShareSheet({ ...target }); return; }
    try { el.value = ''; el.click(); } catch { setShareSheet({ ...target }); }
  };
  const onShareCameraPicked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // 入口が分からないとき（撮影の画面から戻る間に画面が変わった等）は、いまの画面から決める。
    const t = shareCameraTargetRef.current
      || (view === 'detail' && current ? { book: current, from: 'detail' } : { fromHome: true, from: 'home' });
    shareCameraTargetRef.current = null;
    setShareSheet({ ...t, photoFile: file });
  };
  const onShareCameraCanceledRef = useRef(null);
  onShareCameraCanceledRef.current = () => {
    const t = shareCameraTargetRef.current
      || (view === 'detail' && current ? { book: current, from: 'detail' } : { fromHome: true, from: 'home' });
    shareCameraTargetRef.current = null;
    setShareSheet({ ...t, cameraCanceled: true });
  };
  // cancel は React の onCancel では input に付かないので、要素に直接付ける（入口ごとに input が付け替わっても 1 つだけ）。
  const shareCameraRefCb = useCallback((el) => {
    const onCancel = () => onShareCameraCanceledRef.current?.();
    const prev = shareCameraRef.current;
    if (prev && prev.__orimeCancel) prev.removeEventListener('cancel', prev.__orimeCancel);
    shareCameraRef.current = el;
    if (el) { el.__orimeCancel = onCancel; el.addEventListener('cancel', onCancel); }
  }, []);
  const shareCameraInput = (
    <input
      ref={shareCameraRefCb}
      data-share-camera=""
      type="file"
      accept="image/*"
      capture="environment"
      onChange={onShareCameraPicked}
      style={{ display: 'none' }}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
  const openDetailKebab = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDetailKebab({ x: rect.right - 8, y: rect.bottom + 4 });
  };
  // 「すべての本」から左端スワイプでホームへ戻る（記録から開いたときは記録へ）。画面は指に付いてくる。
  useEdgeSwipeBack({
    enabled: tab === 'books' && view === 'list' && shelfMode === 'library',
    getTarget: () => listScrollRef.current,
    onBack: () => leaveLibrary(),
  });
  // 相談の中の押し込まれた画面（過去の相談・学びを書く・根拠にできる情報）でも、左端から右へ払うと
  // 「‹ 相談」と同じく会話へ戻る（ブラウザの「戻る」と同じ知らせ・2026-09-29）。
  useEdgeSwipeBack({
    enabled: tab === 'ai' && aiSubTab === 'brain' && consultPushed && view === 'list',
    getTarget: () => (typeof document !== 'undefined' ? document.querySelector('.ai-page') : null),
    // 学びを書く画面に書きかけがあれば、戻る前に「編集を続ける／書いたことを消す」（2026-09-30）。
    beforeBack: () => consultCanLeave(),
    onBack: () => { window.dispatchEvent(new Event('orime:consult-back')); },
  });
  // Edge-swipe back: only listens while we're on a detail or edit view.
  // 画面（上の行＋中身の箱＝data-swipe-target）が指に付いてきて、離すと右へ送り出してから戻る。
  useEdgeSwipeBack({
    enabled: view === 'detail' || view === 'edit',
    // 上の行（PushedTopBar）と中身をまとめた箱を動かす（.detail-enter は上の行にも付いていて、行だけが動いていた・2026-09-30）。
    getTarget: () => (typeof document !== 'undefined' ? document.querySelector('[data-swipe-target]') : null),
    // 編集中の未保存変更は破棄前に確認（下部ナビと同じガード）。やめたら画面は元の位置へ戻る。
    beforeBack: async () => view !== 'edit' || (await confirmDiscardEdit()),
    onBack: () => {
      if (view === 'edit' && current) { setEditPhaseOverride(null); setView('detail'); }
      else if (view === 'edit') leaveNewBookForm();
      else leaveDetail();
    },
  });
  // ブラウザ / Android の「戻る」: 深い画面では ‹・左端スワイプと同じ 1 段戻る（一番上では普通に離れる）。
  // 書きかけのシートが開いている間は 1 段深い扱い（一番上の画面でも「戻る」でアプリを離れて下書きが消えないように）。
  // 重ねて開いたもの（設定・ヘルプ・本を追加・有料プランの画面など＝useBackLayer）は 1 枚ごとに 1 段深く、
  // 「戻る」は一番上の 1 枚だけを閉じる（2026-09-29）。
  const backBlocked = useBackBlocked();
  const backLayers = useBackLayerCount();
  useHistoryBack({
    depth: (tab === 'books' && shelfMode === 'library' ? 1 : 0)
      + (view === 'detail' ? 1 : view === 'edit' ? (current ? 2 : 1) : 0)
      + (tab === 'ai' && aiSubTab === 'brain' && consultPushed && view === 'list' ? 1 : 0)
      + (tab === 'ai' && aiSubTab === 'advisor' && view === 'list' ? advisorPushed : 0)
      + (backBlocked ? 1 : 0)
      + backLayers,
    onBack: async () => {
      const topLayer = topBackLayer();
      if (topLayer && (topLayer.overBlock || !isBackBlocked())) {
        // 閉じる処理が false を返したら（書きかけのメモで「編集を続ける」等）その場に留まる＝履歴を積み直す。
        let res;
        try { res = await topLayer.closeRef?.current?.(); } catch { res = undefined; }
        return res !== false;
      }
      if (isBackBlocked()) return false; // 書きかけのシートが開いている間は戻らない
      if (view === 'edit') {
        if (!(await confirmDiscardEdit())) return false;
        if (current) { setEditPhaseOverride(null); setView('detail'); } else leaveNewBookForm();
        return true;
      }
      if (view === 'detail') { leaveDetail(); return true; }
      if (tab === 'ai' && aiSubTab === 'advisor' && advisorPushed) {
        window.dispatchEvent(new Event('orime:advisor-back'));
        return true;
      }
      if (tab === 'ai' && consultPushed) {
        if (!(await consultCanLeave())) return false; // 書きかけの学びで「編集を続ける」
        window.dispatchEvent(new Event('orime:consult-back'));
        return true;
      }
      if (tab === 'books' && shelfMode === 'library') { leaveLibrary(); return true; }
      return true;
    },
  });
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  // 重ねて開くもの（「戻る」で一番上から閉じる・その間は左端スワイプで下の画面を戻さない）。
  useBackLayer(settingsOpen, () => setSettingsOpen(false));
  useEffect(() => {
    const reopen = () => setSettingsOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, []);
  useBackLayer(adminOpen, () => setAdminOpen(false));
  useBackLayer(helpModalOpen, () => setHelpModalOpen(false));
  useBackLayer(addBookModalOpen, () => setAddBookModalOpen(false));
  const [quickMemoOpen, setQuickMemoOpen] = useState(false);
  const [fullEditorPrefill, setFullEditorPrefill] = useState(null); // { pageNumber, text }
  // 🔗 本の詳細でいま保存したメモ（本と本がつながる・一覧の上に「いま書いたメモと似たメモ」・2026-10-01）。
  const [detailSavedMemo, setDetailSavedMemo] = useState(null); // { id, bookId, text, nonce }
  const onboardingTriggeredRef = useRef(false);
  // Setup-sheet edit history visibility — bumps to force re-read of the
  // localStorage-backed flag when we mutate it.
  const [strategyHistoryTick, setStrategyHistoryTick] = useState(0);
  // Set of titles currently being added from a related-books card so the
  // button can show "追加中…" and we don't double-fire on rapid taps.
  // 関連書籍 (読書計画シート / ROI まとめ) からの「📚 読みたいに追加」を
  // 追跡する state Set。ref ではなく state にすることで、Set の中身を
  // 更新するたびに新しい参照を作って React の prop 比較を確実に通し、
  // RelatedBookCard が「✅ 追加済み」表示に再 render される。
  // 旧実装は addingRelatedTitlesRef + setAddingRelatedTick で render を
  // 強制していたが、IIFE で同じ Set 参照を返していたため shallow compare
  // で不変扱いされ「タップしても何も起きない」ように見える事故が発生。
  const [addedRelatedTitles, setAddedRelatedTitles] = useState(() => new Set());
  // 開いている本が変わったら「追加済み」マークをリセット。これをしないと、
  // 別の本の AI 提案で同じタイトルが出たとき前回のマークが残って "追加済み"
  // でボタンが無効化され「押しても何も起きない」ように見える事故になる。
  useEffect(() => { setAddedRelatedTitles(new Set()); }, [current?.id]);

  // Memo ops for the currently-open book (FAB / quick sheet / full editor handoff).
  // Always called so hook order stays stable; isUsableBookId guards inside the hook.
  const currentMemoOps = useBookMemos(current?.id, { sortBy: 'page' });
  // この本のメモが 0 件と分かっている（読み込み済み、または前回 0 件だった）。右下の「メモを書く」は出さず、
  // 一覧の場所の空の案内の「メモを書く」を入口にする（SPEC §2・2026-09-30）。
  const detailMemoEmpty = !!current?.id && (currentMemoOps.memos || []).length === 0 && !currentMemoOps.error
    && (!currentMemoOps.loading || appCache?.getMemoCountHint?.(current.id) === 0);

  // Books are now committed to DB on delete (no soft-delete state to filter).
  const books = rawBooks;
  // 🏷 本の分野（2026-10-11・lib/bookFields.js）: 分野とフォルダだけを書き、開いている本の詳細にもすぐ映す。
  const saveTaxonomy = useCallback(async (bookId, opts) => {
    const r = await saveBookTaxonomy(bookId, opts);
    if (r?.ok) {
      setCurrent((c) => (c && c.id === bookId
        ? { ...c, tags: r.tags, collections: r.addedCollections?.length ? [...(c.collections || []), ...r.addedCollections] : c.collections }
        : c));
    }
    return r;
  }, [saveBookTaxonomy]); // eslint-disable-line react-hooks/exhaustive-deps
  //   前の版のタグの移し替え（分野／フォルダへ）と、分野の無い本への自動の仕分け（静かに・知らせなし）。
  //   編集している本には触らない（保存で書き戻さないように）。
  const bookFieldsAuto = useBookFieldsAuto({
    userId: user?.id,
    books: rawBooks,
    loading: booksLoading,
    saveBookTaxonomy: saveTaxonomy,
    skipBookId: view === 'edit' ? (form?.id || null) : null,
  });
  // 🔗 ホームのメモを書くを開いたら、似たメモを探す準備をしておく（保存したときに似たメモがあれば、知らせを「保存しました。」だけに＝次の一歩を 1 つに・2026-10-10）。
  const homeLinkFinder = useMemoLinkFinder({ books, enabled: !!homeMemoBook || !!homeSavedMemo });
  // 非同期処理（表紙リトライ・行動トグル直列化など）が「実行時点の最新 books」を
  // 読めるようにする ref。古いスナップショットで saveBook すると差分同期で
  // ユーザー編集が巻き戻るため、保存直前の rebase に使う。
  const booksRef = useRef(rawBooks);
  useEffect(() => { booksRef.current = rawBooks; }, [rawBooks]);
  // form の「実行時点の最新値」参照。保存系ハンドラはクリック時の form スナップ
  // ショットを閉じ込むが、await 中に直列化チェーン（行動トグル/→行動にする）が
  // syncActionSnapshots で form を進めることがある。保存直前に formRef を読む
  // ことで、その 1-2 秒窓の追加行動を巻き戻さない（form の未保存編集は保持）。
  const formRef = useRef(null);
  useEffect(() => { formRef.current = form; }, [form]);
  // 非同期処理（saveBook の rollback / Undo 等）から「今ユーザーが開いている本」
  // を stale クロージャ無しで判定するための ref。closure の current は数秒前の
  // スナップショットであり、別の本へ移動済みのユーザーの画面を乗っ取る事故の元。
  const currentRef = useRef(null);
  useEffect(() => { currentRef.current = current; }, [current]);

  // 「読了グロー」用の 8 秒タイマーは advanceStatus 内で張られるが、その間に
  // アンマウント (ログアウト / サブスク失効で PaywallGate に戻る等) すると
  // unmount 後 setRecentlyDoneId が走って警告になる。アンマウント時に解放する。
  useEffect(() => () => {
    if (recentlyDoneTimerRef.current) clearTimeout(recentlyDoneTimerRef.current);
  }, []);

  // Easter egg: long-press the bookshelf logo (📚) to reveal a thank-you.
  const [thanksOpen, setThanksOpen] = useState(false);
  const logoLongPress = useLongPress({
    onLongPress: () => {
      try { haptic.medium(); } catch { /* non-critical */ }
      setThanksOpen(true);
    },
  });

  // Scroll to top on every top-level tab/view change so the new content
  // always starts at the top of the screen instead of inheriting the previous
  // scroll position. `behavior: 'auto'` for instant snap (no smooth animation).
  // サブタブ (reviewSubTab / aiSubTab) の切替も対象に含める — そうしないと
  // 旧タブの自動スクロール位置を引きずって、見出しが画面外に消えたまま新
  // サブタブが開いてしまう。
  //
  // iOS Safari 対策で document.documentElement と document.body の両方を
  // 0 にする (window.scrollTo だけだと一部のバージョンで効かない)。さらに
  // 切替時に active element を blur して、textarea が裏で focus を奪い続け
  // viewport がそこへ自動スクロールするのを防ぐ。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active && typeof active.blur === 'function') {
        try { active.blur(); } catch { /* ignore */ }
      }
    }
    requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { /* ignore */ }
      if (typeof document !== 'undefined') {
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
    });
  }, [tab, view, reviewSubTab, aiSubTab]);

  // 本棚スクロール位置の復元: 本詳細(detail/edit)から戻った時だけでなく、
  // タブ往復（books → review → books）でも直前の位置へ戻す。スクロール
  // コンテナは key={tab} で毎回リマウントされ 0 に飛ぶが、iOS 純正アプリは
  // タブごとに位置を必ず保持する（App Store / 写真等）。savedShelfScroll は
  // 本棚滞在中の onScroll で常時更新済みなので、復元は常に正しい。
  useEffect(() => {
    prevViewRef.current = view;
    if (view === 'list' && tab === 'books' && savedShelfScroll.current > 0) {
      requestAnimationFrame(() => {
        if (listScrollRef.current) {
          try { listScrollRef.current.scrollTop = savedShelfScroll.current; } catch { /* ignore */ }
        }
      });
    }
  }, [view, tab]);

  // 振り返りのスクロール位置の復元（本棚は上の savedShelfScroll）。中身（行動の一覧など）は
  // あとから読み込まれて伸びるので、控えた位置まで送れる高さになるまで数フレーム待って合わせる（最大 1 秒）。
  // 同じタブの中でサブタブ（行動｜メモ｜記録）を切り替えたときは、新しい画面なので先頭から見せる。
  const prevScrollNavRef = useRef({ tab, view, sub: reviewSubTab });
  useEffect(() => {
    const prev = prevScrollNavRef.current;
    prevScrollNavRef.current = { tab, view, sub: reviewSubTab };
    if (view !== 'list' || tab === 'books' || tab === 'ai') return undefined;
    const key = scrollKeyFor(tab, reviewSubTab);
    const onlySubChanged = prev.tab === tab && prev.view === view && prev.sub !== reviewSubTab;
    if (onlySubChanged) {
      savedTabScroll.current[key] = 0;
      const el = listScrollRef.current;
      if (el) { try { el.scrollTop = 0; } catch { /* ignore */ } }
      return undefined;
    }
    const target = savedTabScroll.current[key] || 0;
    if (target <= 0) return undefined;
    let raf = 0;
    let tries = 0;
    let cancelled = false;
    const el0 = listScrollRef.current;
    const stop = () => { cancelled = true; };
    // 待っている間に自分で動かしたら、合わせるのをやめる。
    el0?.addEventListener('touchstart', stop, { passive: true, once: true });
    el0?.addEventListener('wheel', stop, { passive: true, once: true });
    const step = () => {
      if (cancelled) return;
      const el = listScrollRef.current;
      if (el && el.scrollHeight - el.clientHeight >= target - 1) {
        try { el.scrollTop = target; } catch { /* ignore */ }
        return;
      }
      tries += 1;
      if (tries < 60) raf = requestAnimationFrame(step);
      else if (el) { try { el.scrollTop = target; } catch { /* ignore */ } }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      el0?.removeEventListener('touchstart', stop);
      el0?.removeEventListener('wheel', stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tab, reviewSubTab]);

  // ホーム ⇄ すべての本 の切替は別の画面への移動なので、先頭から見せる（前の画面の
  // スクロール位置を持ち越さない）。本詳細から戻ったときの復元（上）はそのまま。
  const prevShelfModeRef = useRef(shelfMode);
  useEffect(() => {
    if (prevShelfModeRef.current === shelfMode) return;
    prevShelfModeRef.current = shelfMode;
    savedShelfScroll.current = 0;
    requestAnimationFrame(() => {
      if (listScrollRef.current) {
        try { listScrollRef.current.scrollTop = 0; } catch { /* ignore */ }
      }
    });
  }, [shelfMode]);

  // 編集に入った瞬間の form をベースラインとして控える（編集中の変更検知用）。
  // form は deps に入れない＝編集中の変更で再スナップショットしない（入った時だけ）。
  useEffect(() => {
    editBaselineRef.current = view === 'edit' ? JSON.stringify(form) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // 編集フォームに未保存の変更があるか（ベースラインと現在 form の差分）。
  const isEditDirty = () =>
    view === 'edit' && editBaselineRef.current != null && JSON.stringify(form) !== editBaselineRef.current;

  // 未保存の変更があれば破棄確認を挟む共通ガード。下部ナビ・「← 戻る」・
  // edge-swipe back の全経路で同じ挙動にする（一部だけ確認が出るのは不整合）。
  const confirmDiscardEdit = async () => {
    if (!isEditDirty()) return true;
    // 本棚にある本を直しているときは、保存済みのメモと同じ言い方（本は元のまま残る・「直したところを捨てる」・2026-09-30）。
    if (current) {
      return confirm({
        title: '保存していない変更があります',
        message: '本の情報は元のまま残ります。',
        confirmLabel: '直したところを捨てる',
        cancelLabel: '編集を続ける',
        danger: true,
      });
    }
    return confirm({
      title: '保存していない変更があります',
      message: '破棄すると、この変更は失われます。',
      confirmLabel: '破棄する',
      cancelLabel: '編集を続ける',
      danger: true,
    });
  };

  // First-run onboarding: show once per user/device until they dismiss it.
  // The completion flag is the single source of truth — the book count is
  // intentionally NOT part of the predicate, so users who clear data or
  // re-install only see it again if they explicitly reset via the help button.
  // 本を読み込んだら、Web の飾りのスプラッシュをすぐ消す（決まった 1 秒を待たせない・2026-09-30）。
  useEffect(() => { if (!booksLoading) markAppReady(); }, [booksLoading]);
  useEffect(() => {
    if (booksLoading) return;
    if (onboardingTriggeredRef.current) return;
    if (isOnboardingCompleted()) return;
    onboardingTriggeredRef.current = true;
    setShowOnboarding(true);
  }, [booksLoading]);

  // 5 回目の修正で導入: 既存 cover=NULL 行に対して openBD URL を後追いで
  // 埋めるバックフィル。localStorage で「実行済み」を管理し、ユーザー
  // ごと 1 回だけ走る。失敗しても起動を遅らせない。
  useEffect(() => {
    if (!user?.id) return;
    backfillCovers(supabaseClient, user.id)
      // 実際に行を書き換えた時だけ再フェッチ。no-op（実行済みフラグ・対象0件）
      // でも毎回 refreshBooks すると起動のたびに books 全件を二重取得していた。
      .then((changed) => { if (changed) { try { return refreshBooks(); } catch { /* ignore */ } } })
      .catch(() => {});
  }, [user?.id, refreshBooks]);

  // BookCard 側から「表紙が出ない」と通知されたらキューに積む。
  // セッション内 1 回 / 1 秒 1 冊 のレート制御は coverAutoRetry 側で。
  // 解決成功時は saveBook 経由で永続化されるので、useBooks の cache が
  // 自動更新されカードが再レンダリングして表紙が表示される。
  // opts.brokenCover: 読めなかった保存済みの表紙 URL（BookCards の onError / 1×1 検知）。
  //   これだけは新しい表紙で差し替えてよい（以前は表紙が空の本しか直さず、壊れた URL の本は
  //   ずっとグラデーションのままだった）。
  // opts.fallback: 保存した直後でまだ books に載っていない本（resolveCoverInBackground から）。
  const triggerCoverAutoRetry = useCallback(
    (book, opts = {}) => {
      enqueueCoverRetry({
        book,
        brokenCover: opts.brokenCover || '',
        // 表紙リトライの保存も本ごとの保存チェーンに乗せる。チェーン外の saveBook は
        // 進行中の行動トグル等と DB レベルで並走し、actions 差分同期が in-flight の
        // 新規行動を DELETE する窓がある。チェーン内で最新へ rebase し表紙だけ差し替える。
        saveBook: (patch) => enqueueBookMutation(patch.id, async (entry) => {
          const latest = entry.latest || booksRef.current.find((b) => b.id === patch.id);
          if (!canReplaceCover(latest, patch.brokenCover)) return;
          const next = { ...latest, cover: patch.cover, coverIsbn: patch.coverIsbn };
          // 本に ISBN が無く、書名から分かったら一緒に保存する（次からは ISBN で直接探せる・
          // Amazon のリンクも商品ページへ）。同じ ISBN の本が既に本棚にあれば ISBN は付けない。
          if (!latest.isbn && patch.isbn) next.isbn = patch.isbn;
          entry.latest = next;
          try {
            await saveBook(next);
          } catch (e) {
            if (next.isbn === latest.isbn || !isUniqueViolation(e)) throw e;
            const withoutIsbn = { ...next, isbn: latest.isbn || '' };
            entry.latest = withoutIsbn;
            await saveBook(withoutIsbn);
          }
        }),
        // 保存直前に最新の本へ rebase させる（stale 保存によるユーザー編集の巻き戻し防止）。
        getBook: (id) => booksRef.current.find((b) => b.id === id)
          || (opts.fallback && opts.fallback.id === id ? opts.fallback : null),
      });
    },
    // enqueueBookMutation は安定した ref（actionToggleChainsRef）しか触らないため、
    // 初回レンダーのクロージャで十分（deps に含めない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveBook],
  );

  // Resolve the help key for whatever screen the user is currently looking at.
  // Priority order:
  //   1. Open modal contexts (advisor / quick memo / full editor) — they overlay everything
  //   2. Book detail / edit view — map by status
  //   3. Bottom-nav tabs — books / review / ai (3 タブ構成)
  const getCurrentHelpKey = () => {
    if (quickMemoOpen || fullEditorPrefill) return 'memoEditor';
    if (view === 'detail' || view === 'edit') {
      const status = current?.status || form?.status;
      if (status === 'want') return 'bookDetailWant';
      if (status === 'before') return 'bookDetailBefore';
      if (status === 'reading') return 'bookDetailReading';
      if (status === 'done') return 'bookDetailDone';
    }
    if (tab === 'review') return reviewSubTab === 'action' ? 'actionList' : 'review';
    if (tab === 'ai') return aiSubTab === 'brain' ? 'myBookBrain' : 'aiAdvisor';
    return 'bookList';
  };

  const openHelp = () => setHelpModalOpen(true);

  // Tapping "+" no longer drops the user straight into a blank form — the
  // search-first AddBookModal opens so they're nudged toward the path that
  // produces clean metadata for AI features.
  const addStatusPresetRef = useRef('');
  const openAdd = (presetStatus) => {
    // AddBookModal は本棚（view==='list'）の return 枝でのみ描画される。
    // detail / edit ビューからオンボーディング等で呼ばれた場合、view を
    // 戻さないと「押しても何も起きない」袋小路になる（openAdvisor と同形）。
    setView("list");
    setTab("books");
    // オンボーディングの「いま読んでいる本を追加する」経由では既定ステータスを
    // 「読書中」にプリセットする。既定の「読みたい」のままだと、CTA の約束
    // （いま読んでいる本 → すぐメモ）に対して状態セレクタの一段が折れる。
    addStatusPresetRef.current = typeof presetStatus === 'string' ? presetStatus : '';
    advisorSetupRef.current = null;
    setAddOrigin(tab === 'books' && shelfMode === 'library' ? 'library' : 'home');
    setAddFromSearchQuery(null);
    setAddBookModalOpen(true);
  };

  // 📷 本が 0 冊で「写真で共有」を押したとき（2026-10-09 ui-critic）: 知らせは出さず、ホームの「これまで読んだ本から始める」へ
  //   目と指を送る（フォーカス＋画面の中ほどへ＋軽く弾ませる＋ハプティクス）。見つからなければ本を追加を開く。
  const pointToFirstStep = () => {
    try { haptic.light(); } catch { /* ignore */ }
    if (tab !== 'books') navigateTab('books');
    if (view !== 'list') setView('list');
    setShelfMode('home');
    setTimeout(() => {
      const b = [...document.querySelectorAll('[data-first-step]')].find((x) => x.offsetParent);
      if (!b) { openAdd('reading'); return; }
      try { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'center' }); } catch { /* ignore */ }
      b.classList.remove('nudge-pulse');
      void b.offsetWidth;
      b.classList.add('nudge-pulse');
      setTimeout(() => b.classList.remove('nudge-pulse'), 1300);
    }, 120);
  };

  // 📷 初回ガイドの「本のページを撮る」: いま読んでいる本を追加する流れ（保存すると本の詳細でメモのシートが開く）に、
  //   シートを写真の形で開く印を付ける（2026-10-02）。
  const startOcrPath = () => {
    setOcrIntentAt(Date.now());
    openAdd('reading');
  };

  // AddBookModal は今や検索結果リストまで内包する 1 画面モーダル。
  // ここでは「ユーザーが結果から本を選んだ」イベントだけを受け取り、
  // 編集画面を該当本のメタデータでプリフィルして開く。検索フォーム /
  // 結果リスト UI は AddBookModal 側に閉じている。
  const pickBookFromAdd = (b, query = '') => {
    setAddBookModalOpen(false);
    setAddFromSearchQuery(query || '');
    // ★ 検索結果に既に表示されていた cover を「視覚的に確認済み」とみなして
    //   そのまま seed + coverIsbn = primary ISBN で確定する。これで
    //   「ユーザーが見て選んだ表紙」と「DB に保存される表紙」が必ず一致する
    //   (旧来は b.cover をシードした上で更に async で別 ISBN の表紙に
    //    上書きしていたため、検索結果と保存結果がズレる事故が起きていた)。
    // ⚠️ 確かめていない候補 URL（NDL の書影など）は入れない。以前は candidates[0] を入れており、
    //    その本に NDL の書影が無いと壊れた URL のまま保存され、表紙が付かなかった（2026-09-30）。
    const visibleCover = b?.cover || '';
    const seedCover = visibleCover;
    const seeded = {
      ...emptyBook(),
      ...(addStatusPresetRef.current ? { status: addStatusPresetRef.current } : {}),
      id: Date.now().toString(),
      title: b.title || '',
      author: b.author || '',
      cover: seedCover,
      // 視覚的に確認できた cover は primary ISBN と紐付けて記録する。
      coverIsbn: visibleCover && b?.isbn ? String(b.isbn).replace(/[-\s]/g, '') : '',
      totalPages: b.pages || 0,
      isbn: b.isbn || '',
      addedVia: 'search',
      // AI 選書の確認の「書名で探す」から来たときは、読書準備も引き継ぐ（2026-10-04）。
      ...(addOrigin === 'advisor' && advisorSetupRef.current ? advisorSetupRef.current : {}),
    };
    setForm(seeded);
    setCurrent(null);
    setView('edit');

    // 2) cover が無かった (または ISBN ベースの推測しか無い) 場合のみ
    //    multi-ISBN リゾルバで補完。視覚的に確認済みの cover がある時は
    //    skip してユーザーが見たものをそのまま使う (誤上書きの根本対策)。
    if (visibleCover) {
      return;
    }
    (async () => {
      try {
        // サーバー（楽天・NDL・openBD）→ 端末の順で探す（すべての入口で同じ・coverAutoRetry）。
        const r = await resolveCoverForBook({ title: b.title, author: b.author, isbn: b.isbn });
        const resolvedUrl = r.url;
        const resolvedIsbn = r.coverIsbn;
        if (resolvedUrl) {
          setForm((f) => (
            f && f.id === seeded.id
              ? { ...f, cover: resolvedUrl, coverIsbn: resolvedIsbn || f.coverIsbn || '' }
              : f
          ));
        }
      } catch (e) {
        console.warn('[cover] multi-ISBN resolve failed:', e?.message || e);
      }
    })();
  };

  // 詳細画面の kebab「🖼 手動でアップロード」用。useBookCover で
  // book-covers バケットに upload → public URL を books.cover に保存。
  // cover_isbn は 'manual' を立てて、自動再解決 (backfill) で上書き
  // されないように保護する。
  const detailCoverUploadRef = useRef(null);
  const detailUploadTargetRef = useRef(null);
  const { uploadCover } = useBookCover();

  const triggerManualCoverUpload = (book) => {
    if (!book) return;
    detailUploadTargetRef.current = book;
    if (!detailCoverUploadRef.current) {
      // eslint-disable-next-line no-console
      console.error('[manual-upload] file input ref is null — input not mounted in current view');
      toast.error('写真を選ぶ画面を開けませんでした。本の詳細から、もう一度お試しください。');
      return;
    }
    detailCoverUploadRef.current.click();
  };

  const handleManualCoverPicked = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // 同じファイル再選択を許可
    const target = detailUploadTargetRef.current;
    detailUploadTargetRef.current = null;
    if (!file || !target) return;
    try {
      const url = await uploadCover(file);
      if (!url) throw new Error('アップロード URL の取得に失敗しました');
      // 直列化チェーンに乗せ、実行時点の最新行へ rebase して cover だけ差し替える。
      // タップ時点の全行スナップショットで saveBook すると、アップロード待ちの間の
      // 並行編集（行動トグル等）が差分同期で巻き戻るため。
      await enqueueBookMutation(target.id, async (entry) => {
        const base = entry.latest || booksRef.current.find((b) => b.id === target.id) || target;
        const updated = { ...base, cover: url, coverIsbn: 'manual' };
        const saved = await saveBook(updated);
        if (saved) entry.latest = saved;
        const next = saved || updated;
        // stale クロージャの current 同士を比較すると常に一致してしまうため関数形式で。
        setCurrent((c) => (c && c.id === next.id ? next : c));
      });
      toast.success('表紙をアップロードしました。');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[manual-upload] failed:', err);
      toast.error(toMessage(err, '表紙のアップロードに失敗しました'));
    }
  };

  const removeCoverFor = async (book) => {
    if (!book) return;
    // 「元に戻す」用に消す前の表紙を覚えておく（自分でアップロードした表紙は取り直しでは戻らないため・2026-10-04）。
    const before = booksRef.current.find((b) => b.id === book.id) || book;
    const prevCover = { cover: before.cover || '', coverIsbn: before.coverIsbn ?? null };
    try {
      // coverIsbn='removed' は「ユーザーが意図的に消した」印。自動リトライ
      // (coverAutoRetry) がこれを見て復活させない。手動「取り直す」では
      // 通常どおり新しい表紙で上書きされ、印も消える。
      // チェーン + 実行時点 rebase（並行編集の巻き戻し防止）。
      await enqueueBookMutation(book.id, async (entry) => {
        const base = entry.latest || booksRef.current.find((b) => b.id === book.id) || book;
        const updated = { ...base, cover: '', coverIsbn: 'removed' };
        const saved = await saveBook(updated);
        if (saved) entry.latest = saved;
        const next = saved || updated;
        setCurrent((c) => (c && c.id === next.id ? next : c));
      });
      // 削除は「元に戻す」つき（DESIGN §5 トースト・ほかの削除と同じ）。
      toast.undo({
        message: '表紙を削除しました。',
        destructive: true,
        onUndo: async () => {
          try {
            await enqueueBookMutation(book.id, async (entry) => {
              const base = entry.latest || booksRef.current.find((b) => b.id === book.id);
              if (!base) return; // その間に本が消された
              const restored = { ...base, ...prevCover };
              const saved = await saveBook(restored);
              if (saved) entry.latest = saved;
              const next = saved || restored;
              setCurrent((c) => (c && c.id === next.id ? next : c));
            });
          } catch (err) {
            toast.error(toMessage(err, '表紙を元に戻せませんでした'));
          }
        },
      });
    } catch (err) {
      toast.error(toMessage(err, '表紙の削除に失敗しました'));
    }
  };

  // 表紙取得中の本 id（ローディング表示 + 二重起動防止）。
  const [coverBusyId, setCoverBusyId] = useState(null);
  // 既存の本に対して表紙を取り直す。Google Books の検証済みサムネを最優先に、
  // ダメなら ISBN ベースの multi-source、最後に通常検索の順で試す。
  // すべて失敗したら手動アップロードを案内する。
  const refreshCoverFor = async (book) => {
    if (!book) return;
    if (coverBusyId) return; // 二重起動防止
    setCoverBusyId(book.id);
    // ★ 即時フィードバック — これが無いと数秒の無反応で「動いていない」に見える。
    const busyToastId = toast.show({
      type: 'info',
      message: '🔄 表紙を取得しています…',
      duration: 15000,
    });
    try {
      let coverUrl = '';
      let coverIsbn = '';

      let learnedIsbn = '';
      // ── ステップ 1: サーバー（楽天・NDL・openBD・Google）→ 端末の Google → ISBN の候補 ─────
      //    自動の再取得と同じ順番（coverAutoRetry.resolveCoverForBook）。本の ISBN の表紙が先。
      //    「見つからない」を覚えていても、ここではいつも探す。
      try {
        const r = await resolveCoverForBook(book);
        if (r.url) {
          coverUrl = r.url;
          coverIsbn = r.coverIsbn || '';
          learnedIsbn = r.isbn || '';
        }
      } catch { /* 次の手段へ */ }

      // ── ステップ 2: 最後の手段として通常検索のヒットの cover。
      // ⚠️ タイトル一致を必須にする。以前は「表紙を持つ先頭ヒット」を無条件採用
      //    しており、同著者の別の本（兄弟本）の表紙を掴む誤マッチの発生源だった。
      //    誤った表紙より「表紙なし → 手動アップロード案内」を選ぶ。
      if (!coverUrl) {
        const flat = await searchBooksAPIFlat(`${book.title || ''} ${book.author || ''}`.trim());
        const normT = (s) => (s || '').normalize('NFKC').replace(/[\s　・･,，、.。:：!！?？「」『』\-―ー（）()]/g, '').toLowerCase();
        const want = normT(book.title);
        const hit = (flat || []).find((b) => {
          if (!b.cover) return false;
          if (!want) return true;
          const cand = normT(b.title);
          return cand && (cand.includes(want) || want.includes(cand));
        });
        if (hit?.cover) coverUrl = ensureHttps(hit.cover);
      }

      if (!coverUrl) {
        toast.dismiss?.(busyToastId);
        // 自動取得が完璧になることはあり得ない → 手動アップロードを促す。
        toast.show({
          type: 'info',
          message: '表紙が自動では見つかりませんでした。写真をアップロードできます。',
          duration: 6000,
          action: { label: 'アップロード', onClick: () => triggerManualCoverUpload(book) },
        });
        return;
      }
      // チェーン + 実行時点 rebase。表紙解決は最大 10 秒超かかるため、この間の
      // 並行編集（行動トグル / 読了化）をタップ時スナップショットで巻き戻さない。
      await enqueueBookMutation(book.id, async (entry) => {
        const base = entry.latest || booksRef.current.find((b) => b.id === book.id) || book;
        const updated = { ...base, cover: coverUrl, coverIsbn };
        // 本に ISBN が無く、書名から分かったら一緒に保存（同じ ISBN の本があれば付けない）。
        if (!base.isbn && learnedIsbn) updated.isbn = learnedIsbn;
        let saved;
        try {
          saved = await saveBook(updated);
        } catch (e) {
          if (updated.isbn === base.isbn || !isUniqueViolation(e)) throw e;
          updated.isbn = base.isbn || '';
          saved = await saveBook(updated);
        }
        if (saved) entry.latest = saved;
        const next = saved || updated;
        setCurrent((c) => (c && c.id === next.id ? next : c));
      });
      clearCoverNotFound(book);
      toast.dismiss?.(busyToastId);
      toast.success('表紙を更新しました。');
    } catch (e) {
      toast.dismiss?.(busyToastId);
      toast.error(toMessage(e, '表紙の取得に失敗しました'));
    } finally {
      setCoverBusyId(null);
    }
  };

  // CoverFixModal からの表紙差し替え（LIST / DETAIL 2 箇所の mount から共有）。
  // 楽観的 UI 更新 → チェーン + 実行時点 rebase で cover だけ差し替え（並行編集
  // の巻き戻し防止）。saveBook 失敗時は次の fetchBooks で元に戻り整合する。
  const handleCoverFixPick = async (book, { cover, coverIsbn }) => {
    if (!book) return;
    setCurrent((c) => (c && c.id === book.id ? { ...c, cover, coverIsbn } : c));
    try {
      await enqueueBookMutation(book.id, async (entry) => {
        const base = entry.latest || booksRef.current.find((b) => b.id === book.id) || book;
        const updated = { ...base, cover, coverIsbn };
        const saved = await saveBook(updated);
        if (saved) entry.latest = saved;
        const next = saved || updated;
        setCurrent((c) => (c && c.id === next.id ? next : c));
      });
      toast.success('表紙を更新しました。');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[cover-modal] DB update failed:', error);
      toast.error(toMessage(error, '表紙の更新に失敗しました。'));
    }
  };

  // From AddBookModal → 手動入力. Skip the search step entirely.
  const openManualFromAdd = (seed, query = '') => {
    setAddBookModalOpen(false);
    setAddFromSearchQuery(query || '');
    // 検索モーダルに入力済みのタイトル・著者・ISBN を引き継ぐ。
    // 「このまま手動で追加する」の文言どおり、打ち直しをさせない。
    setForm({
      ...emptyBook(),
      // オンボーディング「いま読んでいる本を追加する」経由なら手動パスでも
      // 「読書中」プリセットを効かせる（検索パス pickBookFromAdd と同じ扱い）。
      ...(addStatusPresetRef.current ? { status: addStatusPresetRef.current } : {}),
      id: Date.now().toString(),
      addedVia: 'manual',
      title: seed?.title || '',
      author: seed?.author || '',
      isbn: seed?.isbn || '',
      // AI 選書の確認の「手動で入力する」から来たときは、読書準備も引き継ぐ（2026-10-04）。
      ...(seed?.setup || (addOrigin === 'advisor' && advisorSetupRef.current) || {}),
    });
    setCurrent(null);
    setView('edit');
  };
  // 編集画面でどの Phase を描画するかを上書きする state。null なら
  // form.status が支配するが、たとえば status='reading' の本で読書計画
  // を仕切り直したい時 (= openSetup) は 'before' を入れて BeforePhase を
  // 強制レンダリングする。Phase の上書きは UI の見た目だけの話で、
  // form.status はそのまま保持され saveBook で正しい status が永続化される。
  const [editPhaseOverride, setEditPhaseOverride] = useState(null);

  // 本棚カードに渡る安定参照 (memo 化したカードの再 render 抑止用)。
  // setCurrent / setEditPhaseOverride / setView は安定なので deps は空でよい。
  // 本の id（文字列）でも受ける（相談の答えの「根拠の本」は id を渡してくる）。
  // 本のオブジェクトでないもの・見つからない id は開かない（空の詳細画面から空の本が保存される事故の防止）。
  // focusMemoId: そのメモまで送って少し示す（振り返りのメモの検索から開いたとき・2026-09-29）。
  // AI 選書で追加したときの「『書名』を「読みたい」に追加しました／開く」の知らせ（{ bookId, toastId }）。
  // その本を開いたら（知らせの「開く」でも、カードの「追加済み・開く」でも）もう要らないので消す（2026-09-29）。
  const advisorAddedToastRef = useRef(null);
  const dismissToast = toast.dismiss;
  const openDetail = useCallback((b, focusMemoId, opts) => {
    const book = typeof b === 'string' ? booksRef.current.find((x) => x.id === b) : b;
    if (!book || typeof book !== 'object' || !book.id) return;
    const added = advisorAddedToastRef.current;
    if (added && added.bookId === book.id) {
      advisorAddedToastRef.current = null;
      dismissToast(added.toastId, { byUser: true });
    }
    setDetailFocusMemoId(typeof focusMemoId === 'string' ? focusMemoId : null);
    setDetailEditMemoId(typeof focusMemoId === 'string' && opts?.edit ? focusMemoId : null);
    setCurrent(book); setEditPhaseOverride(null); setView("detail");
  }, [dismissToast]);
  // 🔗 つながるメモ・メモが答える相談の行を押したとき（lib/openMemo.js）: その本を開いて、そのメモまで送って示す。
  useEffect(() => {
    const onOpenMemo = (e) => {
      const { bookId, memoId } = e.detail || {};
      if (bookId) openDetail(bookId, memoId || undefined);
    };
    window.addEventListener(OPEN_MEMO_EVENT, onOpenMemo);
    return () => window.removeEventListener(OPEN_MEMO_EVENT, onOpenMemo);
  }, [openDetail]);

  useEffect(() => {
    if (!pendingMemoBookId) return;
    const b = books.find((x) => x.id === pendingMemoBookId);
    if (!b) return;
    setPendingMemoBookId(null);
    setTab('books');
    openDetail(b);
    setQuickMemoOpen(true);
  }, [pendingMemoBookId, books, openDetail]);

  // 想起ディープリンクの解決: books 読込が済んだら、対象メモの本を直接開く
  // （HomeRecall カードと同じ着地）。本が特定できない時のみ 💭ノートへ退避。
  useEffect(() => {
    if (!pendingRecallMemoId || booksLoading) return undefined;
    let cancelled = false;
    (async () => {
      let opened = false;
      try {
        // 合成ノート id（push-cron のまとめメモは `summary-<bookId>`。他の合成系も
        // `<prefix>-<bookId>`）は book_memos.id(UUID 列)で検索できず invalid-uuid で
        // 弾かれ、常に💭ノートへ退避していた。prefix を剥がして bookId を直接開く。
        const { memoId, bookId } = pendingRecallMemoId;
        const synthMatch = memoId ? /^(summary|leverage_memo|ai_summary|roi_summary|invest_purpose|current_challenge|hypothesis|ref)-(.+)$/.exec(memoId) : null;
        // 本とメモが分かる（2026-10-10 からの通知）→ その本を開いて、そのメモまで送る。
        if (bookId) {
          const b = rawBooks.find((x) => x.id === bookId);
          if (b && !cancelled) { openDetail(b, memoId && !synthMatch ? memoId : undefined); setTab('books'); opened = true; }
        } else if (synthMatch) {
          const b = rawBooks.find((x) => x.id === synthMatch[2]);
          if (b && !cancelled) { openDetail(b); setTab('books'); opened = true; }
        } else if (memoId && supabaseClient) {
          const { data } = await supabaseClient
            .from('book_memos')
            .select('book_id')
            .eq('id', memoId)
            .maybeSingle();
          const bId = data?.book_id;
          const b = bId && rawBooks.find((x) => x.id === bId);
          if (b && !cancelled) { openDetail(b, memoId); setTab('books'); opened = true; }
        }
      } catch { /* fall through to review */ }
      if (!cancelled && !opened) {
        setReviewSubTab('note'); setTab('review'); setView('list'); setCurrent(null);
      }
      if (!cancelled) setPendingRecallMemoId(null);
    })();
    return () => { cancelled = true; };
  }, [pendingRecallMemoId, booksLoading, rawBooks, openDetail]);

  // 🔁 リロード後（books 読込完了）に一度だけ、離脱直前に開いていた本の詳細へ復帰。
  // タブは 'activeTab'、サブタブは resumeNav の初期値で復元済み。詳細/編集だった
  // 時のみ、その本を開き直す（編集は未保存フォームが失われているので detail に
  // 着地させる）。本が削除済みなら何もしない（一覧のまま）。想起ディープリンク
  // 処理中はそちらに譲る。60 分超の再起動は resumeNav=null で通常起動。
  useEffect(() => {
    if (navRestoredRef.current || booksLoading) return;
    navRestoredRef.current = true;
    if (pendingRecallMemoId || pushNavRef.current) return;
    const nav = resumeNav;
    if (nav && (nav.view === 'detail' || nav.view === 'edit') && nav.bookId) {
      // ユーザーが復元より先に自分で画面を動かしていたら邪魔しない。
      if (viewRef.current !== 'list') return;
      const b = rawBooks.find((x) => x.id === nav.bookId);
      if (b) openDetail(b);
    }
  }, [booksLoading, pendingRecallMemoId, rawBooks, openDetail, resumeNav]);

  // 本棚カードの long-press から context menu を開く安定参照。payload には
  // long-press フックが {x, y, book} を載せてくるのでそのまま state へ。
  const handleBookLongPress = useCallback((payload) => setBookContextMenu(payload), []);

  // 本詳細でフェーズ (status) が切り替わった時 + 本/view 切り替え時に
  // detail コンテナをスクロールトップへ戻す。これがないと「読書前」で
  // 下までスクロールした状態のまま「読書中」UI が表示され、画面が下から
  // 始まる症状になる。
  // 例外: 同じ本を「読了にする」で読書中 → 読了にしたときは、その場に留まる（画面は同じ形のまま・押した場所に
  //   「読了を写真で共有」を出すため。先頭へ戻すと、出したボタンが画面の外になっていた・2026-10-04）。
  const prevDetailStatusRef = useRef({ view, id: current?.id, status: current?.status });
  useEffect(() => {
    const prev = prevDetailStatusRef.current;
    prevDetailStatusRef.current = { view, id: current?.id, status: current?.status };
    if (view !== 'detail') return;
    if (prev.view === 'detail' && prev.id === current?.id && prev.status === 'reading' && current?.status === 'done') return;
    if (detailScrollRef.current) {
      try { detailScrollRef.current.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* ignore */ }
    }
  }, [view, current?.id, current?.status]);
  // 投資目的が空 + AI 選書のソースクエリがある時は、UI を開く瞬間に
  // 投資目的にプレフィルする。バナー (BeforePhase) 側で「AI 選書から
  // 引き継ぎました」のヒントを出す。これでユーザーは同じ課題を 2 回
  // 入力する必要がなくなる。
  const buildFormFromBook = (b) => ({
    ...emptyBook(),
    ...b,
    tags: b.tags || [],
    actions: b.actions || [],
    investPurpose:
      b.investPurpose && b.investPurpose.trim()
        ? b.investPurpose
        : (b.sourceQuery || ''),
  });
  const openEdit = (b) => { setForm(buildFormFromBook(b)); setCurrent(b); setEditPhaseOverride(null); setView("edit"); };
  // 読書中 (or それ以降) の本で読書計画を完了させたい時用。phase を
  // 'before' にして読書計画 UI を呼び出すが、form.status は維持。
  const openSetup = (b) => {
    setForm(buildFormFromBook(b));
    setCurrent(b);
    setEditPhaseOverride('before');
    setView('edit');
  };
  // quickMemoOpen / fullEditorPrefill もリセットする — edge-swipe back や BottomNav
  // は QuickMemoSheet の onClose を経由しないため、開いたまま一覧へ戻ると次に
  // 開いた別の本の詳細でシートが勝手に開いてしまう。
  const goList = () => { setJustDoneId(null); setView("list"); setCurrent(null); setEditPhaseOverride(null); setQuickMemoOpen(false); setFullEditorPrefill(null); setDetailKebab(null); setStoreSheetOpen(false); setAnalysisSheetOpen(false); setDetailFromSearchId(null); setJustMadePlanId(null); };
  // 本の詳細から 1 段戻る: 検索結果の「追加済み」から開いた本なら、さっきの検索結果へ戻す（2026-09-29）。
  const leaveDetail = () => {
    const toSearch = !!detailFromSearchId && current?.id === detailFromSearchId;
    goList();
    if (toSearch) setAddBookModalOpen(true);
  };
  const detailBackToSearch = !!detailFromSearchId && current?.id === detailFromSearchId;
  // 新しく本を追加するフォームから 1 段戻る: 検索から来たら検索へ（さっきの言葉のまま）、それ以外は一覧へ。
  const leaveNewBookForm = () => {
    const fromSearch = addFromSearchQuery !== null;
    goList();
    if (fromSearch) setAddBookModalOpen(true);
  };
  const newBookBackLabel = addFromSearchQuery !== null ? '検索' : (addOrigin === 'home' ? 'ホーム' : addOrigin === 'advisor' ? 'AI 選書' : 'すべての本');

  // 同じ本が既に本棚にあれば true を返す。ダイアログを出して「📖 既存の本を見る」
  // が押されたらその詳細へジャンプ。呼び出し側はこの戻り値が true なら追加処理
  // をスキップする。
  // allowAdd: 手で入力した本の保存（検索で「追加済み」と出た本を手動で入れ直す等）では、
  // 「開く」か「それでも追加」かを選ばせる（版違いなど別の本として残したいこともある・2026-09-29）。
  const handleDuplicateGate = async (candidate, { allowAdd = false } = {}) => {
    const existing = findDuplicateBook(books, candidate);
    if (!existing) return false;
    const statusLabel = STATUS_LABEL[existing.status] || '本棚';
    if (allowAdd) {
      const openIt = await confirm({
        title: 'この本はもう本棚にあります',
        message: `『${existing.title}』（${statusLabel}）を開きますか？開くと、いま入力した内容は保存されません。`,
        confirmLabel: '開く',
        cancelLabel: 'それでも追加',
        // 外側のタップ / Esc は「やめる」＝追加もせず、入力フォームに戻る（2026-09-29）。
        dismissValue: null,
      });
      if (openIt === null) return true;
      if (openIt) { openDetail(existing); return true; }
      return false;
    }
    // ボタンは「押したら何が起きるか」を正確に言う（既存本を開くと今の入力は
    // 保存されない。旧: 「📖 既存の本を見る / ← 戻る」で入力破棄が伝わらなかった）。
    const ok = await confirm({
      title: 'この本はもう本棚にあります',
      message: `『${existing.title}』は「${statusLabel}」として登録済みです。既存の本を開くと、いま入力中の内容は保存されません。`,
      confirmLabel: '既存の本を開く',
      cancelLabel: 'このまま編集を続ける',
    });
    if (ok) openDetail(existing);
    return true;
  };

  const savingRef = useRef(false);
  // 押した瞬間から「保存中…」を出す（重複の確認・表紙の解決で待つ間も、押せたことが分かる・
  // 薄くしない＝DESIGN §5「押せないボタン」）。
  const [savingBook, setSavingBook] = useState(false);
  // opts.startReading: 積読の読書計画の編集で「保存して読書を開始」を押したときだけ true（2026-10-09）。
  //   以前は得たいことがあれば「保存」がいつも読書中へ進めていた（仮説の例を足しに来ただけでも読書中になった）。
  //   onClick={handleSave} から呼ばれるとクリックの印が来るので、true のときだけ進める。
  const handleSave = async (opts) => {
    const startReading = !!(opts && opts.startReading === true);
    // 二重送信ガード。handleSave は表紙解決(findIsbnCandidates/resolveCover)+saveBook の
    // 複数 await を含むため、連打すると新規本が二重作成されうる。
    if (savingRef.current) return;
    if (!form.title.trim()) {
      toast.error(fieldRequiredMessage('書名'));
      return;
    }
    savingRef.current = true;
    setSavingBook(true);
    // 新規追加 (current=null) の時のみ重複チェック。既存本の編集は同じ本を
    // 自分自身とマッチさせてしまうので除外。
    if (!current) {
      let dup = false;
      try { dup = await handleDuplicateGate({ isbn: form.isbn, title: form.title, author: form.author }, { allowAdd: true }); } catch { dup = false; }
      if (dup) { savingRef.current = false; setSavingBook(false); return; }
    }
    try {
      const normalizedTags = Array.from(
        new Set(
          (form.tags || [])
            .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
            .filter(Boolean)
        )
      );

      // 表紙未確定の本については、ここで必ず resolveCoverForBook（サーバー → 端末）
      // を通す。検索結果から渡ってきた未検証の URL や、async resolve が
      // 完了する前にユーザーが保存したケースを救済する。
      // 'manual' は手動アップロード済み / 'removed' はユーザーが意図的に
      // 削除した印 → どちらも触らない（保存のたびに削除した表紙が復活
      // してしまうため）。
      let resolvedCover = form.cover;
      let resolvedCoverIsbn = form.coverIsbn;
      let resolvingToastId = null;
      if (!resolvedCover && form.coverIsbn !== 'manual' && form.coverIsbn !== 'removed' && (form.title || form.isbn)) {
        // 表紙解決は複数のネットワーク往復（最大数十秒）になり得る。無反応だと
        // 保存失敗と誤認して離脱するため、その場でフィードバックを出す。
        resolvingToastId = toast.show({ type: 'info', message: '💾 保存しています…', duration: 30000 });
        try {
          // サーバー（楽天・NDL・openBD）→ 端末の順で探す（以前は端末だけで、NDL の CORS・
          // Google の 429 で取りこぼしていた）。保存を長く待たせないよう 8 秒で打ち切り、
          // 間に合わなければ保存のあと裏で探す（resolveCoverInBackground）。
          const r = await Promise.race([
            resolveCoverForBook({ title: form.title, author: form.author, isbn: form.isbn }),
            new Promise((res) => { setTimeout(() => res({ url: '', outcome: 'transient' }), 8000); }),
          ]);
          if (r.url) {
            resolvedCover = r.url;
            resolvedCoverIsbn = r.coverIsbn || '';
          } else {
            resolvedCover = '';
            resolvedCoverIsbn = '';
            if (r.outcome === 'not_found') {
              toast.show({
                type: 'info',
                message: '表紙が見つかりませんでした。写真をアップロードできます。',
                duration: 4000,
              });
            }
          }
        } catch { /* 解決失敗時は元の form 値で保存続行 */ }
        finally {
          if (resolvingToastId) { try { toast.dismiss(resolvingToastId); } catch { /* ignore */ } }
        }
      }

      // 「保存して読書を開始する」相当の自動遷移条件:
      //   既存本 + form.status='before' + 投資目的 が揃っている。
      // AI 解析/計画シートは任意の補助であり条件に含めない（AI 不使用・月次上限・
      // オフラインのユーザーも読書を開始できる。「目的なき読書はしない」は
      // 投資目的の必須化で守る）。
      // 保存時に payload.status='reading' に上書き + startDate=今日にする。
      // form.status を見ているのは: editPhaseOverride で BeforePhase を強制
      // 表示しているだけの reading/done 本は対象外にしたいため (既に読書中の
      // 本の読書計画を編集しても再度 reading に戻るのは無意味)。
      // current.status も 'before' であることを要求する: 編集開始時点で既に積読
      // だった本だけが対象。「読みたい」の本を編集中にステータスチップで積読へ
      // 変えただけ（ユーザーの意図は『積読にする』であって『読書開始』ではない）
      // のケースで、過去に入力済みの投資目的が残っていると意図せず読書中へ
      // 自動昇格してしまうのを防ぐ。
      const isSetupCompletion = startReading && !!current
        && current.status === 'before'
        && form.status === 'before'
        && !!(form.investPurpose && form.investPurpose.trim());

      // 保存直前に「実行時点の最新 form」を読む（表紙解決の長い await 中に
      // →行動にする / 行動トグルが syncActionSnapshots で form を進めていても
      // 巻き戻さない）。既存本は直列化チェーンに乗せ、並行 saveBook との
      // 順序不定な競合（後勝ち上書き）も防ぐ。
      const buildPayload = () => {
        const liveForm = (formRef.current && formRef.current.id === form.id) ? formRef.current : form;
        const p = { ...liveForm, tags: normalizedTags, cover: resolvedCover, coverIsbn: resolvedCoverIsbn };
        if (isSetupCompletion) {
          p.status = 'reading';
          if (!p.startDate) {
            p.startDate = todayLocal();
          }
        }
        return p;
      };
      let saved = null;
      let payload = null;
      if (current?.id) {
        await enqueueBookMutation(current.id, async (entry) => {
          payload = buildPayload();
          saved = await saveBook(payload);
          if (saved) entry.latest = saved;
        });
      } else {
        payload = buildPayload();
        saved = await saveBook(payload);
      }
      const next = saved || payload;
      // 🏷 分野: 本人が選んだ本は、これから自動で付け直さない。自動で選んだまま追加した本は、どこまで見て決めたかを覚える。
      if (saved?.id && user?.id) {
        if (form.fieldsTouched) markFieldStage(user.id, saved.id, 'user');
        else if (!current) markFieldStage(user.id, saved.id, form.fieldsAutoStage || 'title');
      }
      // 保存の前に表紙が間に合わなかった（時間切れ・通信の失敗）本は、裏で探し続ける。
      if (saved && !saved.cover) resolveCoverInBackground(saved);
      const wasNew = !current; // 新規追加 (current=null) かどうか
      // 📊 本追加の計測（DB 保存が確定した新規追加時のみ・経路は addedVia の enum だけ）。
      // saveBook は未接続時に throw せず null を返すので、saved が truthy の時だけ計測する
      // （未保存の payload を「追加した」と数えない）。
      if (saved && wasNew) {
        // 登録したばかりの本にメモは無い: 本の詳細のメモ欄を、読み込み中から「0 件」の形で出す（跳ねないように）。
        if (saved.id) appCache?.setMemoCountHint?.(saved.id, 0);
        const via = next.addedVia === 'manual' ? 'manual'
          : next.addedVia === 'search' ? 'search'
          : 'manual';
        track('book_added', { via });
      }
      // ⚠️ 表紙解決を含む保存は最大数十秒かかり、その間にユーザーは「‹ 戻る」や
      // 下部ナビ（破棄確認つき）で別の画面・別の本へ移動できる。ここで無条件に
      // setCurrent/setForm/setView すると、(a) 振り返りタブ等を見ているユーザーを
      // 突然この本の詳細へハイジャックする、(b) 別の本を閲覧/編集中なら画面の中身が
      // 保存した本にすり替わる。「この本の編集画面に留まっている」ときだけ
      // フル遷移し、それ以外は閲覧中の同じ本の詳細だけ静かに最新化する
      // （advanceStatus の rollback ガードと同じ思想）。
      // 比較は「保存後の id (next.id)」ではなく「クリック時点の form.id」と行う。
      // 新規追加では next.id が DB 発行の UUID になり form のローカル id と一致しない
      // ため、next.id と比較すると新規本が常に「編集画面を離れた」扱いになって
      // 詳細への遷移・クイックメモ自動オープンが一切走らなくなる。
      const stillEditingThis =
        viewRef.current === 'edit' && formRef.current && formRef.current.id === form.id;
      if (!stillEditingThis) {
        setCurrent((c) => (c && c.id === next.id ? next : c));
        toast.success('保存しました。');
        return;
      }

      setCurrent(next);
      setForm({ ...emptyBook(), ...next, tags: next.tags || [], actions: next.actions || [] });

      // 遷移ロジック:
      //   - 読書計画完了 → 読書中フェーズの本詳細へ
      //   - 新規追加 → 詳細へ
      //   - それ以外 (既存本の編集中) → 編集画面に留まる
      if (isSetupCompletion) {
        setEditPhaseOverride(null);
        setView('detail');
        dismissStatusUndo(next.id);
        toast.success('📚 読書を開始しました！');
      } else if (wasNew) {
        setView('detail');
        // ボタンラベル「保存してメモを書く」（読書中/読了で新規保存）に挙動を一致させ、
        // 最初のメモ（aha #1）への迷いを消す — 詳細画面着地と同時にクイックメモを開く。
        if (payload.status === 'reading' || payload.status === 'done') {
          setQuickMemoOpen(true);
        }
        toast.success('保存しました。');
      } else {
        // 既存本の編集を保存したら本詳細へ戻す（フォームに留めて行き止まりにしない）。
        // form は current に同期済みなので、次の一歩（フェーズCTA）が見える。
        setView('detail');
        toast.success('保存しました。');
      }
    } catch (error) {
      // DB 側 UNIQUE 制約に弾かれた場合 (= UI チェックを抜けた競合状況) は
      // 専用メッセージで案内。それ以外は通常のエラー。
      if (isUniqueViolation(error)) {
        toast.error('この本はもう本棚にあります。');
      } else {
        toast.error(toMessage(error, '保存に失敗しました。もう一度お試しください。'));
      }
    } finally {
      savingRef.current = false;
      setSavingBook(false);
    }
  };

  const handleSaveSummaryFromForm = async (text) => {
    if (!form?.id) return;
    const bookId = form.id;
    // rollback 用に直前値を退避（advanceStatus と同じ楽観的 UI パターン）。
    // form は編集画面の「作業コピー」（未保存の行動編集を含み得る）なので、
    // ここでは books へ rebase せず form をそのまま保存する。ただし同一本への
    // 並行保存（行動トグル等）と交錯しないよう直列化チェーンには乗せる。
    const prevForm = form;
    const prevCurrent = current;
    await enqueueBookMutation(bookId, async (entry) => {
      // 実行時点の最新 form を使う（クリック後〜実行までにチェーンの先行タスク
      // （→行動にする等）が syncActionSnapshots で form を進めた分を失わない）。
      const liveForm = (formRef.current && formRef.current.id === bookId) ? formRef.current : prevForm;
      const merged = { ...liveForm, leverageMemo: text };
      try {
        const saved = await saveBook(merged);
        // saveBook は未接続時に throw せず null を返す。その場合 DB へ書けて
        // いないので、ローカル state を新値で確定すると「保存できたのにリロード
        // で巻き戻る」不整合になる。明示的に失敗として扱い rollback する。
        if (!saved) throw new Error('まとめメモを保存できませんでした。');
        entry.latest = saved;
        // 保存済みになったので、編集の「変更あり」の基準も進める（離れるときに破棄の確認を出さない）
        if (editBaselineRef.current != null) editBaselineRef.current = JSON.stringify({ ...(formRef.current || merged), leverageMemo: text });
        const next = saved;
        // 📊 まとめ式メモ保存の計測（保存成功時のみ・mode の enum だけ・本文は送らない）。
        // カード式の insert と粒度を揃えるため、空→記入の「新規作成」遷移だけ数える
        // （既存まとめの編集再保存では二重計上しない）。
        if (!(prevForm?.leverageMemo || '').trim() && (text || '').trim()) {
          track('memo_added', { mode: 'summary' });
        }
        setForm((f) => (f && f.id === next.id ? { ...f, leverageMemo: next.leverageMemo ?? text } : f));
        setCurrent((c) => (c && c.id === next.id ? next : c));
      } catch (error) {
        // 失敗時は leverageMemo だけ previous 値へ戻す（並行操作の結果は保持）。
        setForm((f) => (f && f.id === bookId ? { ...f, leverageMemo: prevForm?.leverageMemo } : f));
        setCurrent((c) => (c && c.id === bookId ? { ...c, leverageMemo: prevCurrent?.leverageMemo } : c));
        const msg = toMessage(error, 'まとめメモの保存に失敗しました。');
        toast.error(msg);
        throw new Error(msg);
      }
    });
  };

  const handleSaveSummaryFromCurrent = async (text) => {
    if (!current?.id) return;
    const bookId = current.id;
    // rollback 用に直前値を退避
    const prevCurrent = current;
    const prevForm = form;
    await enqueueBookMutation(bookId, async (entry) => {
      // ⚠️ current のスナップショットは古い可能性がある（詳細画面の行動トグルは
      // 直列化チェーン側で確定していく）。saveBook は「渡した actions に無い行を
      // DELETE」する差分同期なので、stale な current で全行保存するとトグル結果や
      // 繰り返し spawn 行が黙って巻き戻る。チェーンの latest / books の最新行に
      // rebase して leverageMemo だけ差し替える。
      const base = entry.latest || booksRef.current.find((b) => b.id === bookId) || prevCurrent;
      const merged = { ...base, leverageMemo: text };
      try {
        const saved = await saveBook(merged);
        if (!saved) throw new Error('まとめメモを保存できませんでした。');
        entry.latest = saved;
        const next = saved;
        // 📊 まとめ式メモ保存の計測（保存成功時のみ・mode の enum だけ・本文は送らない）。
        // カード式の insert と粒度を揃え、空→記入の「新規作成」遷移だけ数える。
        if (!(prevCurrent?.leverageMemo || '').trim() && (text || '').trim()) {
          track('memo_added', { mode: 'summary' });
        }
        setCurrent((c) => (c && c.id === next.id ? next : c));
        setForm((f) => (f && f.id === next.id ? { ...f, leverageMemo: next.leverageMemo ?? text, actions: next.actions } : f));
      } catch (error) {
        // 失敗時は leverageMemo だけ previous 値へ戻す（並行操作の結果は保持）。
        setCurrent((c) => (c && c.id === bookId ? { ...c, leverageMemo: prevCurrent?.leverageMemo } : c));
        setForm((f) => (f && f.id === bookId ? { ...f, leverageMemo: prevForm?.leverageMemo } : f));
        const msg = toMessage(error, 'まとめメモの保存に失敗しました。');
        toast.error(msg);
        throw new Error(msg);
      }
    });
  };

  // Inner delete flow: snapshot, fire delete, show Undo toast. Used by both
  // the kebab "削除" button (with confirm) and the swipe-delete gesture
  // (which is already an explicit user intent, no confirm).
  const performBookDelete = async (book, { fromList = false, undo = true } = {}) => {
    const snapshot = await captureBookSnapshot(book.id);
    if (!snapshot) {
      toast.error('本のデータを取得できませんでした。削除を中止します。');
      return;
    }
    dismissStatusUndo(book.id);
    // 同じ本の保存（行動の切り替え・表紙など）と同じ順番待ちに並べる（保存の途中で消して、消した本を書き戻さない）。
    const deletionPromise = enqueueBookMutation(book.id, () => deleteBook(book.id)).catch((error) => {
      toast.error(toMessage(error, '削除に失敗しました。'));
      throw error;
    });
    if (!fromList) goList();
    haptic.medium();
    // メモの写真ファイル（非公開の保存場所）も、戻せなくなった時点で消す（本を消しても写真が残る漏れの防止）。
    const photoPaths = (snapshot.book_memos || []).map((m) => m.photo_path).filter(Boolean);
    const removePhotos = () => {
      if (!photoPaths.length) return;
      deletionPromise
        .then(() => supabaseClient.storage.from('book-memo-photos').remove(photoPaths))
        .catch(() => { /* 写真の掃除に失敗しても本の削除は済んでいる */ });
    };

    // undo=false は取消トーストを出さない経路（現在は未使用）。確認ダイアログ経由でも
    // メモ・行動ごと消えるので、スワイプ削除と同じく 5 秒の「元に戻す」を出す（2026-09-27）。
    if (!undo) {
      deletionPromise.catch(() => {});
      removePhotos();
      return;
    }

    // 消せなかったときは「元に戻す」を出さない（消えていない本を「削除」と知らせない・知らせは上の失敗だけ）。
    try { await deletionPromise; } catch { return; }

    // 本の削除→Undo では Storage の写真ファイルを消していないため、
    // photo_path ごと完全復元される（旧「※写真は復元できません」は誤案内だった）。
    toast.undo({
      // 書名は知らせの中で … で切って 1 行に（quote・DESIGN §5「ボタンと並ぶ知らせは 1 行」）。
      // 「元に戻す」と × が並ぶと文に使えるのは 390 幅で 11 字ほど。「を削除しました。」まで書くと書名が 2〜3 字しか見えないので「を削除」で止める。
      quote: book.title,
      message: 'を削除',
      destructive: true,
      // 取り消されずに閉じたら、写真ファイルも消す（取り消し中は写真ごと戻せるよう残しておく）
      onExpire: removePhotos,
      onUndo: async () => {
        try {
          await deletionPromise.catch(() => {});
          const result = await restoreBookFromSnapshot(snapshot);
          // 本体は復元できたが、添付データ (タグ/行動/メモ) の一部が
          // INSERT に失敗した場合は「取り消しました」と誤って伝えない。
          if (result?.failed && result.failed.length > 0) {
            toast.error(
              `本は復元しましたが、${result.failed.join('・')}の一部を復元できませんでした。`,
            );
          } else {
            toast.info('削除を取り消しました。');
          }
        } catch (error) {
          toast.error(toMessage(error, '復元に失敗しました。'));
        }
      },
    });
  };

  // Tap-driven delete (kebab / detail view "削除" button) — confirm dialog first.
  const requestDeleteBook = async (book) => {
    if (!book) return;
    const ok = await confirm({
      title: 'この本を削除しますか？',
      message: `『${book.title}』のメモ（写真を含む）と行動も、いっしょに削除されます。\n削除した直後なら「元に戻す」で戻せます。`,
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    await performBookDelete(book);
  };

  // Swipe-driven delete from the list — gesture itself counts as confirmation.
  // 本棚カード (memo 化済み) に安定参照で渡すため useCallback + ref。
  // performBookDelete は毎 render 再生成されるので、最新版を ref 経由で呼び、
  // stale closure を避けつつ参照を安定化する (挙動は従来と同一)。
  const performBookDeleteRef = useRef(performBookDelete);
  performBookDeleteRef.current = performBookDelete;
  const swipeDeleteBook = useCallback((book) => {
    if (!book) return;
    performBookDeleteRef.current(book, { fromList: true });
  }, []);

  const handleBookSelect = (b) => {
    setSearchOpen(false);
    setSearchInitialQuery('');
    setSearchInitialAuthor('');
    setSearchInitialIsbn('');
    // A successful pick from BookSearchModal always implies the search path,
    // even if the user manually opened the modal from inside an existing form.
    setForm((f) => ({
      ...f,
      title: b.title || f.title,
      author: b.author || f.author,
      cover: b.cover || f.cover,
      totalPages: b.pages || f.totalPages,
      addedVia: 'search',
      // Capture ISBN so Amazon Associate links can hit the product page.
      isbn: b.isbn || f.isbn,
    }));
  };

  // BookAdvisor から呼ばれる本追加。第 2 引数は AI 構造化要約の結果を含む
  // 拡張ペイロード。後方互換性のため string も受け付け、その場合は
  // sourceQuery のみセット (ユーザーは投資目的だけを引き継ぐ旧挙動)。
  // 📚 初日クイックスタートから本を 1 冊保存する（状態は読了・表紙は裏で解決）。
  // 重複チェックは PastBooksQuickstart 側（既存本には一言だけ足す）。
  const saveQuickstartBook = async (b) => {
    const isbn = b.isbn ? String(b.isbn).replace(/[-\s]/g, '') : '';
    const saved = await saveBook({
      ...emptyBook(),
      title: b.title,
      author: b.author || '',
      isbn,
      cover: b.cover || '',
      coverIsbn: b.cover && isbn ? isbn : '',
      totalPages: b.pages || 0,
      status: 'done',
      addedVia: b.manual ? 'manual' : 'search',
    });
    if (saved) {
      track('book_added', { via: 'quickstart' });
      resolveCoverInBackground(saved);
    }
    return saved;
  };

  // 🔎 振り返り › メモを、検索欄に言葉を入れて開く（トークンを使い切った相談の「メモを検索して探す」・2026-09-29）。
  //   AI を使わずに、自分のメモから手がかりを探せるように。検索欄は画面のいちばん上なので先頭から見せる。
  const openMemoSearch = (query, opts = {}) => {
    setMemoSearchPreset({ query: String(query || '').slice(0, 100), tag: opts.tag ? String(opts.tag) : '', from: opts.from || null, nonce: Date.now() });
    savedTabScroll.current[scrollKeyFor('review', 'note')] = 0;
    setView('list');
    setReviewSubTab('note');
    setTab('review');
  };
  // 🏷 記録の「分野」の「この分野の本を探す」: AI 選書の最初の悩みに入れて開く（送らない）。
  const openAdvisorWithDraft = (text) => {
    setAdvisorDraft({ text: String(text || '').slice(0, 200), nonce: Date.now() });
    setView('list');
    setAiSubTab('advisor');
    setTab('ai');
  };

  // 📥 取り込みの確かめる画面の数え方用: 本棚の本にもうあるメモの本文（本の id → 本文の Set・2026-09-29）。
  //   取り込み（下の importLibrary）は book_id＋本文が同じメモを足さないので、確かめる画面でも数えない。
  //   読めなければ null（確かめる画面は足すメモを全部数える＝今までどおり）。
  const loadImportMemoTexts = async (bookIds) => {
    const ids = [...new Set((bookIds || []).filter(Boolean))];
    const map = new Map(ids.map((id) => [id, new Set()]));
    if (!ids.length) return map;
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        for (let from = 0; ; from += 1000) {
          // eslint-disable-next-line no-await-in-loop
          const { data, error } = await supabaseClient.from('book_memos').select('book_id, text')
            .in('book_id', chunk).order('id', { ascending: true }).range(from, from + 999);
          if (error) throw error;
          (data || []).forEach((m) => map.get(m.book_id)?.add((m.text || '').trim()));
          if (!data || data.length < 1000) break;
        }
      }
      return map;
    } catch (e) {
      console.warn('[import] memo texts load failed:', e?.message || e);
      return null;
    }
  };

  // 📥 ほかのアプリ（ブクログ・読書メーター・Kindle）から取り込む（ImportSheet → ここで保存）。
  //   本: 本棚に同じ本があればそこに足す・無ければ追加（状態・評価・読了日・タグ・レビューはまとめへ）。
  //   メモ: 元の日付を残す（「いちばん古いのは ◯ か月前」や相談の歩みに効く）。同じ本の同じ文は足さない
  //         （同じファイルを 2 回取り込んでも二重にならない）。AI は使わない。
  const importLibrary = async (result, onProgress) => {
    let reviewsAdded = 0;
    const items = Array.isArray(result?.books) ? result.books : [];
    let booksAdded = 0;
    let booksMatched = 0;
    // 保存できなかった新しい本の数（完了の画面で「N 冊は取り込めませんでした」と伝える・黙って減らさない・2026-10-04）。
    let booksFailed = 0;
    const pending = []; // { bookId, memos }
    const newBooks = [];
    const noReviewIds = new Set(); // 感想・レビューの無い新しい本（メモも無ければ「覚えている一言を足す」の候補）
    const srcDoneDate = new Map(); // もとからあった本 → 取り込み元の読了日
    for (let i = 0; i < items.length; i += 1) {
      const b = items[i];
      onProgress?.(i, items.length);
      const isbn = String(b.isbn || '').replace(/[^0-9Xx]/g, '');
      // 副題の有無・訳者の並びの違いでも同じ本とみなす（取り込みだけ・確かめる画面の planImport と同じ）。
      let target = findImportDuplicate(booksRef.current, { title: b.title, author: b.author, isbn });
      const memos = [...(b.memos || [])];
      if (target) {
        booksMatched += 1;
        if (b.doneDate) srcDoneDate.set(target.id, b.doneDate);
        // レビューは初回の取り込みで「まとめ」に入る。同じレビューをもう一度カードにしない。
        if (b.review && String(b.review).trim() !== String(target.leverageMemo || '').trim()) {
          memos.push({ text: b.review, page: null, createdAt: b.reviewAt || null }); // 読書メーターは感想の日付（読了日）
        }
      } else {
        try {
          // eslint-disable-next-line no-await-in-loop
          target = await saveBook({
            ...emptyBook(),
            title: String(b.title || '').slice(0, LIMITS.bookTitle || 200),
            author: String(b.author || '').slice(0, 200),
            isbn,
            asin: String(b.asin || '').slice(0, 20), // 読書メーター: Kindle 版など ISBN の無い本の Amazon リンク用
            totalPages: Number(b.pages) || 0,
            status: ['want', 'before', 'reading', 'done'].includes(b.status) ? b.status : 'done',
            rating: Number(b.rating) || 0,
            doneDate: b.doneDate || '',
            // 取り込んだタグ（ブクログの本棚など）: 分野に結びつくものは分野に、ほかは同じ名前のフォルダへ（2026-10-11）。
            //   分野が 1 つも無い本は書名から選ぶ。
            ...(() => {
              const { fields, folders } = splitLegacyTags(Array.isArray(b.tags) ? b.tags : []);
              return { tags: fields.length ? fields : classifyBook({ title: b.title }), collections: folders };
            })(),
            leverageMemo: b.review || '',
            addedVia: isbn ? 'search' : 'manual',
          });
          if (target) { booksAdded += 1; newBooks.push(target); if (b.review) reviewsAdded += 1; else noReviewIds.add(target.id); }
        } catch (e) {
          console.warn('[import] book save failed:', e?.message || e);
          booksFailed += 1;
          target = null;
        }
      }
      if (target?.id && memos.length) pending.push({ bookId: target.id, memos });
    }
    onProgress?.(items.length, items.length);

    // 既にあるメモの本文（同じ本の同じ文は足さない）
    let memosAdded = 0;
    const createdMemoIds = []; // 「取り込みを取り消す」で消すのは、この取り込みで入れたメモだけ
    const ids = [...new Set(pending.map((p) => p.bookId))];
    const existing = new Set();
    // 1 回の問い合わせは 1,000 行までしか返らないので、ページを送って全部読む（読めなければ止める＝二重にしない）。
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      for (let from = 0; ; from += 1000) {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await supabaseClient.from('book_memos').select('book_id, text')
          .in('book_id', chunk).order('id', { ascending: true }).range(from, from + 999);
        if (error) throw error;
        (data || []).forEach((m) => existing.add(`${m.book_id}\u0000${(m.text || '').trim()}`));
        if (!data || data.length < 1000) break;
      }
    }
    const rows = [];
    for (const p of pending) {
      for (const m of p.memos) {
        const text = String(m.text || '').trim().slice(0, LIMITS.memoText || 2000);
        const key = `${p.bookId}\u0000${text}`;
        if (!text || existing.has(key)) continue;
        existing.add(key);
        const row = { user_id: user.id, book_id: p.bookId, text, page_number: Number.isFinite(m.page) ? m.page : null, tags: [], photo_path: null };
        if (m.createdAt && !Number.isNaN(Date.parse(m.createdAt))) row.created_at = new Date(m.createdAt).toISOString();
        rows.push(row);
      }
    }
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      // eslint-disable-next-line no-await-in-loop
      const { data: inserted, error } = await supabaseClient.from('book_memos').insert(chunk).select('id');
      if (error) throw error;
      memosAdded += chunk.length;
      (inserted || []).forEach((r) => { if (r?.id) createdMemoIds.push(r.id); });
    }
    // メモを足した「読みたい・積読」の本は読了にする（本の詳細はメモを読書中・読了でしか出さないため）
    //   （いま作った本は取り込み元の状態のまま。もとから本棚にあった本だけ）
    const newIds = new Set(newBooks.map((b) => b.id));
    const withMemo = new Set(rows.map((r) => r.book_id).filter((id) => !newIds.has(id)));
    const statusChanged = []; // 取り消すときに元の状態へ戻す
    for (const id of withMemo) {
      const bk = booksRef.current.find((b) => b.id === id);
      // 読了日が無いと「月別の読了」に出ないので、取り込み元の読了日（無ければ今日）を入れる。
      if (bk && (bk.status === 'want' || bk.status === 'before')) {
        statusChanged.push({ id, status: bk.status, doneDate: bk.doneDate || '' });
        applyBookPatchQuiet(id, { status: 'done', doneDate: bk.doneDate || srcDoneDate.get(id) || todayLocal() });
      }
    }
    invalidateKnowledgeCache();
    appCache?.notifyMemosChanged?.(); // ホームの相談カードの件数などを取り直させる
    refreshBooks();
    // 表紙は最初の 20 冊だけ裏で探す（残りは本棚に表示されたときに探す）
    newBooks.slice(0, 20).forEach((bk) => { try { resolveCoverInBackground(bk); } catch { /* 表紙は後で */ } });
    // 新しい本のレビューは「この本のまとめ」に入れたので、メモ（カード）とは分けて数えて伝える
    track('import_done', { source: result?.source || 'unknown', books: booksAdded, matched: booksMatched, memos: memosAdded, reviews: reviewsAdded });
    if (memosAdded + reviewsAdded > 0) markActivation('memo');
    // メモも「この本のまとめ」も無い新しい本（完了画面の「覚えている一言を足す（N 冊）」で一言を足せる）。
    const withRows = new Set(rows.map((r) => r.book_id));
    const bareBooks = newBooks.filter((bk) => noReviewIds.has(bk.id) && !withRows.has(bk.id));
    // 🌱 完了画面の「相談してみる」で入力欄に入れる相談の材料（メモか「この本のまとめ」が入った本・lib/firstDay.js）。
    const memoBookIds = [...new Set([...withRows, ...newBooks.filter((bk) => !noReviewIds.has(bk.id)).map((bk) => bk.id)])];
    const byId = new Map([...booksRef.current, ...newBooks].map((bk) => [bk.id, bk]));
    const consultBooks = memoBookIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 50);
    if (memosAdded + reviewsAdded > 0 && takeOnboardPathDone('import')) track('onboard_path_done', { path: 'import', memos: memosAdded + reviewsAdded });
    return { booksAdded, booksMatched, booksFailed, memosAdded, reviewsAdded, createdBookIds: newBooks.map((b) => b.id), createdMemoIds, statusChanged, bareBooks, memoBookIds, consultBooks };
  };

  // 📥 取り込みを取り消す（取り込みの完了画面から）: この取り込みで入れたものだけを消す。
  //   新しく作った本は本ごと消す／もとからあった本は、足したメモだけ消して状態（読了にした分）を戻す。
  const undoImport = async (outcome) => {
    const memoIds = Array.isArray(outcome?.createdMemoIds) ? outcome.createdMemoIds : [];
    const bookIds = Array.isArray(outcome?.createdBookIds) ? outcome.createdBookIds : [];
    for (let i = 0; i < memoIds.length; i += 200) {
      // eslint-disable-next-line no-await-in-loop
      const { error } = await supabaseClient.from('book_memos').delete().in('id', memoIds.slice(i, i + 200));
      if (error) throw error;
    }
    for (const id of bookIds) {
      // eslint-disable-next-line no-await-in-loop
      await deleteBook(id);
    }
    for (const c of outcome?.statusChanged || []) {
      applyBookPatchQuiet(c.id, { status: c.status, doneDate: c.doneDate || '' });
    }
    invalidateKnowledgeCache();
    appCache?.notifyMemosChanged?.();
    refreshBooks();
    track('import_undone', { books: bookIds.length, memos: memoIds.length });
    toast.info('取り込みを取り消しました。');
  };

  const addFromAdvisor = async (rec, payloadOrQuery = '') => {
    // 既に本棚にある本ならダイアログ → 既存本へジャンプ。null を返して
    // BookAdvisor 側に「追加されなかった」を伝える。
    const dup = await handleDuplicateGate({ isbn: rec.isbn, title: rec.title, author: rec.author });
    if (dup) return null;
    const payload = typeof payloadOrQuery === 'string'
      ? { sourceQuery: payloadOrQuery, investPurpose: payloadOrQuery, currentChallenge: '', hypothesis: '', bookReason: rec.why || '' }
      : payloadOrQuery;
    // ★ rec.isbn / rec.cover が既に set されていれば「ユーザーが視覚で
    //    確認済み」とみなして信頼する (BookAdvisor の AdvisorAddConfirmModal
    //    で候補を表示 → 選択した結果)。検索を裏で再実行して 1 件目で
    //    上書きする旧挙動は WYSIWYG 原則に反するので skip。
    const verifiedIsbn = rec.isbn ? String(rec.isbn).replace(/[-\s]/g, '') : '';
    const verifiedCover = (rec.cover || '').toString().trim();
    const newBook = {
      ...emptyBook(),
      title: rec.title,
      author: rec.author,
      status: "want",
      addedVia: 'search',
      isbn: verifiedIsbn,
      cover: verifiedCover,
      coverIsbn: verifiedCover && verifiedIsbn ? verifiedIsbn : '',
      // AI 選書のクエリを引き継ぎ。空でも sourceQuery プロパティを保持
      // することで saveBook 側の source_query 書き込み判別が走る。
      sourceQuery: (payload.sourceQuery || '').trim(),
      investPurpose: (payload.investPurpose || '').trim(),
      currentChallenge: (payload.currentChallenge || '').trim(),
      hypothesis: (payload.hypothesis || '').trim(),
      bookReason: (payload.bookReason || '').trim(),
    };
    // ISBN が未指定 (= AdvisorAddConfirmModal で候補が見つからず確認モーダル
    // を skip したケース) のみ search で補完する。strict match で安全側に倒す。
    if (!newBook.isbn) {
      try {
        const results = await searchBooksAPIFlat(rec.title + " " + rec.author);
        if (results.length > 0) {
          const first = results[0];
          if (isStrictMatch(first, { title: rec.title, author: rec.author })) {
            newBook.totalPages = first.pages || 0;
            newBook.isbn = first.isbn || '';
            // 検索で既に表紙が取れているなら捨てずに採用（取得率を底上げ）。
            if (first.cover && !newBook.cover) {
              newBook.cover = first.cover;
              newBook.coverIsbn = first.isbn ? String(first.isbn).replace(/[-\s]/g, '') : '';
            }
          } else {
            // eslint-disable-next-line no-console
            console.warn('[add] search top hit not strict match, skipping ISBN:', { recommended: rec.title, got: first.title });
          }
        }
      } catch { /* 失敗しても OK — bg resolver が title/author だけでも解決を試みる */ }
    }
    // 表紙は保存後に resolveCoverInBackground（Google Books サムネ → NDL/openBD/
    // OpenLibrary/Amazon の multi-source）で非同期に解決する。ここで同期 await
    // すると候補を順に試す分だけ「追加」の体感が遅くなるため、即保存→裏で解決に
    // 統一（解決できるまで本棚はグラデーション placeholder を出す）。
    try {
      const saved = await saveBook(newBook);
      // 📊 AI 選書経由の本追加（PII なし・via の enum だけ）。
      track('book_added', { via: 'advisor' });
      // 「開く」の先は本の詳細（読みたい）なので、読書計画シートへ誘う文にはしない（押した先と食い違うため）。
      // 書名はカードの「追加済み」で分かるので入れない（「開く」と並んで 390 幅で 1 行に収まる短さ・2026-09-30）。
      const msg = '「読みたい」に追加しました。';
      // 追加直後に「本棚で探し直す」断絶を無くす — トーストの「開く」から 1 タップでその本の詳細（読みたい）へ。
      // 以前は読書計画の編集（積読の画面）を開いていたが、状態が「読みたい」のまま積読の画面になり食い違った。
      // 詳細の左上は「‹ AI 選書」で、戻るとさっきのおすすめのまま（BookAdvisor が状態を覚えている・2026-09-29）。
      const addedToastId = toast.show({
        type: 'success',
        message: msg,
        duration: 6000,
        action: { label: '開く', onClick: () => openDetail(saved) },
      });
      // その本を開いたら消す（openDetail が見る・カードの「追加済み・開く」から開いても残らない）。
      if (saved?.id) advisorAddedToastRef.current = { bookId: saved.id, toastId: addedToastId };
      // 表紙取得をバックグラウンドで実行 (await しない)。失敗しても UX に影響なし。
      resolveCoverInBackground(saved);
      // BookAdvisor が advisor_sessions の added_book_ids を更新する用に
      // 保存された本 (UUID 付き) を返す。
      return saved;
    } catch (error) {
      if (isUniqueViolation(error)) {
        toast.error('この本はもう本棚にあります。');
      } else {
        toast.error(toMessage(error, '本の追加に失敗しました。'));
      }
      return null;
    }
  };

  // 🌱 バックグラウンドで multi-ISBN リゾルバを走らせ、表紙が取れたら DB
  // を更新する。await しない fire-and-forget 設計。失敗しても UX を壊さない。
  // useBooks.fetchBooks が走るので本棚 UI は自動的に更新される。
  // coverAutoRetry が BookCard 描画時にも同じ処理を回すので、ここで失敗
  // しても次の機会に再試行される。
  const resolveCoverInBackground = (saved) => {
    if (!saved || !saved.id || saved.cover || saved.coverIsbn === 'manual' || saved.coverIsbn === 'removed') return;
    if (!saved.title && !saved.isbn) return;
    // 本棚の自動の再取得と同じ 1 本のキューに積む（1 冊ずつ順番に・負のキャッシュ・ISBN も保存）。
    // 以前はここで直接解決していて、取り込み 20 冊を同時に走らせて 429 の嵐になっていた。
    triggerCoverAutoRetry(saved, { fallback: saved });
  };

// Status transitions — optimistic UI with undo toast.
  // opts.message: 「元に戻す」の知らせの代わりに出す文（読書計画シートを作りに積読に積んだとき等・2026-09-29）。
  const advanceStatus = (book, newStatus, opts = {}) => {
    if (!book) return;
    // 呼び出し元のスナップショット（current 等）は古い可能性がある。saveBook は
    // 「渡した actions に無い行を DELETE」する差分同期なので、stale なまま保存すると
    // 直前に追加した行動などが静かに消える。必ず books state の最新行に rebase する。
    const fresh = books.find((b) => b.id === book.id) || book;
    const prev = {
      status: fresh.status,
      startDate: fresh.startDate,
      doneDate: fresh.doneDate,
    };
    // opts.extra: 状態と一緒に残す欄（積読の「読書を開始する」で、下書きの得たいことを本に残す・2026-10-09）。
    const patch = { status: newStatus, ...(opts.extra || {}) };
    // 開始日は「読み始めた日」＝読書中・読了に進めたとき（積読に積んだ日ではない）。
    if ((newStatus === "reading" || newStatus === "done") && !fresh.startDate) patch.startDate = todayLocal();
    if (newStatus === "done" && !fresh.doneDate) patch.doneDate = todayLocal();
    const updated = { ...fresh, ...patch };

    // Optimistic update。ステータスを 1 つ進めるタップは、どの遷移でも本詳細に
    // 着地させる（旧: want→before だけ長い編集フォームに強制連行され「積読に
    // 積んだだけなのに入力を迫られる」非可逆感が最大の離脱ポイントだった）。
    // before の読書計画は、詳細上部の「AI 読書計画を完了しよう」カードが導線を持つ。
    // books state（booksRef 経由の並行操作の読み取り元）にも即時反映する — ここを
    // 更新しないと、保存ラウンドトリップ中の行動トグル等が旧ステータスを読み、
    // その stale UPDATE がステータス変更を DB 上で巻き戻す。
    setCurrent(updated);
    setForm({ ...emptyBook(), ...updated, tags: updated.tags || [], actions: updated.actions || [] });
    setView('detail');
    mutateBookLocal(book.id, (b) => ({ ...b, ...patch }));

    // Persist on the per-book serialization chain; roll back on failure.
    // チェーン実行時点の最新行（並行トグルの結果込み）に status 系フィールド
    // だけを載せて保存する — 全行スナップショット保存は他フィールドを巻き戻す。
    enqueueBookMutation(book.id, async (entry) => {
      const base = entry.latest || booksRef.current.find((b) => b.id === book.id) || updated;
      const toSave = { ...base, ...patch };
      try {
        const saved = await saveBook(toSave);
        entry.latest = saved || toSave;
        // 📊 ステータス遷移の計測（PII なし・to の enum だけ）。DB 保存が確定した
        // 時だけ数える（楽観更新→失敗 rollback の遷移を成功として二重計上しない）。
        if (saved && (newStatus === 'before' || newStatus === 'reading' || newStatus === 'done')) {
          track('status_changed', { to: newStatus });
        }
      } catch (error) {
        toast.error(toMessage(error, '状態を変えられませんでした。'));
        // rollback は status 系フィールドのみ（他の並行変更は保持）。画面遷移は
        // ユーザーがこの本を開いたままの時だけ行う（別の本の編集画面を乗っ取らない）。
        mutateBookLocal(book.id, (b) => ({ ...b, ...prev }));
        entry.latest = null;
        setCurrent((c) => (c && c.id === book.id ? { ...c, ...prev } : c));
        setForm((f) => (f && f.id === book.id ? { ...f, ...prev } : f));
        if (currentRef.current?.id === book.id) setView('detail');
      }
    });

    const labels = { want: '読みたい', before: '積読', reading: '読書中', done: '読了' };
    const revert = async () => {
      statusUndoToastRef.current.delete(book.id);
      // その後に本が消された／ステータスが別の操作でさらに変わったときは戻さない
      // （古い取り消しで別の段階へ巻き戻したり、消した本を保存しようとしない）。
      const now = booksRef.current.find((b) => b.id === book.id);
      if (!now || now.status !== newStatus) return;
      // Undo も直列化チェーンに乗せ、実行時点の最新行に rebase して status 系
      // フィールドだけを prev に戻す。クリック時スナップショット（fresh）での
      // 全行保存は、Undo トースト表示中（5〜6.5 秒）の行動トグルや繰り返し
      // spawn 行を差分 DELETE で消してしまう。
      await enqueueBookMutation(book.id, async (entry) => {
        const base = entry.latest || booksRef.current.find((b) => b.id === book.id) || fresh;
        const reverted = { ...base, ...prev };
        // 画面の差し替えはユーザーがまだこの本を開いている時だけ（別の本の
        // 編集中フォームを乗っ取ると isEditDirty 保護も壊れる）。
        setCurrent((c) => (c && c.id === book.id ? reverted : c));
        setForm((f) => (f && f.id === book.id ? { ...emptyBook(), ...reverted, tags: reverted.tags || [], actions: reverted.actions || [] } : f));
        // 取り消しは「元の状態の本の詳細」に戻すだけ（編集フォームに飛ばさない）。
        if (currentRef.current?.id === book.id) setView('detail');
        mutateBookLocal(book.id, (b) => ({ ...b, ...prev }));
        try {
          const saved = await saveBook(reverted);
          entry.latest = saved || reverted;
        } catch (error) {
          toast.error(toMessage(error, '状態を元に戻せませんでした。'));
        }
      });
    };

    const becomingDone = newStatus === 'done' && prev.status !== 'done';
    if (becomingDone) {
      // Light up the matching card on the books list so when the user navigates
      // back, they see the freshly-completed book glowing.
      if (recentlyDoneTimerRef.current) clearTimeout(recentlyDoneTimerRef.current);
      setRecentlyDoneId(book.id);
      recentlyDoneTimerRef.current = setTimeout(() => setRecentlyDoneId(null), 8000);
      // 控えめに祝う（紙吹雪・「1 冊読了！」・出典の確かでない名言はやめた・反ゲーミフィケーション／作り話にしない）。
      try { haptic.success(); } catch { /* non-critical */ }
      // 「読了を写真で共有」は、押した「読了にする」の場所に 0.4 秒おいてから出す（押し間違えない）。
      clearTimeout(justDoneTimerRef.current);
      justDoneTimerRef.current = setTimeout(() => setJustDoneId(book.id), 400);
      dismissStatusUndo(book.id);
      // 「元に戻す」と並ぶ知らせは 390 幅で 1 行に収まる短さに（DESIGN §5 トースト・5 行に折れていた）。
      // 一言を残す案内は画面の「一番の収穫を 1 行だけ残す」が受け持つ。「元に戻す」つきは toast.undo（完了なので ✓ の印）。
      statusUndoToastRef.current.set(book.id, toast.undo({
        message: '読了にしました。',
        success: true,
        duration: 6500,
        onUndo: revert,
      }));
    } else if (opts.message) {
      // 状態の変更はついで（読書計画シートを作るために積読に積んだ等）。「元に戻す」は出さず、何をしているかだけ。
      dismissStatusUndo(book.id);
      const id = toast.show({ type: 'info', message: opts.message });
      // 「…読書計画シートを作っています」は、シートを保存した（または作れなかった）ときに下げる
      // （保存の ✓ と「作っています」が同時に出ていた・2026-09-30）。
      if (opts.progress) planProgressToastRef.current = { bookId: book.id, id };
    } else {
      dismissStatusUndo(book.id);
      // 「元に戻す」と並ぶので 390 幅で 1 行に収まる短さに（「「読書中」に／変更しました。」と 2 行に折れていた・DESIGN §5 トースト）。
      const shortDone = { before: '積読に積みました。', reading: '読書中にしました。' };
      statusUndoToastRef.current.set(book.id, toast.undo({
        message: shortDone[newStatus] || `「${labels[newStatus] || newStatus}」にしました。`,
        destructive: false, // 状態の変更は消していないので、ゴミ箱ではなく中立の ↶
        onUndo: revert,
      }));
    }
  };

  // 🤫 本を開かずに一部フィールドだけを静かに更新する共通経路（本棚の長押し
  // メニューからのステータス変更 / フォルダ割当て用）。advanceStatus と違い
  // 画面遷移しない。直列化チェーン + 実行時 rebase + 失敗 rollback は同じ流儀。
  const applyBookPatchQuiet = (bookId, patch, successMsg) => {
    const prevRow = booksRef.current.find((b) => b.id === bookId);
    if (!prevRow) return;
    const prev = {};
    for (const k of Object.keys(patch)) prev[k] = prevRow[k];
    mutateBookLocal(bookId, (b) => ({ ...b, ...patch }));
    setCurrent((c) => (c && c.id === bookId ? { ...c, ...patch } : c));
    enqueueBookMutation(bookId, async (entry) => {
      const base = entry.latest || booksRef.current.find((b) => b.id === bookId);
      if (!base) return;
      const toSave = { ...base, ...patch };
      try {
        const saved = await saveBook(toSave);
        entry.latest = saved || toSave;
        if (successMsg) toast.success(successMsg);
      } catch (error) {
        mutateBookLocal(bookId, (b) => ({ ...b, ...prev }));
        setCurrent((c) => (c && c.id === bookId ? { ...c, ...prev } : c));
        entry.latest = null;
        toast.error(toMessage(error, '変更に失敗しました。'));
      }
    });
  };

  // 📗 本棚から直接ステータス変更（長押し → ステータスを変える）。
  // 日付の補完ルールはクイック追加（WantPhase）と同じ:
  // 読書中/読了で startDate、読了で doneDate を未設定時のみ埋める。
  const setBookStatusQuiet = (book, newStatus) => {
    if (!book || book.status === newStatus) return;
    const today = todayLocal();
    const patch = { status: newStatus };
    if ((newStatus === 'reading' || newStatus === 'done') && !book.startDate) patch.startDate = today;
    if (newStatus === 'done' && !book.doneDate) patch.doneDate = today;
    applyBookPatchQuiet(book.id, patch, `「${getSt(newStatus).label}」に変更しました。`);
    if (newStatus === 'before' || newStatus === 'reading' || newStatus === 'done') {
      track('status_changed', { to: newStatus });
    }
  };

  // Share
  const shareBook = async (book) => {
    // Build recommendation reason from available data
    // ⚠️ プライバシー: 一番の収穫 / まとめメモ / AI 要約は本人の私的記述。
    //   「おすすめを共有」のつもりで私的メモが SNS/クリップボードに漏れるのを防ぐため、
    //   共有テキストには私的本文を自動で含めない（書名・評価・Amazon リンクのみ）。
    //   ひとことは共有シート/各アプリ側でユーザー自身が書ける。
    const lines = [
      `📚 おすすめの本`,
      ``,
      `『${book.title}』${book.author ? `（${book.author}）` : ""}`,
    ];
    if (book.rating > 0) lines.push(`${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}`);
    lines.push(``);
    lines.push(`📖 Amazonで見る：`);
    lines.push(getAmazonLink(book));
    lines.push(`🛒 楽天ブックスで見る：`);
    lines.push(getRakutenLink(book));

    const text = lines.join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: `おすすめ：${book.title}`, text });
        return;
      } catch {}
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      toast.success('共有テキストをコピーしました。');
    } catch {
      // Last resort
      prompt("共有テキストをコピーしてください：", text);
    }
  };

  // ===== AI (prompts in src/lib/prompts.js) =====
  // NOTE: don't pull a useMemo from `allTags` here — `allTags` is declared
  // later in this component's body, and the deps array is evaluated
  // immediately, which would TDZ. Read `allTags.slice(0, 3)` lazily inside
  // the async handler (runs after the full body has initialized).

  // （撤去 2026-09-27）runAnalysis —「AIで本を解析する」。読書計画シートと役割が重なるため廃止。
  // 読書計画シート（作る・修正）はプランの機能（フリーミアム）。無料プランなら有料プランの画面を開く。
  const { requirePlan, plan: paywallPlan, freeMode: paywallFree, tokensRemaining: paywallTokens, purchasedTokens: paywallPurchased } = usePaywall();
  // 読書計画シート（と、その材料の得たいこと・課題・仮説）だけを、編集画面を開いたまま保存する。
  // 本の最新の値に重ねて保存（ほかの欄の書きかけは保存しない）し、編集中の「未保存の変更」の基準も
  // シートの分だけ進める（閉じるときに「保存していない変更があります」と言わない）。
  const persistPlanSheet = (bookId, sheet, message, fields = null) => {
    const text = String(sheet || '');
    if (!bookId || !text.trim()) return;
    // 本の詳細からその場で作ったとき（runStrategyInPlace）は、編集中のフォームではなく、その本の欄を使う。
    const f = fields || formRef.current || {};
    const patch = {
      aiStrategy: text,
      investPurpose: f.investPurpose || '',
      currentChallenge: f.currentChallenge || '',
      hypothesis: f.hypothesis || '',
    };
    enqueueBookMutation(bookId, async (entry) => {
      const base = entry.latest || booksRef.current.find((b) => b.id === bookId);
      if (!base) return;
      const saved = await saveBook({ ...base, ...patch });
      if (saved) entry.latest = saved;
      setCurrent((c) => (c && c.id === bookId ? { ...c, ...patch } : c));
      try {
        if (editBaselineRef.current) {
          const b = JSON.parse(editBaselineRef.current);
          if (b && b.id === bookId) editBaselineRef.current = JSON.stringify({ ...b, ...patch });
        }
      } catch { /* 基準が読めなければそのまま */ }
      dismissPlanProgress(bookId);
      toast.success(message);
    }).catch((error) => {
      dismissPlanProgress(bookId);
      toast.error(toMessage(error, '読書計画シートを保存できませんでした。下の「保存」でもう一度お試しください。'));
    });
  };
  // 読書計画シートを AI で書く（編集画面の「作る」と、本の詳細の「読書計画シートを作る」で共通）。
  // 📖 材料に本の紹介文と目次（出版社・書店が公開している文・lib/bookInfo.js）を添える（2026-10-02）。
  //   本の事実は紹介と目次からだけ書かせる（章の名前を作らせない）。本の詳細で読んでいれば控えから即座に。
  //   取れない・6 秒待っても来ないときは無しで作る（紹介・目次が無い前提の書き方になる）。
  const streamSetupSheet = async (src, onChunk) => {
    const info = await Promise.race([
      loadBookInfo(src).catch(() => null),
      new Promise((resolve) => { setTimeout(() => resolve(null), 6000); }),
    ]);
    const { about, aboutSource, toc } = bookInfoForPrompt(info);
    const text = await streamClaude({
      system: PROMPTS.setupSheet.system,
      cacheSystem: true,
      messages: [{
        role: 'user',
        content: PROMPTS.setupSheet.user({
          title: clamp(sanitizeForPrompt(src.title || ''), LIMITS.bookTitle),
          author: clamp(sanitizeForPrompt(src.author || ''), LIMITS.bookAuthor),
          analysis: clamp(sanitizeForPrompt(src.aiAnalysis || ''), LIMITS.memoText),
          purpose: clamp(sanitizeForPrompt(src.investPurpose || ''), LIMITS.memoText),
          topTags: allTags.slice(0, 3),
          about: sanitizeForPrompt(about),
          aboutSource,
          toc: toc.map((l) => sanitizeForPrompt(l)).filter(Boolean),
          // 📖 この本で学べること（作ってあれば・概要と学べることだけ・500 字まで・lib/bookBrief.js・2026-10-08）
          brief: sanitizeForPrompt(briefForPrompt(storedBriefOf(src))),
        }),
      }],
      // 読書計画シートは「各節 3 行・1,000 字以内」（prompts.setupSheet）。2048 → 1600（2026-09-27）
      max_tokens: 1600,
      model: MODEL_SMART,
      purpose: 'setup_sheet', // サーバーが用途ごとに安いモデルへ（docs/ai-routing.md・失敗したら Claude）
      onChunk,
    });
    // 📖 重点的に読む箇所・流し読みから、目次に無い章の名前・番号を含む行を消す（lib/planChapters.js・2026-10-04）
    //   この本の書名（『LIFE SHIFT』の後半）は章ではないので許す。
    try { return dropUnknownChapters(text, [...toc, src.title || ''], { noToc: toc.length === 0 }).sheet; } catch { return text; }
  };
  // 読書計画シートの「関連書籍」を書誌で確かめ、見つからない本を消す（安いモデルで作るため・lib/planRelatedBooks.js）。
  // 確かめている間は「読みたい」ボタンを出さない（aiLoading / planGen のまま）。
  const checkPlanBooks = async (sheet) => {
    try { return (await verifyPlanRelatedBooks(sheet, verifyBookExists)).sheet; } catch { return sheet; }
  };
  const runStrategy = async () => {
    if (!requirePlan('読書計画シート')) return;
    // 🤝 はじめて AI に送るときは、送る内容と送り先を見せて同意をもらう（lib/aiConsent.js）。やめたら何も変えずに戻る。
    if (!(await ensureAiConsent('setup_sheet'))) return;
    setAiLoading(true);
    const targetId = form?.id;
    const prevStrategy = form?.aiStrategy || '';
    setForm((f) => ({ ...f, aiStrategy: '' }));
    try {
      const sheet = await streamSetupSheet(form, (fullText) => {
        // 関連書籍カードのパース (= 「読みたい」ボタン押下可能) は
        // streaming 中は BeforePhase 側で aiLoading を見て無効化している。
        // MarkdownSections は 1 chunk ごとに再 render する形になるが、
        // テキスト量は 2KB 以下で十分軽い。
        setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: fullText } : f));
      });
      // 何も返らなかったときは、前のシートを消さずに戻す（空のまま保存すると DB のシートが消える）。
      if (!String(sheet || '').trim()) throw new Error('読書計画シートを作れませんでした。少し時間をおいて、もう一度お試しください。');
      const checked = await checkPlanBooks(sheet);
      if (checked !== sheet) setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: checked } : f));
      // Fresh generation invalidates any prior 修正リクエスト history.
      if (targetId) clearStrategyHistory(targetId);
      // できたシートはすぐ保存する（「保存」を押し忘れて閉じるとシートが消えていた・2026-09-29）。
      persistPlanSheet(targetId, checked, '読書計画シートを保存しました');
    } catch (error) {
      // 失敗時は元の計画シートに戻す（クリアしたまま保存すると DB のシートが消える）。
      setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: prevStrategy } : f));
      // プランの案内（402）は有料プランの画面が開くので重ねない。トークンの上限は案内として。
      if (error?.monthlyLimit) toast.info(error.message);
      else if (!error?.paywall) toast.error(toMessage(error, '読書計画シートを作れませんでした。'));
    } finally {
      setAiLoading(false);
    }
  };
  // 本の詳細（積読）の「読書計画シートを作る」: 得たいことがあれば、編集画面へ行かずにその場で作る
  // （もう一度「作る」を押させない・2026-09-29）。進み具合はボタンの場所に出す（planGen）。
  // 得たいことが無ければ書かないと作れないので、従来どおり編集画面（openSetup）へ。
  const [planGen, setPlanGen] = useState(null); // { bookId, text } 作っている間だけ
  // その場で作り終えた本の id。できたシートを開いたまま見せる（作ったのに畳まれて見えない、をなくす）。
  const [justMadePlanId, setJustMadePlanId] = useState(null);
  // 📖 この本について（出版社・書店の紹介文と目次・AI なし・lib/bookInfo.js・2026-10-02）。
  //   読みたい・積読は書名の下のカード、読書中は下の畳む見出し。読了では出さない（取りにも行かない）。
  // 📚 保存済みの読書計画シートに「1 行に 2 冊を混ぜた関連書籍」（『A』関連 または『B』）があれば、開いたときに
  //    書誌で確かめて 1 冊の行に直す（見つからなければ消す）・そっと保存する（2026-10-04 オーナー報告）。
  //    その本・その文につき 1 回だけ。画面はそれまで崩れた行をカードにしない（MarkdownSections）。
  const repairedSheetsRef = useRef(new Set());
  const repairBook = view === 'detail' ? current : (view === 'edit' ? form : null);
  const repairText = repairBook?.aiStrategy || '';
  const repairId = repairBook?.id || null;
  useEffect(() => {
    if (!repairId || !repairText || planGen || aiLoading) return;
    if (!hasMalformedRelatedBooks(repairText)) return;
    const key = `${repairId}:${repairText.length}`;
    if (repairedSheetsRef.current.has(key)) return;
    repairedSheetsRef.current.add(key);
    let cancelled = false;
    (async () => {
      const fixed = await checkPlanBooks(repairText);
      if (cancelled || fixed === repairText) return;
      setCurrent((c) => (c && c.id === repairId && c.aiStrategy === repairText ? { ...c, aiStrategy: fixed } : c));
      setForm((f) => (f && f.id === repairId && f.aiStrategy === repairText ? { ...f, aiStrategy: fixed } : f));
      enqueueBookMutation(repairId, async (entry) => {
        const base = entry.latest || booksRef.current.find((b) => b.id === repairId);
        if (!base || (base.aiStrategy || '') !== repairText) return; // その間に書き換わっていれば触らない
        const saved = await saveBook({ ...base, aiStrategy: fixed });
        if (saved) entry.latest = saved;
      }).catch(() => { /* 次に開いたときにまた直す */ repairedSheetsRef.current.delete(key); });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repairId, repairText, planGen, aiLoading]);
  // 読書計画の編集画面（積読の「読書計画を編集」）でも読む＝「この本で学べること」の材料（2026-10-08）。
  const bookAboutShown = (view === 'detail' && ['want', 'before', 'reading'].includes(current?.status))
    || (view === 'edit' && (editPhaseOverride === 'before' || form?.status === 'before'));
  const bookAbout = useBookInfo(current, { enabled: bookAboutShown });
  // 🏷 紹介文・目次が届いたら、まだ分野の無い本に分野を付ける（2026-10-11・hooks/useBookFieldsAuto.js）。
  useEffect(() => {
    if (view !== 'detail' || !current?.id || !bookAbout.info) return;
    bookFieldsAuto.onBookInfo(current, bookAbout.info);
  }, [bookAbout.info, current?.id, view]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🏷 本を追加するフォーム: 書名（と紹介文・目次）から分野を先に選んでおく（本人が選び直したら触らない）。
  const addFormTitle = view === 'edit' && !current ? (form?.title || '') : null;
  useEffect(() => {
    if (addFormTitle == null || form?.fieldsTouched) return undefined;
    if (fieldsOf(form).length && !form.fieldsAuto) return undefined; // 本人か前の画面で選んだ分野は変えない
    const formId = form?.id;
    let alive = true;
    const apply = (auto, stage) => setForm((f) => {
      if (!f || f.id !== formId || f.fieldsTouched) return f;
      if (fieldsOf(f).length && !f.fieldsAuto) return f;
      if (!auto.length && !fieldsOf(f).length) return f;
      return { ...f, tags: withFields(f.tags, auto), fieldsAuto: auto.length > 0, fieldsAutoStage: stage };
    });
    const timer = setTimeout(() => {
      if (!alive) return;
      const known = peekBookInfo(form);
      apply(classifyBook({ title: addFormTitle, ...infoFeatures(known) }), known ? 'info' : 'title');
      if (known === undefined && (form?.isbn || addFormTitle.trim().length >= 2)) {
        loadBookInfo(form).then((info) => {
          if (!alive || !info) return;
          const auto = classifyBook({ title: addFormTitle, ...infoFeatures(info) });
          if (auto.length) apply(auto, 'info');
        }).catch(() => {});
      }
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [addFormTitle, form?.id, form?.isbn, form?.fieldsTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  // 📖 この本で学べること（2026-10-08・lib/bookBrief.js・BookBrief.jsx）。公開の紹介文と目次だけから AI が
  //   概要・学べること・仮説の例を書き、本に保存する（開くたびに AI を呼ばない・作り直しは押したときだけ）。
  //   無料プランも使える（相談と同じ無料のトークンから・1 回 約 2 トークン）。
  const [briefGenId, setBriefGenId] = useState(null); // 作っている本の id
  const [briefJustMadeId, setBriefJustMadeId] = useState(null); // いま作った本（編集画面の畳みを開いたまま見せる）
  // 開いたままにするのは、作ったその場だけ。画面を離れたら（別の画面・別の本）畳む＝主ボタン「読書を開始する」を最初の画面に残す（2026-10-09 ui-critic）。
  useEffect(() => { setBriefJustMadeId(null); }, [view, current?.id]);
  const [briefError, setBriefError] = useState(null); // { bookId, message } 作れなかった理由（ボタンの下に 1 行）
  const planCostLine = runCostLine({ plan: paywallPlan, remaining: paywallTokens, purchased: paywallPurchased, cost: TOKEN_COSTS.setupSheet });
  const briefCostLine = runCostLine({ plan: paywallPlan, remaining: paywallTokens, purchased: paywallPurchased, cost: TOKEN_COSTS.bookBrief });
  const makeBookBrief = async (book) => {
    if (!book?.id || briefGenId) return;
    const info = bookAbout.info;
    if (!hasBriefMaterial(info)) { toast.info(BRIEF_NO_MATERIAL_TEXT); return; }
    if (!(await ensureAiConsent('book_brief'))) return; // 🤝 はじめて AI に送るときの同意（lib/aiConsent.js）
    const bookId = book.id;
    // 編集画面で得たいことを書いているときは、その言葉に寄せる（保存はしない）。
    const purpose = view === 'edit' && form?.id === bookId ? (form.investPurpose || '') : (book.investPurpose || '');
    const remaking = isUsableBrief(parseBrief(storedBriefOf(book)));
    setBriefGenId(bookId);
    setBriefError(null);
    try {
      const text = await generateBookBrief({ book: { ...book, investPurpose: purpose }, info });
      // 本に入らなかった（つながらない等）ときも、作った中身は端末に控えて見せる（saveBookBrief）。
      const briefSaved = await saveBookBrief(bookId, text);
      setCurrent((c) => (c && c.id === bookId ? { ...c, aiBrief: text } : c));
      setForm((f) => (f && f.id === bookId ? { ...f, aiBrief: text } : f));
      // 編集中の「保存していない変更」の基準も進める（作っただけで「変更があります」と言わない）。
      try {
        if (editBaselineRef.current) {
          const b = JSON.parse(editBaselineRef.current);
          if (b && b.id === bookId) editBaselineRef.current = JSON.stringify({ ...b, aiBrief: text });
        }
      } catch { /* 基準が読めなければそのまま */ }
      setBriefJustMadeId(bookId);
      if (briefSaved?.failed) toast.info('作りました。いまは、この端末にだけ保存しています。');
      else toast.success('この本で学べることを作りました');
    } catch (error) {
      // トークンの上限は案内として。プランの案内（402）は有料プランの画面が開くので重ねない。同意をやめたときは何も言わない。
      // 作れなかったときは、ボタンの下に理由の 1 行（ボタンは「もう一度作る」・2026-10-08 ui-critic）。
      if (error?.notice) { if (!/^(この AI 機能は|AI への送信をやめました)/.test(error.message)) toast.info(error.message); }
      else setBriefError({
        bookId,
        // 作り直しの失敗は前の中身が残ることを言う（中身の下に 1 行・BriefBody）。
        message: remaking
          ? '作り直せませんでした。前の内容のままです。'
          : toMessage(error, 'この本で学べることを作れませんでした。少し時間をおいてから押してください。'),
      });
    } finally {
      setBriefGenId(null);
    }
  };
  // 作り直す: トークンを使うので、確かめてから（目安の 1 行を添える・2026-10-08 ui-critic）。
  const remakeBookBrief = async (book) => {
    if (!book?.id || briefGenId) return;
    const ok = await confirm({
      // 見出しの名前（この本で学べること／味わえること）に揃える。
      title: `${briefLabels(storedBriefOf(book)).title}を作り直しますか？`,
      message: `いまの内容は新しい内容に置き換わります。${briefCostLine || `1 回 約 ${TOKEN_COSTS.bookBrief} トークン`}`,
      confirmLabel: '作り直す',
      cancelLabel: 'やめる',
    });
    if (ok) makeBookBrief(book);
  };
  // 仮説の欄へ送る（例を押したあと・入ったことが見えるように画面の真ん中へ）。
  const revealHypothesisField = () => {
    setTimeout(() => {
      try {
        const el = document.querySelector('textarea[aria-label="仮説"]');
        if (!el) return;
        let reduce = false;
        try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
        // 欄は中身の高さまで伸びる（BookPhases の仮説の欄）ので、欄の中は送らない（1 行目を欠かさない）。
        el.scrollTop = 0;
        el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      } catch { /* ignore */ }
    }, 250);
  };
  const pickHypothesisInEdit = (h) => {
    setForm((f) => ({ ...f, hypothesis: appendHypothesis(f.hypothesis, h) }));
    // 知らせは下に固定の保存の欄の上に浮かぶ（EditSaveBar の data-toast-above・2026-10-09）。
    toast.success('仮説の欄に入れました');
    revealHypothesisField();
  };
  // 本の詳細（積読）で仮説の例を押したとき（2026-10-09）: 編集画面に移らず、詳細のまま本の仮説に足して保存し、
  //   「仮説に入れました」＋元に戻す。以前は読書計画の編集画面へ移り、下のボタンが「保存して読書を開始」だけで、
  //   保存すると読書中になっていた（仮説を足しに来ただけなのに）。
  const saveHypothesis = (bookId, value) => enqueueBookMutation(bookId, async (entry) => {
    const base = entry.latest || booksRef.current.find((b) => b.id === bookId);
    if (!base) return;
    const updated = { ...base, hypothesis: value };
    mutateBookLocal(bookId, (b) => ({ ...b, hypothesis: value }));
    setCurrent((c) => (c && c.id === bookId ? { ...c, hypothesis: value } : c));
    setForm((f) => (f && f.id === bookId ? { ...f, hypothesis: value } : f));
    const saved = await saveBook(updated);
    entry.latest = saved || updated;
  });
  const pickHypothesisFromDetail = async (book, hypothesis) => {
    const fresh = booksRef.current.find((b) => b.id === book.id) || book;
    const prevHyp = fresh.hypothesis || '';
    const nextHyp = appendHypothesis(prevHyp, hypothesis);
    if (nextHyp === prevHyp) return;
    try {
      await saveHypothesis(book.id, nextHyp);
    } catch (error) {
      mutateBookLocal(book.id, (b) => ({ ...b, hypothesis: prevHyp }));
      setCurrent((c) => (c && c.id === book.id ? { ...c, hypothesis: prevHyp } : c));
      toast.error(toMessage(error, '仮説に入れられませんでした。'));
      return;
    }
    haptic.light();
    // 仮説の書いてあるカードを画面の中ほどへ送って、入ったところを見せてから知らせる（2026-10-09 ui-critic）。
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    try { document.querySelector('[data-plan-card]')?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, reduce ? 0 : 350));
    if (currentRef.current?.id !== book.id) return;
    bindToastToBook(book.id, toast.undo({
      message: '仮説に入れました',
      success: true,
      onUndo: async () => {
        try { await saveHypothesis(book.id, prevHyp); } catch (error) { toast.error(toMessage(error, '仮説を元に戻せませんでした。')); }
      },
    }));
  };
  const runStrategyInPlace = async (book) => {
    if (!book?.id || planGen) return;
    const src = buildFormFromBook(book); // 得たいことが空なら AI 選書の入力で埋まる（編集画面と同じ）
    if (!(src.investPurpose || '').trim()) { openSetup(book); return; }
    if (!requirePlan('読書計画シート')) return; // 無料プラン: 有料プランの画面を開く
    if (!(await ensureAiConsent('setup_sheet'))) return; // 🤝 はじめて AI に送るときの同意（lib/aiConsent.js）
    const bookId = book.id;
    setPlanGen({ bookId, text: '' });
    try {
      const raw = await streamSetupSheet(src, (fullText) => setPlanGen((g) => (g && g.bookId === bookId ? { ...g, text: fullText } : g)));
      if (!String(raw || '').trim()) throw new Error('読書計画シートを作れませんでした。少し時間をおいて、もう一度お試しください。');
      const sheet = await checkPlanBooks(raw);
      clearStrategyHistory(bookId);
      const fields = {
        investPurpose: src.investPurpose || '',
        currentChallenge: src.currentChallenge || '',
        hypothesis: src.hypothesis || '',
      };
      // 保存を待たずに詳細へ出す（ボタンに戻ってから「できています」に変わる、のちらつきを出さない）。
      setCurrent((c) => (c && c.id === bookId ? { ...c, ...fields, aiStrategy: sheet } : c));
      setJustMadePlanId(bookId);
      persistPlanSheet(bookId, sheet, '読書計画シートを保存しました', fields);
    } catch (error) {
      dismissPlanProgress(bookId);
      if (error?.monthlyLimit) toast.info(error.message);
      else if (!error?.paywall) toast.error(toMessage(error, '読書計画シートを作れませんでした。'));
    } finally {
      setPlanGen(null);
    }
  };

  // Refinement: take the current sheet + an instruction and ask the AI to
  // rewrite it. Saves a single-step history to localStorage so the user
  // can undo.
  const runStrategyEdit = async (instruction) => {
    if (!form?.aiStrategy?.trim()) return;
    if (!instruction?.trim()) return;
    if (!requirePlan('読書計画シート')) return;
    if (!(await ensureAiConsent('setup_sheet_edit'))) return; // 🤝 はじめて AI に送るときの同意（lib/aiConsent.js）
    const prev = form.aiStrategy;
    const targetId = form?.id;
    setAiLoading(true);
    // 修正中は一旦シートを空にして「上書きしているんだ」と視覚化。
    // 失敗時は catch で prev に戻す。
    setForm((f) => ({ ...f, aiStrategy: '' }));
    let didStreamAny = false;
    let lastText = '';
    try {
      await streamClaude({
        system: PROMPTS.setupSheetEdit.system,
        cacheSystem: true,
        messages: [{
          role: 'user',
          content: PROMPTS.setupSheetEdit.user({
            existing: clamp(sanitizeForPrompt(prev || ''), LIMITS.memoText),
            instruction: clamp(sanitizeForPrompt(instruction || ''), LIMITS.aiQuestion),
            title: clamp(sanitizeForPrompt(form.title || ''), LIMITS.bookTitle),
            author: clamp(sanitizeForPrompt(form.author || ''), LIMITS.bookAuthor),
          }),
        }],
        // 読書計画シートは「各節 3 行・900 字以内」（prompts.setupSheet）。2048 → 1600（2026-09-27）
        max_tokens: 1600,
        model: MODEL_SMART,
        purpose: 'setup_sheet_edit',
        onChunk: (fullText) => {
          didStreamAny = true;
          lastText = fullText;
          setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: fullText } : f));
        },
      });
      if (!didStreamAny) {
        // 何も返ってこなかったケース (network error 等は throw されるので
        // ここに来ることは稀だが念のため)。
        throw new Error('AI 修正に失敗しました');
      }
      if (targetId) saveStrategyHistory(targetId, prev);
      setStrategyHistoryTick((t) => t + 1);
      // 直したシートもすぐ保存する（作ったときと同じ）。関連書籍は作ったときと同じく確かめる。
      // 直すときは目次を渡していないので、直す前のシートに無かった章の名前・番号を含む行は消す（lib/planChapters.js・2026-10-04）。
      let grounded = lastText;
      try { grounded = dropUnknownChapters(lastText, [...focusLinesOf(prev), form.title || '']).sheet; } catch { grounded = lastText; }
      const checked = await checkPlanBooks(grounded);
      if (checked !== lastText) setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: checked } : f));
      persistPlanSheet(targetId, checked, '読書計画シートを直して、保存しました');
    } catch (error) {
      // ストリーミング失敗時は元のシートを戻す (undo 履歴は触らない)。
      setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: prev } : f));
      if (error?.monthlyLimit) toast.info(error.message);
      else if (!error?.paywall) toast.error(toMessage(error, '読書計画シートの修正に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };

  const undoStrategy = () => {
    if (!form?.id) return;
    const prev = popStrategyHistory(form.id);
    if (!prev) return;
    setForm((f) => ({ ...f, aiStrategy: prev }));
    setStrategyHistoryTick((t) => t + 1);
    toast.info('ひとつ前の読書計画シートに戻しました。');
  };

  // Adds a recommended book (from reading plan sheet / 投資の効果 related-books
  // section) to the bookshelf in 'want' status. Best-effort cover lookup
  // via the search pipeline; falls back to manual add if no hit.
  //
  // 旧実装は handler 内で複数 await していたためボタンタップから 1.5〜4s
  // 何も起きない (toast も「追加済み」表示も出ない) 体験になっていた。
  // 新実装は fire-and-forget + 即時 UI 反映 + 診断ログで根治。
  const addRelatedBookFromAi = ({ title, author = '' }) => {
    if (!title || !title.trim()) return;
    const trimmedTitle = title.trim();
    if (addedRelatedTitles.has(trimmedTitle)) return;

    // 触覚で即時 ack (画面の見た目とは別経路で「タップ受付」を確実に伝える)。
    try { haptic.light(); } catch { /* non-critical */ }
    // ★ 1. UI 即時反映 — ボタンを「✅ 追加済み」に切替 (< 5ms)
    setAddedRelatedTitles((prev) => {
      const next = new Set(prev);
      next.add(trimmedTitle);
      return next;
    });

    // ★ 2. 既存本との重複チェックを背景で。dup なら confirm 経由で既存本を
    //      開く (旧フローと同じ)。dup でユーザーが戻ったら UI をロールバック。
    Promise.resolve().then(async () => {
      try {
        const dup = await handleDuplicateGate({ title: trimmedTitle, author });
        if (dup) {
          setAddedRelatedTitles((prev) => {
            const next = new Set(prev);
            next.delete(trimmedTitle);
            return next;
          });
          return;
        }

        const newBook = {
          ...emptyBook(),
          title: trimmedTitle,
          author: (author || '').trim(),
          status: 'want',
          addedVia: 'search',
        };

        // ★ 3. 検索 → 厳格マッチで安全に ISBN/cover を取得。
        //      isStrictMatch を通った時だけ採用、ダメなら ISBN 空で保存して
        //      bg resolver の findIsbnCandidates 経路に任せる (誤マッチ回避)。
        try {
          const results = await searchBooksAPIFlat(`${trimmedTitle} ${author || ''}`.trim());
          if (results.length > 0) {
            const first = results[0];
            if (isStrictMatch(first, { title: trimmedTitle, author })) {
              newBook.totalPages = first.pages || 0;
              newBook.isbn = first.isbn || '';
              if (!newBook.author && first.author) newBook.author = first.author;
              if (first.cover) {
                newBook.cover = first.cover;
                newBook.coverIsbn = first.isbn ? String(first.isbn).replace(/[-\s]/g, '') : '';
              }
            } else {
              // 厳格マッチ外なので ISBN/cover は採用せず手動扱い (誤マッチ回避)
              newBook.addedVia = 'manual';
            }
          } else {
            newBook.addedVia = 'manual';
          }
        } catch {
          // 検索失敗時は手動扱いにして bg resolver に委ねる
          newBook.addedVia = 'manual';
        }

        // ★ 同期的な表紙解決。addFromAdvisor と同じく `tryCoverForIsbn` で実在
        //   検証する。プレースホルダー URL を保存する事故を防ぐ。
        if (!newBook.cover && newBook.isbn) {
          try {
            const url = await tryCoverForIsbn(newBook.isbn);
            if (url) {
              newBook.cover = url;
              newBook.coverIsbn = String(newBook.isbn).replace(/[-\s]/g, '');
            }
          } catch {
            /* 同期表紙解決の失敗は非クリティカル。bg resolver に委ねる。 */
          }
        }

        const saved = await saveBook(newBook);
        resolveCoverInBackground(saved);
        toast.success(`『${trimmedTitle}』を「読みたい」に追加しました。`);
      } catch (error) {
        // 失敗時は UI rollback してエラー表示
        setAddedRelatedTitles((prev) => {
          const next = new Set(prev);
          next.delete(trimmedTitle);
          return next;
        });
        if (isUniqueViolation(error)) {
          toast.error('この本はもう本棚にあります。');
        } else {
          toast.error(toMessage(error, '本の追加に失敗しました。'));
        }
      }
    });
  };
  // （撤去）runSummary — 旧「AIでメモを要約」(roiSummary)。本ごとの AI synthesis は
  // 「学びを分析」(analyzeBookLearnings) に一本化（目的照合・新視点・タップ行動化・
  // 全体還流が上位互換）。重複を畳んで迷い/原価を減らす（本田: 凝縮）。

  // 旧: 完了時に振り返りモーダルを出していたが UX フリクション削減のため撤去。
  // state は ActionEditModal の編集対象として再利用 (= 編集中の {bookId, actionIdx}).
  // null なら非表示。{ bookId, actionIdx, action } をセット。
  // ActionEditModal を開いている対象 — { bookId, actionIdx, action }
  const [editingAction, setEditingAction] = useState(null);
  // 「期限を見直す」: 残りの期限を過ぎた行動を順に開く（その間に完了・削除されたものは飛ばす）。無ければ閉じて、
  // 見直しの間に保存した件数を知らせる（finishReview）。
  // session: { saves: Promise<'saved'|'failed'|'gone'>[] }＝見直しの間の保存（保存は裏で進め、次をすぐ開く・2026-09-30）。
  const openNextReviewAction = (cur) => {
    const rest = [...(cur?.queue || [])];
    while (rest.length) {
      const next = rest.shift();
      const acts = booksRef.current.find((b) => b.id === next.bookId)?.actions || [];
      const idx = resolveActionIndex(acts, next, next.actionIdx);
      if (idx >= 0 && idx < acts.length && !acts[idx].done) {
        setEditingAction({ bookId: next.bookId, actionIdx: idx, action: { ...next, ...acts[idx] }, queue: rest, total: cur.total, session: cur.session || null });
        return;
      }
    }
    setEditingAction(null);
    finishReview(cur);
  };
  // 見直しを終えた（最後まで進んだ・「やめる」）: 裏の保存がすべて終わってから、保存できた件数を 1 回だけ知らせる。
  //   失敗したものは、その場で失敗の知らせを出して元に戻してある。
  const finishReview = async (cur) => {
    const saves = cur?.session?.saves;
    if (!saves?.length) return;
    cur.session.saves = [];
    const results = await Promise.all(saves);
    const n = results.filter((r) => r === 'saved').length;
    if (n > 1) toast.success(`${n} 件の期限を更新しました`);
    else if (n === 1) toast.success('行動を更新しました。');
  };
  // 🎯 行動タブの「＋追加」フロー — null | 'pick'（本選択シート） | { bookId }（入力モーダル）
  const [addActionSheet, setAddActionSheet] = useState(null);
  // 💭 ノート（振り返り）タブの「＋メモを追加」フロー — null | 'pick'（本選択シート）。
  // メモは本に紐づくので、本を選んだらその本の詳細を開いてクイックメモを起動する
  // （既存の実績あるメモ作成 UI をそのまま使う＝メモ挿入ロジックを重複させない）。
  const [addNoteSheet, setAddNoteSheet] = useState(null);
  // 「表紙が違う?」モーダル — 詳細画面の表紙下リンクから開く。
  const [coverFixForBook, setCoverFixForBook] = useState(null);

  // 内部関数: action.done を toggle し、完了時は completed_at + reflection を反映、
  // 繰り返し設定があれば次回分を新規行動として末尾に追加する。
  // 行動の保存系操作（トグル / 削除 / 編集モーダル保存）の直列化: saveBook の
  // ラウンドトリップ（1-2秒）中に同じ本へ別の操作をすると、後発が stale な
  // books から computed され先の変更を上書き（削除した行動の復活等）していた。
  // 本ごとに共有 entry（{ promise, latest }）で直列化し、実行時点の最新
  // スナップショット（直前の保存結果 latest or books state）に rebase する。
  // entry は enqueue 間で「同じオブジェクトを再利用」する — コピーすると
  // 先行タスクが書いた latest が後続に伝わらない。
  const actionToggleChainsRef = useRef(new Map()); // bookId -> { promise, latest, token }

  const enqueueBookMutation = (bookId, mutate) => {
    const chains = actionToggleChainsRef.current;
    let entry = chains.get(bookId);
    if (!entry) {
      entry = { promise: Promise.resolve(), latest: null, token: null };
      chains.set(bookId, entry);
    }
    const run = entry.promise.then(() => mutate(entry));
    const token = {};
    entry.token = token;
    entry.promise = run.catch(() => { /* 失敗しても後続操作は処理する */ });
    entry.promise.then(() => {
      // 自分が最後の enqueue だったらチェーンを掃除（latest の無限保持を防ぐ）。
      if (chains.get(bookId) === entry && entry.token === token) chains.delete(bookId);
    });
    return run;
  };

  // enqueue 時に掴んだ action を、実行時点の acts 配列内で再特定する。
  // チェーンの rebase（entry.latest / booksRef）で行が増減していると、
  // 呼び出し時の index は別の行を指し得る。id（永続済み）→ 参照 → 内容の
  // 順で探し、見つからなければ -1（＝対象は消えた。何もしない）。
  const resolveActionIndex = (acts, target, fallbackIdx) => {
    if (!target) return (fallbackIdx >= 0 && fallbackIdx < acts.length) ? fallbackIdx : -1;
    if (target.id) return acts.findIndex((a) => a && a.id === target.id);
    const byRef = acts.indexOf(target);
    if (byRef >= 0) return byRef;
    return acts.findIndex((a) => a && !a.id
      && (a.text || '') === (target.text || '')
      && (a.deadline || '') === (target.deadline || '')
      && !!a.done === !!target.done);
  };

  // 詳細/編集画面のスナップショット（current / form）を最新の actions 配列に
  // 同期する。books（mutateBookLocal / saveBook 後の確定値）だけ更新して
  // current / form を置き去りにすると、(a) 詳細画面のチェック表示が動かない、
  // (b) 後続の「まとめメモ保存」「読了にする」等が stale な actions で全行保存し、
  // トグル結果や繰り返し spawn 行を差分 DELETE で黙って巻き戻す。
  // addActionFromMemo で実証済みの同期パターンを全行動系操作に共通化したもの。
  const syncActionSnapshots = (next) => {
    if (!next?.id) return;
    setCurrent((c) => (c && c.id === next.id ? { ...c, actions: next.actions } : c));
    setForm((f) => (f && f.id === next.id ? { ...f, actions: next.actions } : f));
  };

  const applyActionToggle = (bookId, actionIdx, options = {}) => {
    // 対象行の「身元」を今の books から掴んでおく（index は実行時に再解決）。
    //   options.target があれば、それを身元にする（元に戻す等、あとから呼ぶときに並びがずれても同じ行動を掴む）。
    const bookNow = booksRef.current.find((b) => b.id === bookId);
    const targetAction = options.target || bookNow?.actions?.[actionIdx] || null;
    return enqueueBookMutation(bookId, (entry) => doActionToggle(bookId, actionIdx, options, entry, targetAction));
  };

  const doActionToggle = async (bookId, actionIdx, options, chainEntry, targetAction) => {
    const book = chainEntry.latest || booksRef.current.find((b) => b.id === bookId);
    if (!book) return;
    const acts = [...(book.actions || [])];
    const idx = resolveActionIndex(acts, targetAction, actionIdx);
    if (idx < 0) return; // 対象は先行操作で消えた — 別の行を誤ってトグルしない
    const target = acts[idx];
    if (!target) return;
    const becomingDone = !target.done;
    const updatedAct = {
      ...target,
      done: becomingDone,
      completedAt: becomingDone ? new Date().toISOString() : null,
      reflection: becomingDone
        ? (typeof options.reflection === 'string' ? options.reflection : (target.reflection || ''))
        : target.reflection || '',
    };
    acts[idx] = updatedAct;

    // 繰り返し設定があり、今回が「完了化」なら次回分を spawn。期限は元の期限を
    // 基準に weekly/monthly で進める。期限が無ければ今日基準で進める。
    //
    // ⚠️ 旧バージョンは次回分を即「visible なタスク」として作っていたため、
    //    ユーザーが何週間先まで先取り完了でき、母数が無限膨張して達成率が
    //    下がり続ける問題があった。新バージョンは scheduled_for (= 表示
    //    開始日時) を設定し、useAllActions が未来の行を非表示化する。
    //    weekly: 1 日前から表示開始 / monthly: 3 日前から表示開始。
    if (becomingDone && updatedAct.recurrence) {
      // toISOString は UTC — JST の午前 9 時前に完了すると前日扱いになり
      // 次回期限が 1 日早まる。ローカル日付で組み立てる。
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const baseStr = updatedAct.deadline || todayLocal;
      const base = new Date(baseStr + 'T00:00:00');
      // 期限が過去（何ヶ月も溜めた繰り返しタスクを今やっと完了）だと、元期限+1周期は
      // まだ過去のまま＝次回インスタンスが即 overdue で湧き、達成率が下がり続ける。
      // 進める基準を max(期限, 今日) にして、次回は必ず未来に落とす。
      const today0 = new Date(todayLocal + 'T00:00:00');
      if (Number.isNaN(base.getTime()) || base < today0) base.setTime(today0.getTime());
      if (!Number.isNaN(base.getTime())) {
        if (updatedAct.recurrence === 'weekly') base.setDate(base.getDate() + 7);
        else if (updatedAct.recurrence === 'monthly') {
          // ⚠️ 素の setMonth(+1) は日数オーバーフローする（1/31 → 3/3 で 2 月が
          // 丸ごとスキップ）。月末アンカーは翌月の末日にクランプして守る。
          const day = base.getDate();
          base.setDate(1);
          base.setMonth(base.getMonth() + 1);
          const daysInNextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
          base.setDate(Math.min(day, daysInNextMonth));
        }
        const nextDeadline = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
        // 表示開始日 (scheduled_for): deadline の N 日前
        const showFrom = new Date(base);
        if (updatedAct.recurrence === 'weekly') showFrom.setDate(showFrom.getDate() - 1);
        else if (updatedAct.recurrence === 'monthly') showFrom.setDate(showFrom.getDate() - 3);
        showFrom.setHours(0, 0, 0, 0);
        // 既に同じ文言の未完了インスタンスが残っているなら spawn しない
        // （二重タップや再完了で同じ繰り返しタスクが増殖するのを防ぐ）。
        const twinText = (target.text || '').trim();
        const hasPendingTwin = acts.some(
          (a, j) => j !== idx && !a.done && (a.text || '').trim() === twinText && a.recurrence === target.recurrence
        );
        if (!hasPendingTwin) {
          acts.push({
            // id を持たせず INSERT 扱いさせる。
            text: target.text,
            deadline: nextDeadline,
            done: false,
            priority: target.priority || 'medium',
            recurrence: target.recurrence,
            sourceMemoId: target.sourceMemoId || null,
            sourcePage: target.sourcePage || null,
            reflection: '',
            completedAt: null,
            scheduledFor: showFrom.toISOString(),
          });
        }
      }
    }

    // 完了 → 直後に未完了へ戻した（誤タップ等）場合、完了時に spawn した次回分を
    // 掃除する。放置すると元行動が未完了のまま次周期の同文言タスクが scheduledFor
    // 到来時に並び、達成率の母数も水増しされる（hasPendingTwin は再 spawn を防ぐ
    // だけで掃除はしない）。「同文言・同 recurrence・未完了・表示開始が未来」の
    // 行だけを対象にするので、既に表示中の正当なインスタンスは消さない。
    if (!becomingDone && updatedAct.recurrence) {
      const twinText = (target.text || '').trim();
      const nowMs = Date.now();
      for (let j = acts.length - 1; j >= 0; j -= 1) {
        const a = acts[j];
        if (!a || a === updatedAct || a.done) continue;
        if ((a.text || '').trim() !== twinText) continue;
        if (a.recurrence !== target.recurrence) continue;
        const sf = a.scheduledFor ? Date.parse(a.scheduledFor) : NaN;
        if (Number.isFinite(sf) && sf > nowMs) acts.splice(j, 1);
      }
    }

    const updated = { ...book, actions: acts };
    // ハプティクスはここで一元発火（becomingDone で成功/軽タップを出し分け）。
    // ActionList 側でも鳴らすと二重ブザーになるため、触覚はこの共通経路に集約する。
    haptic[becomingDone ? 'success' : 'light']();
    // 楽観的 UI: チェックを即時反映（従来は saveBook 完了まで 1-2 秒無反応だった）。
    // current / form のスナップショットにも同時反映（詳細画面のチェック表示 +
    // 後続保存の stale 上書き防止）。
    mutateBookLocal(bookId, () => updated);
    syncActionSnapshots(updated);
    try {
      const saved = await saveBook(updated);
      chainEntry.latest = saved || updated;
      syncActionSnapshots(saved || updated);
      // 繰り返しの次回は、完了の知らせ（「完了。次回は来週」＝元に戻すつき）の 1 か所で伝える
      // （ここで中央の ✓ を重ねると、知らせが 2 つ同時に出ていた・2026-10-04）。
    } catch (error) {
      // rollback: 楽観反映を元に戻す。
      mutateBookLocal(bookId, () => book);
      chainEntry.latest = book;
      syncActionSnapshots(book);
      toast.error(toMessage(error, '行動の更新に失敗しました。'));
    }
  };

  // 🔄→🎯 想起から行動への橋渡し。振り返り（Review）で戻ってきたメモから
  // 「→行動にする」で、メモ本文（とページ）を引いた行動を1タップで作る。
  // 「読んで終わりにしない＝行動に変える」中核ループを想起面でも閉じる。
  // 期限は渡されなければ明日（相談の答えから足す行動と同じ・期限なしだと一覧の最後に沈む・2026-10-10）。
  const addActionFromMemo = async (bookId, { text, sourceMemoId = null, sourcePage = null, deadline = '', source = 'memo' }) => {
    const body = (text || '').trim();
    if (!body) return false;
    if (!booksRef.current.find((b) => b.id === bookId)) return false;
    const newAction = {
      text: body.slice(0, LIMITS.actionText || 500),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : tomorrowLocal(),
      done: false,
      priority: 'medium',
      sourceMemoId,
      sourcePage,
    };
    haptic.light();
    try {
      // トグル/削除と同じ本ごとの直列化チェーンに乗せ、実行時点の最新行に
      // rebase して追加する（並行保存との stale 上書きを防ぐ）。
      await enqueueBookMutation(bookId, async (entry) => {
        const book = entry.latest || booksRef.current.find((b) => b.id === bookId);
        if (!book) throw new Error('本が見つかりませんでした。');
        const updated = { ...book, actions: [...(book.actions || []), newAction] };
        const saved = await saveBook(updated);
        const next = saved || updated;
        entry.latest = next;
        mutateBookLocal(bookId, () => next);
        // 開いている詳細/編集画面のスナップショットにも即反映する。
        // ここで同期しないと、直後の「読了にする」等が stale な actions で
        // saveBook し、いま追加した行動が差分 DELETE で消える。
        syncActionSnapshots(next);
      });
      track(EVENTS.ACTION_ADDED, { source: source === 'consult' ? 'consult' : 'memo' });
      // 追加した行動の目印（相談の「見る」で行動の一覧のその行まで送る・2026-09-30）。真偽としても使える。
      return { bookId, text: newAction.text };
    } catch (error) {
      toast.error(toMessage(error, '行動の追加に失敗しました。'));
      return false;
    }
  };

  // 🎯 行動タブの「＋追加」から、任意の本に行動を新規作成する。
  // ActionEditModal(mode='create') の onSave から呼ばれる。addActionFromMemo と
  // 同じ直列化チェーン + rebase + スナップショット同期の流儀。
  const createActionForBook = async (bookId, payload) => {
    const text = (payload?.text || '').trim();
    if (!bookId || !text) return false;
    const newAction = {
      text: text.slice(0, LIMITS.actionText || 500),
      deadline: payload.deadline || '',
      done: false,
      priority: payload.priority || 'medium',
      recurrence: payload.recurrence || null,
      reflection: '',
      sourceMemoId: null,
      sourcePage: null,
    };
    haptic.light();
    try {
      await enqueueBookMutation(bookId, async (entry) => {
        const book = entry.latest || booksRef.current.find((b) => b.id === bookId);
        if (!book) throw new Error('本が見つかりませんでした。');
        const updated = { ...book, actions: [...(book.actions || []), newAction] };
        const saved = await saveBook(updated);
        const next = saved || updated;
        entry.latest = next;
        mutateBookLocal(bookId, () => next);
        syncActionSnapshots(next);
      });
      track(EVENTS.ACTION_ADDED, { source: payload.source === 'consult' ? 'consult' : 'manual' });
      if (!payload.quiet) toast.success('🎯 行動を追加しました。');
      return true;
    } catch (error) {
      const msg = toSaveMessage(error, '行動の追加に失敗しました。');
      // 行動の追加のモーダルから呼ばれたときは、モーダルの中に出す（知らせはモーダルの下に隠れて読めない・2026-10-04）。
      if (payload.onError) payload.onError(msg); else toast.error(msg);
      return false;
    }
  };

  // 🔁 完了した行動に「やってみてどうだった？」の 1 行を残す（行動タブの完了直後の欄から）。
  //    残したふりかえりは相談の材料（ai.js の buildGrowthBlock「最近の完了とふりかえり」）になる。
  const saveActionReflection = async (bookId, actionIdx, action, reflection) => {
    const text = String(reflection || '').trim().slice(0, LIMITS.memoText || 2000);
    if (!text) return false;
    let ok = false;
    await enqueueBookMutation(bookId, async (entry) => {
      const book = entry.latest || booksRef.current.find((b) => b.id === bookId);
      if (!book) return;
      const acts = [...(book.actions || [])];
      const idx = resolveActionIndex(acts, action, actionIdx);
      if (idx < 0 || idx >= acts.length) return;
      acts[idx] = { ...acts[idx], reflection: text };
      const updated = { ...book, actions: acts };
      mutateBookLocal(bookId, () => updated);
      syncActionSnapshots(updated);
      try {
        const saved = await saveBook(updated);
        entry.latest = saved || updated;
        syncActionSnapshots(saved || updated);
        ok = true;
      } catch (error) {
        mutateBookLocal(bookId, () => book);
        entry.latest = book;
        syncActionSnapshots(book);
        toast.error(toMessage(error, 'ふりかえりを保存できませんでした。'));
      }
    });
    return ok;
  };

  const toggleAction = async (bookId, actionIdx, opts = {}) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    // 呼び出し側が行動そのもの（opts.target）を渡していれば、それで身元を確定する
    const target = (opts.target && (book.actions || []).find((x) => x && opts.target.id && x.id === opts.target.id))
      || (book.actions || [])[actionIdx];
    if (!target) return;
    // 旧実装は「完了化」時に振り返りモーダル (✅ 完了おめでとうございます!)
    // を挟んでいたが、毎回フリクションを増やしていたため撤去。タップ即完了 /
    // 即未完了戻しの軽快操作に統一。reflection は ActionEditModal から
    // いつでも編集可能。
    await applyActionToggle(bookId, actionIdx, { target });
    // 完了は一瞬で一覧から消えるので、取り消せるようにする（押し間違いの救済）。
    // silent: 行動タブは自分の欄（ふりかえり＋元に戻す）を出すので、案内を重ねない。
    if (!target.done && !opts.silent) {
      // 「元に戻す」つきは toast.undo にそろえる（完了なので印は ✓・DESIGN §5 トースト・2026-09-30）。
      toast.undo({
        message: completedActionMessage(target),
        duration: 5000,
        destructive: false,
        success: true, // 印は ✓（完了の知らせ・2026-09-30）
        onUndo: () => { applyActionToggle(bookId, actionIdx, { target }); },
      });
    }
  };

  // undoable: スワイプで消したとき（確認なし）。下のトーストの「元に戻す」で同じ位置に戻せる。
  const deleteActionFromBook = async (bookId, actionIdx, { skipConfirm = false, target = null, undoable = false } = {}) => {
    // ⋮ → 削除は誤タップし得る明示メニュー操作なので、規約どおり確認を挟む
    // （スワイプ削除＝ジェスチャー意図は確認なし + Undo、と役割分担）。
    // ActionEditModal 経由はモーダル側で確認済みなので skipConfirm で二重確認を避ける。
    if (!skipConfirm) {
      const ok = await confirm({
        title: '行動を削除しますか？',
        message: 'この行動を、期限とふりかえりも含めて削除します。元に戻せません。',
        confirmLabel: '削除する',
        cancelLabel: 'やめる',
        danger: true,
      });
      if (!ok) return;
    }
    // トグルと同じ本ごとの直列化チェーンに乗せる。並行の saveBook（トグル進行中）
    // と競合すると、削除した行動が stale upsert で復活し得るため。
    // 対象行の身元を今掴む（index は実行時に再解決 — 行数がずれても別の行を消さない）。
    const delTarget = target || (booksRef.current.find((b) => b.id === bookId)?.actions || [])[actionIdx] || null;
    await enqueueBookMutation(bookId, async (entry) => {
      const book = entry.latest || booksRef.current.find((b) => b.id === bookId);
      if (!book) return;
      const acts = [...(book.actions || [])];
      const idx = resolveActionIndex(acts, delTarget, actionIdx);
      if (idx < 0 || idx >= acts.length) return;
      const [removed] = acts.splice(idx, 1);
      const updated = { ...book, actions: acts };
      mutateBookLocal(bookId, () => updated);
      syncActionSnapshots(updated);
      // スワイプで消したときは、保存を待たずに「元に戻す」を出す（消えた瞬間に知らせる・2026-09-29）。
      //   「元に戻す」は同じ本の直列チェーンに乗るので、この保存が終わってから動く。保存に失敗したら
      //   知らせを下げて、元に戻す処理も何もしない（行は失敗の巻き戻しで戻っている）。
      let deleteFailed = false;
      let undoToastId = null;
      if (undoable && removed) {
        undoToastId = toast.undo({
          message: '行動を削除しました。',
          destructive: true,
          duration: 6000,
          // 同じ本の直列チェーンに乗せて、消した位置に戻す（行は新しく作り直す＝id は付け直し）。
          onUndo: () => enqueueBookMutation(bookId, async (e2) => {
            if (deleteFailed) return;
            const b2 = e2.latest || booksRef.current.find((b) => b.id === bookId);
            if (!b2) return;
            const acts2 = [...(b2.actions || [])];
            // eslint-disable-next-line no-unused-vars
            const { id: _oldId, ...restored } = removed;
            acts2.splice(Math.min(idx, acts2.length), 0, restored);
            const next = { ...b2, actions: acts2 };
            mutateBookLocal(bookId, () => next);
            syncActionSnapshots(next);
            try {
              const s2 = await saveBook(next);
              e2.latest = s2 || next;
              syncActionSnapshots(s2 || next);
            } catch (err) {
              mutateBookLocal(bookId, () => b2);
              e2.latest = b2;
              syncActionSnapshots(b2);
              toast.error(toMessage(err, '行動を戻せませんでした。'));
            }
          }),
        });
      }
      try {
        const saved = await saveBook(updated);
        entry.latest = saved || updated;
        syncActionSnapshots(saved || updated);
        if (!(undoable && removed)) toast.success('行動を削除しました。');
      } catch (error) {
        deleteFailed = true;
        if (undoToastId) toast.dismiss(undoToastId, { skipExpire: true });
        mutateBookLocal(bookId, () => book);
        entry.latest = book;
        syncActionSnapshots(book);
        toast.error(toMessage(error, '行動の削除に失敗しました。'));
      }
    });
  };

  // 画面を下へ送ったら、上の行（ロゴ・ヘルプ・設定）の下に --separator の線を出す（iOS のナビバーと同じ・DESIGN §5「画面上部の 1 行」）。
  // 一番上にいる間は線を出さない（ページと上の行を一体に見せる）。スクロールの箱は key={tab} で作り直されるので、タブ・画面ごとに付け直す。
  const [pageScrolled, setPageScrolled] = useState(false);
  useEffect(() => {
    const el = listScrollRef.current;
    setPageScrolled(!!el && el.scrollTop > 0);
    if (!el) return undefined;
    const onPageScroll = () => {
      const v = el.scrollTop > 0;
      setPageScrolled((p) => (p === v ? p : v));
    };
    el.addEventListener('scroll', onPageScroll, { passive: true });
    return () => el.removeEventListener('scroll', onPageScroll);
  }, [tab, view, shelfMode]);

  // 🔎 検索の言葉で見つかった本（書名・著者・タグ＋メモ・この本のまとめ・読書準備の言葉）。
  // 並びは見つかった順（書名・著者 → メモ）。メモは検索を始めたときに読む（lib/librarySearch.js・2026-09-30）。
  const librarySearch = useLibrarySearch({ userId: user?.id, books, query: search, active: tab === 'books' && shelfMode === 'library' });
  const libraryHits = librarySearch.hits;
  const libraryQuery = librarySearch.query;
  const filtered = useMemo(() => {
    const list = books.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (folderFilter && !((b.collections || []).includes(folderFilter))) return false;
      if (minRating > 0 && (b.rating || 0) < minRating) return false;
      if (tagFilter.length > 0) {
        const bt = (b.tags || []).map((t) => (t || '').toLowerCase());
        if (!tagFilter.some((t) => bt.includes(t.toLowerCase()))) return false;
      }
      return !libraryHits || libraryHits.has(b.id);
    });
    // 検索中は見つかった順（並び替えの設定より、言葉が合う本を先に）。
    if (libraryHits) return list.sort((a, b) => libraryHits.get(a.id).rank - libraryHits.get(b.id).rank);

    const titleKey = (b) => (b.title || '').toLowerCase();
    const created = (b) => b.created_at || b.startDate || '';
    const updated = (b) => b.updated_at || b.startDate || b.doneDate || '';

    const sorted = [...list];
    if (sortBy === 'title') {
      sorted.sort((a, b) => titleKey(a).localeCompare(titleKey(b), 'ja'));
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || updated(b).localeCompare(updated(a)));
    } else if (sortBy === 'created') {
      sorted.sort((a, b) => created(b).localeCompare(created(a)));
    } else {
      sorted.sort((a, b) => updated(b).localeCompare(updated(a)));
    }
    return sorted;
  }, [books, statusFilter, libraryHits, sortBy, minRating, tagFilter, folderFilter]);

  // 絞り込みシート用: 本に付いている分野（一覧の順・冊数つき・2026-10-11）。
  const availableTags = useMemo(() => {
    const counts = new Map();
    for (const b of books) for (const f of fieldsOf(b)) counts.set(f, (counts.get(f) || 0) + 1);
    return BOOK_FIELDS.filter((f) => counts.has(f)).map((f) => ({ name: f, count: counts.get(f) }));
  }, [books]);

  // アクティブな絞り込み数（ツールバーのバッジ表示用）。
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (minRating > 0 ? 1 : 0) + tagFilter.length + (folderFilter ? 1 : 0);
  const clearAllFilters = () => { setStatusFilter('all'); setMinRating(0); setTagFilter([]); setFolderFilter(null); };


  // 状態チップの件数は、ほかの絞り込み（評価・タグ・フォルダ・検索）を効かせた数（並ぶ本の数と合わせる）。
  const chipStats = useMemo(() => {
    const base = books.filter((b) => {
      if (folderFilter && !((b.collections || []).includes(folderFilter))) return false;
      if (minRating > 0 && (b.rating || 0) < minRating) return false;
      if (tagFilter.length > 0) {
        const bt = (b.tags || []).map((t) => (t || '').toLowerCase());
        if (!tagFilter.some((t) => bt.includes(t.toLowerCase()))) return false;
      }
      return !libraryHits || libraryHits.has(b.id);
    });
    const out = { total: base.length };
    base.forEach((b) => { out[b.status] = (out[b.status] || 0) + 1; });
    return out;
  }, [books, libraryHits, minRating, tagFilter, folderFilter]);
  const stats = useMemo(() => ({ total: books.length, want: books.filter((b) => b.status === "want").length, before: books.filter((b) => b.status === "before").length, reading: books.filter((b) => b.status === "reading").length, done: books.filter((b) => b.status === "done").length }), [books]);
  const actionCount = useMemo(() => books.reduce((s, b) => s + (b.actions || []).filter((a) => a.text?.trim()).length, 0), [books]);
  const actionDone = useMemo(() => books.reduce((s, b) => s + (b.actions || []).filter((a) => a.done).length, 0), [books]);
  // メモのタグの候補に添える本のタグ（分野は本の分け方なので、メモのタグの候補には入れない・2026-10-11）。
  const allTags = useMemo(() => { const s = new Set(); books.forEach((b) => (b.tags || []).forEach((t) => { if (!isBookField(t)) s.add(t); })); return [...s]; }, [books]);

  // ⏱ 集中モード（読書の時間・2026-10-09・SPEC §2-2）。入口は読書中の本の詳細とホームのいま読んでいる本の「読む」。
  //   focusStartBook: 始める前のシートの本。focusRun: { book, state, phase } 画面いっぱいの集中モード。
  const [focusStartBook, setFocusStartBook] = useState(null);
  const [focusRun, setFocusRun] = useState(null);
  const openFocusStart = useCallback((b) => { haptic.light(); setFocusStartBook(b); }, [haptic]);
  // シート（読む前のシート・写真で共有）や集中モードを開いたら、本に結びついた知らせを閉じる
  // （「保存しました。」＋行動に追加などがシートの上に重なっていた・2026-10-10）。元に戻すなどの処理は走らせない。
  const sheetOverBook = !!(focusStartBook || focusRun || shareSheet);
  useEffect(() => {
    if (!sheetOverBook) return;
    bookToastsRef.current.forEach((_bookId, id) => toast.dismiss(id, { skipExpire: true }));
    bookToastsRef.current.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOverBook]);
  // 途中で閉じた・裏に回して落ちたときは、本を読み込んだら端末に残った状態から再開する（始めた時刻から数え直す）。
  const focusRestored = useRef(false);
  useEffect(() => {
    if (focusRestored.current || booksLoading || books.length === 0) return;
    focusRestored.current = true;
    // 🧪 お試しモード: &focus=timer|count|long|fresh|paused|done|summary|start|until|untilrun で、読書中の本の集中モードを開く。
    const demoFocus = isDemo ? new URLSearchParams(window.location.search).get('focus') : null;
    if (demoFocus) {
      const b = books.find((x) => x.title === '数値化の鬼') || books.find((x) => x.status === 'reading') || books[0];
      if (demoFocus === 'start' || demoFocus === 'until') { setFocusStartBook(demoFocus === 'until' ? { ...b, focusUntil: true } : b); return; }
      const t = Date.now();
      const MIN = 60 * 1000;
      const st = demoFocus === 'count'
        ? { ...startFocus({ bookId: b.id, mode: 'count' }, t - 32 * MIN - 20000) }
        : demoFocus === 'long' ? startFocus({ bookId: b.id, mode: 'count' }, t - 75 * MIN - 20000)
        : demoFocus === 'fresh' ? startFocus({ bookId: b.id, mode: 'timer', minutes: 15 }, t - 10000)
        : demoFocus === 'done' ? startFocus({ bookId: b.id, mode: 'timer', minutes: 30 }, t - 30 * MIN - 5000)
          : demoFocus === 'paused' ? pauseFocus(startFocus({ bookId: b.id, mode: 'timer', minutes: 30 }, t - 12 * MIN), t)
            : demoFocus === 'untilrun' ? startFocus({ bookId: b.id, mode: 'timer', untilMs: Math.ceil((t + 28 * MIN) / (5 * MIN)) * 5 * MIN }, t - 4 * MIN)
              : startFocus({ bookId: b.id, mode: 'timer', minutes: 30 }, t - 7 * MIN - 10000);
      setFocusRun({ book: b, state: st, phase: demoFocus === 'summary' ? 'summary' : null });
      return;
    }
    // 12 時間より前に始めて置き忘れたものは再開しないが、読んだ時間は 1 回分として残す（タイマーは長さまで・計測は 6 時間まで）。
    const saved = loadFocusState(Date.now(), undefined, {
      onStale: (row) => { if (books.some((x) => x.id === row.book_id)) readingSessions.save(user?.id || null, row); },
    });
    if (!saved) return;
    const b = books.find((x) => x.id === saved.bookId);
    if (!b) { saveFocusState(null); return; }
    setFocusRun({ book: b, state: saved, phase: null });
  }, [booksLoading, books]);
  const startFocusRun = ({ mode, minutes, untilMs }) => {
    const b = focusStartBook;
    if (!b) return;
    const st = startFocus({ bookId: b.id, mode, minutes, untilMs });
    saveFocusState(st);
    setFocusStartBook(null);
    setFocusRun({ book: b, state: st, phase: null });
  };
  // 集中モードの層（本の詳細と、ほかの画面の両方の木に置く＝どちらから始めても同じ）。
  const focusLayer = (
    <>
      {focusStartBook && (
        <Suspense fallback={<OverlayFallback />}>
          <FocusStartSheet onStart={startFocusRun} onClose={() => setFocusStartBook(null)} initialUntil={!!focusStartBook.focusUntil} />
        </Suspense>
      )}
      {focusRun && (
        <Suspense fallback={null}>
          <FocusMode
            key={focusRun.state.startedAt}
            book={books.find((x) => x.id === focusRun.book.id) || focusRun.book}
            initial={focusRun.state}
            initialPhase={focusRun.phase}
            allTags={allTags}
            onClose={() => { saveFocusState(null); setFocusRun(null); }}
            onOpenFullEditor={(prefill) => {
              const b = focusRun.book;
              setFocusRun(null);
              openDetail(b);
              setFullEditorPrefill(prefill);
            }}
          />
        </Suspense>
      )}
    </>
  );
  // フォルダ（コレクション）一覧 — 本に付いた collection 名の集合（冊数つき・名前順）。
  const allFolders = useMemo(() => {
    const counts = new Map();
    books.forEach((b) => (b.collections || []).forEach((c) => { const n = (c || '').trim(); if (n) counts.set(n, (counts.get(n) || 0) + 1); }));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja')).map(([name, count]) => ({ name, count }));
  }, [books]);
  const folderNames = useMemo(() => allFolders.map((f) => f.name), [allFolders]);
  // フォルダが空になって消えたら、選択中フィルタを「すべて」に戻す（迷子防止）。
  useEffect(() => {
    if (folderFilter && !folderNames.includes(folderFilter)) setFolderFilter(null);
  }, [folderFilter, folderNames]);

  // 🔄 PWA 更新の「安全状態」判定。本棚のリスト画面 + 本棚タブ + どのモーダルも
  // 開いていない時のみ true。ここが true の時だけ UpdateBanner が表示される。
  // 入力フォーカスの判定は UpdateBanner 内 (focusin/focusout) で別途行う。
  const safeForUpdate = (
    view === 'list'
    && tab === 'books'
    && !addBookModalOpen
    && !showOnboarding
    && !settingsOpen
    && !helpModalOpen
    && !quickMemoOpen
    && !thanksOpen
    && !fullEditorPrefill
    && !editingAction
    && !searchOpen
    && !detailKebab
    && !bookContextMenu
  );

  // 🆕 更新したあと、はじめて開いたときに 1 回だけ「新しくなったこと」（2026-10-05・hooks/useWhatsNew.js）。
  // 新しい版の知らせと同じ「ホームが落ち着いたとき」に加えて、初日クイックスタート・取り込み・共有・運営・表紙の直しの間も出さない。
  // 新規の人（初回ガイドがまだ・本が 0 冊）には出さず、いまの版を見たことにする。
  const whatsNew = useWhatsNew({
    ready: !booksLoading && !booksLoadError,
    isNewUser: () => !isOnboardingCompleted() || books.length === 0,
    safe: safeForUpdate && !booksLoading && !showQuickstart && !showImport && !shareSheet && !adminOpen && !coverFixForBook,
  });

  // 📚 初日クイックスタート。初回ガイドはどの画面（一覧/詳細/編集）でも出るので、
  // その隣に同じものを置く（下の各 return で {quickstartOverlay} を描画）。
  const importOverlay = showImport ? (
    <Suspense fallback={null}>
      <ImportSheet
        onImport={importLibrary}
        onUndoImport={undoImport}
        existingBooks={books}
        loadMemoTexts={loadImportMemoTexts}
        onClose={() => setShowImport(false)}
        // メモも感想も無い新しい本に、初日クイックスタートの「一言」の段から一言を足す（2026-09-29）。
        onAddOneLine={(bare) => {
          setShowImport(false);
          setQuickstartSeed(bare);
          setShowQuickstart(true);
        }}
        // 送らずに相談を開く（勝手にトークンを使わない・2026-09-29）。入力欄には、取り込んだメモのある本から作った相談を
        //   入れておく（2026-10-02・lib/firstDay.js＝送るのは本人が送信を押したとき）。
        onAsk={(outcome) => {
          setShowImport(false);
          const consultBooks = Array.isArray(outcome?.consultBooks) ? outcome.consultBooks : [];
          openConsultDraft(firstConsultQuestion({ books: consultBooks, memoBookIds: new Set(outcome?.memoBookIds || []) }), 'import');
        }}
      />
    </Suspense>
  ) : null;
  const quickstartOverlay = showQuickstart ? (
    <Suspense fallback={null}>
      <PastBooksQuickstart
        onImport={() => { setShowQuickstart(false); setQuickstartSeed(null); setShowImport(true); }}
        books={books}
        initialBooks={quickstartSeed}
        onSaveBook={saveQuickstartBook}
        // 一言を書いた本が「読みたい・積読」のままだと、本の詳細にメモが出ない → 読了にする
        onMarkRead={(bookId) => applyBookPatchQuiet(bookId, { status: 'done' })}
        onMemosAdded={() => {
          appCache?.notifyMemosChanged?.();
          if (takeOnboardPathDone('quickstart')) track('onboard_path_done', { path: 'quickstart' });
        }}
        onAsk={(question) => {
          setShowQuickstart(false);
          setQuickstartSeed(null);
          refreshBooks();
          setAskPreset({ question, nonce: Date.now() });
          setView('list');
          setAiSubTab('brain');
          setTab('ai');
        }}
        onClose={() => { setShowQuickstart(false); setQuickstartSeed(null); refreshBooks(); }}
        onWriteMemo={(bookId) => {
          setShowQuickstart(false);
          setQuickstartSeed(null);
          setPendingMemoBookId(bookId);
          refreshBooks();
        }}
      />
    </Suspense>
  ) : null;

  // ===== DETAIL =====
  if (view === "detail" && current) {
    const st = getSt(current.status);
    const nextStatus = { want: "before", before: "reading", reading: "done" };
    // 「積読へ進む」は日本語として変（積読は進む先ではなく積む場所）。
    // 定義（読みたい=気になる / 積読=手元にある）に合わせ「積読に積む」へ。
    const nextLabel = { want: "積読に積む", before: "読書を開始する", reading: "読了にする" };
    const isMemoPhase = current.status === "reading" || current.status === "done";
    // 詳細画面の部品（DESIGN.md のトークンのみ）。
    const cardStyle = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
    const detailsStyle = { ...cardStyle, marginTop: 'var(--space-3)', padding: '0 var(--space-4)' };
    const summaryStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', minHeight: 48, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none' };
    // 見出し「メモ」「行動」「読書計画」は同じ形（20・600・下 8）。
    const detailH2Style = { fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-2)', lineHeight: 1.3 };
    // 押せる行（この本に相談する）の中の文字ボタンの縦の余り（高さ 44 のうち文字の上下）を詰める。
    const textBtnInCard = { ...btnText, fontSize: 'var(--text-sub)', padding: 0, marginBottom: 'calc(-1 * var(--space-3))' };
    // 畳んだ中の小さな見出し（DESIGN §5 groupTitle・12/600/--text-2）。
    const subLabelStyle = { ...groupTitle, margin: '0 0 var(--space-2)' };
    // 読書計画の中身（得たいこと・課題・仮説・シート）。読書中・読了では 1 つの「読書計画」に畳む。
    const planItems = [
      current.investPurpose && { label: 'この本から得たいこと', text: current.investPurpose },
      current.currentChallenge && { label: '現在の課題', text: current.currentChallenge },
      current.hypothesis && { label: '仮説', text: current.hypothesis },
      // 読みたい本は、AI 選書で選んだ理由も見せる（編集の画面にしか無く、なぜ追加したか分からなくなっていた・2026-09-30）。
      current.status === 'want' && current.bookReason && { label: 'AI の選書理由', text: current.bookReason },
    ].filter(Boolean);
    const hasPlanFold = planItems.length > 0 || !!current.aiStrategy;
    // 読書中の「この本について」の畳む見出し（紹介か目次が見つかった本だけ）。
    // 読み込み中は同じ形の骨組みの行（読み込んで何も無ければ消える）。
    const aboutFoldShown = current.status === 'reading' && (hasBookInfo(bookAbout.info) || bookAbout.loading);
    // 📖 読みたい・積読の「この本について」は 1 枚のカード（紹介文と目次・この本で学べること・2026-10-09 オーナー「説明を 1 か所に」）。
    //   読みたいと、まだ何も書いていない積読は紹介文を 3 行見せるカード。課題・仮説・シートがある積読は、1 行目を畳む行
    //   「この本について」にした同じカード（主ボタン「読書を開始する」を 390×844 の最初の画面に残す＝compact）。
    const aboutShown = current.status === 'want' || current.status === 'before';
    const aboutCompact = current.status === 'before' && hasPlanFold;
    // 📖 この本で学べること（2026-10-08）。積読では仮説の例を押すと読書計画の編集画面の仮説の欄に入る（読みたいは見るだけ）。
    const briefText = storedBriefOf(current);
    const hasBrief = isUsableBrief(parseBrief(briefText));
    const briefMaterial = hasBriefMaterial(bookAbout.info);
    const briefMaking = briefGenId === current.id;
    const briefPick = current.status === 'before' ? (h) => pickHypothesisFromDetail(current, h) : undefined;
    const briefInCard = (
      <BookBrief
        variant="inCard"
        flush={aboutCompact}
        // 作ったその場だけ開いたまま（画面を離れたら畳む＝briefJustMadeId は画面・本が変わると消える）。
        defaultOpen={briefJustMadeId === current.id}
        text={briefText}
        material={briefMaterial}
        making={briefMaking}
        costLine={briefCostLine}
        // 行の右の目安（「1 回 約 2 トークン」・残りは相談・設定で見る）。
        costShort={`1 回 約 ${TOKEN_COSTS.bookBrief} トークン`}
        infoLoading={bookAbout.loading}
        onMake={() => makeBookBrief(current)}
        onRemake={() => remakeBookBrief(current)}
        onPickHypothesis={briefPick}
        pickedHypotheses={current.hypothesis || ''}
        info={bookAbout.info}
        error={briefError?.bookId === current.id ? briefError.message : ''}
      />
    );
    // 作ってあるのに紹介・目次が今は読めない（通信の失敗など）ときは、カードの代わりに中身だけを出す。
    const briefWithoutAbout = hasBrief && !bookAbout.loading && !hasBookInfo(bookAbout.info);
    // 読書中・読了の画面の下で、直前が「行動」「一番の収穫」なら 24、畳む見出しが続くなら 12。
    const visibleActionCount = (current.actions || []).filter((a) => a.text?.trim() && !isScheduledLater(a)).length;
    const hasHarvestBlock = !!current.roiSummary || (current.status === 'done' && !(current.roiSummary || '').trim());
    // 読書中・読了では直前に行動のまとまり（0 件でも「＋ 行動を追加」）があるので、いつも 24 空ける。
    const planFoldTop = 'var(--space-6)';
    const planCta = (
      <>
          {/* AI 読書計画導線 — どのステータスでも setup フィールドが
              足りていなければ目立つ位置で促す。
              - before:    まだ読んでいないので「最初のメインアクション」として
                           ブランドのグラデーションで前面に出す。完了済みなら
                           緑の完了表示を返す。
              - reading:   読書中の救済バナー（黄色 / warning ）。done は
                           今さら遡る価値が薄いので対象外。 */}
          {(() => {
            // 「未完了」の基準は投資目的の有無のみ。AI 解析/計画シートは任意の
            // 補助なので、AI を使わない選択をしたユーザーに永久バナーで
            // 迫らない（目的なき読書をしない、が守られていれば十分）。
            const isIncomplete = !(current.investPurpose || '').trim();

            if (current.status === 'before') {
              // 「できています」はシート本体（aiStrategy）があるときだけ。得たいこと等を書いただけなら
              // まだ作れる状態なので副ボタンを出す（開くと書いた欄はそのまま引き継ぐ＝buildFormFromBook）。
              if (isIncomplete || !(current.aiStrategy || '').trim()) {
                // 見出しとボタンが同じことを言っていたので、副ボタン 1 つだけ（主ボタンは下の「読書を開始する」）。
                // 課題・仮説のカードがあれば、その下 12 に置く（SPEC §2）。
                // 得たいことがあれば押すとその場で作る（runStrategyInPlace・2026-09-29）。作っている間は
                // ボタンが「作成中…」になり、その下にシートの形の骨組み → 書かれていくシートを出す。
                const genHere = planGen && planGen.bookId === current.id;
                return (
                  <div style={{ marginTop: hasPlanFold ? 'var(--space-3)' : 'var(--space-6)' }}>
                    <button type="button" onClick={() => runStrategyInPlace(current)} disabled={!!planGen}
                      aria-busy={genHere || undefined} style={planGen ? btnGhostOff : btnGhost}>
                      {/* 無料プランには押す前に有料と分かる印（「AI に答えてもらう（プラン）」と同じ作法・2026-10-09） */}
                      {genHere ? '作成中…' : paywallFree ? '読書計画シートを作る（プラン）' : '読書計画シートを作る'}
                    </button>
                    {/* プラン・7 日間無料の人には 1 回の目安と残り（下 8・13/--text-3・無料プランは「（プラン）」の印だけ）。 */}
                    {!genHere && !paywallFree && planCostLine && (
                      <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(planCostLine)}</p>
                    )}
                    {genHere && (
                      <div role="status" aria-live="polite" aria-label="読書計画シートを作っています" style={{ marginTop: 'var(--space-3)' }}>
                        {!planGen.text ? (
                          <div className="ai-skeleton" aria-hidden="true">
                            <div className="ai-skeleton-line" style={{ width: '90%' }} />
                            <div className="ai-skeleton-line" style={{ width: '76%' }} />
                            <div className="ai-skeleton-line" style={{ width: '58%' }} />
                          </div>
                        ) : (
                          <div aria-hidden="true">
                            <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>
                              読書計画シート
                              <span className="streaming-cursor" style={{ marginLeft: 'var(--space-1)' }} />
                            </p>
                            {/* 書いている途中は関連書籍の「読みたい」ボタンを出さない（BeforePhase と同じ） */}
                            <MarkdownSections flat text={planGen.text} pendingRelated />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              // 完了済み: 控えめな完了表示 + 編集導線。
              // いま作ったばかりでシートを開いて見せているときは「できています」は言わない（見ればわかる）。
              if (justMadePlanId === current.id) {
                return (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <button type="button" onClick={() => openSetup(current)} style={{ ...btnText, fontSize: 'var(--text-sub)' }}>
                      読書計画シートを編集する
                    </button>
                  </div>
                );
              }
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 0 }}>
                    <CheckCircle2 size="1.1em" aria-hidden="true" style={{ color: 'var(--success)' }} />
                    読書計画シートができています
                  </p>
                  <button type="button" onClick={() => openSetup(current)} style={{ ...btnText, fontSize: 'var(--text-sub)' }}>
                    編集する
                  </button>
                </div>
              );
            }

            if (current.status === 'reading' && isIncomplete) {
              return (
                <div style={{ ...cardStyle, marginTop: 'var(--space-6)' }}>
                  <p style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, fontWeight: 600 }}>
                    この本から得たいことが、まだありません
                  </p>
                  <button type="button" onClick={() => openSetup(current)} style={textBtnInCard}>
                    読書計画シートを作る
                  </button>
                </div>
              );
            }

            return null;
          })()}
      </>
    );
    // 読書計画・目的・課題・仮説・AI 解析（旧: 書名の直下）。読書中・読了では下へ回す。
    const planBlock = (
      <>
          {/* 📖 この本について（読みたい・積読）: 出版社・書店の紹介文＋目次（AI なし）と、その中の「この本で学べること」の 1 枚。
              見つからない本は出さない。課題・仮説・シートのある積読は 1 行目を畳む行にしたカード（compact・SPEC §2・2026-10-09）。
              作ってあるのに紹介・目次が今は読めない（通信の失敗など）ときは、中身だけを畳む見出しで。 */}
          {aboutShown && !briefWithoutAbout && (
            <BookAbout info={bookAbout.info} loading={bookAbout.loading} variant={aboutCompact ? 'compact' : 'card'} style={{ marginTop: 'var(--space-6)' }} briefSlot={briefInCard} briefRow />
          )}
          {aboutShown && briefWithoutAbout && (
            <BookBrief variant="fold" text={briefText} material={briefMaterial} making={briefMaking} onMake={() => makeBookBrief(current)} onRemake={() => remakeBookBrief(current)} onPickHypothesis={briefPick} pickedHypotheses={current.hypothesis || ''} info={bookAbout.info} error={briefError?.bookId === current.id ? briefError.message : ''} defaultOpen={briefJustMadeId === current.id} style={{ marginTop: 'var(--space-6)' }} />
          )}

          {current.status !== 'before' && planCta}

          {/* Phase-specific content */}

          {/* ラベルは中身と一致させる。旧: 1 枚だけなのに「目的・課題・仮説」と
              名乗り、課題(currentChallenge)・仮説(hypothesis)はどこにも表示されず
              「入力したのに消えた」ように見えていた。 */}
          {/* 得たいこと・課題・仮説と読書計画シートは 1 つのまとまり（間 8）。
              読書中・読了では行動の下に置くので、上と 24 離して見出しを付ける。 */}
          {/* 読書中・読了: 得たいこと・課題・仮説・シートを 1 つの「読書計画」に畳む（メモが主役・SPEC §2）。
              右に中身の一覧を 13 の --text-3 で（「この本のまとめ」と同じ形）。 */}
          {isMemoPhase && hasPlanFold && (
            <details style={{ ...detailsStyle, marginTop: planFoldTop }}>
              <summary style={summaryStyle}>
                読書計画
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[
                      ...planItems.map((p) => (p.label === 'この本から得たいこと' ? '得たいこと' : p.label === '現在の課題' ? '課題' : p.label)),
                      ...(current.aiStrategy ? ['シート'] : []),
                    ].join('・')}
                  </span>
                  <ChevronDown size="1.2em" aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                </span>
              </summary>
              <div style={{ paddingBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {planItems.map((p) => (
                  <div key={p.label}>
                    <p style={subLabelStyle}>{p.label}</p>
                    {/* 自分で書いた文（得たいこと・課題・仮説）は読む文章＝明朝 18・行間 1.6（メモ本文と同じ・DESIGN §2・2026-09-30） */}
                    <p style={{ fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.text}</p>
                  </div>
                ))}
                {current.aiStrategy && (
                  <MarkdownSections
                    flat
                    text={current.aiStrategy}
                    onAddRelatedBook={addRelatedBookFromAi}
                    addingTitles={addedRelatedTitles}
                  />
                )}
              </div>
            </details>
          )}

          {/* 読みたい・積読: 読む準備が主役なので、得たいこと・課題・仮説は開いて見せる。
              シートは、あるときだけ畳んで置く。 */}
          {!isMemoPhase && hasPlanFold && (
          // この本についてのカードの下は 12（読む準備の 1 つのまとまり）。カードが出ない本は 24。
          <section style={{ marginTop: aboutShown && (bookAbout.loading || hasBookInfo(bookAbout.info) || hasBrief) ? 'var(--space-3)' : 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {current.status === 'before' && planItems.length > 0
            ? <PlanCard items={planItems} style={{ marginTop: 0 }} />
            : planItems.map((p) => <Card key={p.label} label={p.label} text={p.text} style={{ marginTop: 0 }} />)}
          {current.aiStrategy && (
            // その場で作り終えた直後は開いたまま（key を変えて、開いた状態で置き直す）。
            <details id="plan-sheet-fold" key={justMadePlanId === current.id ? 'plan-made' : 'plan'} open={justMadePlanId === current.id || undefined} style={{ ...detailsStyle, marginTop: 0, scrollMarginTop: 'var(--space-16)' }}>
              <summary style={summaryStyle}>
                読書計画シート
                <ChevronDown size="1.2em" aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </summary>
              <div style={{ paddingBottom: 'var(--space-4)' }}>
                <MarkdownSections
                  flat
                  text={current.aiStrategy}
                  onAddRelatedBook={addRelatedBookFromAi}
                  addingTitles={addedRelatedTitles}
                />
              </div>
            </details>
          )}
          </section>
          )}

          {current.status === 'before' && planCta}

          {/* 📖 この本について（読書中）: メモが主役なので、読書計画の下に畳んで置く（SPEC §2・2026-10-02）。 */}
          {aboutFoldShown && (
            <BookAbout info={bookAbout.info} loading={bookAbout.loading} variant="fold" style={{ marginTop: hasPlanFold ? 'var(--space-3)' : planFoldTop }} />
          )}

          {/* 「AIで本を解析する」は 2026-09-27 に廃止。以前の結果は「…」の「以前の AI 解析を見る」のシートへ（2026-10-09）。 */}

      </>
    );

    return (
      <Shell>
        {/* 左端スワイプで指に付いてくる画面＝上の行と中身をまとめた箱（getTarget が返す・2026-09-30）。 */}
        <div data-swipe-target="" style={swipeScreenStyle}>
        {/* 「‹ 戻り先」の行はスクロールの箱の外（下へ送っても残る・PushedTopBar）。 */}
        <PushedTopBar scrollRef={detailScrollRef}>
            {/* iOS ナビ風: 指が最初に探す左上の戻るは、背景に沈まない重みで。 */}
            {/* 戻るは「すべての本」の ‹ ホーム と同じ形（ChevronLeft 20・間 0・見た目の左端 16・本文サイズ・--accent）。 */}
            <button onClick={leaveDetail} style={{ display: 'inline-flex', alignItems: 'center', gap: 0, minHeight: 44, padding: '0 var(--space-2) 0 0', marginLeft: BACK_CHEVRON_PULL, background: 'none', border: 'none', color: 'var(--accent)', fontSize: BACK_LABEL_SIZE, whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer' }}>
              <ChevronLeft size={20} aria-hidden="true" />{detailBackToSearch ? '検索' : tab === 'review' ? '振り返り' : tab === 'ai' ? (aiSubTab === 'advisor' ? 'AI 選書' : '相談') : shelfMode === 'library' ? 'すべての本' : 'ホーム'}
            </button>
            <div style={{ display: "flex", gap: 'var(--space-1)', marginRight: 'calc(-1 * var(--space-3))' }}>
              {/* 📷 写真で共有（読書中・読了・SPEC §2-1）: ホームと同じ文字つき（アイコンだけだと「写真から書き起こす」と
                  見分けにくい）。押すとすぐカメラ。読了にした直後は下の「読了を写真で共有」があるので出さない（入口を二重にしない）。 */}
              {isMemoPhase && justDoneId !== current.id && (
                <button
                  type="button"
                  onClick={() => openShareCamera({ book: current, from: 'detail' })}
                  aria-label="写真で共有"
                  // 文字はタブの画面の上の行と同じ上限（--text-bar-max）で止め、1 行に（文字サイズを大きくすると「写真で共／有」と割れていた・2026-10-04）。
                  style={{ ...btnLink, fontSize: 'min(var(--text-sub), var(--text-bar-max))', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', padding: '0 var(--space-2)' }}
                >
                  <Camera size={22} strokeWidth={1.75} aria-hidden="true" />
                  写真で共有
                </button>
              )}
              {/* ⋯ kebab — 編集 / 共有 / 削除 / ヘルプ を集約。下部の 3 ボタン廃止。 */}
              <button
                onClick={openDetailKebab}
                style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                aria-label="その他の操作"
                title="その他"
              >
                <MoreHorizontal size={22} aria-hidden="true" />
              </button>
            </div>
        </PushedTopBar>
        <OfflineNotice />
        <div
          ref={detailScrollRef}
          className="detail-enter"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehaviorY: 'contain',
            WebkitOverflowScrolling: 'touch',
            // 下は右下の「メモを書く」の上まで、いちばん下のボタンを送れる分（ボタンの高さ＋12＋16＋セーフエリア・2026-09-30）。
            // 読了にした直後（「読了を写真で共有」を出している間）は、その上の「読了にしました。」の知らせの分（64）も足す
            // （いちばん下のボタンが知らせの下に隠れていた・2026-10-04）。
            padding: `0 var(--space-4) ${justDoneId && current && justDoneId === current.id ? JUST_DONE_CLEARANCE : FAB_CLEARANCE}`,
          }}
        >

          {/* Book header */}
          {/* 文字サイズを大きくしたときは、書名の列を表紙の下へ回す（列の幅 12rem＝ふだん 204 は表紙の横 270 に収まる・
              大きいと書名が 1 行 3〜4 字に詰まり「1兆ドルコ／ーチ」と割れていた・2026-10-04 ui-critic）。 */}
          <div style={{ display: "flex", flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            {/* 表紙の選び直し・取り直し・アップロードは「⋯」メニューへ（表紙の下の小さな
                リンクは 10pt・高さ 32 で DESIGN 基準に届かないため撤去）。 */}
            {/* MiniCover は表紙が読めない（壊れた URL・1×1 のダミー）ときも書名入りの表紙に切り替わる */}
            <MiniCover book={current} width={72} />
            <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
              {/* 書名＝この画面の主題（28・700）。見出し「メモ」「行動」（20・600）と差をつける。 */}
              <h1 style={{ fontSize: "var(--text-title)", fontWeight: 700, color: "var(--text)", lineHeight: 1.25, margin: 0, overflowWrap: "anywhere", wordBreak: "keep-all", lineBreak: "strict", textWrap: "balance", display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{titleWithPhraseBreaks(current.title)}</h1>
              {current.author && <p style={{ fontSize: 'var(--text-sub)', color: "var(--text-2)", margin: "var(--space-1) 0 0", wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(current.author, { scriptBreaks: true })}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', marginTop: "var(--space-2)", flexWrap: "wrap" }}>
                {/* 状態は押せない表示なので面を付けない（DESIGN §5「表示用ラベル」）。 */}
                <StatusLabel status={current.status} />
                {current.rating > 0 && <Stars r={current.rating} size="calc(14rem / 17)" />}
              </div>
              {(current.startDate || current.doneDate) && (
                <p style={{ fontSize: 'var(--text-meta)', color: "var(--text-3)", margin: 'var(--space-2) 0 0' }}>
                  {current.startDate && <>開始 {fmtDateJa(current.startDate)}</>}{current.startDate && current.doneDate && '　'}{current.doneDate && <>読了 {fmtDateJa(current.doneDate)}</>}
                </p>
              )}
              {/* ⏱ この本の読書の時間（集中モードで測った合計・読書中と読了だけ・0 なら出さない・2026-10-10）。 */}
              {(current.status === 'reading' || current.status === 'done') && (
                <BookReadingTime bookId={current.id} style={current.startDate || current.doneDate ? undefined : { marginTop: 'var(--space-2)' }} />
              )}
              {/* ⏱ 読む（集中モード・読書中だけ・2026-10-09）。主役の「メモを書く」（右下の塗り）より弱い、枠の小さな副ボタン。 */}
              {current.status === 'reading' && (
                <button
                  type="button"
                  onClick={() => openFocusStart(current)}
                  aria-label={`『${current.title}』を読む（集中モード）`}
                  data-focus-entry=""
                  style={{ ...btnRow, marginTop: 'var(--space-3)' }}
                >
                  <Timer size="1.1em" strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />読む
                </button>
              )}
            </div>
          </div>

          {/* 🏷 分野（2026-10-11）: 押すと、すべての本をその分野で絞る。分野でない前の版のタグは出さない（フォルダへ移す）。 */}
          <BookFieldLinks fields={fieldsOf(current)} onPick={openLibraryByField} />

          {/* 読みたい・積読は「読む準備」が主役なので、計画・目的・AI 解析を上に置く。
              読書中・読了はメモが主役（SPEC §2）なので、これらは画面の下（行動の後）へ。 */}
          {!isMemoPhase && planBlock}

          {/* 📖 進捗バー（ページ）は撤去（本田哲学=作業量より成果。ROI は行動で測る）。 */}

          {(current.status === "reading" || current.status === "done") ? (
            <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {/* SPEC §2 の並び: メモ一覧 → この本に相談する → この本のまとめ → 行動（→ 計画・AI 解析は下）。
                  「この本に相談する」は BookMemoList の afterList で一覧のすぐ下（まとめの上）に置く。 */}
              <section aria-labelledby="detail-memo-title">
                <h2 id="detail-memo-title" style={detailH2Style}>メモ</h2>
                <BookMemoList
                  bookId={current.id}
                  bookTitle={current.title}
                  bookAuthor={current.author || ""}
                  summaryText={current.leverageMemo || ""}
                  onSaveSummary={handleSaveSummaryFromCurrent}
                  onMakeAction={addActionFromMemo}
                  onShareMemo={(memo) => setShareSheet({ book: current, initialMemoId: memo.id })}
                  focusMemoId={detailFocusMemoId}
                  editFocusedMemo={!!detailEditMemoId && detailEditMemoId === detailFocusMemoId}
                  onEditFocusedOpened={() => setDetailEditMemoId(null)}
                  onWriteMemo={() => setQuickMemoOpen(true)}
                  books={books}
                  savedMemo={detailSavedMemo}
                  afterList={
                    // 💬 この本だけを相談相手にする（相談相手の絞り込み・2026-09-26）。
                    <button
                      type="button"
                      onClick={() => {
                        // 本のページを撮る（初回ガイド）から来た本は、「相談してみる」と同じ（自分のメモから作った相談を入れて開く）。
                        if (ocrBridgeActiveFor(current.id)) { openOcrConsult(current, { scoped: true }); return; }
                        setScopePreset({ bookIds: [current.id], nonce: Date.now() });
                        setView('list');
                        setAiSubTab('brain');
                        setTab('ai');
                      }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'left',
                        padding: 'var(--space-3) var(--space-4)', minHeight: 56, cursor: 'pointer', fontFamily: 'inherit',
                        background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)',
                      }}
                    >
                      <MessageCircle size="1.2em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>この本に相談する</span>
                      </span>
                      <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                    </button>
                  }
                />
              </section>
            </div>
          ) : null}
          {/* 畳む見出しが続くときは 12（「この本のまとめ」の直後）。 */}
          {hasVisibleSections(current.aiSummary, { hideRelatedBooks: true }) && (
            <details style={{ ...detailsStyle, marginTop: isMemoPhase ? 'var(--space-3)' : 'var(--space-6)' }}>
              <summary style={summaryStyle}>
                以前の AI まとめ
                <ChevronDown size="1.2em" aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </summary>
              <div style={{ paddingBottom: 'var(--space-4)' }}>
                {/* 以前の AI まとめも書誌で確かめていないので、本を挙げる節は出さない（2026-10-04） */}
                <MarkdownSections flat text={current.aiSummary} hideRelatedBooks />
              </div>
            </details>
          )}

          {((current.actions || []).filter((a) => a.text?.trim() && !isScheduledLater(a)).length > 0 || isMemoPhase) && (
            // 下の「＋ 行動を追加」（高さ 44）の余り（約 12）を詰め、見た目の間隔を 24 にそろえる。
            <section style={{ marginTop: 'var(--space-6)', marginBottom: 'calc(-1 * var(--space-3))' }} aria-labelledby="detail-action-title">
              <h2 id="detail-action-title" style={detailH2Style}>行動</h2>
              {/* その場で完了できる（読み取り専用だと行動タブへの往復を強制する）。
                  filter だと index がズレるので生 index を持ったまま並べる。まだの行動を先、完了は後。 */}
              {/* 繰り返しの「次回分」（scheduledFor が未来）は行動タブと同じく出さない＝先取り完了を防ぐ */}
              {current.actions
                .map((a, i) => ({ a, i }))
                .filter(({ a }) => a.text?.trim() && !isScheduledLater(a))
                .sort((x, y) => Number(!!x.a.done) - Number(!!y.a.done))
                .map(({ a, i }) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleAction(current.id, i)}
                  aria-label={a.done ? `「${a.text}」を未完了に戻す` : `「${a.text}」を完了にする`}
                  style={{ display: "flex", gap: 'var(--space-3)', alignItems: "flex-start", padding: "var(--space-2) 0", width: "100%", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", minHeight: 48 }}
                >
                  {/* ○ は 1 行目にそろえる（iOS のリマインダーと同じ）。1 行目の高さの箱の上下中央に置く。 */}
                  <span aria-hidden="true" style={{ height: 'calc(var(--text-body) * 1.5)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                    {a.done
                      ? <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
                      : <Circle size={24} style={{ color: 'var(--border)' }} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-body)', color: a.done ? "var(--text-3)" : "var(--text)", textDecoration: a.done ? "line-through" : "none", margin: 0, wordBreak: "break-word", lineHeight: 1.5 }}>{a.text}</p>
                    {a.deadline && <p style={{ fontSize: 'var(--text-meta)', color: "var(--text-3)", margin: 'var(--space-1) 0 0' }}>期限 {fmtDateJa(a.deadline)}</p>}
                  </div>
                </button>
              ))}
              {/* この本の行動をその場で足す（行動タブの「＋ 追加」と同じ入力を、この本を選んだ状態で開く）。 */}
              <button
                type="button"
                onClick={() => setAddActionSheet({ step: 'edit', bookId: current.id, prefillText: '' })}
                style={{ ...btnLink, padding: 0, justifyContent: 'flex-start', gap: 'var(--space-1)' }}
              >
                <IcPlus size="1.1em" aria-hidden="true" />行動を追加
              </button>
            </section>
          )}

          {current.roiSummary && <Card label="一番の収穫" text={current.roiSummary} style={{ marginTop: 'var(--space-6)' }} />}

          {/* 💡 読了直後の「一番の収穫」導線 — 感情のピークで 1 行の言語化を促す
              （レバレッジ読書の核心。未記入のときだけ出る＝書けば消える）。行動のすぐ後・読書計画より上。 */}
          {current.status === 'done' && !(current.roiSummary || '').trim() && (
            <div style={{ ...cardStyle, marginTop: 'var(--space-6)' }}>
              <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>一番の収穫を 1 行だけ残す</p>
              <button type="button" onClick={() => openEdit(current)} style={textBtnInCard}>
                1 行を書く
              </button>
            </div>
          )}

          {isMemoPhase && planBlock}

          {/* Action buttons */}
          {/* 読みたい・積読は上のカードとの間を 24 に（主ボタンを 390×844 の最初の画面に収める・2026-10-09 ui-critic）。 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-6)', marginTop: isMemoPhase ? 'var(--space-8)' : 'var(--space-6)' }}>
            {/* 📷 読了にした直後だけ（控えめな副ボタン 1 つ・本を離れたら消える・SPEC §2-1）。 */}
            {current.status === 'done' && justDoneId === current.id && (
              <button
                type="button"
                className="list-item-enter"
                // 出たら画面の中まで送る（上に「一番の収穫」のカードが入って押し下げられても、下の「読了にしました。」の
                // 知らせと右下の「メモを書く」に重ならないように・下の余白は JUST_DONE_CLEARANCE）。
                ref={(el) => {
                  if (!el || el.dataset.revealed) return;
                  el.dataset.revealed = '1';
                  let reduce = false;
                  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* noop */ }
                  requestAnimationFrame(() => { try { el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } catch { /* ignore */ } });
                }}
                onClick={() => { setJustDoneId(null); openShareCamera({ book: current, from: 'done' }); }}
                style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', scrollMarginBottom: JUST_DONE_CLEARANCE }}
              >
                <Camera size={20} aria-hidden="true" />
                読了を写真で共有
              </button>
            )}
            {nextStatus[current.status] && (
              // ボタンと補足文は 1 つのまとまり（8）。購入リンクとは 24 離す（DESIGN §1）。
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <button
                  onClick={async () => {
                    let startExtra = null;
                    if (current.status === 'before') {
                      // 🎯 投資目的は必須（本田哲学=「目的なき読書はしない」）。
                      // 1 行も無いまま読書中へは進ませない＝設定画面へ誘導。
                      // 判定は読書計画の編集画面と同じ（得たいことが空なら AI 選書で書いた悩みを下書きにする＝buildFormFromBook）。
                      //   編集画面では下書きが入って「保存して読書を開始」できるのに、ここでは止めていた食い違いを直す（2026-10-09）。
                      const purposeDraft = (buildFormFromBook(current).investPurpose || '').trim();
                      if (!(current.investPurpose || '').trim() && purposeDraft) startExtra = { investPurpose: purposeDraft };
                      if (!purposeDraft) {
                        const ok = await confirm({
                          title: '読む前に、この本から得たいことを決めましょう',
                          message:
                            'この本から「得たいこと・味わいたいこと」を 1 行だけでも決めると、読んだ後に見返す指針になり、読みっぱなしを防げます。',
                          confirmLabel: '得たいことを入力する',
                          cancelLabel: '閉じる',
                        });
                        // 「閉じる」を押したら遷移しない（強制連行を防ぐ）。
                        if (ok) openSetup(current);
                        return;
                      }
                      // 投資目的はあるが読書計画が未作成 → 任意なので警告のみ（AI 解析は 2026-09-27 に廃止）。
                      // 無料プランでは聞かない（読書計画シートはプランの機能。押していない機能を読み始めのたびに
                      // すすめない＝7 日間無料をすすめるのは自分でプランの機能を押したときだけ・GLOSSARY・2026-10-04）。
                      if (!current.aiStrategy && !paywallFree) {
                        const ok = await confirm({
                          title: '読書計画シートを作っておきますか？',
                          message:
                            '読書計画シートがまだありません。作っておくと、学びの本では「どの 20% を読むか」が分かります（任意）。',
                          confirmLabel: 'このまま読書を開始',
                          cancelLabel: '読書計画シートを作る',
                        });
                        if (!ok) {
                          openSetup(current);
                          return;
                        }
                      }
                    }
                    advanceStatus(current, nextStatus[current.status], startExtra ? { extra: startExtra } : {});
                  }}
                  // 主アクションはボタン正典（ブランド茶）に統一。以前は遷移先の
                  // ステータス色（紫/青/緑）で塗っており、詳細画面が暖色世界から
                  // 浮いた3色のサーカスになっていた。遷移先はラベルが十分に語る。
                  // 読書中は右下の「メモを書く」が主ボタン（1 画面 1 つ・DESIGN §0）なので、
                  // 「読了にする」は副ボタンに下げる。読みたい・積読では従来どおり主ボタン。
                  style={{ ...(isMemoPhase ? btnGhost : btnS), width: "100%" }}
                >
                  {nextLabel[current.status]}
                </button>
                {/* 読みたい: 読書計画シートは積読から作れる。1 行の説明の代わりに、押せば積読に積んで
                    その場で作り始める文字ボタン（2026-09-29）。無料プランは状態を変える前に有料プランの画面を開く。
                    得たいことがまだ無ければ、積読に積んだうえで読書計画の編集画面へ（runStrategyInPlace と同じ）。 */}
                {current.status === 'want' && (current.aiStrategy || '').trim() && (
                  // もうシートがある読みたい本: 作り直さず、下の「読書計画シート」を開いてそこへ寄せる（2026-09-29）。
                  <button
                    type="button"
                    onClick={() => {
                      setJustMadePlanId(current.id);
                      requestAnimationFrame(() => {
                        try { document.getElementById('plan-sheet-fold')?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' }); } catch { /* ignore */ }
                      });
                    }}
                    style={{ ...btnLink, alignSelf: 'center' }}
                  >
                    読書計画シートを見る
                  </button>
                )}
                {/* 読みたい: 「読書計画シートを作る（積読に積みます）」は 2026-10-08 にやめた（オーナー「積読に積むと二つの選択は不要」）。
                    主ボタン「積読に積む」のあと、積読の本の詳細で読書計画シートを作る（1 か所に寄せる）。 */}
                {/* 読みたいだけ: 主ボタン「積読に積む」のすぐ下に文字ボタン（積読では「読書を開始する」と
                    行き先が同じで二重になるので出さない）。ワンタップで読書中にして、そのままメモを開く。 */}
                {current.status === 'want' && (
                  <button
                    type="button"
                    onClick={() => { advanceStatus(current, "reading"); setQuickMemoOpen(true); }}
                    style={{ ...btnLink, alignSelf: 'center' }}
                  >
                    読書中にしてメモを書く
                  </button>
                )}
                {/* 積読: メモ欄は無いので、理由だけを 1 行（SPEC §2 エッジケース）。 */}
                {current.status === 'before' && (
                  <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                    読み始めるとメモが書けます
                  </p>
                )}
              </div>
            )}
            {/* 購入導線は「まだ買っていない可能性が高い」want / before だけ主役。
                reading / done で全幅オレンジが最強の視覚要素になるのは、収穫・
                行動が主役であるべき画面の佇まいを崩す（本田哲学）。 */}
            {/* 購入導線: Amazon + 楽天ブックスの両方を出す（統一）。want/before は
                買う導線を主役に全幅ボタン、reading/done は控えめな横並びリンク。 */}
            {/* 購入リンクは、まだ買っていない可能性が高い 読みたい だけ画面に出す。
                積読（定義: 手元にある本）・読書中・読了は「⋯ → この本を買う」のシート（開示文ごと）へ
                （2026-09-26 オーナー判断・積読は 2026-09-29 に「⋯」へ寄せた＝手元にある本に買うボタンを大きく出さない）。 */}
            {current.status === 'want' && (
              <BookStoreLinks book={current} variant="cta" buy />
            )}
            {/* 編集 / 共有 / 削除 は上部 ⋯ kebab に集約。下部の「← 本棚に戻る」は左上の戻ると
                二重なので撤去（左端スワイプでも戻れる）。 */}
          </div>
        </div>
        </div>

        {/* Floating "+ memo" FAB — only for reading/done so we don't lure
            users into creating memos that the section above hides. */}
        {/* メモが 0 件の本は、一覧の場所の空の案内の「メモを書く」が入口（右下には出さない・SPEC §2・2026-09-30）。 */}
        {(current.status === "reading" || current.status === "done") && !detailMemoEmpty && (
          // 「この本のまとめ」を開いている間・入力欄に書いている間は隠す（保存ボタンに重ならない・MemoFab）。
          <MemoFab scrollRef={detailScrollRef} onClick={() => setQuickMemoOpen(true)} />
        )}

        {quickMemoOpen && (current.status === "reading" || current.status === "done") && (
          <Suspense fallback={<OverlayFallback />}>
            <QuickMemoSheet
              bookTitle={current.title}
              // 📷 初回ガイドの「本のページを撮る」から来たら「＋ ページ・写真」を開いた形で（写真から書き起こすが見える）。
              startWithPhoto={ocrIntentActive}
              defaultPageNumber={
                (() => {
                  const nums = (currentMemoOps.memos || [])
                    .map((m) => m.pageNumber)
                    .filter((n) => Number.isFinite(n));
                  return nums.length ? Math.max(...nums) + 1 : '';
                })()
              }
              // よく使うタグ（この本のメモのタグ → 本棚のタグ）を「＋ ページ・写真」の中にチップで。
              frequentTags={frequentMemoTags(currentMemoOps.memos, allTags)}
              onClose={() => { setQuickMemoOpen(false); setOcrIntentAt(null); }}
              onCreate={async (payload) => {
                const result = await currentMemoOps.createMemo(payload);
                // 🌱 初回ガイドの「本のページを撮る」で最初のメモを保存した → 「相談してみる」（2026-10-02・lib/firstDay.js）。
                //   入力欄に、このメモの本から作った相談を入れて相談を開く（送らない）。
                const fromOcrPath = ocrIntentActive && !!result;
                if (fromOcrPath) {
                  setOcrIntentAt(null);
                  if (current?.id) setOcrBridge({ bookId: current.id, at: Date.now() });
                  if (takeOnboardPathDone('ocr')) track('onboard_path_done', { path: 'ocr', photo: !!payload?.fromPhoto });
                }
                // 保存確定の手応え（カード式エディタ経由と体験を揃える）。
                haptic.success();
                // 🔗 ほかの本で似たことを書いていたら、メモの一覧の上に出す（BookMemoList の savedMemo）。
                //   写真から書き起こしたメモなら、その下に通知の案内も 1 回だけ（まだ決めていない人だけ・NotifyOptInCard・2026-10-10）。
                if (result?.id && current?.id) setDetailSavedMemo({ id: result.id, bookId: current.id, text: result.text ?? payload?.text ?? '', nonce: Date.now(), fromPhoto: !!payload?.fromPhoto });
                // 🎯 保存直後に「行動にする」を 1 タップで提案（カード式と同じ動線）。
                // クイックメモは最頻の書き込み経路なので、ここが出ないと大多数の
                // メモが「保存して終わり」になる。
                const actionText = (result?.text ?? payload?.text ?? '').trim();
                // 知らせはシートが「閉じている途中」になってから出す（onCreate のあとでシートが閉じ始めるので、
                // すぐ出すと開いたシートの上＝画面の下端に出てからタブの上へ 160px 跳ねていた・2026-09-30）。
                afterSheetCloses(() => {
                if (fromOcrPath && current?.id) {
                  const book = current;
                  toast.show({
                    type: 'success',
                    message: '保存しました。',
                    duration: 10000,
                    action: {
                      label: '相談してみる',
                      onClick: () => openOcrConsult(book),
                    },
                  });
                } else if (actionText && current?.id) {
                  const memoBookId = current.id;
                  bindToastToBook(memoBookId, toast.show({
                    type: 'success',
                    // 「行動に追加」のボタンと並ぶので短く（390 幅で 2 行に折れていた・2026-09-30）。
                    message: '保存しました。',
                    duration: 6000,
                    action: {
                      label: '行動に追加',
                      onClick: async () => {
                        const ok = await addActionFromMemo(memoBookId, {
                          text: actionText,
                          sourceMemoId: typeof result?.id === 'string' ? result.id : null,
                          sourcePage: result?.page_number ?? payload?.pageNumber ?? null,
                        });
                        if (ok) toast.success('行動に追加しました（期限は明日）。');
                      },
                    },
                  }));
                } else {
                  toast.success('メモを保存しました。');
                }
                });
              }}
              onOpenFullEditor={(prefill) => {
                setQuickMemoOpen(false);
                setFullEditorPrefill(prefill);
              }}
            />
          </Suspense>
        )}

        {fullEditorPrefill && (
          <BookMemoEditor
            bookTitle={current.title}
            bookId={current.id}
            books={books}
            initial={null}
            defaultPageNumber={fullEditorPrefill.pageNumber ?? ''}
            defaultText={fullEditorPrefill.text || ''}
            defaultTags={Array.isArray(fullEditorPrefill.tags) ? fullEditorPrefill.tags : []}
            allTags={allTags}
            onClose={() => setFullEditorPrefill(null)}
            onCreate={async (payload, opts = {}) => {
              const result = await currentMemoOps.createMemo(payload);
              haptic.success();
              // 🔗 ほかの本で似たことを書いていたら、閉じたあとのメモの一覧の上に出す（「保存して次へ」は書く画面の 1 行でも）。
              if (result?.id) setDetailSavedMemo({ id: result.id, bookId: current.id, text: result.text ?? payload?.text ?? '', nonce: Date.now() });
              // 「保存して次へ」は書く画面の「保存しました」で伝える（知らせが入力欄に重ならない）
              if (!opts.quiet) toast.success('メモを保存しました。');
              return result;
            }}
            onUpdate={async (memoId, payload) => {
              await currentMemoOps.updateMemo(memoId, payload);
              haptic.success();
              toast.success('メモを更新しました。');
            }}
          />
        )}

        {helpModalOpen && (
          <Suspense fallback={<OverlayFallback />}>
            <HelpModal
              helpKey={getCurrentHelpKey()}
              onClose={() => setHelpModalOpen(false)}
              onShowOnboarding={() => {
                setHelpModalOpen(false);
                clearOnboardingCompletion();
                setShowOnboarding(true);
              }}
            />
          </Suspense>
        )}

        {/* Onboarding must be mounted in every view, not just the list view —
            otherwise tapping "アプリ全体の使い方を最初から見る" from the help
            modal here looks like nothing happens until the user navigates
            back to the bookshelf. */}
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={() => openAdd('reading')} onImport={() => setShowImport(true)} onStartQuickstart={() => setShowQuickstart(true)} onStartOcr={startOcrPath} />}
        {quickstartOverlay}
        {importOverlay}

        {shareSheet && (
          <Suspense fallback={<OverlayFallback />}>
            <ShareSheet
              book={shareSheet.book?.id === current.id ? current : shareSheet.book}
              memos={shareSheet.book?.id === current.id ? currentMemoOps.memos : undefined}
              initialMemoId={shareSheet.initialMemoId || null}
              initialPhotoFile={shareSheet.photoFile || null}
              from={shareSheet.from || (shareSheet.initialMemoId ? 'memo' : 'menu')}
              onClose={() => setShareSheet(null)}
            />
          </Suspense>
        )}
        {shareCameraInput}
        {focusLayer}
        {storeSheetOpen && (
          <BottomSheet title="この本を買う" onClose={() => setStoreSheetOpen(false)}>
            <BookStoreLinks book={current} variant="cta" buy />
          </BottomSheet>
        )}
        {analysisSheetOpen && hasVisibleSections(current.aiAnalysis, { hideRelatedBooks: true }) && (
          <BottomSheet title="以前の AI 解析" onClose={() => setAnalysisSheetOpen(false)}>
            {/* 書誌で確かめていないので、本を挙げる節は出さない（「読みたいに追加」も出さない・2026-10-04） */}
            <MarkdownSections flat text={current.aiAnalysis} hideRelatedBooks />
          </BottomSheet>
        )}
        {detailKebab && (
          <ContextMenu
            x={detailKebab.x}
            y={detailKebab.y}
            onClose={() => setDetailKebab(null)}
            items={[
              { label: '編集', icon: <PencilLine size="1.1em" aria-hidden="true" />, onClick: () => openEdit(current) },
              // 📋 AI 読書計画は before / reading / done のどこからでも
              // 仕切り直せる。want は本格的な読書計画前なので除外。
              ...(current.status !== 'want'
                ? [{
                    label: '読書計画シートを編集',
                    icon: <IcMap size="1.1em" aria-hidden="true" />,
                    onClick: () => openSetup(current),
                  }]
                : []),
              // どのステータスからも「1 つ前」に戻せる（旧: reading/done→積読 の
              // 2 段戻りしか無く、読了を読書中に戻したい・積読を読みたいに戻したい
              // 人の行き場が無かった）。データは常に保持される。
              ...((() => {
                const prevOf = { before: 'want', reading: 'before', done: 'reading' };
                const prev = prevOf[current.status];
                if (!prev) return [];
                const prevLabel = STATUS_LABEL[prev] || prev;
                return [{
                  label: `「${prevLabel}」に戻す`,
                  icon: <RotateCcw size="1.1em" aria-hidden="true" />,
                  onClick: async () => {
                    const ok = await confirm({
                      title: `「${prevLabel}」に戻しますか？`,
                      message: `状態を「${prevLabel}」に戻します。メモや行動などのデータは保持されます。`,
                      confirmLabel: '戻す',
                      cancelLabel: 'キャンセル',
                    });
                    if (!ok) return;
                    advanceStatus(current, prev);
                  },
                }];
              })()),
              { label: '表紙を選び直す', icon: <ImagePlus size="1.1em" aria-hidden="true" />, onClick: () => setCoverFixForBook(current) },
              { label: '表紙を取り直す', icon: <IcRefresh size="1.1em" aria-hidden="true" />, onClick: () => refreshCoverFor(current) },
              { label: '表紙を手動でアップロード', icon: <Upload size="1.1em" aria-hidden="true" />, onClick: () => triggerManualCoverUpload(current) },
              ...(current.cover ? [{ label: '表紙を削除', icon: <ImageOff size="1.1em" aria-hidden="true" />, onClick: () => removeCoverFor(current) }] : []),
              ...(current.status !== 'want'
                ? [{ label: 'この本を買う', icon: <ShoppingBag size="1.1em" aria-hidden="true" />, onClick: () => setStoreSheetOpen(true) }]
                : []),
              // 読書中・読了は画像で共有（写真なしで開く・シートの中で写真も選べる）。読みたい・積読は書名とお店のリンクの文を共有。
              isMemoPhase
                ? { label: '写真で共有', icon: <Share size="1.1em" aria-hidden="true" />, onClick: () => setShareSheet({ book: current, from: 'menu' }) }
                : { label: '共有', icon: <Share size="1.1em" aria-hidden="true" />, onClick: () => shareBook(current) },
              // 以前の AI 解析は、保存済みのものがある本だけ（本の詳細の畳む見出しから移した・共有の下・ヘルプの上・2026-10-09）。
              ...(hasVisibleSections(current.aiAnalysis, { hideRelatedBooks: true })
                ? [{ label: '以前の AI 解析を見る', icon: <ScrollText size="1.1em" aria-hidden="true" />, onClick: () => setAnalysisSheetOpen(true) }]
                : []),
              // ヘルプは上の行に単独のボタンで置かず、この「…」の中（削除の直前・削除はいつも最後）に（2026-09-30）。
              { label: 'ヘルプ', icon: <HelpCircle size="1.1em" aria-hidden="true" />, onClick: openHelp },
              { label: '削除', icon: <Trash2 size="1.1em" aria-hidden="true" />, destructive: true, onClick: () => requestDeleteBook(current) },
            ]}
          />
        )}

        {/* hidden file input — kebab「🖼 手動でアップロード」のトリガー。
            capture は意図的に付けない (iOS のアクションシートで「写真を撮る
            / フォトライブラリ / ファイル選択」の選択肢を出すため)。 */}
        <input
          ref={detailCoverUploadRef}
          type="file"
          accept="image/*"
          onChange={handleManualCoverPicked}
          style={{ display: 'none' }}
        />

        {/* 表紙修正モーダル — DETAIL view からトリガーされるが、CoverFixModal
            の mount 自体を LIST view 内だけに置いていたため、本詳細画面からは
            「表紙が違う?」を押してもモーダルが見えず、本棚に戻った時に初めて
            描画されるバグがあった。DETAIL view 側にも同じ mount を置くことで
            その場で表示されるよう修正。{coverFixForBook && ...} の条件式は
            LIST view と共有 state なので二重描画されることはない (片方の
            view しか return されない)。 */}
        {coverFixForBook && (
          <Suspense fallback={<Spinner />}>
          <CoverFixModal
            book={coverFixForBook}
            onClose={() => setCoverFixForBook(null)}
            onPick={(pick) => handleCoverFixPick(coverFixForBook, pick)}
            onManualUpload={() => triggerManualCoverUpload(coverFixForBook)}
          />
          </Suspense>
        )}

        {/* 🎯 行動の「＋ 行動を追加」（本の詳細から・この本を選んだ状態）。一覧の画面の同じ mount とは
            片方の画面しか return されないので二重には出ない（CoverFixModal と同じ置き方）。 */}
        {addActionSheet?.step === 'edit' && addActionSheet.bookId && (
          <Suspense fallback={<Spinner />}>
            <ActionEditModal
              mode="create"
              action={addActionSheet.prefillText ? { text: addActionSheet.prefillText } : null}
              onClose={() => setAddActionSheet(null)}
              onSave={async (patch) => {
                let error = '';
                const ok = await createActionForBook(addActionSheet.bookId, { ...patch, onError: (m) => { error = m; } });
                if (ok) setAddActionSheet(null);
                else return { error };
              }}
            />
          </Suspense>
        )}

        <BottomNav tab={navTab} setTab={(t) => { navigateTab(t); goList(); }} hidden={keyboardOpen} />
      </Shell>
    );
  }

  // ===== EDIT (renders different phase based on status) =====
  if (view === "edit") {
    // 積読・読書中・読了の編集は「保存」を画面の下に固定する（EditSaveBar）。本を追加・読みたいは本文中の主ボタン。
    const editPhaseNow = editPhaseOverride || form.status;
    const hasSaveBar = !!current && editPhaseNow !== 'want';
    return (
      <Shell>
        {/* 左端スワイプで指に付いてくる画面＝上の行と中身をまとめた箱（getTarget が返す・2026-09-30）。 */}
        <div data-swipe-target="" style={swipeScreenStyle}>
        {/* 「‹ 戻り先」の行はスクロールの箱の外（本の詳細と同じ PushedTopBar）。 */}
        <PushedTopBar scrollRef={editScrollRef}>
            <button
              onClick={async () => {
                if (!(await confirmDiscardEdit())) return;
                if (current) { setEditPhaseOverride(null); setView("detail"); }
                else leaveNewBookForm();
              }}
              // 詳細画面・すべての本の戻ると同じ形（ChevronLeft 20・間 0・見た目の左端 16）。
              style={{ display: 'inline-flex', alignItems: 'center', gap: 0, minHeight: 44, padding: '0 var(--space-2) 0 0', marginLeft: BACK_CHEVRON_PULL, background: 'none', border: 'none', color: 'var(--accent)', fontSize: BACK_LABEL_SIZE, whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer' }}
              aria-label={current ? 'この本に戻る' : undefined}
            >{/* iOS の作法: 戻るは戻り先の画面の名前。編集からはいつも本の詳細へ戻るので「この本」
                （書名は下の見出しにあるので、上の行で繰り返さない・2026-10-01 オーナー裁定・SPEC §2）。 */}
              <ChevronLeft size={20} aria-hidden="true" />{current ? 'この本' : newBookBackLabel}</button>
            {/* 右端は「…」（すべての本・本の詳細と同じ形）。中はヘルプ（？の丸を単独で置かない・2026-09-30）。 */}
            <button
              type="button"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setEditMenu({ x: r.right - 8, y: r.bottom + 4 }); }}
              style={{ width: 44, height: 44, marginRight: 'calc(-1 * var(--space-3))', display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
              aria-label="その他の操作"
              title="その他"
            >
              <MoreHorizontal size={22} aria-hidden="true" />
            </button>
        </PushedTopBar>
        <OfflineNotice />
        {editMenu && (
          <ContextMenu
            x={editMenu.x}
            y={editMenu.y}
            onClose={() => setEditMenu(null)}
            items={[{ label: 'ヘルプ', icon: <HelpCircle size="1.1em" aria-hidden="true" />, onClick: openHelp }]}
          />
        )}
        <div
          ref={editScrollRef}
          className="detail-enter"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            // 上は戻るの行（PushedTopBar）の下から。下は固定の保存があれば 24。
            padding: `0 var(--space-4) ${hasSaveBar ? 'var(--space-6)' : 'var(--space-16)'}`,
          }}
        >

          {/* どの Phase を描画するかを effectivePhase で決める。通常は
              form.status と一致するが、editPhaseOverride が立っている時
              (= openSetup から到達) は強制的にそのフェーズを表示する。 */}
          {(() => {
            const effectivePhase = editPhaseOverride || form.status;
            const phaseLabel = !current
              ? "本を追加"
              : effectivePhase === "want" ? "読みたい本"
              : effectivePhase === "before" ? "読書計画"
              : effectivePhase === "reading" ? "読書中"
              : "読了の振り返り";
            return (
              <>
                {current ? (
                  // 既存の本の編集: 書名が画面の主題（28・700・本の詳細と同じ）。上に小さく「編集」、下に状態。
                  <div style={{ margin: 'var(--space-2) 0 var(--space-6)' }}>
                    <p style={{ ...groupTitle, margin: '0 0 var(--space-1)' }}>
                      {effectivePhase === 'before' ? '読書計画を編集' : '編集'}
                    </p>
                    <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25, margin: 0, overflowWrap: 'anywhere', wordBreak: 'keep-all', lineBreak: 'strict', textWrap: 'balance', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{titleWithPhraseBreaks(current.title)}</h1>
                    <div style={{ marginTop: 'var(--space-2)' }}><StatusLabel status={form.status} /></div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', margin: 'var(--space-3) 0 var(--space-4)' }}>
                    {/* 本を追加するときは、状態は下の「この本の状態」で選ぶので見出しには出さない。 */}
                    <h2 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: "var(--text)", margin: 0, lineHeight: 1.3 }}>{phaseLabel}</h2>
                  </div>
                )}

                {(effectivePhase === "want" || !current) && (
                  <WantPhase form={form} setForm={setForm} onSave={handleSave} saving={savingBook} onSearchOpen={addFromSearchQuery !== null ? undefined : () => setSearchOpen(true)} allFolders={folderNames} />
                )}
                {effectivePhase === "before" && current && (
                  <BeforePhase
                    form={form}
                    setForm={setForm}
                    onSave={handleSave}
                    aiLoading={aiLoading}
                    onRunStrategy={runStrategy}
                    onRunStrategyEdit={runStrategyEdit}
                    onUndoStrategy={undoStrategy}
                    hasStrategyHistory={
                      strategyHistoryTick >= 0 && hasStrategyHistory(form?.id)
                    }
                    onAddRelatedBook={addRelatedBookFromAi}
                    addingTitles={addedRelatedTitles}
                    savedAsBefore={current?.status === 'before'}
                    // 📖 この本で学べること（畳んで置く・仮説の例を押すと仮説の欄に入る・2026-10-08）
                    briefSlot={(
                      <BookBrief
                        variant="fold"
                        text={storedBriefOf(form)}
                        material={hasBriefMaterial(bookAbout.info)}
                        infoLoading={bookAbout.loading}
                        making={briefGenId === form.id}
                        costLine={briefCostLine}
                        onMake={() => makeBookBrief({ ...current, ...form })}
                        onRemake={() => remakeBookBrief({ ...current, ...form })}
                        onPickHypothesis={pickHypothesisInEdit}
                        info={bookAbout.info}
                        error={briefError?.bookId === form.id ? briefError.message : ''}
                        pickedHypotheses={form.hypothesis || ''}
                        defaultOpen={briefJustMadeId === form.id}
                        style={{ marginBottom: 'var(--space-6)' }}
                      />
                    )}
                  />
                )}
                {effectivePhase === "reading" && current && (
                  <ReadingPhase form={form} setForm={setForm} onSave={handleSave} onSaveSummary={handleSaveSummaryFromForm} onMakeAction={addActionFromMemo} allFolders={folderNames} />
                )}
                {effectivePhase === "done" && current && (
                  <DonePhase form={form} setForm={setForm} onSave={handleSave} allFolders={folderNames} />
                )}
              </>
            );
          })()}
        </div>
        </div>

        {/* 積読の読書計画の編集: 状態を変えない「保存」と「保存して読書を開始」を分ける（2026-10-09）。 */}
        {hasSaveBar && (
          <EditSaveBar
            onSave={handleSave}
            saving={savingBook}
            disabled={!!aiLoading}
            onStart={editPhaseNow === 'before' && current?.status === 'before' && form.status === 'before' && !!(form.investPurpose || '').trim()
              ? () => handleSave({ startReading: true })
              : null}
          />
        )}

        <Modal open={searchOpen} ariaLabel="本を検索" onClose={() => { setSearchOpen(false); setSearchInitialQuery(''); setSearchInitialAuthor(''); setSearchInitialIsbn(''); }}>
          <BookSearchModal
            onSelect={handleBookSelect}
            onClose={() => { setSearchOpen(false); setSearchInitialQuery(''); setSearchInitialAuthor(''); setSearchInitialIsbn(''); }}
            initialQuery={searchInitialQuery}
            initialAuthor={searchInitialAuthor}
            initialIsbn={searchInitialIsbn}
          />
        </Modal>
        {helpModalOpen && (
          <Suspense fallback={<OverlayFallback />}>
            <HelpModal
              helpKey={getCurrentHelpKey()}
              onClose={() => setHelpModalOpen(false)}
              onShowOnboarding={() => {
                setHelpModalOpen(false);
                clearOnboardingCompletion();
                setShowOnboarding(true);
              }}
            />
          </Suspense>
        )}
        {/* Same reason as in the detail view — keep onboarding reachable
            from the edit-screen help modal without requiring a tab switch. */}
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={() => openAdd('reading')} onImport={() => setShowImport(true)} onStartQuickstart={() => setShowQuickstart(true)} onStartOcr={startOcrPath} />}
        {quickstartOverlay}
        {importOverlay}
        <BottomNav
          tab={navTab}
          setTab={async (t) => {
            // 編集中に未保存の変更があれば、移動前に確認（誤タップでの消失防止）。
            if (!(await confirmDiscardEdit())) return;
            // navigateTab は振り返り→行動 / AI→AI選書 の入口リセットを担保する。
            // 編集経由だけ素の setTab だと他経路と挙動がズレるため揃える。
            navigateTab(t);
            goList();
          }}
          // 本を追加・編集しているあいだは下のタブを出さない（iOS の作成・編集画面の作法・下に固定の保存を隠さない）。
          hidden
        />
      </Shell>
    );
  }

  // ===== TAB CONTENT =====
  return (
    <Shell>
   {/* すべての本は押し込まれた画面なので、ナビゲーション行（‹ ホーム）1 本だけにする（全体ヘッダーと二段にしない）。 */}
   {/* 相談の押し込まれた画面（過去の相談・学びを書く・根拠にできる情報）も同じく「‹ 相談」の行 1 本だけ。 */}
   {!(tab === "books" && shelfMode === 'library') && !(tab === "ai" && aiSubTab === 'brain' && consultPushed) && !(tab === "ai" && aiSubTab === 'advisor' && advisorPushed) && (
   <header
     // 相談・AI 選書では、キーボードが開いている間この行（ロゴ・写真で共有・？・⚙️）を畳む（上の安全域だけ残す）。
     // 書いている文と答えに場所を譲る（components.css の .app-top-bar--fold・2026-10-08）。
     className={tab === "ai" ? "app-top-bar app-top-bar--fold" : "app-top-bar"}
     style={{
       flexShrink: 0,
       padding: "max(env(safe-area-inset-top, 4px), 4px) var(--space-4) var(--space-1)",
       minHeight: 44,
       display: "flex",
       justifyContent: "space-between",
       alignItems: "center",
       gap: 'var(--space-2)',
       /* ページ（クリーム）と同色にして上部を一体化（iOS ナビバー流儀）。
          白いカードが下で浮く構図になる。 */
       background: "var(--bg)",
       // 中身を下へ送ったときだけ下に線（一番上では出さない）。線の太さぶんは常に取って高さを変えない。
       borderBottom: `1px solid ${pageScrolled ? 'var(--separator)' : 'transparent'}`,
       transition: 'border-color var(--duration-fast) var(--ease-out)',
     }}
   >
    <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', minWidth: 0, flex: 1 }}>
      <button
        type="button"
        {...logoLongPress.bind}
        aria-label="ロゴ（長押しで開発者からのメッセージ）"
        style={{
          lineHeight: 0,
          // 押せる範囲 44×44（DESIGN §6）。見た目の左端は余白 16 に揃えるため左へ 8 戻す。
          padding: 'var(--space-2)',
          margin: '0 0 0 calc(-1 * var(--space-2))',
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* ロゴは本の形のマークだけ（地が透明・2026-10-10 ui-critic「アプリアイコンのクリーム色の四角が、明暗どちらでも浮いていた」）。 */}
        <img
          src="/icons/mark-96.png"
          alt="Orime"
          width={28}
          height={28}
          style={{ display: "block" }}
        />
      </button>
    </div>
    {/* 右端は左のロゴの補正と対称に（アイコンの見た目の右余白を 16 に）。 */}
    <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)', marginRight: 'calc(-1 * var(--space-3))' }}>
      {/* 📷 写真で共有（2026-09-30 オーナー裁定: 共有は前面に出す主要な機能。2026-10-01「振り返りでも相談でも表示があってもいい」で
          ホーム・振り返り・相談の 3 つのタブで同じ場所・同じ形に）。押すとすぐカメラ（パソコンは写真を選ぶ画面）。
          撮ったら、いま読んでいる本の記録を重ねたシートが開く（振り返り › 記録から開いて今月の読了があるときだけ「今月」を選んでおく）。 */}
      <button
        type="button"
        onClick={() => (!booksLoading && books.length === 0
          // 本が 0 冊のときはカメラを開かない（重ねる本の記録が無い・2026-10-09）。知らせから本を追加へ。
          ? pointToFirstStep()
          : openShareCamera({
          fromHome: true,
          from: tab === 'review' ? 'review' : tab === 'ai' ? 'consult' : 'home',
          // 振り返り › 記録からは、今月に読み終えた本があるときだけ「今月」を選んでおく（無ければいま読んでいる本・2026-10-01）。
          // 12 月で今年に読み終えた本があれば「今年」を選んでおく（2026-10-08・今年の読書）。
          ...(tab === 'review' && reviewSubTab === 'record'
            ? (yearChoiceAllowed(books, appNow()) ? { initialSubject: { kind: 'year' } }
              : hasFinishedThisMonth(books, appNow()) ? { initialSubject: { kind: 'month' } } : {})
            : {}),
        }))}
        aria-label="写真で共有"
        // 文字は 15 から設定に合わせて大きくなるが、20 で止める（--text-bar-max・1 行に収める）。アイコンは右の ？・⚙️ と同じ 22。
        style={{ ...btnLink, fontSize: 'min(var(--text-sub), var(--text-bar-max))', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', padding: '0 var(--space-2)', whiteSpace: 'nowrap' }}
      >
        <Camera size={22} strokeWidth={1.75} aria-hidden="true" />
        写真で共有
      </button>
      <button
        onClick={openHelp}
        style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        aria-label="この画面のヘルプを開く"
        title="ヘルプ"
      >
        <HelpCircle size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        aria-label="アカウント設定を開く"
        title="設定"
      >
        <SettingsIcon size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  </header>
   )}
   {/* オフラインの一行: 上の行の下に。すべての本は「‹ ホーム」の行の下（本の詳細と同じ・その画面の中で出す）。
       相談の押し込まれた画面（過去の相談など）は、その画面の上の行が中にあるので出さない（戻ると出る）。 */}
   {!(tab === "ai" && aiSubTab === 'brain' && consultPushed) && !(tab === "books" && shelfMode === 'library') && (
     <OfflineNotice />
   )}

      {/* Shell が flex column になったため、ここは flex: 1 / minHeight: 0
          で残りスペースを取る。AI タブは内側で flex column を構成、
          books/review は overflow-y: auto で内側スクロール。 */}
      <div
        key={tab}
        ref={listScrollRef}
        onScroll={(e) => {
          // 本棚スクロール中だけ位置を控える（本を開いて戻った時の復元用）。
          if (view === 'list' && tab === 'books') savedShelfScroll.current = e.currentTarget.scrollTop;
          // 振り返りはサブタブごとに控える（本の詳細から戻ったときに同じ位置から・2026-09-29）。
          else if (view === 'list' && tab !== 'ai') savedTabScroll.current[scrollKeyFor(tab, reviewSubTab)] = e.currentTarget.scrollTop;
        }}
        className={tab === 'books' ? `lvg-page ${screenPop ? 'screen-pop' : 'tab-fade-in'}` : 'lvg-page'}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: tab === 'ai' ? 'hidden' : 'auto',
          // 終端の慣性をリスト内で完結させる（PWA シェル全体への波及を防ぐ、
          // iOS ネイティブアプリと同じ挙動）。
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: tab === 'ai' ? undefined : 'touch',
        }}
      >
        {tab === "books" && shelfMode === 'home' && (
          <PullToRefresh onRefresh={async () => { await refreshBooks(); haptic.light(); }}>
            <HomeScreen
              books={books}
              loading={booksLoading}
              loadError={booksLoadError}
              onRetry={() => refreshBooks()}
              onQuickstart={() => setShowQuickstart(true)}
              onImport={() => setShowImport(true)}
              // 「＋ 本を追加」の状態は既定の「読みたい」（2026-10-04 オーナー「読みたいがデフォルトでいいのでは？」）。
              // 「いま読んでいる本を追加する」（本 0 冊のカード）だけは読書中で開く。
              onAddBook={() => openAdd()}
              onAddReadingBook={() => openAdd('reading')}
              onAdvisor={() => { setAiSubTab('advisor'); setTab('ai'); }}
              onOpenBook={(b) => openDetail(b)}
              onWriteMemo={(b) => setHomeMemoBook(b)}
              // ⏱ 読む（集中モード・読書中の本だけ・2026-10-09）
              onRead={openFocusStart}
              // 読書中が 0 冊のときの候補（積読）の「読み始める」: 本を開かずにその場で読書中へ（楽観的に変えて、失敗したら戻す）。
              onStartReading={(b) => { haptic.light(); setBookStatusQuiet(b, 'reading'); }}
              onOpenLibrary={() => startTransition(() => setShelfMode('library'))}
              onSeeAllReading={() => { setStatusFilter('reading'); setShelfMode('library'); }}
              onCoverRetry={triggerCoverAutoRetry}
              // 月末・12 月の控えめな 1 行「◯月の読書を、1 枚の画像に」→ 写真で共有の「今月」／「今年」（カメラは開かない・2026-10-08）。
              onShareNudge={(kind) => setShareSheet({ fromHome: true, from: 'home_nudge', initialSubject: { kind } })}
              // 🎯 今日の行動の 1 行 → 振り返り › 行動（2026-10-10）
              onOpenActions={() => { setActionShowDoneNonce(null); setReviewSubTab('action'); setView('list'); setTab('review'); }}
              // 🌱 相談相手が育ちました →「相談してみる」（下書きを入れて相談を開く・送らない）
              onConsultDraft={(q, from) => { track('try_consult', { from }); openConsultWith(q); }}
              // 🔗 ホームのメモを書くで保存したメモと似たメモ（ほかの本）
              savedMemo={homeSavedMemo}
              onDismissSavedMemo={() => setHomeSavedMemo(null)}
              onOpenMemo={(b, memoId) => { setHomeSavedMemo(null); openDetail(b, memoId); }}
            />
          </PullToRefresh>
        )}
        {homeMemoBook && (
          <Suspense fallback={<OverlayFallback />}>
            <HomeQuickMemo
              book={homeMemoBook}
              allTags={allTags}
              onClose={() => setHomeMemoBook(null)}
              onSaved={(result, payload) => {
                haptic.success();
                const b = homeMemoBook;
                const actionText = (result?.text ?? payload?.text ?? '').trim();
                if (result?.id && b?.id && actionText) setHomeSavedMemo({ id: result.id, bookId: b.id, text: actionText, nonce: Date.now() });
                // シートが閉じ始めてから知らせを出す（本の詳細のメモを書くと同じ・2026-09-30）。
                // ほかの本の似たメモをホームに出すときは、知らせに「行動に追加」を付けない（次の一歩は似たメモの 1 行だけ）。
                const hasLinks = !!(result?.id && b?.id && actionText) && homeLinkFinder.find({ text: actionText, bookId: b.id, memoId: result.id }).length > 0;
                afterSheetCloses(() => {
                if (hasLinks) {
                  bindToastToBook(b.id, toast.success('保存しました。'));
                } else if (actionText && b?.id) {
                  bindToastToBook(b.id, toast.show({
                    type: 'success',
                    // 「行動に追加」のボタンと並ぶので短く（390 幅で 2 行に折れていた・2026-09-30）。
                    message: '保存しました。',
                    duration: 6000,
                    action: {
                      label: '行動に追加',
                      onClick: async () => {
                        const ok = await addActionFromMemo(b.id, {
                          text: actionText,
                          sourceMemoId: typeof result?.id === 'string' ? result.id : null,
                          sourcePage: result?.page_number ?? payload?.pageNumber ?? null,
                        });
                        if (ok) toast.success('行動に追加しました（期限は明日）。');
                      },
                    },
                  }));
                } else {
                  toast.success('メモを保存しました。');
                }
                });
              }}
              onOpenFullEditor={(prefill) => {
                const b = homeMemoBook;
                setHomeMemoBook(null);
                openDetail(b);
                setFullEditorPrefill(prefill);
              }}
            />
          </Suspense>
        )}
        {tab === "books" && shelfMode === 'library' && (
          <PullToRefresh onRefresh={async () => { await refreshBooks(); haptic.light(); }}>
            <div
              style={{
                padding: "max(env(safe-area-inset-top, 0px), var(--space-2)) var(--space-4) var(--space-3)",
                display: "flex",
                flexDirection: "column",
                gap: 'var(--space-3)',
                position: "sticky",
                top: 0,
                background: "var(--bg)",
                zIndex: 10,
              }}
            >
              {/* すべての本（ライブラリ）: ホームから押し込まれた画面。iOS の戻る＋大見出し。
                  操作は右上のアイコン（検索・…・追加）に寄せ、本の前に積むのはステータスのチップ 1 行だけ。
                  並び替え・絞り込み・表示の切替は「…」へ（SPEC §1・2026-09-26）。 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-1)' }}>
                <button
                  type="button"
                  onClick={leaveLibrary}
                  // シェブロンの見た目の左端を余白 16 に（相談の ‹ 相談 と同じ形・DESIGN §5「画面上部の 1 行」）。
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 0, minHeight: 44, padding: '0 var(--space-2) 0 0', marginLeft: BACK_CHEVRON_PULL, background: 'none', border: 'none', color: 'var(--accent)', fontSize: BACK_LABEL_SIZE, whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <ChevronLeft size={20} aria-hidden="true" />{libraryFrom === 'record' ? '記録' : libraryFrom === 'book' ? 'この本' : 'ホーム'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', marginRight: 'calc(-1 * var(--space-3))' }}>
                  <button
                    type="button"
                    // 開いているときにもう一度押すと閉じる（入っていた言葉も消して一覧を元に戻す）。
                    onClick={() => {
                      if (librarySearchOpen || search) { setLibrarySearchOpen(false); setSearch(''); }
                      else setLibrarySearchOpen(true);
                    }}
                    aria-label={librarySearchOpen || search ? '検索を閉じる' : '本を検索'}
                    aria-expanded={librarySearchOpen || !!search}
                    style={bookshelfIconBtn}
                  >
                    <IcSearch size={22} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setLibraryMenu({ x: r.right - 8, y: r.bottom + 4 }); }}
                    // 読み上げは中身をすべて言う（取り込む・ヘルプもこの中・2026-09-30）。
                    aria-label={activeFilterCount > 0 ? `並び替え・絞り込み・表示・取り込む・ヘルプ（絞り込み ${activeFilterCount} 件）` : '並び替え・絞り込み・表示・取り込む・ヘルプ'}
                    style={{ ...bookshelfIconBtn, position: 'relative' }}
                  >
                    <MoreHorizontal size={22} aria-hidden="true" />
                    {activeFilterCount > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />}
                  </button>
                  {/* 本が 0 冊のときは下の空の案内に「本を追加」があるので、右上の＋は出さない。 */}
                  {!(rawBooks.length === 0 && !booksLoading && !booksLoadError) && (
                    <button type="button" onClick={openAdd} aria-label="本を追加" title="本を追加" style={{ ...bookshelfIconBtn, color: 'var(--accent)' }}>
                      <IcPlus size={24} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {/* 📶 オフラインの一行は「‹ ホーム」の行の下に左右いっぱいで（本の詳細と同じ置き場所・2026-10-04 ui-critic）。
                  畳んでいる間は行の間の空き（12）を打ち消し、出ているときは上の行にすぐ続ける。 */}
              <OfflineNotice style={{ margin: 'calc(-1 * var(--space-3)) calc(-1 * var(--space-4)) 0' }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                {/* 記録の「読んだ本」など、状態を決めて記録から開いたときは、その状態を見出しに（「読了 6 冊」）。
                    「すべての本 6 冊」と言いながら読了だけを並べていた食い違いを直す（2026-09-29）。 */}
                <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
                  {libraryFrom === 'record' && statusFilter !== 'all' && STATUS_LABEL[statusFilter] ? STATUS_LABEL[statusFilter] : 'すべての本'}
                </h1>
                {/* 読み込み中・読み込めなかったときに「0 冊」と見せない（本があるまま更新中なら出す）。 */}
                {/* 検索中は「すべての本 0 冊」と見せない（本が無いように読める）。何冊の中から何冊見つかったかを出す（2026-09-29）。 */}
                {!((booksLoading || booksLoadError) && rawBooks.length === 0) && (
                  <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {/* メモを読んでいる間で、まだ何も見つかっていないときは「0 冊」と言い切らない（2026-09-30） */}
                    {libraryQuery ? (librarySearch.memoStatus === 'loading' && filtered.length === 0 ? `${rawBooks.length} 冊中 …` : `${rawBooks.length} 冊中 ${filtered.length} 冊`) : `${filtered.length} 冊`}
                  </span>
                )}
              </div>
              {(librarySearchOpen || search) && (
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <IcSearch size={18} aria-hidden="true" style={{ position: "absolute", left: 'var(--space-3)', color: "var(--text-3)", pointerEvents: "none" }} />
                  {/* type="search" は端末の青い × が出るので、ふつうの入力欄＋自前の消すボタンにする。 */}
                  <input
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    maxLength={100}
                    aria-label="本を検索（書名・著者・タグ・メモの言葉）"
                    // メモ（この本のまとめ・読書準備も）に書いた言葉からも本を探せる（2026-09-30）。
                    placeholder="書名・著者・メモの言葉で探す"
                    value={search}
                    autoFocus={librarySearchOpen && !search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
                    style={{ ...inp, flex: 1, minHeight: 48, background: "var(--surface)", border: '1px solid var(--border)', borderRadius: 'var(--radius)', paddingLeft: 'calc(var(--space-3) + 18px + var(--space-2))', paddingRight: 44 }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="検索の言葉を消す"
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}
                    >
                      <IcX size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {libraryMenu && (
              <ContextMenu
                x={libraryMenu.x}
                y={libraryMenu.y}
                onClose={() => setLibraryMenu(null)}
                items={[
                  { label: `並び替え（${SORT_LABELS[sortBy] || '更新順'}）`, icon: <IcSort size="1.1em" aria-hidden="true" />, onClick: () => setSortSheetOpen(true) },
                  { label: activeFilterCount > 0 ? `絞り込み（${activeFilterCount}）` : '絞り込み', icon: <IcFilter size="1.1em" aria-hidden="true" />, onClick: () => setFilterSheetOpen(true) },
                  effectiveBookshelfView === 'grid'
                    ? { label: 'リストで表示', icon: <IcList size="1.1em" aria-hidden="true" />, onClick: () => setBookshelfViewMode('list') }
                    : { label: '表紙で表示', icon: <IcGrid size="1.1em" aria-hidden="true" />, onClick: () => setBookshelfViewMode('grid') },
                  // ブクログ・Kindle の記録を本棚に取り込む（設定の奥だけだったので、本の一覧からも・2026-09-29）。
                  { label: '取り込む', icon: <Upload size="1.1em" aria-hidden="true" />, onClick: () => setShowImport(true) },
                  // 押し込まれた画面では全体ヘッダー（？）を出さないので、ヘルプはここから。
                  { label: 'ヘルプ', icon: <HelpCircle size="1.1em" aria-hidden="true" />, onClick: openHelp },
                ]}
              />
            )}
            <div style={{ padding: "0 var(--space-4)" }}>
              {/* 🔎 ステータスのワンタップ絞り込み。管理の最頻操作（読書中だけ見る等）を
                  絞り込みシートの1階層奥から棚の表に昇格。state は絞り込みシートと共有
                  （statusFilter＝activeFilterCount とも連動）。同じチップの再タップで解除。
                  本が少ないうちはノイズなので 4 冊未満では出さない。 */}
              {/* 検索で 0 件のときはチップ行を出さない（下の「該当する本がありません」だけにする）。 */}
              {(books.length >= 4 || folderFilter || minRating > 0 || tagFilter.length > 0) && !(filtered.length === 0 && libraryQuery && rawBooks.length > 0) && (
                <div
                  style={{
                    display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 'var(--space-4)',
                    // チップの見た目は 32・押せる範囲は 44。上下の余り（6 ずつ）を行の外側で相殺し、
                    // 見た目の間隔を 見出し→チップ 12・チップ→一覧 16 にそろえる（チップ自体に負の余白を
                    // 付けると横スクロールの枠で押せる範囲が切れ、シートの折り返しでは行が詰まるため行の側で）。
                    margin: 'calc((32px - 44px) / 2) 0',
                    WebkitOverflowScrolling: 'touch',
                    // 右端をふわっと透過させ「まだ続きがある（横スクロールできる）」を示す。
                    // フェードなしだと「読了」チップが硬く見切れて壊れて見えていた。
                    WebkitMaskImage: 'linear-gradient(90deg, #000 90%, transparent 100%)',
                    maskImage: 'linear-gradient(90deg, #000 90%, transparent 100%)',
                  }}
                  role="group"
                  aria-label="状態で絞り込み"
                >
                  {/* フォルダで絞っている間だけ、先頭にそのフォルダのチップ（押すと解除）。フォルダの選択は「…」→ 絞り込み。 */}
                  {folderFilter && (
                    <ShelfChip active onClick={() => setFolderFilter(null)} ariaLabel={`フォルダ「${folderFilter}」の絞り込みを解除`}>
                      <IcFolder size={14} aria-hidden="true" />{folderFilter}<IcX size={14} aria-hidden="true" />
                    </ShelfChip>
                  )}
                  {/* 評価・タグの絞り込みも、効いている間は先頭に見せる（押すと解除）。「すべて」が選ばれて見えても、何かで絞っていると分かるように。 */}
                  {minRating > 0 && (
                    <ShelfChip active onClick={() => setMinRating(0)} ariaLabel={`評価 ${minRating} 以上の絞り込みを解除`}>
                      <IcStar size={14} aria-hidden="true" />{minRating}以上<IcX size={14} aria-hidden="true" />
                    </ShelfChip>
                  )}
                  {tagFilter.map((t) => (
                    <ShelfChip key={`tag-${t}`} active onClick={() => setTagFilter((prev) => prev.filter((x) => x !== t))} ariaLabel={`分野「${t}」の絞り込みを解除`}>
                      <IcShapes size={14} aria-hidden="true" />{t}<IcX size={14} aria-hidden="true" />
                    </ShelfChip>
                  ))}
                  {/* 並びは管理でよく使う順（読書中・読了を先に）。 */}
                  {[{ key: 'all', label: 'すべて', count: chipStats.total }, ...SHELF_CHIP_ORDER.map((k) => STATUSES.find((st) => st.key === k)).filter(Boolean).map((s) => ({ key: s.key, label: s.label, count: chipStats[s.key] || 0 }))].map((s) => {
                    // 選んでいる状態のチップは 0 件でも残す（押して解除できるように）。
                    if (s.key !== 'all' && s.count === 0 && statusFilter !== s.key) return null;
                    const active = statusFilter === s.key;
                    return (
                      <ShelfChip
                        key={s.key}
                        onClick={() => setStatusFilter(active && s.key !== 'all' ? 'all' : s.key)}
                        active={active}
                      >
                        {s.label}{s.key !== 'all' && <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{s.count}</span>}
                      </ShelfChip>
                    );
                  })}
                </div>
              )}
              {/* ホームに移した: はじめの一歩・いま読んでいる本（HomeScreen.jsx・相談カードは 2026-10-01 に外した）。
                  思い出しカードは「振り返り」へ（SPEC §1）。ここは本の一覧だけに集中する。 */}
              {booksLoading && rawBooks.length === 0 ? (
                <>
                  {/* 上のチップ行と同じ高さ・余白の仮の行（押せる範囲 44・見た目 32・下 16）。
                      読み込み後にチップ行が出ても、一覧が 44 下へ跳ねないように。 */}
                  <div
                    aria-hidden="true"
                    style={{
                      display: 'flex', gap: 'var(--space-2)', alignItems: 'center', overflow: 'hidden',
                      height: 44, margin: 'calc((32px - 44px) / 2) 0', paddingBottom: 'var(--space-4)',
                      boxSizing: 'content-box',
                    }}
                  >
                    {[72, 88, 64, 80].map((w, i) => (
                      <SkeletonBlock key={i} width={w} height={32} radius="var(--radius)" style={{ flexShrink: 0 }} />
                    ))}
                  </div>
                  {skeletonBookshelfView === 'grid' ? (
                    <BookGridSkeleton count={6} />
                  ) : (
                    <BookListSkeleton rows={4} />
                  )}
                </>
              ) : booksLoadError && rawBooks.length === 0 ? (
                // 読み込みに失敗したときは「本がない」ではなく、読み込めなかったことを出す。
                // アイコン・言い方はホーム・本の検索のエラーとそろえる（既定の AlertCircle）。
                <ErrorMessage
                  title="本を読み込めませんでした"
                  description="通信環境を確認して、もう一度お試しください。"
                  actions={[{ label: 'もう一度', onClick: () => refreshBooks(), variant: 'primary' }]}
                />
              ) : filtered.length === 0 && libraryQuery && librarySearch.memoStatus === 'loading' ? (
                // メモを読み終えるまでは「該当する本がありません」と言わない（メモで見つかった本の行と同じ形・高さで待つ）。
                <LibrarySearchHitSkeleton rows={3} />
              ) : filtered.length === 0 ? (
                rawBooks.length === 0 ? (
                  <EmptyState
                    icon={<IcLibrary size={34} aria-hidden="true" />}
                    title="最初の1冊から"
                    actions={[
                      { label: '本を追加', onClick: openAdd, variant: 'primary', icon: <IcPlus size={18} aria-hidden="true" /> },
                    ]}
                    // 脇の入口は「これまで読んだ本から始める」（ホームの本 0 冊と同じ入口・無料で使える）。
                    // AI 選書は有料プランだけなので、最初の一歩には出さない。
                    tip={(
                      <button type="button" onClick={() => setShowQuickstart(true)} style={btnLink}>
                        これまで読んだ本から始める
                      </button>
                    )}
                  />
                ) : (
                  <EmptyState
                    icon={<IcSearchX size={32} aria-hidden="true" />}
                    title="該当する本がありません"
                    // 検索のときは、メモの中まで探したことを言う（書名だけを探したと思われないように・2026-09-30）。
                    description={libraryQuery ? '書名・著者・メモの中を探しました' : undefined}
                    actions={[
                      {
                        // 検索語だけで絞っているときは「検索をクリア」、状態・フォルダ等もあれば「条件をクリア」。
                        label: search.trim() && activeFilterCount === 0 ? '検索をクリア' : '条件をクリア',
                        onClick: () => { setSearch(''); setFolderFilter(null); clearAllFilters(); },
                        variant: 'primary',
                      },
                    ]}
                    // 見つからないときは、相談で探す（入力欄に問いを入れるだけ・送らない・2026-09-30）。
                    tip={libraryQuery ? <ConsultSearchLink center onClick={() => openConsultSearch(libraryQuery)} /> : undefined}
                  />
                )
              ) : libraryQuery && libraryHits ? (
                // 🔎 検索中は行の一覧（メモで見つかった本は、その一節を添える・lib/librarySearch.js）。
                <LibrarySearchResults
                  books={filtered}
                  hits={libraryHits}
                  onOpen={(b, memoId) => openDetail(b, memoId)}
                  onAutoRetry={triggerCoverAutoRetry}
                  showStatus={statusFilter === 'all'}
                  memoStatus={librarySearch.memoStatus}
                  onRetry={librarySearch.retry}
                  onConsult={() => openConsultSearch(libraryQuery)}
                  renderBookRow={(b, i) => {
                    // 書名・著者・タグで見つかった部分に印（タグはほかで見つからなかったときだけ 1 行・2026-09-30）
                    const f = libraryHits.get(b.id)?.fields || {};
                    const highlight = {
                      title: f.title ? highlightSegments(b.title, libraryQuery) : null,
                      author: f.author ? highlightSegments(b.author, libraryQuery) : null,
                      tag: !f.title && !f.author ? f.tag || null : null,
                    };
                    return (
                    <SwipeableBookCard
                      key={b.id}
                      book={b}
                      index={i}
                      highlight={highlight}
                      isJustDone={recentlyDoneId === b.id}
                      onOpen={openDetail}
                      onSwipeDelete={swipeDeleteBook}
                      onLongPress={handleBookLongPress}
                      onAutoRetry={triggerCoverAutoRetry}
                      showStatus={statusFilter === 'all'}
                    />
                    );
                  }}
                />
              ) : effectiveBookshelfView === 'grid' ? (
                <div className="bookshelf-grid">
                  {(libraryRenderAll ? filtered : filtered.slice(0, LIBRARY_FIRST)).map((b) => (
                    <BookCoverCard
                      key={b.id}
                      book={b}
                      isJustDone={recentlyDoneId === b.id}
                      onOpen={openDetail}
                      onLongPress={handleBookLongPress}
                      onAutoRetry={triggerCoverAutoRetry}
                      showStatus={statusFilter === 'all'}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}>
                  {(libraryRenderAll ? filtered : filtered.slice(0, LIBRARY_FIRST)).map((b, i) => (
                    <SwipeableBookCard
                      key={b.id}
                      book={b}
                      index={i}
                      isJustDone={recentlyDoneId === b.id}
                      onOpen={openDetail}
                      onSwipeDelete={swipeDeleteBook}
                      onLongPress={handleBookLongPress}
                      onAutoRetry={triggerCoverAutoRetry}
                      showStatus={statusFilter === 'all'}
                    />
                  ))}
                </div>
              )}
              {/* 📊 統計（成果ファネル＋累計/月別読了）は本棚から撤去し、振り返りの
                  「記録」サブタブ（ReadingRecord）へ移管（2026-07-17 オーナー裁定）。
                  本棚は本だけの静かな棚に。 */}
            </div>
          </PullToRefresh>
        )}

        {tab === "review" && (
          <div key={`tab-${tab}`} className="tab-content">
            <div className="sub-tabs" role="tablist" aria-label="振り返りのサブタブ">
              {/* 並び: 行動｜メモ｜記録（SPEC §4。「ノート」は GLOSSARY どおり「メモ」）。 */}
              <button
                type="button"
                role="tab"
                aria-selected={reviewSubTab === 'action'}
                className={`sub-tab ${reviewSubTab === 'action' ? 'active' : ''}`}
                onClick={() => { setActionShowDoneNonce(null); setReviewSubTab('action'); }}
              >
                行動
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reviewSubTab === 'note'}
                className={`sub-tab ${reviewSubTab === 'note' ? 'active' : ''}`}
                onClick={() => setReviewSubTab('note')}
              >
                メモ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reviewSubTab === 'record'}
                className={`sub-tab ${reviewSubTab === 'record' ? 'active' : ''}`}
                onClick={() => setReviewSubTab('record')}
              >
                記録
              </button>
            </div>
            {reviewSubTab === 'note' ? (
              <Suspense fallback={<ReviewNoteFallback />}>
                <Review books={books} onOpenBook={(b, memoId, opts) => { openDetail(b, memoId, opts); }} onAddAction={addActionFromMemo} onAddNote={() => setAddNoteSheet('pick')} onGoToShelf={() => { navigateTab('books'); goList(); setShelfMode('library'); }}
                  // メモ検索で見つからなかった言葉を、相談の入力欄に入れて開く（送らない・2026-09-29）。
                  // 思い出しカードの「このメモで相談する」は、相談相手をそのメモの本に絞る（opts.bookIds・2026-10-10）。
                  onAskConsult={(q, opts) => openConsultWith(q, { bookIds: opts?.bookIds || null })}
                  searchPreset={memoSearchPreset} />
              </Suspense>
            ) : booksLoadError && rawBooks.length === 0 ? (
              // 本（行動も本に入っている）を読み込めなかったときは、「行動 0 件」「読んだ本 0」を出さない。
              <div style={{ padding: 'var(--space-4)' }}>
                <ErrorMessage
                  title="本を読み込めませんでした"
                  description="通信環境を確認して、もう一度お試しください。"
                  actions={[{ label: 'もう一度', onClick: () => refreshBooks(), variant: 'primary' }]}
                />
              </div>
            ) : reviewSubTab === 'record' ? (
              <Suspense fallback={<TabPanelSkeleton />}>
                <ReadingRecord
                  books={books}
                  onGoToShelf={() => { navigateTab('books'); goList(); setShelfMode('library'); }}
                  // 📊 統計→中身への 1 タップ動線。既存の絞り込みを一度リセット
                  // してから目的の条件だけを立てる（前の絞り込みが残っていると
                  // 「読了 5 冊のはずが 2 冊しか出ない」ように見えるため）。
                  onShowBooks={(status) => {
                    setSearch(''); setMinRating(0); setTagFilter([]); setFolderFilter(null);
                    setStatusFilter(status || 'all');
                    openLibraryFromRecord();
                  }}
                  onShowMemos={() => setReviewSubTab('note')}
                  onFindBooksForTag={(tags) => openAdvisorWithDraft(advisorDraftFor(tags))}
                  onShowActions={() => { setActionShowDoneNonce(Date.now()); setReviewSubTab('action'); }}
                  onOpenBook={(b) => { setTab('books'); openDetail(b); }}
                  onFilterTag={(tag) => {
                    setSearch(''); setMinRating(0); setFolderFilter(null); setStatusFilter('all');
                    setTagFilter([tag]);
                    openLibraryFromRecord();
                  }}
                  onSearchAuthor={(author) => {
                    setMinRating(0); setTagFilter([]); setFolderFilter(null); setStatusFilter('all');
                    setSearch(author);
                    openLibraryFromRecord();
                  }}
                />
              </Suspense>
            ) : (
              // 下に引いて読み込み直す（ホーム・すべての本と同じ・2026-09-29）。
              <PullToRefresh onRefresh={async () => { await refreshBooks(); haptic.light(); }}>
              <ActionList
                books={books}
                showDoneNonce={actionShowDoneNonce}
                focusAction={actionFocus}
                onToggleAction={toggleAction}
                onReflect={saveActionReflection}
                onDeleteAction={deleteActionFromBook}
                onEditAction={(bookId, actionIdx, action, opts) => setEditingAction({ bookId, actionIdx, action, queue: opts?.queue || null, total: opts?.total || 0, session: (opts?.total || 0) > 1 ? { saves: [] } : null })}
                onOpenBook={(b) => { openDetail(b); }}
                onGoToBooks={() => setTab("books")}
                onAddAction={() => setAddActionSheet({ step: 'pick', prefillText: '' })}
                onGoConsult={() => { setView('list'); setAiSubTab('brain'); setTab('ai'); }}
                // 完了した行動の「この結果を相談する」（下書きを入れて相談を開く・相談相手はその本・2026-10-10）
                onConsultResult={(q, bookId) => openConsultWith(q, { bookIds: bookId ? [bookId] : null })}
              />
              </PullToRefresh>
            )}
          </div>
        )}

        {tab === "ai" && (
          <div key={`tab-${tab}`} className="tab-content ai-page">
            {/* サブタブは名前の幅（相談｜AI 選書）で左に寄せ、同じ行の右端にその画面の操作（相談の 🕒・…／AI 選書の履歴・新規）。
                上の操作を「サブタブ／アイコンの行／件数の行」と 3 段に積まない（2026-10-01 ui-critic・DESIGN §5）。 */}
            {!(aiSubTab === 'brain' && consultPushed) && !(aiSubTab === 'advisor' && advisorPushed) && (
            <div className="sub-tabs sub-tabs--fit" style={{ flexShrink: 0 }}>
            <div role="tablist" aria-label="相談のサブタブ" className="sub-tabs__list">
              <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'brain'}
                className={`sub-tab ${aiSubTab === 'brain' ? 'active' : ''}`}
                onClick={() => setAiSubTab('brain')}
              >
                相談
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'advisor'}
                aria-label={paywallPlan === 'free' ? 'AI 選書（プランの機能）' : undefined}
                className={`sub-tab ${aiSubTab === 'advisor' ? 'active' : ''}`}
                onClick={() => setAiSubTab('advisor')}
              >
                {/* 無料プランの人には、タブの 2 行目の「プラン」は出さない（入力欄の下の「AI 選書はプランの機能です」と
                    読み上げ名で足りる・タブの高さが 2 行になって重く見えた・2026-09-30 ui-critic）。 */}
                AI 選書
              </button>
            </div>
            <div ref={setAiBarSlot} className="sub-tabs__actions" />
            </div>
            )}
            {/* サブタブ（相談｜AI 選書）の下に説明文は置かない（各画面の見出しで伝わる・DESIGN §0-6）。 */}
            <div className="ai-page-body">
              {aiSubTab === 'advisor' ? (
                <Suspense fallback={<TabPanelSkeleton />}>
                  <BookAdvisor
                    onAddBook={(rec, payload) => addFromAdvisor(rec, payload)}
                    // 確認の候補に目当ての本が無いとき: 書名で探す（検索を開いて自動で探す）／手動で入力する。戻り先は「‹ AI 選書」。
                    // 読書準備（課題・得たいこと・選書理由）も渡す（「読みたいに追加」と同じ中身・2026-10-04）。
                    onSearchBook={(q, setup) => { addStatusPresetRef.current = ''; advisorSetupRef.current = setup || null; setAddOrigin('advisor'); setAddFromSearchQuery(q || ''); setAddBookModalOpen(true); }}
                    onManualBook={(seed) => { addStatusPresetRef.current = ''; setAddOrigin('advisor'); openManualFromAdd(seed); setAddFromSearchQuery(null); }}
                    sessionApi={advisorSessions}
                    books={books}
                    onOpenBook={(b) => openDetail(b)}
                    barSlot={aiBarSlot}
                    onPushedViewChange={setAdvisorPushed}
                    draftPreset={advisorDraft}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<TabPanelSkeleton />}>
                  <MyBookBrain
                    // 本を探す問いの答えのメモの行は、その本のそのメモまで開く（2026-09-30）。
                    onOpenBook={(b, memoId) => { openDetail(b, memoId); }}
                    books={books}
                    onAddAction={addActionFromMemo}
                    onBooksMutated={refreshBooks}
                    // 相談の答えから（いちばんの根拠が自分の学びで本が決まらない）: 期限は明日で入れ、追加できたら答えに知らせる。
                    onAddActionPickBook={(text, onDone, opts) => setAddActionSheet({ step: 'pick', prefillText: text, from: 'consult', onDone: typeof onDone === 'function' ? onDone : null, evidenceIds: opts?.evidenceBookIds || [] })}
                    onGoBookshelf={() => { setView('list'); setTab('books'); }}
                    onQuickstart={() => setShowQuickstart(true)}
                    onAddBook={() => openAdd()}
                    // 追加した行動（{ bookId, text }）があれば、行動の一覧でその行まで送って光らせる（2026-09-30）。
                    onOpenActions={(focus) => { setActionFocus(focus && focus.bookId ? { ...focus, nonce: Date.now() } : null); setReviewSubTab('action'); setTab('review'); }}
                    askPreset={askPreset}
                    scopePreset={scopePreset}
                    onSearchMemos={openMemoSearch}
                    onPushedViewChange={setConsultPushed}
                    barSlot={aiBarSlot}
                  />
                </Suspense>
              )}
            </div>
          </div>
        )}
      </div>

      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={() => openAdd('reading')} onImport={() => setShowImport(true)} onStartQuickstart={() => setShowQuickstart(true)} onStartOcr={startOcrPath} />}
        {quickstartOverlay}
        {importOverlay}

      {bookContextMenu && (
        <ContextMenu
          x={bookContextMenu.x}
          y={bookContextMenu.y}
          onClose={() => setBookContextMenu(null)}
          items={[
            {
              label: '詳細を開く',
              icon: <BookOpen size="1.1em" aria-hidden="true" />,
              onClick: () => openDetail(bookContextMenu.book),
            },
            // 読書中/読了の本は、本棚の長押しから直接メモを書けるように
            // （最速でも「探す→開く→FAB」だった導線を1手に短縮＝熱い一行を取りこぼさない）。
            ...((bookContextMenu.book?.status === 'reading' || bookContextMenu.book?.status === 'done')
              ? [{
                  label: 'メモを書く',
                  icon: <PencilLine size="1.1em" aria-hidden="true" />,
                  onClick: () => { openDetail(bookContextMenu.book); setQuickMemoOpen(true); },
                }]
              : []),
            // 📗 本を開かずにその場でステータス変更（管理の最頻操作を1手に）。
            {
              label: '状態を変える',
              icon: <IcCheck size="1.1em" aria-hidden="true" />,
              onClick: () => setStatusPickerBook(bookContextMenu.book),
            },
            // 🗂 フォルダ割当ても本棚から直接（新規フォルダもその場で作れる）。
            {
              label: 'フォルダに入れる',
              icon: <IcFolder size="1.1em" aria-hidden="true" />,
              onClick: () => { setNewFolderName(''); setFolderPickerBook(bookContextMenu.book); },
            },
            {
              label: '編集',
              icon: <PencilLine size="1.1em" aria-hidden="true" />,
              onClick: () => openEdit(bookContextMenu.book),
            },
            // 本棚から直接「表紙を取り直す」できるように追加。本詳細を開かず
            // 1 タップで再 fetch まで完結する (誤表紙への対処を 3 秒以内に)。
            {
              label: '表紙を取り直す',
              icon: <IcRefresh size="1.1em" aria-hidden="true" />,
              onClick: () => refreshCoverFor(bookContextMenu.book),
            },
            // 読書中・読了は画像で共有（メモはシートが読み込む）。読みたい・積読は文を共有。
            (bookContextMenu.book.status === 'reading' || bookContextMenu.book.status === 'done')
              ? {
                  label: '写真で共有',
                  icon: <Share size="1.1em" aria-hidden="true" />,
                  onClick: () => setShareSheet({ book: bookContextMenu.book, from: 'menu' }),
                }
              : {
                  label: '共有',
                  icon: <Share size="1.1em" aria-hidden="true" />,
                  onClick: () => shareBook(bookContextMenu.book),
                },
            {
              label: '削除',
              icon: <Trash2 size="1.1em" aria-hidden="true" />,
              destructive: true,
              onClick: () => requestDeleteBook(bookContextMenu.book),
            },
          ]}
        />
      )}

      {/* 📷 ホームの「写真で共有」・本棚の長押し →「写真で共有」。本の詳細の同じ mount とは片方の画面しか return されない。
          ホームから開いたときは「どの本？」を切り替えられる（今月・読書中・読了の本）。 */}
      {shareSheet && (
        <Suspense fallback={<OverlayFallback />}>
          <ShareSheet
            book={shareSheet.book || null}
            books={shareSheet.fromHome ? books : undefined}
            initialSubject={shareSheet.initialSubject || undefined}
            initialMemoId={shareSheet.initialMemoId || null}
            initialPhotoFile={shareSheet.photoFile || null}
            from={shareSheet.from || 'menu'}
            onClose={() => setShareSheet(null)}
          />
        </Suspense>
      )}
      {shareCameraInput}
      {focusLayer}

      {settingsOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AccountSettings
            onClose={() => setSettingsOpen(false)}
            onAfterDelete={() => setSettingsOpen(false)}
            isAdmin={isAdmin}
            onOpenAdmin={() => { setSettingsOpen(false); setAdminOpen(true); }}
            onOpenImport={() => { setSettingsOpen(false); setShowImport(true); }}
            onOpenHelp={() => { setSettingsOpen(false); setHelpModalOpen(true); }}
          />
        </Suspense>
      )}

      {/* 🛰️ 運営ダッシュボード（管理者のみ。設定モーダルの「運営」から開く） */}
      {adminOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AdminDashboard onClose={() => setAdminOpen(false)} />
        </Suspense>
      )}

      {/* 表紙修正モーダル — 詳細画面の「表紙が違う？」リンクから開く。
          findIsbnCandidatesWithMetadata で別エディションの表紙候補を
          グリッド表示し、ユーザーが正しいものを選び直せる。 */}
      {coverFixForBook && (
        <Suspense fallback={<Spinner />}>
        <CoverFixModal
          book={coverFixForBook}
          onClose={() => setCoverFixForBook(null)}
          onPick={(pick) => handleCoverFixPick(coverFixForBook, pick)}
          onManualUpload={() => triggerManualCoverUpload(coverFixForBook)}
        />
        </Suspense>
      )}

      {/* 旧「✅ 完了おめでとうございます!」振り返りモーダルは撤去。
          完了はタップ即時、reflection は ActionEditModal から編集可能。 */}

      {editingAction && (
        <Suspense fallback={<Spinner />}>
        <ActionEditModal
          // 「期限を見直す」で次の行動を開くときは作り直す（入力欄を次の行動の値にする）。
          key={editingAction.action?.id || `${editingAction.bookId}:${editingAction.actionIdx}`}
          action={editingAction.action}
          step={editingAction.total > 1 ? { index: editingAction.total - (editingAction.queue?.length || 0), total: editingAction.total } : null}
          onClose={() => { const cur = editingAction; setEditingAction(null); finishReview(cur); }}
          onSave={async (patch) => {
            const cur = editingAction;
            const { bookId, actionIdx, action: openedAction } = cur;
            // 「期限を見直す」の途中（session あり）は、保存を待たずに次の行動をすぐ開く。保存は裏で進め、
            // 失敗したらその行動を元に戻して知らせる。件数の知らせは最後にまとめて 1 回（finishReview・2026-09-30）。
            const reviewing = !!cur.session;
            // トグル/削除と同じ本ごとの直列化チェーンに乗せる（並行 saveBook との
            // 競合で編集内容が stale 上書きで失われるのを防ぐ）。
            // ⚠️ 対象の身元は「モーダルを開いた時点の action」を使う。保存時に
            // actionIdx で再取得すると、モーダルを開いている間に配列が動いた場合
            // （繰り返しスポーン / 別行削除）に別の行を掴んでしまう。resolveActionIndex は
            // id 優先で解決するので、開いた時点の action オブジェクトを渡すのが正しい。
            const editTarget = openedAction || (booksRef.current.find((b) => b.id === bookId)?.actions || [])[actionIdx] || null;
            // 保存の結末で閉じ方を変える: 'saved'/'gone'（対象消失）は閉じる、
            // 'failed'（保存失敗）はモーダルを開いたままにして入力（下書き）を守る。
            // create モードが「成功時のみ閉じる」のと挙動を揃える（先に閉じると
            // 保存失敗時に入力が全損する）。onSave は throw せず正常 resolve するので、
            // ActionEditModal 側は finally で busy を解除して開いたまま待機できる。
            let outcome = 'gone';
            let failMessage = '';
            const run = enqueueBookMutation(bookId, async (entry) => {
              const book = entry.latest || booksRef.current.find((b) => b.id === bookId);
              if (!book) return;
              const acts = [...(book.actions || [])];
              const idx = resolveActionIndex(acts, editTarget, actionIdx);
              if (idx < 0 || idx >= acts.length) return;
              acts[idx] = { ...acts[idx], ...patch };
              const updated = { ...book, actions: acts };
              mutateBookLocal(bookId, () => updated);
              syncActionSnapshots(updated);
              try {
                const saved = await saveBook(updated);
                entry.latest = saved || updated;
                syncActionSnapshots(saved || updated);
                outcome = 'saved';
                // 「期限を見直す」の途中は、ここでは知らせない（最後に件数をまとめて知らせる）。
                if (!reviewing) toast.success('🎯 行動を更新しました。');
              } catch (error) {
                mutateBookLocal(bookId, () => book);
                entry.latest = book;
                syncActionSnapshots(book);
                outcome = 'failed';
                failMessage = toSaveMessage(error, '保存できませんでした。');
                // 「期限を見直す」の途中は次の行動に進んでいるので知らせで。ふだんはモーダルの中に出す（知らせはモーダルの下に隠れる）。
                if (reviewing) toast.error(failMessage);
              }
            });
            if (reviewing) {
              cur.session.saves.push(Promise.resolve(run).then(() => outcome, () => 'failed'));
              openNextReviewAction(cur);
              return;
            }
            await run;
            if (outcome === 'failed') return { error: failMessage };
            openNextReviewAction(cur);
          }}
          // 「期限を見直す」の途中で、この行動は変えずに次へ（2026-09-30）。
          onSkip={() => openNextReviewAction(editingAction)}
          onDelete={async () => {
            const { bookId, actionIdx, action } = editingAction;
            setEditingAction(null);
            finishReview(editingAction);
            // モーダル側で確認済み → 二重確認を避ける。開いたときの行動を身元にする（並びがずれても別の行動を消さない）。
            await deleteActionFromBook(bookId, actionIdx, { skipConfirm: true, target: action });
          }}
        />
        </Suspense>
      )}

      {/* 🎯 行動タブ「＋追加」/ 🧠マイ読書脳の行動化フォールバック:
          ① どの本の行動かを選ぶ（読書中→読了→積読→読みたい順）。
          prefillText があれば ② の入力欄に初期表示する（本を解決できなかった
          AI 回答の「明日の一歩」を、本を選んで行動化できるようにする）。 */}
      {addActionSheet?.step === 'pick' && (() => {
        const rank = { reading: 0, done: 1, before: 2, want: 3 };
        const sorted = [...books].sort((a, b) => {
          const ra = rank[a.status] ?? 4;
          const rb = rank[b.status] ?? 4;
          if (ra !== rb) return ra - rb;
          return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
        });
        // 相談の答えから来たら、その答えの根拠になった本を先に「この答えの根拠」としてまとめる（2026-09-30）。
        const evidenceIds = addActionSheet.evidenceIds || [];
        const evidence = evidenceIds.map((id) => books.find((b) => b.id === id)).filter(Boolean);
        const rest = evidence.length ? sorted.filter((b) => !evidenceIds.includes(b.id)) : sorted;
        const pick = (b) => setAddActionSheet({ ...addActionSheet, step: 'edit', bookId: b.id, prefillText: addActionSheet.prefillText || '' });
        const row = (b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => pick(b)}
            style={{ ...sheetOption(false), minHeight: 56 }}
          >
            <MiniCover book={b} width={28} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
              <span style={{ display: 'block', fontSize: 'var(--text-caption)', color: 'var(--text-2)' }}>{STATUS_LABEL[b.status] || b.status}</span>
            </span>
          </button>
        );
        const list = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' };
        return (
          <BottomSheet title="どの本の行動にしますか？" onClose={() => setAddActionSheet(null)} dismissLabel="キャンセル">
            {/* 何を行動にするのか（相談の答えの一歩・2 行まで）。行動の短い形（actionGist）＝頭の「〈相談〉：」を外し、
                「メモに残した「長い…」」のような決まり文句だけにならないよう引用の頭を見せる（相談例と同じ・2026-09-30）。 */}
            {addActionSheet.prefillText && (
              <p style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                {withPhraseBreaks(actionGist(addActionSheet.prefillText, 44))}
              </p>
            )}
            {evidence.length > 0 ? (
              <>
                <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>この答えの根拠</p>
                <div style={list}>{evidence.map(row)}</div>
                {rest.length > 0 && (
                  <>
                    <p style={{ ...groupTitle, margin: 'var(--space-6) 0 var(--space-2)' }}>ほかの本</p>
                    <div style={list}>{rest.map(row)}</div>
                  </>
                )}
              </>
            ) : (
              <div style={list}>{rest.map(row)}</div>
            )}
          </BottomSheet>
        );
      })()}

      {/* 🎯 行動タブ「＋追加」: ② 行動の内容を入力（ActionEditModal を create モードで再利用）。
          prefillText があれば行動文を初期表示（AI 回答からの行動化フォールバック）。 */}
      {addActionSheet?.step === 'edit' && addActionSheet.bookId && (
        <Suspense fallback={<Spinner />}>
          <ActionEditModal
            mode="create"
            bookTitle={books.find((b) => b.id === addActionSheet.bookId)?.title || ''}
            // 相談の答えから来たときは、ほかの「行動に追加」と同じく期限は明日で入れておく（2026-09-30）。
            action={addActionSheet.prefillText
              ? { text: addActionSheet.prefillText, ...(addActionSheet.from === 'consult' ? { deadline: tomorrowLocal() } : null) }
              : null}
            onClose={() => setAddActionSheet(null)}
            onSave={async (patch) => {
              // 相談から: 追加できたことは答えの中の「行動に追加しました（期限は明日）見る」で伝える（知らせを重ねない）。
              const fromConsult = addActionSheet.from === 'consult';
              let error = '';
              const ok = await createActionForBook(addActionSheet.bookId, { ...patch, quiet: fromConsult, source: fromConsult ? 'consult' : 'manual', onError: (m) => { error = m; } });
              if (!ok) return { error };
              if (ok) {
                addActionSheet.onDone?.(patch?.deadline ?? '', { bookId: addActionSheet.bookId, text: String(patch?.text || '').trim().slice(0, LIMITS.actionText || 500) });
                setAddActionSheet(null);
              }
            }}
          />
        </Suspense>
      )}

      {/* 💭 ノートタブ「＋メモを追加」: どの本のメモかを選ぶ（読書中→読了順）。
          選ぶとその本の詳細を開いてクイックメモを起動する（メモは reading/done
          の本にだけ付くので、その2ステータスのみ候補に出す）。 */}
      {/* 📗 ステータス変更シート（本棚の長押し → ステータスを変える）。
          本を開かずその場で 4 ステータスへ移動。日付補完は setBookStatusQuiet 側。 */}
      {statusPickerBook && (
        <BottomSheet title="状態を変える" onClose={() => setStatusPickerBook(null)}>
          <p style={sheetSubtitle}>
            『{statusPickerBook.title}』
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {STATUSES.map((s) => {
              const active = (books.find((b) => b.id === statusPickerBook.id)?.status || statusPickerBook.status) === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={active}
                  onClick={() => { setBookStatusQuiet(books.find((b) => b.id === statusPickerBook.id) || statusPickerBook, s.key); setStatusPickerBook(null); }}
                  style={{ ...sheetOption(active), cursor: active ? 'default' : 'pointer' }}
                >
                  <s.Icon size={18} aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                    <span>{s.label}</span>
                    {s.desc && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-2)', fontWeight: 400 }}>{s.desc}</span>}
                  </span>
                  {active && <IcCheck size={18} aria-label="現在" style={{ marginLeft: 'auto', color: 'var(--accent)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}

      {/* 🗂 フォルダ割当てシート（本棚の長押し → フォルダに入れる）。
          タップでフォルダの出し入れをトグル（複数フォルダ可）。新規フォルダも
          その場で作成できる。シートは開いたまま＝複数割当てが一気にできる。 */}
      {folderPickerBook && (() => {
        const liveBook = books.find((b) => b.id === folderPickerBook.id) || folderPickerBook;
        const cols = liveBook.collections || [];
        const toggleFolder = (name) => {
          const next = cols.includes(name) ? cols.filter((c) => c !== name) : [...cols, name];
          // 成功トーストは出さない（シート内のチェックが即時フィードバック）。
          applyBookPatchQuiet(liveBook.id, { collections: next }, null);
        };
        const createAndAdd = () => {
          const name = newFolderName.trim();
          if (!name) return;
          if (!cols.includes(name)) toggleFolder(name);
          setNewFolderName('');
        };
        return (
          <BottomSheet title="フォルダに入れる" onClose={() => setFolderPickerBook(null)}>
            <p style={sheetSubtitle}>
              『{liveBook.title}』
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {folderNames.map((name) => {
                const inFolder = cols.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleFolder(name)}
                    aria-pressed={inFolder}
                    style={sheetOption(inFolder)}
                  >
                    <IcFolder size={18} aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {inFolder && <IcCheck size={18} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--accent)', flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <input
                aria-label="新しいフォルダ名"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); createAndAdd(); }
                }}
                placeholder="新しいフォルダ名"
                maxLength={40}
                style={{ ...inp, flex: 1, minWidth: 0, minHeight: 48, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
              />
              <button
                type="button"
                onClick={createAndAdd}
                disabled={!newFolderName.trim()}
                style={{
                  ...btnGhost, width: 'auto', flexShrink: 0, padding: '0 var(--space-4)', fontSize: 'var(--text-sub)',
                  cursor: newFolderName.trim() ? 'pointer' : 'default', opacity: newFolderName.trim() ? 1 : 0.5,
                }}
              >
                作って入れる
              </button>
            </div>
          </BottomSheet>
        );
      })()}

      {addNoteSheet === 'pick' && (
        <BottomSheet title="どの本のメモにしますか？" onClose={() => setAddNoteSheet(null)} dismissLabel="キャンセル">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {[...books]
              .filter((b) => b.status === 'reading' || b.status === 'done')
              .sort((a, b) => {
                const rank = { reading: 0, done: 1 };
                const ra = rank[a.status] ?? 4;
                const rb = rank[b.status] ?? 4;
                if (ra !== rb) return ra - rb;
                return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
              })
              .map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { setAddNoteSheet(null); openDetail(b); setQuickMemoOpen(true); }}
                  style={{ ...sheetOption(false), minHeight: 56 }}
                >
                  <MiniCover book={b} width={28} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                    <span style={{ display: 'block', fontSize: 'var(--text-caption)', color: 'var(--text-2)' }}>{STATUS_LABEL[b.status] || b.status}</span>
                  </span>
                </button>
              ))}
          </div>
        </BottomSheet>
      )}

      {/* 本棚: 絞り込みシート（ステータス / ★高評価 / タグ） */}
      {filterSheetOpen && (
        <BottomSheet
          title="絞り込み"
          onClose={() => setFilterSheetOpen(false)}
          footer={activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              style={{ ...btnGhost, color: 'var(--error)' }}
            >
              条件をクリア（{activeFilterCount}）
            </button>
          )}
        >
          <p style={sheetLabel}>状態</p>
          <div style={sheetChips}>
            {[{ key: 'all', label: 'すべて', count: stats.total }, ...SHELF_CHIP_ORDER.map((k) => STATUSES.find((st) => st.key === k)).filter(Boolean).map((s) => ({ key: s.key, label: s.label, count: stats[s.key] || 0 }))].map((s) => (
              <ShelfChip key={s.key} active={statusFilter === s.key} onClick={() => setStatusFilter(s.key)}>
                {s.label}<span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{s.count}</span>
              </ShelfChip>
            ))}
          </div>

          {/* フォルダ（作っている人だけ）。棚の上にはチップ行を 2 段に積まず、ここで選ぶ。 */}
          {allFolders.length > 0 && (
            <>
              <p style={sheetLabel}>フォルダ</p>
              <div style={sheetChips}>
                {allFolders.map((f) => (
                  <ShelfChip key={f.name} active={folderFilter === f.name} onClick={() => setFolderFilter(folderFilter === f.name ? null : f.name)}>
                    <IcFolder size={14} aria-hidden="true" />
                    {f.name}<span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{f.count}</span>
                  </ShelfChip>
                ))}
              </div>
            </>
          )}

          <p style={sheetLabel}>評価（その星以上）</p>
          <div style={sheetChips}>
            {[1, 2, 3, 4, 5].map((n) => (
              <ShelfChip
                key={n}
                active={minRating === n}
                // 同じ星をもう一度押すと解除（指定なしに戻す）。
                onClick={() => setMinRating((cur) => (cur === n ? 0 : n))}
                ariaLabel={`★${n} 以上で絞り込む`}
              >
                <IcStar size={13} aria-hidden="true" />
                {n}{n < 5 ? '+' : ''}
              </ShelfChip>
            ))}
          </div>

          <p style={sheetLabel}>分野</p>
          {availableTags.length > 0 ? (
            <div style={{ ...sheetChips, marginBottom: 0 }}>
              {availableTags.map(({ name: t, count }) => {
                const active = tagFilter.includes(t);
                return (
                  <ShelfChip key={t} active={active} onClick={() => setTagFilter((arr) => (active ? arr.filter((x) => x !== t) : [...arr, t]))}>
                    {t}<span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{count}</span>
                  </ShelfChip>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
              本に分野が付くと、ここで選べます。
            </p>
          )}
        </BottomSheet>
      )}

      {/* 本棚: 並びシート */}
      {sortSheetOpen && (
        <BottomSheet title="並び替え" onClose={() => setSortSheetOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {Object.entries(SORT_LABELS).map(([key, label], i, arr) => {
              const active = sortBy === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSortBy(key); setSortSheetOpen(false); }}
                  aria-pressed={active}
                  // 文字の左端を見出し・区切り線の左端（シートの余白 16）にそろえる（4 だけ右にずれていた・2026-10-04）。
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 48, padding: 0, background: 'none', border: 'none', borderBottom: i < arr.length - 1 ? '1px solid var(--separator)' : 'none', fontSize: 'var(--text-body)', fontFamily: 'inherit', cursor: 'pointer', color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 600 : 400 }}
                >
                  {label}
                  {active && <IcCheck size={18} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}

      {addBookModalOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AddBookModal
            onClose={() => { setAddBookModalOpen(false); setOcrIntentAt(null); }}
            onSelect={pickBookFromAdd}
            onManual={openManualFromAdd}
            initialQuery={addFromSearchQuery || ''}
            existingBooks={books}
            forPhoto={ocrIntentActive}
            onOpenExisting={(existing, query) => {
              setAddBookModalOpen(false);
              // 詳細の ‹ 検索・「戻る」で、さっきの言葉の検索結果へ戻れるように覚えておく。
              if (typeof query === 'string') setAddFromSearchQuery(query);
              openDetail(existing);
              setDetailFromSearchId(existing.id);
              // 📷 本のページを撮る（初回ガイド）で本棚にある本を選んだら、そのままメモのシート（写真の形）を開く。
              if (ocrIntentActive && (existing.status === 'reading' || existing.status === 'done')) setQuickMemoOpen(true);
            }}
          />
        </Suspense>
      )}

      {helpModalOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <HelpModal
            helpKey={getCurrentHelpKey()}
            onClose={() => setHelpModalOpen(false)}
            onShowOnboarding={() => {
              setHelpModalOpen(false);
              clearOnboardingCompletion();
              setShowOnboarding(true);
            }}
          />
        </Suspense>
      )}

      {/* 🙇 Easter egg: long-press the bookshelf logo. 季節演出 / マイル
          ストーン演出は「鬱陶しい」フィードバックにより撤去済み。 */}
      {thanksOpen && <AuthorThankYou onClose={() => setThanksOpen(false)} />}

      <UpdateBanner safe={safeForUpdate && !whatsNew.open} />

      {whatsNew.open && (
        <Suspense fallback={null}>
          <WhatsNewSheet releases={whatsNew.releases} onClose={whatsNew.close} />
        </Suspense>
      )}

      <BottomNav tab={navTab} setTab={(t) => { navigateTab(t); if (view !== "list") goList(); }} hidden={keyboardOpen} />
    </Shell>
  );
}

function hashHasAuthParams() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hash || '';
  return h.includes('error=') || h.includes('access_token=');
}

function AppShell() {
  const { user, loading, authTimedOut } = useAuth();
  const toast = useToast();

  // 🔄 PWA 自動更新の初期化。新版検出時は window event を dispatch するだけ。
  // 実際の通知 UI (UpdateBanner) は「本棚 / モーダル無し / 入力フォーカス無し」の
  // 安全状態でだけ表示される。toast でいきなり出るとメモ書き / AI 会話の最中に
  // 視界を奪われるため、敢えて受動的な仕掛けに分離。
  useEffect(() => {
    // ネイティブ(Capacitor/App Store)ではアプリ更新は App Store 経由で行われ、
    // Service Worker は不要（ローカルバンドルへの介在・controllerchange リロード・
    // 「新版があります」バナーはむしろ有害）。Web のみで SW を登録する。
    if (isNative) return;
    initServiceWorker({
      // 自動更新: 起動直後に待機版があれば即適用、利用中の検出は次に
      // バックグラウンドへ入った時に静かに適用（タップ不要）。バナーは
      // 「今すぐ更新」したい人向けの保険として従来どおり安全状態でだけ出る。
      autoApply: true,
      onUpdateAvailable: () => {
        try { window.dispatchEvent(new Event('app-update-available')); } catch { /* ignore */ }
      },
    });
  }, []);

  // ログインの画面・紹介ページ・読み込みの失敗を出すときも、Web の飾りのスプラッシュをすぐ消す。
  useEffect(() => { if (!loading && !user) markAppReady(); }, [loading, user]);

  if (loading) {
    return (
      <Shell>
        <HomeLoadingSkeleton />
      </Shell>
    );
  }
  // 🔴 認証確認がタイムアウトした（10秒応答無し）。無限ローディングで
  // 固まるより、状況を伝えて再読み込みを促す（useAuth.js 参照）。
  if (authTimedOut && !user) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6) var(--space-4)' }}>
          {/* ErrorMessage はアイコンを付けない（面と題・説明だけ・DESIGN §5）。 */}
          <ErrorMessage
            title="読み込みに時間がかかっています"
            description="通信状況をご確認のうえ、もう一度お試しください。"
            actions={[
              { label: '再読み込み', onClick: () => window.location.reload(), variant: 'primary' },
            ]}
          />
        </div>
      </Shell>
    );
  }
  if (!user) {
    // 未認証で "/" に来た初見訪問者には、裸のログイン画面でなく LP（価値訴求）を
    // 見せる（転換ファネルの最大の漏れ＝LP バイパスの修復）。
    if (shouldShowMarketingLanding()) {
      return <Suspense fallback={<Spinner />}><Landing /></Suspense>;
    }
    return (
      <Shell>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <AuthScreen />
        </div>
      </Shell>
    );
  }
  return <PaywallGate />;
}

// 未認証 "/" 訪問者に LP を見せるか判定する。これまで LP は /lp にしか無く、
// ドメイン直打ち・SNS・口コミ・PWA 再起動で "/" に来た新規はログイン画面へ直行し、
// LP の転換努力が丸ごとバイパスされていた（1万人調査の最大の漏れ）。
// AuthScreen を見せる（LP をスキップする）条件:
//   - ?auth= を明示（LP の CTA / ログインリンク経由＝もう登録/ログインする気）
//   - PWA standalone（インストール済＝マーケ不要・毎回 LP は煩わしい）
//   - 'orime-returning' フラグ済（一度 auth 画面に来た既知ユーザー）
// ⚡ ログインの記録も無い「はじめての人」は、ここまで来る前に main.jsx が LP だけを読んで出す
//   （lib/staticRoute.js の landingAtRoot・アプリ本体とスプラッシュを待たない・2026-10-05）。ここは、
//   ログインの記録はあるが切れていた人など、その判定が迷って false にした人のための残りの道。
function shouldShowMarketingLanding() {
  if (typeof window === 'undefined') return false;
  // ネイティブ(App Store アプリ)内では LP は不要（既にアプリを入手済み。LP は
  // ブラウザ訪問者を App Store へ送る集客導線であり、アプリ内で見せると
  // 「App Store で入手」CTA が自己言及的で無意味になる）。直接 AuthScreen へ。
  if (isNative) return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('auth')) return false;
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    if (standalone) return false;
    if (window.localStorage.getItem('orime-returning') === 'true') return false;
    return true;
  } catch {
    return false; // 不明時は従来挙動（AuthScreen）へ安全側に倒す
  }
}

// 💳 PaywallGate — 契約の状態を確かめて、アプリを開く（フリーミアム・2026-09-27）。
//
// 認証済みユーザーに対して useSubscription で entitlement を確認し、
//   - loading 中 → ホームの形のスケルトン（判定が固まるまで）
//   - それ以外   → 通常アプリ（AuthedApp）。契約が無くても開く（無料プラン）
// 有料プランの画面（Paywall）は、無料のトークンを使い切ったとき・プランの AI 機能を押したとき・
// 設定の「プランを見る」のときだけ、アプリの上に重ねて開く（いつでも閉じられる）。
// プランと残りのトークンは PaywallContext で配る（state/PaywallContext.jsx）。
//
// ★ fail-open:
//   useSubscription は subscriptions テーブル未適用（schema-error）を
//   「未課金扱い（isActive=false）」ではなく schema-error として握りつぶす実装。
//   テーブル未適用 = 判定不能のときはサーバーも AI を通すので、ここでも有料扱いにする
//   （lib/errors.js の isSchemaError = マイグレーション未適用判定の唯一の真実）。
function isSchemaUnappliedError(error) {
  return isSchemaError(error);
}

// 📩 AuthCallback が立てる「メール確認完了」フラグの一回きり読み取り。
// モジュール変数にキャッシュするのは、useSubscription の refresh 等でゲートが
// unmount→remount しても同一ページロード中は ✅ バナーを出し続けるため。
// sessionStorage からは初回読み取り時に消す（次のフルリロードでは出さない）。
let _emailConfirmedCache = null;
function readEmailConfirmedFlag() {
  if (_emailConfirmedCache === null) {
    try {
      _emailConfirmedCache = window.sessionStorage.getItem('orime-email-confirmed') === 'true';
      if (_emailConfirmedCache) window.sessionStorage.removeItem('orime-email-confirmed');
    } catch {
      _emailConfirmedCache = false;
    }
  }
  return _emailConfirmedCache;
}

// 📱 Web 利用者（非管理者）向けの「アプリでご利用ください」ゲート。
// App-only 配信方針（①C: Web は管理者のみ）に基づき、ブラウザでログインした
// 一般ユーザーを App Store へ誘導する。サインアウトで別アカウントへ切替も可能。
function WebAppOnlyGate() {
  const { signOut, user } = useAuth();
  const toast = useToast();
  // アプリが公開前でも、自分のメモを持ち出せるように（「データは残る」の約束）。
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportMemosAsMarkdown } = await import('./lib/exportData');
      const { memos } = await exportMemosAsMarkdown(user?.id);
      toast.success(`メモ ${memos} 件を書き出しました。`);
    } catch (e) {
      toast.error(toMessage(e, 'メモを書き出せませんでした。'));
    } finally {
      setExporting(false);
    }
  };
  // 📩 AuthCallback がメール確認リンク（type=signup）経由の着地時に立てる一回きり
  // のフラグ。アプリで登録 → 確認メールのリンクが Safari で開く → ここに着地、
  // という遷移で「確認は済んだのに何も起きない」と迷子になるのを防ぐ。
  const emailJustConfirmed = readEmailConfirmedFlag();
  // アプリを使えない Web の利用者も、ここからアカウントを削除できるように（有料プランの画面と同じく
  // 設定の削除欄をそのまま開く・App Store 審査 5.1.1(v)／データの削除請求）。
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <main
      aria-labelledby="webgate-title"
      style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center',
        padding: 'calc(var(--space-12) + env(safe-area-inset-top, 0px)) var(--space-4) calc(var(--space-12) + env(safe-area-inset-bottom, 0px))',
        background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '24em', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Smartphone size={48} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--text-2)' }} />
        {emailJustConfirmed && (
          <p
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)',
              lineHeight: 1.5, margin: 'var(--space-6) 0 0',
            }}
          >
            <CheckCircle2 size={20} aria-hidden="true" />
            メールアドレスの確認が完了しました
          </p>
        )}
        <h1
          id="webgate-title"
          style={{
            fontSize: 'var(--text-title)', fontWeight: 700, lineHeight: 1.3, textWrap: 'balance',
            margin: emailJustConfirmed ? 'var(--space-2) 0 0' : 'var(--space-6) 0 0',
          }}
        >
          {/* 「ログインしてくだ／さい」と語の途中で折れないよう、意味の切れ目で改行する。 */}
          {emailJustConfirmed ? <>アプリに戻って<br />ログインしてください</> : 'アプリでご利用ください'}
        </h1>
        <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 'var(--space-3) 0 0' }}>
          アプリに同じアカウントでログインすると、<br />メモもそのまま使えます。
        </p>
        {isAppStoreLive ? (
          <a
            href={storeLinkFor('web_gate')}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnPrimary, boxSizing: 'border-box', textDecoration: 'none', marginTop: 'var(--space-8)' }}
          >
            App Store で入手
          </a>
        ) : (
          // 公開前は、公開後と同じ場所・形の押せない主ボタン（LP・有料プランの画面と同じ・薄くしない）。
          <button type="button" disabled style={{ ...btnPrimaryOff, marginTop: 'var(--space-8)' }}>
            App Store で近日公開
          </button>
        )}
        {/* 幅は主ボタンとそろえる（削除の上の区切り線が主ボタンより短く見えないように）。 */}
        <div style={{ marginTop: 'var(--space-8)', width: '100%' }}>
          {user?.email && (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, margin: 0, wordBreak: 'break-all' }}>
              {user.email} でログイン中
            </p>
          )}
          {/* 脇役の操作は文字ボタン（DESIGN §5: 栗色・15/600・高さ 44）。 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              style={{ ...btnLink, opacity: 1 }}
            >
              {exporting ? '書き出し中…' : 'メモをダウンロード'}
            </button>
            <button
              type="button"
              onClick={async () => {
                try { await signOut(); } catch (e) { toast.error(toMessage(e, 'ログアウトできませんでした。もう一度お試しください。')); }
              }}
              style={btnLink}
            >
              別のアカウントでログイン
            </button>
          </div>
          {/* 削除は取り消せない操作なので、ほかの文字ボタンと行を分け、エラー色で示す（有料プランの画面と同じ形）。 */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--separator)' }}>
            <button type="button" onClick={() => setSettingsOpen(true)} style={{ ...btnLink, color: 'var(--error)' }}>
              アカウントを削除
            </button>
          </div>
        </div>
      </div>
      {settingsOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AccountSettings onClose={() => setSettingsOpen(false)} onAfterDelete={() => setSettingsOpen(false)} focusDelete />
        </Suspense>
      )}
    </main>
  );
}

function PaywallGate() {
  const { isActive, loading, error, refresh, subscription } = useSubscription();
  const { user } = useAuth();

  // 🛰️ 管理者（運営）は課金なしで AI をすべて使える（トークンも数えない）。is_app_admin RPC で判定
  //    （未適用 DB や非管理者は false のまま＝通常の判定）。
  const [adminBypass, setAdminBypass] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    // is_app_admin はゲート全体（読み込み表示）を止めるので、決して返らない通信で
    // アプリが永久に固まらないよう 8 秒でタイムアウトして先へ進む（adminBypass は
    // false のまま＝通常の判定/Web ゲート判定に倒れる＝安全側）。
    const timeout = setTimeout(() => { if (alive) setAdminChecked(true); }, 8000);
    (async () => {
      try {
        const { data, error: e } = await supabaseClient.rpc('is_app_admin');
        if (alive && !e && data === true) setAdminBypass(true);
      } catch { /* 未適用 DB 等は false のまま */ }
      finally { if (alive) { clearTimeout(timeout); setAdminChecked(true); } }
    })();
    return () => { alive = false; clearTimeout(timeout); };
  }, []);

  // 🎁 プラン（フリーミアム・2026-09-27）: 'admin' | 'paid' | 'trial' | 'free'。
  //    契約が無くてもアプリはすべて使える（無料＝相談だけ AI・毎月のトークン）。subscriptions 表が
  //    未適用（判定不能）のときはサーバーも通す（fail-open）ので、こちらも有料扱いにする。
  const periodType = subscription?.periodType || null;
  const plan = adminBypass
    ? 'admin'
    : (isActive || isSchemaUnappliedError(error))
      // 'intro' は有料の初回価格（創業メンバー価格）＝有料。無料期間は 'trial' だけ（2026-10-02）。
      ? (periodType === 'trial' ? 'trial' : 'paid')
      : 'free';
  const trialEndsAt = plan === 'trial' ? (subscription?.currentPeriodEnd || null) : null;

  // 🪙 残りのトークン（src/lib/tokens.js・表示だけ。止めるのはサーバー）。
  const [usedMjpy, setUsedMjpy] = useState(null); // null=未確認・読めない
  const tokenKey = plan === 'admin' ? null : periodKeyFor(plan, { periodEnd: trialEndsAt });
  // 🪙➕ 追加トークン（買い足し・期限内の合計といちばん近い期限）。表が無ければ null＝出さない。
  const [lots, setLots] = useState(null);
  const lotsRef = useRef(null);
  // 戻り値: 追加分が前より増えたか（買ったあとの取り直しに使う）。
  // 📷 無料プランの写真から書き起こし（月 FREE_OCR_PER_MONTH 回・相談のトークンとは別・lib/freeOcr.js）。
  //    今月使った回数（'freeocr-YYYY-MM' 行の calls）。null＝未確認・読めない・無料プランでない。
  const [freeOcrUsed, setFreeOcrUsed] = useState(null);
  const isFreePlan = plan === 'free';
  const refreshTokens = useCallback(async () => {
    if (!user?.id || !tokenKey) { setUsedMjpy(null); setLots(null); lotsRef.current = null; setFreeOcrUsed(null); return false; }
    const [used, lot, ocrUsed] = await Promise.all([
      fetchUsedMjpy(user.id, tokenKey),
      fetchLotBalance(user.id),
      isFreePlan ? fetchFreeOcrUsed(user.id, freeOcrPeriodKey()) : Promise.resolve(null),
    ]);
    const grew = (lot?.balance || 0) > (lotsRef.current?.balance || 0);
    lotsRef.current = lot;
    setUsedMjpy(used);
    setLots(lot);
    setFreeOcrUsed(ocrUsed);
    return grew;
  }, [user?.id, tokenKey, isFreePlan]);
  useEffect(() => {
    if (loading || !adminChecked) return;
    refreshTokens();
  }, [loading, adminChecked, refreshTokens]);
  // どの機能で AI を使っても（相談・写真の書き起こし・AI 選書…）残りを取り直す。
  useEffect(() => {
    const onUsed = () => { refreshTokens(); };
    window.addEventListener(AI_USED_EVENT, onUsed);
    return () => window.removeEventListener(AI_USED_EVENT, onUsed);
  }, [refreshTokens]);
  // 🌱 無料プランのはじめの月（アカウントを作った日本時間の月）は 60（表示だけ・決めるのはサーバーの auth の created_at）。
  const userCreatedAt = user?.created_at || null;
  const tokenAllowance = allowanceForPlan(plan, { createdAt: userCreatedAt, now: appNow().getTime() });
  const freeFirstMonth = plan === 'free' && isFreeFirstMonth(userCreatedAt, appNow().getTime());
  // 来月 1 日に戻る量（はじめの月の人も来月は毎月の量）。
  const tokenNextAllowance = nextMonthAllowanceFor(plan);
  const tokensRemaining = usedMjpy == null || tokenAllowance == null ? null : remainingTokens(tokenAllowance, usedMjpy);
  const purchasedTokens = plan === 'admin' ? 0 : (lots?.balance || 0);
  const freeMode = plan === 'free';
  // 買い足せるのはプランの人（有料・7 日間無料）だけ。
  const canBuyTokens = plan === 'paid' || plan === 'trial';
  const [tokenSheetOpen, setTokenSheetOpen] = useState(false);
  // どこから開いたか（'settings' なら、閉じたとき・「戻る」で設定に戻す）。
  const tokenSheetFromRef = useRef(null);
  const closeTokenSheet = useCallback(() => {
    setTokenSheetOpen(false);
    const from = tokenSheetFromRef.current;
    tokenSheetFromRef.current = null;
    if (from === 'settings') window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
  }, []);

  // アプリの上に重ねて開く有料プランの画面（{ reason, feature }）。いつでも × / 「あとで」で閉じられる。
  //   reason: 'free_used'（今月の無料のトークンを使い切った）/ 'free_ocr_used'（今月の無料の写真から書き起こしを
  //           使い切った）/ 'feature'（プランで使える機能）/
  //           'grown'（メモが 10 件たまった＝相談の「相談相手が育ってきました」）/
  //           'first_answer'（はじめての相談の答えのあとの 1 行＝lib/firstAnswerTrial.js）/ null（プランを見る）
  const [paywall, setPaywall] = useState(null);
  useEffect(() => {
    // reason: null は「プランを見る」（見出しは一般の価値）。指定が無いときは機能の案内。
    const onReq = (e) => {
      const d = e?.detail || {};
      setPaywall({ reason: 'reason' in d ? d.reason : 'feature', feature: d.feature || '' });
    };
    window.addEventListener(PAYWALL_EVENT, onReq);
    return () => window.removeEventListener(PAYWALL_EVENT, onReq);
  }, []);
  // 契約できたら閉じる（無料期間を含む）
  useEffect(() => { if (isActive) setPaywall(null); }, [isActive]);
  // ブラウザ / Android の「戻る」は、重ねて開いた有料プランの画面・トークンの追加から閉じる（アプリを離れない）。
  useBackLayer(!!paywall && !isActive, () => setPaywall(null));
  useBackLayer(tokenSheetOpen && canBuyTokens, closeTokenSheet, { overBlock: true });
  const paywallCtx = useMemo(() => {
    const openPaywall = (reason = null, feature = '') => setPaywall({ reason, feature });
    return {
      plan,
      freeMode,
      trialEndsAt,
      tokenAllowance,
      // 🌱 無料プランのはじめの月か・来月 1 日に戻る量（「11月1日に 30 トークンに戻ります」）。
      freeFirstMonth,
      tokenNextAllowance,
      tokensRemaining,
      // 追加トークン（買い足し）の残りと、いちばん近い期限。使えるのは その月の分＋追加分。
      purchasedTokens,
      purchasedExpiresAt: lots?.nextExpiry || null,
      tokensAvailable: tokensRemaining == null ? null : tokensRemaining + purchasedTokens,
      canBuyTokens,
      // 前にプランを契約していた（いまは無料プラン）。無料期間はもう使えないので、すすめる文を変える（lib/trialNudge.js）。
      hadPlan: freeMode && !!subscription?.status && subscription.status !== 'active',
      // opts.from === 'settings': 設定から開いた（閉じたら設定に戻す）。onClick にそのまま渡されたときの event は無視する。
      openTokenSheet: (opts) => {
        if (!canBuyTokens) return;
        tokenSheetFromRef.current = opts && opts.from === 'settings' ? 'settings' : null;
        setTokenSheetOpen(true);
      },
      refreshTokens,
      // 契約の状態を読み直す（設定の「コードを使う」のあと・オファーコードで始まったプランをすぐ効かせる）。
      refreshPlan: () => { refresh?.(); refreshTokens?.(); },
      // 旧名（お試しの頃の呼び方）。無料プランの残りのトークン。
      freeRemaining: freeMode ? tokensRemaining : null,
      refreshFree: refreshTokens,
      openPaywall,
      // 📷 無料プランの写真から書き起こし（月 FREE_OCR_PER_MONTH 回）。残りは無料プランのときだけ（それ以外・不明は null）。
      freeOcrLimit: FREE_OCR_PER_MONTH,
      freeOcrRemaining: freeMode ? freeOcrRemaining(FREE_OCR_PER_MONTH, freeOcrUsed) : null,
      // プランで使える AI 機能の入口で呼ぶ。無料プランなら有料プランの画面を開いて false。
      requirePlan: (feature = '') => {
        if (!freeMode) return true;
        openPaywall('feature', feature);
        return false;
      },
    };
  }, [plan, freeMode, trialEndsAt, tokenAllowance, freeFirstMonth, tokenNextAllowance, tokensRemaining, purchasedTokens, lots?.nextExpiry, canBuyTokens, refreshTokens, refresh, subscription?.status, freeOcrUsed]);

  // Checkout 復帰処理: ?checkout=success なら webhook 反映ラグを吸収するため
  // refresh を数秒間隔で数回リトライ。?checkout=cancel は静かに URL を掃除。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let sp;
    try { sp = new URLSearchParams(window.location.search); } catch { return undefined; }
    const checkout = sp.get('checkout');
    if (checkout !== 'success' && checkout !== 'cancel') return undefined;

    // クエリは消しておく（リロードで再発火しないように）。
    try {
      sp.delete('checkout');
      const qs = sp.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
      window.history.replaceState(null, '', next);
    } catch { /* ignore */ }

    if (checkout === 'cancel') return undefined;

    // 📊 課金転換（成果＝有料課金者）の計測。Stripe success_url(?checkout=success)
    // 復帰時に 1 回だけ計上する。クエリは上で消すのでリロードで再発火しない。
    // PII なし・イベント単独。北極星「有料課金者数」のファネル終端。
    track('checkout_completed');

    // success: webhook で subscriptions が active になるまで数回ポーリング。
    let cancelled = false;
    const delays = [0, 1500, 3000, 5000, 8000];
    const timers = delays.map((ms) =>
      setTimeout(() => { if (!cancelled) refresh?.(); }, ms),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [refresh]);

  // 判定が確定するまで（課金 or 管理者）は読み込み表示（ホームの形のスケルトン）。
  if (loading || !adminChecked) {
    return (
      <Shell>
        <HomeLoadingSkeleton />
      </Shell>
    );
  }

  // ①C: Web(ブラウザ)は管理者のみ利用可。Orime は App Store の iOS アプリでのみ
  //    提供する方針のため、管理者でないブラウザ利用者は（課金の有無・スキーマ状態に
  //    関わらず）アプリへ誘導する。管理者(adminBypass)は検証のためブラウザ利用を許可。
  //    ネイティブ(isNative)は当然すべて通常フロー。
  //    お試しモード（開発専用・isDemo）はブラウザでアプリ本体を確認するための
  //    ものなので素通しする（本番ビルドでは isDemo は常に false）。
  if (!isNative && !adminBypass && (!isDemo || demoScenario === 'webgate')) {
    return (
      <Shell>
        <WebAppOnlyGate />
      </Shell>
    );
  }

  // 契約の有無にかかわらず、アプリはいつも開く（起動時の有料プランの画面は無い）。
  // 契約した瞬間に AuthedApp を作り直さないよう、どの場合も同じ形（Provider > AuthedApp）で返す。
  return (
    <PaywallContext.Provider value={paywallCtx}>
      <AuthedApp />
      {/* 🤝 AI に送る前の同意のシート（はじめて AI を使う操作のとき・lib/aiConsent.js）。 */}
      <AiConsentGate />
      {paywall && !isActive && (
        // アプリの上に重ねる（閉じればアプリに戻る＝書きかけも消えない）。
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          <Suspense fallback={<Spinner />}>
            <Paywall
              onPurchased={refresh}
              reason={paywall.reason}
              feature={paywall.feature}
              onClose={() => setPaywall(null)}
            />
          </Suspense>
        </div>
      )}
      {tokenSheetOpen && canBuyTokens && (
        <Suspense fallback={<OverlayFallback />}>
          <TokenSheet plan={plan} onClose={closeTokenSheet} onPurchased={refreshTokens} />
        </Suspense>
      )}
    </PaywallContext.Provider>
  );
}

// LP ルート判定 — /lp パスもしくは ?view=lp クエリで Landing を表示する。
// SPA 内で別ルートを切るため React Router を持ち込まず、最低限の URL 監視
// だけで対応 (popstate 反応も拾う)。LP は認証も SW 更新監視もスキップ。
// LP / 法的ページのルート判定。返り値は 'lp' | 'terms' | 'privacy' | 'sct' | null。
// React Router を持ち込まずに pathname/query だけで切替。popstate 追従も拾う。
// 旧 /lp/terms · /lp/privacy · /lp/contact は新 /legal/* へのバックワード
// コンパチとして同じページを返す (/lp/contact は SCT ページに統合した)。
function useLpRoute() {
  const compute = () => {
    if (typeof window === 'undefined') return null;
    // trailing slash を除去 (ルート '/' だけは残す)
    const raw = window.location.pathname;
    const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
    if (path === '/legal/terms' || path === '/lp/terms') return 'terms';
    if (path === '/legal/privacy' || path === '/lp/privacy') return 'privacy';
    if (path === '/legal/sct' || path === '/lp/contact') return 'sct';
    if (path === '/lp' || path.startsWith('/lp/')) return 'lp';
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('view') === 'lp') return 'lp';
    } catch { /* ignore */ }
    return null;
  };
  const [route, setRoute] = useState(compute);
  useEffect(() => {
    const onPop = () => setRoute(compute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

export default function App() {
  const [authCallbackActive, setAuthCallbackActive] = useState(hashHasAuthParams);
  // 飾りのスプラッシュは Web だけ（iOS アプリは端末の起動画面が同じ役目・2026-09-30）。
  const [showSplash, setShowSplash] = useState(!isNative);
  const exitAuthCallback = useCallback(() => setAuthCallbackActive(false), []);
  const lpRoute = useLpRoute();

  // LP / 法的ページは静的ページ扱い: スプラッシュも認証も介さず即返す。
  // 各ページは lazy 化済みなので Suspense で包む (フォールバックは軽量 Spinner)。
  if (lpRoute === 'terms') return <Suspense fallback={<Spinner />}><TermsPage /></Suspense>;
  if (lpRoute === 'privacy') return <Suspense fallback={<Spinner />}><PrivacyPage /></Suspense>;
  if (lpRoute === 'sct') return <Suspense fallback={<Spinner />}><SctPage /></Suspense>;
  if (lpRoute === 'lp') return <Suspense fallback={<Spinner />}><Landing /></Suspense>;

  return (
    <>
      {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} />}
      {authCallbackActive ? <AuthCallback onDone={exitAuthCallback} /> : <AppShell />}
    </>
  );
}

/* ========== Styles ==========
 * Shared inline-style objects. Phase 1 of the design-system rollout:
 * literals replaced with tokens from styles/tokens.css. The shape is kept
 * identical so every consumer site picks up the new values for free.
 */
// `--color-surface` (legacy alias) は dark mode でも light のまま。新しい
// `--color-bg-secondary` を使うと部分的に dark mode が走った時に
// 入力欄だけ黒くなる問題が起きるため、常に light な surface を使う。
const lnk = { background: "none", border: "none", color: "var(--color-tertiary)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "11px 8px", margin: "-11px -8px", minHeight: 44, display: "inline-flex", alignItems: "center" };
// 主ボタンは ui.js（単一の真実）を継承。幅とパディングは従来の挙動を保つ。
const navBtn = { padding: "10px 24px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-separator)", background: "transparent", color: "var(--color-secondary)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
const tagBtn = { fontSize: 10, padding: "3px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-separator)", background: "transparent", color: "var(--color-tertiary)", cursor: "pointer", fontFamily: "inherit" };
const tagBtnActive = { border: "1.5px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" };
