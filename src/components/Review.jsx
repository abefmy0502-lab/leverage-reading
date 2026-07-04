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
import Spinner from './Spinner';
import { getRandomFromCategory } from '../lib/quotes';
import { relativeJa, recallFraming, pickRecallMemo, recallPatch } from '../lib/recall';
import { markActivation } from '../lib/activation';
import { isPushSupported, isPushConfigured, getPermission, subscribeToPush, isIOS, isStandalonePWA } from '../lib/push';
import { isNativePushCapable, getNativePushPermission, subscribeNativePush } from '../lib/nativePush';
import { isNative } from '../lib/iap';
import { btnGhost as uiBtnGhost } from '../styles/ui';
import {
  Shuffle, CalendarDays, Search as SearchIcon, RotateCw, MessageSquareQuote,
  StickyNote, BookOpen, Lightbulb, BarChart3, AlertTriangle, FlaskConical, Bot, Gem, FileText, Trash2, Target, Check, Plus,
} from 'lucide-react';
import { track, EVENTS } from '../lib/analytics';

const wrap = { padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: 'var(--c-brand)', margin: '0 0 8px' };
const cardBase = { background: 'var(--c-card)', border: '1px solid var(--c-hairline)', borderRadius: 12, padding: '12px 14px' };
const inp = { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid var(--c-hairline-strong)', borderRadius: 10, background: '#fff', color: 'var(--c-ink)', fontFamily: 'inherit', boxSizing: 'border-box' };
const btnGhost = { ...uiBtnGhost, width: 'auto', padding: '10px 14px', borderRadius: 8, fontSize: 12, minHeight: 44 };
const pill = { fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--c-soft-2)', color: 'var(--c-ink-2)', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' };

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
    // 間隔反復（recall.js）用。select('*') で取れる。未適用DBでは null/0。
    lastRecalledAt: m.last_recalled_at ?? null,
    recallCount: m.recall_count ?? 0,
  };
};

