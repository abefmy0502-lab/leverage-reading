import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from "react";
import { useAuth } from './hooks/useAuth';
import { useBooks } from './hooks/useBooks';
import { sanitizeForPrompt, invalidateKnowledgeCache } from './lib/ai';
import { markActivation } from './lib/activation';
import { useAppDataCache } from './state/AppDataCache';
import { streamClaude } from './lib/streamClaude';
import { PROMPTS } from './lib/prompts';
import MarkdownSections from './components/MarkdownSections';
import AuthScreen from './components/auth/AuthScreen';
import AuthCallback from './components/auth/AuthCallback';
import BookMemoList from './components/BookMemoList';
import BookSearchModal from './components/BookSearchModal';
import { BookCoverCard, SwipeableBookCard, MiniCover, StatusLabel } from './components/BookCards';
import { STATUSES, getSt } from './lib/status';
import { isStrictMatch } from './lib/bookMatch';
const BookAdvisor = lazy(() => import('./components/BookAdvisor'));
import BookMemoEditor from './components/BookMemoEditor';
const QuickMemoSheet = lazy(() => import('./components/QuickMemoSheet'));
const PastBooksQuickstart = lazy(() => import('./components/PastBooksQuickstart'));
const ImportSheet = lazy(() => import('./components/ImportSheet'));
const HomeQuickMemo = lazy(() => import('./components/HomeQuickMemo'));
import Onboarding, { isOnboardingCompleted, clearOnboardingCompletion } from './components/Onboarding';
import {
  Search as IcSearch, Plus as IcPlus, Library as IcLibrary, Sparkles as IcSparkles,
  SearchX as IcSearchX, Brain as IcBrain,
  LayoutGrid as IcGrid, List as IcList,
  Lightbulb as IcBulb,
  BookOpen as IcBook, Map as IcMap, RefreshCw as IcRefresh, WifiOff as IcWifiOff, Bot as IcBot,
  CheckCircle2 as IcCheck,
  SlidersHorizontal as IcFilter, ArrowUpDown as IcSort, Star as IcStar, Folder as IcFolder, X as IcX,
} from 'lucide-react';


