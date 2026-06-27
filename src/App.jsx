import { useAuth } from './hooks/useAuth';
import { useBooks } from './hooks/useBooks';
import { callClaude, sanitizeForPrompt } from './lib/ai';
import { streamClaude } from './lib/streamClaude';
import { PROMPTS } from './lib/prompts';
import MarkdownSections from './components/MarkdownSections';
import AuthScreen from './components/auth/AuthScreen';
import AuthCallback from './components/auth/AuthCallback';
import BookMemoList from './components/BookMemoList';
import BookMemoEditor from './components/BookMemoEditor';
import QuickMemoSheet from './components/QuickMemoSheet';
import Onboarding, { isOnboardingCompleted, clearOnboardingCompletion } from './components/Onboarding';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from './styles/ui';
import {
  Search as IcSearch, Plus as IcPlus, Library as IcLibrary, Sparkles as IcSparkles,
  TrendingUp as IcTrendingUp, MessageSquareQuote as IcQuote, History as IcHistory,
  SearchX as IcSearchX, NotebookText as IcNote, Target as IcTarget, Brain as IcBrain,
  Ruler as IcRuler, LayoutGrid as IcGrid, List as IcList,
  Lightbulb as IcBulb, MessageSquarePlus as IcNewChat,
  BookOpen as IcBook, Map as IcMap, Zap as IcZap, RefreshCw as IcRefresh, Bot as IcBot,
  CheckCircle2 as IcCheck,
} from 'lucide-react';

// サブタブのラベル: 絵文字をやめ lucide 線アイコン＋テキストで統一（脱・個人開発感）。
const subTabIconStyle = { verticalAlign: '-2px', marginRight: 5 };
import HelpModal from './components/HelpModal';
const Review = lazy(() => import('./components/Review'));
const MyBookBrain = lazy(() => import('./components/MyBookBrain'));
const ThemeReport = lazy(() => import('./components/ThemeReport'));
const AdvisorHistoryList = lazy(() => import('./components/AdvisorHistory').then((m) => ({ default: m.AdvisorHistoryList })));
const AdvisorSessionDetail = lazy(() => import('./components/AdvisorHistory').then((m) => ({ default: m.AdvisorSessionDetail })));
import AdvisorAddConfirmModal from './components/AdvisorAddConfirmModal';
import { useAdvisorSessions } from './hooks/useAdvisorSessions';
import ActionList from './components/ActionList';
import ActionEditModal from './components/ActionEditModal';
const AddBookModal = lazy(() => import('./components/AddBookModal'));
import { useBookCover } from './hooks/useBookCover';
import {
  searchBooks as searchBooksAPI,
  searchBooksFlat as searchBooksAPIFlat,
  searchBooksAdvanced as searchBooksAPIAdvanced,
  pickSuggestions,
  findIsbnCandidates,
  findCoverFromGoogleBooks,
} from './lib/bookSearch';
import { resolveCoverUrl, getCoverCandidates, resolveCoverFromCandidates, fullyResolveCover, tryCoverForIsbn } from './lib/bookCover';
import { backfillCovers } from './lib/backfillCovers';
import { enqueueCoverRetry } from './lib/coverAutoRetry';
import { summarizeAdvisorConversation } from './lib/aiSetupSummary';
import { findDuplicateBook, STATUS_LABEL, isUniqueViolation } from './lib/checkDuplicate';
const CoverFixModal = lazy(() => import('./components/CoverFixModal'));
const Landing = lazy(() => import('./pages/Landing'));
const TermsPage = lazy(() => import('./legal/TermsPage'));
const PrivacyPage = lazy(() => import('./legal/PrivacyPage'));
const SctPage = lazy(() => import('./legal/SctPage'));
import { supabase as supabaseClient } from './lib/supabase';
import { track } from './lib/analytics';
const AccountSettings = lazy(() => import('./components/AccountSettings'));
import SplashScreen from './components/SplashScreen';
import Spinner from './components/Spinner';
import EmptyState from './components/EmptyState';
import ErrorMessage from './components/ErrorMessage';
import BookshelfSummary from './components/BookshelfSummary';
import HomeRecall from './components/HomeRecall';
import AuthorThankYou from './components/AuthorThankYou';
import { buildGreeting } from './lib/greeting';
import { initServiceWorker } from './lib/swUpdate';
import { ensurePushSubscription } from './lib/push';
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
import { toMessage, fieldRequiredMessage } from './lib/errors';
import { LIMITS, clamp } from './lib/limits';
import { ensureHttps } from './lib/url';
import {
  getAmazonLink,
  getAmazonSearchLink,
  AMAZON_DISCLOSURE_TEXT,
  AMAZON_LINK_REL,
} from './lib/amazonLink';
import { getRandomFromCategory } from './lib/quotes';
import {
  BookOpen,
  RotateCcw,
  Brain,
  Sparkles,
  Bookmark,
  PenSquare,
  CheckCircle,
  HelpCircle,
  Settings as SettingsIcon,
  Target,
} from 'lucide-react';
import { useBookMemos } from './hooks/useBookMemos';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from "react";

const STAR = "★";
const EMPTY_STAR = "☆";
const STATUSES = [
  { key: "want", label: "読みたい", emoji: "🔖", Icon: Bookmark, bg: "#f0e8d8", color: "var(--color-accent)" },
  { key: "before", label: "積読", emoji: "📐", Icon: PenSquare, bg: "#f0e0f0", color: "#7a5080" },
  { key: "reading", label: "読書中", emoji: "📖", Icon: BookOpen, bg: "#dde8f0", color: "#4a6e8a" },
  { key: "done", label: "読了", emoji: "✅", Icon: CheckCircle, bg: "#e2ecd8", color: "#5a7a48" },
];
const getSt = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

// 検索結果が AI 推薦と「同じ本」と確信できるかの判定。誤マッチで間違った
// ISBN が保存され、後段の cover lookup で別の本の表紙が出る事故を防ぐため。
// 判定ルール:
//   - 著者がある場合: 互いの著者文字列が含み合いの関係であること
//   - タイトル: 完全一致 OR 「短い方が長い方の prefix」かつ shorter/longer ≥ 0.7
//   - 続編判定: prefix が一致しても、続く部分が「2」「上」「下」「続編」等の
//     巻数 / シリーズ表記なら別書誌扱い (例: 「1分で話せ」と「1分で話せ2」)。
//   タイトルの部分一致だけ (例: 共通の漢字「思考」) では一致と認めない
const _normTitle = (s) => (s || '').toString().normalize('NFKC').toLowerCase().replace(/[\s・()()\[\]【】「」『』:、,.。!?!?\-—‐−~〜:;]/g, '');
const _normAuthor = (s) => (s || '').toString().normalize('NFKC').toLowerCase().replace(/[\s・,、;:]/g, '');
// `longer` が `shorter` で始まる時、その続きの部分が「巻数 / 続編」を示すか。
// 「1分で話せ」と「1分で話せ2」を別書誌として扱うために導入。NFKC 後は
// 全角数字 / ローマ数字も半角・ラテン文字に正規化されているのでこの判定で OK。
function _suffixIsVolume(longer, shorter) {
  const tail = longer.slice(shorter.length);
  if (!tail) return false;
  // 数字始まり (続編 / 巻数: 「1分で話せ2」「ドラゴンボール3」等)
  if (/^\d/.test(tail)) return true;
  // ローマ数字 (NFKC で ii / iii / iv / v / vi ... に展開済み) — 末尾が数字判定っぽい
  if (/^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)([^a-z]|$)/.test(tail)) return true;
  // よくある巻数 / 続編 / 章 表記。"超" は「ドラゴンボール超」のような明確な
  // 続編接尾を想定。"新装版 / 改訂版 / 文庫版" は同じ内容扱いにしたいので入れない。
  if (/^(上|下|前編|後編|続編|完結編|外伝|新章|別巻|超)/.test(tail)) return true;
  // 英語の vol / part 表記
  if (/^(vol|part|book|chapter|episode)/.test(tail)) return true;
  return false;
}
function isStrictMatch(candidate, original) {
  const ct = _normTitle(candidate?.title);
  const ot = _normTitle(original?.title);
  if (!ct || !ot) return false;
  if (ct !== ot) {
    const longer = ct.length >= ot.length ? ct : ot;
    const shorter = ct.length >= ot.length ? ot : ct;
    if (!longer.startsWith(shorter)) return false;
    // 続編 (「1分で話せ」と「1分で話せ2」) は別書誌
    if (_suffixIsVolume(longer, shorter)) return false;
    if (shorter.length / longer.length < 0.7) return false;
  }
  if (original?.author) {
    const ca = _normAuthor(candidate?.author);
    const oa = _normAuthor(original.author);
    if (!ca || !oa) return false;
    if (!ca.includes(oa) && !oa.includes(ca)) return false;
  }
  return true;
}

/* ========== Setup-sheet edit history (localStorage, 1-step undo) ========== */
const STRATEGY_HISTORY_KEY = (bookId) => `aiStrategyHistory:${bookId}`;
function saveStrategyHistory(bookId, prevStrategy) {
  if (!bookId || typeof prevStrategy !== 'string') return;
  try { localStorage.setItem(STRATEGY_HISTORY_KEY(bookId), prevStrategy); } catch {}
}
function popStrategyHistory(bookId) {
  if (!bookId) return null;
  try {
    const v = localStorage.getItem(STRATEGY_HISTORY_KEY(bookId));
    if (!v) return null;
    localStorage.removeItem(STRATEGY_HISTORY_KEY(bookId));
    return v;
  } catch { return null; }
}
function hasStrategyHistory(bookId) {
  if (!bookId) return false;
  try { return !!localStorage.getItem(STRATEGY_HISTORY_KEY(bookId)); }
  catch { return false; }
}
function clearStrategyHistory(bookId) {
  if (!bookId) return;
  try { localStorage.removeItem(STRATEGY_HISTORY_KEY(bookId)); } catch {}
}

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

/* ========== Book Search Modal ========== */
//
// Two modes (simple / advanced) backed by separate API entry points in
// lib/bookSearch.js. Both feed the same render path (suggestions card,
// many-results warning, sort, improved cards).
function BookResultCard({ book, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(book)}
      aria-label={`『${book.title}』を選択`}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--c-hairline)',
        background: 'var(--c-card)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        width: '100%',
      }}
    >
      {book.cover ? (
        <img
          src={ensureHttps(book.cover)}
          alt=""
          style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--c-hairline-strong)' }}
        />
      ) : (
        <div style={{ width: 44, height: 60, background: '#e8e2d6', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📕</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', lineHeight: 1.4, marginBottom: 2 }}>{book.title}</div>
        {book.author && <div style={{ fontSize: 11, color: 'var(--c-ink-2)' }}>✍️ {book.author}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {book.publisher && <span style={{ fontSize: 10, color: 'var(--c-ink-2)' }}>🏢 {book.publisher}</span>}
          {book.pubYear && <span style={{ fontSize: 10, color: 'var(--c-ink-2)' }}>📅 {book.pubYear}</span>}
        </div>
        {book.isbn && <div style={{ fontSize: 10, color: '#b5aa96', marginTop: 3 }}>🔢 ISBN: {book.isbn}</div>}
      </div>
      <span style={{ fontSize: 11, color: 'var(--c-brand)', alignSelf: 'center', whiteSpace: 'nowrap', padding: '4px 8px', border: '1px solid var(--c-hairline-strong)', borderRadius: 6 }}>
        <IcPlus size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />これを追加
      </span>
    </button>
  );
}

function BookSearchModal({ onSelect, onClose, initialQuery = '', initialAuthor = '', initialIsbn = '' }) {
  // 3 inputs always visible. Phase 5: 簡素化方針により simple/advanced
  // タブを廃止し、最初から詳細検索 (title + author + isbn) を 1 画面で。
  const [advTitle, setAdvTitle] = useState(initialQuery);
  const [advAuthor, setAdvAuthor] = useState(initialAuthor);
  const [advIsbn, setAdvIsbn] = useState(initialIsbn);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState('');
  const [cached, setCached] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');

  const runSearch = async (override) => {
    const t = (override?.title ?? advTitle).trim();
    const a = (override?.author ?? advAuthor).trim();
    const i = (override?.isbn ?? advIsbn).trim();
    if (!t && !a && !i) {
      setError('タイトル・著者・ISBN のいずれかを入力してください。');
      return;
    }
    setSearching(true); setNotFound(false); setError(null); setResults([]); setCached(false);
    setLastQuery([t, a, i].filter(Boolean).join(' / '));
    const res = await searchBooksAPIAdvanced({ title: t, author: a, isbn: i });
    if (!res.ok) {
      setError(res.error || '検索でエラーが発生しました。');
    } else if (res.results.length === 0) {
      setNotFound(true);
    } else {
      setResults(res.results);
      if (res.cached) setCached(true);
    }
    setSearching(false);
  };

  // Auto-search if seeded from AddBookModal (any of title / author / isbn).
  useEffect(() => {
    if (initialQuery?.trim() || initialAuthor?.trim() || initialIsbn?.trim()) {
      runSearch({ title: initialQuery, author: initialAuthor, isbn: initialIsbn });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => runSearch();
  const hasAnyInput = advTitle.trim() || advAuthor.trim() || advIsbn.trim();

  // Apply sort over a stable copy. Empty pubYear sorts to the bottom.
  const sortedResults = useMemo(() => {
    if (!results.length) return results;
    const arr = [...results];
    if (sortBy === 'year-desc') {
      arr.sort((a, b) => {
        const ay = parseInt(a.pubYear || '0', 10);
        const by = parseInt(b.pubYear || '0', 10);
        return by - ay;
      });
    } else if (sortBy === 'title') {
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
    }
    return arr;
  }, [results, sortBy]);

  const suggestions = useMemo(() => {
    // Only surface the suggest section if there's enough noise to wade
    // through. Below that, the regular list already serves as the answer.
    if (results.length < 5) return [];
    return pickSuggestions(results, 3);
  }, [results]);

  const tooMany = results.length >= 20;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--c-ink)' }}>
          <IcSearch size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
          本を検索
        </h3>
        <button onClick={onClose} style={closeBtn} aria-label="閉じる">×</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label htmlFor="adv-title" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)', display: 'block', marginBottom: 4 }}>タイトル</label>
          <input
            id="adv-title"
            value={advTitle}
            onChange={(e) => setAdvTitle(e.target.value)}
            placeholder="例：レバレッジ・リーディング"
            style={inp}
            maxLength={LIMITS.bookTitle}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="adv-author" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)', display: 'block', marginBottom: 4 }}>
            著者 <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="adv-author"
            value={advAuthor}
            onChange={(e) => setAdvAuthor(e.target.value)}
            placeholder="例：本田 直之"
            style={inp}
            maxLength={LIMITS.bookAuthor}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
          />
        </div>
        <div>
          <label htmlFor="adv-isbn" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)', display: 'block', marginBottom: 4 }}>
            ISBN <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="adv-isbn"
            value={advIsbn}
            onChange={(e) => setAdvIsbn(e.target.value)}
            placeholder="978-4-7631-9742-3"
            style={inp}
            inputMode="numeric"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
          />
        </div>
        <button
          type="button"
          onClick={() => runSearch()}
          disabled={searching || !hasAnyInput}
          style={{
            ...btnS,
            padding: '12px 14px',
            fontSize: 14,
            minHeight: 44,
            opacity: searching || !hasAnyInput ? 0.5 : 1,
          }}
        >
          🔍 検索
        </button>
      </div>

      {searching && <Dots />}

      {error && !searching && (
        <ErrorMessage
          icon="⚠️"
          title="検索でエラーが発生しました"
          description={error}
          actions={[{ label: '↻ もう一度試す', onClick: retry, variant: 'primary' }]}
          hint="ネット接続が不安定な時は、少し時間をおいてからお試しください 🙏"
        />
      )}

      {notFound && !searching && (
        <div style={{ textAlign: 'center', padding: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--color-secondary)', margin: 0, lineHeight: 1.7 }}>
            「{lastQuery}」に一致する本が見つかりません
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: '6px 0 0' }}>
            別のキーワードでお試しください
          </p>
        </div>
      )}

      {results.length > 0 && cached && (
        <p style={{ fontSize: 10, color: 'var(--color-tertiary)', margin: '0 2px', fontStyle: 'italic' }}>
          ⚡ キャッシュから即時表示
        </p>
      )}

      {tooMany && !searching && (
        <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: 0, padding: '0 4px' }}>
          💡 結果 {results.length} 件 — 著者や ISBN を入れると絞り込めます
        </p>
      )}

      {suggestions.length > 0 && !searching && (
        <div style={{ background: 'var(--c-soft)', border: '1px solid var(--c-hairline)', borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-brand)', margin: '0 0 6px' }}>
            <IcBulb size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
            もしかしてこの本？
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestions.map((b, i) => (
              <BookResultCard key={`sug-${i}`} book={b} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: 0 }}>{results.length} 件ヒット</p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ ...inp, width: 'auto', padding: '6px 8px', fontSize: 12 }}
              aria-label="並び順"
            >
              <option value="relevance">関連度順</option>
              <option value="year-desc">出版年が新しい順</option>
              <option value="title">タイトル順</option>
            </select>
          </div>
          <div className="list-item-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {sortedResults.map((b, i) => (
              <div key={`r-${i}`} className="list-item-enter">
                <BookResultCard book={b} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ========== Primitives ========== */
function Stars({ r, onChange, size = 18 }) {
  return (
    <span style={{ cursor: onChange ? "pointer" : "default", userSelect: "none" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={() => onChange?.(r === n ? 0 : n)} style={{ fontSize: size, color: n <= r ? "#d4a040" : "#d0c8b8", marginRight: 2 }}>
          {n <= r ? STAR : EMPTY_STAR}
        </span>
      ))}
    </span>
  );
}

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

