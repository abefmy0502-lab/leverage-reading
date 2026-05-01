import { useAuth } from './hooks/useAuth';
import { useBooks } from './hooks/useBooks';
import { callClaude } from './lib/ai';
import { PROMPTS } from './lib/prompts';
import MarkdownSections from './components/MarkdownSections';
import AuthScreen from './components/auth/AuthScreen';
import AuthCallback from './components/auth/AuthCallback';
import BookMemoList from './components/BookMemoList';
import BookMemoEditor from './components/BookMemoEditor';
import QuickMemoSheet from './components/QuickMemoSheet';
import Onboarding, { isOnboardingCompleted, clearOnboardingCompletion } from './components/Onboarding';
import HelpModal from './components/HelpModal';
import Review from './components/Review';
import MyBookBrain from './components/MyBookBrain';
import ActionList from './components/ActionList';
import AddBookModal from './components/AddBookModal';
import { useBookCover } from './hooks/useBookCover';
import {
  searchBooks as searchBooksAPI,
  searchBooksFlat as searchBooksAPIFlat,
  searchBooksAdvanced as searchBooksAPIAdvanced,
  pickSuggestions,
  findIsbnCandidates,
} from './lib/bookSearch';
import { resolveCoverUrl, getCoverCandidates, resolveCoverFromCandidates } from './lib/bookCover';
import { backfillCovers } from './lib/backfillCovers';
import { enqueueCoverRetry } from './lib/coverAutoRetry';
import { supabase as supabaseClient } from './lib/supabase';
import AccountSettings from './components/AccountSettings';
import SplashScreen from './components/SplashScreen';
import Spinner from './components/Spinner';
import EmptyState from './components/EmptyState';
import ErrorMessage from './components/ErrorMessage';
import BookshelfSummary from './components/BookshelfSummary';
import AuthorThankYou from './components/AuthorThankYou';
import { buildGreeting } from './lib/greeting';
import { initServiceWorker, applyUpdate } from './lib/swUpdate';
import { BookListSkeleton } from './components/Skeleton';
import { fireConfetti } from './lib/confetti';
import SwipeableCard from './components/SwipeableCard';
import ContextMenu from './components/ContextMenu';
import PullToRefresh from './components/PullToRefresh';
import { useHaptic } from './hooks/useHaptic';
import { useLongPress } from './hooks/useLongPress';
import { useEdgeSwipeBack } from './hooks/useEdgeSwipeBack';
import { useKeyboardOpen } from './hooks/useKeyboardOpen';
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmDialog';
import { toMessage, fieldRequiredMessage } from './lib/errors';
import { LIMITS } from './lib/limits';
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
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const STAR = "★";
const EMPTY_STAR = "☆";
const STORAGE_KEY = "leverage-reading-data";

const STATUSES = [
  { key: "want", label: "読みたい", emoji: "🔖", Icon: Bookmark, bg: "#f0e8d8", color: "#8a7040" },
  { key: "before", label: "読書前", emoji: "📐", Icon: PenSquare, bg: "#f0e0f0", color: "#7a5080" },
  { key: "reading", label: "読書中", emoji: "📖", Icon: BookOpen, bg: "#dde8f0", color: "#4a6e8a" },
  { key: "done", label: "読了", emoji: "✅", Icon: CheckCircle, bg: "#e2ecd8", color: "#5a7a48" },
];
const getSt = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

