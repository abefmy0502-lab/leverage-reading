import { useAuth } from './hooks/useAuth';
import { useBooks } from './hooks/useBooks';
import { sanitizeForPrompt } from './lib/ai';
import { streamClaude } from './lib/streamClaude';
import { PROMPTS } from './lib/prompts';
import MarkdownSections from './components/MarkdownSections';
import AuthScreen from './components/auth/AuthScreen';
import AuthCallback from './components/auth/AuthCallback';
import BookMemoList from './components/BookMemoList';
import BookSearchModal from './components/BookSearchModal';
import StatusBadge from './components/StatusBadge';
import { BookCoverCard, SwipeableBookCard } from './components/BookCards';
import { STATUSES, getSt } from './lib/status';
import { isStrictMatch } from './lib/bookMatch';
const BookAdvisor = lazy(() => import('./components/BookAdvisor'));
import BookMemoEditor from './components/BookMemoEditor';
import BookLearningAnalysis from './components/BookLearningAnalysis';
const QuickMemoSheet = lazy(() => import('./components/QuickMemoSheet'));
import Onboarding, { isOnboardingCompleted, clearOnboardingCompletion } from './components/Onboarding';
import {
  Search as IcSearch, Plus as IcPlus, Library as IcLibrary, Sparkles as IcSparkles,
  History as IcHistory,
  SearchX as IcSearchX, NotebookText as IcNote, Target as IcTarget, Brain as IcBrain,
  Ruler as IcRuler, LayoutGrid as IcGrid, List as IcList,
  Lightbulb as IcBulb,
  BookOpen as IcBook, Map as IcMap, RefreshCw as IcRefresh, Bot as IcBot,
  CheckCircle2 as IcCheck,
  SlidersHorizontal as IcFilter, ArrowUpDown as IcSort, Star as IcStar, Folder as IcFolder,
} from 'lucide-react';

// サブタブのラベル: 絵文字をやめ lucide 線アイコン＋テキストで統一（脱・個人開発感）。
const subTabIconStyle = { verticalAlign: '-2px', marginRight: 5 };

// 本棚ツールバー（シート化）用の共通スタイル。
const SORT_LABELS = { updated: '更新順', created: '登録順', title: 'タイトル順', rating: '評価順' };
const bookshelfToolbarBtn = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44,
  padding: '7px 12px', borderRadius: 999, fontSize: 12, fontFamily: 'inherit',
  cursor: 'pointer', fontWeight: active ? 600 : 500,
  border: active ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
  background: active ? 'var(--c-soft)' : 'transparent',
  color: active ? 'var(--c-brand)' : 'var(--c-ink-2)',
});
const bookshelfToolbarBadge = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999,
  background: 'var(--c-brand)', color: 'var(--c-card)', fontSize: 10, fontWeight: 700,
};
const HelpModal = lazy(() => import('./components/HelpModal'));
const Review = lazy(() => import('./components/Review'));
const MyBookBrain = lazy(() => import('./components/MyBookBrain'));
const ThemeReport = lazy(() => import('./components/ThemeReport'));
const AdvisorHistoryList = lazy(() => import('./components/AdvisorHistory').then((m) => ({ default: m.AdvisorHistoryList })));
const AdvisorSessionDetail = lazy(() => import('./components/AdvisorHistory').then((m) => ({ default: m.AdvisorSessionDetail })));
const AdvisorAddConfirmModal = lazy(() => import('./components/AdvisorAddConfirmModal'));
const DiscoverPanel = lazy(() => import('./components/DiscoverPanel'));
import { useAdvisorSessions } from './hooks/useAdvisorSessions';
import ActionList from './components/ActionList';
const ActionEditModal = lazy(() => import('./components/ActionEditModal'));
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
const Landing = lazy(() => import('./pages/Landing'));
const TermsPage = lazy(() => import('./legal/TermsPage'));
const PrivacyPage = lazy(() => import('./legal/PrivacyPage'));
const SctPage = lazy(() => import('./legal/SctPage'));
import { supabase as supabaseClient } from './lib/supabase';
import { track } from './lib/analytics';
const AccountSettings = lazy(() => import('./components/AccountSettings'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
import SplashScreen from './components/SplashScreen';
import Spinner from './components/Spinner';
import EmptyState from './components/EmptyState';
import ErrorMessage from './components/ErrorMessage';
import BookshelfSummary from './components/BookshelfSummary';
import ActivationChecklist from './components/ActivationChecklist';
import HomeRecall from './components/HomeRecall';
import AuthorThankYou from './components/AuthorThankYou';
import { buildGreeting } from './lib/greeting';
import { initServiceWorker } from './lib/swUpdate';
import { ensurePushSubscription } from './lib/push';
import { isNative } from './lib/iap';
import { initNativePushNav } from './lib/nativePush';
import UpdateBanner from './components/UpdateBanner';
import { BookListSkeleton, BookGridSkeleton } from './components/Skeleton';
import { fireConfetti } from './lib/confetti';
import SwipeableCard from './components/SwipeableCard';
import ContextMenu from './components/ContextMenu';
import PullToRefresh from './components/PullToRefresh';
import { useHaptic } from './hooks/useHaptic';
import { useLongPress } from './hooks/useLongPress';
import { useEdgeSwipeBack } from './hooks/useEdgeSwipeBack';
import { useKeyboardOpen } from './hooks/useKeyboardOpen';
import { useSubscription } from './hooks/useSubscription';
const Paywall = lazy(() => import('./components/Paywall'));
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmDialog';
import { toMessage, fieldRequiredMessage, isSchemaError } from './lib/errors';
import { LIMITS, clamp } from './lib/limits';
import { ensureHttps } from './lib/url';
// 🧩 #9 App.jsx 分割: 本フォーム共通プリミティブと Phase エディタは別ファイルへ抽出。
import { Dots, Stars, inp, btnS } from './components/formPrimitives';
import { WantPhase, BeforePhase, ReadingPhase, DonePhase } from './components/BookPhases';
import { getAmazonLink } from './lib/amazonLink';
import BookStoreLinks from './components/BookStoreLinks';
import { getRakutenLink } from './lib/rakutenLink';
import { getRandomFromCategory } from './lib/quotes';
import {
  BookOpen,
  RotateCcw,
  Brain,
  Sparkles,
  HelpCircle,
  Settings as SettingsIcon,
  Target,
} from 'lucide-react';
import { useBookMemos } from './hooks/useBookMemos';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from "react";



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

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(30,25,20,0.45)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-5) var(--space-5)",
          width: "min(420px,92vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-4)",
        }}
      >
        {children}
      </div>
    </div>
  );
}