function Dots() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: "12px 0" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#d4a040", animation: `pulse 1s infinite ${i * 0.2}s` }} />
      ))}
    </div>
  );
}

function Field({ label, sub, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: "var(--c-ink-soft)", fontWeight: 500, display: "block", marginBottom: sub ? 2 : 5 }}>{label}</label>
      {sub && <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 5, lineHeight: 1.5 }}>{sub}</p>}
      {children}
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

function StatusBadge({ status }) {
  const s = getSt(status);
  const Icon = s.Icon;
  return (
    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 600, letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {Icon && <Icon size={12} strokeWidth={1.75} aria-hidden="true" />}
      {s.label}
    </span>
  );
}

function BookIcon() {
  return (
    <div style={{ width: 32, height: 44, background: "#e8e2d6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📕</div>
  );
}

// Swipeable + long-pressable book row used on the bookshelf list.
// Defined at top level (not inside AuthedApp) so the per-card hooks
// (useLongPress) follow Rules of Hooks.
// タイトル文字列から決定論的にプレースホルダ色を生成。同じ本は常に同じ色。
const PLACEHOLDER_PALETTE = [
  ['var(--color-accent)', '#5d4a28'], // brown
  ['#7a5080', '#5a3a60'], // plum
  ['#4a6e8a', '#2c4d68'], // slate blue
  ['#5a7a48', '#3a5a30'], // moss
  ['var(--c-critical)', '#703528'], // brick
  ['#9b7b5c', '#6a5340'], // sand
];
function paletteFor(title) {
  const s = title || '';
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PLACEHOLDER_PALETTE[Math.abs(hash) % PLACEHOLDER_PALETTE.length];
}

// 本棚カードの進捗バーは撤去（本田哲学=ページ進捗は「作業量」であって成果ではない）。
// 何も描画しないスタブにして呼び出し側は不変のまま（復活が容易）。
function CardProgressBar() {
  return null;
}

// グリッド表示用の本カード（表紙主役）。表紙無し / 画像 404 時は
// タイトルベースの色付きプレースホルダにフォールバック。
const BookCoverCard = memo(function BookCoverCard({ book, isJustDone, onOpen, onLongPress, onAutoRetry }) {
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, book }),
  });
  const [from, to] = paletteFor(book.title);
  // book.id をキーに使って、book が変わった時のみ broken state をリセット。
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [book.id, book.cover]);
  const showPlaceholder = !book.cover || broken;
  // 表紙が出ない本はバックグラウンドで再解決をキューイング。
  // セッション内で 1 回だけ走るので、ここから fire-and-forget で OK。
  useEffect(() => {
    if (showPlaceholder) onAutoRetry?.(book);
  }, [showPlaceholder, book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      className="book-cover-card"
      onClick={() => onOpen?.(book)}
      {...longPress.bind}
      style={{
        animation: isJustDone ? 'leverage-card-celebrate 2.4s ease both' : undefined,
      }}
    >
      <div className="book-cover-image-wrap">
        {showPlaceholder ? (
          <div
            className="book-cover-placeholder"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            {book.title}
          </div>
        ) : (
          <img
            src={ensureHttps(book.cover)}
            alt={book.title}
            loading="lazy"
            onError={() => setBroken(true)}
            // 1×1 transparent placeholder + Google Books の "No cover"
            // プレースホルダー (128×170 PNG、h/w 1.33) を実画像と区別する。
            // 通常の本の表紙は h/w 1.4-1.6 なので 1.35 を閾値にする (bookCover.js
            // checkImageExists と同じ基準)。
            onLoad={(e) => {
              const t = e?.target;
              if (!t) return;
              const w = t.naturalWidth || 0;
              const h = t.naturalHeight || 0;
              if (w <= 1 || h <= 1) { setBroken(true); return; }
              if (w >= 50 && h / w < 1.35) { setBroken(true); return; }
            }}
          />
        )}
        {/* ステータスを右下に小さなテキスト pill で常時表示。
            旧: 'done' だけ大きな ✅ を出していたが、すべての状態で
            視認できるよう「読みたい/読書前/読書中/読了」テキストに変更。
            book-status-pill.{status} で色を切替。 */}
        {book.status && (() => {
          const labels = { want: '読みたい', before: '積読', reading: '読書中', done: '読了' };
          const label = labels[book.status];
          if (!label) return null;
          return (
            <span
              className={`book-status-pill ${book.status}`}
              aria-label={label}
              title={label}
            >
              {label}
            </span>
          );
        })()}
      </div>
      <p className="book-cover-title">{book.title}</p>
      {book.author && <p className="book-cover-author">{book.author}</p>}
      <CardProgressBar book={book} />
    </button>
  );
});