/* ========== Storage ========== */
function loadData() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return { books: [], collections: [], goal: 24, readingPlans: {} };
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
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
        border: '1px solid #e4ddd0',
        background: '#faf6f0',
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
          style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid #e0d8c8' }}
        />
      ) : (
        <div style={{ width: 44, height: 60, background: '#e8e2d6', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📕</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#3d362c', lineHeight: 1.4, marginBottom: 2 }}>{book.title}</div>
        {book.author && <div style={{ fontSize: 11, color: '#8a7e6b' }}>✍️ {book.author}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {book.publisher && <span style={{ fontSize: 10, color: '#9a8e7a' }}>🏢 {book.publisher}</span>}
          {book.pubYear && <span style={{ fontSize: 10, color: '#9a8e7a' }}>📅 {book.pubYear}</span>}
        </div>
        {book.isbn && <div style={{ fontSize: 10, color: '#b5aa96', marginTop: 3 }}>🔢 ISBN: {book.isbn}</div>}
      </div>
      <span style={{ fontSize: 11, color: '#5c5043', alignSelf: 'center', whiteSpace: 'nowrap', padding: '4px 8px', border: '1px solid #d4ccbe', borderRadius: 6 }}>
        📚 これを追加
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
        <h3 style={{ fontSize: 16, fontWeight: 500, color: '#3d362c' }}>🔍 本を検索</h3>
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
        <div style={{ background: '#f0ebe2', border: '1px solid #e4ddd0', borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#5c5043', margin: '0 0 6px' }}>💡 もしかしてこの本？</p>
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
            <p style={{ fontSize: 11, color: '#8a7e6b', margin: 0 }}>{results.length} 件ヒット</p>
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
      <label style={{ fontSize: 13, color: "#5c5548", fontWeight: 500, display: "block", marginBottom: sub ? 2 : 5 }}>{label}</label>
      {sub && <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 5, lineHeight: 1.5 }}>{sub}</p>}
      {children}
    </div>
  );
}

function Card({ label, text, bg }) {
  return (
    <div style={{ background: bg || "#f7f3ec", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#8a7040", marginBottom: 4 }}>{label}</p>
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
  ['#8a7040', '#5d4a28'], // brown
  ['#7a5080', '#5a3a60'], // plum
  ['#4a6e8a', '#2c4d68'], // slate blue
  ['#5a7a48', '#3a5a30'], // moss
  ['#a05040', '#703528'], // brick
  ['#9b7b5c', '#6a5340'], // sand
];
function paletteFor(title) {
  const s = title || '';
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PLACEHOLDER_PALETTE[Math.abs(hash) % PLACEHOLDER_PALETTE.length];
}

// グリッド表示用の本カード（表紙主役）。表紙無し / 画像 404 時は
// タイトルベースの色付きプレースホルダにフォールバック。
function BookCoverCard({ book, isJustDone, onOpen, onLongPress, onAutoRetry }) {
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
            // 1×1 transparent placeholder (NDL / openBD などが「画像なし」に
            // 返すダミー) を実画像と区別するため naturalWidth で判定。
            onLoad={(e) => {
              if (e?.target && e.target.naturalWidth <= 1) setBroken(true);
            }}
          />
        )}
        {/* ステータスバッジは表紙を隠すというフィードバックで撤去。
            done のときだけ右下に小さな ✅ を出して識別性を残す。 */}
        {book.status === 'done' && (
          <span
            aria-label="読了"
            title="読了"
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 9999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              lineHeight: 1,
              background: 'rgba(255,255,255,0.95)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            ✅
          </span>
        )}
      </div>
      <p className="book-cover-title">{book.title}</p>
      {book.author && <p className="book-cover-author">{book.author}</p>}
    </button>
  );
}

function SwipeableBookCard({ book, index, isJustDone, onOpen, onSwipeDelete, onLongPress, onAutoRetry }) {
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
        onClick={() => onOpen?.(book)}
        {...longPress.bind}
        style={{
          background: "#faf6f0",
          borderRadius: 14,
          padding: "12px 14px",
          border: "1px solid #e4ddd0",
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
                if (e?.target && e.target.naturalWidth <= 1) setBroken(true);
              }}
              style={{ width: 42, height: 60, objectFit: "cover", borderRadius: 5, border: "1px solid #e0d8c8", flexShrink: 0, boxShadow: "0 1px 3px rgba(30,25,20,0.12)" }}
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
            <div style={{ fontSize: 15, fontWeight: 600, color: "#3d362c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.2 }}>{book.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              {book.author && <span style={{ fontSize: 11, color: "#a89e8c", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.author}</span>}
              {book.rating > 0 && <Stars r={book.rating} size={11} />}
            </div>
            <div style={{ marginTop: 6 }}>
              <StatusBadge status={book.status} />
            </div>
          </div>
          <span style={{ fontSize: 14, color: "#c4b8a6" }}>›</span>
        </div>
      </div>
    </SwipeableCard>
  );
}

function TagInput({ tags, onChange, allTags }) {
  const [input, setInput] = useState("");
  const add = (t) => { const tag = (t || input).trim(); if (tag && !tags.includes(tag)) onChange([...tags, tag]); setInput(""); };
  const suggestions = (allTags || []).filter((t) => !tags.includes(t));
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: tags.length ? 6 : 0 }}>
        {tags.map((t, i) => (
          <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#eae3d6", color: "#7a6e58", display: "flex", alignItems: "center", gap: 4 }}>
            {t}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} style={{ background: "none", border: "none", fontSize: 12, color: "#a89e8c", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#b5aa96", lineHeight: "22px" }}>過去のタグ:</span>
          {suggestions.map((t) => (
            <button key={t} onClick={() => add(t)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: "1px dashed #d4ccbe", background: "transparent", color: "#8a7e6b", cursor: "pointer", fontFamily: "inherit" }}>+ {t}</button>
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
    <h3 style={{ fontSize: 15, fontWeight: 500, color: "#3d362c", marginBottom: 12, marginTop: 24 }}>
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
  // セットアップシートの投資目的にプレフィルし、引き継ぎバナーを表示する。
  // Persisted as books.source_query (see supabase_books_source_query.sql).
  sourceQuery: "",
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
      <p style={phaseDesc}>📖 読みたい本を登録しましょう</p>
      <button onClick={onSearchOpen} style={{ ...btnO, width: "100%", padding: "14px 0", borderStyle: "dashed", fontSize: 14, marginBottom: 12 }}>
        🔍 タイトル・ISBNで検索して登録
      </button>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {form.cover ? (
            <img src={ensureHttps(form.cover)} alt="" style={{ width: 60, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid #e0d8c8" }} />
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
                color: '#8a7e6b',
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
                style={{ background: 'none', border: 'none', fontSize: 10, color: '#8a7040', cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}
              >
                変更
              </button>
              <button
                type="button"
                onClick={clearCover}
                style={{ background: 'none', border: 'none', fontSize: 10, color: '#a05040', cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}
              >
                削除
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
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
      <p style={phaseDesc}>📐 読書の投資設計をしましょう</p>

      <Field label="読書開始日">
        <input type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inp} />
      </Field>

      <SectionHeader icon="🔍" title="AI本の解析" />
      <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 10, lineHeight: 1.5 }}>ボタンを押すとAIが本の核心・構造・著者の視点を分析します</p>
      <button onClick={onRunAnalysis} disabled={!form.title.trim() || aiLoading} style={{ ...aiB, opacity: !form.title.trim() || aiLoading ? 0.5 : 1 }}>
        {aiLoading && !form.aiAnalysis ? "分析中..." : "🔍 AIで本を解析する"}
      </button>
      {aiLoading && !form.aiAnalysis && <Dots />}
      {form.aiAnalysis && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#8a7040", marginBottom: 4 }}>解析結果</p>
          <MarkdownSections text={form.aiAnalysis} />
        </div>
      )}

      {form.aiAnalysis && (
        <>
          <SectionHeader icon="🗺️" title="読書戦略の作成" />
          {/* AI 選書から source_query を引き継ぎ済みなら、ユーザーが
              「あれ、なんで既に文字が入ってるの？」と戸惑わないように
              バナーで明示する。ユーザーが投資目的を編集 (= sourceQuery と
              異なる文字列に) すると消える。 */}
          {form.sourceQuery && (form.investPurpose || '').trim() === form.sourceQuery.trim() && (
            <div
              style={{
                background: '#FFF8E1',
                border: '1px solid #e0c878',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 10,
                color: '#5D4037',
                lineHeight: 1.7,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <span aria-hidden="true">💡</span>
              <span>AI 選書で入力した内容を引き継ぎました。必要に応じて編集してください。</span>
            </div>
          )}
          <Field label="投資目的・現在の課題・仮説" sub="この本に何を期待するか？">
            <textarea value={form.investPurpose || ""} onChange={(e) => setForm({ ...form, investPurpose: e.target.value })}
              placeholder={"・目的：\n・課題：\n・仮説："} rows={4} style={ta} maxLength={LIMITS.memoText} />
          </Field>
          {/* 編集後でも sourceQuery が違うなら「↩ AI 選書の内容に戻す」 */}
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
          <button onClick={onRunStrategy} disabled={!form.investPurpose?.trim() || aiLoading} style={{ ...aiB, opacity: !form.investPurpose?.trim() || aiLoading ? 0.5 : 1 }}>
            {aiLoading && form.aiAnalysis ? "作成中..." : "🗺️ セットアップシートを作成"}
          </button>
          {aiLoading && form.aiAnalysis && !form.aiStrategy && <Dots />}
          {form.aiStrategy && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#8a7040", marginBottom: 4 }}>読書前セットアップシート</p>
              <MarkdownSections
                text={form.aiStrategy}
                onAddRelatedBook={onAddRelatedBook}
                addingTitles={addingTitles}
              />

              {/* Refinement: send the existing sheet + a free-form instruction
                  to the AI. Keeps a 1-step history in localStorage so the
                  user can undo. */}
              <div style={{ marginTop: 12, padding: "12px 14px", background: "#f5efde", border: "1px solid #e0d0a8", borderRadius: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#5c5043", margin: 0 }}>
                  📝 修正リクエスト
                </p>
                <p style={{ fontSize: 11, color: "#8a7e6b", margin: "4px 0 8px", lineHeight: 1.6 }}>
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
                  aria-label="セットアップシートの修正指示"
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
                      aria-label="ひとつ前のセットアップシートに戻す"
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

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 20 }}>保存</button>
    </div>
  );
}

// Phase 3: 読書中（インプット）
function ReadingPhase({ form, setForm, onSave, onSaveSummary, allTags }) {
  const pct = form.totalPages > 0 ? Math.min(Math.round((form.currentPage / form.totalPages) * 100), 100) : 0;
  return (
    <div>
      <p style={phaseDesc}>📖 読書中のインプットを記録しましょう</p>

      {form.aiStrategy && (
        <div style={{ background: "#f0ebe2", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#7a5080", marginBottom: 4 }}>📋 セットアップシート要約</p>
          <p style={{ fontSize: 12, color: "#5c5548", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto", paddingRight: 8, margin: 0 }}>
            {form.aiStrategy}
          </p>
        </div>
      )}

      <Field label="読書進捗">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input type="number" value={form.currentPage || ""} onChange={(e) => setForm({ ...form, currentPage: parseInt(e.target.value) || 0 })} placeholder="現在" style={{ ...inp, width: 80, textAlign: "center" }} />
          <span style={{ color: "#b5aa96" }}>/</span>
          <input type="number" value={form.totalPages || ""} onChange={(e) => setForm({ ...form, totalPages: parseInt(e.target.value) || 0 })} placeholder="総ページ" style={{ ...inp, width: 80, textAlign: "center" }} />
          <span style={{ fontSize: 12, color: "#8a7e6b" }}>ページ</span>
        </div>
        {form.totalPages > 0 && (
          <div>
            <div style={{ height: 8, background: "#e0d8c8", borderRadius: 4 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#5a7a48" : "#4a6e8a", borderRadius: 4, transition: "width .3s" }} />
            </div>
            <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 4, textAlign: "right" }}>{pct}%</p>
          </div>
        )}
      </Field>

      <Field label="レバレッジメモ" sub="📇 カード式（1メモ=1カード、ページ番号・写真・タグ）と 📝 まとめ式（1冊1テキスト）をタブで切替。">
        <BookMemoList
          bookId={form.id}
          bookTitle={form.title}
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
      <p style={phaseDesc}>💰 投資回収をまとめましょう</p>

      <Field label="読書完了日">
        <input type="date" value={form.doneDate || ""} onChange={(e) => setForm({ ...form, doneDate: e.target.value })} style={inp} />
      </Field>

      <Field label="評価（ROI）">
        <div style={{ padding: "4px 0" }}>
          <Stars r={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={28} />
        </div>
      </Field>

      {form.leverageMemo?.trim() && (
        <>
          <SectionHeader icon="🤖" title="AIメモ要約" />
          <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 10, lineHeight: 1.5 }}>レバレッジメモをAIが3〜5個のポイントに凝縮します</p>
          <button onClick={onRunSummary} disabled={aiLoading} style={{ ...aiB, opacity: aiLoading ? 0.5 : 1 }}>
            {aiLoading ? "要約中..." : "🤖 AIでメモを要約・整理"}
          </button>
          {aiLoading && <Dots />}
          {form.aiSummary && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#5a7a48", marginBottom: 4 }}>要約結果（ROI レポート）</p>
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

      <SectionHeader icon="⚡" title="次の 1 週間でやる行動" />
      <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 10, lineHeight: 1.5 }}>本を読みっぱなしにしないために、具体的な行動を 1〜3 つ書きましょう。</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(form.actions || []).map((a, i) => (
          <div key={i} style={{ background: "#f7f3ec", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input value={a.text} onChange={(e) => updateAction(i, "text", e.target.value)} placeholder={i === 0 ? "例：営業会議で結論ファーストを実践" : `行動 ${i + 1}`} style={{ ...inp, flex: 1 }} />
              <button onClick={() => removeAction(i)} style={{ background: "none", border: "none", fontSize: 16, color: "#c4a0a0", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#9a8e7a" }}>期限:</span>
              <input type="date" value={a.deadline || ""} onChange={(e) => updateAction(i, "deadline", e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
          </div>
        ))}
        <button onClick={addAction} style={{ ...btnO, padding: "10px 0", fontSize: 12, borderStyle: "dashed" }}>＋ 行動を追加</button>
      </div>

      <Field label="ROI ひとことまとめ" sub="この本から得た一番大きな価値を 1 行で">
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

/* ========== Tab: Today ========== */
function TodayTab({ books }) {
  const cards = useMemo(() => {
    const all = [];
    books.forEach((b) => {
      if (b.leverageMemo?.trim()) all.push({ type: "memo", title: b.title, author: b.author, cover: b.cover, text: b.leverageMemo, tags: b.tags || [] });
      if (b.aiSummary?.trim()) all.push({ type: "summary", title: b.title, text: b.aiSummary });
      if (b.roiSummary?.trim()) all.push({ type: "roi", title: b.title, text: b.roiSummary });
      (b.actions || []).filter((a) => a.text?.trim()).forEach((a) => all.push({ type: "action", title: b.title, text: a.text, done: a.done }));
    });
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all;
  }, [books]);

  const [idx, setIdx] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const next = () => setIdx((i) => (i + 1) % cards.length);
  const prev = () => setIdx((i) => (i - 1 + cards.length) % cards.length);
  const safeIdx = Math.min(idx, Math.max(0, cards.length - 1));

  if (!cards.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 48, marginBottom: 12 }}>📚</p>
        <p style={{ fontSize: 15, color: "#5c5548", fontWeight: 500 }}>学びを蓄積しよう</p>
        <p style={{ fontSize: 12, color: "#a89e8c", marginTop: 6, lineHeight: 1.6 }}>本を読んでメモを記録すると、<br />毎日ここに学びが表示されます。</p>
      </div>
    );
  }

  const c = cards[safeIdx];
  const typeLabel = { memo: "メモ", summary: "要約", roi: "ROI", action: "行動" };
  const typeBg = { memo: "#f0e8d8", summary: "#e2ecd8", roi: "#f0e8d8", action: "#dde8f0" };
  const typeColor = { memo: "#8a7040", summary: "#5a7a48", roi: "#8a7040", action: "#4a6e8a" };

  return (
    <div style={{ padding: "0 20px" }}
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touchStart === null) return; const diff = e.changedTouches[0].clientX - touchStart; if (Math.abs(diff) > 50) { diff < 0 ? next() : prev(); } setTouchStart(null); }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: "#a89e8c", letterSpacing: 3, fontWeight: 500 }}>TODAY'S LEVERAGE</p>
        <p style={{ fontSize: 11, color: "#c4b8a6", marginTop: 2 }}>{safeIdx + 1} / {cards.length}</p>
      </div>
      <div key={safeIdx} style={{ background: "#faf6f0", borderRadius: 16, padding: "20px 18px", border: "1px solid #e4ddd0", minHeight: 160, animation: "fadeIn .3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {c.cover && <img src={ensureHttps(c.cover)} alt="" style={{ width: 28, height: 40, objectFit: "cover", borderRadius: 4 }} />}
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#3d362c" }}>{c.title}</p>
            {c.author && <p style={{ fontSize: 11, color: "#9a8e7a" }}>{c.author}</p>}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 8, background: typeBg[c.type], color: typeColor[c.type] }}>
            {typeLabel[c.type]}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#3d362c", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{c.text}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
        <button onClick={prev} style={navBtn}>← 前へ</button>
        <button onClick={next} style={{ ...navBtn, background: "#5c5043", color: "#faf6f0", border: "none" }}>次へ →</button>
      </div>
      <p style={{ textAlign: "center", fontSize: 10, color: "#c4b8a6", marginTop: 8 }}>← スワイプで移動 →</p>
    </div>
  );
}

/* ========== Tab: Memos ========== */
function MemosTab({ books, collections, onUpdateCollections }) {
  const [subTab, setSubTab] = useState("search");
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [newColName, setNewColName] = useState("");
  const [editCol, setEditCol] = useState(null);

  // Reset scroll when switching sub-tabs.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [subTab]);

  const allMemos = useMemo(() => {
    const memos = [];
    books.forEach((b) => {
      if (b.leverageMemo?.trim()) {
        b.leverageMemo.split("\n").filter((l) => l.trim()).forEach((line) => {
          memos.push({ text: line.trim(), title: b.title, tags: b.tags || [] });
        });
      }
    });
    return memos;
  }, [books]);

  const allTags = useMemo(() => { const s = new Set(); books.forEach((b) => (b.tags || []).forEach((t) => s.add(t))); return [...s]; }, [books]);

  const filtered = useMemo(() => allMemos.filter((m) => {
    if (tagFilter && !m.tags.includes(tagFilter)) return false;
    if (q) { const ql = q.toLowerCase(); return m.text.toLowerCase().includes(ql) || m.title.toLowerCase().includes(ql) || m.tags.some((t) => t.toLowerCase().includes(ql)); }
    return true;
  }), [allMemos, q, tagFilter]);

  const addCollection = () => { if (!newColName.trim()) return; onUpdateCollections([...collections, { id: Date.now().toString(), name: newColName.trim(), memoTexts: [] }]); setNewColName(""); };
  const deleteCol = (id) => onUpdateCollections(collections.filter((c) => c.id !== id));
  const toggleMemoInCol = (colId, memoText) => {
    onUpdateCollections(collections.map((c) => {
      if (c.id !== colId) return c;
      const has = c.memoTexts.includes(memoText);
      return { ...c, memoTexts: has ? c.memoTexts.filter((t) => t !== memoText) : [...c.memoTexts, memoText] };
    }));
  };

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ display: "flex", marginBottom: 16, borderBottom: "1px solid #e0d8c8" }}>
        {[{ k: "search", l: "🔍 メモ検索" }, { k: "collections", l: "📂 コレクション" }].map((t) => (
          <button key={t.k} onClick={() => setSubTab(t.k)} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontFamily: "inherit", cursor: "pointer", background: "none", border: "none", borderBottom: subTab === t.k ? "2px solid #5c5043" : "2px solid transparent", color: subTab === t.k ? "#3d362c" : "#a89e8c", fontWeight: subTab === t.k ? 500 : 400 }}>{t.l}</button>
        ))}
      </div>
      {subTab === "search" && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="メモを横断検索..." style={{ ...inp, background: "#faf6f0", marginBottom: 8 }} />
          {allTags.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
              <button onClick={() => setTagFilter("")} style={{ ...tagBtn, ...(tagFilter === "" ? tagBtnActive : {}) }}>すべて</button>
              {allTags.map((t) => (
                <button key={t} onClick={() => setTagFilter(tagFilter === t ? "" : t)} style={{ ...tagBtn, ...(tagFilter === t ? tagBtnActive : {}) }}>#{t}</button>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 8 }}>{filtered.length}件</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.slice(0, 50).map((m, i) => (
              <div key={i} style={{ background: "#faf6f0", borderRadius: 10, padding: "10px 12px", border: "1px solid #e4ddd0" }}>
                <p style={{ fontSize: 13, color: "#3d362c", lineHeight: 1.7 }}>{m.text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#9a8e7a" }}>📕 {m.title}</span>
                  {m.tags.map((t, j) => (<span key={j} style={{ fontSize: 9, background: "#eae3d6", color: "#7a6e58", padding: "1px 5px", borderRadius: 6 }}>#{t}</span>))}
                  {collections.length > 0 && (
                    <select onChange={(e) => { if (e.target.value) toggleMemoInCol(e.target.value, m.text); e.target.value = ""; }} style={{ fontSize: 16, border: "1px solid #d4ccbe", borderRadius: 6, padding: "2px 4px", color: "#8a7e6b", background: "transparent", fontFamily: "inherit", marginLeft: "auto" }} defaultValue="">
                      <option value="">+📂</option>
                      {collections.map((c) => (<option key={c.id} value={c.id}>{c.memoTexts.includes(m.text) ? "✓ " : ""}{c.name}</option>))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && <p style={{ textAlign: "center", padding: 30, color: "#b5aa96", fontSize: 13 }}>メモがありません</p>}
        </>
      )}
      {subTab === "collections" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="新しいコレクション名" style={{ ...inp, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addCollection(); } }} />
            <button onClick={addCollection} style={{ ...btnS, padding: "8px 14px", fontSize: 12 }}>作成</button>
          </div>
          {collections.length === 0 ? (
            <p style={{ textAlign: "center", padding: 30, color: "#b5aa96", fontSize: 13 }}>テーマ別コレクションを作成しよう</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {collections.map((col) => (
                <div key={col.id} style={{ background: "#faf6f0", borderRadius: 12, border: "1px solid #e4ddd0", overflow: "hidden" }}>
                  <div onClick={() => setEditCol(editCol === col.id ? null : col.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "#3d362c" }}>📂 {col.name}</p>
                      <p style={{ fontSize: 11, color: "#9a8e7a" }}>{col.memoTexts.length}件</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={(e) => { e.stopPropagation(); deleteCol(col.id); }} style={{ background: "none", border: "none", fontSize: 14, color: "#c4a0a0", cursor: "pointer" }}>×</button>
                      <span style={{ fontSize: 12, color: "#c4b8a6" }}>{editCol === col.id ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {editCol === col.id && (
                    <div style={{ padding: "0 14px 12px", borderTop: "1px solid #e8e2d6" }}>
                      {col.memoTexts.length === 0 ? <p style={{ fontSize: 12, color: "#b5aa96", padding: "12px 0" }}>メモ検索から追加</p>
                        : col.memoTexts.map((t, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: i < col.memoTexts.length - 1 ? "1px solid #f0ebe2" : "none" }}>
                            <p style={{ fontSize: 12, color: "#4a4036", lineHeight: 1.6, flex: 1 }}>{t}</p>
                            <button onClick={() => toggleMemoInCol(col.id, t)} style={{ background: "none", border: "none", fontSize: 12, color: "#c4a0a0", cursor: "pointer", flexShrink: 0, marginLeft: 8 }}>×</button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ========== Tab: Actions ========== */
function ActionsTab({ books, onToggleAction }) {
  const allActions = useMemo(() => {
    const a = [];
    books.forEach((b) => (b.actions || []).forEach((act, i) => {
      if (act.text?.trim()) a.push({ ...act, bookTitle: b.title, bookId: b.id, actionIdx: i });
    }));
    return a;
  }, [books]);
  const done = allActions.filter((a) => a.done).length;
  const pct = allActions.length ? Math.round((done / allActions.length) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ background: "#faf6f0", borderRadius: 12, padding: "16px", border: "1px solid #e4ddd0", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#3d362c" }}>実行率</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: pct >= 80 ? "#5a7a48" : pct >= 50 ? "#d4a040" : "#a05040" }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "#e0d8c8", borderRadius: 4 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "#5a7a48" : pct >= 50 ? "#d4a040" : "#a05040", borderRadius: 4, transition: "width .4s" }} />
        </div>
        <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 6 }}>{done} / {allActions.length} 完了</p>
      </div>
      {allActions.length === 0 ? (
        <p style={{ textAlign: "center", padding: 30, color: "#b5aa96", fontSize: 13 }}>行動リストなし</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {allActions.map((a, i) => {
            const overdue = a.deadline && a.deadline < today && !a.done;
            return (
              <div key={i} onClick={() => onToggleAction(a.bookId, a.actionIdx)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: a.done ? "#f0ebe2" : overdue ? "#fdf0ed" : "#faf6f0", border: `1px solid ${overdue ? "#e0b0a0" : "#e4ddd0"}`, cursor: "pointer" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{a.done ? "✅" : "⬜"}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: a.done ? "#9a8e7a" : "#3d362c", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: "#b5aa96" }}>📕 {a.bookTitle}</span>
                    {a.deadline && <span style={{ fontSize: 10, color: overdue ? "#a05040" : "#9a8e7a" }}>{overdue ? "⚠️ " : "📅 "}{a.deadline}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ========== AI Book Advisor ========== */
const ADVISOR_EXAMPLES = [
  '営業成績を上げたい',
  'チームマネジメント',
  '自信を持ちたい',
  '時間管理',
  'お金の不安',
];

function BookAdvisor({ onAddBook }) {
  // 旧: 挨拶 seed メッセージで例を箇条書き → サブタブ画面では冗長
  // (タップ不可で文字を読まされるだけ)。例はチップ UI に分離した。
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  // 直近の「ユーザーの課題」入力 — 本棚に追加した時に source_query として
  // 持ち回り、セットアップシートの投資目的にプレフィルする。
  const [lastUserQuery, setLastUserQuery] = useState('');
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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    const newHistory = [...chatHistory, { role: "user", content: userMsg }];
    setChatHistory(newHistory);

    try {
      const aiText = await callClaude(newHistory, {
        system: PROMPTS.bookAdvisor.system,
        max_tokens: 2048,
        model: "claude-sonnet-4-20250514",
      });

      const { recs, prose } = parseAdvisorResponse(aiText);
      if (recs) {
        setRecommendations({ items: recs, before: prose?.before || '', after: prose?.after || '' });
        // 推薦が出た = この userMsg がユーザーの「課題」。これを source_query として記憶。
        setLastUserQuery(userMsg);
        setMessages((prev) => [...prev, { role: "assistant", text: prose?.before || 'あなたの状況に合った本を選びました。' }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: aiText }]);
        setChatHistory([...newHistory, { role: "assistant", content: aiText }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "通信エラーが発生しました。" }]);
    }
    setLoading(false);
  };

  const isEmpty = messages.length === 0 && !recommendations;
  const chatScrollRef = useRef(null);
  // 新メッセージ追加時に最下部へオートスクロール (LINE 挙動)。
  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, recommendations]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Scroll 領域: ヘッダー / 例チップ / メッセージ / 推薦カード をまとめる */}
      <div ref={chatScrollRef} className="chat-scroll">
      {/* Unified AI section header (マイ読書脳 と同じフォーマット)。
          ✕ ボタンはタブ画面では不要なので撤去。 */}
      <div className="ai-section-header" style={{ padding: 0, marginBottom: 8 }}>
        <h2>🤖 AI 選書アドバイザー</h2>
        <p className="subtitle">あなたの課題から、読むべき本を提案します</p>
      </div>

      {/* Example chips — タップで textarea に流し込む。挨拶 seed が
          消えたので、何を入力すれば良いかをここで提示する */}
      {isEmpty && !loading && (
        <div className="example-chips">
          <p className="example-chips-label">💡 例（タップで入力）</p>
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

      {/* Messages — chat-scroll が overflow を担うため、ここは
          flex column のレイアウトのみ。height: auto。 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px", borderRadius: 14,
              background: m.role === "user" ? "#5c5043" : "#f7f3ec",
              color: m.role === "user" ? "#faf6f0" : "#3d362c",
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
              borderBottomRightRadius: m.role === "user" ? 4 : 14,
              borderBottomLeftRadius: m.role === "user" ? 14 : 4,
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: 14, background: "#f7f3ec", borderBottomLeftRadius: 4 }}>
              <Dots />
            </div>
          </div>
        )}

        {/* Recommendations — richer per-book card with reasoning */}
        {recommendations && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeIn .3s" }}>
            {recommendations.items.map((rec, i) => (
              <div key={i} style={{ background: "#faf6f0", borderRadius: 12, border: "1px solid #e4ddd0", padding: "14px 14px", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, color: "#a89e8c", margin: 0, fontWeight: 600 }}>#{i + 1}</p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#3d362c", margin: '2px 0 0' }}>『{rec.title}』</p>
                    <p style={{ fontSize: 12, color: "#8a7e6b", marginTop: 2 }}>{rec.author}</p>
                  </div>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📕</span>
                </div>
                {rec.why && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: '#f5efde', borderRadius: 8, border: '1px solid #e0d0a8' }}>
                    <p style={{ fontSize: 11, color: '#8a7040', fontWeight: 600, margin: 0 }}>🎯 なぜあなたに必要か</p>
                    <p style={{ fontSize: 12, color: '#5c5548', lineHeight: 1.7, margin: '4px 0 0' }}>{rec.why}</p>
                  </div>
                )}
                {rec.core && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: '#5c5043', fontWeight: 600, margin: 0 }}>💡 この本の核心</p>
                    <p style={{ fontSize: 12, color: '#5c5548', lineHeight: 1.7, margin: '2px 0 0' }}>{rec.core}</p>
                  </div>
                )}
                {rec.focus && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: '#5c5043', fontWeight: 600, margin: 0 }}>📍 注目すべきポイント</p>
                    <p style={{ fontSize: 12, color: '#5c5548', lineHeight: 1.7, margin: '2px 0 0' }}>{rec.focus}</p>
                  </div>
                )}
                {rec.duration && (
                  <p style={{ fontSize: 11, color: '#a89e8c', margin: '8px 0 0' }}>⏱️ {rec.duration}</p>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  <a
                    href={getAmazonSearchLink(rec.title, rec.author)}
                    target="_blank"
                    rel={AMAZON_LINK_REL}
                    aria-label={`Amazon で『${rec.title}』を購入（外部リンク）`}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "#FF9900", color: "#000", fontSize: 12, fontFamily: "inherit", textAlign: "center", textDecoration: "none", fontWeight: 600, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  >
                    🛒 Amazon で買う
                  </a>
                  <button onClick={() => onAddBook(rec, lastUserQuery)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #d4ccbe", background: "transparent", color: "#5c5043", fontSize: 12, fontFamily: "inherit", cursor: "pointer", fontWeight: 500, minHeight: 36 }}>
                    📚 読みたいに追加
                  </button>
                </div>
              </div>
            ))}
            {recommendations.after && (
              <div style={{ background: '#f0ebe2', borderRadius: 12, padding: '12px 14px', border: '1px solid #e4ddd0' }}>
                <p style={{ fontSize: 12, color: '#5c5548', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{recommendations.after}</p>
              </div>
            )}
            <small style={{ fontSize: 10, color: '#a89e8c', lineHeight: 1.6, padding: '0 4px' }}>
              {AMAZON_DISCLOSURE_TEXT}
            </small>
            <button onClick={() => { setRecommendations(null); setMessages((prev) => [...prev, { role: "assistant", text: "他にお探しの本のジャンルや悩みはありますか？" }]); }}
              style={{ ...btnO, padding: "10px 0", fontSize: 12 }}>
              🔄 別の条件で探す
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      </div>{/* /chat-scroll */}

      {/* Input — flex column の末尾に置かれ、親 (.ai-page) の 100dvh 構造で
          自動的にキーボード直上 / BottomNav 直上に張り付く (LINE 風)。 */}
      {!recommendations && (
        <div className="ai-input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="課題を入力..."
            rows={1}
            disabled={loading}
            aria-label="AI選書アドバイザーへの質問"
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            type="button"
            className="send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            aria-label={loading ? '送信中' : '送信'}
            title={loading ? '送信中…' : '送信'}
          >
            {loading ? (
              <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 600 }}>…</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2 12 22 2 13 22 11 13 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
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
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-1)",
        display: "flex",
        // border-top は入力欄側に持たせて二重表示を避ける。AI 入力欄を
        // 表示していない画面でも、本棚→ナビは色 / shadow で十分仕切れる。
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
            <Icon size={22} strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
            <span style={{ fontSize: "var(--type-caption)", fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)" }}>{t.label}</span>
            {active && <div style={{ position: "absolute", top: 0, left: "25%", right: "25%", height: 2, background: "var(--color-accent)", borderRadius: 1 }} />}
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
        background: "linear-gradient(160deg, var(--color-bg), #ebe4d8)",
        fontFamily: "var(--font-serif)",
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

  // collections と readingPlans は一旦localStorageのまま
  const [data, setData] = useState(() => {
    const d = loadData();
    return { collections: d.collections || [], readingPlans: d.readingPlans || {} };
  });
  const collections = data.collections;
  const readingPlans = data.readingPlans || {};

  const [tab, setTab] = useState("books");
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
  // 親タブ「振り返り」「AI」内のサブタブ。localStorage に保存して再訪時に復元。
  const [reviewSubTab, setReviewSubTab] = useState(() => {
    try { return localStorage.getItem('reviewSubTab') || 'note'; } catch { return 'note'; }
  });
  const [aiSubTab, setAiSubTab] = useState(() => {
    try { return localStorage.getItem('aiSubTab') || 'advisor'; } catch { return 'advisor'; }
  });
  useEffect(() => { try { localStorage.setItem('reviewSubTab', reviewSubTab); } catch { /* ignore */ } }, [reviewSubTab]);
  useEffect(() => { try { localStorage.setItem('aiSubTab', aiSubTab); } catch { /* ignore */ } }, [aiSubTab]);
  const [view, setView] = useState("list"); // list | detail | edit
  const [current, setCurrent] = useState(null);
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
  // Personal Capital UI is removed; data layer (CapitalDashboard component
  // file) is retained for potential future re-enablement.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [recentlyDoneId, setRecentlyDoneId] = useState(null);
  const recentlyDoneTimerRef = useRef(null);
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
  const addingRelatedTitlesRef = useRef(new Set());
  const [addingRelatedTick, setAddingRelatedTick] = useState(0);

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

const persist = useCallback((updates) => {
    setData((prev) => { 
      const next = { ...prev, ...updates };
      // booksはSupabaseで管理するのでlocalStorageには保存しない
      saveData({ collections: next.collections, readingPlans: next.readingPlans });
      return next;
    });
  }, []);

  // Resolve the help key for whatever screen the user is currently looking at.
  // Priority order:
  //   1. Open modal contexts (advisor / quick memo / full editor) — they overlay everything
  //   2. Book detail / edit view — map by status
  //   3. Bottom-nav tabs (list view) — today / books / memos / actions
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
  const openAdd = () => {
    setTab("books");
    setAddBookModalOpen(true);
  };

  // AddBookModal は今や検索結果リストまで内包する 1 画面モーダル。
  // ここでは「ユーザーが結果から本を選んだ」イベントだけを受け取り、
  // 編集画面を該当本のメタデータでプリフィルして開く。検索フォーム /
  // 結果リスト UI は AddBookModal 側に閉じている。
  const pickBookFromAdd = (b) => {
    setAddBookModalOpen(false);
    // 1) 即時 seed: ISBN があれば openBD パターンを暫定 cover に。
    //    検索結果の b.cover が既に有効な URL ならそれを優先採用する。
    const candidates = getCoverCandidates(b?.isbn);
    const seedCover = b?.cover || candidates[0] || '';
    if (typeof console !== 'undefined') {
      console.log('[cover] picked book:', { title: b?.title, isbn: b?.isbn });
      console.log('[cover] candidates:', candidates);
      console.log('[cover] seed cover:', seedCover);
    }
    const seeded = {
      ...emptyBook(),
      id: Date.now().toString(),
      title: b.title || '',
      author: b.author || '',
      cover: seedCover,
      totalPages: b.pages || 0,
      isbn: b.isbn || '',
      addedVia: 'search',
    };
    setForm(seeded);
    setCurrent(null);
    setView('edit');

    // 2) 非同期に multi-ISBN リゾルバで cover を確定。
    //    primary ISBN → 同タイトル+著者の他エディション ISBN の順で
    //    openBD/Amazon を試し、最初にロード成功した URL を採用する。
    //    完了したら form.cover (と coverIsbn) を上書き。
    (async () => {
      try {
        const altIsbns = await findIsbnCandidates(b.title, b.author);
        const ordered = [b?.isbn, ...altIsbns].filter(Boolean);
        if (ordered.length === 0) return;
        const { isbn: resolvedIsbn, url: resolvedUrl } = await resolveCoverFromCandidates(ordered);
        if (typeof console !== 'undefined') {
          console.log('[cover] alt ISBNs:', altIsbns);
          console.log('[cover] resolved:', { isbn: resolvedIsbn, url: resolvedUrl });
        }
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
    detailCoverUploadRef.current?.click();
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

  // 既存の本に対して表紙を取り直す。multi-ISBN リゾルバを優先で使い、
  // primary ISBN → 同タイトル+著者の別エディションの順に openBD/Amazon
  // を試す。すべて失敗したら手動アップロードを案内する。
  const refreshCoverFor = async (book) => {
    if (!book) return;
    try {
      let coverUrl = '';
      let coverIsbn = '';
      if (book.title || book.author) {
        const altIsbns = await findIsbnCandidates(book.title, book.author);
        const ordered = [book.isbn, ...altIsbns].filter(Boolean);
        if (ordered.length > 0) {
          const r = await resolveCoverFromCandidates(ordered);
          if (r.url) {
            coverUrl = r.url;
            coverIsbn = r.isbn || '';
          }
        }
      }
      if (!coverUrl && book.isbn) {
        // primary ISBN だけで再試行 (find が失敗してもここで捕捉)
        coverUrl = await resolveCoverUrl(book.isbn);
        if (coverUrl) coverIsbn = book.isbn;
      }
      if (!coverUrl) {
        const r = await searchBooksAPIFlat(`${book.title || ''} ${book.author || ''}`.trim());
        if (r?.[0]?.cover) coverUrl = r[0].cover;
      }
      if (!coverUrl) {
        // 自動取得が完璧になることはあり得ない → 手動アップロードを促す。
        toast.show({
          type: 'info',
          message: '自動取得できませんでした。📷 手動アップロードをお試しください',
          duration: 6000,
          action: { label: 'アップロード', onClick: () => triggerManualCoverUpload(book) },
        });
        return;
      }
      const updated = { ...book, cover: coverUrl, coverIsbn };
      const saved = await saveBook(updated);
      const next = saved || updated;
      if (current && current.id === next.id) setCurrent(next);
      toast.success('表紙を更新しました');
    } catch (e) {
      toast.error(toMessage(e, '表紙の取得に失敗しました'));
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
  // form.status が支配するが、たとえば status='reading' の本でセットアップ
  // を仕切り直したい時 (= openSetup) は 'before' を入れて BeforePhase を
  // 強制レンダリングする。Phase の上書きは UI の見た目だけの話で、
  // form.status はそのまま保持され saveBook で正しい status が永続化される。
  const [editPhaseOverride, setEditPhaseOverride] = useState(null);

  const openDetail = (b) => { setCurrent(b); setEditPhaseOverride(null); setView("detail"); };
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
  // 読書中 (or それ以降) の本でセットアップを完了させたい時用。phase を
  // 'before' にしてセットアップ UI を呼び出すが、form.status は維持。
  const openSetup = (b) => {
    setForm(buildFormFromBook(b));
    setCurrent(b);
    setEditPhaseOverride('before');
    setView('edit');
  };
  const goList = () => { setView("list"); setCurrent(null); setEditPhaseOverride(null); };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error(fieldRequiredMessage('タイトル'));
      return;
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

      // 重要: status は form.status をそのまま保持。saveBook は自動で
      // ステータスを進めない (実際そういうコードは無いが、明示的にコメント
      // しておく)。「読書を開始する」「読了にする」ボタン経由 = advanceStatus
      // のみが status 遷移を担う。
      const payload = { ...form, tags: normalizedTags, cover: resolvedCover, coverIsbn: resolvedCoverIsbn };
      const saved = await saveBook(payload);
      const next = saved || payload;
      const wasNew = !current; // 新規追加 (current=null) かどうか
      setCurrent(next);
      setForm({ ...emptyBook(), ...next, tags: next.tags || [], actions: next.actions || [] });
      // 既存本の編集中はフォームに留まる — BeforePhase で AI セットアップ
      // 途中の保存 → detail へ飛ばされて戻れない問題を防ぐ。
      // 新規追加だけは登録完了の手応えとして detail へ遷移させる。
      if (wasNew) setView("detail");
      toast.success('保存しました');
    } catch (error) {
      toast.error(toMessage(error, '保存に失敗しました。もう一度お試しください。'));
    }
  };

  const handleSaveSummaryFromForm = async (text) => {
    if (!form?.id) return;
    const merged = { ...form, leverageMemo: text };
    try {
      const saved = await saveBook(merged);
      const next = saved || merged;
      setForm((f) => ({ ...f, leverageMemo: next.leverageMemo ?? text }));
      if (current && current.id === next.id) setCurrent(next);
    } catch (error) {
      throw new Error(toMessage(error, 'まとめメモの保存に失敗しました。'));
    }
  };

  const handleSaveSummaryFromCurrent = async (text) => {
    if (!current?.id) return;
    const merged = { ...current, leverageMemo: text };
    try {
      const saved = await saveBook(merged);
      const next = saved || merged;
      setCurrent(next);
      if (form && form.id === next.id) {
        setForm((f) => ({ ...f, leverageMemo: next.leverageMemo ?? text }));
      }
    } catch (error) {
      throw new Error(toMessage(error, 'まとめメモの保存に失敗しました。'));
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
          await restoreBookFromSnapshot(snapshot);
          toast.info('削除を取り消しました');
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
  const swipeDeleteBook = (book) => {
    if (!book) return;
    performBookDelete(book, { fromList: true });
  };

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

  const addFromAdvisor = async (rec, query = '') => {
    const newBook = {
      ...emptyBook(),
      title: rec.title,
      author: rec.author,
      status: "want",
      addedVia: 'search',
      // AI 選書のクエリを引き継ぎ。セットアップシート画面で投資目的に
      // プレフィルされる。クエリが空でも sourceQuery プロパティを持たせる
      // ことで saveBook 側の source_query 書き込み判別が走る。
      sourceQuery: (query || '').trim(),
    };
    // Try to get cover from Google Books — best-effort, ignore failures.
    try {
      const results = await searchBooksAPIFlat(rec.title + " " + rec.author);
      if (results.length > 0) {
        newBook.cover = results[0].cover || "";
        newBook.totalPages = results[0].pages || 0;
        newBook.isbn = results[0].isbn || '';
      }
    } catch {}
    try {
      await saveBook(newBook);
      const msg = newBook.sourceQuery
        ? `「${rec.title}」を追加。AI セットアップで読み方戦略を立てましょう`
        : `「${rec.title}」を「読みたい」に追加しました`;
      toast.success(msg);
    } catch (error) {
      toast.error(toMessage(error, '本の追加に失敗しました。'));
    }
  };

  // Used by CapitalDashboard's "学習プラン" → bulk-add. Throws on failure so
  // the dashboard can count successes/failures across the plan's book list.
  const addBookFromPlan = async ({ title, author = '', tags = [] }) => {
    const newBook = {
      ...emptyBook(),
      title,
      author: author || '',
      status: 'want',
      tags: Array.isArray(tags) ? tags : [],
      addedVia: 'search',
    };
    try {
      const results = await searchBooksAPIFlat(`${title} ${author || ''}`.trim());
      if (results.length > 0) {
        newBook.cover = results[0].cover || '';
        newBook.totalPages = results[0].pages || 0;
        newBook.isbn = results[0].isbn || '';
      }
    } catch {
      /* cover is best-effort; ignore */
    }
    await saveBook(newBook);
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

    // Optimistic update — switch to edit view immediately.
    setCurrent(updated);
    setForm({ ...emptyBook(), ...updated, tags: updated.tags || [], actions: updated.actions || [] });
    setView("edit");

    // Persist in background; roll back on failure.
    saveBook(updated).catch((error) => {
      toast.error(toMessage(error, 'ステータス変更に失敗しました。'));
      const restored = { ...book, ...prev };
      setCurrent(restored);
      setForm({ ...emptyBook(), ...restored, tags: restored.tags || [], actions: restored.actions || [] });
      setView("edit");
    });

    const labels = { want: '読みたい', before: '読書前', reading: '読書中', done: '読了' };
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
    try {
      const r = await callClaude(
        PROMPTS.bookAnalysis.system,
        PROMPTS.bookAnalysis.user({ title: form.title, author: form.author }),
        { max_tokens: 2048 }
      );
      setForm((f) => ({ ...f, aiAnalysis: r }));
    } catch (error) {
      toast.error(toMessage(error, 'AI解析に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };
  const runStrategy = async () => {
    setAiLoading(true);
    try {
      const r = await callClaude(
        PROMPTS.setupSheet.system,
        PROMPTS.setupSheet.user({
          title: form.title,
          author: form.author,
          analysis: form.aiAnalysis,
          purpose: form.investPurpose,
          topTags: allTags.slice(0, 3),
        }),
        { max_tokens: 2048 }
      );
      setForm((f) => ({ ...f, aiStrategy: r }));
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
    try {
      const r = await callClaude(
        PROMPTS.setupSheetEdit.system,
        PROMPTS.setupSheetEdit.user({
          existing: prev,
          instruction,
          title: form.title,
          author: form.author,
        }),
        { max_tokens: 2048 }
      );
      if (typeof r !== 'string' || r.startsWith('エラー') || r.startsWith('AI機能') || r.startsWith('リクエスト') || r.startsWith('通信エラー')) {
        throw new Error(r || 'AI 修正に失敗しました');
      }
      setForm((f) => ({ ...f, aiStrategy: r }));
      if (form?.id) saveStrategyHistory(form.id, prev);
      setStrategyHistoryTick((t) => t + 1);
      toast.success('✓ セットアップシートを修正しました');
    } catch (error) {
      toast.error(toMessage(error, 'セットアップシートの修正に失敗しました。'));
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
    toast.info('ひとつ前のセットアップシートに戻しました');
  };

  // Adds a recommended book (from setup sheet / ROI summary related-books
  // section) to the bookshelf in 'want' status. Best-effort cover lookup
  // via the search pipeline; falls back to manual add if no hit.
  const addRelatedBookFromAi = async ({ title, author = '' }) => {
    if (!title || !title.trim()) return;
    if (addingRelatedTitlesRef.current.has(title)) return;
    addingRelatedTitlesRef.current.add(title);
    setAddingRelatedTick((t) => t + 1);
    try {
      const newBook = {
        ...emptyBook(),
        title: title.trim(),
        author: author?.trim() || '',
        status: 'want',
        addedVia: 'search',
      };
      try {
        const results = await searchBooksAPIFlat(`${title} ${author || ''}`.trim());
        if (results.length > 0) {
          newBook.cover = results[0].cover || '';
          newBook.totalPages = results[0].pages || 0;
          newBook.isbn = results[0].isbn || '';
          // Upgrade author if AI said 不明 / blank but search has it.
          if (!newBook.author && results[0].author) newBook.author = results[0].author;
        } else {
          newBook.addedVia = 'manual';
        }
      } catch {
        newBook.addedVia = 'manual';
      }
      await saveBook(newBook);
      toast.success(`「${title}」を読みたいに追加しました`);
    } catch (error) {
      toast.error(toMessage(error, '本の追加に失敗しました。'));
    } finally {
      addingRelatedTitlesRef.current.delete(title);
      setAddingRelatedTick((t) => t + 1);
    }
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
        { max_tokens: 2048 }
      );
      setForm((f) => ({ ...f, aiSummary: r }));
    } catch (error) {
      toast.error(toMessage(error, 'AI要約に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };

  const toggleAction = async (bookId, actionIdx) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    const acts = [...(book.actions || [])];
    acts[actionIdx] = { ...acts[actionIdx], done: !acts[actionIdx].done };
    const updated = { ...book, actions: acts };

    haptic.light();
    try {
      await saveBook(updated);
    } catch (error) {
      toast.error(toMessage(error, '行動の更新に失敗しました。'));
    }
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
    return books
      .filter((b) => {
        const stamp = b.updated_at ? Date.parse(b.updated_at) : NaN;
        return Number.isFinite(stamp) && stamp >= cutoff;
      })
      .slice(0, 3);
  }, [books]);

  const stats = { total: books.length, want: books.filter((b) => b.status === "want").length, before: books.filter((b) => b.status === "before").length, reading: books.filter((b) => b.status === "reading").length, done: books.filter((b) => b.status === "done").length };
  const actionCount = books.reduce((s, b) => s + (b.actions || []).filter((a) => a.text?.trim()).length, 0);
  const actionDone = books.reduce((s, b) => s + (b.actions || []).filter((a) => a.done).length, 0);
  const allTags = useMemo(() => { const s = new Set(); books.forEach((b) => (b.tags || []).forEach((t) => s.add(t))); return [...s]; }, [books]);

  // ===== DETAIL =====
  if (view === "detail" && current) {
    const st = getSt(current.status);
    const nextStatus = { want: "before", before: "reading", reading: "done" };
    const nextLabel = { want: "📐 読書前へ進む", before: "📖 読書を開始する", reading: "✅ 読了にする" };

    return (
      <Shell>
        <div
          className="detail-enter"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: "20px 20px 80px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={goList} style={lnk}>← 一覧</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={openHelp}
                style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid #d4ccbe", borderRadius: 999, color: "#8a7e6b", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                aria-label="この画面のヘルプを見る"
                title="ヘルプ"
              >
                <HelpCircle size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {/* ⋯ kebab — 編集 / 共有 / 削除 を集約。下部の 3 ボタン廃止。 */}
              <button
                onClick={openDetailKebab}
                style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid #d4ccbe", borderRadius: 999, color: "#5c5043", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 16, fontWeight: 700 }}
                aria-label="その他の操作"
                title="その他"
              >
                ⋯
              </button>
            </div>
          </div>

          {/* Book header */}
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            {current.cover && <img src={ensureHttps(current.cover)} alt="" style={{ width: 60, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid #e0d8c8" }} />}
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: "#3d362c", lineHeight: 1.4 }}>{current.title}</h2>
              {current.author && <p style={{ fontSize: 12, color: "#8a7e6b", marginTop: 3 }}>{current.author}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <StatusBadge status={current.status} />
                {current.rating > 0 && <Stars r={current.rating} size={13} />}
              </div>
            </div>
          </div>

          {current.tags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
              {current.tags.map((t, i) => (<span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#eae3d6", color: "#7a6e58" }}>#{t}</span>))}
            </div>
          )}

          {/* AI セットアップ導線 — どのステータスでも setup フィールドが
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
                      background: 'linear-gradient(135deg, #5C4A2E 0%, #8B6F47 100%)',
                      color: '#faf6f0',
                      textAlign: 'center',
                      boxShadow: '0 6px 18px rgba(92, 74, 46, 0.22)',
                    }}
                  >
                    <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 6 }}>📋</div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>
                      AI セットアップを完了しよう
                    </h3>
                    <p style={{ margin: '8px 0 14px', fontSize: 12, lineHeight: 1.6, opacity: 0.92 }}>
                      投資目的を明確にすると、AI があなた専用の読み方戦略を提案します
                    </p>
                    <button
                      type="button"
                      onClick={() => openSetup(current)}
                      style={{
                        background: '#faf6f0',
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
                      📋 セットアップを始める →
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
                    ✅ AI セットアップ完了
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
                    ⚠️ 読書前のセットアップが未完了です
                  </p>
                  <p style={{ fontSize: 11, color: '#9a7030', margin: 0, lineHeight: 1.6 }}>
                    投資目的・AI 解析・セットアップシートをいま埋めると、ROI が最大化されます。
                  </p>
                  <button
                    type="button"
                    onClick={() => openSetup(current)}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#8a7040',
                      color: '#faf6f0',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    📋 セットアップを完了する
                  </button>
                </div>
              );
            }

            return null;
          })()}

          {/* Phase-specific content */}
          {current.startDate && <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 10 }}>📅 開始: {current.startDate}</p>}
          {current.doneDate && <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 2 }}>📅 完了: {current.doneDate}</p>}

          {current.investPurpose && <Card label="目的・課題・仮説" text={current.investPurpose} />}

          {/* AI 出力（解析 / セットアップシート）はデフォルト折りたたみ。
              スクロール量を圧縮し、必要な時に展開する。 */}
          {(current.aiAnalysis || current.aiStrategy) && (
            <details style={{ marginTop: 12, background: "#faf6f0", border: "1px solid #e4ddd0", borderRadius: 10, padding: "10px 12px" }}>
              <summary style={{ fontSize: 13, fontWeight: 600, color: "#5c5043", cursor: "pointer", listStyle: "none" }}>
                🤖 AI 解析 / セットアップシート
              </summary>
              {current.aiAnalysis && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#8a7040", marginBottom: 6 }}>🔍 AI 本の解析</p>
                  <MarkdownSections text={current.aiAnalysis} />
                </div>
              )}
              {current.aiStrategy && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#8a7040", marginBottom: 6 }}>🗺️ セットアップシート</p>
                  <MarkdownSections
                    text={current.aiStrategy}
                    onAddRelatedBook={addRelatedBookFromAi}
                    addingTitles={(() => { void addingRelatedTick; return addingRelatedTitlesRef.current; })()}
                  />
                </div>
              )}
            </details>
          )}

          {current.totalPages > 0 && (
            <div style={{ marginTop: 12, background: "#f7f3ec", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5c5548", marginBottom: 4 }}>
                <span>進捗</span>
                <span>{current.currentPage || 0}/{current.totalPages}p ({Math.round(((current.currentPage || 0) / current.totalPages) * 100)}%)</span>
              </div>
              <div style={{ height: 6, background: "#e0d8c8", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${Math.round(((current.currentPage || 0) / current.totalPages) * 100)}%`, background: "#4a6e8a", borderRadius: 3 }} />
              </div>
            </div>
          )}

          {(current.status === "reading" || current.status === "done") ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#8a7040", marginBottom: 6 }}>📝 レバレッジメモ</p>
              <BookMemoList
                bookId={current.id}
                bookTitle={current.title}
                summaryText={current.leverageMemo || ""}
                onSaveSummary={handleSaveSummaryFromCurrent}
              />
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                padding: "14px 16px",
                background: "#faf6f0",
                border: "1px dashed #d4ccbe",
                borderRadius: 10,
                fontSize: 12,
                color: "#a89e8c",
                lineHeight: 1.7,
              }}
            >
              {current.status === "want"
                ? "📚 読み始めたら、ここにメモが書けるようになります。"
                : "🎯 今は投資戦略を立てる段階です。読書中になるとここにメモが表示されます。"}
            </div>
          )}
          {current.aiSummary && (
            <details style={{ marginTop: 12, background: "#faf6f0", border: "1px solid #e4ddd0", borderRadius: 10, padding: "10px 12px" }}>
              <summary style={{ fontSize: 13, fontWeight: 600, color: "#5a7a48", cursor: "pointer", listStyle: "none" }}>
                🤖 AI 要約 (ROI)
              </summary>
              <div style={{ marginTop: 10 }}>
                <MarkdownSections
                  text={current.aiSummary}
                  onAddRelatedBook={addRelatedBookFromAi}
                  addingTitles={(() => { void addingRelatedTick; return addingRelatedTitlesRef.current; })()}
                />
              </div>
            </details>
          )}

          {(current.actions || []).filter((a) => a.text?.trim()).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#8a7040", marginBottom: 6 }}>⚡ 行動リスト</p>
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

          {current.roiSummary && <Card label="💡 ROI" text={current.roiSummary} bg="#f0ebe2" />}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {nextStatus[current.status] && (
              <>
                <button
                  onClick={async () => {
                    // before → reading は AI セットアップが未完了のまま進むと
                    // このアプリのコア価値（戦略提案）を使い損ねるので、
                    // 強制はしないが必ず警告する。
                    if (
                      current.status === 'before' &&
                      (!current.investPurpose || !current.aiAnalysis || !current.aiStrategy)
                    ) {
                      const ok = await confirm({
                        title: 'セットアップ未完了のまま進みますか？',
                        message:
                          'AI 解析・投資目的・セットアップシートが未入力です。先に「📋 セットアップを始める」を完了すると、このアプリの一番の価値（戦略提案）が活用できます。',
                        confirmLabel: 'このまま読書を開始',
                        cancelLabel: 'セットアップを完了する',
                      });
                      if (!ok) {
                        openSetup(current);
                        return;
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
                    ? '💡 投資戦略を立てると、AI がセットアップシートを自動生成します'
                    : current.status === 'before'
                    ? '💡 読書中になると、メモ機能が解放されます'
                    : '💡 完了後、ROI 要約とメモの振り返りが可能になります'}
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
            <small style={{ fontSize: 10, color: "#a89e8c", lineHeight: 1.6, textAlign: "center" }}>
              {AMAZON_DISCLOSURE_TEXT}
            </small>
            {/* 編集 / 共有 / 削除 は上部 ⋯ kebab に集約。下部のボタン群は撤去。 */}
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
              fontSize: 28,
              lineHeight: 1,
              cursor: "pointer",
              boxShadow: "var(--shadow-fab)",
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
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}

        {detailKebab && (
          <ContextMenu
            x={detailKebab.x}
            y={detailKebab.y}
            onClose={() => setDetailKebab(null)}
            items={[
              { label: '編集', icon: '✏️', onClick: () => openEdit(current) },
              // 📋 AI セットアップは before / reading / done のどこからでも
              // 仕切り直せる。want は本格的なセットアップ前なので除外。
              ...(current.status !== 'want'
                ? [{
                    label: 'AI セットアップを編集',
                    icon: '📋',
                    onClick: () => openSetup(current),
                  }]
                : []),
              ...(current.status === 'reading' || current.status === 'done'
                ? [{
                    label: '読書前に戻す',
                    icon: '📚',
                    onClick: async () => {
                      const ok = await confirm({
                        title: '読書前に戻しますか？',
                        message: 'ステータスを「読書前」に戻します。メモや行動などのデータは保持されます。',
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

        {/* hidden file input — kebab「🖼 手動でアップロード」のトリガー */}
        <input
          ref={detailCoverUploadRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleManualCoverPicked}
          style={{ display: 'none' }}
        />

        <BottomNav tab={tab} setTab={(t) => { setTab(t); goList(); }} hidden={keyboardOpen} />
      </Shell>
    );
  }

  // ===== EDIT (renders different phase based on status) =====
  if (view === "edit") {
    return (
      <Shell>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: "20px 20px 80px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={current ? () => { setEditPhaseOverride(null); setView("detail"); } : goList} style={lnk}>← 戻る</button>
            <button
              onClick={openHelp}
              style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid #d4ccbe", borderRadius: 999, color: "#8a7e6b", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
              aria-label="この画面のヘルプを見る"
              title="ヘルプ"
            >
              <HelpCircle size={18} strokeWidth={1.75} aria-hidden="true" />
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
                  <h2 style={{ fontSize: 17, fontWeight: 500, color: "#3d362c" }}>{phaseLabel}</h2>
                  {editPhaseOverride && editPhaseOverride !== form.status && (
                    <span style={{ fontSize: 11, color: 'var(--color-tertiary)' }}>
                      （セットアップを仕切り直し中）
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
                    addingTitles={(() => {
                      void addingRelatedTick;
                      return addingRelatedTitlesRef.current;
                    })()}
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
        {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}
        <BottomNav tab={tab} setTab={(t) => { setTab(t); goList(); }} hidden={keyboardOpen} />
      </Shell>
    );
  }

  // ===== TAB CONTENT =====
  return (
    <Shell>
   <header
     style={{
       flexShrink: 0,
       padding: "max(env(safe-area-inset-top, 6px), 6px) 12px 4px",
       minHeight: 36,
       display: "flex",
       justifyContent: "space-between",
       alignItems: "center",
       gap: 6,
       background: "var(--color-surface)",
     }}
   >
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
      <button
        type="button"
        {...logoLongPress.bind}
        aria-label="ロゴ（長押しで開発者からのメッセージ）"
        style={{
          fontSize: 22,
          lineHeight: 1,
          padding: "2px 4px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden="true">📚</span>
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
        style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid #d4ccbe", borderRadius: 999, color: "#5c5043", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        aria-label="この画面のヘルプを開く"
        title="ヘルプ"
      >
        <HelpCircle size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid #d4ccbe", borderRadius: 999, color: "#5c5043", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        aria-label="アカウント設定を開く"
        title="設定"
      >
        <SettingsIcon size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  </header>

      {/* Shell が flex column になったため、ここは flex: 1 / minHeight: 0
          で残りスペースを取る。AI タブは内側で flex column を構成、
          books/review は overflow-y: auto で内側スクロール。 */}
      <div
        key={tab}
        className="lvg-page"
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
                background: "var(--color-bg, #f5f0e8)",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  placeholder="🔍 タイトル・著者・タグで検索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
                  style={{ ...inp, flex: 1, background: "#faf6f0" }}
                />
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
                    background: "#5c5043",
                    color: "#faf6f0",
                    fontSize: 24,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(30,25,20,0.18)",
                    fontFamily: "inherit",
                  }}
                >
                  ＋
                </button>
              </div>
              {/* Pill filters — hide statuses with zero books to keep the bar tight. */}
              <p style={{ fontSize: 10, color: "#a89e8c", margin: "0 0 4px", letterSpacing: 0.2 }}>タップで本を絞り込めます</p>
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
                          minHeight: 30,
                          fontSize: 11,
                          borderRadius: 999,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          border: active ? `1.5px solid ${s.color}` : "1px solid #d4ccbe",
                          background: active ? s.bg : "transparent",
                          color: active ? s.color : "#8a7e6b",
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#8a7e6b" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>並び順</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, border: "1px solid #d4ccbe", background: "#faf6f0", color: "#3d362c", fontFamily: "inherit" }}
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
                    >📚</button>
                    <button
                      type="button"
                      className={effectiveBookshelfView === 'list' ? 'active' : ''}
                      onClick={() => setBookshelfViewMode('list')}
                      aria-label="リスト表示"
                      title="リスト"
                    >📋</button>
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
              {recentBooks.length > 0 && rawBooks.length >= 3 && !search && statusFilter === "all" && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: "#8a7040", fontWeight: 600, marginBottom: 6 }}>📖 続きから</p>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                    {recentBooks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => openDetail(b)}
                        style={{
                          flex: "0 0 auto",
                          width: 132,
                          background: "#faf6f0",
                          border: "1px solid #e4ddd0",
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
                          <img src={ensureHttps(b.cover)} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid #e0d8c8" }} />
                        ) : (
                          <div style={{ width: "100%", height: 90, background: "#eae3d6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📕</div>
                        )}
                        <div style={{ fontSize: 12, color: "#3d362c", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                        <div><StatusBadge status={b.status} /></div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {booksLoading && rawBooks.length === 0 ? (
                <BookListSkeleton rows={4} />
              ) : filtered.length === 0 ? (
                rawBooks.length === 0 ? (
                  <EmptyState
                    icon="📚"
                    title="本を追加しましょう"
                    description="読書を「投資」に変える旅をスタート。"
                    actions={[
                      { label: '📚 本を追加', onClick: openAdd, variant: 'primary' },
                    ]}
                    tip={(
                      <span style={{ display: 'block' }}>
                        <span style={{ display: 'block' }}>💡 悩みを伝えると AI が本を提案</span>
                        <button
                          type="button"
                          onClick={() => { setAiSubTab('advisor'); setTab('ai'); }}
                          style={{
                            display: 'inline-block',
                            marginTop: 6,
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--color-accent)',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                          }}
                        >
                          AI 選書を開く →
                        </button>
                      </span>
                    )}
                  />
                ) : (
                  <EmptyState
                    icon="🔍"
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
                      onLongPress={(payload) => setBookContextMenu(payload)}
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
                      onLongPress={(payload) => setBookContextMenu(payload)}
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
                💭 ノート
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reviewSubTab === 'action'}
                className={`sub-tab ${reviewSubTab === 'action' ? 'active' : ''}`}
                onClick={() => setReviewSubTab('action')}
              >
                🎯 行動
              </button>
            </div>
            {reviewSubTab === 'note' ? (
              <Review books={books} onOpenBook={(b) => { openDetail(b); setTab("books"); }} />
            ) : (
              <ActionList
                books={books}
                onToggleAction={toggleAction}
                onDeleteAction={deleteActionFromBook}
                onOpenBook={(b) => { openDetail(b); setTab("books"); }}
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
                🔍 AI 選書
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'brain'}
                className={`sub-tab ${aiSubTab === 'brain' ? 'active' : ''}`}
                onClick={() => setAiSubTab('brain')}
              >
                🧠 マイ読書脳
              </button>
            </div>
            <div className="ai-page-body">
              {aiSubTab === 'advisor' ? (
                <BookAdvisor onAddBook={(rec, query) => { addFromAdvisor(rec, query); }} />
              ) : (
                <MyBookBrain onOpenBook={(b) => { openDetail(b); setTab("books"); }} />
              )}
            </div>
          </div>
        )}
      </div>

      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}

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
        <AccountSettings
          onClose={() => setSettingsOpen(false)}
          onAfterDelete={() => setSettingsOpen(false)}
        />
      )}

      {addBookModalOpen && (
        <AddBookModal
          onClose={() => setAddBookModalOpen(false)}
          onSelect={pickBookFromAdd}
          onManual={openManualFromAdd}
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

      {/* 🙇 Easter egg: long-press the bookshelf logo. 季節演出 / マイル
          ストーン演出は「鬱陶しい」フィードバックにより撤去済み。 */}
      {thanksOpen && <AuthorThankYou onClose={() => setThanksOpen(false)} />}

      <BottomNav tab={tab} setTab={(t) => { setTab(t); if (view !== "list") goList(); }} hidden={keyboardOpen} />
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

  // 🔄 PWA 自動更新の初期化。アプリ起動時 1 回だけ走らせ、新版が
  // 検出された時はユーザーに合意を取ってから reload する。入力中の
  // テキストを暗黙で消さないため、必ず toast の action で承認を取る。
  useEffect(() => {
    initServiceWorker({
      onUpdateAvailable: () => {
        toast.show({
          type: 'info',
          message: '新しいバージョンがあります',
          duration: 0, // ユーザーが操作するまで残す
          action: {
            label: '更新',
            onClick: () => applyUpdate(),
          },
        });
      },
    });
  }, [toast]);

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
    return (
      <Shell>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <AuthScreen />
        </div>
      </Shell>
    );
  }
  return <AuthedApp />;
}

export default function App() {
  const [authCallbackActive, setAuthCallbackActive] = useState(hashHasAuthParams);
  const [showSplash, setShowSplash] = useState(true);
  const exitAuthCallback = useCallback(() => setAuthCallbackActive(false), []);

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
const inp = { width: "100%", padding: "10px 12px", fontSize: 16, border: "1px solid var(--color-separator)", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", outline: "none", color: "var(--color-label)", fontFamily: "inherit" };
const ta = { ...inp, resize: "vertical", lineHeight: "var(--leading-relaxed)" };
const lnk = { background: "none", border: "none", color: "var(--color-tertiary)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 };
const btnS = { padding: "10px 0", borderRadius: "var(--radius-sm)", border: "none", background: "var(--color-accent-strong)", color: "var(--color-text-inverse)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, letterSpacing: 1 };
const btnO = { padding: "10px 0", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-separator)", background: "transparent", color: "var(--color-tertiary)", cursor: "pointer", fontFamily: "inherit", fontSize: 14 };
const aiB = { width: "100%", padding: "10px 0", borderRadius: "var(--radius-sm)", border: "1px dashed #c4b8a6", background: "var(--color-accent-soft)", color: "#6b5d4f", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: "var(--weight-medium)" };
const navBtn = { padding: "10px 24px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-separator)", background: "transparent", color: "var(--color-secondary)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
const closeBtn = { background: "none", border: "none", fontSize: 20, color: "var(--color-tertiary)", cursor: "pointer" };
const phaseDesc = { fontSize: 12, color: "var(--color-tertiary)", marginBottom: "var(--space-4)", lineHeight: "var(--leading-base)" };
const tagBtn = { fontSize: 10, padding: "3px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-separator)", background: "transparent", color: "var(--color-tertiary)", cursor: "pointer", fontFamily: "inherit" };
const tagBtnActive = { border: "1.5px solid var(--color-tertiary)", background: "#e8e0d2", color: "var(--color-label)" };