// 本棚ツールバー（シート化）用の共通スタイル。
const SHELF_CHIP_ORDER = ['reading', 'done', 'before', 'want'];
const SORT_LABELS = { updated: '更新順', created: '登録順', title: 'タイトル順', rating: '評価順' };
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
const ThemeReport = lazy(() => import('./components/ThemeReport'));
import { useAdvisorSessions } from './hooks/useAdvisorSessions';
import ActionList from './components/ActionList';
const ActionEditModal = lazy(() => import('./components/ActionEditModal'));
// 📊 記録サブタブ（読了/メモ/行動の累計・月別推移・成果/定着のつながり・タグ分布）。
// 開いた時だけロードする。
const ReadingRecord = lazy(() => import('./components/ReadingRecord'));
import BottomSheet from './components/BottomSheet';
const AddBookModal = lazy(() => import('./components/AddBookModal'));
import { useBookCover } from './hooks/useBookCover';
import {
  searchBooksFlat as searchBooksAPIFlat,
  findIsbnCandidates,
  findCoverFromGoogleBooks,
} from './lib/bookSearch';
import { getCoverCandidates, resolveCoverFromCandidates, fullyResolveCover, tryCoverForIsbn, checkImageExists, resolveCoverViaServer } from './lib/bookCover';
import { backfillCovers } from './lib/backfillCovers';
import { enqueueCoverRetry } from './lib/coverAutoRetry';
import { MODEL_SMART } from './lib/models';
import { findDuplicateBook, STATUS_LABEL, isUniqueViolation } from './lib/checkDuplicate';
import { saveStrategyHistory, popStrategyHistory, hasStrategyHistory, clearStrategyHistory } from './lib/strategyHistory';
const CoverFixModal = lazy(() => import('./components/CoverFixModal'));
// 📤 一文をシェア（この本の一文を 1 枚の画像に・SPEC §2-1）
const ShareSheet = lazy(() => import('./components/ShareSheet'));
const Landing = lazy(() => import('./pages/Landing'));
const TermsPage = lazy(() => import('./legal/TermsPage'));
const PrivacyPage = lazy(() => import('./legal/PrivacyPage'));
const SctPage = lazy(() => import('./legal/SctPage'));
import { supabase as supabaseClient, isDemo, demoScenario } from './lib/supabase';
import { track } from './lib/analytics';
const AccountSettings = lazy(() => import('./components/AccountSettings'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
import SplashScreen from './components/SplashScreen';
import Spinner from './components/Spinner';
import EmptyState from './components/EmptyState';
import ErrorMessage from './components/ErrorMessage';
import { useFocusTrap } from './hooks/useFocusTrap';
import HomeScreen from './components/HomeScreen';
import AuthorThankYou from './components/AuthorThankYou';
import { initServiceWorker } from './lib/swUpdate';
import { ensurePushSubscription } from './lib/push';
import { isNative } from './lib/iap';
import { APP_STORE_URL, isAppStoreLive } from './lib/appStore';
import { initNativePushNav } from './lib/nativePush';
import UpdateBanner from './components/UpdateBanner';
import { SkeletonBlock, BookListSkeleton, BookGridSkeleton } from './components/Skeleton';
import SwipeableCard from './components/SwipeableCard';
import ContextMenu from './components/ContextMenu';
import PullToRefresh from './components/PullToRefresh';
import { useHaptic } from './hooks/useHaptic';
import { useLongPress } from './hooks/useLongPress';
import { useEdgeSwipeBack, isBackBlocked } from './hooks/useEdgeSwipeBack';
import { useHistoryBack } from './hooks/useHistoryBack';
import { useKeyboardOpen } from './hooks/useKeyboardOpen';
import { useSubscription } from './hooks/useSubscription';
const Paywall = lazy(() => import('./components/Paywall'));
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmDialog';
import { toMessage, fieldRequiredMessage, isSchemaError } from './lib/errors';
import { LIMITS, clamp } from './lib/limits';
import { ensureHttps } from './lib/url';
import { PAYWALL_EVENT, AI_USED_EVENT } from './lib/freeTrial';
import { periodKeyFor, fetchUsedMjpy, remainingTokens, allowanceFor as allowanceForPlan } from './lib/tokens';
import { PaywallContext, usePaywall } from './state/PaywallContext';
import { todayLocal, fmtDateJa, isScheduledLater } from './lib/dates';
// 🧩 #9 App.jsx 分割: 本フォーム共通プリミティブと Phase エディタは別ファイルへ抽出。
import { Stars, inp, btnS } from './components/formPrimitives';
import { btnGhost, btnText, btnPrimary, btnPrimaryOff, btnLink, groupTitle } from './styles/ui';
import { WantPhase, BeforePhase, ReadingPhase, DonePhase, EditSaveBar, saveLabelFor } from './components/BookPhases';
import { getAmazonLink } from './lib/amazonLink';
import BookStoreLinks from './components/BookStoreLinks';
import { getRakutenLink } from './lib/rakutenLink';
import { loadNavState, saveNavState } from './lib/navState';
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
  Trash2,
  RotateCcw,
  Brain,
  HelpCircle,
  Settings as SettingsIcon,
  Target,
  MessageCircle,
  Smartphone,
  Tag as IcTag,
} from 'lucide-react';
import { useBookMemos } from './hooks/useBookMemos';



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



// 起動直後（ログイン確認・課金の確認待ち）の読み込み表示。ホームの形（相談カード・見出し・
// いま読んでいる本 2 冊・すべての本の行）のスケルトン（DESIGN §5「読み込みは Skeleton」）。
// グループの間は 24、いま読んでいる本（見出し＋2 冊）の中は一覧と同じ 12（DESIGN §1）。
function HomeLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="読み込み中"
      style={{ flex: 1, padding: 'var(--space-2) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
    >
      <SkeletonBlock height={400} radius="var(--radius)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SkeletonBlock width="40%" height={26} radius="var(--radius)" />
        <SkeletonBlock height={90} radius="var(--radius)" />
        <SkeletonBlock height={90} radius="var(--radius)" />
      </div>
      <SkeletonBlock height={56} radius="var(--radius)" />
    </div>
  );
}

// 長文（目的・課題・仮説 等）は 4 行で畳み「すべて表示」で開く。
// 旧: maxHeight 400 + 内部スクロールで、詳細のファーストビューを長文が
// 独占し、ページ内スクロールと入れ子スクロールが競合していた。
function Card({ label, text, style }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (text || '').length > 130;
  return (
    // DESIGN §5 のカード（--surface＋枠 --separator＋角丸 12＋内側 16・影なし）。
    <div style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', marginTop: 'var(--space-2)', ...style }}>
      <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-1)' }}>{label}</p>
      <p
        style={{
          fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0,
          ...(isLong && !expanded
            ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
            : {}),
        }}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          style={{ background: 'none', border: 'none', padding: 0, minHeight: 44, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? '閉じる' : 'すべて表示'}
        </button>
      )}
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
  return (
    <nav
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
            <span style={{ fontSize: "var(--text-caption)", letterSpacing: "0.02em", fontWeight: active ? 600 : 400 }}>{t.label}</span>
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

/* ========== MAIN APP ========== */
function AuthedApp() {
  const { signOut, user } = useAuth();
  const appCache = useAppDataCache();
  // 仮想キーボード表示中は BottomNav を消し、入力欄に重ならないようにする。
  // viewport meta の interactive-widget=resizes-content と併用すると iOS
  // で「BottomNav が押し上げられる」現象が完全になくなる。
  const keyboardOpen = useKeyboardOpen();
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('keyboard-open', keyboardOpen);
    return () => document.body.classList.remove('keyboard-open');
  }, [keyboardOpen]);
  // 📊 起動 1 回だけ計測（fail-silent・オプトアウト/未ログインで no-op）。
  useEffect(() => { track('app_open'); }, []);
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
  const [aiSubTab, setAiSubTab] = useState(() => (
    ['advisor', 'brain', 'report'].includes(resumeNav?.aiSubTab) ? resumeNav.aiSubTab : 'brain'
  ));
  // 相談の中で押し込まれた画面（過去の相談・学びを書く・根拠にできる情報）を開いている間は、
  // サブタブの行を隠す（押し込まれた画面は「‹ 相談」の 1 行だけ・切り替えを 2 段にしない）。
  // MyBookBrain が onPushedViewChange で知らせる。相談タブ・相談サブタブを離れたら戻す。
  const [consultPushed, setConsultPushed] = useState(false);
  // 📊 記録の「実行した行動」から行動を開いたとき、完了した行動を開いて見せる（押した時刻で毎回区別）。
  const [actionShowDoneNonce, setActionShowDoneNonce] = useState(null);
  // 🏠→🧠 本棚ホームの「相談する」から渡す質問。MyBookBrain が履歴読込後に 1 回送る。
  const [askPreset, setAskPreset] = useState(null); // { question, nonce } | null
  // 📖→🧠 本詳細の「この本に相談する」: 相談相手をその本に絞ってマイ読書脳を開く。
  const [scopePreset, setScopePreset] = useState(null); // { bookIds, nonce } | null
  // 🏠 ホームタブ（tab キー 'books'）の中の画面: 'home'＝ホーム / 'library'＝すべての本（SPEC §1）。
  // お試しモードだけ ?shelf=library で「すべての本」から開ける（読み込み中・失敗の表示の確認用）。
  const [shelfMode, setShelfMode] = useState(() => (isDemo && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('shelf') === 'library' ? 'library' : 'home'));
  // 「すべての本」をどこから開いたか。'record'＝振り返りの記録（「‹ 記録」で記録へ戻す）/ null＝ホーム。
  const [libraryFrom, setLibraryFrom] = useState(null);
  // 🏠✍️ ホームの「メモ」で開くクイックメモの対象本（詳細画面に移らずホームの上に重ねる）。
  const [homeMemoBook, setHomeMemoBook] = useState(null);
  // 📚 初日クイックスタート（これまで読んだ本で相談相手をつくる）の表示。
  const [showQuickstart, setShowQuickstart] = useState(false);
  const [showImport, setShowImport] = useState(false); // 📥 ほかのアプリから取り込む
  // クイックスタートをメモ 0 件で終えたとき「メモを書く」→ 本が読み込まれたらその本を開いてメモのシートを出す。
  const [pendingMemoBookId, setPendingMemoBookId] = useState(null);

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
    // 記録から開いた「すべての本」は寄り道なので、別のタブへ移ったらホームに戻しておく。
    if (tab === 'books' && libraryFrom) { setShelfMode('home'); setLibraryFrom(null); }
    if (t === 'review') { setActionShowDoneNonce(null); setReviewSubTab('action'); }
    else if (t === 'ai') setAiSubTab('brain');
    setTab(t);
  };
  // 📊 記録の数字・タグ・著者から「すべての本」を開く（‹ 記録 で記録へ戻れるように印を付ける）。
  const openLibraryFromRecord = () => {
    navigateTab('books'); goList(); setShelfMode('library'); setLibraryFrom('record');
  };
  // 「すべての本」から戻る: 記録から来たなら 振り返り → 記録 へ、それ以外はホームへ。
  const leaveLibrary = () => {
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
  const [pendingRecallMemoId, setPendingRecallMemoId] = useState(null);
  const handleRecallDeepLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    let sp;
    try { sp = new URLSearchParams(window.location.search); } catch { return; }
    const memoId = sp.get('recall');
    if (!memoId) return;
    // 本を直接開くのは books 読込後（下の resolver）。ここでは対象を控えるだけ。
    // 解決できない場合は resolver が振り返り（💭ノート）へフォールバックする。
    setPendingRecallMemoId(memoId);
    // クエリを掃除（hash / 他クエリは温存）— リロードで再発火させない。
    try {
      sp.delete('recall');
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
  // 実行時点の最新 view を読むための ref（handleSave の長い await 後に「ユーザーが
  // まだ編集画面にいるか」を判定する用。formRef/booksRef と同じ流儀）。
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  // 相談タブ・相談サブタブ・一覧画面を離れたら、押し込まれた画面の状態を戻す（戻ったときは会話から）。
  useEffect(() => {
    if (tab !== 'ai' || aiSubTab !== 'brain' || view !== 'list') setConsultPushed(false);
  }, [tab, aiSubTab, view]);
  const [current, setCurrent] = useState(null);

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
  // Carries an initial query from AddBookModal → BookSearchModal so a search
  // typed there auto-runs without re-typing.
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [searchInitialAuthor, setSearchInitialAuthor] = useState('');
  const [searchInitialIsbn, setSearchInitialIsbn] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [recentlyDoneId, setRecentlyDoneId] = useState(null);
  const recentlyDoneTimerRef = useRef(null);
  // 本詳細のスクロール可能コンテナへの ref。フェーズ遷移 (status 変化) の
  // たびにスクロールトップへ戻すために使う — 旧実装は前フェーズの最下部
  // (例: 読書前で「読書を開始する」ボタン直前) のままだったため、新フェーズ
  // で画面が下から始まる症状があった。
  const detailScrollRef = useRef(null);
  // 本棚のスクロール位置を本詳細から戻った時に復元する（「迷子にならない」動線）。
  // listScrollRef = 本棚スクロール要素 / savedShelfScroll = 離脱直前の scrollTop /
  // prevViewRef = 直前の view（detail/edit から list に戻った時だけ復元）。
  const listScrollRef = useRef(null);
  const savedShelfScroll = useRef(0);
  const prevViewRef = useRef('list');
  // 編集フォームの「未保存変更」検知用ベースライン（編集に入った時点のスナップショット）。
  const editBaselineRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  // 読書中・読了の本の購入リンクは「⋯ → この本を買う」のシートへ（2026-09-26 オーナー判断）。
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  // 📤 一文をシェアのシート: { book, initialMemoId? }（本の詳細・メモの「…」・本棚の長押しから）。
  const [shareSheet, setShareSheet] = useState(null);
  const openDetailKebab = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDetailKebab({ x: rect.right - 8, y: rect.bottom + 4 });
  };
  // 「すべての本」から左端スワイプでホームへ戻る（記録から開いたときは記録へ）。
  useEdgeSwipeBack({
    enabled: tab === 'books' && view === 'list' && shelfMode === 'library',
    onBack: () => leaveLibrary(),
  });
  // Edge-swipe back: only listens while we're on a detail or edit view.
  useEdgeSwipeBack({
    enabled: view === 'detail' || view === 'edit',
    onBack: async () => {
      // 編集中の未保存変更は破棄前に確認（下部ナビと同じガード）。
      if (view === 'edit' && !(await confirmDiscardEdit())) return;
      if (view === 'edit' && current) { setEditPhaseOverride(null); setView('detail'); }
      else goList();
    },
  });
  // ブラウザ / Android の「戻る」: 深い画面では ‹・左端スワイプと同じ 1 段戻る（一番上では普通に離れる）。
  useHistoryBack({
    depth: (tab === 'books' && shelfMode === 'library' ? 1 : 0)
      + (view === 'detail' ? 1 : view === 'edit' ? (current ? 2 : 1) : 0)
      + (tab === 'ai' && aiSubTab === 'brain' && consultPushed && view === 'list' ? 1 : 0),
    onBack: async () => {
      if (isBackBlocked()) return false; // 書きかけのシートが開いている間は戻らない
      if (view === 'edit') {
        if (!(await confirmDiscardEdit())) return false;
        if (current) { setEditPhaseOverride(null); setView('detail'); } else goList();
        return true;
      }
      if (view === 'detail') { goList(); return true; }
      if (tab === 'ai' && consultPushed) { window.dispatchEvent(new Event('orime:consult-back')); return true; }
      if (tab === 'books' && shelfMode === 'library') { leaveLibrary(); return true; }
      return true;
    },
  });
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [quickMemoOpen, setQuickMemoOpen] = useState(false);
  const [fullEditorPrefill, setFullEditorPrefill] = useState(null); // { pageNumber, text }
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

  // Books are now committed to DB on delete (no soft-delete state to filter).
  const books = rawBooks;
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
  const triggerCoverAutoRetry = useCallback(
    (book) => {
      enqueueCoverRetry({
        book,
        // 表紙リトライの保存も本ごとの保存チェーンに乗せる。チェーン外の saveBook は
        // 進行中の行動トグル等と DB レベルで並走し、actions 差分同期が in-flight の
        // 新規行動を DELETE する窓がある。チェーン内で最新へ rebase し表紙だけ差し替える。
        saveBook: (patch) => enqueueBookMutation(patch.id, async (entry) => {
          const latest = entry.latest || booksRef.current.find((b) => b.id === patch.id);
          if (!latest) return;
          if (latest.cover || latest.coverIsbn === 'manual' || latest.coverIsbn === 'removed') return;
          const next = { ...latest, cover: patch.cover, coverIsbn: patch.coverIsbn };
          entry.latest = next;
          await saveBook(next);
        }),
        // 保存直前に最新の本へ rebase させる（stale 保存によるユーザー編集の巻き戻し防止）。
        getBook: (id) => booksRef.current.find((b) => b.id === id) || null,
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
    if (tab === 'ai') return aiSubTab === 'brain' ? 'myBookBrain' : aiSubTab === 'report' ? 'themeReport' : 'aiAdvisor';
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
    setAddBookModalOpen(true);
  };

  // 🤖 AI 選書（advisor）へ直行。AI 選書は「メモ0件の初日でも価値が出る」唯一の
  // 機能なので、新規ユーザーの time-to-value 最短ルートとしてオンボーディングから
  // 直接ここへ送る（本棚が空でも"おっ"を体験させる）。
  const openAdvisor = () => {
    setView("list");
    setAiSubTab('advisor');
    setTab('ai');
  };

  // AddBookModal は今や検索結果リストまで内包する 1 画面モーダル。
  // ここでは「ユーザーが結果から本を選んだ」イベントだけを受け取り、
  // 編集画面を該当本のメタデータでプリフィルして開く。検索フォーム /
  // 結果リスト UI は AddBookModal 側に閉じている。
  const pickBookFromAdd = (b) => {
    setAddBookModalOpen(false);
    // ★ 検索結果に既に表示されていた cover を「視覚的に確認済み」とみなして
    //   そのまま seed + coverIsbn = primary ISBN で確定する。これで
    //   「ユーザーが見て選んだ表紙」と「DB に保存される表紙」が必ず一致する
    //   (旧来は b.cover をシードした上で更に async で別 ISBN の表紙に
    //    上書きしていたため、検索結果と保存結果がズレる事故が起きていた)。
    const candidates = getCoverCandidates(b?.isbn);
    const visibleCover = b?.cover || '';
    const seedCover = visibleCover || candidates[0] || '';
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
        const altIsbns = await findIsbnCandidates(b.title, b.author);
        const ordered = [b?.isbn, ...altIsbns].filter(Boolean);
        if (ordered.length === 0) return;
        const { isbn: resolvedIsbn, url: resolvedUrl } = await resolveCoverFromCandidates(ordered);
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
      toast.error('ファイル選択画面を開けませんでした。本棚から再度お試しください。');
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
      toast.success('表紙を削除しました。');
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

      // ── ステップ -1（最優先）: サーバーサイドリゾルバ /api/cover ─────────
      // 端末の Google 429 / NDL CORS を回避。和書の取得率が大幅に上がる。
      try {
        const sv = await resolveCoverViaServer({ title: book.title, author: book.author, isbn: book.isbn });
        if (sv?.url && await checkImageExists(sv.url)) { coverUrl = sv.url; coverIsbn = sv.isbn || book.isbn || ''; }
      } catch { /* 次の手段へ */ }

      // ── ステップ 0 ─────────────────────────────────────────────────
      // Google Books の imageLinks.thumbnail（ISBN 直引き → タイトル+著者）。
      if (!coverUrl) try {
        const gb = await findCoverFromGoogleBooks({
          title: book.title,
          author: book.author,
          isbn: book.isbn,
        });
        if (gb) {
          coverUrl = gb;
          coverIsbn = book.isbn || '';
        }
      } catch { /* 次の手段へ */ }

      // ── ステップ 1: ISBN ベースの multi-source リゾルバ（openBD / Amazon / GB content）
      if (!coverUrl) {
        const r = await fullyResolveCover(
          { title: book.title, author: book.author, isbn: book.isbn },
          findIsbnCandidates,
        );
        if (r.url) {
          coverUrl = r.url;
          coverIsbn = r.isbn || '';
        }
      }

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
        const saved = await saveBook(updated);
        if (saved) entry.latest = saved;
        const next = saved || updated;
        setCurrent((c) => (c && c.id === next.id ? next : c));
      });
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
  const openManualFromAdd = (seed) => {
    setAddBookModalOpen(false);
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
  const openDetail = useCallback((b) => {
    const book = typeof b === 'string' ? booksRef.current.find((x) => x.id === b) : b;
    if (!book || typeof book !== 'object' || !book.id) return;
    setCurrent(book); setEditPhaseOverride(null); setView("detail");
  }, []);

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
        const synthMatch = /^(summary|leverage_memo|ai_summary|roi_summary|invest_purpose|current_challenge|hypothesis|ref)-(.+)$/.exec(pendingRecallMemoId);
        if (synthMatch) {
          const b = rawBooks.find((x) => x.id === synthMatch[2]);
          if (b && !cancelled) { openDetail(b); setTab('books'); opened = true; }
        } else if (supabaseClient) {
          const { data } = await supabaseClient
            .from('book_memos')
            .select('book_id')
            .eq('id', pendingRecallMemoId)
            .maybeSingle();
          const bId = data?.book_id;
          const b = bId && rawBooks.find((x) => x.id === bId);
          if (b && !cancelled) { openDetail(b); setTab('books'); opened = true; }
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
    if (pendingRecallMemoId) return;
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
  useEffect(() => {
    if (view !== 'detail') return;
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
  const goList = () => { setView("list"); setCurrent(null); setEditPhaseOverride(null); setQuickMemoOpen(false); setFullEditorPrefill(null); setDetailKebab(null); setStoreSheetOpen(false); };

  // 同じ本が既に本棚にあれば true を返す。ダイアログを出して「📖 既存の本を見る」
  // が押されたらその詳細へジャンプ。呼び出し側はこの戻り値が true なら追加処理
  // をスキップする。
  const handleDuplicateGate = async (candidate) => {
    const existing = findDuplicateBook(books, candidate);
    if (!existing) return false;
    const statusLabel = STATUS_LABEL[existing.status] || '本棚';
    // ボタンは「押したら何が起きるか」を正確に言う（既存本を開くと今の入力は
    // 保存されない。旧: 「📖 既存の本を見る / ← 戻る」で入力破棄が伝わらなかった）。
    const ok = await confirm({
      title: 'この本は既に本棚にあります',
      message: `『${existing.title}』は「${statusLabel}」として登録済みです。既存の本を開くと、いま入力中の内容は保存されません。`,
      confirmLabel: '既存の本を開く',
      cancelLabel: 'このまま編集を続ける',
    });
    if (ok) openDetail(existing);
    return true;
  };

  const savingRef = useRef(false);
  const handleSave = async () => {
    // 二重送信ガード。handleSave は表紙解決(findIsbnCandidates/resolveCover)+saveBook の
    // 複数 await を含むため、連打すると新規本が二重作成されうる。
    if (savingRef.current) return;
    if (!form.title.trim()) {
      toast.error(fieldRequiredMessage('タイトル'));
      return;
    }
    // 新規追加 (current=null) の時のみ重複チェック。既存本の編集は同じ本を
    // 自分自身とマッチさせてしまうので除外。
    if (!current) {
      const dup = await handleDuplicateGate({ isbn: form.isbn, title: form.title, author: form.author });
      if (dup) return;
    }
    savingRef.current = true;
    try {
      const normalizedTags = Array.from(
        new Set(
          (form.tags || [])
            .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
            .filter(Boolean)
        )
      );

      // 表紙未確定の本については、ここで必ず resolveCoverFromCandidates
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
          const altIsbns = await findIsbnCandidates(form.title, form.author);
          const ordered = [form.isbn, ...altIsbns].filter(Boolean);
          if (ordered.length > 0) {
            const r = await resolveCoverFromCandidates(ordered);
            if (r.url) {
              resolvedCover = r.url;
              resolvedCoverIsbn = r.isbn || '';
            } else {
              // 取れなかった場合は明示的に null。NDL サムネ等の壊れた
              // URL が永続化されないようにする。
              resolvedCover = '';
              resolvedCoverIsbn = '';
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
      const isSetupCompletion = !!current
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
      const wasNew = !current; // 新規追加 (current=null) かどうか
      // 📊 本追加の計測（DB 保存が確定した新規追加時のみ・経路は addedVia の enum だけ）。
      // saveBook は未接続時に throw せず null を返すので、saved が truthy の時だけ計測する
      // （未保存の payload を「追加した」と数えない）。
      if (saved && wasNew) {
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
        toast.error('この本は既に本棚にあります。');
      } else {
        toast.error(toMessage(error, '保存に失敗しました。もう一度お試しください。'));
      }
    } finally {
      savingRef.current = false;
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
    const deletionPromise = deleteBook(book.id).catch((error) => {
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

    // 本の削除→Undo では Storage の写真ファイルを消していないため、
    // photo_path ごと完全復元される（旧「※写真は復元できません」は誤案内だった）。
    toast.undo({
      message: `『${book.title}』を削除しました。`,
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

  // 📥 ほかのアプリ（ブクログ・Kindle）から取り込む（ImportSheet → ここで保存）。
  //   本: 本棚に同じ本があればそこに足す・無ければ追加（状態・評価・読了日・タグ・レビューはまとめへ）。
  //   メモ: 元の日付を残す（「いちばん古いのは ◯ か月前」や相談の歩みに効く）。同じ本の同じ文は足さない
  //         （同じファイルを 2 回取り込んでも二重にならない）。AI は使わない。
  const importLibrary = async (result, onProgress) => {
    let reviewsAdded = 0;
    const items = Array.isArray(result?.books) ? result.books : [];
    let booksAdded = 0;
    let booksMatched = 0;
    const pending = []; // { bookId, memos }
    const newBooks = [];
    const srcDoneDate = new Map(); // もとからあった本 → 取り込み元の読了日
    for (let i = 0; i < items.length; i += 1) {
      const b = items[i];
      onProgress?.(i, items.length);
      const isbn = String(b.isbn || '').replace(/[^0-9Xx]/g, '');
      let target = findDuplicateBook(booksRef.current, { title: b.title, author: b.author, isbn });
      const memos = [...(b.memos || [])];
      if (target) {
        booksMatched += 1;
        if (b.doneDate) srcDoneDate.set(target.id, b.doneDate);
        // レビューは初回の取り込みで「まとめ」に入る。同じレビューをもう一度カードにしない。
        if (b.review && String(b.review).trim() !== String(target.leverageMemo || '').trim()) {
          memos.push({ text: b.review, page: null, createdAt: null });
        }
      } else {
        try {
          // eslint-disable-next-line no-await-in-loop
          target = await saveBook({
            ...emptyBook(),
            title: String(b.title || '').slice(0, LIMITS.bookTitle || 200),
            author: String(b.author || '').slice(0, 200),
            isbn,
            status: ['want', 'before', 'reading', 'done'].includes(b.status) ? b.status : 'done',
            rating: Number(b.rating) || 0,
            doneDate: b.doneDate || '',
            tags: Array.isArray(b.tags) ? b.tags : [],
            leverageMemo: b.review || '',
            addedVia: isbn ? 'search' : 'manual',
          });
          if (target) { booksAdded += 1; newBooks.push(target); if (b.review) reviewsAdded += 1; }
        } catch (e) {
          console.warn('[import] book save failed:', e?.message || e);
          target = null;
        }
      }
      if (target?.id && memos.length) pending.push({ bookId: target.id, memos });
    }
    onProgress?.(items.length, items.length);

    // 既にあるメモの本文（同じ本の同じ文は足さない）
    let memosAdded = 0;
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
      const { error } = await supabaseClient.from('book_memos').insert(chunk);
      if (error) throw error;
      memosAdded += chunk.length;
    }
    // メモを足した「読みたい・積読」の本は読了にする（本の詳細はメモを読書中・読了でしか出さないため）
    //   （いま作った本は取り込み元の状態のまま。もとから本棚にあった本だけ）
    const newIds = new Set(newBooks.map((b) => b.id));
    const withMemo = new Set(rows.map((r) => r.book_id).filter((id) => !newIds.has(id)));
    for (const id of withMemo) {
      const bk = booksRef.current.find((b) => b.id === id);
      // 読了日が無いと「月別の読了」に出ないので、取り込み元の読了日（無ければ今日）を入れる。
      if (bk && (bk.status === 'want' || bk.status === 'before')) {
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
    return { booksAdded, booksMatched, memosAdded, reviewsAdded };
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
      // 4 フィールドが埋まっていれば「話した内容を引き継ぎました」、そうでなければ控えめなトースト。
      const hasPlan = newBook.currentChallenge || newBook.hypothesis || newBook.bookReason;
      const msg = hasPlan
        ? `『${rec.title}』を追加。AI 選書で話した内容を引き継ぎました。`
        : newBook.sourceQuery
          ? `『${rec.title}』を追加。読書計画シートで読み方を決めましょう。`
          : `『${rec.title}』を「読みたい」に追加しました。`;
      // 追加直後に「本棚で探し直す」断絶を無くす — トーストから 1 タップで
      // その本の読書計画（投資目的→戦略）へ直行できるようにする（time-to-value）。
      toast.show({
        type: 'success',
        message: msg,
        duration: 6000,
        action: { label: '開く', onClick: () => openSetup(saved) },
      });
      // 表紙取得をバックグラウンドで実行 (await しない)。失敗しても UX に影響なし。
      resolveCoverInBackground(saved);
      // BookAdvisor が advisor_sessions の added_book_ids を更新する用に
      // 保存された本 (UUID 付き) を返す。
      return saved;
    } catch (error) {
      if (isUniqueViolation(error)) {
        toast.error('この本は既に本棚にあります。');
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
    if (!saved || !saved.id || saved.cover || saved.coverIsbn === 'manual') return;
    if (!saved.title && !saved.isbn) return;
    (async () => {
      try {
        let url = '';
        let coverIsbn = '';
        // ⓪ サーバーサイドリゾルバ（/api/cover）を最優先。端末の Google 429 /
        //    NDL CORS を回避でき、和書の取得率が大きく上がる。検証してから採用。
        try {
          const sv = await resolveCoverViaServer({ title: saved.title, author: saved.author, isbn: saved.isbn });
          if (sv?.url && await checkImageExists(sv.url)) { url = sv.url; coverIsbn = sv.isbn || saved.isbn || ''; }
        } catch { /* 次へ */ }
        // ① Google Books サムネ。ただし Google の「No cover」プレースホルダ
        //    (128×170 等) を掴むことがあるので、実在＋表紙比率を checkImageExists
        //    で検証してから採用する（ダメなら ②の NDL/openBD 等へ落とす）。
        if (!url) try {
          const gb = await findCoverFromGoogleBooks({
            title: saved.title,
            author: saved.author,
            isbn: saved.isbn,
          });
          if (gb && await checkImageExists(gb)) { url = gb; coverIsbn = saved.isbn || ''; }
        } catch { /* 次へ */ }
        // ② ISBN ベース multi-source（NDL / openBD / Open Library / Google / Amazon）
        if (!url) {
          const r = await fullyResolveCover(
            { title: saved.title, author: saved.author, isbn: saved.isbn },
            findIsbnCandidates,
          );
          if (r.url) { url = r.url; coverIsbn = r.isbn || ''; }
        }
        if (url) {
          // 解決に数秒かかる間にユーザーが編集している可能性があるため、
          // 本ごとの保存チェーン（enqueueBookMutation）に乗せ、実行時点の最新
          // （entry.latest > booksRef）に rebase してから表紙だけ差し替えて保存する。
          // チェーン外で saveBook すると、進行中の行動トグル等と DB レベルで並走し、
          // actions の差分同期が「保存直後の新規行動」を DELETE してしまう窓があった。
          // 削除済み・手動アップ済み・既に表紙ありなら触らない。
          await enqueueBookMutation(saved.id, async (entry) => {
            const latest = entry.latest || booksRef.current.find((b) => b.id === saved.id);
            if (latest && !latest.cover && latest.coverIsbn !== 'manual' && latest.coverIsbn !== 'removed') {
              const next = { ...latest, cover: url, coverIsbn };
              entry.latest = next;
              await saveBook(next);
            }
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[bg-cover] failed:', saved.title, e?.message || e);
      }
    })();
  };

// Status transitions — optimistic UI with undo toast.
  const advanceStatus = (book, newStatus) => {
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
    const patch = { status: newStatus };
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
        toast.error(toMessage(error, 'ステータス変更に失敗しました。'));
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
          toast.error(toMessage(error, 'ステータス変更の取り消しに失敗しました。'));
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
      toast.show({
        type: 'success',
        message: `『${book.title}』を読了にしました。心に残ったことを 1 行メモしておくと、あとで相談に生きます。`,
        duration: 6500,
        action: { label: '元に戻す', onClick: revert },
      });
    } else {
      toast.undo({
        message: `「${labels[newStatus] || newStatus}」に変更しました。`,
        onUndo: revert,
      });
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
  const { requirePlan } = usePaywall();
  const runStrategy = async () => {
    if (!requirePlan('読書計画シート')) return;
    setAiLoading(true);
    const targetId = form?.id;
    const prevStrategy = form?.aiStrategy || '';
    setForm((f) => ({ ...f, aiStrategy: '' }));
    try {
      const sheet = await streamClaude({
        system: PROMPTS.setupSheet.system,
        cacheSystem: true,
        messages: [{
          role: 'user',
          content: PROMPTS.setupSheet.user({
            title: clamp(sanitizeForPrompt(form.title || ''), LIMITS.bookTitle),
            author: clamp(sanitizeForPrompt(form.author || ''), LIMITS.bookAuthor),
            analysis: clamp(sanitizeForPrompt(form.aiAnalysis || ''), LIMITS.memoText),
            purpose: clamp(sanitizeForPrompt(form.investPurpose || ''), LIMITS.memoText),
            topTags: allTags.slice(0, 3),
          }),
        }],
        // 読書計画シートは「各節 3 行・900 字以内」（prompts.setupSheet）。2048 → 1600（2026-09-27）
        max_tokens: 1600,
        model: MODEL_SMART,
        onChunk: (fullText) => {
          // 関連書籍カードのパース (= 「読みたい」ボタン押下可能) は
          // streaming 中は BeforePhase 側で aiLoading を見て無効化している。
          // MarkdownSections は 1 chunk ごとに再 render する形になるが、
          // テキスト量は 2KB 以下で十分軽い。
          setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: fullText } : f));
        },
      });
      // 何も返らなかったときは、前のシートを消さずに戻す（空のまま保存すると DB のシートが消える）。
      if (!String(sheet || '').trim()) throw new Error('読書計画シートを作れませんでした。少し時間をおいて、もう一度お試しください。');
      // Fresh generation invalidates any prior 修正リクエスト history.
      if (targetId) clearStrategyHistory(targetId);
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

  // Refinement: take the current sheet + an instruction and ask the AI to
  // rewrite it. Saves a single-step history to localStorage so the user
  // can undo.
  const runStrategyEdit = async (instruction) => {
    if (!form?.aiStrategy?.trim()) return;
    if (!instruction?.trim()) return;
    if (!requirePlan('読書計画シート')) return;
    const prev = form.aiStrategy;
    const targetId = form?.id;
    setAiLoading(true);
    // 修正中は一旦シートを空にして「上書きしているんだ」と視覚化。
    // 失敗時は catch で prev に戻す。
    setForm((f) => ({ ...f, aiStrategy: '' }));
    let didStreamAny = false;
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
        onChunk: (fullText) => {
          didStreamAny = true;
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
      toast.success('✓ 読書計画シートを修正しました。');
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
          toast.error('この本は既に本棚にあります。');
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
      if (becomingDone && updatedAct.recurrence) {
        const label = updatedAct.recurrence === 'weekly' ? '次週' : '翌月';
        toast.success(`完了 ✓ ${label}の予定を自動で組みました。`);
      }
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
  const addActionFromMemo = async (bookId, { text, sourceMemoId = null, sourcePage = null, deadline = '' }) => {
    const body = (text || '').trim();
    if (!body) return false;
    if (!booksRef.current.find((b) => b.id === bookId)) return false;
    const newAction = {
      text: body.slice(0, LIMITS.actionText || 500),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : '',
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
      return true;
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
      toast.success('🎯 行動を追加しました。');
      return true;
    } catch (error) {
      toast.error(toMessage(error, '行動の追加に失敗しました。'));
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
      toast.info('行動を完了しました', {
        duration: 5000,
        action: { label: '元に戻す', onClick: () => { applyActionToggle(bookId, actionIdx, { target }); } },
      });
    }
  };

  const deleteActionFromBook = async (bookId, actionIdx, { skipConfirm = false, target = null } = {}) => {
    // ⋮ → 削除は誤タップし得る明示メニュー操作なので、規約どおり確認を挟む
    // （スワイプ削除＝ジェスチャー意図は確認なし + Undo、と役割分担）。
    // ActionEditModal 経由はモーダル側で確認済みなので skipConfirm で二重確認を避ける。
    if (!skipConfirm) {
      const ok = await confirm({
        title: '行動を削除しますか？',
        message: 'この行動を、期限とふりかえりも含めて削除します。元に戻せません。',
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
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
      acts.splice(idx, 1);
      const updated = { ...book, actions: acts };
      mutateBookLocal(bookId, () => updated);
      syncActionSnapshots(updated);
      try {
        const saved = await saveBook(updated);
        entry.latest = saved || updated;
        syncActionSnapshots(saved || updated);
        toast.success('行動を削除しました。');
      } catch (error) {
        mutateBookLocal(bookId, () => book);
        entry.latest = book;
        syncActionSnapshots(book);
        toast.error(toMessage(error, '行動の削除に失敗しました。'));
      }
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = books.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (folderFilter && !((b.collections || []).includes(folderFilter))) return false;
      if (minRating > 0 && (b.rating || 0) < minRating) return false;
      if (tagFilter.length > 0) {
        const bt = (b.tags || []).map((t) => (t || '').toLowerCase());
        if (!tagFilter.some((t) => bt.includes(t.toLowerCase()))) return false;
      }
      if (!q) return true;
      const title = (b.title || '').toLowerCase();
      const author = (b.author || '').toLowerCase();
      const tagsHit = (b.tags || []).some((t) => (t || '').toLowerCase().includes(q));
      return title.includes(q) || author.includes(q) || tagsHit;
    });

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
  }, [books, statusFilter, search, sortBy, minRating, tagFilter, folderFilter]);

  // 絞り込みシート用: 本に付いた全タグ（出現頻度の高い順、最大 24 個）。
  const availableTags = useMemo(() => {
    const counts = new Map();
    for (const b of books) {
      for (const t of (b.tags || [])) {
        const tag = (t || '').trim();
        if (tag) counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([t]) => t);
  }, [books]);

  // アクティブな絞り込み数（ツールバーのバッジ表示用）。
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (minRating > 0 ? 1 : 0) + tagFilter.length + (folderFilter ? 1 : 0);
  const clearAllFilters = () => { setStatusFilter('all'); setMinRating(0); setTagFilter([]); setFolderFilter(null); };


  // 状態チップの件数は、ほかの絞り込み（評価・タグ・フォルダ・検索）を効かせた数（並ぶ本の数と合わせる）。
  const chipStats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = books.filter((b) => {
      if (folderFilter && !((b.collections || []).includes(folderFilter))) return false;
      if (minRating > 0 && (b.rating || 0) < minRating) return false;
      if (tagFilter.length > 0) {
        const bt = (b.tags || []).map((t) => (t || '').toLowerCase());
        if (!tagFilter.some((t) => bt.includes(t.toLowerCase()))) return false;
      }
      if (!q) return true;
      return (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)
        || (b.tags || []).some((t) => (t || '').toLowerCase().includes(q));
    });
    const out = { total: base.length };
    base.forEach((b) => { out[b.status] = (out[b.status] || 0) + 1; });
    return out;
  }, [books, search, minRating, tagFilter, folderFilter]);
  const stats = useMemo(() => ({ total: books.length, want: books.filter((b) => b.status === "want").length, before: books.filter((b) => b.status === "before").length, reading: books.filter((b) => b.status === "reading").length, done: books.filter((b) => b.status === "done").length }), [books]);
  const actionCount = useMemo(() => books.reduce((s, b) => s + (b.actions || []).filter((a) => a.text?.trim()).length, 0), [books]);
  const actionDone = useMemo(() => books.reduce((s, b) => s + (b.actions || []).filter((a) => a.done).length, 0), [books]);
  const allTags = useMemo(() => { const s = new Set(); books.forEach((b) => (b.tags || []).forEach((t) => s.add(t))); return [...s]; }, [books]);
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

  // 📚 初日クイックスタート。初回ガイドはどの画面（一覧/詳細/編集）でも出るので、
  // その隣に同じものを置く（下の各 return で {quickstartOverlay} を描画）。
  const importOverlay = showImport ? (
    <Suspense fallback={null}>
      <ImportSheet
        onImport={importLibrary}
        onClose={() => setShowImport(false)}
        onAsk={(question) => {
          setShowImport(false);
          setAskPreset({ question, nonce: Date.now() });
          setView('list');
          setAiSubTab('brain');
          setTab('ai');
        }}
      />
    </Suspense>
  ) : null;
  const quickstartOverlay = showQuickstart ? (
    <Suspense fallback={null}>
      <PastBooksQuickstart
        onImport={() => { setShowQuickstart(false); setShowImport(true); }}
        books={books}
        onSaveBook={saveQuickstartBook}
        // 一言を書いた本が「読みたい・積読」のままだと、本の詳細にメモが出ない → 読了にする
        onMarkRead={(bookId) => applyBookPatchQuiet(bookId, { status: 'done' })}
        onMemosAdded={() => appCache?.notifyMemosChanged?.()}
        onAsk={(question) => {
          setShowQuickstart(false);
          refreshBooks();
          setAskPreset({ question, nonce: Date.now() });
          setView('list');
          setAiSubTab('brain');
          setTab('ai');
        }}
        onClose={() => { setShowQuickstart(false); refreshBooks(); }}
        onWriteMemo={(bookId) => {
          setShowQuickstart(false);
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
    const subLabelStyle = { ...groupTitle, margin: 'var(--space-3) 0 var(--space-2)' };
    // 読書計画の中身（得たいこと・課題・仮説・シート）。読書中・読了では 1 つの「読書計画」に畳む。
    const planItems = [
      current.investPurpose && { label: 'この本から得たいこと', text: current.investPurpose },
      current.currentChallenge && { label: '現在の課題', text: current.currentChallenge },
      current.hypothesis && { label: '仮説', text: current.hypothesis },
    ].filter(Boolean);
    const hasPlanFold = planItems.length > 0 || !!current.aiStrategy;
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
              if (isIncomplete) {
                // 見出しとボタンが同じことを言っていたので、副ボタン 1 つだけ（主ボタンは下の「読書を開始する」）。
                // 課題・仮説のカードがあれば、その下 12 に置く（SPEC §2）。
                return (
                  <button type="button" onClick={() => openSetup(current)} style={{ ...btnGhost, marginTop: hasPlanFold ? 'var(--space-3)' : 'var(--space-6)' }}>
                    読書計画シートを作る
                  </button>
                );
              }
              // 完了済み: 控えめな完了表示 + 編集導線
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 0 }}>
                    <CheckCircle2 size={16} aria-hidden="true" style={{ color: 'var(--success)' }} />
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
          {/* 積読の「読書計画シートを作る」は、得たいこと・課題・仮説のカードの下（planCta を後ろで出す）。 */}
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
                  <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                </span>
              </summary>
              <div style={{ paddingBottom: 'var(--space-4)' }}>
                {planItems.map((p) => (
                  <div key={p.label}>
                    <p style={subLabelStyle}>{p.label}</p>
                    <p style={{ fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.text}</p>
                  </div>
                ))}
                {current.aiStrategy && (
                  <>
                    <p style={subLabelStyle}>読書計画シート</p>
                    <MarkdownSections
                      text={current.aiStrategy}
                      onAddRelatedBook={addRelatedBookFromAi}
                      addingTitles={addedRelatedTitles}
                    />
                  </>
                )}
              </div>
            </details>
          )}

          {/* 読みたい・積読: 読む準備が主役なので、得たいこと・課題・仮説は開いて見せる。
              シートは、あるときだけ畳んで置く。 */}
          {!isMemoPhase && hasPlanFold && (
          <section style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {planItems.map((p) => <Card key={p.label} label={p.label} text={p.text} style={{ marginTop: 0 }} />)}
          {current.aiStrategy && (
            <details style={{ ...detailsStyle, marginTop: 0 }}>
              <summary style={summaryStyle}>
                読書計画シート
                <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </summary>
              <div style={{ paddingBottom: 'var(--space-4)' }}>
                <MarkdownSections
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

          {/* 「AIで本を解析する」は 2026-09-27 に廃止。以前の結果だけ、別の畳む見出しで残す。 */}
          {current.aiAnalysis && (
            <details style={{ ...detailsStyle, marginTop: hasPlanFold ? 'var(--space-3)' : (isMemoPhase ? planFoldTop : 'var(--space-3)') }}>
              <summary style={summaryStyle}>
                以前の AI 解析を見る
                <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </summary>
              <div style={{ paddingBottom: 'var(--space-4)' }}>
                <MarkdownSections
                  text={current.aiAnalysis}
                  onAddRelatedBook={addRelatedBookFromAi}
                  addingTitles={addedRelatedTitles}
                />
              </div>
            </details>
          )}

      </>
    );

    return (
      <Shell>
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
            padding: 'var(--space-2) var(--space-4) calc(var(--space-16) + var(--space-12))', // 下は「メモを書く」ボタンに隠れない分（112）
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {/* iOS ナビ風: 指が最初に探す左上の戻るは、背景に沈まない重みで。 */}
            {/* 戻るは「すべての本」の ‹ ホーム と同じ形（ChevronLeft 20・間 0・見た目の左端 16・本文サイズ・--accent）。 */}
            <button onClick={goList} style={{ display: 'inline-flex', alignItems: 'center', gap: 0, minHeight: 44, padding: '0 var(--space-2) 0 0', marginLeft: 'calc(-1 * var(--space-2))', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-body)', fontFamily: 'inherit', cursor: 'pointer' }}>
              <ChevronLeft size={20} aria-hidden="true" />{tab === 'review' ? '振り返り' : tab === 'ai' ? '相談' : shelfMode === 'library' ? 'すべての本' : 'ホーム'}
            </button>
            <div style={{ display: "flex", gap: 'var(--space-1)', marginRight: 'calc(-1 * var(--space-3))' }}>
              <button
                onClick={openHelp}
                style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                aria-label="この画面のヘルプを見る"
                title="ヘルプ"
              >
                <HelpCircle size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {/* 📤 この本の一文をシェア（読書中・読了で、本文のあるメモがあるときだけ・SPEC §2-1）。 */}
              {isMemoPhase && (currentMemoOps.memos || []).some((m) => (m.text || '').trim()) && (
                <button
                  type="button"
                  onClick={() => setShareSheet({ book: current })}
                  style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                  aria-label="この本の一文をシェア"
                  title="一文をシェア"
                >
                  <Share size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
              {/* ⋯ kebab — 編集 / 共有 / 削除 を集約。下部の 3 ボタン廃止。 */}
              <button
                onClick={openDetailKebab}
                style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                aria-label="その他の操作"
                title="その他"
              >
                <MoreHorizontal size={22} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Book header */}
          <div style={{ display: "flex", gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            {/* 表紙の選び直し・取り直し・アップロードは「⋯」メニューへ（表紙の下の小さな
                リンクは 10pt・高さ 32 で DESIGN 基準に届かないため撤去）。 */}
            {/* MiniCover は表紙が読めない（壊れた URL・1×1 のダミー）ときも書名入りの表紙に切り替わる */}
            <MiniCover book={current} width={72} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 書名＝この画面の主題（28・700）。見出し「メモ」「行動」（20・600）と差をつける。 */}
              <h1 style={{ fontSize: "var(--text-title)", fontWeight: 700, color: "var(--text)", lineHeight: 1.25, margin: 0, overflowWrap: "anywhere", wordBreak: "break-word", textWrap: "balance", display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{current.title}</h1>
              {current.author && <p style={{ fontSize: 'var(--text-sub)', color: "var(--text-2)", margin: "var(--space-1) 0 0" }}>{current.author}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', marginTop: "var(--space-2)", flexWrap: "wrap" }}>
                {/* 状態は押せない表示なので面を付けない（DESIGN §5「表示用ラベル」）。 */}
                <StatusLabel status={current.status} />
                {current.rating > 0 && <Stars r={current.rating} size={14} />}
              </div>
              {(current.startDate || current.doneDate) && (
                <p style={{ fontSize: 'var(--text-meta)', color: "var(--text-3)", margin: 'var(--space-2) 0 0' }}>
                  {current.startDate && <>開始 {fmtDateJa(current.startDate)}</>}{current.startDate && current.doneDate && '　'}{current.doneDate && <>読了 {fmtDateJa(current.doneDate)}</>}
                </p>
              )}
            </div>
          </div>

          {/* タグも押せない表示＝面なしのアイコン＋文字（DESIGN §5「表示用ラベル」）。 */}
          {current.tags?.length > 0 && (
            <div style={{ display: "flex", alignItems: 'center', flexWrap: "wrap", columnGap: 'var(--space-3)', rowGap: 'var(--space-1)', marginTop: 'var(--space-3)', fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>
              <IcTag size={14} strokeWidth={1.75} aria-label="タグ" style={{ flexShrink: 0, marginRight: 'calc(-1 * var(--space-2))' }} />
              {current.tags.map((t, i) => (<span key={i}>#{t}</span>))}
            </div>
          )}

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
                  afterList={
                    // 💬 この本だけを相談相手にする（相談相手の絞り込み・2026-09-26）。
                    <button
                      type="button"
                      onClick={() => {
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
                      <MessageCircle size={20} aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>この本に相談する</span>
                      </span>
                      <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                    </button>
                  }
                />
              </section>
            </div>
          ) : null}
          {/* 畳む見出しが続くときは 12（「この本のまとめ」の直後）。 */}
          {current.aiSummary && (
            <details style={{ ...detailsStyle, marginTop: isMemoPhase ? 'var(--space-3)' : 'var(--space-6)' }}>
              <summary style={summaryStyle}>
                以前の AI まとめ
                <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </summary>
              <div style={{ paddingBottom: 'var(--space-4)' }}>
                <MarkdownSections
                  text={current.aiSummary}
                  onAddRelatedBook={addRelatedBookFromAi}
                  addingTitles={addedRelatedTitles}
                />
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
                <IcPlus size={18} aria-hidden="true" />行動を追加
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
          <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-6)', marginTop: 'var(--space-8)' }}>
            {nextStatus[current.status] && (
              // ボタンと補足文は 1 つのまとまり（8）。購入リンクとは 24 離す（DESIGN §1）。
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <button
                  onClick={async () => {
                    if (current.status === 'before') {
                      // 🎯 投資目的は必須（本田哲学=「目的なき読書はしない」）。
                      // 1 行も無いまま読書中へは進ませない＝設定画面へ誘導。
                      if (!current.investPurpose || !current.investPurpose.trim()) {
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
                      if (!current.aiStrategy) {
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
                    advanceStatus(current, nextStatus[current.status]);
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
            {/* 購入リンクは、まだ買っていない可能性が高い 読みたい・積読 だけ画面に出す。
                読書中・読了は「⋯ → この本を買う」のシート（開示文ごと）へ（2026-09-26 オーナー判断）。 */}
            {(current.status === 'want' || current.status === 'before') && (
              <BookStoreLinks book={current} variant="cta" buy />
            )}
            {/* 編集 / 共有 / 削除 は上部 ⋯ kebab に集約。下部の「← 本棚に戻る」は左上の戻ると
                二重なので撤去（左端スワイプでも戻れる）。 */}
          </div>
        </div>

        {/* Floating "+ memo" FAB — only for reading/done so we don't lure
            users into creating memos that the section above hides. */}
        {(current.status === "reading" || current.status === "done") && (
          <button
            type="button"
            onClick={() => setQuickMemoOpen(true)}
            style={{
              // 本の詳細の主ボタン（1 画面 1 つ・DESIGN §0）。＋記号だけだと何が起きるか
              // 分からないので「メモを書く」と文字で言う（SPEC §2）。
              position: "fixed",
              right: "var(--space-4)",
              bottom: "calc(var(--space-16) + var(--space-3) + env(safe-area-inset-bottom, 0px))",
              minHeight: 48,
              padding: "0 var(--space-4)",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--accent)",
              color: "var(--accent-ink)",
              fontSize: "var(--text-body)",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              cursor: "pointer",
              boxShadow: "var(--shadow-raised)",
              // メモ編集(300)・写真拡大(400)等のオーバーレイより下に置く
              // （600 だと全画面エディタの上に浮いてしまう）。
              zIndex: 100,
              fontFamily: "inherit",
            }}
          >
            <PencilLine size={18} aria-hidden="true" />メモを書く
          </button>
        )}

        {quickMemoOpen && (current.status === "reading" || current.status === "done") && (
          <Suspense fallback={<Spinner />}>
            <QuickMemoSheet
              bookTitle={current.title}
              defaultPageNumber={
                (() => {
                  const nums = (currentMemoOps.memos || [])
                    .map((m) => m.pageNumber)
                    .filter((n) => Number.isFinite(n));
                  return nums.length ? Math.max(...nums) + 1 : '';
                })()
              }
              onClose={() => setQuickMemoOpen(false)}
              onCreate={async (payload) => {
                const result = await currentMemoOps.createMemo(payload);
                // 保存確定の手応え（カード式エディタ経由と体験を揃える）。
                haptic.success();
                // 🎯 保存直後に「行動にする」を 1 タップで提案（カード式と同じ動線）。
                // クイックメモは最頻の書き込み経路なので、ここが出ないと大多数の
                // メモが「保存して終わり」になる。
                const actionText = (result?.text ?? payload?.text ?? '').trim();
                if (actionText && current?.id) {
                  toast.show({
                    type: 'success',
                    message: 'メモを保存しました。',
                    duration: 6000,
                    action: {
                      label: '行動にする',
                      onClick: async () => {
                        const ok = await addActionFromMemo(current.id, {
                          text: actionText,
                          sourceMemoId: typeof result?.id === 'string' ? result.id : null,
                          sourcePage: result?.page_number ?? payload?.pageNumber ?? null,
                        });
                        if (ok) toast.success('行動に追加しました。');
                      },
                    },
                  });
                } else {
                  toast.success('メモを保存しました。');
                }
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
            initial={null}
            defaultPageNumber={fullEditorPrefill.pageNumber ?? ''}
            defaultText={fullEditorPrefill.text || ''}
            allTags={allTags}
            onClose={() => setFullEditorPrefill(null)}
            onCreate={async (payload) => {
              await currentMemoOps.createMemo(payload);
              haptic.success();
              toast.success('メモを保存しました。');
            }}
            onUpdate={async (memoId, payload) => {
              await currentMemoOps.updateMemo(memoId, payload);
              haptic.success();
              toast.success('メモを更新しました。');
            }}
          />
        )}

        {helpModalOpen && (
          <Suspense fallback={<Spinner />}>
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
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={() => openAdd('reading')} onStartAdvisor={openAdvisor} onStartQuickstart={() => setShowQuickstart(true)} />}
        {quickstartOverlay}
        {importOverlay}

        {shareSheet && (
          <Suspense fallback={null}>
            <ShareSheet
              book={shareSheet.book}
              memos={shareSheet.book?.id === current.id ? currentMemoOps.memos : undefined}
              initialMemoId={shareSheet.initialMemoId || null}
              onWriteMemo={() => { setShareSheet(null); setQuickMemoOpen(true); }}
              onClose={() => setShareSheet(null)}
            />
          </Suspense>
        )}
        {storeSheetOpen && (
          <BottomSheet title="この本を買う" onClose={() => setStoreSheetOpen(false)}>
            <BookStoreLinks book={current} variant="cta" buy />
          </BottomSheet>
        )}
        {detailKebab && (
          <ContextMenu
            x={detailKebab.x}
            y={detailKebab.y}
            onClose={() => setDetailKebab(null)}
            items={[
              { label: '編集', icon: <PencilLine size={16} aria-hidden="true" />, onClick: () => openEdit(current) },
              // 📋 AI 読書計画は before / reading / done のどこからでも
              // 仕切り直せる。want は本格的な読書計画前なので除外。
              ...(current.status !== 'want'
                ? [{
                    label: '読書計画シートを編集',
                    icon: <IcMap size={16} aria-hidden="true" />,
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
                  icon: <RotateCcw size={16} aria-hidden="true" />,
                  onClick: async () => {
                    const ok = await confirm({
                      title: `「${prevLabel}」に戻しますか？`,
                      message: `ステータスを「${prevLabel}」に戻します。メモや行動などのデータは保持されます。`,
                      confirmLabel: '戻す',
                      cancelLabel: 'キャンセル',
                    });
                    if (!ok) return;
                    advanceStatus(current, prev);
                  },
                }];
              })()),
              { label: '表紙を選び直す', icon: <ImagePlus size={16} aria-hidden="true" />, onClick: () => setCoverFixForBook(current) },
              { label: '表紙を取り直す', icon: <IcRefresh size={16} aria-hidden="true" />, onClick: () => refreshCoverFor(current) },
              { label: '表紙を手動でアップロード', icon: <Upload size={16} aria-hidden="true" />, onClick: () => triggerManualCoverUpload(current) },
              ...(current.cover ? [{ label: '表紙を削除', icon: <ImageOff size={16} aria-hidden="true" />, onClick: () => removeCoverFor(current) }] : []),
              ...((current.status === 'reading' || current.status === 'done')
                ? [{ label: 'この本を買う', icon: <ShoppingBag size={16} aria-hidden="true" />, onClick: () => setStoreSheetOpen(true) }]
                : []),
              // 読書中・読了は「この本の一文」を画像でシェア。読みたい・積読は書名とお店のリンクの文を共有。
              isMemoPhase
                ? { label: '一文をシェア', icon: <Share size={16} aria-hidden="true" />, onClick: () => setShareSheet({ book: current }) }
                : { label: '共有', icon: <Share size={16} aria-hidden="true" />, onClick: () => shareBook(current) },
              { label: '削除', icon: <Trash2 size={16} aria-hidden="true" />, destructive: true, onClick: () => requestDeleteBook(current) },
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
                const ok = await createActionForBook(addActionSheet.bookId, patch);
                if (ok) setAddActionSheet(null);
              }}
            />
          </Suspense>
        )}

        <BottomNav tab={tab} setTab={(t) => { navigateTab(t); goList(); }} hidden={keyboardOpen} />
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
        <div
          className="detail-enter"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            // 上は本の詳細と同じ 8（戻るの行の位置をそろえる）。下は固定の保存があれば 24。
            padding: `${current ? 'var(--space-2)' : 'var(--space-6)'} var(--space-4) ${hasSaveBar ? 'var(--space-6)' : 'var(--space-16)'}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={async () => {
                if (!(await confirmDiscardEdit())) return;
                if (current) { setEditPhaseOverride(null); setView("detail"); }
                else goList();
              }}
              // 詳細画面の「‹ 本棚」と同じ iOS ナビ様式に統一（旧: 沈む極小グレー「← 戻る」）。シェブロンの位置も詳細と同じ。
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: '0 var(--space-2) 0 0', marginLeft: 'calc(-1 * var(--space-1))', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-body)', fontFamily: 'inherit', cursor: 'pointer' }}
            >{/* iOS の作法: 戻る先の画面名（＝書名）。長い書名は収まらないので「戻る」。 */}
              <ChevronLeft size={22} aria-hidden="true" />{current ? ((current.title || '').length <= 8 && current.title ? current.title : '戻る') : 'すべての本'}</button>
            <button
              onClick={openHelp}
              style={{ width: 44, height: 44, marginRight: 'calc(-1 * var(--space-3))', display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
              aria-label="この画面のヘルプを見る"
              title="ヘルプ"
            >
              <HelpCircle size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

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
                    <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25, margin: 0, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{current.title}</h1>
                    <div style={{ marginTop: 'var(--space-2)' }}><StatusLabel status={form.status} /></div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', margin: 'var(--space-3) 0 var(--space-4)' }}>
                    {/* 本を追加するときは、状態は下の「この本の状態」で選ぶので見出しには出さない。 */}
                    <h2 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: "var(--text)", margin: 0, lineHeight: 1.3 }}>{phaseLabel}</h2>
                  </div>
                )}

                {(effectivePhase === "want" || !current) && (
                  <WantPhase form={form} setForm={setForm} onSave={handleSave} onSearchOpen={() => setSearchOpen(true)} allTags={allTags} allFolders={folderNames} />
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
                  />
                )}
                {effectivePhase === "reading" && current && (
                  <ReadingPhase form={form} setForm={setForm} onSave={handleSave} onSaveSummary={handleSaveSummaryFromForm} onMakeAction={addActionFromMemo} allTags={allTags} allFolders={folderNames} />
                )}
                {effectivePhase === "done" && current && (
                  <DonePhase form={form} setForm={setForm} onSave={handleSave} allTags={allTags} allFolders={folderNames} />
                )}
              </>
            );
          })()}
        </div>

        {hasSaveBar && (
          <EditSaveBar onSave={handleSave} label={editPhaseNow === 'before' ? saveLabelFor(form, current?.status === 'before') : '保存'} />
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
          <Suspense fallback={<Spinner />}>
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
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={() => openAdd('reading')} onStartAdvisor={openAdvisor} onStartQuickstart={() => setShowQuickstart(true)} />}
        {quickstartOverlay}
        {importOverlay}
        <BottomNav
          tab={tab}
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
   {!(tab === "books" && shelfMode === 'library') && !(tab === "ai" && aiSubTab === 'brain' && consultPushed) && (
   <header
     style={{
       flexShrink: 0,
       padding: "max(env(safe-area-inset-top, 4px), 4px) 16px 4px",
       minHeight: 44,
       display: "flex",
       justifyContent: "space-between",
       alignItems: "center",
       gap: 8,
       /* ページ（クリーム）と同色にして上部を一体化（iOS ナビバー流儀）。
          白いカードが下で浮く構図になる。 */
       background: "var(--bg)",
     }}
   >
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
      <button
        type="button"
        {...logoLongPress.bind}
        aria-label="ロゴ（長押しで開発者からのメッセージ）"
        style={{
          lineHeight: 0,
          // 押せる範囲 44×44（DESIGN §6）。見た目の左端は余白 16 に揃えるため左へ 8 戻す。
          padding: 8,
          margin: '0 0 0 -8px',
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
        }}
      >
        <img
          src="/apple-touch-icon.png"
          alt="Orime"
          width={28}
          height={28}
          // アプリアイコン画像は iOS のアイコン形状（角丸 UI の対象外・DESIGN §4 の例外）。
          style={{ borderRadius: "22%", display: "block" }}
        />
      </button>
    </div>
    {/* 右端は左のロゴの補正と対称に（アイコンの見た目の右余白を 16 に）。 */}
    <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)', marginRight: 'calc(-1 * var(--space-3))' }}>
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

      {/* Shell が flex column になったため、ここは flex: 1 / minHeight: 0
          で残りスペースを取る。AI タブは内側で flex column を構成、
          books/review は overflow-y: auto で内側スクロール。 */}
      <div
        key={tab}
        ref={listScrollRef}
        onScroll={(e) => {
          // 本棚スクロール中だけ位置を控える（本を開いて戻った時の復元用）。
          if (view === 'list' && tab === 'books') savedShelfScroll.current = e.currentTarget.scrollTop;
        }}
        className={tab === 'books' ? 'lvg-page tab-fade-in' : 'lvg-page'}
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
              onAsk={(question) => {
                setAskPreset({ question, nonce: Date.now() });
                setAiSubTab('brain');
                setTab('ai');
              }}
              onQuickstart={() => setShowQuickstart(true)}
              onImport={() => setShowImport(true)}
              onAddBook={() => openAdd('reading')}
              onAdvisor={() => { setAiSubTab('advisor'); setTab('ai'); }}
              onOpenBook={(b) => openDetail(b)}
              onWriteMemo={(b) => setHomeMemoBook(b)}
              onOpenLibrary={() => setShelfMode('library')}
              onSeeAllReading={() => { setStatusFilter('reading'); setShelfMode('library'); }}
            />
          </PullToRefresh>
        )}
        {homeMemoBook && (
          <Suspense fallback={null}>
            <HomeQuickMemo
              book={homeMemoBook}
              onClose={() => setHomeMemoBook(null)}
              onSaved={(result, payload) => {
                haptic.success();
                const b = homeMemoBook;
                const actionText = (result?.text ?? payload?.text ?? '').trim();
                if (actionText && b?.id) {
                  toast.show({
                    type: 'success',
                    message: 'メモを保存しました。',
                    duration: 6000,
                    action: {
                      label: '行動にする',
                      onClick: async () => {
                        const ok = await addActionFromMemo(b.id, {
                          text: actionText,
                          sourceMemoId: typeof result?.id === 'string' ? result.id : null,
                          sourcePage: result?.page_number ?? payload?.pageNumber ?? null,
                        });
                        if (ok) toast.success('行動に追加しました。');
                      },
                    },
                  });
                } else {
                  toast.success('メモを保存しました。');
                }
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 0, minHeight: 44, padding: '0 var(--space-2) 0 0', marginLeft: 'calc(-1 * var(--space-2))', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-body)', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <ChevronLeft size={20} aria-hidden="true" />{libraryFrom === 'record' ? '記録' : 'ホーム'}
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
                    aria-label={activeFilterCount > 0 ? `並び替え・絞り込み・表示（絞り込み ${activeFilterCount} 件）` : '並び替え・絞り込み・表示'}
                    style={{ ...bookshelfIconBtn, position: 'relative' }}
                  >
                    <MoreHorizontal size={22} aria-hidden="true" />
                    {activeFilterCount > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />}
                  </button>
                  <button type="button" onClick={openAdd} aria-label="本を追加" title="本を追加" style={{ ...bookshelfIconBtn, color: 'var(--accent)' }}>
                    <IcPlus size={24} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>すべての本</h1>
                <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>{filtered.length} 冊</span>
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
                    aria-label="本を検索（書名・著者・タグ）"
                    placeholder="書名・著者・タグ"
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
                  { label: `並び替え（${SORT_LABELS[sortBy] || '更新順'}）`, icon: <IcSort size={16} aria-hidden="true" />, onClick: () => setSortSheetOpen(true) },
                  { label: activeFilterCount > 0 ? `絞り込み（${activeFilterCount}）` : '絞り込み', icon: <IcFilter size={16} aria-hidden="true" />, onClick: () => setFilterSheetOpen(true) },
                  effectiveBookshelfView === 'grid'
                    ? { label: 'リストで表示', icon: <IcList size={16} aria-hidden="true" />, onClick: () => setBookshelfViewMode('list') }
                    : { label: '表紙で表示', icon: <IcGrid size={16} aria-hidden="true" />, onClick: () => setBookshelfViewMode('grid') },
                  // 押し込まれた画面では全体ヘッダー（？）を出さないので、ヘルプはここから。
                  { label: 'ヘルプ', icon: <HelpCircle size={16} aria-hidden="true" />, onClick: openHelp },
                ]}
              />
            )}
            <div style={{ padding: "0 var(--space-4)" }}>
              {/* 🔎 ステータスのワンタップ絞り込み。管理の最頻操作（読書中だけ見る等）を
                  絞り込みシートの1階層奥から棚の表に昇格。state は絞り込みシートと共有
                  （statusFilter＝activeFilterCount とも連動）。同じチップの再タップで解除。
                  本が少ないうちはノイズなので 4 冊未満では出さない。 */}
              {/* 検索で 0 件のときはチップ行を出さない（下の「該当する本がありません」だけにする）。 */}
              {(books.length >= 4 || folderFilter || minRating > 0 || tagFilter.length > 0) && !(filtered.length === 0 && search.trim() && rawBooks.length > 0) && (
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
                  aria-label="ステータスで絞り込み"
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
                    <ShelfChip key={`tag-${t}`} active onClick={() => setTagFilter((prev) => prev.filter((x) => x !== t))} ariaLabel={`タグ「${t}」の絞り込みを解除`}>
                      <IcTag size={14} aria-hidden="true" />{t}<IcX size={14} aria-hidden="true" />
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
              {/* ホームに移した: 相談カード・はじめの一歩・いま読んでいる本（HomeScreen.jsx）。
                  思い出しカードは「振り返り」へ（SPEC §1）。ここは本の一覧だけに集中する。 */}
              {booksLoading && rawBooks.length === 0 ? (
                effectiveBookshelfView === 'grid' ? (
                  <BookGridSkeleton count={6} />
                ) : (
                  <BookListSkeleton rows={4} />
                )
              ) : booksLoadError && rawBooks.length === 0 ? (
                // 読み込みに失敗したときは「本がない」ではなく、読み込めなかったことを出す。
                <ErrorMessage
                  icon={<IcRefresh size={28} aria-hidden="true" />}
                  title="本を読み込めませんでした"
                  description="通信の状態を確かめて、もう一度お試しください。"
                  actions={[{ label: 'もう一度', onClick: () => refreshBooks(), variant: 'primary' }]}
                />
              ) : filtered.length === 0 ? (
                rawBooks.length === 0 ? (
                  <EmptyState
                    icon={<IcLibrary size={34} aria-hidden="true" />}
                    title="最初の1冊から"
                    actions={[
                      { label: '本を追加', onClick: openAdd, variant: 'primary', icon: <IcPlus size={18} aria-hidden="true" /> },
                    ]}
                    tip={(
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span>悩みから</span>
                        <button
                          type="button"
                          onClick={() => { setAiSubTab('advisor'); setTab('ai'); }}
                          style={{
                            background: 'none', border: 'none', padding: 0,
                            color: 'var(--accent)', fontWeight: 600, minHeight: 44,
                            cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
                          }}
                        >
                          AI に選んでもらう
                        </button>
                      </span>
                    )}
                  />
                ) : (
                  <EmptyState
                    icon={<IcSearchX size={32} aria-hidden="true" />}
                    title="該当する本がありません"
                    actions={[
                      {
                        // 検索語だけで絞っているときは「検索をクリア」、状態・フォルダ等もあれば「条件をクリア」。
                        label: search.trim() && activeFilterCount === 0 ? '検索をクリア' : '条件をクリア',
                        onClick: () => { setSearch(''); setFolderFilter(null); clearAllFilters(); },
                        variant: 'primary',
                      },
                    ]}
                  />
                )
              ) : effectiveBookshelfView === 'grid' ? (
                <div className="bookshelf-grid">
                  {filtered.map((b) => (
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
                  {filtered.map((b, i) => (
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
              <Suspense fallback={<Spinner />}>
                <Review books={books} onOpenBook={(b) => { openDetail(b); }} onAddAction={addActionFromMemo} onAddNote={() => setAddNoteSheet('pick')} onGoToShelf={() => { navigateTab('books'); goList(); setShelfMode('library'); }} />
              </Suspense>
            ) : reviewSubTab === 'record' ? (
              <Suspense fallback={<Spinner />}>
                <ReadingRecord
                  books={books}
                  // 📊 統計→中身への 1 タップ動線。既存の絞り込みを一度リセット
                  // してから目的の条件だけを立てる（前の絞り込みが残っていると
                  // 「読了 5 冊のはずが 2 冊しか出ない」ように見えるため）。
                  onShowBooks={(status) => {
                    setSearch(''); setMinRating(0); setTagFilter([]); setFolderFilter(null);
                    setStatusFilter(status || 'all');
                    openLibraryFromRecord();
                  }}
                  onShowMemos={() => setReviewSubTab('note')}
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
              <ActionList
                books={books}
                showDoneNonce={actionShowDoneNonce}
                onToggleAction={toggleAction}
                onReflect={saveActionReflection}
                onDeleteAction={deleteActionFromBook}
                onEditAction={(bookId, actionIdx, action) => setEditingAction({ bookId, actionIdx, action })}
                onOpenBook={(b) => { openDetail(b); }}
                onGoToBooks={() => setTab("books")}
                onAddAction={() => setAddActionSheet({ step: 'pick', prefillText: '' })}
                onGoConsult={() => { setView('list'); setAiSubTab('brain'); setTab('ai'); }}
              />
            )}
          </div>
        )}

        {tab === "ai" && (
          <div key={`tab-${tab}`} className="tab-content ai-page">
            {!(aiSubTab === 'brain' && consultPushed) && (
            <div className="sub-tabs" role="tablist" aria-label="相談のサブタブ" style={{ flexShrink: 0 }}>
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
                className={`sub-tab ${aiSubTab === 'advisor' ? 'active' : ''}`}
                onClick={() => setAiSubTab('advisor')}
              >
                AI 選書
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'report'}
                className={`sub-tab ${aiSubTab === 'report' ? 'active' : ''}`}
                onClick={() => setAiSubTab('report')}
              >
                テーマまとめ
              </button>
            </div>
            )}
            {/* 独自名のサブタブを初対面でも分かるよう、役割を動詞で先頭に置いて注釈する。
                3 つの違い（選ぶ/聞く/しぼる）を一目で言語化できるようにする。 */}
            {/* サブタブの下に説明文は置かない（各画面の見出しで伝わる・DESIGN §0-6）。 */}
            <div className="ai-page-body">
              {aiSubTab === 'advisor' ? (
                <Suspense fallback={<Spinner />}>
                  <BookAdvisor
                    onAddBook={(rec, payload) => addFromAdvisor(rec, payload)}
                    sessionApi={advisorSessions}
                    books={books}
                  />
                </Suspense>
              ) : aiSubTab === 'report' ? (
                <Suspense fallback={<Spinner />}>
                  <ThemeReport
                    onActionAdded={() => { try { refreshBooks(); } catch { /* ignore */ } }}
                    onOpenActions={() => { setReviewSubTab('action'); setTab('review'); }}
                    onGoBookshelf={() => { setView('list'); setTab('books'); }}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<Spinner />}>
                  <MyBookBrain
                    onOpenBook={(b) => { openDetail(b); }}
                    books={books}
                    onAddAction={addActionFromMemo}
                    onBooksMutated={refreshBooks}
                    onAddActionPickBook={(text) => setAddActionSheet({ step: 'pick', prefillText: text })}
                    onGoBookshelf={() => { setView('list'); setTab('books'); }}
                    onQuickstart={() => setShowQuickstart(true)}
                    askPreset={askPreset}
                    scopePreset={scopePreset}
                    onPushedViewChange={setConsultPushed}
                  />
                </Suspense>
              )}
            </div>
          </div>
        )}
      </div>

      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={() => openAdd('reading')} onStartAdvisor={openAdvisor} onStartQuickstart={() => setShowQuickstart(true)} />}
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
              icon: <BookOpen size={16} aria-hidden="true" />,
              onClick: () => openDetail(bookContextMenu.book),
            },
            // 読書中/読了の本は、本棚の長押しから直接メモを書けるように
            // （最速でも「探す→開く→FAB」だった導線を1手に短縮＝熱い一行を取りこぼさない）。
            ...((bookContextMenu.book?.status === 'reading' || bookContextMenu.book?.status === 'done')
              ? [{
                  label: 'メモを書く',
                  icon: <PencilLine size={16} aria-hidden="true" />,
                  onClick: () => { openDetail(bookContextMenu.book); setQuickMemoOpen(true); },
                }]
              : []),
            // 📗 本を開かずにその場でステータス変更（管理の最頻操作を1手に）。
            {
              label: 'ステータスを変える',
              icon: <IcCheck size={16} aria-hidden="true" />,
              onClick: () => setStatusPickerBook(bookContextMenu.book),
            },
            // 🗂 フォルダ割当ても本棚から直接（新規フォルダもその場で作れる）。
            {
              label: 'フォルダに入れる',
              icon: <IcFolder size={16} aria-hidden="true" />,
              onClick: () => { setNewFolderName(''); setFolderPickerBook(bookContextMenu.book); },
            },
            {
              label: '編集',
              icon: <PencilLine size={16} aria-hidden="true" />,
              onClick: () => openEdit(bookContextMenu.book),
            },
            // 本棚から直接「表紙を取り直す」できるように追加。本詳細を開かず
            // 1 タップで再 fetch まで完結する (誤表紙への対処を 3 秒以内に)。
            {
              label: '表紙を取り直す',
              icon: <IcRefresh size={16} aria-hidden="true" />,
              onClick: () => refreshCoverFor(bookContextMenu.book),
            },
            // 読書中・読了は「この本の一文」を画像でシェア（メモはシートが読み込む）。読みたい・積読は文を共有。
            (bookContextMenu.book.status === 'reading' || bookContextMenu.book.status === 'done')
              ? {
                  label: '一文をシェア',
                  icon: <Share size={16} aria-hidden="true" />,
                  onClick: () => setShareSheet({ book: bookContextMenu.book }),
                }
              : {
                  label: '共有',
                  icon: <Share size={16} aria-hidden="true" />,
                  onClick: () => shareBook(bookContextMenu.book),
                },
            {
              label: '削除',
              icon: <Trash2 size={16} aria-hidden="true" />,
              destructive: true,
              onClick: () => requestDeleteBook(bookContextMenu.book),
            },
          ]}
        />
      )}

      {/* 📤 本棚の長押し →「一文をシェア」。本の詳細の同じ mount とは片方の画面しか return されない。 */}
      {shareSheet && (
        <Suspense fallback={null}>
          <ShareSheet
            book={shareSheet.book}
            initialMemoId={shareSheet.initialMemoId || null}
            onWriteMemo={() => { const b = shareSheet.book; setShareSheet(null); openDetail(b); }}
            onClose={() => setShareSheet(null)}
          />
        </Suspense>
      )}

      {settingsOpen && (
        <Suspense fallback={<Spinner />}>
          <AccountSettings
            onClose={() => setSettingsOpen(false)}
            onAfterDelete={() => setSettingsOpen(false)}
            isAdmin={isAdmin}
            onOpenAdmin={() => { setSettingsOpen(false); setAdminOpen(true); }}
            onOpenImport={() => { setSettingsOpen(false); setShowImport(true); }}
          />
        </Suspense>
      )}

      {/* 🛰️ 運営ダッシュボード（管理者のみ。設定モーダルの「運営」から開く） */}
      {adminOpen && (
        <Suspense fallback={<Spinner />}>
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
          action={editingAction.action}
          onClose={() => setEditingAction(null)}
          onSave={async (patch) => {
            const { bookId, actionIdx, action: openedAction } = editingAction;
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
            await enqueueBookMutation(bookId, async (entry) => {
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
                toast.success('🎯 行動を更新しました。');
              } catch (error) {
                mutateBookLocal(bookId, () => book);
                entry.latest = book;
                syncActionSnapshots(book);
                outcome = 'failed';
                toast.error(toMessage(error, '更新に失敗しました'));
              }
            });
            if (outcome !== 'failed') setEditingAction(null);
          }}
          onDelete={async () => {
            const { bookId, actionIdx, action } = editingAction;
            setEditingAction(null);
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
      {addActionSheet?.step === 'pick' && (
        <BottomSheet title="どの本の行動にしますか？" onClose={() => setAddActionSheet(null)} dismissLabel="キャンセル">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {[...books]
              .sort((a, b) => {
                const rank = { reading: 0, done: 1, before: 2, want: 3 };
                const ra = rank[a.status] ?? 4;
                const rb = rank[b.status] ?? 4;
                if (ra !== rb) return ra - rb;
                return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
              })
              .map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setAddActionSheet({ step: 'edit', bookId: b.id, prefillText: addActionSheet.prefillText || '' })}
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

      {/* 🎯 行動タブ「＋追加」: ② 行動の内容を入力（ActionEditModal を create モードで再利用）。
          prefillText があれば行動文を初期表示（AI 回答からの行動化フォールバック）。 */}
      {addActionSheet?.step === 'edit' && addActionSheet.bookId && (
        <Suspense fallback={<Spinner />}>
          <ActionEditModal
            mode="create"
            action={addActionSheet.prefillText ? { text: addActionSheet.prefillText } : null}
            onClose={() => setAddActionSheet(null)}
            onSave={async (patch) => {
              const ok = await createActionForBook(addActionSheet.bookId, patch);
              if (ok) setAddActionSheet(null);
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
        <BottomSheet title="ステータスを変える" onClose={() => setStatusPickerBook(null)}>
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
        <BottomSheet title="どの本のメモにしますか？" onClose={() => setAddNoteSheet(null)}>
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
          <p style={sheetLabel}>ステータス</p>
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

          <p style={sheetLabel}>タグ</p>
          {availableTags.length > 0 ? (
            <div style={{ ...sheetChips, marginBottom: 0 }}>
              {availableTags.map((t) => {
                const active = tagFilter.includes(t);
                return (
                  <ShelfChip key={t} active={active} onClick={() => setTagFilter((arr) => (active ? arr.filter((x) => x !== t) : [...arr, t]))}>
                    {t}
                  </ShelfChip>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
              本の「タグ」欄にキーワードを付けると、ここで選べます。
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
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 48, padding: '0 var(--space-1)', background: 'none', border: 'none', borderBottom: i < arr.length - 1 ? '1px solid var(--separator)' : 'none', fontSize: 'var(--text-body)', fontFamily: 'inherit', cursor: 'pointer', color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 600 : 400 }}
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
        <Suspense fallback={<Spinner />}>
          <AddBookModal
            onClose={() => setAddBookModalOpen(false)}
            onSelect={pickBookFromAdd}
            onManual={openManualFromAdd}
            existingBooks={books}
            onOpenExisting={(existing) => {
              setAddBookModalOpen(false);
              openDetail(existing);
            }}
          />
        </Suspense>
      )}

      {helpModalOpen && (
        <Suspense fallback={<Spinner />}>
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

      <UpdateBanner safe={safeForUpdate} />

      <BottomNav tab={tab} setTab={(t) => { navigateTab(t); if (view !== "list") goList(); }} hidden={keyboardOpen} />
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
          <ErrorMessage
            icon={<IcWifiOff size={28} aria-hidden="true" />}
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
            fontSize: 'var(--text-title)', fontWeight: 700, lineHeight: 1.3,
            margin: emailJustConfirmed ? 'var(--space-2) 0 0' : 'var(--space-6) 0 0',
          }}
        >
          {emailJustConfirmed ? 'アプリに戻ってログインしてください' : 'アプリでご利用ください'}
        </h1>
        <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 'var(--space-3) 0 0' }}>
          アプリに同じアカウントでログインすると、<br />メモもそのまま使えます。
        </p>
        {isAppStoreLive ? (
          <a
            href={APP_STORE_URL}
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
        <Suspense fallback={null}>
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
      ? ((periodType === 'trial' || periodType === 'intro') ? 'trial' : 'paid')
      : 'free';
  const trialEndsAt = plan === 'trial' ? (subscription?.currentPeriodEnd || null) : null;

  // 🪙 残りのトークン（src/lib/tokens.js・表示だけ。止めるのはサーバー）。
  const [usedMjpy, setUsedMjpy] = useState(null); // null=未確認・読めない
  const tokenKey = plan === 'admin' ? null : periodKeyFor(plan, { periodEnd: trialEndsAt });
  const refreshTokens = useCallback(async () => {
    if (!user?.id || !tokenKey) { setUsedMjpy(null); return; }
    setUsedMjpy(await fetchUsedMjpy(user.id, tokenKey));
  }, [user?.id, tokenKey]);
  useEffect(() => {
    if (loading || !adminChecked) return;
    refreshTokens();
  }, [loading, adminChecked, refreshTokens]);
  // どの機能で AI を使っても（相談・写真の書き起こし・テーマまとめ…）残りを取り直す。
  useEffect(() => {
    const onUsed = () => { refreshTokens(); };
    window.addEventListener(AI_USED_EVENT, onUsed);
    return () => window.removeEventListener(AI_USED_EVENT, onUsed);
  }, [refreshTokens]);
  const tokenAllowance = allowanceForPlan(plan);
  const tokensRemaining = usedMjpy == null || tokenAllowance == null ? null : remainingTokens(tokenAllowance, usedMjpy);
  const freeMode = plan === 'free';

  // アプリの上に重ねて開く有料プランの画面（{ reason, feature }）。いつでも × / 「あとで」で閉じられる。
  //   reason: 'free_used'（今月の無料のトークンを使い切った）/ 'feature'（プランで使える機能）/ null（プランを見る）
  const [paywall, setPaywall] = useState(null);
  useEffect(() => {
    const onReq = (e) => setPaywall({ reason: e?.detail?.reason ?? 'feature', feature: e?.detail?.feature || '' });
    window.addEventListener(PAYWALL_EVENT, onReq);
    return () => window.removeEventListener(PAYWALL_EVENT, onReq);
  }, []);
  // 契約できたら閉じる（無料期間を含む）
  useEffect(() => { if (isActive) setPaywall(null); }, [isActive]);
  const paywallCtx = useMemo(() => {
    const openPaywall = (reason = null, feature = '') => setPaywall({ reason, feature });
    return {
      plan,
      freeMode,
      trialEndsAt,
      tokenAllowance,
      tokensRemaining,
      refreshTokens,
      // 旧名（お試しの頃の呼び方）。無料プランの残りのトークン。
      freeRemaining: freeMode ? tokensRemaining : null,
      refreshFree: refreshTokens,
      openPaywall,
      // プランで使える AI 機能の入口で呼ぶ。無料プランなら有料プランの画面を開いて false。
      requirePlan: (feature = '') => {
        if (!freeMode) return true;
        openPaywall('feature', feature);
        return false;
      },
    };
  }, [plan, freeMode, trialEndsAt, tokenAllowance, tokensRemaining, refreshTokens]);

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
  const [showSplash, setShowSplash] = useState(true);
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