// 知識の種類ごとのアイコン + ラベル + ボーダー色。NoteCard で表示する。
// 種類バッジの配色は「遊園地の原色」を廃し、ウォームなブランド世界観に統一。
// ニュートラル茶を基調に、警告＝レンガ / 達成＝苔グリーン / 学び＝ゴールド の
// 3アクセントだけで意味を出す（本田哲学＝色数を絞る＝洗練）。
const KIND_META = {
  card:              { Icon: StickyNote,        label: 'メモ',          color: 'var(--c-ink-2)' },
  summary:           { Icon: BookOpen,          label: 'まとめメモ',     color: 'var(--c-brand)' },
  personal:          { Icon: Lightbulb,         label: '学び',          color: '#8a7040' },
  invest_purpose:    { Icon: BarChart3,         label: '投資目的',       color: 'var(--c-brand)' },
  current_challenge: { Icon: AlertTriangle,     label: '現在の課題',     color: '#a05040' },
  hypothesis:        { Icon: FlaskConical,      label: '仮説',          color: '#8a7040' },
  ai_summary:        { Icon: Bot,               label: 'AI まとめ',      color: 'var(--c-ink-3)' },
  roi_summary:       { Icon: Gem,               label: '一番の収穫',     color: '#5f7a55' },
  leverage_memo:     { Icon: FileText,          label: 'まとめメモ',     color: 'var(--c-brand)' },
  action_reflection: { Icon: MessageSquareQuote, label: '行動の振り返り', color: '#5f7a55' },
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
    // ※ 投資目的 / 現在の課題 / 仮説 は AI が読む前に生成する「計画」であって
    //   思い出すべき「気づき」ではない。似たテーマの本が増えるとほぼ同じ文章が
    //   何枚も羅列され、本物のメモが埋もれる。振り返り（想起/タイムライン）からは
    //   外し、これらは 🧠知識ベース と本詳細でのみ扱う。読後の学び（まとめ・収穫・
    //   行動の振り返り）と自分で書いたメモだけを想起の対象にする。
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
      alt="メモの写真"
      style={{ width: '70%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--c-hairline)', marginTop: 6 }}
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
  // 長文メモ（AI 選書のヒアリング Q&A など）はタイムラインで畳んでおき、
  // 「もっと見る」で展開。カード内スクロールの読みづらさを解消。
  const [expanded, setExpanded] = useState(false);
  const isLongText = (memo.text || '').length > 140;

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
            <meta.Icon size={11} aria-hidden="true" style={{ verticalAlign: '-1.5px', marginRight: 4 }} />{meta.label}
          </span>
          {category && (
            <span style={{ fontSize: 11, color: 'var(--c-ink-soft)' }}>・{category}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--c-ink-2)', whiteSpace: 'nowrap' }}>
          {showRelative ? relativeJa(memo.createdAt) : fmtDate(memo.createdAt)}
        </span>
      </div>
      {/* 本へのリンク (個人学び以外) */}
      {!isPersonal && (book || memo.bookId) && (
        <button
          type="button"
          onClick={() => book && onOpenBook?.(book)}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, fontSize: 12, fontWeight: 500, color: 'var(--c-brand)', cursor: book ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          📖 {book?.title || '（本のデータが見つかりません）'}
          {book?.author && <span style={{ color: 'var(--c-ink-2)', marginLeft: 6 }}>{book.author}</span>}
        </button>
      )}
      {memo.pageNumber != null && !isPersonal && (
        <span style={{ ...pill, display: 'inline-block', marginTop: 6 }}>P.{memo.pageNumber}</span>
      )}
      {memo.text && (
        <>
          <p
            style={{
              fontSize: 13,
              color: '#4a4036',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
              margin: '8px 0 0',
              ...(isLongText && !expanded
                ? {
                    display: '-webkit-box',
                    WebkitLineClamp: 6,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }
                : {}),
            }}
          >
            {memo.text}
          </p>
          {isLongText && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              style={{ background: 'none', border: 'none', padding: '4px 0 0', marginTop: 2, fontSize: 12, fontWeight: 600, color: 'var(--c-brand)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {expanded ? '閉じる' : 'もっと見る'}
            </button>
          )}
        </>
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

export default function Review({ books = [], onOpenBook, onAddAction, onAddNote }) {
  const { user } = useAuth();
  const toast = useToast();
  const haptic = useHaptic();
  // メモは読書中/読了の本にだけ付けられる。「＋ メモを追加」を出してよいのは
  // 付け先の本がある時だけ（無ければ本棚で本を追加/開始するのが先）。
  const hasMemoableBooks = (books || []).some((b) => b.status === 'reading' || b.status === 'done');
  const [memos, setMemos] = useState([]);
  const [memoMenu, setMemoMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  // seed=0 固定だと pool が同じ限り毎回同じメモが出て「偶然の再会」にならない。
  // 初期値をランダムにして、開くたびに違う一枚が戻ってくるようにする
  // （「別のメモを見る」の setRandomSeed でさらに回せる）。
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 233280));
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
  // 想起カードから「→行動にする」したメモ id（直後のボタン表示を ✓ に切替）。
  const [actionAddedId, setActionAddedId] = useState(null);
  const [addingAction, setAddingAction] = useState(false);
  // 🔔 想起プッシュ通知の aha 直後 opt-in。旗艦の復帰導線が設定モーダル奥・
  // 既定オフ・オンボ未案内で死蔵していたため、実際に「過去メモが1枚戻ってきた」
  // 瞬間に一度だけ価値訴求付きで案内する（1回で dismiss を永続化・しつこくしない）。
  const PUSH_OPTIN_KEY = 'orime-recall-push-optin-v1';
  const [pushOptInDismissed, setPushOptInDismissed] = useState(() => {
    try { return localStorage.getItem(PUSH_OPTIN_KEY) === '1'; } catch { return false; }
  });
  const [pushBusy, setPushBusy] = useState(false);
  // aha 直後の opt-in を出してよいか。Web は同期判定できるが、ネイティブ(APNs)は
  // 権限確認が非同期なので effect で解決する。既定は Web の同期判定。
  const [pushOptInEligible, setPushOptInEligible] = useState(() =>
    !isNative && isPushSupported() && isPushConfigured() && getPermission() === 'default',
  );
  useEffect(() => {
    if (!isNative) return undefined;
    let alive = true;
    (async () => {
      try {
        // ネイティブは「プラグイン利用可 かつ 未許可(prompt)」の時だけ opt-in を出す。
        const eligible = isNativePushCapable && (await getNativePushPermission()) === 'prompt';
        if (alive) setPushOptInEligible(eligible);
      } catch { if (alive) setPushOptInEligible(false); }
    })();
    return () => { alive = false; };
  }, []);
  const dismissPushOptIn = useCallback(() => {
    try { localStorage.setItem(PUSH_OPTIN_KEY, '1'); } catch { /* ignore */ }
    setPushOptInDismissed(true);
  }, []);
  const enablePushFromOptIn = useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const res = isNative
        ? await subscribeNativePush({ frequency: 'weekly' })
        : await subscribeToPush({ frequency: 'weekly' });
      if (res?.ok) {
        try { haptic.success(); } catch { /* non-critical */ }
        toast.success('🔔 通知をオンにしました。忘れた頃にそっとお届けします');
        dismissPushOptIn();
      } else if (res?.reason === 'denied') {
        toast.info('通知は端末の設定でブロックされています。設定から許可できます');
        dismissPushOptIn();
      } else {
        toast.error('通知をオンにできませんでした。設定からもう一度お試しください');
      }
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, haptic, toast, dismissPushOptIn]);

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
  // 件数チップ → 横断検索フィルタ連動時に、結果セクションへスクロールさせる先。
  const searchSectionRef = useRef(null);

  // 種類別の件数 — 上部のサマリーチップに表示。
  const kindCounts = useMemo(() => {
    const c = {};
    for (const n of allNotes) {
      c[n.kind] = (c[n.kind] || 0) + 1;
    }
    return c;
  }, [allNotes]);

  // Default the first month to expanded so the user sees content.
  // 初回（空→非空になった最初）だけ第1月を開く。以降はユーザーの開閉状態を保持する。
  // （allNotes はスワイプ削除/PTR/books 更新のたびに再生成されるので、毎回 reset すると
  //  手動で開いた過去月が畳まれ「3ヶ月前を見返す」主目的を阻害していた。）
  const didInitExpand = useRef(false);
  useEffect(() => {
    if (didInitExpand.current || allNotes.length === 0) return;
    didInitExpand.current = true;
    const firstMonth = monthKey(allNotes[0].createdAt);
    if (firstMonth) setExpanded(new Set([firstMonth]));
  }, [allNotes]);

  const randomMemo = useMemo(() => {
    if (allNotes.length === 0) return null;
    // 「忘れた頃の」sweet spot(30〜183日優先・最低14日)で選ぶ＝push通知/HomeRecall と
    // 同じ想起ロジック。これにより「昨日書いたメモが出て"振り返り"感が無い」を解消。
    // 熟成メモがまだ無い新規ユーザーは従来のランダム1枚にフォールバック（空にしない）。
    const aged = pickRecallMemo(allNotes, { seed: randomSeed });
    if (aged) return aged;
    const idx = Math.floor((randomSeed * 9301 + 49297 + Math.random() * allNotes.length) % allNotes.length);
    return allNotes[idx] || allNotes[0];
  }, [allNotes, randomSeed]);

  // 活性化「想起を体験」ステップ — タブを開いただけ（偽陽性）ではなく、自分のメモが
  // 実際に想起カードとして1枚戻ってきたときに初めて完了にする（= aha の本体）。
  useEffect(() => {
    if (randomMemo) markActivation('review');
  }, [randomMemo]);

  // 🔄→🎯 想起カードのメモを、その場で「行動」に変える。本詳細を開かずに
  // 「読んで終わり」を断ち切る。メモ本文（＋ページ）を行動にプリフィルする。
  const handleMemoToAction = useCallback(async (memo) => {
    if (!memo || !onAddAction || addingAction) return;
    const book = booksById.get(memo.bookId);
    if (!book) return; // 本に紐づかないメモ（学び等）は行動化しない
    setAddingAction(true);
    const ok = await onAddAction(book.id, {
      text: memo.text,
      // 合成ノート（まとめメモ/投資目的/仮説等）の id は非 UUID なので source に渡さない。
      // 実カードメモ（synth=false）のときだけ起点メモ id を残す。
      sourceMemoId: !memo.synth && typeof memo.id === 'string' ? memo.id : null,
      sourcePage: memo.pageNumber ?? null,
    });
    setAddingAction(false);
    if (ok) {
      setActionAddedId(memo.id);
      toast.success('🎯 行動に追加しました');
    }
  }, [onAddAction, addingAction, booksById, toast]);

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
  // 🧠 間隔反復のフィードバック（覚えた/もう一度）。実メモ行(synth:false)だけ
  // last_recalled_at/recall_count を更新し、次の間隔まで出す/翌日また出す を制御。
  // 書き込み後は次の一枚へ回す（reroll）。列未適用DBでは静かに no-op。
  const recordRandomRecall = useCallback(async (memo, mastered) => {
    if (!memo || memo.synth) return;
    try {
      await supabase
        .from('book_memos')
        .update(recallPatch(memo.recallCount, mastered))
        .eq('id', memo.id);
    } catch { /* 列未適用・失敗は静かに無視 */ }
  }, []);

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
        <Spinner message="あなたの気づきを集めています…" />
      </div>
    );
  }

  if (allNotes.length === 0) {
    return (
      <div style={wrap}>
        <EmptyState
          icon={<StickyNote size={34} aria-hidden="true" />}
          title="ここに、あなたの気づきが戻ってきます"
          description={(
            <>
              本を読んでメモを残すと、忘れた頃に<br />
              ここへふいに戻ってきます。まずは一行から。
            </>
          )}
          actions={
            onAddNote && hasMemoableBooks
              ? [{ label: 'メモを追加', icon: <Plus size={18} aria-hidden="true" />, onClick: onAddNote }]
              : []
          }
          tip="残したメモや学びが、すべてここに集まります"
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
            // 🎯 読む→メモる→行動する、の変換点をどの一覧（タイムライン /
            // 検索結果）からでも 1 タップに。ランダム想起カード限定だった
            // handleMemoToAction を長押しメニューにも露出する。
            ...(memoMenu.book && onAddAction
              ? [{ label: '行動にする', icon: <Target size={16} aria-hidden="true" />, onClick: () => handleMemoToAction(memoMenu.memo) }]
              : []),
            ...(memoMenu.book
              ? [{ label: '本を開く', icon: <BookOpen size={16} aria-hidden="true" />, onClick: () => onOpenBook?.(memoMenu.book) }]
              : []),
            { label: '削除', icon: <Trash2 size={16} aria-hidden="true" />, destructive: true, onClick: () => handleSwipeDelete(memoMenu.memo) },
          ]}
        />
      )}

      {/* 🎯 行動タブと同じく、この画面からも直接メモを追加できる導線を出す
          （付け先の本＝読書中/読了の本がある時だけ）。想起カードが主役なので
          控えめに右寄せの細いボタンで。 */}
      {onAddNote && hasMemoableBooks && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onAddNote}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 40,
              padding: '7px 14px', borderRadius: 999, border: '1px solid var(--c-hairline-strong)',
              background: 'var(--c-card)', color: 'var(--c-brand)', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            メモを追加
          </button>
        </div>
      )}

      {/* 知識のタイプ別件数を冒頭に表示。「読書から何が蓄積されているか」が
          一目で分かる + フィルタ前提の数字感をつかむため。 */}
      <section
        aria-label="種類で絞り込む"
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: '10px 12px',
          background: 'var(--c-card)',
          border: '1px solid var(--c-hairline)',
          borderRadius: 12,
        }}
      >
        {Object.entries(KIND_META).map(([k, meta]) => {
          const n = kindCounts[k] || 0;
          if (n === 0) return null;
          const active = kindFilter === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              aria-label={`${meta.label}のメモ ${n}件で絞り込む`}
              onClick={() => {
                setKindFilter(active ? 'all' : k);
                // 絞り込み結果（横断検索）へスクロールして連動を可視化する。
                requestAnimationFrame(() =>
                  searchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                );
              }}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                minHeight: 30,
                borderRadius: 999,
                background: active ? meta.color : `${meta.color}1a`,
                color: active ? '#fff' : meta.color,
                border: active ? `1px solid ${meta.color}` : '1px solid transparent',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <meta.Icon size={11} aria-hidden="true" style={{ verticalAlign: '-1.5px', marginRight: 4 }} />{meta.label} {n}
            </button>
          );
        })}
      </section>

      {/* ===== 1. 今日の振り返り (random) ===== */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={sectionTitle}>
            <Shuffle size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
            ランダム表示
          </h2>
          <button type="button" style={btnGhost} onClick={reroll} disabled={flipping}>
            <RotateCw size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />
            別のメモを見る
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '0 0 10px', lineHeight: 1.7 }}>
          偶然の再会で、忘れていた気づきを呼び戻します
        </p>
        {allNotes.length <= 3 && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--c-ink-2)',
              background: '#f4efe7',
              border: '1px solid var(--c-hairline)',
              borderRadius: 10,
              padding: '8px 12px',
              margin: '0 0 10px',
              lineHeight: 1.7,
            }}
          >
            メモが貯まるほど、戻ってくる気づきも豊かになります。今は少なくても大丈夫。
          </p>
        )}
        {randomMemo && recallFraming(randomMemo.createdAt) && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--c-ink-2)',
              margin: '0 0 8px',
            }}
          >
            <MessageSquareQuote size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
            {recallFraming(randomMemo.createdAt)}
          </p>
        )}
        {randomMemo && (
          <div
            style={{
              // preserve-3d / backfaceVisibility はフリップ中だけ。安静時に残すと
              // iOS Safari で永続 3D レイヤーになり、長いノートの上方向スクロールが
              // 固まる（PullToRefresh の always-on translate3d と同じ原因）。
              animation: flipping ? 'leverage-card-flip .6s ease-in-out both' : undefined,
              transformStyle: flipping ? 'preserve-3d' : undefined,
              backfaceVisibility: flipping ? 'hidden' : undefined,
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
            {/* 🔄→🎯 この気づきを、その場で行動に変える（本に紐づくメモのみ） */}
            {onAddAction && booksById.get(randomMemo.bookId) && (
              actionAddedId === randomMemo.id ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--c-brand)' }}>
                  <Check size={15} aria-hidden="true" />
                  行動リストに追加しました
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMemoToAction(randomMemo)}
                  disabled={addingAction}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                    minHeight: 44, padding: '8px 16px', borderRadius: 10,
                    border: '1px solid var(--c-brand)', background: 'transparent',
                    color: 'var(--c-brand)', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit', cursor: addingAction ? 'default' : 'pointer',
                    opacity: addingAction ? 0.6 : 1,
                  }}
                >
                  <Target size={15} aria-hidden="true" />
                  この気づきを行動にする
                </button>
              )
            )}
            {/* 🧠 間隔反復のフィードバック（実メモのみ）。「覚えた」で定着させ次の
                間隔まで出さない／「もう一度」で翌日また戻す。 */}
            {!randomMemo.synth && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => { recordRandomRecall(randomMemo, true); reroll(); }}
                  style={{
                    minHeight: 40, padding: '8px 16px', borderRadius: 10,
                    border: '1px solid var(--c-hairline-strong)', background: '#fff',
                    color: 'var(--c-brand)', fontSize: 12, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  ✓ 覚えた
                </button>
                <button
                  type="button"
                  onClick={() => { recordRandomRecall(randomMemo, false); reroll(); }}
                  style={{
                    minHeight: 40, padding: '8px 16px', borderRadius: 10,
                    border: '1px solid var(--c-hairline-strong)', background: '#fff',
                    color: 'var(--c-ink-2)', fontSize: 12, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  もう一度
                </button>
              </div>
            )}
          </div>
        )}
        <p style={{ fontSize: 10, color: 'var(--c-ink-2)', marginTop: 6, lineHeight: 1.6 }}>
          忘れかけていた気づきを思い出す習慣で、本の内容が定着します。
        </p>

        {/* 🔔 aha 直後の通知 opt-in（初回・1枚戻ってきた時だけ・未許可時のみ） */}
        {randomMemo && !pushOptInDismissed && pushOptInEligible && (
          <div
            style={{
              marginTop: 12, padding: '12px 14px', borderRadius: 12,
              background: 'var(--c-soft)', border: '1px solid var(--c-hairline)',
            }}
          >
            <p style={{ fontSize: 12, color: 'var(--c-ink)', margin: 0, lineHeight: 1.7, fontWeight: 600 }}>
              🔔 忘れた頃に、この一行がそっと戻ってきます
            </p>
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '4px 0 10px', lineHeight: 1.7 }}>
              週に1回ほど、過去のあなたのメモを通知でお届けします（いつでもオフにできます）。
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={enablePushFromOptIn}
                disabled={pushBusy}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 10, border: 'none',
                  background: 'var(--c-brand)', color: 'var(--c-card)', fontSize: 13,
                  fontWeight: 700, fontFamily: 'inherit', cursor: pushBusy ? 'default' : 'pointer',
                  opacity: pushBusy ? 0.6 : 1,
                }}
              >
                {pushBusy ? '設定中…' : '通知を受け取る'}
              </button>
              <button
                type="button"
                onClick={dismissPushOptIn}
                disabled={pushBusy}
                style={{
                  flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 10,
                  border: '1px solid var(--c-hairline-strong)', background: 'transparent',
                  color: 'var(--c-ink-2)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                今はしない
              </button>
            </div>
            {!isNative && isIOS() && !isStandalonePWA() && (
              <p style={{ fontSize: 10, color: 'var(--c-ink-3)', margin: '8px 0 0', lineHeight: 1.6 }}>
                ※ iPhone / iPad は「ホーム画面に追加」したアプリから開くと通知を使えます。
              </p>
            )}
          </div>
        )}
        <p
          style={{
            fontSize: 12,
            color: 'var(--c-ink-2)',
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: 12,
            lineHeight: 1.7,
          }}
        >
          “{todayQuote.text}”
          <br />
          <span style={{ fontSize: 10, opacity: 0.75 }}>— {todayQuote.author}</span>
        </p>
      </section>

      {/* ===== 2. タイムライン ===== */}
      <section>
        <h2 style={sectionTitle}>
          <CalendarDays size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
          タイムライン
        </h2>
        <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '0 0 10px', lineHeight: 1.7 }}>
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
                  <span style={{ fontSize: 13, color: 'var(--c-ink)', fontWeight: 500 }}>
                    {monthLabel(key)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--c-ink-2)' }}>
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
      <section ref={searchSectionRef}>
        <h2 style={sectionTitle}>
          <SearchIcon size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
          すべての本のメモを横断検索
        </h2>
        <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '0 0 10px', lineHeight: 1.7 }}>
          例：「決断」「習慣」「営業」など、気になるキーワードを入れてみてください
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          <input
            type="search"
            placeholder="本文・タイトル・著者・タグ"
            aria-label="メモ横断検索: 本文・タイトル・著者・タグから探す"
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
                <option key={k} value={k}>{meta.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...inp, width: 'auto', padding: '8px 10px' }}
            >
              <option value="all">全ステータス</option>
              <option value="want">読みたい</option>
              <option value="before">積読</option>
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
          <p style={{ fontSize: 11, color: 'var(--c-ink-2)', textAlign: 'center', padding: '12px 0' }}>
            検索ワードまたはフィルタを指定すると結果が表示されます。
          </p>
        ) : filteredSearch.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--c-ink-2)', textAlign: 'center', padding: '14px 0', lineHeight: 1.7 }}>
            このキーワードに関連するメモはまだありません。<br />
            読書中・読了の本にメモを残すと、後から検索できます。
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: 0 }}>{filteredSearch.length} 件</p>
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