const SwipeableBookCard = memo(function SwipeableBookCard({ book, index, isJustDone, onOpen, onSwipeDelete, onLongPress, onAutoRetry }) {
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, book }),
  });
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [book.id, book.cover]);
  const [from, to] = paletteFor(book.title);
  const hasCover = !!(book.cover && !broken);
  // 表紙不在 → 裏で再解決を試行 (セッション内 1 回のみ、キュー処理)
  useEffect(() => {
    if (!hasCover) onAutoRetry?.(book);
  }, [hasCover, book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SwipeableCard onDelete={() => onSwipeDelete?.(book)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${book.title || '無題'} を開く`}
        onClick={() => onOpen?.(book)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onOpen?.(book);
          }
        }}
        {...longPress.bind}
        style={{
          background: "var(--c-card)",
          borderRadius: 14,
          padding: "12px 14px",
          border: "1px solid var(--c-hairline)",
          boxShadow: isJustDone
            ? "0 0 18px rgba(212,160,64,0.55), 0 2px 8px rgba(30,25,20,0.08)"
            : "0 2px 6px rgba(30,25,20,0.06)",
          cursor: "pointer",
          transition: "background .12s ease, box-shadow .35s ease, transform .12s ease",
          animation: isJustDone
            ? "leverage-card-celebrate 2.4s ease both"
            : `slideUp .3s ease ${index * 0.02}s both`,
          // 長押しでカード周辺のテキスト選択 / iOS の callout を抑止。
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {hasCover ? (
            <img
              src={ensureHttps(book.cover)}
              alt={book.title}
              loading="lazy"
              onError={() => setBroken(true)}
              onLoad={(e) => {
                // 1×1 dummy + Google Books "No cover" placeholder (128×170, h/w 1.33)
                // を弾く (bookCover.js の checkImageExists と同じ 1.35 閾値)。
                const t = e?.target;
                if (!t) return;
                const w = t.naturalWidth || 0;
                const h = t.naturalHeight || 0;
                if (w <= 1 || h <= 1) { setBroken(true); return; }
                if (w >= 50 && h / w < 1.35) { setBroken(true); return; }
              }}
              style={{ width: 42, height: 60, objectFit: "cover", borderRadius: 5, border: "1px solid var(--c-hairline-strong)", flexShrink: 0, boxShadow: "0 1px 3px rgba(30,25,20,0.12)" }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 42, height: 60, borderRadius: 5, flexShrink: 0,
                background: `linear-gradient(135deg, ${from}, ${to})`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 600, padding: 4, textAlign: 'center', lineHeight: 1.2,
                overflow: 'hidden', wordBreak: 'break-word',
              }}
            >
              {(book.title || '').slice(0, 8)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--c-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.2 }}>{book.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              {book.author && <span style={{ fontSize: 11, color: "var(--c-ink-2)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.author}</span>}
              {book.rating > 0 && <Stars r={book.rating} size={11} />}
            </div>
            <div style={{ marginTop: 6 }}>
              <StatusBadge status={book.status} />
            </div>
            <CardProgressBar book={book} />
          </div>
          <span style={{ fontSize: 14, color: "#c4b8a6" }}>›</span>
        </div>
      </div>
    </SwipeableCard>
  );
});

function TagInput({ tags, onChange, allTags }) {
  const [input, setInput] = useState("");
  const add = (t) => { const tag = (t || input).trim(); if (tag && !tags.includes(tag)) onChange([...tags, tag]); setInput(""); };
  const suggestions = (allTags || []).filter((t) => !tags.includes(t));
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: tags.length ? 6 : 0 }}>
        {tags.map((t, i) => (
          <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--c-soft-2)", color: "var(--c-ink-2)", display: "flex", alignItems: "center", gap: 4 }}>
            {t}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} style={{ background: "none", border: "none", fontSize: 12, color: "var(--c-ink-2)", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#b5aa96", lineHeight: "22px" }}>過去のタグ:</span>
          {suggestions.map((t) => (
            <button key={t} onClick={() => add(t)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: "1px dashed var(--c-hairline-strong)", background: "transparent", color: "var(--c-ink-2)", cursor: "pointer", fontFamily: "inherit" }}>+ {t}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="タグを追加" style={{ ...inp, flex: 1 }} maxLength={LIMITS.tag} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        <button onClick={() => add()} style={{ ...btnO, padding: "6px 12px", fontSize: 12 }}>追加</button>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 500, color: "var(--c-ink)", marginBottom: 12, marginTop: 24 }}>
      {icon} {title}
    </h3>
  );
}

/* ========== Data ========== */
const emptyBook = () => ({
  id: "", title: "", author: "", cover: "", rating: 0, status: "want",
  startDate: "", doneDate: "", tags: [], currentPage: 0, totalPages: 0,
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

/* ========== Phase Screens ========== */

// Phase 1: 読みたい → just register
function WantPhase({ form, setForm, onSave, onSearchOpen, allTags }) {
  const fileInputRef = useRef(null);
  const { uploadCover } = useBookCover();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const onPickCover = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCover(file);
      if (url) setForm({ ...form, cover: url });
    } catch (err) {
      toast.error(err?.message || '画像のアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const clearCover = () => setForm({ ...form, cover: '' });

  return (
    <div>
      <p style={phaseDesc}><IcBook size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読みたい本を登録しましょう</p>
      <button onClick={onSearchOpen} style={{ ...btnO, width: "100%", padding: "14px 0", borderStyle: "dashed", fontSize: 14, marginBottom: 12 }}>
        🔍 タイトル・ISBNで検索して登録
      </button>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {form.cover ? (
            <img src={ensureHttps(form.cover)} alt="" style={{ width: 60, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid var(--c-hairline-strong)" }} />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: 60,
                height: 84,
                borderRadius: 6,
                border: '1px dashed #c4b8a6',
                background: '#f5efde',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                color: 'var(--c-ink-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1.3,
                padding: 4,
                textAlign: 'center',
              }}
              aria-label="表紙写真をアップロード"
            >
              {uploading ? '...' : '📷\n表紙'}
            </button>
          )}
          {form.cover && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--color-accent)', cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}
              >
                変更
              </button>
              <button
                type="button"
                onClick={clearCover}
                style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--c-critical)', cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}
              >
                削除
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            /* capture を意図的に外す: iOS の標準アクションシート (写真を撮る /
               フォトライブラリ / ファイルを選択) を出すため。capture を指定
               するとカメラに直行してしまい、スクショや既存写真からの選択が
               できなくなる。 */
            onChange={onPickCover}
            style={{ display: 'none' }}
          />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="タイトル *" style={inp} maxLength={LIMITS.bookTitle} />
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="著者" style={inp} maxLength={LIMITS.bookAuthor} />
        </div>
      </div>
      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <button onClick={onSave} disabled={!form.title.trim()} style={{ ...btnS, width: "100%", marginTop: 8, opacity: form.title.trim() ? 1 : 0.5 }}>
        保存
      </button>
    </div>
  );
}

// Phase 2: 読書前（投資設計）
function BeforePhase({
  form,
  setForm,
  onSave,
  aiLoading,
  onRunAnalysis,
  onRunStrategy,
  onRunStrategyEdit,
  onUndoStrategy,
  hasStrategyHistory,
  onAddRelatedBook,
  addingTitles,
}) {
  const [editInstruction, setEditInstruction] = useState('');
  const submitEdit = () => {
    const v = editInstruction.trim();
    if (!v) return;
    onRunStrategyEdit?.(v).then(() => setEditInstruction(''));
  };

  return (
    <div>
      <p style={phaseDesc}><IcRuler size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読む前に、投資目的を決めましょう</p>

      <Field label="読書開始日">
        <input type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inp} />
      </Field>

      <SectionHeader icon={<IcSearch size={16} />} title="AI本の解析" />
      <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 10, lineHeight: 1.5 }}>ボタンを押すとAIが本の核心・構造・著者の視点を分析します</p>
      <button onClick={onRunAnalysis} disabled={!form.title.trim() || aiLoading} style={{ ...aiB, opacity: !form.title.trim() || aiLoading ? 0.5 : 1 }}>
        {aiLoading && !form.aiAnalysis ? "分析中..." : "🔍 AIで本を解析する"}
      </button>
      {aiLoading && !form.aiAnalysis && <Dots />}
      {form.aiAnalysis && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-accent)", marginBottom: 4 }}>
            解析結果
            {aiLoading && !form.aiStrategy && <span className="streaming-cursor" aria-hidden="true" style={{ marginLeft: 6 }} />}
          </p>
          <MarkdownSections
            text={form.aiAnalysis}
            onAddRelatedBook={aiLoading ? undefined : onAddRelatedBook}
            addingTitles={addingTitles}
          />
        </div>
      )}

      {form.aiAnalysis && (
        <>
          <SectionHeader icon={<IcMap size={16} />} title="読書戦略の作成" />
          {/* AI 選書から構造化要約 / source_query を引き継ぎ済みなら、ユーザーが
              「あれ、なんで既に文字が入ってるの？」と戸惑わないように
              バナーで明示する。bookReason があれば「会話を要約しました」、
              無ければ旧来の「AI 選書で入力した内容」表現を使い分ける。 */}
          {(form.bookReason || form.sourceQuery) && (
            <div
              style={{
                background: '#FFF8E1',
                border: '1px solid #e0c878',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 12,
                color: '#5D4037',
                lineHeight: 1.7,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <IcBulb size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {form.bookReason
                  ? 'AI 選書で話した内容を元に、AI が読書計画を作成しました。編集して自分の言葉に直すと、より効果的です。'
                  : 'AI 選書で入力した内容を引き継ぎました。必要に応じて編集してください。'}
              </span>
            </div>
          )}

          <Field label="📊 投資目的（必須）" sub="何のためにこの本を読むか（1〜2 文）。これが読書のリターンを決めます">
            <textarea
              value={form.investPurpose || ""}
              onChange={(e) => setForm({ ...form, investPurpose: e.target.value })}
              placeholder="例：営業成績を半年で 1.5 倍にする"
              rows={3}
              style={ta}
              maxLength={LIMITS.memoText}
            />
          </Field>
          {/* sourceQuery が違うなら「↩ AI 選書で入力した内容に戻す」 */}
          {form.sourceQuery && (form.investPurpose || '').trim() !== form.sourceQuery.trim() && (
            <button
              type="button"
              onClick={() => setForm({ ...form, investPurpose: form.sourceQuery })}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-accent)',
                fontSize: 11,
                padding: '0 0 8px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              ↩ AI 選書で入力した内容に戻す
            </button>
          )}

          <Field label="⚠ 現在の課題" sub="今直面している具体的な問題">
            <textarea
              value={form.currentChallenge || ""}
              onChange={(e) => setForm({ ...form, currentChallenge: e.target.value })}
              placeholder="例：初回商談で信頼構築に時間がかかる"
              rows={3}
              style={ta}
              maxLength={LIMITS.memoText}
            />
          </Field>

          <Field label="💡 仮説" sub="この本を読むとどう変わると考えているか">
            <textarea
              value={form.hypothesis || ""}
              onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
              placeholder="例：短時間で信頼を築くフレームワークが学べる"
              rows={3}
              style={ta}
              maxLength={LIMITS.memoText}
            />
          </Field>

          {form.bookReason && (
            <div
              style={{
                marginTop: 4,
                marginBottom: 12,
                padding: '10px 12px',
                background: 'var(--c-soft)',
                border: '1px solid var(--c-hairline)',
                borderRadius: 10,
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-brand)', margin: 0 }}>
                <IcBot size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
                AI の選書理由
              </p>
              <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.7, margin: '6px 0 4px', whiteSpace: 'pre-wrap' }}>
                {form.bookReason}
              </p>
              <small style={{ fontSize: 10, color: 'var(--c-ink-2)' }}>※ この内容は AI 選書時の判断です。編集できません。</small>
            </div>
          )}

          <button onClick={onRunStrategy} disabled={!form.investPurpose?.trim() || aiLoading} style={{ ...aiB, opacity: !form.investPurpose?.trim() || aiLoading ? 0.5 : 1 }}>
            {aiLoading && form.aiAnalysis ? "作成中..." : "🗺️ 読書計画シートを作成"}
          </button>
          {aiLoading && form.aiAnalysis && !form.aiStrategy && <Dots />}
          {form.aiStrategy && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-accent)", marginBottom: 4 }}>
読書計画シート
                {aiLoading && <span className="streaming-cursor" aria-hidden="true" style={{ marginLeft: 6 }} />}
              </p>
              {/* aiLoading 中は onAddRelatedBook を渡さない — MarkdownSections は
                  「関連書籍」見出しを通常の見出しとして描画し、関連書籍カードと
                  「📚 読みたい」ボタンを出さない。途中の不完全な 『title』 を
                  押されてもデータが壊れない。 */}
              <MarkdownSections
                text={form.aiStrategy}
                onAddRelatedBook={aiLoading ? undefined : onAddRelatedBook}
                addingTitles={addingTitles}
              />

              {/* Refinement: send the existing sheet + a free-form instruction
                  to the AI. Keeps a 1-step history in localStorage so the
                  user can undo. */}
              <div style={{ marginTop: 12, padding: "12px 14px", background: "#f5efde", border: "1px solid #e0d0a8", borderRadius: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--c-brand)", margin: 0 }}>
                  📝 修正リクエスト
                </p>
                <p style={{ fontSize: 11, color: "var(--c-ink-2)", margin: "4px 0 8px", lineHeight: 1.6 }}>
                  例：もっと簡潔に / 営業視点を強化 / 章番号を増やして
                </p>
                <textarea
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submitEdit();
                    }
                  }}
                  placeholder="修正したい点を入力"
                  rows={2}
                  style={{ ...ta, minHeight: 60, maxHeight: 200 }}
                  maxLength={LIMITS.memoText}
                  aria-label="読書計画シートの修正指示"
                  disabled={aiLoading}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={submitEdit}
                    disabled={!editInstruction.trim() || aiLoading}
                    style={{
                      ...btnS,
                      padding: "10px 18px",
                      fontSize: 13,
                      opacity: !editInstruction.trim() || aiLoading ? 0.5 : 1,
                    }}
                  >
                    {aiLoading ? "修正中..." : "🔧 修正する"}
                  </button>
                  {hasStrategyHistory && !aiLoading && (
                    <button
                      type="button"
                      onClick={onUndoStrategy}
                      style={{
                        ...btnO,
                        padding: "10px 14px",
                        fontSize: 12,
                      }}
                      aria-label="ひとつ前の読書計画シートに戻す"
                    >
                      ↶ 元に戻す
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 読書計画が揃っていれば保存と同時に読書中へ自動遷移する。
          handleSave 側で同じ条件 (form.investPurpose + aiAnalysis/Strategy)
          を見て status='reading' に切替 + setView('detail') を行う。
          条件が揃っていない場合は通常の「保存」(その場で留まる)。 */}
      {(() => {
        const setupReady =
          (form.investPurpose && form.investPurpose.trim()) &&
          (form.aiAnalysis || form.aiStrategy);
        return (
          <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 20 }}>
            {setupReady ? '💾 保存して読書を開始する' : '💾 保存'}
          </button>
        );
      })()}
    </div>
  );
}

// Phase 3: 読書中（インプット）
// ページ入力を「0〜10万の整数」にクランプ。NaN / 負 / 巨大値を弾く。
// 空入力は 0（＝未設定）に倒す。保存時に useBooks 側でも null 正規化される。
const clampPage = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 100000);
};

function ReadingPhase({ form, setForm, onSave, onSaveSummary, allTags }) {
  // 📖 読書進捗（ページ管理）は撤去（本田哲学=「作業量の可視化」は成果ではない／
  // 進捗を見て満足する病を生む）。totalPages は書誌メタとして裏で保持するのみで
  // UI には出さない。データ列は dormant（復活は容易・既存値は保持）。
  return (
    <div>
      <p style={phaseDesc}><IcBook size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読書中のインプットを記録しましょう</p>

      {form.aiStrategy && (
        <div style={{ background: "var(--c-soft)", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#7a5080", marginBottom: 4 }}>📋 読書計画シート要約</p>
          <p style={{ fontSize: 12, color: "var(--c-ink-soft)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto", paddingRight: 8, margin: 0 }}>
            {form.aiStrategy}
          </p>
        </div>
      )}

      <Field label="メモ・感想" sub="気づきや感想を、気軽に。1メモ=1カードで残すか、1冊まるごと1つのテキストにまとめるか、タブで選べます。">
        <BookMemoList
          bookId={form.id}
          bookTitle={form.title}
          bookAuthor={form.author || ""}
          summaryText={form.leverageMemo || ""}
          onSaveSummary={onSaveSummary}
        />
      </Field>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 8 }}>保存</button>
    </div>
  );
}

// Phase 4: 読了（投資回収）
function DonePhase({ form, setForm, onSave, aiLoading, onRunSummary, allTags }) {
  const addAction = () => setForm({ ...form, actions: [...(form.actions || []), { text: "", deadline: "", done: false }] });
  const updateAction = (i, key, val) => {
    const a = [...(form.actions || [])];
    a[i] = { ...a[i], [key]: val };
    setForm({ ...form, actions: a });
  };
  const removeAction = (i) => setForm({ ...form, actions: (form.actions || []).filter((_, j) => j !== i) });

  return (
    <div>
      <p style={phaseDesc}><IcCheck size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読み終えて、振り返りましょう</p>

      <Field label="読書完了日">
        <input type="date" value={form.doneDate || ""} onChange={(e) => setForm({ ...form, doneDate: e.target.value })} style={inp} />
      </Field>

      <Field label="評価（投資対効果）">
        <div style={{ padding: "4px 0" }}>
          <Stars r={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={28} />
        </div>
      </Field>

      {form.leverageMemo?.trim() && (
        <>
          <SectionHeader icon={<IcBot size={16} />} title="AIメモ要約" />
          <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 10, lineHeight: 1.5 }}>まとめメモをAIが3〜5個のポイントに凝縮します</p>
          <button onClick={onRunSummary} disabled={aiLoading} style={{ ...aiB, opacity: aiLoading ? 0.5 : 1 }}>
            {aiLoading ? "要約中..." : (<><IcBot size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />AIでメモを要約・整理</>)}
          </button>
          {aiLoading && <Dots />}
          {form.aiSummary && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#5a7a48", marginBottom: 4 }}>要約結果（要点の凝縮）</p>
              <MarkdownSections text={form.aiSummary} />
            </div>
          )}
          {form.aiSummary && (
            <Field label="要約の編集" sub="AIの要約を自由に修正できます">
              <textarea value={form.aiSummary} onChange={(e) => setForm({ ...form, aiSummary: e.target.value })} rows={5} style={ta} />
            </Field>
          )}
        </>
      )}

      <SectionHeader icon={<IcZap size={16} />} title="次の 1 週間でやる行動" />
      <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 10, lineHeight: 1.5 }}>本を読みっぱなしにしないために、具体的な行動を 1〜3 つ書きましょう。</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(form.actions || []).map((a, i) => (
          <div key={i} style={{ background: "#f7f3ec", borderRadius: 10, padding: "12px 14px", display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={a.text} onChange={(e) => updateAction(i, "text", e.target.value)} placeholder={i === 0 ? "例：営業会議で結論ファーストを実践" : `行動 ${i + 1}`} style={{ ...inp, flex: 1 }} />
              <button onClick={() => removeAction(i)} style={{ background: "none", border: "none", fontSize: 16, color: "#c4a0a0", cursor: "pointer" }}>×</button>
            </div>
            {/* 期限 */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--c-ink-2)", minWidth: 56 }}>📅 期限</span>
              <input type="date" value={a.deadline || ""} onChange={(e) => updateAction(i, "deadline", e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
            {/* 優先度 chips */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: "var(--c-ink-2)", minWidth: 56 }}><Target size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />優先度</span>
              {[
                { key: 'high', label: '🔴 高', bg: '#FFEBEE', fg: '#C62828' },
                { key: 'medium', label: '🟡 中', bg: '#FFF3E0', fg: '#E65100' },
                { key: 'low', label: '🟢 低', bg: '#E8F5E9', fg: '#2E7D32' },
              ].map((p) => {
                const active = (a.priority || 'medium') === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => updateAction(i, 'priority', p.key)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: active ? `1.5px solid ${p.fg}` : '1px solid var(--c-hairline-strong)',
                      background: active ? p.bg : 'transparent',
                      color: active ? p.fg : '#8a7e6b',
                      fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {/* 繰り返し */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--c-ink-2)", minWidth: 56 }}>🔁 繰り返し</span>
              <select
                value={a.recurrence || ''}
                onChange={(e) => updateAction(i, 'recurrence', e.target.value || null)}
                style={{ ...inp, flex: 1 }}
              >
                <option value="">繰り返さない</option>
                <option value="weekly">毎週</option>
                <option value="monthly">毎月</option>
              </select>
            </div>
            {/* ソース引用ページ — 本紐付けは既に DonePhase の本コンテキストで自明なのでページのみ */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--c-ink-2)", minWidth: 56 }}>🔗 引用ページ</span>
              <input
                type="number"
                placeholder="例：42"
                value={a.sourcePage || ''}
                onChange={(e) => updateAction(i, 'sourcePage', e.target.value ? parseInt(e.target.value, 10) : null)}
                style={{ ...inp, flex: 1 }}
                inputMode="numeric"
              />
            </div>
          </div>
        ))}
        <button onClick={addAction} style={{ ...btnO, padding: "10px 0", fontSize: 12, borderStyle: "dashed" }}>＋ 行動を追加</button>
      </div>

      <Field label="💡 一番の収穫（1行）" sub="この本から得た一番大きな価値を 1 行で">
        {/* input → textarea (rows=3) に変更。シングルライン input だと placeholder が
            画面幅で見切れる問題があった。placeholder も短く具体的に。 */}
        <textarea
          value={form.roiSummary || ""}
          onChange={(e) => setForm({ ...form, roiSummary: e.target.value })}
          placeholder="例：意思決定が速くなる思考法を獲得"
          rows={3}
          style={{ ...ta, minHeight: 84 }}
          maxLength={LIMITS.memoText}
        />
      </Field>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 8 }}>保存</button>
    </div>
  );
}

/* ========== AI Book Advisor ========== */
// ガイド付きヒアリング（ウィザード）の共通スタイル。
const advisorWizardCard = {
  background: '#f7f3ec',
  border: '1px solid var(--c-hairline)',
  borderRadius: 16,
  padding: '16px 16px',
  marginTop: 8,
  animation: 'fadeIn .25s',
};
const advisorOptionChip = {
  width: '100%',
  textAlign: 'left',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid var(--c-hairline-strong)',
  background: 'var(--c-card)',
  color: 'var(--c-ink)',
  fontSize: 15,
  fontFamily: 'inherit',
  lineHeight: 1.5,
  cursor: 'pointer',
  minHeight: 48,
  WebkitTapHighlightColor: 'rgba(92,74,46,0.18)',
  touchAction: 'manipulation',
};

const ADVISOR_EXAMPLES = [
  '営業成績を上げたい',
  'チームマネジメント',
  '自信を持ちたい',
  '時間管理',
  'お金の不安',
];

// ヒアリングの最大ラウンド数。AI は途中で done を返せるが、上限で必ず締める。
const MAX_INTERVIEW_ROUNDS = 3;

function BookAdvisor({ onAddBook, sessionApi, books }) {
  // 旧: 挨拶 seed メッセージで例を箇条書き → サブタブ画面では冗長
  // (タップ不可で文字を読まされるだけ)。例はチップ UI に分離した。
  // 「📚 読みたいに追加」のタップ受付を触覚で即時 ack するため。
  const advisorHaptic = useHaptic();
  const advisorToast = useToast();
  const advisorConfirm = useConfirm();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [recommendations, setRecommendations] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  // 直近の「ユーザーの課題」入力 — 本棚に追加した時に source_query として
  // 持ち回り、読書計画シートの投資目的にプレフィルする。
  const [lastUserQuery, setLastUserQuery] = useState('');
  // 「📚 読みたいに追加」を押した本のタイトル set。
  // 連打防止 + UI 即時反映 (ボタンを「✅ 追加済み」表示に切替) の両方を担う。
  // 旧実装は addingTitle を「処理中の本」のロックに使い、AI 要約と DB
  // insert を await してから state を戻していたため、ボタンの反応に
  // 5〜15 秒かかっていた。新実装はクリック時 UI を即更新、すべての I/O は
  // .then() で fire-and-forget。失敗時のみ rollback。
  const [addedTitles, setAddedTitles] = useState(() => new Set());
  // 「読みたいに追加」押下後に search の strict match 結果を確認させる
  // モーダル。{ rec, candidates } | null。確認後に proceedAdd(verifiedRec)
  // を呼んで実際の DB insert に進む。
  const [confirmAdd, setConfirmAdd] = useState(null);
  // 履歴サブビュー: 'chat' | 'history' | 'detail'
  const [view, setView] = useState('chat');
  const [selectedSession, setSelectedSession] = useState(null);
  // 現在進行中のセッション ID。null なら次回送信時に createSession で新規作成。
  const [currentSessionId, setCurrentSessionId] = useState(null);
  // ── ガイド付きヒアリング（チップ選択ウィザード）の状態 ───────────────────
  // 旧来の「4 問を一括テキストで投げて自由記述で受ける」摩擦を解消するため、
  // 初回の相談内容から AI が質問セットを設計 → 1 問ずつ選択肢タップで答える。
  const [concern, setConcern] = useState('');            // 初回の相談（課題）
  const [interview, setInterview] = useState(null);      // [{q, options[]}] | null
  const [interviewStep, setInterviewStep] = useState(0); // 現在の質問 index
  const [interviewRound, setInterviewRound] = useState(1); // 現在のヒアリング周回（1..MAX）
  const [interviewAnswers, setInterviewAnswers] = useState([]); // [{q, a}] 全周通算
  const [interviewLoading, setInterviewLoading] = useState(false); // 質問生成中
  const [otherMode, setOtherMode] = useState(false);     // 「その他」自由入力モード
  const [otherText, setOtherText] = useState('');
  const [multiSelected, setMultiSelected] = useState([]); // 複数選択質問の選択中の答え
  const [recoLoading, setRecoLoading] = useState(false); // 推薦生成中
  const [recoError, setRecoError] = useState(null);
  // Strict auto-scroll: only when a real append happens. Initial seed
  // message + any case where we would scroll from a zero baseline are
  // explicitly excluded so re-mounting the component (sub-tab switch)
  // can't pull the viewport down.
  const messagesEndRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const seedHydratedRef = useRef(false);
  useEffect(() => {
    if (!seedHydratedRef.current) {
      seedHydratedRef.current = true;
      prevMsgCountRef.current = messages.length;
      return;
    }
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (prev <= 0) return;
    if (messages.length <= prev) return;
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 30);
  }, [messages]);
  // Auto-grow textarea: clamp 60–200px, scroll past 200.
  const inputRef = useRef(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(Math.max(el.scrollHeight, 60), 200) + 'px';
  }, [input]);

  // Parse the new richer response: leading prose + JSON recs + trailing prose.
  const parseAdvisorResponse = (text) => {
    const match = text.match(/RECOMMENDATIONS_START\s*([\s\S]*?)\s*RECOMMENDATIONS_END/);
    if (!match) return { recs: null, prose: text };
    let recs = null;
    try {
      const arr = JSON.parse(match[1]);
      if (Array.isArray(arr)) {
        recs = arr.filter((r) => r && typeof r.title === 'string');
      }
    } catch { /* keep recs null */ }
    if (!recs || recs.length === 0) return { recs: null, prose: text };
    const before = text.slice(0, match.index).trim();
    const after = text.slice(match.index + match[0].length).trim();
    return {
      recs,
      prose: { before, after },
    };
  };

  // 質問生成レスポンス（JSON）を堅牢にパース。純粋 JSON を指示しているが、
  // 前後に余計な文字が混ざっても最初の { 〜 最後の } を取り出して解釈する。
  // 返り値: { done: bool, questions: [...] } | null（パース不能）。
  const parseInterview = (text) => {
    if (typeof text !== 'string') return null;
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      const obj = JSON.parse(text.slice(s, e + 1));
      const done = obj?.done === true;
      const qs = Array.isArray(obj?.questions) ? obj.questions : [];
      const cleaned = qs
        .filter((q) => q && typeof q.q === 'string' && q.q.trim())
        .map((q) => ({
          q: q.q.trim(),
          multi: q.multi === true,
          options: Array.isArray(q.options)
            ? q.options
                .filter((o) => typeof o === 'string' && o.trim())
                .map((o) => o.trim())
                .slice(0, 4)
            : [],
        }))
        .filter((q) => q.options.length >= 2)
        .slice(0, 3);
      return { done, questions: cleaned };
    } catch {
      return null;
    }
  };

  // 1 ラウンド分のヒアリング質問を AI に設計させる。これまでの回答を渡して
  // 「掘り下げ」を依頼する。返り値: 質問配列（続行）/ [] （done = 締めて推薦へ）/
  // null（生成・解釈失敗 → 呼び出し側で fallback）。
  const runInterviewRound = async (c, priorAnswers, round) => {
    const priorQA = (priorAnswers || []).map((x) => `Q. ${x.q}\nA. ${x.a}`).join('\n');
    let text = '';
    try {
      text = await callClaude(
        PROMPTS.advisorInterview.system,
        PROMPTS.advisorInterview.user({ concern: c, priorQA, round, maxRounds: MAX_INTERVIEW_ROUNDS }),
        { max_tokens: 700, temperature: 0.4 },
      );
    } catch {
      return null;
    }
    const parsed = parseInterview(text);
    if (!parsed) return null;
    // done でも質問が来ていても、最終ラウンドなら締める。
    if (parsed.done || round > MAX_INTERVIEW_ROUNDS) return [];
    return parsed.questions;
  };

  // 集めた回答を束ねて推薦生成へ。
  const proceedToRecommend = (answers) => {
    const lines = (answers || []).map((x) => `Q. ${x.q}\nA. ${x.a}`).join('\n');
    const compiled =
      `【相談内容】\n${concern}\n\n【ヒアリングの回答】\n${lines}\n\n` +
      `以上でヒアリングは十分です。これ以上質問せず、上記を踏まえて、その人に本当に刺さる実在の本を推薦してください。`;
    setInterview(null);
    generateRecommendations(compiled, concern);
  };

  // 推薦生成 — ヒアリング完了後（または fallback の直接相談）に bookAdvisor を
  // 1 回ストリーム。userMsg は AI へ渡す本文、sourceQuery は本棚追加時の
  // source_query（投資目的プレフィル）に使う「ユーザーの元の課題」。
  const generateRecommendations = async (userMsg, sourceQuery) => {
    if (!userMsg || recoLoading) return;
    setRecoError(null);
    setRecoLoading(true);
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory);

    let finalText = '';
    try {
      finalText = await streamClaude({
        system: PROMPTS.bookAdvisor.system,
        messages: newHistory,
        // temperature 0.7 — 推薦に多様性を出す（同じ著者ばかりにならない）。
        temperature: 0.7,
        max_tokens: 2048,
        model: 'claude-sonnet-4-6',
      });
    } catch (e) {
      setRecoError(toMessage(e, '通信エラーが発生しました。もう一度お試しください。'));
      setRecoLoading(false);
      return;
    }

    track('ai_used', { feature: 'advisor' });

    const { recs, prose } = parseAdvisorResponse(finalText);
    let nextRecs = null;
    if (recs) {
      // 提案された本は「全部」表示する。以前は findIsbnCandidates で実在確認できた
      // 本だけに絞っていたが、Google Books 429 / NDL 照合の厳格さで「実在する本でも
      // 確認できない」ことが多く、5 冊提案でも 1 冊しか出ない事故になっていた。
      // 「実在しない本を出さない」担保は bookAdvisor プロンプト側の厳格ルールに任せ、
      // ISBN は本棚追加時に解決する（Amazon リンクは title+author 検索で十分機能する）。
      const finalList = recs.slice(0, 5);
      setRecommendations({
        items: finalList,
        before: prose?.before || '',
        after: prose?.after || '',
      });
      setLastUserQuery(sourceQuery || userMsg);
      nextRecs = finalList;
    } else {
      // 推薦 JSON が取れなかった → プロンプト本文をそのまま 1 吹き出しで提示。
      setMessages([{ role: 'assistant', text: finalText }]);
    }
    const nextHistory = [...newHistory, { role: 'assistant', content: finalText }];
    setChatHistory(nextHistory);

    if (sessionApi?.available) {
      try {
        if (!currentSessionId) {
          const created = await sessionApi.createSession({
            messages: nextHistory,
            recommendedBooks: nextRecs || [],
          });
          if (created?.id) setCurrentSessionId(created.id);
        } else {
          const patch = { messages: nextHistory };
          if (nextRecs) patch.recommended_books = nextRecs;
          await sessionApi.updateSession(currentSessionId, patch);
        }
      } catch {
        // 永続化失敗は UX を壊さない
      }
    }
    setRecoLoading(false);
  };

  // 初回の相談を受けて、第 1 ラウンドのヒアリング質問を設計させる。
  // 失敗（生成エラー / JSON 解釈不能）時はヒアリングを skip して直接推薦へ。
  const startInterview = async (rawConcern) => {
    if (interviewLoading || recoLoading) return;
    const c = clamp(sanitizeForPrompt(rawConcern || ''), LIMITS.aiQuestion);
    if (!c) return;
    setConcern(c);
    setInput('');
    setOtherMode(false);
    setOtherText('');
    setMultiSelected([]);
    setInterviewAnswers([]);
    setInterviewStep(0);
    setInterviewRound(1);
    setInterviewLoading(true);
    const qs = await runInterviewRound(c, [], 1);
    setInterviewLoading(false);
    if (qs === null || qs.length === 0) {
      // 質問を組めなかった / いきなり done → 相談内容だけで直接推薦（graceful）
      // 注: concern state はまだ反映前なので c を直接渡す。
      const lines = '';
      const compiled =
        `【相談内容】\n${c}\n\n【ヒアリングの回答】\n${lines || '（なし）'}\n\n` +
        `上記を踏まえて、その人に本当に刺さる実在の本を推薦してください。`;
      generateRecommendations(compiled, c);
      return;
    }
    setInterview(qs);
    setInterviewStep(0);
  };

  // 質問への回答（選択肢タップ or その他自由入力）。
  const answerQuestion = (answer) => {
    if (!interview) return;
    const a = clamp(sanitizeForPrompt(String(answer || '')), 120);
    if (!a) return;
    try { advisorHaptic.light(); } catch { /* non-critical */ }
    const q = interview[interviewStep];
    const nextAnswers = [...interviewAnswers, { q: q.q, a }];
    setInterviewAnswers(nextAnswers);
    setOtherMode(false);
    setOtherText('');
    setMultiSelected([]);
    if (interviewStep + 1 < interview.length) {
      // 同じラウンドの次の質問へ
      setInterviewStep(interviewStep + 1);
      return;
    }
    // このラウンドの質問をすべて回答 → AI に「さらに深掘りするか / 締めるか」を判断させる。
    if (interviewRound >= MAX_INTERVIEW_ROUNDS) {
      proceedToRecommend(nextAnswers);
      return;
    }
    const nextRound = interviewRound + 1;
    setInterview(null);
    setInterviewLoading(true);
    (async () => {
      const qs = await runInterviewRound(concern, nextAnswers, nextRound);
      setInterviewLoading(false);
      if (qs === null || qs.length === 0) {
        // done もしくは失敗 → 集めた回答で推薦へ
        proceedToRecommend(nextAnswers);
        return;
      }
      // さらに深掘りラウンドへ
      setInterview(qs);
      setInterviewStep(0);
      setInterviewRound(nextRound);
    })();
  };

  // ひとつ前の質問へ戻る（最初の質問で戻ると相談入力に戻る）。
  const goBackQuestion = () => {
    setOtherMode(false);
    setOtherText('');
    setMultiSelected([]);
    if (interviewStep <= 0) {
      // ラウンド先頭で戻る → 相談入力に戻す（多段の途中状態はクリア）
      setInterview(null);
      setInterviewAnswers([]);
      setInterviewRound(1);
      setInput(concern);
      return;
    }
    setInterviewStep(interviewStep - 1);
    setInterviewAnswers(interviewAnswers.slice(0, -1));
  };

  // すべてリセットして最初の相談入力に戻す（「別の条件で探す」用）。
  const resetToConcern = () => {
    setMessages([]);
    setRecommendations(null);
    setRecoError(null);
    setInterview(null);
    setInterviewAnswers([]);
    setInterviewStep(0);
    setInterviewRound(1);
    setOtherMode(false);
    setOtherText('');
    setMultiSelected([]);
    setInput('');
  };

  // 新規セッション開始: 既存会話は DB に残し、フロント state だけクリア。
  const startNewSession = () => {
    setMessages([]);
    setChatHistory([]);
    setRecommendations(null);
    setLastUserQuery('');
    setCurrentSessionId(null);
    setSelectedSession(null);
    // ガイド付きヒアリングの途中状態もすべてクリア
    setConcern('');
    setInterview(null);
    setInterviewAnswers([]);
    setInterviewStep(0);
    setInterviewRound(1);
    setInterviewLoading(false);
    setOtherMode(false);
    setOtherText('');
    setMultiSelected([]);
    setRecoError(null);
    setView('chat');
  };

  // 履歴詳細から「💬 この会話を続ける」が押されたら、その session の状態を
  // フロントに復元し、以降のメッセージはその session に紐付く。
  const resumeSession = (s) => {
    if (!s) return;
    const histMessages = Array.isArray(s.messages) ? s.messages : [];
    setChatHistory(histMessages);
    setMessages(
      histMessages.map((m) => ({
        role: m.role,
        text: (m.content ?? m.text ?? '').toString(),
      })),
    );
    const recsList = Array.isArray(s.recommended_books) ? s.recommended_books : [];
    setRecommendations(recsList.length > 0 ? { items: recsList, before: '', after: '' } : null);
    // 直近の user 発話を lastUserQuery として復元 → 「読みたいに追加」時の sourceQuery に使う
    const lastUser = [...histMessages].reverse().find((m) => m.role === 'user');
    setLastUserQuery((lastUser?.content || lastUser?.text || '').toString());
    setCurrentSessionId(s.id);
    setSelectedSession(null);
    setView('chat');
  };

  const isEmpty = messages.length === 0 && !recommendations;
  // ガイド付きヒアリングのいずれかが動いている = 相談入力フェーズではない。
  const inInterview = !!interview || interviewLoading || recoLoading;
  // 相談入力（textarea + 例チップ）を出すのは「真っさらな初期状態」だけ。
  const showConcernInput = isEmpty && !inInterview;
  const chatScrollRef = useRef(null);

  // ---------------------------------------------------------------------------
  // 「📚 読みたいに追加」フロー
  //
  //   1. handleClickAdd(rec): UI を即「✅ 追加済み」に切替 (< 5ms)、裏で
  //      searchBooksAPIFlat を走らせる
  //   2. strict match で絞り込んだ candidates が 1 件以上あれば確認モーダルへ
  //      → AdvisorAddConfirmModal で視覚確認 → 選んだ candidate の isbn /
  //      cover を rec に焼き込んで proceedAdd を呼ぶ
  //   3. candidates が 0 件なら確認モーダル skip → そのまま proceedAdd (rec
  //      は title/author だけ。addFromAdvisor 側の bg resolver に解決を任せる)
  // ---------------------------------------------------------------------------
  const proceedAdd = (verifiedRec) => {
    // すべての I/O を Promise.resolve().then で次の tick へ。handler 同期維持。
    Promise.resolve().then(async () => {
      let summary = null;
      try {
        summary = await summarizeAdvisorConversation(messages, verifiedRec);
      } catch {
        /* 要約失敗は非クリティカル。空のまま保存に進む。 */
      }
      try {
        const saved = await onAddBook(verifiedRec, {
          sourceQuery: lastUserQuery,
          investPurpose: summary?.investPurpose || lastUserQuery || '',
          currentChallenge: summary?.currentChallenge || '',
          hypothesis: summary?.hypothesis || '',
          bookReason: summary?.bookReason || (verifiedRec.why || ''),
        });
        if (saved?.id && currentSessionId && sessionApi?.available) {
          try { await sessionApi.addBookToSession(currentSessionId, saved.id); } catch { /* non-critical */ }
        }
      } catch {
        setAddedTitles((prev) => {
          const next = new Set(prev);
          next.delete(verifiedRec.title);
          return next;
        });
      }
    });
  };

  const handleClickAdd = (rec) => {
    if (addedTitles.has(rec.title)) return;
    // 触覚で即時 ack (画面の見た目とは別経路で「タップ受付」を確実に伝える)。
    try { advisorHaptic.light(); } catch { /* non-critical */ }
    // UI を即「✅ 追加済み」に切替 (連打防止 + 視覚 ack)。失敗時は rollback。
    setAddedTitles((prev) => {
      const next = new Set(prev);
      next.add(rec.title);
      return next;
    });
    // 裏で search → strict match で確認モーダルへ。失敗時はそのまま proceedAdd。
    Promise.resolve().then(async () => {
      try {
        const results = await searchBooksAPIFlat(`${rec.title} ${rec.author || ''}`);
        const matched = (results || [])
          .filter((r) => isStrictMatch(r, { title: rec.title, author: rec.author }))
          .slice(0, 4);
        if (matched.length === 0) {
          // 該当なし → 旧フローに任せる (addFromAdvisor 内で再 search +
          // bg resolver が title/author から ISBN を探す)
          proceedAdd(rec);
          return;
        }
        // 1 件以上 → 視覚確認モーダルへ。AddedTitles はすでに反映済みだが、
        // ユーザーがキャンセルしたら rollback する (handleConfirmCancel で対応)。
        setConfirmAdd({ rec, candidates: matched });
      } catch {
        // search 失敗時は直接追加へフォールバック
        proceedAdd(rec);
      }
    });
  };

  const handleConfirmCandidate = (candidate) => {
    if (!confirmAdd) return;
    const { rec } = confirmAdd;
    setConfirmAdd(null);
    // candidate の isbn / cover を rec に焼き込んで「視覚的に確認済み」と
    // して proceedAdd へ。addFromAdvisor 側はこれを信頼してそのまま保存
    // する (再 search なし)。
    proceedAdd({
      ...rec,
      isbn: candidate.isbn || rec.isbn || '',
      cover: candidate.cover || '',
    });
  };

  const handleConfirmCancel = () => {
    if (!confirmAdd) return;
    const { rec } = confirmAdd;
    setConfirmAdd(null);
    // 「✅ 追加済み」を rollback (ユーザーが追加を取りやめたため)。
    setAddedTitles((prev) => {
      const next = new Set(prev);
      next.delete(rec.title);
      return next;
    });
  };

  // 新メッセージ追加時に最下部へオートスクロール (LINE 挙動)。
  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, recommendations]);

  // 履歴サブビューでは入力欄を出さず、専用 UI に切り替える。
  if (view === 'history') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="chat-scroll">
          <Suspense fallback={<Spinner />}>
            <AdvisorHistoryList
              sessions={sessionApi?.sessions || []}
              loaded={!!sessionApi?.loaded}
              onSelect={(s) => { setSelectedSession(s); setView('detail'); }}
              onClose={() => setView('chat')}
              onDelete={async (sid) => {
                const ok = await advisorConfirm({
                  title: 'この履歴を削除しますか？',
                  message: '選んだ会話履歴を削除します。元に戻せません。',
                  confirmLabel: '削除する',
                  cancelLabel: 'キャンセル',
                  danger: true,
                });
                if (!ok) return;
                try {
                  await sessionApi?.deleteSession?.(sid);
                  advisorHaptic.medium();
                  advisorToast.success('履歴を削除しました');
                } catch (e) {
                  advisorToast.error(toMessage(e, '履歴の削除に失敗しました。'));
                }
              }}
            />
          </Suspense>
        </div>
      </div>
    );
  }
  if (view === 'detail' && selectedSession) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="chat-scroll">
          <Suspense fallback={<Spinner />}>
            <AdvisorSessionDetail
              session={selectedSession}
              books={books}
              onAddBook={onAddBook}
              onResume={resumeSession}
              onNewSession={startNewSession}
              onClose={() => { setSelectedSession(null); setView('history'); }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Scroll 領域: ヘッダー / 例チップ / メッセージ / 推薦カード をまとめる */}
      <div ref={chatScrollRef} className="chat-scroll">
      {/* Unified AI section header (マイ読書脳 と同じフォーマット)。
          ✕ ボタンはタブ画面では不要なので撤去。 */}
      <div className="ai-section-header" style={{ padding: 0, marginBottom: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>AI 選書アドバイザー</h2>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {sessionApi?.available && (
            <button
              type="button"
              onClick={() => setView('history')}
              aria-label="履歴を見る"
              title="履歴"
              style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid var(--c-hairline-strong)', background: 'transparent', color: 'var(--c-brand)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', minHeight: 32 }}
            >
              <IcHistory size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />
              履歴
            </button>
          )}
          {(messages.length > 0 || recommendations) && (
            <button
              type="button"
              onClick={startNewSession}
              aria-label="新しい会話を始める"
              title="新規"
              style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid var(--c-hairline-strong)', background: 'transparent', color: 'var(--c-brand)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', minHeight: 32 }}
            >
              <IcNewChat size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />
              新規
            </button>
          )}
        </div>
      </div>

      {/* Example chips — タップで textarea に流し込む。挨拶 seed が
          消えたので、何を入力すれば良いかをここで提示する */}
      {showConcernInput && (
        <div className="example-chips">
          <p className="example-chips-label">
            <IcBulb size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
            例（タップで入力）
          </p>
          {ADVISOR_EXAMPLES.map((ex) => (
            <button
              type="button"
              key={ex}
              className="example-chip"
              onClick={() => setInput(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* ガイド付きヒアリング — 質問生成中のローディング（初回 or 深掘り） */}
      {interviewLoading && (
        <div style={advisorWizardCard}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>
            {interviewAnswers.length > 0
              ? '🔎 回答をもとに、さらに深掘りしています…'
              : '🤔 あなたに合わせた質問を準備しています…'}
          </p>
          <div className="ai-skeleton" aria-label="質問を準備中" style={{ marginTop: 12 }}>
            <div className="ai-skeleton-line" style={{ width: '82%' }} />
            <div className="ai-skeleton-line" style={{ width: '64%' }} />
          </div>
        </div>
      )}

      {/* ガイド付きヒアリング — 1 問ずつチップで回答するウィザード */}
      {interview && !recoLoading && (() => {
        const total = interview.length;
        const q = interview[interviewStep];
        const stepNo = interviewStep + 1;
        const isMulti = q.multi === true;
        const toggleMulti = (opt) => {
          try { advisorHaptic.light(); } catch { /* non-critical */ }
          setMultiSelected((prev) =>
            prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
          );
        };
        return (
          <div style={advisorWizardCard}>
            {/* 進捗バー + 戻る */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <button
                type="button"
                onClick={goBackQuestion}
                aria-label={interviewStep === 0 ? '相談入力に戻る' : '前の質問に戻る'}
                style={{ background: 'none', border: 'none', color: 'var(--c-ink-2)', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1, minHeight: 32, minWidth: 32 }}
              >
                ←
              </button>
              <div style={{ flex: 1, display: 'flex', gap: 4 }} aria-hidden="true">
                {interview.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: i <= interviewStep ? 'var(--c-brand)' : 'var(--c-hairline)',
                      transition: 'background .25s',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--c-ink-2)', fontWeight: 600, flexShrink: 0 }}>
                {interviewRound > 1 ? `深掘り${interviewRound} · ` : ''}{stepNo}/{total}
              </span>
            </div>

            {/* これまでの回答（小チップ） */}
            {interviewAnswers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {interviewAnswers.map((x, i) => (
                  <span
                    key={i}
                    style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: '#eee7da', color: 'var(--c-ink-2)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    ✓ {x.a}
                  </span>
                ))}
              </div>
            )}

            {/* 質問文 */}
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-ink)', lineHeight: 1.6, margin: '0 0 4px' }}>
              {q.q}
            </p>
            {/* 複数選択できる質問は明示（タップで複数選べる安心感） */}
            <p style={{ fontSize: 11, color: '#8a7c66', margin: '0 0 12px' }}>
              {isMulti ? '当てはまるものを選んでください（複数可）' : '1 つ選んでください'}
            </p>

            {/* 選択肢チップ（縦並び・全幅タップ） */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((opt) => {
                const selected = isMulti && multiSelected.includes(opt);
                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => (isMulti ? toggleMulti(opt) : answerQuestion(opt))}
                    aria-pressed={isMulti ? selected : undefined}
                    style={{
                      ...advisorOptionChip,
                      ...(selected
                        ? { background: '#efe7d3', borderColor: 'var(--c-brand)', color: 'var(--c-ink)', fontWeight: 600 }
                        : null),
                    }}
                  >
                    {isMulti ? `${selected ? '☑️' : '⬜️'} ${opt}` : opt}
                  </button>
                );
              })}

              {/* その他（自由入力）。複数選択モードでは選択肢に「追加」する。 */}
              {!otherMode ? (
                <button
                  type="button"
                  onClick={() => setOtherMode(true)}
                  style={{ ...advisorOptionChip, color: 'var(--c-ink-2)', borderStyle: 'dashed' }}
                >
                  ✏️ その他（自由に入力）
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <input
                    type="text"
                    autoFocus
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    placeholder="自由に入力…"
                    maxLength={120}
                    aria-label="その他の回答を自由入力"
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!otherText.trim()) return;
                        if (isMulti) {
                          toggleMulti(otherText.trim());
                          setOtherText('');
                          setOtherMode(false);
                        } else {
                          answerQuestion(otherText);
                        }
                      }
                    }}
                    style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--c-hairline-strong)', background: '#fff', color: 'var(--c-ink)', fontSize: 16, fontFamily: 'inherit', minHeight: 48 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!otherText.trim()) return;
                      if (isMulti) {
                        toggleMulti(otherText.trim());
                        setOtherText('');
                        setOtherMode(false);
                      } else {
                        answerQuestion(otherText);
                      }
                    }}
                    disabled={!otherText.trim()}
                    aria-label={isMulti ? '選択肢に追加' : 'この内容で回答'}
                    style={{ flexShrink: 0, padding: '0 16px', borderRadius: 12, border: 'none', background: otherText.trim() ? 'var(--c-brand)' : 'var(--c-hairline-strong)', color: 'var(--c-card)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: otherText.trim() ? 'pointer' : 'not-allowed', minHeight: 48 }}
                  >
                    {isMulti ? '追加' : '決定'}
                  </button>
                </div>
              )}

              {/* 複数選択モードの確定ボタン */}
              {isMulti && (
                <button
                  type="button"
                  onClick={() => { if (multiSelected.length) answerQuestion(multiSelected.join('、')); }}
                  disabled={multiSelected.length === 0}
                  style={{
                    marginTop: 4,
                    padding: '13px 0',
                    borderRadius: 12,
                    border: 'none',
                    background: multiSelected.length ? 'var(--c-brand)' : 'var(--c-hairline-strong)',
                    color: 'var(--c-card)',
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: multiSelected.length ? 'pointer' : 'not-allowed',
                    minHeight: 48,
                  }}
                >
                  {multiSelected.length ? `決定（${multiSelected.length}件）→` : '1つ以上選んでください'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 推薦生成中のローディング */}
      {recoLoading && (
        <div style={advisorWizardCard}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>
<IcSparkles size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />あなたにぴったりの本を選んでいます…
          </p>
          <div className="ai-skeleton" aria-label="本を選んでいます" style={{ marginTop: 12 }}>
            <div className="ai-skeleton-line" style={{ width: '90%' }} />
            <div className="ai-skeleton-line" style={{ width: '76%' }} />
            <div className="ai-skeleton-line" style={{ width: '58%' }} />
          </div>
        </div>
      )}

      {/* 推薦生成エラー（リトライ可能） */}
      {recoError && !recoLoading && (
        <div style={{ ...advisorWizardCard, borderColor: '#e0b8a8' }}>
          <p style={{ fontSize: 13, color: 'var(--c-critical)', margin: 0, lineHeight: 1.7 }}>{recoError}</p>
          <button
            type="button"
            onClick={resetToConcern}
            style={{ ...btnO, padding: '10px 0', fontSize: 12, marginTop: 12 }}
          >
            <IcRefresh size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
            もう一度はじめから
          </button>
        </div>
      )}

      {/* Messages — chat-scroll が overflow を担うため、ここは
          flex column のレイアウトのみ。height: auto。 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px", borderRadius: 14,
              background: m.role === "user" ? "var(--c-brand)" : "#f7f3ec",
              color: m.role === "user" ? "var(--c-card)" : "var(--c-ink)",
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
              borderBottomRightRadius: m.role === "user" ? 4 : 14,
              borderBottomLeftRadius: m.role === "user" ? 14 : 4,
            }}>
              {/* 空の assistant 吹き出し (= 最初の delta 到達前) は
                  skeleton + thinking dot で「待っている感覚」を最小化。
                  delta が来始めたら通常テキスト + 点滅カーソルに切り替え。 */}
              {m.streaming && !m.text ? (
                <div className="ai-skeleton" aria-label="AI が回答を作成しています">
                  <div className="ai-skeleton-line" style={{ width: '88%' }} />
                  <div className="ai-skeleton-line" style={{ width: '74%' }} />
                  <div className="ai-skeleton-line" style={{ width: '62%' }} />
                </div>
              ) : (
                <>
                  {m.text}
                  {m.streaming && m.text && <span className="streaming-cursor" aria-hidden="true" />}
                </>
              )}
            </div>
          </div>
        ))}

        {/* Recommendations — richer per-book card with reasoning */}
        {recommendations && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeIn .3s" }}>
            {/* 「## 👋 はじめに」等の前置きを Markdown として描画（生の ## を出さない）。
                末尾の空見出し「## 📚 おすすめの本」は本カードと重複するので除去。 */}
            {recommendations.before && (() => {
              const intro = recommendations.before.replace(/\n*##\s*📚\s*おすすめの本\s*$/u, '').trim();
              return intro ? <MarkdownSections text={intro} /> : null;
            })()}
            {recommendations.items.map((rec, i) => (
              <div key={i} style={{ background: "var(--c-card)", borderRadius: 16, border: "1px solid #f0ebe1", padding: "16px 16px", overflow: "hidden", boxShadow: "0 1px 3px rgba(60, 48, 30, 0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, color: "var(--c-ink-2)", margin: 0, fontWeight: 600 }}>#{i + 1}</p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "var(--c-ink)", margin: '2px 0 0' }}>『{rec.title}』</p>
                    <p style={{ fontSize: 12, color: "var(--c-ink-2)", marginTop: 2 }}>{rec.author}</p>
                  </div>
                </div>
                {rec.why && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: '#f5efde', borderRadius: 10, border: '1px solid #e8dcc0' }}>
                    <p style={{ fontSize: 10.5, color: '#9a7e44', fontWeight: 700, letterSpacing: '0.06em', margin: 0 }}>なぜあなたに</p>
                    <p style={{ fontSize: 12.5, color: 'var(--c-ink-soft)', lineHeight: 1.75, margin: '4px 0 0' }}>{rec.why}</p>
                  </div>
                )}
                {rec.core && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 10.5, color: '#8a7c5f', fontWeight: 700, letterSpacing: '0.06em', margin: 0 }}>この本の核心</p>
                    <p style={{ fontSize: 12.5, color: 'var(--c-ink-soft)', lineHeight: 1.75, margin: '3px 0 0' }}>{rec.core}</p>
                  </div>
                )}
                {rec.focus && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 10.5, color: '#8a7c5f', fontWeight: 700, letterSpacing: '0.06em', margin: 0 }}>注目ポイント</p>
                    <p style={{ fontSize: 12.5, color: 'var(--c-ink-soft)', lineHeight: 1.75, margin: '3px 0 0' }}>{rec.focus}</p>
                  </div>
                )}
                {rec.duration && (
                  <p style={{ fontSize: 11.5, color: 'var(--c-ink-2)', margin: '10px 0 0' }}>
                    <span style={{ color: '#8a7c5f', fontWeight: 700, letterSpacing: '0.04em' }}>目安</span>　{rec.duration}
                  </p>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  <a
                    href={getAmazonLink(rec)}
                    target="_blank"
                    rel={AMAZON_LINK_REL}
                    aria-label={`Amazon で『${rec.title}』を購入（外部リンク）`}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "#FF9900", color: "#000", fontSize: 12, fontFamily: "inherit", textAlign: "center", textDecoration: "none", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, whiteSpace: 'nowrap', touchAction: 'manipulation' }}
                  >
                    🛒 Amazon
                  </a>
                  <button
                    type="button"
                    disabled={addedTitles.has(rec.title)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClickAdd(rec);
                    }}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--c-hairline-strong)", background: addedTitles.has(rec.title) ? '#E0E0E0' : "transparent", color: addedTitles.has(rec.title) ? '#666' : "var(--c-brand)", fontSize: 12, fontFamily: "inherit", cursor: addedTitles.has(rec.title) ? "not-allowed" : "pointer", fontWeight: addedTitles.has(rec.title) ? 700 : 500, minHeight: 44, touchAction: 'manipulation', WebkitTapHighlightColor: 'rgba(92,74,46,0.18)' }}
                  >
                    {addedTitles.has(rec.title)
                      ? (<><IcCheck size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />追加済み</>)
                      : (<><IcBook size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読みたい</>)}
                  </button>
                </div>
              </div>
            ))}
            {/* 「## 📋 読む順番」「## 💬 まとめ」等は Markdown（表・見出し・箇条書き）
                として描画。生の `|---|` パイプや `##` が見えていた問題を解消。 */}
            {recommendations.after && <MarkdownSections text={recommendations.after} />}
            <small style={{ fontSize: 10, color: 'var(--c-ink-2)', lineHeight: 1.6, padding: '0 4px' }}>
              {AMAZON_DISCLOSURE_TEXT}
            </small>
            <button onClick={resetToConcern}
              style={{ ...btnO, padding: "10px 0", fontSize: 12 }}>
              <IcRefresh size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
              別の条件で探す
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      </div>{/* /chat-scroll */}

      {/* Input — flex column の末尾に置かれ、親 (.ai-page) の 100dvh 構造で
          自動的にキーボード直上 / BottomNav 直上に張り付く (LINE 風)。 */}
      {showConcernInput && (
        <div className="ai-input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="どんなことで本を探していますか？（例: 営業成績を上げたい）"
            rows={1}
            disabled={interviewLoading}
            maxLength={LIMITS.aiQuestion}
            aria-label="AI選書アドバイザーへの相談内容"
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                startInterview(input);
              }
            }}
          />
          <button
            type="button"
            className="send-btn"
            onClick={() => startInterview(input)}
            disabled={!input.trim() || interviewLoading}
            aria-label={interviewLoading ? '準備中' : '相談する'}
            title={interviewLoading ? '準備中…' : '相談する'}
          >
            {interviewLoading ? (
              <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 600 }}>…</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2 12 22 2 13 22 11 13 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      )}
      {confirmAdd && (
        <AdvisorAddConfirmModal
          original={confirmAdd.rec}
          candidates={confirmAdd.candidates}
          onConfirm={handleConfirmCandidate}
          onCancel={handleConfirmCancel}
        />
      )}
    </div>
  );
}

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
              transition: "color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out)",
            }}
          >
            <Icon size={24} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
            <span style={{ fontSize: 10.5, letterSpacing: "0.02em", fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)" }}>{t.label}</span>
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500;600&display=swap');
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
  const {
    books: rawBooks,
    loading: booksLoading,
    saveBook,
    deleteBook,
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
  // 次回起動で回復する。
  useEffect(() => { ensurePushSubscription(); }, []);
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
    onBack: () => {
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

  // Memo ops for the currently-open book (FAB / quick sheet / full editor handoff).
  // Always called so hook order stays stable; isUsableBookId guards inside the hook.
  const currentMemoOps = useBookMemos(current?.id, { sortBy: 'page' });

  // Books are now committed to DB on delete (no soft-delete state to filter).
  const books = rawBooks;

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

  // 本棚スクロール位置の復元: 本詳細(detail/edit)から本棚(list)に戻った時だけ、
  // 離脱前のスクロール位置へ戻す。長い本棚の途中で本を開いて戻ると先頭に飛ぶ
  // 「迷子」を解消する。タブ切替や通常表示は従来どおり先頭のまま（復元しない）。
  useEffect(() => {
    const cameFromBook = prevViewRef.current === 'detail' || prevViewRef.current === 'edit';
    prevViewRef.current = view;
    if (view === 'list' && tab === 'books' && cameFromBook && savedShelfScroll.current > 0) {
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
      enqueueCoverRetry({ book, saveBook });
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
      const updated = { ...book, cover: '', coverIsbn: '' };
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

      // ── ステップ 0（最優先・最速・最も確実）─────────────────────────
      // Google Books の imageLinks.thumbnail は実体保証された URL。ISBN 直引き →
      // タイトル+著者の厳格マッチの順で取得。ここで取れれば <img> 実在検証も不要。
      try {
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
  const openManualFromAdd = () => {
    setAddBookModalOpen(false);
    setForm({ ...emptyBook(), id: Date.now().toString(), addedVia: 'manual' });
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
        if (supabaseClient) {
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

  const handleSave = async () => {
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
      // 'manual' は手動アップロード済み → 触らない。
      let resolvedCover = form.cover;
      let resolvedCoverIsbn = form.coverIsbn;
      if (!resolvedCover && form.coverIsbn !== 'manual' && (form.title || form.isbn)) {
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
      }

      // 「保存して読書を開始する」相当の自動遷移条件:
      //   既存本 + form.status='before' + 投資目的 + (AI 解析 or 戦略) が揃っている。
      // 保存時に payload.status='reading' に上書き + startDate=今日にする。
      // form.status を見ているのは: editPhaseOverride で BeforePhase を強制
      // 表示しているだけの reading/done 本は対象外にしたいため (既に読書中の
      // 本の読書計画を編集しても再度 reading に戻るのは無意味)。
      const isSetupCompletion = !!current
        && form.status === 'before'
        && !!(form.investPurpose && form.investPurpose.trim())
        && !!(form.aiAnalysis || form.aiStrategy);

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
    }
  };

  const handleSaveSummaryFromForm = async (text) => {
    if (!form?.id) return;
    const merged = { ...form, leverageMemo: text };
    // rollback 用に直前値を退避（advanceStatus と同じ楽観的 UI パターン）
    const prevForm = form;
    const prevCurrent = current;
    try {
      const saved = await saveBook(merged);
      // saveBook は未接続時に throw せず null を返す。その場合 DB へ書けて
      // いないので、ローカル state を新値で確定すると「保存できたのにリロード
      // で巻き戻る」不整合になる。明示的に失敗として扱い rollback する。
      if (!saved) throw new Error('まとめメモを保存できませんでした。');
      const next = saved;
      // 📊 まとめ式メモ保存の計測（保存成功時のみ・mode の enum だけ・本文は送らない）。
      // カード式の insert と粒度を揃えるため、空→記入の「新規作成」遷移だけ数える
      // （既存まとめの編集再保存では二重計上しない）。
      if (!(prevForm?.leverageMemo || '').trim() && (text || '').trim()) {
        track('memo_added', { mode: 'summary' });
      }
      setForm((f) => ({ ...f, leverageMemo: next.leverageMemo ?? text }));
      if (prevCurrent && prevCurrent.id === next.id) setCurrent(next);
    } catch (error) {
      // 失敗時は退避した previous 値へ戻す（新値を残さない）
      setForm(prevForm);
      if (prevCurrent && prevCurrent.id === prevForm.id) setCurrent(prevCurrent);
      const msg = toMessage(error, 'まとめメモの保存に失敗しました。');
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const handleSaveSummaryFromCurrent = async (text) => {
    if (!current?.id) return;
    const merged = { ...current, leverageMemo: text };
    // rollback 用に直前値を退避
    const prevCurrent = current;
    const prevForm = form;
    try {
      const saved = await saveBook(merged);
      if (!saved) throw new Error('まとめメモを保存できませんでした。');
      const next = saved;
      // 📊 まとめ式メモ保存の計測（保存成功時のみ・mode の enum だけ・本文は送らない）。
      // カード式の insert と粒度を揃え、空→記入の「新規作成」遷移だけ数える。
      if (!(prevCurrent?.leverageMemo || '').trim() && (text || '').trim()) {
        track('memo_added', { mode: 'summary' });
      }
      setCurrent(next);
      if (prevForm && prevForm.id === next.id) {
        setForm((f) => ({ ...f, leverageMemo: next.leverageMemo ?? text }));
      }
    } catch (error) {
      setCurrent(prevCurrent);
      if (prevForm && prevForm.id === prevCurrent.id) setForm(prevForm);
      const msg = toMessage(error, 'まとめメモの保存に失敗しました。');
      toast.error(msg);
      throw new Error(msg);
    }
  };

  // Inner delete flow: snapshot, fire delete, show Undo toast. Used by both
  // the kebab "削除" button (with confirm) and the swipe-delete gesture
  // (which is already an explicit user intent, no confirm).
  const performBookDelete = async (book, { fromList = false } = {}) => {
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
      toast.success(msg);
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
        // ① Google Books の検証済みサムネ（取り直しボタンと同じ強い経路）
        try {
          const gb = await findCoverFromGoogleBooks({
            title: saved.title,
            author: saved.author,
            isbn: saved.isbn,
          });
          if (gb) { url = gb; coverIsbn = saved.isbn || ''; }
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
          await saveBook({ ...saved, cover: url, coverIsbn });
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
    const prev = {
      status: book.status,
      startDate: book.startDate,
      doneDate: book.doneDate,
    };
    const updated = { ...book, status: newStatus };
    if (newStatus === "before" && !updated.startDate) updated.startDate = new Date().toISOString().slice(0, 10);
    if (newStatus === "done" && !updated.doneDate) updated.doneDate = new Date().toISOString().slice(0, 10);

    // Optimistic update。読了・読書開始は「読む体験」の節目なので、編集フォームでは
    // なく本詳細に着地させる（読了の祝福・新バッジが自然な場所で出る／読書中はその場で
    // メモを始められる）。積読(before)は設計シートが主役なので従来どおり編集へ。
    setCurrent(updated);
    setForm({ ...emptyBook(), ...updated, tags: updated.tags || [], actions: updated.actions || [] });
    setView((newStatus === 'done' || newStatus === 'reading') ? 'detail' : 'edit');

    // Persist in background; roll back on failure.
    saveBook(updated)
      .then((saved) => {
        // 📊 ステータス遷移の計測（PII なし・to の enum だけ）。DB 保存が確定した
        // 時だけ数える（楽観更新→失敗 rollback の遷移を成功として二重計上しない）。
        if (saved && (newStatus === 'before' || newStatus === 'reading' || newStatus === 'done')) {
          track('status_changed', { to: newStatus });
        }
      })
      .catch((error) => {
        toast.error(toMessage(error, 'ステータス変更に失敗しました。'));
        const restored = { ...book, ...prev };
        setCurrent(restored);
        setForm({ ...emptyBook(), ...restored, tags: restored.tags || [], actions: restored.actions || [] });
        setView("edit");
      });

    const labels = { want: '読みたい', before: '積読', reading: '読書中', done: '読了' };
    const revert = async () => {
      const reverted = { ...book, ...prev };
      setCurrent(reverted);
      setForm({ ...emptyBook(), ...reverted, tags: reverted.tags || [], actions: reverted.actions || [] });
      setView("edit");
      try {
        await saveBook(reverted);
      } catch (error) {
        toast.error(toMessage(error, 'ステータス変更の取り消しに失敗しました。'));
      }
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
    let reason = "";
    if (book.roiSummary?.trim()) {
      reason = book.roiSummary.trim();
    } else if (book.aiSummary?.trim()) {
      reason = book.aiSummary.split("\n").filter((l) => l.trim())[0] || "";
    } else if (book.leverageMemo?.trim()) {
      reason = book.leverageMemo.split("\n").filter((l) => l.trim())[0] || "";
    }

    const link = getAmazonLink(book);
    const lines = [
      `📚 おすすめの本`,
      ``,
      `「${book.title}」${book.author ? `（${book.author}）` : ""}`,
    ];
    if (book.rating > 0) lines.push(`${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}`);
    if (reason) { lines.push(``); lines.push(`💡 ${reason}`); }
    lines.push(``);
    lines.push(`📖 Amazonで見る：`);
    lines.push(link);

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
    // ストリーミング開始前にフィールドをクリア。古い解析結果が残ると
    // onChunk で書き換わるまでに違和感が出る。
    setForm((f) => ({ ...f, aiAnalysis: '' }));
    try {
      await streamClaude({
        system: PROMPTS.bookAnalysis.system,
        messages: [{
          role: 'user',
          content: PROMPTS.bookAnalysis.user({ title: form.title, author: form.author }),
        }],
        max_tokens: 2048,
        model: 'claude-sonnet-4-6',
        onChunk: (fullText) => {
          setForm((f) => ({ ...f, aiAnalysis: fullText }));
        },
      });
      // 📊 AI 利用の計測（解析が throw せず完了した成功時のみ・feature の enum だけ）。
      track('ai_used', { feature: 'analysis' });
    } catch (error) {
      toast.error(toMessage(error, 'AI解析に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };
  const runStrategy = async () => {
    setAiLoading(true);
    setForm((f) => ({ ...f, aiStrategy: '' }));
    try {
      await streamClaude({
        system: PROMPTS.setupSheet.system,
        messages: [{
          role: 'user',
          content: PROMPTS.setupSheet.user({
            title: form.title,
            author: form.author,
            analysis: form.aiAnalysis,
            purpose: form.investPurpose,
            topTags: allTags.slice(0, 3),
          }),
        }],
        max_tokens: 2048,
        model: 'claude-sonnet-4-6',
        onChunk: (fullText) => {
          // 関連書籍カードのパース (= 「読みたい」ボタン押下可能) は
          // streaming 中は BeforePhase 側で aiLoading を見て無効化している。
          // MarkdownSections は 1 chunk ごとに再 render する形になるが、
          // テキスト量は 2KB 以下で十分軽い。
          setForm((f) => ({ ...f, aiStrategy: fullText }));
        },
      });
      // Fresh generation invalidates any prior 修正リクエスト history.
      if (form?.id) clearStrategyHistory(form.id);
    } catch (error) {
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
    setAiLoading(true);
    // 修正中は一旦シートを空にして「上書きしているんだ」と視覚化。
    // 失敗時は finally で prev に戻す。
    setForm((f) => ({ ...f, aiStrategy: '' }));
    let didStreamAny = false;
    try {
      await streamClaude({
        system: PROMPTS.setupSheetEdit.system,
        messages: [{
          role: 'user',
          content: PROMPTS.setupSheetEdit.user({
            existing: prev,
            instruction,
            title: form.title,
            author: form.author,
          }),
        }],
        max_tokens: 2048,
        model: 'claude-sonnet-4-6',
        onChunk: (fullText) => {
          didStreamAny = true;
          setForm((f) => ({ ...f, aiStrategy: fullText }));
        },
      });
      if (!didStreamAny) {
        // 何も返ってこなかったケース (network error 等は throw されるので
        // ここに来ることは稀だが念のため)。
        throw new Error('AI 修正に失敗しました');
      }
      if (form?.id) saveStrategyHistory(form.id, prev);
      setStrategyHistoryTick((t) => t + 1);
      toast.success('✓ 読書計画シートを修正しました');
    } catch (error) {
      // ストリーミング失敗時は元のシートを戻す (undo 履歴は触らない)。
      setForm((f) => ({ ...f, aiStrategy: prev }));
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
  const runSummary = async () => {
    setAiLoading(true);
    try {
      const memoCorpus = [
        form.leverageMemo || '',
        // (Card-style memos already get sent via aiAnalysis flow context;
        //  here we keep summary scope tight to leverage_memo for compatibility.)
      ].join('\n\n');
      const hours = form.totalPages > 0 ? Math.round((form.totalPages * 2) / 60) : null;
      const r = await callClaude(
        PROMPTS.roiSummary.system,
        PROMPTS.roiSummary.user({
          title: form.title,
          author: form.author,
          memos: memoCorpus,
          purpose: form.investPurpose,
          hours,
        }),
        // temperature 0.3 — メモから事実ベースで要約 (同じメモから毎回
        // 同じ要約が返ってくるべき)。creativity は最小限。
        { max_tokens: 2048, temperature: 0.3 }
      );
      setForm((f) => ({ ...f, aiSummary: r }));
    } catch (error) {
      toast.error(toMessage(error, 'AI要約に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };

  // 旧: 完了時に振り返りモーダルを出していたが UX フリクション削減のため撤去。
  // state は ActionEditModal の編集対象として再利用 (= 編集中の {bookId, actionIdx}).
  // null なら非表示。{ bookId, actionIdx, action } をセット。
  // ActionEditModal を開いている対象 — { bookId, actionIdx, action }
  const [editingAction, setEditingAction] = useState(null);
  // 「表紙が違う?」モーダル — 詳細画面の表紙下リンクから開く。
  const [coverFixForBook, setCoverFixForBook] = useState(null);

  // 内部関数: action.done を toggle し、完了時は completed_at + reflection を反映、
  // 繰り返し設定があれば次回分を新規行動として末尾に追加する。
  const applyActionToggle = async (bookId, actionIdx, options = {}) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    const acts = [...(book.actions || [])];
    const target = acts[actionIdx];
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
    acts[actionIdx] = updatedAct;

    // 繰り返し設定があり、今回が「完了化」なら次回分を spawn。期限は元の期限を
    // 基準に weekly/monthly で進める。期限が無ければ今日基準で進める。
    //
    // ⚠️ 旧バージョンは次回分を即「visible なタスク」として作っていたため、
    //    ユーザーが何週間先まで先取り完了でき、母数が無限膨張して達成率が
    //    下がり続ける問題があった。新バージョンは scheduled_for (= 表示
    //    開始日時) を設定し、useAllActions が未来の行を非表示化する。
    //    weekly: 1 日前から表示開始 / monthly: 3 日前から表示開始。
    if (becomingDone && updatedAct.recurrence) {
      const baseStr = updatedAct.deadline || new Date().toISOString().slice(0, 10);
      const base = new Date(baseStr + 'T00:00:00');
      if (!Number.isNaN(base.getTime())) {
        if (updatedAct.recurrence === 'weekly') base.setDate(base.getDate() + 7);
        else if (updatedAct.recurrence === 'monthly') base.setMonth(base.getMonth() + 1);
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
          (a, idx) => idx !== actionIdx && !a.done && (a.text || '').trim() === twinText && a.recurrence === target.recurrence
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
    try {
      await saveBook(updated);
      if (becomingDone && updatedAct.recurrence) {
        const label = updatedAct.recurrence === 'weekly' ? '次週' : '翌月';
        toast.success(`完了 ✓ ${label}の予定を自動で組みました`);
      }
    } catch (error) {
      toast.error(toMessage(error, '行動の更新に失敗しました。'));
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

  const deleteActionFromBook = async (bookId, actionIdx) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    const acts = [...(book.actions || [])];
    if (actionIdx < 0 || actionIdx >= acts.length) return;
    acts.splice(actionIdx, 1);
    const updated = { ...book, actions: acts };
    try {
      await saveBook(updated);
      toast.success('行動を削除しました');
    } catch (error) {
      toast.error(toMessage(error, '行動の削除に失敗しました。'));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = books.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
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
  }, [books, statusFilter, search, sortBy]);

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
            WebkitOverflowScrolling: 'touch',
            padding: "20px 20px 80px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={goList} style={lnk}>{tab === 'review' ? '← 振り返り' : tab === 'ai' ? '← AI' : '← 一覧'}</button>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', marginTop: 2 }}>
                <button
                  type="button"
                  onClick={() => refreshCoverFor(current)}
                  disabled={coverBusyId === current.id}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
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
                    padding: 0,
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
              <h2 style={{ fontSize: 17, fontWeight: 500, color: "var(--c-ink)", lineHeight: 1.4, overflowWrap: "anywhere", wordBreak: "break-word" }}>{current.title}</h2>
              {current.author && <p style={{ fontSize: 12, color: "var(--c-ink-2)", marginTop: 3 }}>{current.author}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
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
            const isIncomplete =
              !current.investPurpose || !current.aiAnalysis || !current.aiStrategy;

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
                    background: 'var(--color-warning-soft, #fff8e1)',
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
              {current.actions.filter((a) => a.text?.trim()).map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
                  <span style={{ fontSize: 16 }}>{a.done ? "✅" : "⬜"}</span>
                  <div>
                    <p style={{ fontSize: 13, color: a.done ? "#9a8e7a" : "#4a4036", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</p>
                    {a.deadline && <p style={{ fontSize: 10, color: "#b5aa96" }}>📅 {a.deadline}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {current.roiSummary && <Card label="💡 一番の収穫" text={current.roiSummary} bg="var(--c-soft)" />}

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
                        await confirm({
                          title: '読む前に、投資目的を決めましょう',
                          message:
                            'この本を「何のために読むか」を 1 行だけでも決めると、読書の精度とリターンが大きく変わります。目的なき読書は、もったいない。',
                          confirmLabel: '投資目的を入力する',
                          cancelLabel: '閉じる',
                        });
                        openSetup(current);
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
                  style={{ ...btnS, width: "100%", background: st.color }}
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
            <a
              href={getAmazonLink(current)}
              target="_blank"
              rel={AMAZON_LINK_REL}
              aria-label={`Amazon で『${current.title}』を購入（外部リンク）`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                padding: "12px 16px",
                background: "#FF9900",
                color: "#000",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
                fontFamily: "inherit",
                minHeight: 44,
                boxSizing: "border-box",
              }}
            >
              📚 Amazon で買う
            </a>
            <small style={{ fontSize: 10, color: "var(--c-ink-2)", lineHeight: 1.6, textAlign: "center" }}>
              {AMAZON_DISCLOSURE_TEXT}
            </small>
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
              zIndex: 600,
              fontFamily: "inherit",
            }}
          >
            ＋
          </button>
        )}

        {quickMemoOpen && (current.status === "reading" || current.status === "done") && (
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
              toast.success('メモを保存しました');
            }}
            onOpenFullEditor={(prefill) => {
              setQuickMemoOpen(false);
              setFullEditorPrefill(prefill);
            }}
          />
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
              toast.success('メモを保存しました');
            }}
            onUpdate={async (memoId, payload) => {
              await currentMemoOps.updateMemo(memoId, payload);
              toast.success('メモを更新しました');
            }}
          />
        )}

        {helpModalOpen && (
          <HelpModal
            helpKey={getCurrentHelpKey()}
            onClose={() => setHelpModalOpen(false)}
            onShowOnboarding={() => {
              setHelpModalOpen(false);
              clearOnboardingCompletion();
              setShowOnboarding(true);
            }}
          />
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
            <button onClick={current ? () => { setEditPhaseOverride(null); setView("detail"); } : goList} style={lnk}>← 戻る</button>
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
                  <WantPhase form={form} setForm={setForm} onSave={handleSave} onSearchOpen={() => setSearchOpen(true)} allTags={allTags} />
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
                  <ReadingPhase form={form} setForm={setForm} onSave={handleSave} onSaveSummary={handleSaveSummaryFromForm} allTags={allTags} />
                )}
                {effectivePhase === "done" && current && (
                  <DonePhase form={form} setForm={setForm} onSave={handleSave} aiLoading={aiLoading} onRunSummary={runSummary} allTags={allTags} />
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
          <HelpModal
            helpKey={getCurrentHelpKey()}
            onClose={() => setHelpModalOpen(false)}
            onShowOnboarding={() => {
              setHelpModalOpen(false);
              clearOnboardingCompletion();
              setShowOnboarding(true);
            }}
          />
        )}
        {/* Same reason as in the detail view — keep onboarding reachable
            from the edit-screen help modal without requiring a tab switch. */}
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} onStart={openAdd} onStartAdvisor={openAdvisor} />}
        <BottomNav
          tab={tab}
          setTab={async (t) => {
            // 編集中に未保存の変更があれば、移動前に確認（誤タップでの消失防止）。
            if (isEditDirty()) {
              const ok = await confirm({
                title: '編集を破棄しますか？',
                message: '保存していない変更があります。移動すると失われます。',
                confirmLabel: '破棄して移動',
                cancelLabel: '編集に戻る',
                danger: true,
              });
              if (!ok) return;
            }
            setTab(t);
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
              {/* Pill filters — hide statuses with zero books to keep the bar tight. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  { key: "all", label: "全て", count: stats.total, color: "#4a4036", bg: "#e8e0d2", Icon: null },
                  ...STATUSES.map((s) => ({
                    key: s.key,
                    label: s.label,
                    Icon: s.Icon,
                    color: s.color,
                    bg: s.bg,
                    count: stats[s.key] || 0,
                  })),
                ]
                  .filter((s) => s.key === "all" || s.count > 0 || statusFilter === s.key)
                  .map((s) => {
                    const active = statusFilter === s.key;
                    const Icon = s.Icon;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setStatusFilter(s.key)}
                        style={{
                          padding: "6px 12px",
                          minHeight: 44,
                          fontSize: 11,
                          borderRadius: 999,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          border: active ? `1.5px solid ${s.color}` : "1px solid var(--c-hairline-strong)",
                          background: active ? s.bg : "transparent",
                          color: active ? s.color : "var(--c-ink-2)",
                          fontWeight: active ? 600 : 400,
                          transition: "background .15s, color .15s",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {Icon && <Icon size={12} strokeWidth={1.75} aria-hidden="true" />}
                        {s.label} <span style={{ opacity: 0.7, fontWeight: 500 }}>({s.count})</span>
                      </button>
                    );
                  })}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--c-ink-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>並び順</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ fontSize: 16, padding: "8px 8px", minHeight: 44, borderRadius: 8, border: "1px solid var(--c-hairline-strong)", background: "var(--c-card)", color: "var(--c-ink)", fontFamily: "inherit" }}
                  >
                    <option value="updated">更新順</option>
                    <option value="created">登録順</option>
                    <option value="title">タイトル順</option>
                    <option value="rating">評価順</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              {/* 月次 1 行サマリー: 読了 (今月) / 読書中 (今) / 読書前 (今)
                  タップで振り返りタブへ遷移 — 振り返り導線を強化。 */}
              <BookshelfSummary
                books={books}
                onClick={() => { setReviewSubTab('note'); setTab('review'); }}
              />
              {/* 🔄 今日の想起: 過去メモが 1 枚ふいに戻ってくる控えめなカード。
                  自己完結（fetch / state は HomeRecall 内に閉じる）。
                  メモ十分＋当日未 dismiss のときだけ静かに出る。 */}
              <HomeRecall onOpen={(bookId) => {
                const b = bookId && books.find((x) => x.id === bookId);
                if (b) { openDetail(b); setTab('books'); }
                else { setReviewSubTab('note'); setTab('review'); }
              }} />
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
                <Review books={books} onOpenBook={(b) => { openDetail(b); }} />
              </Suspense>
            ) : (
              <ActionList
                books={books}
                onToggleAction={toggleAction}
                onDeleteAction={deleteActionFromBook}
                onEditAction={(bookId, actionIdx, action) => setEditingAction({ bookId, actionIdx, action })}
                onOpenBook={(b) => { openDetail(b); }}
                onGoToBooks={() => setTab("books")}
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
                <IcRuler size={15} aria-hidden="true" style={subTabIconStyle} />レバレッジメモ
              </button>
            </div>
            {/* 独自名のサブタブを初対面でも分かるよう、内容を平易な一言で注釈する。 */}
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '6px 12px 0', lineHeight: 1.6, flexShrink: 0 }}>
              {aiSubTab === 'advisor'
                ? 'いまの課題に合う本を、AI が提案します。'
                : aiSubTab === 'brain'
                ? 'あなたが残したメモをもとに、AI が質問に答えます。'
                : 'テーマの学びを「核心1行＋次の一歩」に凝縮し、振り返りに乗せます。'}
            </p>
            <div className="ai-page-body">
              {aiSubTab === 'advisor' ? (
                <BookAdvisor
                  onAddBook={(rec, payload) => addFromAdvisor(rec, payload)}
                  sessionApi={advisorSessions}
                  books={books}
                />
              ) : aiSubTab === 'report' ? (
                <Suspense fallback={<Spinner />}>
                  <ThemeReport
                    onActionAdded={() => { try { refreshBooks(); } catch { /* ignore */ } }}
                    onOpenActions={() => { setReviewSubTab('action'); setTab('review'); }}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<Spinner />}>
                  <MyBookBrain onOpenBook={(b) => { openDetail(b); }} />
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
          />
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
        <ActionEditModal
          action={editingAction.action}
          onClose={() => setEditingAction(null)}
          onSave={async (patch) => {
            const { bookId, actionIdx } = editingAction;
            const book = books.find((b) => b.id === bookId);
            if (!book) { setEditingAction(null); return; }
            const acts = [...(book.actions || [])];
            if (actionIdx < 0 || actionIdx >= acts.length) { setEditingAction(null); return; }
            acts[actionIdx] = { ...acts[actionIdx], ...patch };
            try {
              await saveBook({ ...book, actions: acts });
              toast.success('💾 行動を更新しました');
            } catch (error) {
              toast.error(toMessage(error, '更新に失敗しました'));
            } finally {
              setEditingAction(null);
            }
          }}
          onDelete={async () => {
            const { bookId, actionIdx } = editingAction;
            setEditingAction(null);
            await deleteActionFromBook(bookId, actionIdx);
          }}
        />
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
        <HelpModal
          helpKey={getCurrentHelpKey()}
          onClose={() => setHelpModalOpen(false)}
          onShowOnboarding={() => {
            setHelpModalOpen(false);
            clearOnboardingCompletion();
            setShowOnboarding(true);
          }}
        />
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
    initServiceWorker({
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
//   （error.code 42P01 / PGRST205 / "does not exist" 等）。
//   通常運用（テーブルあり・未課金）では error=null なので、ちゃんとロックされる。
//
// ※ 将来 Capacitor（IAP）対応時は、ここで Capacitor.isNativePlatform() を見て
//   native は別の entitlement ソース（RevenueCat 等）に切替える想定。今は Web 専用。
function isSchemaUnappliedError(error) {
  if (!error) return false;
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('not exist') ||
    msg.includes('schema cache') ||
    error?.code === '42P01' ||
    error?.code === 'PGRST205'
  );
}

function PaywallGate() {
  const { isActive, loading, error, refresh } = useSubscription();

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

  // ペイウォールが実際に表示される条件（判定確定 + 未課金 + schema 適用済み）。
  const paywallShown = !loading && !isActive && !isSchemaUnappliedError(error);
  // 📊 ペイウォール露出の計測（転換率の分母）。PII なし・表示時 1 回。
  useEffect(() => { if (paywallShown) track('paywall_viewed'); }, [paywallShown]);

  if (loading) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Dots />
        </div>
      </Shell>
    );
  }

  // fail-open: subscriptions テーブル未適用なら判定不能 → ロックせず通す。
  if (isActive || isSchemaUnappliedError(error)) {
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
const inp = { width: "100%", minWidth: 0, padding: "12px 14px", fontSize: 16, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)", outline: "none", color: "var(--color-label)", fontFamily: "inherit", WebkitAppearance: "none", appearance: "none" };
const ta = { ...inp, resize: "vertical", lineHeight: "var(--leading-relaxed)" };
const lnk = { background: "none", border: "none", color: "var(--color-tertiary)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "11px 8px", margin: "-11px -8px", minHeight: 44, display: "inline-flex", alignItems: "center" };
// 主ボタンは ui.js（単一の真実）を継承。幅とパディングは従来の挙動を保つ。
const btnS = { ...uiBtnPrimary, width: "auto", padding: "12px 0" };
const btnO = { ...uiBtnGhost, width: "auto", padding: "12px 0", fontSize: 15 };
const aiB = { width: "100%", padding: "10px 0", borderRadius: "var(--radius-sm)", border: "1px dashed #c4b8a6", background: "var(--color-accent-soft)", color: "#6b5d4f", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: "var(--weight-medium)" };
const navBtn = { padding: "10px 24px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-separator)", background: "transparent", color: "var(--color-secondary)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
const closeBtn = { background: "none", border: "none", fontSize: 20, color: "var(--color-tertiary)", cursor: "pointer" };
const phaseDesc = { fontSize: 12, color: "var(--color-tertiary)", marginBottom: "var(--space-4)", lineHeight: "var(--leading-base)" };
const tagBtn = { fontSize: 10, padding: "3px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-separator)", background: "transparent", color: "var(--color-tertiary)", cursor: "pointer", fontFamily: "inherit" };
const tagBtnActive = { border: "1.5px solid var(--color-tertiary)", background: "#e8e0d2", color: "var(--color-label)" };