function Card({ label, text, bg }) {
  return (
    <div style={{ background: bg || "#f7f3ec", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-accent)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 13, color: "#4a4036", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto", paddingRight: 8, margin: 0 }}>{text}</p>
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
    { key: "books", Icon: BookOpen, label: "本棚" },
    { key: "review", Icon: RotateCcw, label: "振り返り" },
    { key: "ai", Icon: Sparkles, label: "AI" },
  ];
  return (
    <nav
      className={`bottom-nav${hidden ? ' is-hidden' : ''}`}
      aria-hidden={hidden ? 'true' : undefined}
      style={{
        flexShrink: 0,
        // iOS タブバー風: 半透明＋うっすらブラー＋極細ヘアライン。
        background: "rgba(250, 247, 242, 0.92)",
        backdropFilter: "saturate(180%) blur(12px)",
        WebkitBackdropFilter: "saturate(180%) blur(12px)",
        borderTop: "0.5px solid rgba(60, 48, 30, 0.12)",
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
              color: active ? "var(--color-accent-strong)" : "var(--color-secondary)",
              opacity: active ? 1 : 0.78,
              transition: "color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-spring)",
            }}
          >
            <Icon size={24} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
            <span style={{ fontSize: 11, letterSpacing: "0.02em", fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)" }}>{t.label}</span>
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
  // 親タブ「振り返り」「AI」内のサブタブ。
  // 入口は常に固定（永続化しない）: 振り返り＝🎯行動 / AI＝🔍AI選書。
  // 直前に見ていたサブタブ（ノート / マイ読書脳など）に毎回飛ぶと「タブを
  // 押したのに違うものが出る」分かりにくさになるため、毎回の起点を一定にする。
  // 個別画面への明示遷移（想起ディープリンク等）は setReviewSubTab/setAiSubTab で上書きする。
  const [reviewSubTab, setReviewSubTab] = useState('action');
  const [aiSubTab, setAiSubTab] = useState('advisor');

  // 下部ナビでタブを切り替えるときの共通処理。同一セッション内で前回見ていた
  // サブタブが状態に残っていても、入口を「振り返り＝行動 / AI＝AI選書」に
  // 必ずリセットしてから切り替える（タブを押すたびに起点が一定になる）。
  const navigateTab = (t) => {
    // 既にアクティブなタブの再タップではサブタブをリセットしない —
    // リセットするとサブ画面（🧠 マイ読書脳等）がアンマウントされ、
    // 入力中の質問ドラフトが黙って消える。入口リセットは「別のタブから
    // 切り替えてきた時」だけの仕事。
    if (t === tab) return;
    if (t === 'review') setReviewSubTab('action');
    else if (t === 'ai') setAiSubTab('advisor');
    setTab(t);
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
  const [current, setCurrent] = useState(null);

  // ── 画面復帰（iOS PWA リロード対策）─────────────────────────────────
  // バックグラウンドでメモリから落とされると、戻った時にアプリがまるごと
  // リロードされ state が初期化される。タブに加えて「開いていた本/詳細」も
  // 保存し、books 読込後に同じ画面へ戻す。
  // ※ 初回マウントで下の persist effect が navState を上書きする前に、
  //    前回保存値を ref に退避しておく（こうしないと復元前に消える）。
  const initialNavRef = useRef(undefined);
  if (initialNavRef.current === undefined) {
    try { initialNavRef.current = JSON.parse(localStorage.getItem('navState') || 'null'); }
    catch { initialNavRef.current = null; }
  }
  useEffect(() => {
    try { localStorage.setItem('navState', JSON.stringify({ view, bookId: current?.id || null })); }
    catch { /* ignore */ }
  }, [view, current]);
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
  // 詳細画面の「⋯」kebab メニュー位置 (button 近くに表示する)
  const [detailKebab, setDetailKebab] = useState(null);
  const openDetailKebab = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDetailKebab({ x: rect.right - 8, y: rect.bottom + 4 });
  };
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
  // 非同期処理（saveBook の rollback / Undo 等）から「今ユーザーが開いている本」
  // を stale クロージャ無しで判定するための ref。closure の current は数秒前の
  // スナップショットであり、別の本へ移動済みのユーザーの画面を乗っ取る事故の元。
  const currentRef = useRef(null);
  useEffect(() => { currentRef.current = current; }, [current]);

  // 時刻に応じた挨拶 + 名前。1 時間ごとに再評価して開きっぱなしでも
  // スロットラベルがズレないようにする。達成バッジ系の演出は撤去。
  const [greetingTick, setGreetingTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setGreetingTick((n) => n + 1), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  // 「読了グロー」用の 8 秒タイマーは advanceStatus 内で張られるが、その間に
  // アンマウント (ログアウト / サブスク失効で PaywallGate に戻る等) すると
  // unmount 後 setRecentlyDoneId が走って警告になる。アンマウント時に解放する。
  useEffect(() => () => {
    if (recentlyDoneTimerRef.current) clearTimeout(recentlyDoneTimerRef.current);
  }, []);
  const greeting = useMemo(() => buildGreeting(user), [user, greetingTick]);

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
      title: '編集を破棄しますか？',
      message: '保存していない変更があります。移動すると失われます。',
      confirmLabel: '破棄して移動',
      cancelLabel: '編集に戻る',
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
      .then(() => { try { return refreshBooks(); } catch { /* ignore */ } })
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
        saveBook,
        // 保存直前に最新の本へ rebase させる（stale 保存によるユーザー編集の巻き戻し防止）。
        getBook: (id) => booksRef.current.find((b) => b.id === id) || null,
      });
    },
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
  const openAdd = () => {
    // AddBookModal は本棚（view==='list'）の return 枝でのみ描画される。
    // detail / edit ビューからオンボーディング等で呼ばれた場合、view を
    // 戻さないと「押しても何も起きない」袋小路になる（openAdvisor と同形）。
    setView("list");
    setTab("books");
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
      const updated = { ...target, cover: url, coverIsbn: 'manual' };
      const saved = await saveBook(updated);
      const next = saved || updated;
      if (current && current.id === next.id) setCurrent(next);
      toast.success('表紙をアップロードしました');
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
      const updated = { ...book, cover: '', coverIsbn: 'removed' };
      const saved = await saveBook(updated);
      const next = saved || updated;
      if (current && current.id === next.id) setCurrent(next);
      toast.success('表紙を削除しました');
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

      // ── ステップ 2: 最後の手段として通常検索の先頭ヒットの cover
      if (!coverUrl) {
        const flat = await searchBooksAPIFlat(`${book.title || ''} ${book.author || ''}`.trim());
        const hit = (flat || []).find((b) => b.cover);
        if (hit?.cover) coverUrl = ensureHttps(hit.cover);
      }

      if (!coverUrl) {
        toast.dismiss?.(busyToastId);
        // 自動取得が完璧になることはあり得ない → 手動アップロードを促す。
        toast.show({
          type: 'info',
          message: '自動では見つかりませんでした。📷 手動アップロードをお試しください',
          duration: 6000,
          action: { label: 'アップロード', onClick: () => triggerManualCoverUpload(book) },
        });
        return;
      }
      const updated = { ...book, cover: coverUrl, coverIsbn };
      const saved = await saveBook(updated);
      const next = saved || updated;
      if (current && current.id === next.id) setCurrent(next);
      toast.dismiss?.(busyToastId);
      toast.success('表紙を更新しました');
    } catch (e) {
      toast.dismiss?.(busyToastId);
      toast.error(toMessage(e, '表紙の取得に失敗しました'));
    } finally {
      setCoverBusyId(null);
    }
  };

  // From AddBookModal → 手動入力. Skip the search step entirely.
  const openManualFromAdd = (seed) => {
    setAddBookModalOpen(false);
    // 検索モーダルに入力済みのタイトル・著者・ISBN を引き継ぐ。
    // 「このまま手動で追加する」の文言どおり、打ち直しをさせない。
    setForm({
      ...emptyBook(),
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
  const openDetail = useCallback((b) => { setCurrent(b); setEditPhaseOverride(null); setView("detail"); }, []);

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
  // タブは 'activeTab' で別途復元済み。詳細/編集だった時のみ、その本を開き直す
  // （編集は未保存フォームが失われているので detail に着地させる）。本が削除済み
  // なら何もしない（一覧のまま）。想起ディープリンク処理中はそちらに譲る。
  useEffect(() => {
    if (navRestoredRef.current || booksLoading) return;
    navRestoredRef.current = true;
    if (pendingRecallMemoId) return;
    const nav = initialNavRef.current;
    if (nav && (nav.view === 'detail' || nav.view === 'edit') && nav.bookId) {
      const b = rawBooks.find((x) => x.id === nav.bookId);
      if (b) openDetail(b);
    }
  }, [booksLoading, pendingRecallMemoId, rawBooks, openDetail]);

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
  const goList = () => { setView("list"); setCurrent(null); setEditPhaseOverride(null); };

  // 同じ本が既に本棚にあれば true を返す。ダイアログを出して「📖 既存の本を見る」
  // が押されたらその詳細へジャンプ。呼び出し側はこの戻り値が true なら追加処理
  // をスキップする。
  const handleDuplicateGate = async (candidate) => {
    const existing = findDuplicateBook(books, candidate);
    if (!existing) return false;
    const statusLabel = STATUS_LABEL[existing.status] || '本棚';
    const ok = await confirm({
      title: 'この本は既に本棚にあります',
      message: `「${existing.title}」は ${statusLabel} として登録済みです。`,
      confirmLabel: '📖 既存の本を見る',
      cancelLabel: '← 戻る',
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
                message: '📷 表紙が見つかりませんでした。手動アップロードできます',
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
      const isSetupCompletion = !!current
        && form.status === 'before'
        && !!(form.investPurpose && form.investPurpose.trim());

      const payload = { ...form, tags: normalizedTags, cover: resolvedCover, coverIsbn: resolvedCoverIsbn };
      if (isSetupCompletion) {
        payload.status = 'reading';
        if (!payload.startDate) {
          payload.startDate = new Date().toISOString().slice(0, 10);
        }
      }

      const saved = await saveBook(payload);
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
        toast.success('保存しました');
      } else {
        // 既存本の編集を保存したら本詳細へ戻す（フォームに留めて行き止まりにしない）。
        // form は current に同期済みなので、次の一歩（フェーズCTA）が見える。
        setView('detail');
        toast.success('保存しました');
      }
    } catch (error) {
      // DB 側 UNIQUE 制約に弾かれた場合 (= UI チェックを抜けた競合状況) は
      // 専用メッセージで案内。それ以外は通常のエラー。
      if (isUniqueViolation(error)) {
        toast.error('この本は既に本棚にあります');
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
      const merged = { ...prevForm, leverageMemo: text };
      try {
        const saved = await saveBook(merged);
        // saveBook は未接続時に throw せず null を返す。その場合 DB へ書けて
        // いないので、ローカル state を新値で確定すると「保存できたのにリロード
        // で巻き戻る」不整合になる。明示的に失敗として扱い rollback する。
        if (!saved) throw new Error('まとめメモを保存できませんでした。');
        entry.latest = saved;
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

    // 確認ダイアログ経由の削除（undo=false）では、既にユーザーが意思確認済み
    // なので下部の「取消」トーストは出さない（本が消えること自体が手応え）。
    // スワイプ削除（ジェスチャー＝確認なし）のときだけ取消トーストを出す。
    if (!undo) {
      deletionPromise.catch(() => {});
      return;
    }

    const hasPhotos = (snapshot.book_memos || []).some((m) => m.photo_path);
    toast.undo({
      message: hasPhotos
        ? `「${book.title}」を削除しました。\n※写真は復元できません。`
        : `「${book.title}」を削除しました。`,
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
            toast.info('削除を取り消しました');
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
      message: `「${book.title}」のメモ・写真・行動リストもすべて削除されます。`,
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    await performBookDelete(book, { undo: false });
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
      // 4 フィールドが埋まっていれば「読書計画を作成しました」、そうでなければ控えめなトースト。
      const hasPlan = newBook.currentChallenge || newBook.hypothesis || newBook.bookReason;
      const msg = hasPlan
        ? `✅ 「${rec.title}」を追加。AI 読書計画を作成しました`
        : newBook.sourceQuery
          ? `「${rec.title}」を追加。AI 読書計画で読み方戦略を立てましょう`
          : `「${rec.title}」を「読みたい」に追加しました`;
      // 追加直後に「本棚で探し直す」断絶を無くす — トーストから 1 タップで
      // その本の読書計画（投資目的→戦略）へ直行できるようにする（time-to-value）。
      toast.show({
        type: 'success',
        message: msg,
        duration: 6000,
        action: { label: '📖 開く', onClick: () => openSetup(saved) },
      });
      // 表紙取得をバックグラウンドで実行 (await しない)。失敗しても UX に影響なし。
      resolveCoverInBackground(saved);
      // BookAdvisor が advisor_sessions の added_book_ids を更新する用に
      // 保存された本 (UUID 付き) を返す。
      return saved;
    } catch (error) {
      if (isUniqueViolation(error)) {
        toast.error('この本は既に本棚にあります');
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
          // enqueue 時の saved ではなく最新の本に rebase して保存する
          // （stale 保存は差分同期で編集を巻き戻すため）。削除済み・手動
          // アップ済み・既に表紙ありなら触らない。
          const latest = booksRef.current.find((b) => b.id === saved.id);
          if (latest && !latest.cover && latest.coverIsbn !== 'manual' && latest.coverIsbn !== 'removed') {
            await saveBook({ ...latest, cover: url, coverIsbn });
          }
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
    if (newStatus === "before" && !fresh.startDate) patch.startDate = new Date().toISOString().slice(0, 10);
    if (newStatus === "done" && !fresh.doneDate) patch.doneDate = new Date().toISOString().slice(0, 10);
    const updated = { ...fresh, ...patch };

    // Optimistic update。読了・読書開始は「読む体験」の節目なので、編集フォームでは
    // なく本詳細に着地させる（読了の祝福・新バッジが自然な場所で出る／読書中はその場で
    // メモを始められる）。積読(before)は設計シートが主役なので従来どおり編集へ。
    // books state（booksRef 経由の並行操作の読み取り元）にも即時反映する — ここを
    // 更新しないと、保存ラウンドトリップ中の行動トグル等が旧ステータスを読み、
    // その stale UPDATE がステータス変更を DB 上で巻き戻す。
    setCurrent(updated);
    setForm({ ...emptyBook(), ...updated, tags: updated.tags || [], actions: updated.actions || [] });
    setView((newStatus === 'done' || newStatus === 'reading') ? 'detail' : 'edit');
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
        if (currentRef.current?.id === book.id) setView('edit');
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
        if (currentRef.current?.id === book.id) setView('edit');
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
      try { fireConfetti(); } catch { /* non-critical */ }
      try { haptic.success(); } catch { /* non-critical */ }
      // Pick a celebration quote at click time (never at module load).
      const celebrationQuote = getRandomFromCategory('achievement');
      toast.show({
        type: 'success',
        message: `🎉 1 冊読了！お疲れ様でした\n“${celebrationQuote.text}”\n— ${celebrationQuote.author}`,
        duration: 6500,
        action: { label: '取消', onClick: revert },
      });
    } else {
      toast.undo({
        message: `「${labels[newStatus] || newStatus}」に変更しました`,
        onUndo: revert,
      });
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
      `「${book.title}」${book.author ? `（${book.author}）` : ""}`,
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
      toast.success('共有テキストをコピーしました');
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

  const runAnalysis = async () => {
    setAiLoading(true);
    // ストリーミング先の本を固定する。ストリーム中に別の本を開いても、
    // 結果が「その時開いている form」に混入しないようにする。
    const targetId = form?.id;
    const prevAnalysis = form?.aiAnalysis || '';
    // ストリーミング開始前にフィールドをクリア。古い解析結果が残ると
    // onChunk で書き換わるまでに違和感が出る。
    setForm((f) => ({ ...f, aiAnalysis: '' }));
    try {
      await streamClaude({
        system: PROMPTS.bookAnalysis.system,
        cacheSystem: true,
        messages: [{
          role: 'user',
          content: PROMPTS.bookAnalysis.user({
            title: clamp(sanitizeForPrompt(form.title || ''), LIMITS.bookTitle),
            author: clamp(sanitizeForPrompt(form.author || ''), LIMITS.bookAuthor),
          }),
        }],
        max_tokens: 2048,
        model: MODEL_SMART,
        onChunk: (fullText) => {
          setForm((f) => (f && f.id === targetId ? { ...f, aiAnalysis: fullText } : f));
        },
      });
      // 📊 AI 利用の計測（解析が throw せず完了した成功時のみ・feature の enum だけ）。
      track('ai_used', { feature: 'analysis' });
    } catch (error) {
      // 失敗時は元の解析結果に戻す（クリアしたまま保存すると DB の解析が消える）。
      setForm((f) => (f && f.id === targetId ? { ...f, aiAnalysis: prevAnalysis } : f));
      toast.error(toMessage(error, 'AI解析に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };
  const runStrategy = async () => {
    setAiLoading(true);
    const targetId = form?.id;
    const prevStrategy = form?.aiStrategy || '';
    setForm((f) => ({ ...f, aiStrategy: '' }));
    try {
      await streamClaude({
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
        max_tokens: 2048,
        model: MODEL_SMART,
        onChunk: (fullText) => {
          // 関連書籍カードのパース (= 「読みたい」ボタン押下可能) は
          // streaming 中は BeforePhase 側で aiLoading を見て無効化している。
          // MarkdownSections は 1 chunk ごとに再 render する形になるが、
          // テキスト量は 2KB 以下で十分軽い。
          setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: fullText } : f));
        },
      });
      // Fresh generation invalidates any prior 修正リクエスト history.
      if (targetId) clearStrategyHistory(targetId);
    } catch (error) {
      // 失敗時は元の計画シートに戻す（クリアしたまま保存すると DB のシートが消える）。
      setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: prevStrategy } : f));
      toast.error(toMessage(error, 'AI戦略の生成に失敗しました。'));
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
        max_tokens: 2048,
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
      toast.success('✓ 読書計画シートを修正しました');
    } catch (error) {
      // ストリーミング失敗時は元のシートを戻す (undo 履歴は触らない)。
      setForm((f) => (f && f.id === targetId ? { ...f, aiStrategy: prev } : f));
      toast.error(toMessage(error, '読書計画シートの修正に失敗しました。'));
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
    toast.info('ひとつ前の読書計画シートに戻しました');
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
        toast.success(`「${trimmedTitle}」を読みたいに追加しました`);
      } catch (error) {
        // 失敗時は UI rollback してエラー表示
        setAddedRelatedTitles((prev) => {
          const next = new Set(prev);
          next.delete(trimmedTitle);
          return next;
        });
        if (isUniqueViolation(error)) {
          toast.error('この本は既に本棚にあります');
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
    const bookNow = booksRef.current.find((b) => b.id === bookId);
    const targetAction = bookNow?.actions?.[actionIdx] || null;
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
        toast.success(`完了 ✓ ${label}の予定を自動で組みました`);
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
  const addActionFromMemo = async (bookId, { text, sourceMemoId = null, sourcePage = null }) => {
    const body = (text || '').trim();
    if (!body) return false;
    if (!booksRef.current.find((b) => b.id === bookId)) return false;
    const newAction = {
      text: body.slice(0, LIMITS.actionText || 500),
      deadline: '',
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
      toast.success('🎯 行動を追加しました');
      return true;
    } catch (error) {
      toast.error(toMessage(error, '行動の追加に失敗しました。'));
      return false;
    }
  };

  // 📊→♾️ 本の学び分析を ai_summary に保存して全体に還流させる（複利）。
  // gatherKnowledge が ai_summary を読む → マイ読書脳 / テーマまとめ / 🕰足あと、
  // 振り返りの想起ノート(ai_summary synth)にも自動で乗る。編集中フォームにも反映。
  const persistBookLearning = async (text) => {
    const body = (text || '').trim();
    if (!form?.id || !body) return false;
    const bookId = form.id;
    const clamped = clamp(body, LIMITS.memoText);
    setForm((f) => ({ ...f, aiSummary: clamped }));
    // 直列化チェーンに乗せ、実行時点の最新行に rebase して aiSummary だけ
    // 差し替える（stale スナップショットの全行保存は並行トグルを巻き戻す）。
    try {
      await enqueueBookMutation(bookId, async (entry) => {
        const base = entry.latest || booksRef.current.find((b) => b.id === bookId) || form;
        const saved = await saveBook({ ...base, aiSummary: clamped });
        if (saved) entry.latest = saved;
      });
      return true;
    } catch (error) {
      toast.error(toMessage(error, '保存に失敗しました。'));
      return false;
    }
  };

  const toggleAction = async (bookId, actionIdx) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    const target = (book.actions || [])[actionIdx];
    if (!target) return;
    // 旧実装は「完了化」時に振り返りモーダル (✅ 完了おめでとうございます!)
    // を挟んでいたが、毎回フリクションを増やしていたため撤去。タップ即完了 /
    // 即未完了戻しの軽快操作に統一。reflection は ActionEditModal から
    // いつでも編集可能。
    await applyActionToggle(bookId, actionIdx);
  };

  const deleteActionFromBook = async (bookId, actionIdx, { skipConfirm = false } = {}) => {
    // ⋮ → 削除は誤タップし得る明示メニュー操作なので、規約どおり確認を挟む
    // （スワイプ削除＝ジェスチャー意図は確認なし + Undo、と役割分担）。
    // ActionEditModal 経由はモーダル側で確認済みなので skipConfirm で二重確認を避ける。
    if (!skipConfirm) {
      const ok = await confirm({
        title: '行動を削除しますか？',
        message: 'この行動（期限・振り返り含む）を完全に削除します。元に戻せません。',
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        danger: true,
      });
      if (!ok) return;
    }
    // トグルと同じ本ごとの直列化チェーンに乗せる。並行の saveBook（トグル進行中）
    // と競合すると、削除した行動が stale upsert で復活し得るため。
    // 対象行の身元を今掴む（index は実行時に再解決 — 行数がずれても別の行を消さない）。
    const delTarget = (booksRef.current.find((b) => b.id === bookId)?.actions || [])[actionIdx] || null;
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
        toast.success('行動を削除しました');
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
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (minRating > 0 ? 1 : 0) + tagFilter.length;
  const clearAllFilters = () => { setStatusFilter('all'); setMinRating(0); setTagFilter([]); };

  const recentBooks = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const seen = new Set();
    const out = [];
    // 1) 「読書中」の本を最優先（＝続きから読む主対象。最終更新の新しい順）。
    //    冊数が少ない新規でも、読みかけが1冊あれば必ず出すことで「続きから」が機能する。
    books
      .filter((b) => b.status === 'reading')
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
      .forEach((b) => { if (b?.id && !seen.has(b.id)) { seen.add(b.id); out.push(b); } });
    // 2) 直近7日に更新した本で補完。
    books
      .filter((b) => {
        const stamp = b.updated_at ? Date.parse(b.updated_at) : NaN;
        return Number.isFinite(stamp) && stamp >= cutoff;
      })
      .forEach((b) => { if (b?.id && !seen.has(b.id)) { seen.add(b.id); out.push(b); } });
    return out.slice(0, 3);
  }, [books]);

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

  // ===== DETAIL =====
  if (view === "detail" && current) {
    const st = getSt(current.status);
    const nextStatus = { want: "before", before: "reading", reading: "done" };
    const nextLabel = { want: "📐 積読へ進む", before: "📖 読書を開始する", reading: "✅ 読了にする" };

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
            padding: "20px 20px 80px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {/* iOS ナビ風: 指が最初に探す左上の戻るは、背景に沈まない重みで。 */}
            <button onClick={goList} style={{ ...lnk, color: "var(--c-brand)", fontSize: 15, fontWeight: 600 }}>
              ‹ {tab === 'review' ? '振り返り' : tab === 'ai' ? 'AI' : '本棚'}
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={openHelp}
                style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--c-ink-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                aria-label="この画面のヘルプを見る"
                title="ヘルプ"
              >
                <HelpCircle size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {/* ⋯ kebab — 編集 / 共有 / 削除 を集約。下部の 3 ボタン廃止。 */}
              <button
                onClick={openDetailKebab}
                style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--c-brand)", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 20, fontWeight: 700 }}
                aria-label="その他の操作"
                title="その他"
              >
                ⋯
              </button>
            </div>
          </div>

          {/* Book header */}
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            {/* 表紙ブロックは cover 有無に関わらず常に表示。
                cover が無い時はプレースホルダ + 「取り直す」「違う?」を案内。
                旧実装は cover && (...) で全体を隠していたため、表紙が無い本では
                取り直しボタンに辿り着けなかった (⋯ メニューを開く必要があった)。 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              {current.cover ? (
                <img src={ensureHttps(current.cover)} alt="" style={{ width: 60, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid var(--c-hairline-strong)" }} />
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    width: 60,
                    height: 84,
                    borderRadius: 6,
                    border: '1px dashed var(--c-hairline-strong)',
                    background: 'var(--c-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    color: 'var(--c-ink-2)',
                  }}
                >
                  📚
                </div>
              )}
              {/* 表紙の出典 (ISBN)。manual アップロード済みは表示しない。 */}
              {current.coverIsbn && current.coverIsbn !== 'manual' && (
                <span style={{ fontSize: 9, color: 'var(--c-ink-2)', whiteSpace: 'nowrap' }}>
                  ISBN: {current.coverIsbn}
                </span>
              )}
              {/* 表紙関連の 2 アクション。常時可視で「⋯ メニューに埋もれて
                  見つけにくい」問題を解消。「取り直す」は同じ ISBN で再 fetch、
                  「違う?」は別エディション候補から選び直し or 手動 upload。 */}
              {/* タップ領域: 見た目は小さな text link のまま、padding で
                  実効ヒットを広げる（隣接誤タップ防止のため gap も確保）。 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start', marginTop: 2 }}>
                <button
                  type="button"
                  onClick={() => refreshCoverFor(current)}
                  disabled={coverBusyId === current.id}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 4px',
                    margin: '-6px 0 -6px -4px',
                    minHeight: 32,
                    fontSize: 10,
                    color: '#5C4A2E',
                    cursor: coverBusyId === current.id ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    textDecoration: 'underline',
                    fontWeight: 600,
                    opacity: coverBusyId === current.id ? 0.6 : 1,
                  }}
                >
                  {coverBusyId === current.id ? '⏳ 取得中…' : '🔄 表紙を取り直す'}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverFixForBook(current)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 4px',
                    margin: '-6px 0 -6px -4px',
                    minHeight: 32,
                    fontSize: 10,
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textDecoration: 'underline',
                  }}
                >
                  表紙が違う？
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 書名＝この画面の主役。本文サイズ(17/500)だと .btn と同格に埋もれる。
                  20px/bold で立て、著者は ink-3 に沈めて二段階の階層を作る。 */}
              <h2 style={{ fontSize: "var(--type-title-3)", fontWeight: 700, color: "var(--c-ink)", lineHeight: 1.25, letterSpacing: "-0.01em", margin: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{current.title}</h2>
              {current.author && <p style={{ fontSize: 13, color: "var(--c-ink-3)", margin: "var(--space-1) 0 0" }}>{current.author}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "var(--space-2)", flexWrap: "wrap" }}>
                <StatusBadge status={current.status} />
                {current.rating > 0 && <Stars r={current.rating} size={13} />}
              </div>
            </div>
          </div>

          {current.tags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
              {current.tags.map((t, i) => (<span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--c-soft-2)", color: "var(--c-ink-2)" }}>#{t}</span>))}
            </div>
          )}

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
                return (
                  <div
                    style={{
                      marginTop: 16,
                      padding: '20px 18px',
                      borderRadius: 16,
                      background: 'var(--c-brand)',
                      color: 'var(--c-card)',
                      textAlign: 'center',
                      boxShadow: '0 6px 18px rgba(92, 74, 46, 0.22)',
                    }}
                  >
                    <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 6 }}>📋</div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>
                      AI 読書計画を完了しよう
                    </h3>
                    <p style={{ margin: '8px 0 14px', fontSize: 12, lineHeight: 1.6, opacity: 0.92 }}>
                      投資目的を明確にすると、AI があなた専用の読み方戦略を提案します
                    </p>
                    <button
                      type="button"
                      onClick={() => openSetup(current)}
                      style={{
                        background: 'var(--c-card)',
                        color: '#5C4A2E',
                        padding: '11px 22px',
                        borderRadius: 999,
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        minHeight: 44,
                      }}
                    >
                      📋 読書計画を始める →
                    </button>
                  </div>
                );
              }
              // 完了済み: 控えめな完了表示 + 編集導線
              return (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--color-success-soft, #eaf5e3)',
                    border: '1px solid #b9d4a3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <p style={{ fontSize: 12, color: '#4a6e3a', margin: 0, fontWeight: 600 }}>
                    ✅ AI 読書計画 完了
                  </p>
                  <button
                    type="button"
                    onClick={() => openSetup(current)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #b9d4a3',
                      background: 'transparent',
                      color: '#4a6e3a',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    編集する
                  </button>
                </div>
              );
            }

            if (current.status === 'reading' && isIncomplete) {
              return (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'var(--color-warning-soft, var(--color-warning-soft))',
                    border: '1px solid #e0c878',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <p style={{ fontSize: 13, color: '#8a6010', margin: 0, fontWeight: 600 }}>
                    ⚠️ 読書計画が未完了です
                  </p>
                  <p style={{ fontSize: 11, color: '#9a7030', margin: 0, lineHeight: 1.6 }}>
                    投資目的・AI 解析・読書計画シートをいま埋めると、投資対効果が最大化されます。
                  </p>
                  <button
                    type="button"
                    onClick={() => openSetup(current)}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--color-accent)',
                      color: 'var(--c-card)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    📋 読書計画を完了する
                  </button>
                </div>
              );
            }

            return null;
          })()}

          {/* Phase-specific content */}
          {current.startDate && <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginTop: 10 }}>📅 開始: {current.startDate}</p>}
          {current.doneDate && <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginTop: 2 }}>📅 完了: {current.doneDate}</p>}

          {current.investPurpose && <Card label="目的・課題・仮説" text={current.investPurpose} />}

          {/* AI 出力（解析 / 読書計画シート）はデフォルト折りたたみ。
              スクロール量を圧縮し、必要な時に展開する。 */}
          {(current.aiAnalysis || current.aiStrategy) && (
            <details style={{ marginTop: 12, background: "var(--c-card)", border: "1px solid var(--c-hairline)", borderRadius: 10, padding: "10px 12px" }}>
              <summary style={{ fontSize: 13, fontWeight: 600, color: "var(--c-brand)", cursor: "pointer", listStyle: "none" }}>
                <IcBot size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
                AI 解析 / 読書計画
              </summary>
              {current.aiAnalysis && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent)", marginBottom: 6 }}><IcSearch size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />AI 本の解析</p>
                  <MarkdownSections
                    text={current.aiAnalysis}
                    onAddRelatedBook={addRelatedBookFromAi}
                    addingTitles={addedRelatedTitles}
                  />
                </div>
              )}
              {current.aiStrategy && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent)", marginBottom: 6 }}><IcMap size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読書計画シート</p>
                  <MarkdownSections
                    text={current.aiStrategy}
                    onAddRelatedBook={addRelatedBookFromAi}
                    addingTitles={addedRelatedTitles}
                  />
                </div>
              )}
            </details>
          )}

          {/* 📖 進捗バー（ページ）は撤去（本田哲学=作業量より成果。ROI は行動で測る）。 */}

          {(current.status === "reading" || current.status === "done") ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent)", marginBottom: 6 }}><IcNote size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />まとめメモ</p>
              <BookMemoList
                bookId={current.id}
                bookTitle={current.title}
                bookAuthor={current.author || ""}
                summaryText={current.leverageMemo || ""}
                onSaveSummary={handleSaveSummaryFromCurrent}
                onMakeAction={addActionFromMemo}
              />
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                padding: "14px 16px",
                background: "var(--c-card)",
                border: "1px dashed var(--c-hairline-strong)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--c-ink-2)",
                lineHeight: 1.7,
              }}
            >
              {current.status === "want"
                ? "📚 「読書中」にすると、＋ボタンからメモを追加できるようになります。"
                : "🎯 今は投資戦略を立てる段階です。「読書中」にすると、＋ボタンからメモを追加できます。"}
            </div>
          )}
          {current.aiSummary && (
            <details style={{ marginTop: 12, background: "var(--c-card)", border: "1px solid var(--c-hairline)", borderRadius: 10, padding: "10px 12px" }}>
              <summary style={{ fontSize: 13, fontWeight: 600, color: "#5a7a48", cursor: "pointer", listStyle: "none" }}>
                🤖 AI まとめ（要点の凝縮）
              </summary>
              <div style={{ marginTop: 10 }}>
                <MarkdownSections
                  text={current.aiSummary}
                  onAddRelatedBook={addRelatedBookFromAi}
                  addingTitles={addedRelatedTitles}
                />
              </div>
            </details>
          )}

          {(current.actions || []).filter((a) => a.text?.trim()).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent)", marginBottom: 6 }}>⚡ 行動リスト</p>
              {/* その場で完了できる（読み取り専用だと行動タブへの往復を強制する）。
                  filter だと index がズレるので生 index で回す。 */}
              {current.actions.map((a, i) => (a.text?.trim() ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleAction(current.id, i)}
                  aria-label={a.done ? `「${a.text}」を未完了に戻す` : `「${a.text}」を完了にする`}
                  style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", width: "100%", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}
                >
                  <span style={{ fontSize: 16 }} aria-hidden="true">{a.done ? "✅" : "⬜"}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: a.done ? "#9a8e7a" : "#4a4036", textDecoration: a.done ? "line-through" : "none", margin: 0, wordBreak: "break-word" }}>{a.text}</p>
                    {a.deadline && <p style={{ fontSize: 10, color: "#b5aa96", margin: 0 }}>📅 {a.deadline}</p>}
                  </div>
                </button>
              ) : null))}
            </div>
          )}

          {current.roiSummary && <Card label={<><IcBulb size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />一番の収穫</>} text={current.roiSummary} bg="var(--c-soft)" />}

          {/* 💡 読了直後の「一番の収穫」導線 — 感情のピークで 1 行の言語化を促す
              （レバレッジ読書の核心。未記入のときだけ出る＝書けば消える）。 */}
          {current.status === 'done' && !(current.roiSummary || '').trim() && (
            <button
              type="button"
              onClick={() => openEdit(current)}
              style={{
                marginTop: 16, width: '100%', padding: '16px 18px', borderRadius: 16,
                background: 'var(--c-brand)', color: 'var(--c-card)', border: 'none',
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 12, minHeight: 44,
                boxShadow: '0 6px 18px rgba(92,74,46,0.22)',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1 }}>💡</span>
              <span>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>一番の収穫を1行だけ残す</span>
                <span style={{ display: 'block', fontSize: 12, opacity: 0.9, marginTop: 3, lineHeight: 1.5 }}>
                  この本で得た価値を1行にすると、振り返りで確実に思い出せます
                </span>
              </span>
            </button>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {nextStatus[current.status] && (
              <>
                <button
                  onClick={async () => {
                    if (current.status === 'before') {
                      // 🎯 投資目的は必須（本田哲学=「目的なき読書はしない」）。
                      // 1 行も無いまま読書中へは進ませない＝設定画面へ誘導。
                      if (!current.investPurpose || !current.investPurpose.trim()) {
                        const ok = await confirm({
                          title: '読む前に、投資目的を決めましょう',
                          message:
                            'この本を「何のために読むか」を 1 行だけでも決めると、読書の精度とリターンが大きく変わります。目的なき読書は、もったいない。',
                          confirmLabel: '投資目的を入力する',
                          cancelLabel: '閉じる',
                        });
                        // 「閉じる」を押したら遷移しない（強制連行を防ぐ）。
                        if (ok) openSetup(current);
                        return;
                      }
                      // 投資目的はあるが AI 解析・読書計画が未完了 → 任意なので警告のみ。
                      if (!current.aiAnalysis || !current.aiStrategy) {
                        const ok = await confirm({
                          title: '読書計画を作っておきますか？',
                          message:
                            'AI 解析・読書計画シートが未作成です。作っておくと「どの 20% を読むか」が分かり、投資対効果が上がります（任意）。',
                          confirmLabel: 'このまま読書を開始',
                          cancelLabel: '読書計画を作る',
                        });
                        if (!ok) {
                          openSetup(current);
                          return;
                        }
                      }
                    }
                    advanceStatus(current, nextStatus[current.status]);
                  }}
                  // 色は「遷移先」のステータス色（押すとどうなるかの予告）。
                  // 現在色だと「✅ 読了にする」が読書中の青で出て予感が湧かない。
                  style={{ ...btnS, width: "100%", background: getSt(nextStatus[current.status]).color }}
                >
                  {nextLabel[current.status]}
                </button>
                {/* Phase 3: その場のガイダンス — 何が起きるか先に伝えて遷移を温かく */}
                <p className="input-hint" style={{ marginTop: 0, justifyContent: 'center' }}>
                  {current.status === 'want'
                    ? '💡 投資戦略を立てると、AI が読書計画シートを自動生成します'
                    : current.status === 'before'
                    ? '💡 読書中になると、メモ機能が解放されます'
                    : '💡 完了後、振り返りと「一番の収穫」を残せます'}
                </p>
              </>
            )}
            {/* 購入導線は「まだ買っていない可能性が高い」want / before だけ主役。
                reading / done で全幅オレンジが最強の視覚要素になるのは、収穫・
                行動が主役であるべき画面の佇まいを崩す（本田哲学）。 */}
            {/* 購入導線: Amazon + 楽天ブックスの両方を出す（統一）。want/before は
                買う導線を主役に全幅ボタン、reading/done は控えめな横並びリンク。 */}
            {(current.status === 'want' || current.status === 'before') ? (
              <BookStoreLinks book={current} variant="cta" buy />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <BookStoreLinks book={current} variant="compact" />
              </div>
            )}
            {/* 編集 / 共有 / 削除 は上部 ⋯ kebab に集約。下部のボタン群は撤去。 */}
            {/* 本棚に戻る — 上部 ← 一覧 が text link で目立たないため、
                どのフェーズの本詳細でも下部に大きめの secondary ボタンで提供。
                スクロールで上に戻らずに本棚へ帰れる。 */}
            <button
              type="button"
              onClick={goList}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                border: "1px solid var(--c-hairline-strong)",
                borderRadius: 14,
                color: "var(--c-brand)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                marginTop: 16,
                minHeight: 44,
              }}
            >
              {tab === 'review' ? '← 振り返りに戻る' : tab === 'ai' ? '← AI に戻る' : '← 本棚に戻る'}
            </button>
          </div>
        </div>

        {/* Floating "+ memo" FAB — only for reading/done so we don't lure
            users into creating memos that the section above hides. */}
        {(current.status === "reading" || current.status === "done") && (
          <button
            type="button"
            onClick={() => setQuickMemoOpen(true)}
            aria-label="クイックメモを追加"
            style={{
              position: "fixed",
              right: "var(--space-5)",
              bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
              width: 56,
              height: 56,
              borderRadius: "var(--radius-full)",
              border: "none",
              background: "var(--color-accent-strong)",
              color: "var(--color-text-inverse)",
              fontSize: 26,
              fontWeight: 300,
              lineHeight: 1,
              cursor: "pointer",
              // ブランド色で色付けした、やわらかく上質な浮遊シャドウ。
              boxShadow: "0 6px 18px rgba(93, 74, 40, 0.30), 0 2px 6px rgba(93, 74, 40, 0.18)",
              // メモ編集(300)・写真拡大(400)等のオーバーレイより下に置く
              // （600 だと全画面エディタの上に ＋ が浮いてしまう）。
              zIndex: 100,
              fontFamily: "inherit",
            }}
          >
            ＋
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
                await currentMemoOps.createMemo(payload);
                // 保存確定の手応え（カード式エディタ経由と体験を揃える）。
                haptic.success();
                toast.success('メモを保存しました');
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
              toast.success('メモを保存しました');
            }}
            onUpdate={async (memoId, payload) => {
              await currentMemoOps.updateMemo(memoId, payload);
              haptic.success();
              toast.success('メモを更新しました');
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
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={openAdd} onStartAdvisor={openAdvisor} />}

        {detailKebab && (
          <ContextMenu
            x={detailKebab.x}
            y={detailKebab.y}
            onClose={() => setDetailKebab(null)}
            items={[
              { label: '編集', icon: '✏️', onClick: () => openEdit(current) },
              // 📋 AI 読書計画は before / reading / done のどこからでも
              // 仕切り直せる。want は本格的な読書計画前なので除外。
              ...(current.status !== 'want'
                ? [{
                    label: 'AI 読書計画を編集',
                    icon: '📋',
                    onClick: () => openSetup(current),
                  }]
                : []),
              ...(current.status === 'reading' || current.status === 'done'
                ? [{
                    label: '積読に戻す',
                    icon: '📚',
                    onClick: async () => {
                      const ok = await confirm({
                        title: '積読に戻しますか？',
                        message: 'ステータスを「積読」に戻します。メモや行動などのデータは保持されます。',
                        confirmLabel: '戻す',
                        cancelLabel: 'キャンセル',
                      });
                      if (!ok) return;
                      advanceStatus(current, 'before');
                    },
                  }]
                : []),
              { label: '表紙を取り直す', icon: '🔄', onClick: () => refreshCoverFor(current) },
              { label: '表紙を手動でアップロード', icon: '🖼', onClick: () => triggerManualCoverUpload(current) },
              ...(current.cover ? [{ label: '表紙を削除', icon: '🗑', onClick: () => removeCoverFor(current) }] : []),
              { label: '共有', icon: '📤', onClick: () => shareBook(current) },
              { label: '削除', icon: '🗑️', destructive: true, onClick: () => requestDeleteBook(current) },
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
            onPick={async ({ cover, coverIsbn }) => {
              const updated = { ...coverFixForBook, cover, coverIsbn };
              setCurrent((c) => (c && c.id === updated.id ? { ...c, cover, coverIsbn } : c));
              try {
                const saved = await saveBook(updated);
                const next = saved || updated;
                setCurrent((c) => (c && c.id === next.id ? next : c));
                toast.success('表紙を更新しました');
              } catch (error) {
                // eslint-disable-next-line no-console
                console.error('[cover-modal] DB update failed:', error);
                toast.error(toMessage(error, '表紙の更新に失敗しました。'));
              }
            }}
            onManualUpload={() => triggerManualCoverUpload(coverFixForBook)}
          />
          </Suspense>
        )}

        <BottomNav tab={tab} setTab={(t) => { navigateTab(t); goList(); }} hidden={keyboardOpen} />
      </Shell>
    );
  }

  // ===== EDIT (renders different phase based on status) =====
  if (view === "edit") {
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
            padding: "20px 20px 80px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={async () => {
                if (!(await confirmDiscardEdit())) return;
                if (current) { setEditPhaseOverride(null); setView("detail"); }
                else goList();
              }}
              style={lnk}
            >← 戻る</button>
            <button
              onClick={openHelp}
              style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--c-ink-2)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
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
              : effectivePhase === "before" ? "投資設計"
              : effectivePhase === "reading" ? "読書中"
              : "投資回収";
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 16 }}>
                  <StatusBadge status={form.status} />
                  <h2 style={{ fontSize: 17, fontWeight: 500, color: "var(--c-ink)" }}>{phaseLabel}</h2>
                  {editPhaseOverride && editPhaseOverride !== form.status && (
                    <span style={{ fontSize: 11, color: 'var(--color-tertiary)' }}>
                      （読書計画を仕切り直し中）
                    </span>
                  )}
                </div>

                {(effectivePhase === "want" || !current) && (
                  <WantPhase form={form} setForm={setForm} onSave={handleSave} onSearchOpen={() => setSearchOpen(true)} allTags={allTags} allFolders={folderNames} />
                )}
                {effectivePhase === "before" && current && (
                  <BeforePhase
                    form={form}
                    setForm={setForm}
                    onSave={handleSave}
                    aiLoading={aiLoading}
                    onRunAnalysis={runAnalysis}
                    onRunStrategy={runStrategy}
                    onRunStrategyEdit={runStrategyEdit}
                    onUndoStrategy={undoStrategy}
                    hasStrategyHistory={
                      strategyHistoryTick >= 0 && hasStrategyHistory(form?.id)
                    }
                    onAddRelatedBook={addRelatedBookFromAi}
                    addingTitles={addedRelatedTitles}
                  />
                )}
                {effectivePhase === "reading" && current && (
                  <ReadingPhase form={form} setForm={setForm} onSave={handleSave} onSaveSummary={handleSaveSummaryFromForm} onPersistAnalysis={persistBookLearning} onMakeAction={addActionFromMemo} allTags={allTags} allFolders={folderNames} />
                )}
                {effectivePhase === "done" && current && (
                  <DonePhase form={form} setForm={setForm} onSave={handleSave} onPersistAnalysis={persistBookLearning} allTags={allTags} allFolders={folderNames} />
                )}
              </>
            );
          })()}
        </div>

        <Modal open={searchOpen} onClose={() => { setSearchOpen(false); setSearchInitialQuery(''); setSearchInitialAuthor(''); setSearchInitialIsbn(''); }}>
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
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={openAdd} onStartAdvisor={openAdvisor} />}
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
          hidden={keyboardOpen}
        />
      </Shell>
    );
  }

  // ===== TAB CONTENT =====
  return (
    <Shell>
   <header
     style={{
       flexShrink: 0,
       padding: "max(env(safe-area-inset-top, 6px), 6px) 14px 4px",
       minHeight: 36,
       display: "flex",
       justifyContent: "space-between",
       alignItems: "center",
       gap: 6,
       /* ページ（クリーム）と同色にして上部を一体化（iOS ナビバー流儀）。
          白いカードが下で浮く構図になる。 */
       background: "var(--color-bg, var(--color-bg))",
     }}
   >
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
      <button
        type="button"
        {...logoLongPress.bind}
        aria-label="ロゴ（長押しで開発者からのメッセージ）"
        style={{
          lineHeight: 0,
          padding: 2,
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
          style={{ borderRadius: 7, display: "block", boxShadow: "0 1px 2px rgba(60,48,30,0.12)" }}
        />
      </button>
      {/* 挨拶は最初の数秒だけ表示してフェードアウト。ヘッダーの上下余白を
          食わないよう font 11px + 上下 0 の inline テキストに留める。 */}
      <span
        style={{
          fontSize: 11,
          color: "var(--color-tertiary)",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "60vw",
          animation: "lvg-greeting-fade 4s var(--ease-out, ease) forwards",
          willChange: "opacity",
        }}
      >
        <span aria-hidden="true" style={{ marginRight: 3 }}>{greeting.emoji}</span>
        {greeting.text}
      </span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={openHelp}
        style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--c-ink-2)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        aria-label="この画面のヘルプを開く"
        title="ヘルプ"
      >
        <HelpCircle size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 999, color: "var(--c-ink-2)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        aria-label="アカウント設定を開く"
        title="設定"
      >
        <SettingsIcon size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  </header>

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
        {tab === "books" && (
          <PullToRefresh onRefresh={async () => { await refreshBooks(); haptic.light(); }}>
            <div
              style={{
                padding: "10px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                borderTop: "1px solid #e8e2d6",
                position: "sticky",
                top: 0,
                background: "var(--color-bg, var(--color-bg))",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                  <IcSearch size={17} aria-hidden="true" style={{ position: "absolute", left: 13, color: "var(--c-ink-3)", pointerEvents: "none" }} />
                  <input
                    type="search"
                    aria-label="本を検索（タイトル・著者・タグ）"
                    placeholder="タイトル・著者・タグで検索"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
                    style={{ ...inp, flex: 1, background: "var(--c-card)", paddingLeft: 38 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={openAdd}
                  aria-label="本を追加"
                  title="本を追加"
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: 12,
                    border: "none",
                    background: "var(--c-brand)",
                    color: "var(--c-card)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(30,25,20,0.18)",
                    fontFamily: "inherit",
                  }}
                >
                  <IcPlus size={22} aria-hidden="true" />
                </button>
              </div>
              {/* フォルダ行 — フォルダが1つ以上あるときだけ出す（新規ユーザーには
                  出ず本棚はスッキリのまま）。横スクロールで切替。 */}
              {folderNames.length > 0 && (
                <div className="lvg-no-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                  <button type="button" onClick={() => setFolderFilter(null)} style={bookshelfToolbarBtn(folderFilter === null)}>
                    すべて <span style={{ opacity: 0.7, fontWeight: 500 }}>{rawBooks.length}</span>
                  </button>
                  {allFolders.map((f) => (
                    <button key={f.name} type="button" onClick={() => setFolderFilter(folderFilter === f.name ? null : f.name)} style={bookshelfToolbarBtn(folderFilter === f.name)}>
                      <IcFolder size={13} aria-hidden="true" />
                      {f.name} <span style={{ opacity: 0.7, fontWeight: 500 }}>{f.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* コンパクトなツールバー — 絞り込み・並びはシートに隠し、本棚を
                  スッキリさせる（本の前に積まれていたピル列＋セレクトを撤去）。 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => setFilterSheetOpen(true)} style={bookshelfToolbarBtn(activeFilterCount > 0)} aria-label="絞り込み">
                    <IcFilter size={15} aria-hidden="true" />
                    絞り込み
                    {activeFilterCount > 0 && <span style={bookshelfToolbarBadge}>{activeFilterCount}</span>}
                  </button>
                  <button type="button" onClick={() => setSortSheetOpen(true)} style={bookshelfToolbarBtn(false)} aria-label="並び替え">
                    <IcSort size={15} aria-hidden="true" />
                    {SORT_LABELS[sortBy] || '並び'}
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--c-ink-2)" }}>
                  <span>{filtered.length} 件</span>
                  <div className="view-mode-switch" role="group" aria-label="表示モード">
                    <button
                      type="button"
                      className={effectiveBookshelfView === 'grid' ? 'active' : ''}
                      onClick={() => setBookshelfViewMode('grid')}
                      aria-label="表紙グリッド表示"
                      title="表紙グリッド"
                    ><IcGrid size={17} aria-hidden="true" /></button>
                    <button
                      type="button"
                      className={effectiveBookshelfView === 'list' ? 'active' : ''}
                      onClick={() => setBookshelfViewMode('list')}
                      aria-label="リスト表示"
                      title="リスト"
                    ><IcList size={17} aria-hidden="true" /></button>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "0 20px" }}>
              {/* 🌱 初週オンボーディング: 新規ユーザーを aha まで運ぶ4ステップ。
                  未完了かつ未 dismiss のときだけ表示（既存ユーザーには出にくい）。 */}
              <ActivationChecklist
                books={books}
                onAddBook={() => setAddBookModalOpen(true)}
                onOpenReview={() => { setReviewSubTab('note'); setTab('review'); }}
              />
              {/* 月次 1 行サマリー: 読了 (今月) / 読書中 (今) / 読書前 (今)
                  タップで振り返りタブへ遷移 — 振り返り導線を強化。 */}
              <BookshelfSummary
                books={books}
                onClick={() => { setReviewSubTab('note'); setTab('review'); }}
              />
              {/* 🔄 今日の想起: 過去メモが 1 枚ふいに戻ってくる控えめなカード。
                  自己完結（fetch / state は HomeRecall 内に閉じる）。
                  メモ十分＋当日未 dismiss のときだけ静かに出る。 */}
              <HomeRecall
                onOpen={(bookId) => {
                  const b = bookId && books.find((x) => x.id === bookId);
                  if (b) { openDetail(b); setTab('books'); }
                  else { setReviewSubTab('note'); setTab('review'); }
                }}
                onAction={({ bookId, text, sourceMemoId }) => addActionFromMemo(bookId, { text, sourceMemoId })}
              />
              {/* 「続きから」はフィルタから独立して出す（本田指摘: 営業本だけ絞っている
                  時こそ読みかけにすぐ戻れるべき）。テキスト検索中だけは検索結果を優先して隠す。 */}
              {recentBooks.length > 0 && !search && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><IcHistory size={13} aria-hidden="true" /> 続きから</p>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                    {recentBooks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => openDetail(b)}
                        style={{
                          flex: "0 0 auto",
                          width: 132,
                          background: "var(--c-card)",
                          border: "1px solid var(--c-hairline)",
                          borderRadius: 10,
                          padding: 10,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {b.cover ? (
                          <img src={ensureHttps(b.cover)} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid var(--c-hairline-strong)" }} />
                        ) : (
                          <div style={{ width: "100%", height: 90, background: "var(--c-soft-2)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📕</div>
                        )}
                        <div style={{ fontSize: 12, color: "var(--c-ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                        <div><StatusBadge status={b.status} /></div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {booksLoading && rawBooks.length === 0 ? (
                effectiveBookshelfView === 'grid' ? (
                  <BookGridSkeleton count={6} />
                ) : (
                  <BookListSkeleton rows={4} />
                )
              ) : filtered.length === 0 ? (
                rawBooks.length === 0 ? (
                  <EmptyState
                    icon={<IcLibrary size={34} aria-hidden="true" />}
                    title="最初の1冊から"
                    description="読んだ気づきが、ここに少しずつ積み上がります。忘れた頃に、振り返りでそっと戻ってきます。"
                    actions={[
                      { label: '本を追加する', onClick: openAdd, variant: 'primary', icon: <IcPlus size={18} aria-hidden="true" /> },
                    ]}
                    tip={(
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <IcSparkles size={15} aria-hidden="true" style={{ color: 'var(--color-accent)' }} />
                        <span>悩みから</span>
                        <button
                          type="button"
                          onClick={() => { setAiSubTab('advisor'); setTab('ai'); }}
                          style={{
                            background: 'none', border: 'none', padding: 0,
                            color: 'var(--color-accent)', fontWeight: 600,
                            borderBottom: '1px solid var(--c-hairline-strong)',
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
                    description="別のキーワードや、フィルタを試してみてください。"
                    actions={[
                      {
                        label: '条件をクリア',
                        onClick: () => { setSearch(''); setFolderFilter(null); clearAllFilters(); },
                        variant: 'primary',
                        icon: <IcRefresh size={18} aria-hidden="true" />,
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
                    />
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                    />
                  ))}
                </div>
              )}
            </div>
          </PullToRefresh>
        )}

        {tab === "review" && (
          <div key={`tab-${tab}`} className="tab-content">
            <div className="sub-tabs" role="tablist" aria-label="振り返りのサブタブ">
              <button
                type="button"
                role="tab"
                aria-selected={reviewSubTab === 'note'}
                className={`sub-tab ${reviewSubTab === 'note' ? 'active' : ''}`}
                onClick={() => setReviewSubTab('note')}
              >
                <IcNote size={15} aria-hidden="true" style={subTabIconStyle} />ノート
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reviewSubTab === 'action'}
                className={`sub-tab ${reviewSubTab === 'action' ? 'active' : ''}`}
                onClick={() => setReviewSubTab('action')}
              >
                <IcTarget size={15} aria-hidden="true" style={subTabIconStyle} />行動
              </button>
            </div>
            {reviewSubTab === 'note' ? (
              <Suspense fallback={<Spinner />}>
                <Review books={books} onOpenBook={(b) => { openDetail(b); }} onAddAction={addActionFromMemo} onAddNote={() => setAddNoteSheet('pick')} onGoToShelf={() => { navigateTab('books'); goList(); }} />
              </Suspense>
            ) : (
              <ActionList
                books={books}
                onToggleAction={toggleAction}
                onDeleteAction={deleteActionFromBook}
                onEditAction={(bookId, actionIdx, action) => setEditingAction({ bookId, actionIdx, action })}
                onOpenBook={(b) => { openDetail(b); }}
                onGoToBooks={() => setTab("books")}
                onAddAction={() => setAddActionSheet({ step: 'pick', prefillText: '' })}
              />
            )}
          </div>
        )}

        {tab === "ai" && (
          <div key={`tab-${tab}`} className="tab-content ai-page">
            <div className="sub-tabs" role="tablist" aria-label="AI のサブタブ" style={{ flexShrink: 0 }}>
              <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'advisor'}
                className={`sub-tab ${aiSubTab === 'advisor' ? 'active' : ''}`}
                onClick={() => setAiSubTab('advisor')}
              >
                <IcSearch size={15} aria-hidden="true" style={subTabIconStyle} />AI 選書
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'brain'}
                className={`sub-tab ${aiSubTab === 'brain' ? 'active' : ''}`}
                onClick={() => setAiSubTab('brain')}
              >
                <IcBrain size={15} aria-hidden="true" style={subTabIconStyle} />マイ読書脳
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'report'}
                className={`sub-tab ${aiSubTab === 'report' ? 'active' : ''}`}
                onClick={() => setAiSubTab('report')}
              >
                <IcRuler size={15} aria-hidden="true" style={subTabIconStyle} />テーマまとめ
              </button>
            </div>
            {/* 独自名のサブタブを初対面でも分かるよう、役割を動詞で先頭に置いて注釈する。
                3 つの違い（選ぶ/聞く/しぼる）を一目で言語化できるようにする。 */}
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '6px 12px 0', lineHeight: 1.6, flexShrink: 0 }}>
              {aiSubTab === 'advisor'
                ? <><strong style={{ color: 'var(--c-ink)' }}>選ぶ</strong> — いまの課題に合う本を、AI が提案します。</>
                : aiSubTab === 'brain'
                ? <><strong style={{ color: 'var(--c-ink)' }}>聞く</strong> — あなたのメモに質問して、答えと「明日の一歩」を得ます。</>
                : <><strong style={{ color: 'var(--c-ink)' }}>しぼる</strong> — テーマの学びを「この1行」と「次の一歩」に凝縮します。</>}
            </p>
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
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<Spinner />}>
                  <MyBookBrain onOpenBook={(b) => { openDetail(b); }} books={books} onAddAction={addActionFromMemo} onBooksMutated={refreshBooks} onAddActionPickBook={(text) => setAddActionSheet({ step: 'pick', prefillText: text })} />
                </Suspense>
              )}
            </div>
          </div>
        )}
      </div>

      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={openAdd} onStartAdvisor={openAdvisor} />}

      {bookContextMenu && (
        <ContextMenu
          x={bookContextMenu.x}
          y={bookContextMenu.y}
          onClose={() => setBookContextMenu(null)}
          items={[
            {
              label: '詳細を開く',
              icon: '📖',
              onClick: () => openDetail(bookContextMenu.book),
            },
            {
              label: '編集',
              icon: '✏️',
              onClick: () => openEdit(bookContextMenu.book),
            },
            // 本棚から直接「表紙を取り直す」できるように追加。本詳細を開かず
            // 1 タップで再 fetch まで完結する (誤表紙への対処を 3 秒以内に)。
            {
              label: '表紙を取り直す',
              icon: '🔄',
              onClick: () => refreshCoverFor(bookContextMenu.book),
            },
            {
              label: '共有',
              icon: '📤',
              onClick: () => shareBook(bookContextMenu.book),
            },
            {
              label: '削除',
              icon: '🗑️',
              destructive: true,
              onClick: () => requestDeleteBook(bookContextMenu.book),
            },
          ]}
        />
      )}

      {settingsOpen && (
        <Suspense fallback={<Spinner />}>
          <AccountSettings
            onClose={() => setSettingsOpen(false)}
            onAfterDelete={() => setSettingsOpen(false)}
            isAdmin={isAdmin}
            onOpenAdmin={() => { setSettingsOpen(false); setAdminOpen(true); }}
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
          onPick={async ({ cover, coverIsbn }) => {
            // 楽観的 UI 更新: saveBook の完了を待たず即座に画面を新しい
            // 表紙に切り替える。saveBook が失敗したら次の fetchBooks で
            // 元の URL に戻るので最終的な整合性は崩れない。
            const updated = { ...coverFixForBook, cover, coverIsbn };
            setCurrent((c) => (c && c.id === updated.id ? { ...c, cover, coverIsbn } : c));
            try {
              const saved = await saveBook(updated);
              const next = saved || updated;
              setCurrent((c) => (c && c.id === next.id ? next : c));
              toast.success('表紙を更新しました');
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('[cover-modal] DB update failed:', error);
              toast.error(toMessage(error, '表紙の更新に失敗しました。'));
            }
          }}
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
            setEditingAction(null);
            // トグル/削除と同じ本ごとの直列化チェーンに乗せる（並行 saveBook との
            // 競合で編集内容が stale 上書きで失われるのを防ぐ）。
            // ⚠️ 対象の身元は「モーダルを開いた時点の action」を使う。保存時に
            // actionIdx で再取得すると、モーダルを開いている間に配列が動いた場合
            // （繰り返しスポーン / 別行削除）に別の行を掴んでしまう。resolveActionIndex は
            // id 優先で解決するので、開いた時点の action オブジェクトを渡すのが正しい。
            const editTarget = openedAction || (booksRef.current.find((b) => b.id === bookId)?.actions || [])[actionIdx] || null;
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
                toast.success('💾 行動を更新しました');
              } catch (error) {
                mutateBookLocal(bookId, () => book);
                entry.latest = book;
                syncActionSnapshots(book);
                toast.error(toMessage(error, '更新に失敗しました'));
              }
            });
          }}
          onDelete={async () => {
            const { bookId, actionIdx } = editingAction;
            setEditingAction(null);
            // モーダル側で確認済み → 二重確認を避ける。
            await deleteActionFromBook(bookId, actionIdx, { skipConfirm: true });
          }}
        />
        </Suspense>
      )}

      {/* 🎯 行動タブ「＋追加」/ 🧠マイ読書脳の行動化フォールバック:
          ① どの本の行動かを選ぶ（読書中→読了→積読→読みたい順）。
          prefillText があれば ② の入力欄に初期表示する（本を解決できなかった
          AI 回答の「明日の一歩」を、本を選んで行動化できるようにする）。 */}
      {addActionSheet?.step === 'pick' && (
        <BottomSheet title="どの本の行動にしますか？" onClose={() => setAddActionSheet(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    minHeight: 52, padding: '8px 10px', borderRadius: 10,
                    border: '1px solid var(--c-hairline)', background: 'var(--c-card)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  {b.cover ? (
                    <img src={ensureHttps(b.cover)} alt="" style={{ width: 26, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 26, height: 36, borderRadius: 4, background: 'var(--c-soft-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                      <IcBook size={14} />
                    </span>
                  )}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--c-ink-2)' }}>{STATUS_LABEL[b.status] || b.status}</span>
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
      {addNoteSheet === 'pick' && (
        <BottomSheet title="どの本のメモにしますか？" onClose={() => setAddNoteSheet(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    minHeight: 52, padding: '8px 10px', borderRadius: 10,
                    border: '1px solid var(--c-hairline)', background: 'var(--c-card)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  {b.cover ? (
                    <img src={ensureHttps(b.cover)} alt="" style={{ width: 26, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 26, height: 36, borderRadius: 4, background: 'var(--c-soft-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                      <IcBook size={14} />
                    </span>
                  )}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--c-ink-2)' }}>{STATUS_LABEL[b.status] || b.status}</span>
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
          footer={(
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={activeFilterCount === 0}
              style={{ width: '100%', minHeight: 44, borderRadius: 11, border: '1px solid var(--c-hairline-strong)', background: 'transparent', color: activeFilterCount === 0 ? 'var(--c-ink-3)' : 'var(--c-critical)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: activeFilterCount === 0 ? 'default' : 'pointer' }}
            >
              条件をクリア{activeFilterCount > 0 ? `（${activeFilterCount}）` : ''}
            </button>
          )}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', margin: '0 0 8px' }}>ステータス</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {[{ key: 'all', label: '全て', count: stats.total }, ...STATUSES.map((s) => ({ key: s.key, label: s.label, count: stats[s.key] || 0 }))].map((s) => {
              const active = statusFilter === s.key;
              return (
                <button key={s.key} type="button" onClick={() => setStatusFilter(s.key)} style={bookshelfToolbarBtn(active)}>
                  {s.label} <span style={{ opacity: 0.7, fontWeight: 500 }}>({s.count})</span>
                </button>
              );
            })}
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', margin: '0 0 8px' }}>評価（その星以上）</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = minRating === n;
              return (
                <button
                  key={n}
                  type="button"
                  // 同じ星をもう一度押すと解除（指定なしに戻す）。
                  onClick={() => setMinRating((cur) => (cur === n ? 0 : n))}
                  style={bookshelfToolbarBtn(active)}
                  aria-label={`★${n} 以上で絞り込む`}
                >
                  <IcStar size={13} aria-hidden="true" />
                  {n}{n < 5 ? '+' : ''}
                </button>
              );
            })}
          </div>

          {availableTags.length > 0 ? (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', margin: '0 0 8px' }}>タグ</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableTags.map((t) => {
                  const active = tagFilter.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTagFilter((arr) => (active ? arr.filter((x) => x !== t) : [...arr, t]))}
                      style={bookshelfToolbarBtn(active)}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', margin: '0 0 8px' }}>タグ</p>
              <p style={{ fontSize: 12, color: 'var(--c-ink-3)', margin: 0, lineHeight: 1.7 }}>
                本を開いて「タグ」欄にキーワード（例: 営業 / 名著 / 再読したい）を付けると、ここでタグ絞り込みができるようになります。
              </p>
            </>
          )}
        </BottomSheet>
      )}

      {/* 本棚: 並びシート */}
      {sortSheetOpen && (
        <BottomSheet title="並び替え" onClose={() => setSortSheetOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(SORT_LABELS).map(([key, label]) => {
              const active = sortBy === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSortBy(key); setSortSheetOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 48, padding: '0 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--c-hairline)', fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', color: active ? 'var(--c-brand)' : 'var(--c-ink)', fontWeight: active ? 700 : 400 }}
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
  const { user, loading } = useAuth();
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
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Dots />
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

// 💳 PaywallGate — Web ハードペイウォール（全機能有料）。
//
// 認証済みユーザーに対して useSubscription で entitlement を確認し、
//   - loading 中           → スピナー（判定が固まるまで本棚を見せない）
//   - isActive            → 通常アプリ（AuthedApp）
//   - !isActive && !loading → 全画面ペイウォール（Paywall）
// を出し分ける。AuthedApp の手前で return ガードするのが肝。
//
// ★ 詰み防止 / fail-open:
//   useSubscription は subscriptions テーブル未適用（schema-error）を
//   「未課金扱い（isActive=false）」ではなく schema-error として握りつぶす実装。
//   そのままだとテーブル未適用環境で全員ロックされて詰む。
//   そこで「テーブル未適用 = 判定不能」のときは fail-open（通す）に倒す。
//   判定は useSubscription が返す error が schema-error かどうかで行う
//   （lib/errors.js の isSchemaError = マイグレーション未適用判定の唯一の真実）。
//   通常運用（テーブルあり・未課金）では error=null なので、ちゃんとロックされる。
//
// ※ 将来 Capacitor（IAP）対応時は、ここで Capacitor.isNativePlatform() を見て
//   native は別の entitlement ソース（RevenueCat 等）に切替える想定。今は Web 専用。
function isSchemaUnappliedError(error) {
  return isSchemaError(error);
}

// 📱 Web 利用者（非管理者）向けの「アプリでご利用ください」ゲート。
// App-only 配信方針（①C: Web は管理者のみ）に基づき、ブラウザでログインした
// 一般ユーザーを App Store へ誘導する。サインアウトで別アカウントへ切替も可能。
function WebAppOnlyGate() {
  const { signOut, user } = useAuth();
  const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL || 'https://apps.apple.com/jp/app/orime';
  return (
    <div
      style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '32px 24px', gap: 16,
        background: 'var(--c-bg, #fdf9f2)', color: 'var(--c-ink, #3d362c)',
      }}
    >
      <div style={{ fontSize: 34 }} aria-hidden="true">📱</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
        Orime は iPhone / iPad アプリでご利用いただけます
      </h1>
      <p style={{ fontSize: 14, color: 'var(--c-ink-2, #6b6155)', margin: 0, lineHeight: 1.8, maxWidth: 360 }}>
        App Store から Orime アプリを入手して、同じアカウントでサインインしてください。
        メモも読書記録もそのまま引き継がれます。
      </p>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 48, padding: '13px 24px', borderRadius: 12,
          background: 'var(--c-brand, #6b5b45)', color: '#fff',
          fontSize: 15, fontWeight: 700, textDecoration: 'none', marginTop: 4,
        }}
      >
        App Store で Orime を入手
      </a>
      <div style={{ marginTop: 8 }}>
        {user?.email && (
          <p style={{ fontSize: 11, color: 'var(--c-ink-3, #9a8f80)', margin: '0 0 6px', wordBreak: 'break-all' }}>
            {user.email} でサインイン中
          </p>
        )}
        <button
          type="button"
          onClick={() => { try { signOut(); } catch { /* ignore */ } }}
          style={{
            background: 'none', border: 'none', color: 'var(--c-ink-3, #9a8f80)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 12px', minHeight: 44,
          }}
        >
          別のアカウントでサインイン
        </button>
      </div>
    </div>
  );
}

function PaywallGate() {
  const { isActive, loading, error, refresh } = useSubscription();

  // 🛰️ 管理者（運営）はペイウォールを素通り。オーナーが課金なしでアプリ／運営
  //    ダッシュボードを使えるようにする。is_app_admin RPC で判定（未適用 DB や
  //    非管理者は false のまま＝通常のペイウォール挙動）。
  const [adminBypass, setAdminBypass] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    // is_app_admin はゲート全体（spinner）を止めるので、決して返らない通信で
    // アプリが永久に固まらないよう 8 秒でタイムアウトして先へ進む（adminBypass は
    // false のまま＝通常のペイウォール/Web ゲート判定に倒れる＝安全側）。
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

  // ペイウォールが実際に表示される条件（判定確定 + 非管理者 + 未課金 + schema 適用済み）。
  const paywallShown = !loading && adminChecked && !adminBypass && !isActive && !isSchemaUnappliedError(error);
  // 📊 ペイウォール露出の計測（転換率の分母）。PII なし・表示時 1 回。
  useEffect(() => { if (paywallShown) track('paywall_viewed'); }, [paywallShown]);

  // 判定が確定するまで（課金 or 管理者）は読み込み表示。管理者チェックを待つ
  // ことでペイウォールが一瞬チラつくのを防ぐ。
  if (loading || !adminChecked) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Dots />
        </div>
      </Shell>
    );
  }

  // ①C: Web(ブラウザ)は管理者のみ利用可。Orime は App Store の iOS アプリでのみ
  //    提供する方針のため、管理者でないブラウザ利用者は（課金の有無・スキーマ状態に
  //    関わらず）アプリへ誘導する。管理者(adminBypass)は検証のためブラウザ利用を許可。
  //    ネイティブ(isNative)は当然すべて通常フロー。
  if (!isNative && !adminBypass) {
    return (
      <Shell>
        <WebAppOnlyGate />
      </Shell>
    );
  }

  // fail-open: 管理者 / 課金中 / subscriptions テーブル未適用 → ロックせず通す。
  if (adminBypass || isActive || isSchemaUnappliedError(error)) {
    return <AuthedApp />;
  }

  return (
    <Shell>
      <Suspense fallback={<Spinner />}>
        <Paywall onPurchased={refresh} />
      </Suspense>
    </Shell>
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
const tagBtnActive = { border: "1.5px solid var(--color-tertiary)", background: "#e8e0d2", color: "var(--color-label)" };
