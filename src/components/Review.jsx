// 🔄 Review tab — surfaces memos from any time so the user can re-encounter
// what they wrote. Three sections:
//   1. 今日の振り返り (random memo, re-rollable)
//   2. タイムライン (memos grouped by month, collapsible)
//   3. 全メモ検索 (cross-book full-text search)
//
// Display is read-only here. Tapping a memo opens its book in the book detail
// view, where the user can edit/delete via the existing BookMemoList flow.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { ensureHttps } from '../lib/url';
import { useLongPress } from '../hooks/useLongPress';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from './Toast';
import { toMessage } from '../lib/errors';
import SwipeableCard from './SwipeableCard';
import ContextMenu from './ContextMenu';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import { getRandomFromCategory } from '../lib/quotes';
import { relativeJa, recallFraming } from '../lib/recall';
import { track, EVENTS } from '../lib/analytics';

const wrap = { padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: '#5c5043', margin: '0 0 8px' };
const cardBase = { background: '#faf6f0', border: '1px solid #e4ddd0', borderRadius: 12, padding: '12px 14px' };
const inp = { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid #d4ccbe', borderRadius: 10, background: '#fff', color: '#3d362c', fontFamily: 'inherit', boxSizing: 'border-box' };
const btnGhost = { padding: '8px 14px', borderRadius: 8, border: '1px solid #d4ccbe', background: 'transparent', color: '#5c5043', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, minHeight: 36 };
const pill = { fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#eae3d6', color: '#7a6e58' };

// relativeJa / recallFraming は src/lib/recall.js に切り出して
// サーバー（api/push-cron.js の想起通知）と文言を共有している。

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function monthKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

const transformRow = (m) => {
  const sourceType = m.source_type || (m.book_id ? 'book' : 'personal');
  const kind = sourceType === 'personal' ? 'personal' : sourceType === 'summary' ? 'summary' : 'card';
  return {
    id: m.id,
    bookId: m.book_id,
    pageNumber: m.page_number ?? null,
    text: m.text || '',
    photoPath: m.photo_path || null,
    tags: Array.isArray(m.tags) ? m.tags : [],
    createdAt: m.created_at,
    sourceType,
    kind,
    synth: false,
  };
};

// 知識の種類ごとのアイコン + ラベル + ボーダー色。NoteCard で表示する。
const KIND_META = {
  card:              { icon: '📑', label: 'メモ',          color: '#2E7D32' },
  summary:           { icon: '📖', label: 'まとめメモ',     color: '#5D4037' },
  personal:          { icon: '💡', label: '学び',          color: '#E91E63' },
  invest_purpose:    { icon: '📊', label: '投資目的',       color: '#1976D2' },
  current_challenge: { icon: '⚠️', label: '現在の課題',     color: '#D32F2F' },
  hypothesis:        { icon: '💡', label: '仮説',          color: '#FF9800' },
  ai_summary:        { icon: '🤖', label: 'AI まとめ',      color: '#7B1FA2' },
  roi_summary:       { icon: '💎', label: '投資の効果',     color: '#FFA000' },
  leverage_memo:     { icon: '📝', label: 'まとめメモ', color: '#5D4037' },
  action_reflection: { icon: '💭', label: '行動の振り返り', color: '#00838F' },
};

// books から 派生ノート (本フィールド + 行動の振り返り) を生成。
// 各エントリに synth: true を立てて、UI 側でスワイプ削除を出さない。
function buildSyntheticNotes(books) {
  if (!Array.isArray(books)) return [];
  const out = [];
  const fallbackTime = new Date().toISOString();
  for (const b of books) {
    const ts = b.updated_at || b.updatedAt || b.created_at || fallbackTime;
    const push = (kind, text, t = ts) => {
      const v = (text || '').toString().trim();
      if (!v) return;
      out.push({
        id: `${kind}-${b.id}`,
        bookId: b.id,
        pageNumber: null,
        text: v,
        photoPath: null,
        tags: [],
        createdAt: t,
        sourceType: 'synth',
        kind,
        synth: true,
      });
    };
    push('invest_purpose',    b.investPurpose);
    push('current_challenge', b.currentChallenge);
    push('hypothesis',        b.hypothesis);
    push('ai_summary',        b.aiSummary);
    push('roi_summary',       b.roiSummary);
    push('leverage_memo',     b.leverageMemo);
    // 行動の振り返り
    for (const a of (b.actions || [])) {
      const r = (a.reflection || '').toString().trim();
      if (!r) continue;
      out.push({
        id: `ref-${a.id || `${b.id}-${(a.text || '').slice(0, 12)}`}`,
        bookId: b.id,
        pageNumber: null,
        text: `${(a.text || '').trim()}\n→ ${r}`,
        photoPath: null,
        tags: [],
        createdAt: a.completedAt || a.completed_at || a.created_at || ts,
        sourceType: 'synth',
        kind: 'action_reflection',
        synth: true,
      });
    }
  }
  return out;
}

function pickCategory(tags) {
  if (!Array.isArray(tags)) return null;
  const cat = tags.find((t) => typeof t === 'string' && t.startsWith('@'));
  return cat ? cat.slice(1) : null;
}

function MemoPhoto({ path }) {
  const cache = useAppDataCache();
  const initial = path ? cache.getCachedPhotoUrl(path) : null;
  const [url, setUrl] = useState(initial);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return undefined;
    }
    const cached = cache.getCachedPhotoUrl(path);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    cache.fetchPhotoUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path, cache]);
  if (!url) return null;
  return (
    <img
      src={ensureHttps(url)}
      alt="memo"
      style={{ width: '70%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, border: '1px solid #e4ddd0', marginTop: 6 }}
    />
  );
}

function ReviewMemoCard({ memo, book, onOpenBook, showRelative = false, onSwipeDelete, onLongPress }) {
  const kind = memo.kind || (memo.sourceType === 'personal' ? 'personal' : memo.sourceType === 'summary' ? 'summary' : 'card');
  const meta = KIND_META[kind] || KIND_META.card;
  const isSynth = memo.synth === true;
  const isPersonal = kind === 'personal';
  const category = isPersonal ? pickCategory(memo.tags) : null;
  const visibleTags = isPersonal
    ? (memo.tags || []).filter((t) => !t.startsWith('@'))
    : memo.tags || [];
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, memo, book }),
  });

  const cardStyle = {
    ...cardBase,
    borderLeft: `4px solid ${meta.color}`,
  };

  const inner = (
    <div style={cardStyle} {...(onLongPress && !isSynth ? longPress.bind : {})}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: `${meta.color}1a`,
              color: meta.color,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
            aria-label={`種類: ${meta.label}`}
          >
            {meta.icon} {meta.label}
          </span>
          {category && (
            <span style={{ fontSize: 11, color: '#5c5548' }}>・{category}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#a89e8c', whiteSpace: 'nowrap' }}>
          {showRelative ? relativeJa(memo.createdAt) : fmtDate(memo.createdAt)}
        </span>
      </div>
      {/* 本へのリンク (個人学び以外) */}
      {!isPersonal && (book || memo.bookId) && (
        <button
          type="button"
          onClick={() => book && onOpenBook?.(book)}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, fontSize: 12, fontWeight: 500, color: '#5c5043', cursor: book ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          📖 {book?.title || '（本のデータが見つかりません）'}
          {book?.author && <span style={{ color: '#9a8e7a', marginLeft: 6 }}>{book.author}</span>}
        </button>
      )}
      {memo.pageNumber != null && !isPersonal && (
        <span style={{ ...pill, display: 'inline-block', marginTop: 6 }}>P.{memo.pageNumber}</span>
      )}
      {memo.text && (
        <p
          style={{
            fontSize: 13,
            color: '#4a4036',
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            margin: '8px 0 0',
            maxHeight: 300,
            overflowY: 'auto',
            paddingRight: 6,
          }}
        >
          {memo.text}
        </p>
      )}
      {memo.photoPath && <MemoPhoto path={memo.photoPath} />}
      {visibleTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {visibleTags.map((t) => (
            <span key={t} style={pill}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  );

  // 派生ノート (synth=true) は DB の単一レコードに対応していないので
  // スワイプ削除は不可。長押しメニューも出さない。
  if (onSwipeDelete && !isSynth) {
    return <SwipeableCard onDelete={() => onSwipeDelete(memo)}>{inner}</SwipeableCard>;
  }
  return inner;
}

export default function Review({ books = [], onOpenBook }) {
  const { user } = useAuth();
  const toast = useToast();
  const haptic = useHaptic();
  const [memos, setMemos] = useState([]);
  const [memoMenu, setMemoMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [randomSeed, setRandomSeed] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const flipTimerRef = useRef(null);
  // Lazy initializer — runs once on first render, not on module load.
  const [todayQuote, setTodayQuote] = useState(() =>
    getRandomFromCategory('reviewAndMemory')
  );
  const [expanded, setExpanded] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');

  // Analytics: fire once when the Review tab mounts (not per sub-tab switch).
  // Empty dep array → runs exactly once on mount. fire-and-forget, no PII.
  useEffect(() => {
    track(EVENTS.REVIEW_OPENED);
  }, []);

  const fetchMemos = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setMemos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('book_memos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('review memos fetch error:', error);
      setMemos([]);
    } else {
      setMemos((data || []).map(transformRow));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    fetchMemos();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Pull-to-refresh handler — refetch + re-roll random.
  const handleRefresh = useCallback(async () => {
    await fetchMemos();
    setRandomSeed((s) => s + 1);
  }, [fetchMemos]);

  // Swipe-driven delete (no confirm — gesture is intent). DB DELETE fires
  // immediately + Undo toast can re-INSERT from snapshot (photo lost).
  const handleSwipeDelete = useCallback(
    (memo) => {
      if (!user || !isSupabaseConfigured) return;
      const snapshot = { ...memo };
      // Optimistic: remove from list now
      setMemos((arr) => arr.filter((m) => m.id !== snapshot.id));
      const promise = (async () => {
        const { error } = await supabase
          .from('book_memos')
          .delete()
          .eq('id', snapshot.id)
          .eq('user_id', user.id);
        if (error) throw error;
        if (snapshot.photoPath) {
          try {
            await supabase.storage.from('book-memo-photos').remove([snapshot.photoPath]);
          } catch { /* ignore */ }
        }
      })().catch((e) => {
        toast.error(toMessage(e, 'メモの削除に失敗しました。'));
        // Restore in UI on failure
        setMemos((arr) => [snapshot, ...arr]);
        throw e;
      });
      toast.undo({
        message: snapshot.photoPath
          ? 'メモを削除しました\n※写真は復元できません'
          : 'メモを削除しました',
        onUndo: async () => {
          try {
            await promise.catch(() => {});
            const payload = {
              id: snapshot.id,
              book_id: snapshot.bookId || null,
              user_id: user.id,
              page_number: snapshot.pageNumber ?? null,
              text: snapshot.text || '',
              tags: snapshot.tags || [],
              photo_path: null,
              source_type: snapshot.sourceType === 'personal' ? 'personal' : 'book',
            };
            if (snapshot.createdAt) payload.created_at = snapshot.createdAt;
            const { error } = await supabase.from('book_memos').insert([payload]);
            if (error) throw error;
            toast.info('削除を取り消しました');
            fetchMemos();
          } catch (e) {
            toast.error(toMessage(e, '復元に失敗しました。'));
          }
        },
      });
    },
    [user, fetchMemos, toast]
  );

  const booksById = useMemo(() => {
    const m = new Map();
    books.forEach((b) => m.set(b.id, b));
    return m;
  }, [books]);

  // 読書から生まれた知識をすべて時系列で扱う統合フィード。
  //   - book_memos (memos): カードメモ / まとめメモ / 学び
  //   - books の各フィールド: 投資目的 / 課題 / 仮説 / AI まとめ / 投資の効果 / レバレッジメモ
  //   - actions.reflection: 行動の振り返り
  // タイムライン・検索・ランダム想起のすべてがこの allNotes を使う。
  const allNotes = useMemo(() => {
    const synth = buildSyntheticNotes(books);
    const merged = [...memos, ...synth];
    merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return merged;
  }, [memos, books]);

  // 知識タイプ別のフィルタ (横断検索セクション用)。
  const [kindFilter, setKindFilter] = useState('all');

  // 種類別の件数 — 上部のサマリーチップに表示。
  const kindCounts = useMemo(() => {
    const c = {};
    for (const n of allNotes) {
      c[n.kind] = (c[n.kind] || 0) + 1;
    }
    return c;
  }, [allNotes]);

  // Default the first month to expanded so the user sees content.
  useEffect(() => {
    if (allNotes.length === 0) return;
    const firstMonth = monthKey(allNotes[0].createdAt);
    if (firstMonth) setExpanded(new Set([firstMonth]));
  }, [allNotes]);

  const randomMemo = useMemo(() => {
    if (allNotes.length === 0) return null;
    const idx = Math.floor((randomSeed * 9301 + 49297 + Math.random() * allNotes.length) % allNotes.length);
    return allNotes[idx] || allNotes[0];
  }, [allNotes, randomSeed]);

  const allTags = useMemo(() => {
    const s = new Set();
    allNotes.forEach((m) => (m.tags || []).forEach((t) => s.add(t)));
    return [...s];
  }, [allNotes]);

  const filteredSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q && statusFilter === 'all' && !tagFilter && kindFilter === 'all') return [];
    return allNotes.filter((m) => {
      if (kindFilter !== 'all' && m.kind !== kindFilter) return false;
      const book = booksById.get(m.bookId);
      if (statusFilter !== 'all' && book?.status !== statusFilter) return false;
      if (tagFilter && !m.tags?.includes(tagFilter)) return false;
      if (!q) return true;
      const title = (book?.title || '').toLowerCase();
      const author = (book?.author || '').toLowerCase();
      const text = (m.text || '').toLowerCase();
      const tagHit = (m.tags || []).some((t) => t.toLowerCase().includes(q));
      return title.includes(q) || author.includes(q) || text.includes(q) || tagHit;
    });
  }, [allNotes, booksById, search, statusFilter, tagFilter, kindFilter]);

  const memosByMonth = useMemo(() => {
    const groups = new Map();
    allNotes.forEach((m) => {
      const k = monthKey(m.createdAt);
      if (!k) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [allNotes]);

  // Flip the random-memo card and swap its content at the back-facing midpoint.
  const reroll = () => {
    haptic.light();
    // Always rotate the inspirational quote alongside the memo swap.
    setTodayQuote(getRandomFromCategory('reviewAndMemory'));
    if (allNotes.length <= 1) {
      setRandomSeed((s) => s + 1);
      return;
    }
    setFlipping(true);
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    // Swap at the midpoint of the 0.6s flip animation
    flipTimerRef.current = setTimeout(() => {
      setRandomSeed((s) => s + 1);
    }, 280);
    // Clear the flip class after the animation completes
    setTimeout(() => setFlipping(false), 620);
  };

  useEffect(() => () => {
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
  }, []);

  const toggleMonth = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSearching = search.trim() || statusFilter !== 'all' || tagFilter || kindFilter !== 'all';

  if (loading) {
    return (
      <div style={wrap}>
        <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: 30 }}>
          読み込み中…
        </p>
      </div>
    );
  }

  if (allNotes.length === 0) {
    return (
      <div style={wrap}>
        <EmptyState
          icon="📝"
          title="ここに、あなたの気づきが戻ってきます"
          description={(
            <>
              本を追加してメモを残すと、忘れた頃に<br />
              気づきがふいに戻ってくる場所になります。<br />
              まずは一行から、気軽に。
            </>
          )}
          tip="💡 メモ・まとめ・投資目的・課題・仮説・行動の振り返り、すべてここに時系列で集まります"
        />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div style={wrap}>
      {memoMenu && (
        <ContextMenu
          x={memoMenu.x}
          y={memoMenu.y}
          onClose={() => setMemoMenu(null)}
          items={[
            ...(memoMenu.book
              ? [{ label: '本を開く', icon: '📖', onClick: () => onOpenBook?.(memoMenu.book) }]
              : []),
            { label: '削除', icon: '🗑️', destructive: true, onClick: () => handleSwipeDelete(memoMenu.memo) },
          ]}
        />
      )}

      {/* 知識のタイプ別件数を冒頭に表示。「読書から何が蓄積されているか」が
          一目で分かる + フィルタ前提の数字感をつかむため。 */}
      <section
        aria-label="ノートの種類別件数"
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: '10px 12px',
          background: '#faf6f0',
          border: '1px solid #e4ddd0',
          borderRadius: 12,
        }}
      >
        {Object.entries(KIND_META).map(([k, meta]) => {
          const n = kindCounts[k] || 0;
          if (n === 0) return null;
          return (
            <span
              key={k}
              style={{
                fontSize: 11,
                padding: '3px 9px',
                borderRadius: 999,
                background: `${meta.color}1a`,
                color: meta.color,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {meta.icon} {meta.label} {n}
            </span>
          );
        })}
      </section>

      {/* ===== 1. 今日の振り返り (random) ===== */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={sectionTitle}>🎲 ランダム表示</h2>
          <button type="button" style={btnGhost} onClick={reroll} disabled={flipping}>
            ↻ 別のメモを見る
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
          偶然の再会で、忘れていた気づきを呼び戻します
        </p>
        {allNotes.length <= 3 && (
          <p
            style={{
              fontSize: 11,
              color: '#8a7e6b',
              background: '#f4efe7',
              border: '1px solid #e4ddd0',
              borderRadius: 10,
              padding: '8px 12px',
              margin: '0 0 10px',
              lineHeight: 1.7,
            }}
          >
            🌱 メモが貯まるほど、戻ってくる気づきも豊かになります。今は少なくても大丈夫。
          </p>
        )}
        {randomMemo && recallFraming(randomMemo.createdAt) && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#7a6e58',
              margin: '0 0 8px',
            }}
          >
            💭 {recallFraming(randomMemo.createdAt)}
          </p>
        )}
        {randomMemo && (
          <div
            style={{
              animation: flipping ? 'leverage-card-flip .6s ease-in-out both' : undefined,
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
            }}
          >
            <ReviewMemoCard
              memo={randomMemo}
              book={booksById.get(randomMemo.bookId)}
              onOpenBook={onOpenBook}
              onSwipeDelete={handleSwipeDelete}
              onLongPress={(payload) => setMemoMenu(payload)}
              showRelative
            />
          </div>
        )}
        <p style={{ fontSize: 10, color: '#a89e8c', marginTop: 6, lineHeight: 1.6 }}>
          忘れかけていた気づきを思い出す習慣で、本の内容が定着します。
        </p>
        <p
          style={{
            fontSize: 12,
            color: '#8a7e6b',
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: 12,
            lineHeight: 1.7,
          }}
        >
          💭 “{todayQuote.text}”
          <br />
          <span style={{ fontSize: 10, opacity: 0.75 }}>— {todayQuote.author}</span>
        </p>
      </section>

      {/* ===== 2. タイムライン ===== */}
      <section>
        <h2 style={sectionTitle}>📅 タイムライン</h2>
        <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
          時系列で読書の軌跡を振り返る。3 ヶ月前・半年前の自分の気づきを見返してみましょう。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {memosByMonth.map(([key, group]) => {
            const open = expanded.has(key);
            return (
              <div key={key} style={cardBase}>
                <button
                  type="button"
                  onClick={() => toggleMonth(key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#3d362c', fontWeight: 500 }}>
                    {monthLabel(key)}
                  </span>
                  <span style={{ fontSize: 11, color: '#8a7e6b' }}>
                    {group.length} 件 {open ? '▾' : '▸'}
                  </span>
                </button>
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {group.map((m) => (
                      <ReviewMemoCard
                        key={m.id}
                        memo={m}
                        book={booksById.get(m.bookId)}
                        onOpenBook={onOpenBook}
                        onSwipeDelete={handleSwipeDelete}
                        onLongPress={(payload) => setMemoMenu(payload)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== 3. 全メモ検索 ===== */}
      <section>
        <h2 style={sectionTitle}>🔎 すべての本のメモを横断検索</h2>
        <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
          例：「決断」「習慣」「営業」など、気になるキーワードを入れてみてください
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          <input
            type="search"
            placeholder="本文・タイトル・著者・タグ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
            }}
            style={inp}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              style={{ ...inp, width: 'auto', padding: '8px 10px' }}
              aria-label="種類で絞り込み"
            >
              <option value="all">全種類</option>
              {Object.entries(KIND_META).map(([k, meta]) => (
                <option key={k} value={k}>{meta.icon} {meta.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...inp, width: 'auto', padding: '8px 10px' }}
            >
              <option value="all">全ステータス</option>
              <option value="want">読みたい</option>
              <option value="before">読書前</option>
              <option value="reading">読書中</option>
              <option value="done">読了</option>
            </select>
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                style={{ ...inp, width: 'auto', padding: '8px 10px' }}
              >
                <option value="">全タグ</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>#{t}</option>
                ))}
              </select>
            )}
            {isSearching && (
              <button
                type="button"
                style={{ ...btnGhost, fontSize: 11, padding: '6px 10px' }}
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setTagFilter('');
                  setKindFilter('all');
                }}
              >
                クリア
              </button>
            )}
          </div>
        </div>
        {!isSearching ? (
          <p style={{ fontSize: 11, color: '#a89e8c', textAlign: 'center', padding: '12px 0' }}>
            検索ワードまたはフィルタを指定すると結果が表示されます。
          </p>
        ) : filteredSearch.length === 0 ? (
          <p style={{ fontSize: 12, color: '#8a7e6b', textAlign: 'center', padding: '14px 0', lineHeight: 1.7 }}>
            このキーワードに関連するメモはまだありません。<br />
            読書中・読了の本にメモを残すと、後から検索できます。
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, color: '#8a7e6b', margin: 0 }}>{filteredSearch.length} 件</p>
            {filteredSearch.map((m) => (
              <ReviewMemoCard
                key={m.id}
                memo={m}
                book={booksById.get(m.bookId)}
                onOpenBook={onOpenBook}
                onSwipeDelete={handleSwipeDelete}
                onLongPress={(payload) => setMemoMenu(payload)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
    </PullToRefresh>
  );
}
