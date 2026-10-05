// 🔄 Review tab — surfaces memos from any time so the user can re-encounter
// what they wrote. Three sections:
//   1. 今日の振り返り (random memo, re-rollable)
//   2. タイムライン (memos grouped by month, collapsible)
//   3. 全メモ検索 (cross-book full-text search)
//
// Display is read-only here. Tapping a memo opens its book in the book detail
// view, where the user can edit/delete via the existing BookMemoList flow.

import { lazy, startTransition, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invalidateKnowledgeCache } from '../lib/ai';
import { supabase, isSupabaseConfigured, isDemo } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { ensureHttps } from '../lib/url';
import { useLongPress } from '../hooks/useLongPress';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from './Toast';
import { toMessage, isSchemaError } from '../lib/errors';
import SwipeableCard from './SwipeableCard';
import ContextMenu from './ContextMenu';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import Spinner from './Spinner';
import { SkeletonBlock } from './Skeleton';
import { isAiWritten, relativeJa, recallFraming, pickRecallMemo, pickFallbackMemo, pickExtraMemo, nextDueAt, nextDueLabel, applyLocalRecall, recallPatch, dueGapDays } from '../lib/recall';
import { loadRecallLocal, saveRecallLocal } from '../lib/recallLocal';
import { shouldAskForReview, markReviewAsked, askForReview } from '../lib/reviewRequest';
import { markActivation } from '../lib/activation';
import NotifyOptInCard from './NotifyOptInCard';
import { btnGhost as uiBtnGhost, btnGhostOff as uiBtnGhostOff, btnLink, groupTitle, card as uiCard, input as uiInput } from '../styles/ui';
import {
  Shuffle, CalendarDays, Search as SearchIcon, RotateCw, MessageSquareQuote,
  StickyNote, BookOpen, Lightbulb, BarChart3, AlertTriangle, FlaskConical, Bot, Gem, FileText, Trash2, Target, Check, Plus, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Copy, Share,
} from 'lucide-react';
import { track, EVENTS } from '../lib/analytics';
// 一文をシェアのシート（メモの「…」から・押したときだけ読む）。
const ShareSheet = lazy(() => import('./ShareSheet'));
import { useConfirm } from './ConfirmDialog';

// 見た目は DESIGN.md のトークンのみ（2026-09-26・SPEC §4 でメモのサブタブを整理）。
const wrap = { padding: 'var(--space-3) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' };
// 小さな見出し（ui.js groupTitle）と中身の間は 8（DESIGN §1 グループ内）。
const sectionTitle = { ...groupTitle, margin: '0 0 var(--space-2)' };
// カード（ui.js card・内側 16）。
const cardBase = { ...uiCard, padding: 'var(--space-4)' };
// 絞り込みのメニューを開く文字ボタン（メモ一覧の「ページ順 ▾」と同じ: --accent・15/600・高さ 44）。
const filterMenuBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, minWidth: 0, maxWidth: '100%', padding: '0 var(--space-1)', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
// 行の中の副ボタン（DESIGN §5 btnRow: 高さ 44・15・600）。
const btnGhost = { ...uiBtnGhost, width: 'auto', minHeight: 44, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sub)' };

// relativeJa / recallFraming は src/lib/recall.js に切り出して
// サーバー（api/push-cron.js の想起通知）と文言を共有している。

// 本の詳細のメモと同じ「9/28」。今年でなければ年も（「2025/9/28」・2026-09-30）。
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}/${md}`;
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
  // 以前の形式のまとめ（book_memos.source_type='summary'）も、本の詳細と同じ「この本のまとめ」として扱う。
  const kind = sourceType === 'personal' ? 'personal' : sourceType === 'summary' ? 'leverage_memo' : 'card';
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
// 種類の名前とアイコン。色は付けない（アイコン 14＋--text-2 の文字・DESIGN §5「表示用ラベル」・
// 以前あった色の値は使われていない古いトークンだったので外した・2026-10-04）。
const KIND_META = {
  card:              { Icon: StickyNote,        label: 'メモ' },
  personal:          { Icon: Lightbulb,         label: '学び' },
  invest_purpose:    { Icon: BarChart3,         label: '得たいこと' },
  current_challenge: { Icon: AlertTriangle,     label: '現在の課題' },
  hypothesis:        { Icon: FlaskConical,      label: '仮説' },
  // AI が書いたもの。一覧・検索には「AI まとめ」と分かる名前で出すが、思い出しカードには出さない（recall.js の isAiWritten・2026-10-04）。
  ai_summary:        { Icon: Bot,               label: 'AI まとめ' },
  roi_summary:       { Icon: Gem,               label: '一番の収穫' },
  // 自分で書いた本の総括（books.leverage_memo と、以前の形式の book_memos.source_type='summary'）。本の詳細と同じ名前（2026-10-04）。
  leverage_memo:     { Icon: FileText,          label: 'この本のまとめ' },
  action_reflection: { Icon: MessageSquareQuote, label: '行動のふりかえり' },
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

// 🧠 想起履歴の端末ローカル記録は lib/recallLocal.js（派生ノートは常に・実メモは DB 書き込みが
// 失敗したときだけ）。派生ノートは DB 行を持たないので、これが無いと「覚えた」を押しても永遠に
// due のままで、overdue スコアが毎日積み上がり、実メモを押しのけて想起プールを占拠してしまう。

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
  // 署名 URL 解決までは場所を先取りするプレースホルダを出す（解決後にガクッと
  // 出現する CLS を防ぐ）。写真が無い（path なし）ときだけ何も描画しない。
  if (!url) {
    if (!path) return null;
    return (
      <div
        aria-hidden="true"
        style={{
          width: '70%', height: 160, borderRadius: 'var(--radius)', marginTop: 'var(--space-2)',
          border: '1px solid var(--separator)', background: 'var(--fill)',
        }}
      />
    );
  }
  return (
    <img
      src={ensureHttps(url)}
      alt="メモの写真"
      style={{ width: '70%', maxHeight: 240, objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--separator)', marginTop: 'var(--space-2)' }}
    />
  );
}

// tapToEdit: カードを押すと、その本のそのメモを編集で開く（月ごとのメモ・本の詳細のメモと同じ所作・2026-09-30）。
//   本に付いたふつうのメモだけ（学び・まとめなどは本を開く／何もしない）。
function ReviewMemoCard({ memo, book, onOpenBook, showRelative = false, onSwipeDelete, onLongPress, onOpenMenu, openOnTap = false, tapToEdit = false }) {
  const kind = memo.kind || (memo.sourceType === 'personal' ? 'personal' : memo.sourceType === 'summary' ? 'leverage_memo' : 'card');
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
  // 思い出しカード（showRelative）は小さく見せる（SPEC §4・2026-09-26 オーナー判断）:
  // 本文 2 行で畳み、本文をタップ（または「続きを読む」）で全文。一覧は 6 行。
  const clampN = showRelative ? 2 : 6;
  // 「続きを読む」は文字数ではなく、実際に畳んだ行からはみ出しているときだけ出す（幅・改行で変わるため測る）。
  const bodyRef = useRef(null);
  const [isLongText, setIsLongText] = useState(false);
  useLayoutEffect(() => {
    if (expanded) return undefined; // 開いている間は測れない（畳んだときの結果を保つ）
    const el = bodyRef.current;
    if (!el) return undefined;
    const measure = () => setIsLongText(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [expanded, memo.text, clampN]);

  // 種類は色の帯ではなく、小さなアイコン＋文字で示す（色はニュートラル＋栗色 1 色・DESIGN §3）。
  // ふつうのメモ（card）は種類を出さない（ほとんどがこれなので、出すと毎枚「メモ」が並ぶだけ）。
  // そのときは本の名前を 1 行目の左に置く。学び・まとめ系だけ種類を出す。
  const cardStyle = cardBase;
  const showKind = kind !== 'card';
  const hasBookLink = !isPersonal && !!(book || memo.bookId);
  const bookInHeader = !showKind && hasBookLink;
  const bookButton = (inHeader) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (book) onOpenBook?.(book, memo.id); }}
      style={{ background: 'none', border: 'none', padding: 0, minHeight: 44, margin: inHeader ? 'calc(-1 * var(--space-3)) 0' : 'calc(-1 * var(--space-2)) 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', cursor: book ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(inHeader ? { flex: '1 1 0', minWidth: '50%' } : {}) }}
    >
      {/* 1 行目は書名だけ（著者は本の詳細にある・長い書名が著者で切れないように・SPEC §4・2026-09-29）。 */}
      {book?.title || '（本のデータが見つかりません）'}
    </button>
  );
  // 「続きを読む」がカードの最後なら、ボタンの下の余り（44 の押せる範囲の余白）をカードの内側余白に重ねる。

  // 検索の結果はカードのどこを押しても本を開く（書名だけが押せる形だと、押せる場所が小さい・2026-09-29）。
  const canEdit = tapToEdit && !!book && !!onOpenBook && kind === 'card' && !isSynth;
  const tapOpens = (openOnTap || canEdit) && !!book && !!onOpenBook;
  // 本の詳細を開く描画は後回しにできる更新にして、押した形（lib/pressFeedback.js）を先に描く（遅い端末で押しても反応が無く見えた）。
  const openBook = () => startTransition(() => onOpenBook(book, memo.id, canEdit ? { edit: true } : undefined));
  const inner = (
    <div
      style={tapOpens ? { ...cardStyle, cursor: 'pointer' } : cardStyle}
      onClick={tapOpens ? openBook : undefined}
      // キーボード・スイッチ操作でも開けるように（Enter / Space・中のボタンで押したときは、そのボタンの動作だけ）。
      {...(tapOpens ? {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e) => {
          if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBook(); }
        },
      } : null)}
      {...(onLongPress && !isSynth ? longPress.bind : {})}
    >
      {/* 書名は行の半分以上を保つ。文字が大きくて日付・ページが残りに入らないときは、日付が次の行へ回る（書名が「1兆…」まで縮まない・2026-10-04）。 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', columnGap: 'var(--space-2)', rowGap: 0, flexWrap: 'wrap' }}>
        {bookInHeader ? bookButton(true) : (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {showKind && <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}
            aria-label={`種類: ${meta.label}`}
          >
            <meta.Icon size={14} aria-hidden="true" />{meta.label}
          </span>}
          {category && (
            <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>・{category}</span>
          )}
        </div>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {/* ページは日付と同じ行に（「5 か月前 · p.88」・別の行にすると本文との間が空く・2026-09-29）。
              日付のときは本の詳細のメモと同じ並び（「p.95 · 9/28」・2026-09-30）。 */}
          {showRelative ? (
            <>{relativeJa(memo.createdAt)}{memo.pageNumber != null && !isPersonal && <> · p.{memo.pageNumber}</>}</>
          ) : (
            <>{memo.pageNumber != null && !isPersonal && <>p.{memo.pageNumber} · </>}{fmtDate(memo.createdAt)}</>
          )}
          {/* 「…」（横・DESIGN §5）。押せる範囲 44 は保ち、行の高さは負の余白で増やさない。 */}
          {onOpenMenu && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onOpenMenu({ x: r.right - 8, y: r.bottom + 4, memo, book }); }}
              aria-label="このメモの操作"
              aria-haspopup="menu"
              style={{ width: 44, height: 44, margin: 'calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-full)', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {/* 本へのリンク (個人学び以外) */}
      {hasBookLink && !bookInHeader && bookButton(false)}
      {memo.text && (
        <>
          <p
            ref={bodyRef}
            style={{
              // メモ本文＝読む文章（明朝 18・行間 1.6・DESIGN §2）
              fontFamily: 'var(--font-read)',
              fontSize: 'var(--text-read)',
              color: 'var(--text)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              margin: 'var(--space-2) 0 0',
              // 畳むのは常に（思い出しカードは最大 2 行・一覧は 6 行）。はみ出すかは上の測定で判断。
              ...(!expanded
                ? {
                    display: '-webkit-box',
                    WebkitLineClamp: clampN,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }
                : {}),
              ...(isLongText ? { cursor: 'pointer' } : {}),
            }}
            // 長いときは本文そのものをタップして開閉できる（「続きを読む」と同じ）。検索の結果は本文を押しても本を開く。
            onClick={isLongText && !tapOpens ? (e) => { e.stopPropagation(); setExpanded((v) => !v); } : undefined}
          >
            {memo.text}
          </p>
          {isLongText && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              style={{ ...btnLink, padding: 0, margin: 'calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-3))' }}
            >
              {expanded ? '閉じる' : '続きを読む'}
            </button>
          )}
        </>
      )}
      {memo.photoPath && <MemoPhoto path={memo.photoPath} />}
      {visibleTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          {visibleTags.map((t) => (
            <span key={t} style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>#{t}</span>
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

// 🔎 本を開いて戻ってきたとき（画面を作り直しても）、検索の言葉・絞り込み・思い出しカードの 1 枚を
// そのままにする（相談の session と同じ考え方・2026-09-29）。アプリを開き直したら消える。
// { userId, search, tagFilter, kindFilter, randomSeed, searchActive }
let reviewSession = null;
const reviewSessionFor = (userId) => (reviewSession && userId && reviewSession.userId === userId ? reviewSession : null);
const rememberReview = (userId, patch) => {
  if (!userId) return;
  if (!reviewSession || reviewSession.userId !== userId) reviewSession = { userId };
  Object.assign(reviewSession, patch);
};

// 🔎 ほかの画面から「この言葉でメモを探す」で開いたときの言葉（{ query, nonce }・App が渡す）。
// 同じ nonce は 1 回だけ入れる（本を開いて戻ってきたときに、消した言葉が戻らないように）。
let appliedSearchNonce = null;

export default function Review({ books = [], onOpenBook, onAddAction, onAddNote, onGoToShelf, onAskConsult, searchPreset = null }) {
  const { user } = useAuth();
  const resumedReview = useRef(reviewSessionFor(user?.id)).current;
  // まだ入れていない検索の言葉（開いた瞬間から検索の結果を出す＝思い出しカードが一瞬見えないように）。
  const freshPreset = useRef(searchPreset?.nonce && searchPreset.nonce !== appliedSearchNonce ? searchPreset : null).current;
  const toast = useToast();
  // 「◯ 日後にまた出します」の知らせ。行動・記録へ切り替えたら（この画面が閉じたら）残さない（2026-09-29）。
  const recallToastRef = useRef(null);
  const dismissToast = toast.dismiss;
  useEffect(() => () => {
    if (recallToastRef.current) dismissToast(recallToastRef.current, { byUser: true });
  }, [dismissToast]);
  const confirm = useConfirm();
  const haptic = useHaptic();
  // メモの本文をコピー（ページがあれば「(p.N)」を添える・本の詳細と同じ）。
  const copyMemo = async (memo) => {
    const body = (memo?.text || '').trim();
    if (!body) return;
    const text = Number.isFinite(memo.pageNumber) ? `${body} (p.${memo.pageNumber})` : body;
    try {
      await navigator.clipboard.writeText(text);
      haptic.light();
      toast.success('コピーしました。');
    } catch {
      toast.error('コピーできませんでした。');
    }
  };
  // メモは読書中/読了の本にだけ付けられる。「＋ メモを追加」を出してよいのは
  // 付け先の本がある時だけ（無ければ本棚で本を追加/開始するのが先）。
  const hasMemoableBooks = (books || []).some((b) => b.status === 'reading' || b.status === 'done');
  const [memos, setMemos] = useState([]);
  const [memoMenu, setMemoMenu] = useState(null);
  // 一文をシェア（{ book, memoId }）。
  const [shareTarget, setShareTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  // 取得失敗（通信断など）。空状態と区別して「読み込みに失敗」+再試行を出す。
  const [fetchFailed, setFetchFailed] = useState(false);
  // seed=0 固定だと pool が同じ限り毎回同じメモが出て「偶然の再会」にならない。
  // 初期値をランダムにして、開くたびに違う一枚が戻ってくるようにする
  // （「別のメモを見る」の setRandomSeed でさらに回せる）。
  // お試しモード（開発専用）では最初の 1 枚を固定する（スクリーンショットを撮り直しても同じカード）。
  const [randomSeed, setRandomSeed] = useState(() => (
    Number.isFinite(resumedReview?.randomSeed) ? resumedReview.randomSeed
      : isDemo ? 0 : Math.floor(Math.random() * 233280)
  ));
  const [flipping, setFlipping] = useState(false);
  const flipTimerRef = useRef(null);
  const flipEndTimerRef = useRef(null);
  // 「覚えた/もう一度」のローカル反映をフリップ折り返しへ遅延させるタイマー。
  const recallApplyTimerRef = useRef(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [search, setSearch] = useState(() => (freshPreset ? String(freshPreset.query || '') : resumedReview?.search || ''));
  // 絞り込み・結果の描画は一歩遅れの値で（打っている間は入力欄を先に描き、結果はあとから・CPU が遅い端末でも文字が詰まらない・2026-09-30）。
  const deferredSearch = useDeferredValue(search);
  const [tagFilter, setTagFilter] = useState(() => (freshPreset ? '' : resumedReview?.tagFilter || ''));
  // 想起カードから「→行動にする」したメモ id（直後のボタン表示を ✓ に切替）。
  const [actionAddedId, setActionAddedId] = useState(null);
  const [addingAction, setAddingAction] = useState(false);
  // Analytics: fire once when the Review tab mounts (not per sub-tab switch).
  // Empty dep array → runs exactly once on mount. fire-and-forget, no PII.
  useEffect(() => {
    track(EVENTS.REVIEW_OPENED);
  }, []);

  const fetchGenRef = useRef(0);
  const fetchMemos = useCallback(async (opts = {}) => {
    if (!user || !isSupabaseConfigured) {
      setMemos([]);
      setLoading(false);
      return;
    }
    // 世代トークン: マウント + PTR + Undo 復元後と発火源が多く、遅い旧リクエストが
    // 後着すると削除/復元直後の一覧が巻き戻って見える。最新 fetch 以外は捨てる。
    const gen = ++fetchGenRef.current;
    // silent: Pull-to-Refresh から呼ぶときは全画面スピナーに切り替えない。
    // loading=true にすると下の早期 return が PullToRefresh ごと unmount し、
    // PTR のリング/✓演出が消えて画面がチラつく（onRefresh の promise も宙に浮く）。
    if (!opts.silent) setLoading(true);
    // Supabase 既定の max-rows (1000) を超えるヘビーユーザーでも古いメモが
    // タイムライン/検索/想起から黙って消えないよう range ページングで全件取得。
    // 上限 10 ページ (1万件) は安全弁。
    const PAGE = 1000;
    let rows = [];
    let error = null;
    for (let page = 0; page < 10; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error: e } = await supabase
        .from('book_memos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        // created_at は一意でない（一括インポート等でタイ）ため、ページ境界の
        // 重複・欠落を防ぐ第2ソートキーを付ける。
        .order('id', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (e) { error = e; break; }
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    if (gen !== fetchGenRef.current) return; // stale fetch — 後着の旧応答は捨てる
    if (error) {
      console.error('review memos fetch error:', error);
      // 「全メモが消えた」ように見せない — 空にせずエラー状態を立てて再試行導線を出す。
      setFetchFailed(true);
    } else {
      setFetchFailed(false);
      setMemos(rows.map(transformRow));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMemos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Pull-to-refresh handler — refetch + re-roll random.
  const handleRefresh = useCallback(async () => {
    await fetchMemos({ silent: true });
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
      let deleteFailed = false;
      const promise = (async () => {
        const { error } = await supabase
          .from('book_memos')
          .delete()
          .eq('id', snapshot.id)
          .eq('user_id', user.id);
        if (error) throw error;
        invalidateKnowledgeCache(); // 消したメモを相談の材料に使い続けない
        if (snapshot.photoPath) {
          try {
            await supabase.storage.from('book-memo-photos').remove([snapshot.photoPath]);
          } catch { /* ignore */ }
        }
      })().catch((e) => {
        toast.error(toMessage(e, 'メモの削除に失敗しました。'));
        // Restore in UI on failure
        deleteFailed = true;
        setMemos((arr) => [snapshot, ...arr]);
        throw e;
      });
      toast.undo({
        message: snapshot.photoPath
          ? 'メモを削除しました。\n写真は元に戻せません。'
          : 'メモを削除しました。',
        onUndo: async () => {
          try {
            await promise.catch(() => {});
            // DELETE 自体が失敗していた場合、メモは DB に健在 — 同 id を INSERT すると
            // PK 重複で「復元に失敗しました」と出て混乱させる。Undo は何もしなくてよい。
            if (deleteFailed) { toast.info('メモは削除されていません。'); return; }
            const payload = {
              id: snapshot.id,
              book_id: snapshot.bookId || null,
              user_id: user.id,
              page_number: snapshot.pageNumber ?? null,
              text: snapshot.text || '',
              tags: snapshot.tags || [],
              photo_path: null,
              // 元の source_type を尊重（'summary' 等を 'book' に潰さない）。
              source_type: snapshot.sourceType || (snapshot.bookId ? 'book' : 'personal'),
            };
            if (snapshot.createdAt) payload.created_at = snapshot.createdAt;
            // 間隔反復の進捗（覚えた回数・最終想起）も復元する。列が無い DB では
            // schema-error になるため、その時だけ剥がして再挿入する。
            const withRecall = { ...payload };
            if (snapshot.recallCount) withRecall.recall_count = snapshot.recallCount;
            if (snapshot.lastRecalledAt) withRecall.last_recalled_at = snapshot.lastRecalledAt;
            let { error } = await supabase.from('book_memos').insert([withRecall]);
            if (error && isSchemaError(error)) {
              ({ error } = await supabase.from('book_memos').insert([payload]));
            }
            if (error) throw error;
            invalidateKnowledgeCache();
            toast.info('削除を取り消しました。');
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
  // 端末ローカルの想起履歴（派生ノートは常に・実メモは DB に書けなかったときだけ・lib/recallLocal.js）。
  // DB の値より新しいときだけ重ねる（recall.js の applyLocalRecall）。
  const [localRecall, setLocalRecall] = useState(loadRecallLocal);
  const updateLocalRecall = useCallback((id, entry) => {
    setLocalRecall((cur) => {
      const next = { ...cur };
      if (entry) next[id] = entry; else delete next[id];
      saveRecallLocal(next);
      return next;
    });
  }, []);

  const allNotes = useMemo(() => {
    const withLocal = (n) => applyLocalRecall(n, localRecall[n.id]);
    const merged = [...memos.map(withLocal), ...buildSyntheticNotes(books).map(withLocal)];
    merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return merged;
  }, [memos, books, localRecall]);

  // 知識タイプ別のフィルタ (横断検索セクション用)。
  const [kindFilter, setKindFilter] = useState(() => (freshPreset ? 'all' : resumedReview?.kindFilter || 'all'));
  // 件数チップ → 横断検索フィルタ連動時に、結果セクションへスクロールさせる先。

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
    // メモの読み込みが終わってから決める（本だけが先に並んだ時点の古い月を開かない）。
    if (didInitExpand.current || loading || allNotes.length === 0) return;
    didInitExpand.current = true;
    // いちばん新しい月を開く（並び順に頼らず、日付で選ぶ）
    const newest = allNotes.reduce((a, n) => ((n.createdAt || '') > (a.createdAt || '') ? n : a), allNotes[0]);
    const firstMonth = monthKey(newest.createdAt);
    if (firstMonth) setExpanded(new Set([firstMonth]));
  }, [allNotes, loading]);

  const randomMemo = useMemo(() => {
    if (allNotes.length === 0) return null;
    // 「忘れた頃の」sweet spot(30〜183日優先・最低14日)で選ぶ＝push通知/HomeRecall と
    // 同じ想起ロジック。これにより「昨日書いたメモが出て"振り返り"感が無い」を解消。
    // 熟成メモがまだ無い新規ユーザーは従来のランダム1枚にフォールバック（空にしない）。
    const aged = pickRecallMemo(allNotes, { seed: randomSeed });
    if (aged) return aged;
    // 熟成メモが無い新規ユーザーのフォールバック（一度も思い出していない若いメモだけ）。
    // 「覚えた／まだ覚えていない」と答えて次の間隔を待っているメモは出さない
    // （以前は全メモから選んでいて、覚えたメモに何度も「覚えた？」と聞いていた・2026-10-01）。
    // useMemo 内なので純粋に保つ（seed から決定的に）。
    return pickFallbackMemo(allNotes, { seed: randomSeed });
  }, [allNotes, randomSeed]);
  // 今日出すメモが残っていない（すべて次の間隔を待っている）→「今日の思い出しカードは、ここまでです」。
  const recallNextLabel = useMemo(
    () => (randomMemo || allNotes.length === 0 ? '' : nextDueLabel(nextDueAt(allNotes))),
    [randomMemo, allNotes],
  );
  // 思い出しカードに出せるのは自分の言葉だけ（AI まとめは出さない・2026-10-04）。AI まとめしか無い人には
  // 「ここまでです」も出さない（思い出しカードの区画ごと出さない）。
  const hasOwnNotes = useMemo(() => allNotes.some((n) => !isAiWritten(n)), [allNotes]);
  const recallDone = !randomMemo && hasOwnNotes;
  // 月ごとのメモ: メモが 1 件だけのときは思い出しカードと同じメモになるので出さないが、思い出しカードに
  // 出ていない（AI まとめだけ・今日の分が終わった）ときは出す（何も見えなくなっていた・2026-10-04 ui-critic）。
  const showMonthly = allNotes.length > 1 || !randomMemo;
  // 「ここまでです」の下の「別のメモを見る」で出す 1 枚（null＝見ていない）。答えのボタンは出さない。
  // 最近思い出したメモはできるだけ避ける（recall.js の pickExtraMemo）。
  const [extraSeed, setExtraSeed] = useState(null);
  const extraMemo = useMemo(
    () => (recallDone && extraSeed != null ? pickExtraMemo(allNotes, { seed: extraSeed }) : null),
    [recallDone, extraSeed, allNotes],
  );
  // 今日出すメモがまた出てきたら（元に戻す・新しいメモ）、「別のメモを見る」の状態は終える。
  useEffect(() => { if (randomMemo) setExtraSeed(null); }, [randomMemo]);
  // 最後の 1 枚を答えたら、フリップのあとで「ここまでです」に目を移す（読み上げはトーストと重ねない）。
  const recallDoneRef = useRef(null);
  const recallDoneFocusTimerRef = useRef(null);

  // 活性化「想起を体験」ステップ — タブを開いただけ（偽陽性）ではなく、自分のメモが
  // 実際に想起カードとして1枚戻ってきたときに初めて完了にする（= aha の本体）。
  useEffect(() => {
    // recallFraming が空 = 当日書いたばかりのメモのフォールバック表示。それで
    // 完了にすると初日にチェックリストが消え、翌日の「本物の想起」への橋を失う。
    if (randomMemo && recallFraming(randomMemo.createdAt)) {
      markActivation('review');
      // 📊 初週想起体験率の分子（本物の想起のみ。初回判定は集計側で MIN(created_at)）。
      track(EVENTS.RECALL_SHOWN, { surface: 'review' });
    }
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
      toast.success('行動に追加しました。');
    }
  }, [onAddAction, addingAction, booksById, toast]);

  const allTags = useMemo(() => {
    const s = new Set();
    allNotes.forEach((m) => (m.tags || []).forEach((t) => s.add(t)));
    return [...s];
  }, [allNotes]);
  // 絞り込みのメニューに出すタグ（使った回数の多い順に 7 つ＋いま選んでいるタグ）。
  const menuTags = useMemo(() => {
    const count = new Map();
    allNotes.forEach((m) => (m.tags || []).forEach((t) => { if (!String(t).startsWith('@')) count.set(t, (count.get(t) || 0) + 1); }));
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t);
    if (tagFilter && !top.includes(tagFilter)) top.push(tagFilter);
    return top;
  }, [allNotes, tagFilter]);
  // 種類・タグの絞り込みのメニュー（{ kind: 'kind' | 'tag', x, y } | null）。
  const [filterMenu, setFilterMenu] = useState(null);

  const filteredSearch = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q && !tagFilter && kindFilter === 'all') return [];
    // 空白で区切った言葉は「どれかを含む」メモを探し、多く含むメモから並べる（2026-09-29。相談で
    // トークンを使い切ったときの「メモを検索して探す」が、相談の言葉を空白区切りで入れてくる）。
    const terms = q ? [...new Set(q.split(/[\s　]+/).filter(Boolean))] : [];
    const hitsOf = (m) => {
      if (!terms.length) return 1;
      const book = booksById.get(m.bookId);
      const hay = [book?.title, book?.author, m.text, ...(m.tags || [])].map((v) => String(v || '').toLowerCase());
      return terms.filter((t) => hay.some((h) => h.includes(t))).length;
    };
    const scored = [];
    allNotes.forEach((m, i) => {
      if (kindFilter !== 'all' && m.kind !== kindFilter) return;
      if (tagFilter && !m.tags?.includes(tagFilter)) return;
      const hits = hitsOf(m);
      if (hits > 0) scored.push({ m, hits, i });
    });
    if (terms.length > 1) scored.sort((a, b) => b.hits - a.hits || a.i - b.i);
    return scored.map((x) => x.m);
  }, [allNotes, booksById, deferredSearch, tagFilter, kindFilter]);

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
  // 直前の「覚えた／まだ覚えていない」の DB 書き込み（取り消しはこれを待ってから戻す＝順番が逆転しない）。
  const recallWriteRef = useRef(Promise.resolve());
  const recordRandomRecall = useCallback(async (memo, mastered) => {
    if (!memo) return;
    const patch = recallPatch(memo.recallCount, mastered);
    // ローカル state の更新はフリップの折り返し（280ms・reroll の seed 交換と同時刻）
    // まで遅らせる。即時に更新すると allNotes → randomMemo が seed 交換より先に
    // 再計算され、カードがフリップ前に一瞬すり替わってから折り返しでもう一度
    // 替わる（二重スワップ）。更新自体は必要 — しないと allNotes 上は依然 due の
    // ままで、直後の reroll で同じ 1 枚が再選出されうる。
    if (recallApplyTimerRef.current) clearTimeout(recallApplyTimerRef.current);
    const localEntry = { at: patch.last_recalled_at, count: patch.recall_count };
    recallApplyTimerRef.current = setTimeout(() => {
      if (memo.synth) {
        // 派生ノートは DB 行が無いので端末ローカルに記録（lib/recallLocal.js）。
        updateLocalRecall(memo.id, localEntry);
      } else {
        setMemos((arr) => arr.map((m) => (m.id === memo.id
          ? { ...m, lastRecalledAt: patch.last_recalled_at, recallCount: patch.recall_count }
          : m)));
      }
    }, 280);
    if (memo.synth) return; // DB 書き込みは実メモのみ
    const write = recallWriteRef.current.then(async () => {
      // 失敗（列が無い＝supabase_recall_memory.sql 未適用・通信断など）は端末に残す。
      // 以前は { error } を見ておらず、再読み込みすると「覚えた」が消えて同じメモがまた出ていた（2026-10-01）。
      let failed = false;
      try {
        const { error } = await supabase
          .from('book_memos')
          .update(patch)
          .eq('id', memo.id);
        if (error) {
          failed = true;
          if (!isSchemaError(error)) console.warn('recall write failed:', error);
        }
      } catch (e) {
        failed = true;
        console.warn('recall write failed:', e);
      }
      if (failed) updateLocalRecall(memo.id, localEntry);
    });
    recallWriteRef.current = write;
    await write;
  }, [updateLocalRecall]);

  // 「元に戻す」: 押す前の想起の記録（最後に思い出した日・覚えた回数）に戻し、同じカードをもう一度出す。
  const undoRandomRecall = useCallback((memo, prev, prevSeed) => {
    if (!memo) return;
    if (recallApplyTimerRef.current) { clearTimeout(recallApplyTimerRef.current); recallApplyTimerRef.current = null; }
    // 端末ローカルの記録も押す前に戻す（派生ノート・DB に書けなかった実メモ）。
    updateLocalRecall(memo.id, prev.localEntry);
    if (!memo.synth) {
      setMemos((arr) => arr.map((m) => (m.id === memo.id
        ? { ...m, lastRecalledAt: prev.dbLastRecalledAt, recallCount: prev.dbRecallCount }
        : m)));
      recallWriteRef.current = recallWriteRef.current.then(async () => {
        // 直前の書き込みが失敗して端末に残した記録も、書き込みが終わってから戻す（順番が逆転しない）。
        updateLocalRecall(memo.id, prev.localEntry);
        try {
          await supabase
            .from('book_memos')
            .update({ last_recalled_at: prev.dbLastRecalledAt || null, recall_count: prev.dbRecallCount || 0 })
            .eq('id', memo.id);
        } catch { /* 列未適用・失敗は静かに無視 */ }
      });
    }
    setRandomSeed(prevSeed);
  }, [updateLocalRecall]);

  // 覚えた／まだ覚えていない: 記録して次の 1 枚へ。次に出る日をトーストで伝え、「元に戻す」で取り消せる。
  const answerRandomRecall = (memo, mastered) => {
    if (!memo || flipping) return;
    // 押す前の記録。DB の値（端末の記録を重ねる前）と端末の記録を別々に持ち、それぞれに戻す。
    const dbRow = memo.synth ? null : memos.find((m) => m.id === memo.id);
    const prev = {
      dbLastRecalledAt: dbRow ? dbRow.lastRecalledAt ?? null : null,
      dbRecallCount: dbRow ? dbRow.recallCount || 0 : 0,
      localEntry: localRecall[memo.id] || null,
    };
    const prevSeed = randomSeed;
    const patch = recallPatch(memo.recallCount, mastered);
    // この 1 枚で今日の分が終わるか（答えたあとに出すメモが残らない）。
    const after = allNotes.map((n) => (n.id === memo.id
      ? { ...n, lastRecalledAt: patch.last_recalled_at, recallCount: patch.recall_count }
      : n));
    const isLast = !pickRecallMemo(after) && !pickFallbackMemo(after);
    recordRandomRecall(memo, mastered);
    reroll();
    const days = dueGapDays(patch.recall_count);
    if (isLast) {
      if (recallDoneFocusTimerRef.current) clearTimeout(recallDoneFocusTimerRef.current);
      recallDoneFocusTimerRef.current = setTimeout(() => {
        try { recallDoneRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
      }, 650);
    }
    // 「元に戻す」つきの知らせは toast.undo にそろえる（中立の Undo2 の印・DESIGN §5 トースト・2026-09-29）。
    // 最後の 1 枚は、次に出る日を「ここまでです」のカードだけに書く（知らせのこのメモの日と、カードの
    // いちばん早い日が食い違って見えないように・2026-10-01）。
    if (recallToastRef.current) toast.dismiss(recallToastRef.current, { byUser: true });
    recallToastRef.current = toast.undo({
      message: isLast
        ? (mastered ? '覚えました' : '記録しました')
        : days <= 1 ? '明日また出します' : `${days} 日後にまた出します`,
      duration: 5000,
      destructive: false,
      // 「覚えました」は完了の知らせなので ✓ の印（↶ だと戻したように見える・DESIGN §5 トースト）。
      success: isLast && mastered,
      onUndo: () => undoRandomRecall(memo, prev, prevSeed),
    });
    return true;
  };

  const reroll = () => {
    haptic.light();
    if (allNotes.length <= 1) {
      setRandomSeed((s) => s + 1);
      return;
    }
    setFlipping(true);
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    if (flipEndTimerRef.current) clearTimeout(flipEndTimerRef.current);
    // Swap at the midpoint of the 0.6s flip animation
    flipTimerRef.current = setTimeout(() => {
      setRandomSeed((s) => s + 1);
    }, 280);
    // Clear the flip class after the animation completes（両タイマーとも ref 管理し
    // アンマウント時/連続 reroll 時に確実に破棄＝unmount 後 setState を防ぐ）。
    flipEndTimerRef.current = setTimeout(() => setFlipping(false), 620);
  };

  useEffect(() => () => {
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    if (flipEndTimerRef.current) clearTimeout(flipEndTimerRef.current);
    if (recallApplyTimerRef.current) clearTimeout(recallApplyTimerRef.current);
    if (recallDoneFocusTimerRef.current) clearTimeout(recallDoneFocusTimerRef.current);
  }, []);

  const toggleMonth = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSearching = search.trim() || tagFilter || kindFilter !== 'all';
  // 結果の側（一覧・0 件・思い出しカードとの切り替え）は一歩遅れの値で決める（入力欄の「クリア」などは今の値）。
  const showingResults = !!(deferredSearch.trim() || tagFilter || kindFilter !== 'all');
  // 結果の一覧は、一歩遅れの値が変わったときだけ作り直す（打つたびに全部のカードを描き直さない）。
  const searchResults = useMemo(() => {
    if (!showingResults) return null;
    const q = deferredSearch.trim();
    if (filteredSearch.length === 0) {
      // 見つからないときの次の一歩は「相談で聞く」だけ（相談は入力欄に入れるだけで送らない）。検索を消すのは
      // 右上の「クリア」1 か所（同じ操作を 2 か所に出さない・2026-09-29）。
      return (
        <EmptyState
          icon={<SearchIcon size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="このキーワードに関連するメモはまだありません"
          actions={onAskConsult && q
            ? [{ label: '相談で聞く', onClick: () => onAskConsult(`「${q}」について、読んだ本から何が言える？`), variant: 'secondary' }]
            : []}
        />
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0 }}>{filteredSearch.length} 件</p>
        {filteredSearch.map((m) => (
          <ReviewMemoCard
            key={m.id}
            memo={m}
            book={booksById.get(m.bookId)}
            onOpenBook={onOpenBook}
            onSwipeDelete={handleSwipeDelete}
            onLongPress={setMemoMenu}
            // 検索の結果にも、ほかのメモのカードと同じ「…」（長押しと同じメニュー・2026-09-30）。
            onOpenMenu={setMemoMenu}
            openOnTap
          />
        ))}
      </div>
    );
  }, [showingResults, deferredSearch, filteredSearch, booksById, onOpenBook, handleSwipeDelete, onAskConsult]);
  // 絞り込みのメニューは、検索欄に触れてから出す（開いた瞬間の画面を思い出しカードとメモだけにする）。
  const [searchActive, setSearchActive] = useState(() => !!freshPreset || !!resumedReview?.searchActive);
  const filtersOpen = !!(searchActive || isSearching);
  // 開いている間に新しい言葉が来たとき（と、開いたときに入れた言葉の記録）。
  useEffect(() => {
    if (!searchPreset?.nonce || searchPreset.nonce === appliedSearchNonce) return;
    appliedSearchNonce = searchPreset.nonce;
    setSearch(String(searchPreset.query || ''));
    setTagFilter('');
    setKindFilter('all');
    setSearchActive(true);
  }, [searchPreset?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    rememberReview(user?.id, { search, tagFilter, kindFilter, randomSeed, searchActive });
  }, [user?.id, search, tagFilter, kindFilter, randomSeed, searchActive]);

  if (loading) {
    return (
      <div style={wrap}>
        {/* 読み込み中は形だけ（DESIGN §5: Skeleton） */}
        <div aria-busy="true" aria-label="メモを読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <SkeletonBlock height={20} width="40%" radius="var(--radius)" />
          <SkeletonBlock height={180} radius="var(--radius)" />
          <SkeletonBlock height={120} radius="var(--radius)" />
        </div>
      </div>
    );
  }

  // 通信断などの取得失敗は「メモ0件」と区別する — 空状態を出すと全メモが
  // 消えたように見えて不安にさせる。再試行の導線を必ず添える。
  if (fetchFailed && allNotes.length === 0) {
    return (
      <div style={wrap}>
        <EmptyState
          icon={<StickyNote size={34} aria-hidden="true" />}
          title="メモを読み込めませんでした"
          description={(
            <>
              通信が不安定なようです。<br />
              メモは消えていませんので、ご安心ください。
            </>
          )}
          actions={[{ label: 'もう一度読み込む', onClick: () => fetchMemos() }]}
        />
      </div>
    );
  }

  if (allNotes.length === 0) {
    return (
      <div style={wrap}>
        <EmptyState
          icon={<StickyNote size={34} aria-hidden="true" />}
          title={<>{/* 句の途中で折り返さない */}<span style={{ display: 'inline-block' }}>メモを残すと、</span><span style={{ display: 'inline-block' }}>忘れた頃にここへ戻ってきます</span></>}
          actions={
            onAddNote && hasMemoableBooks
              ? [{ label: 'メモを追加', icon: <Plus size={18} aria-hidden="true" />, onClick: onAddNote, variant: 'secondary' }]
              // メモできる本がまだ無い（＝本が無い/全て読みたい積読）ときは行き止まりに
              // せず、本棚へ誘導する（そこで本を追加・読書中にできる）。
              : onGoToShelf
                ? [{ label: 'すべての本へ', icon: <BookOpen size={18} aria-hidden="true" />, onClick: onGoToShelf, variant: 'secondary' }]
                : []
          }
        />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div style={wrap}>
      {filterMenu && (
        <ContextMenu
          x={filterMenu.x}
          y={filterMenu.y}
          onClose={() => setFilterMenu(null)}
          items={filterMenu.kind === 'kind'
            ? [
              { label: 'すべての種類', icon: kindFilter === 'all' ? <Check size={16} aria-hidden="true" /> : <span aria-hidden="true" />, onClick: () => setKindFilter('all') },
              // 実際にある種類だけ（いま選んでいる種類は 0 件でも残す）。
              ...Object.entries(KIND_META)
                .filter(([k]) => (kindCounts[k] || 0) > 0 || kindFilter === k)
                .map(([k, meta]) => ({ label: meta.label, icon: kindFilter === k ? <Check size={16} aria-hidden="true" /> : <span aria-hidden="true" />, onClick: () => setKindFilter(k) })),
            ]
            : [
              { label: 'すべてのタグ', icon: !tagFilter ? <Check size={16} aria-hidden="true" /> : <span aria-hidden="true" />, onClick: () => setTagFilter('') },
              // メニューが画面に収まるよう、よく使うタグ 7 つまで（ほかのタグは検索欄に入れても探せる）。
              ...menuTags.map((t) => ({ label: `#${t}`, icon: tagFilter === t ? <Check size={16} aria-hidden="true" /> : <span aria-hidden="true" />, onClick: () => setTagFilter(t) })),
            ]}
        />
      )}
      {memoMenu && (
        <ContextMenu
          x={memoMenu.x}
          y={memoMenu.y}
          onClose={() => setMemoMenu(null)}
          items={[
            // 並びは本の詳細のメモの「…」とそろえる: 編集 → コピー → 行動に追加 → この一文をシェア → 本を開く → 削除（2026-09-30）。
            // 本に付いたふつうのメモは、ここから編集も開ける（その本のそのメモを編集で開く・2026-09-30）。
            ...(memoMenu.book && !memoMenu.memo?.synth && (memoMenu.memo?.kind || 'card') === 'card' && memoMenu.memo?.sourceType !== 'personal' && memoMenu.memo?.sourceType !== 'summary'
              ? [{ label: '編集', icon: <Pencil size={16} aria-hidden="true" />, onClick: () => onOpenBook?.(memoMenu.book, memoMenu.memo?.id, { edit: true }) }]
              : []),
            // 本の詳細のメモの「…」と同じく、コピー・この一文をシェアもここから（2026-09-30）。
            ...((memoMenu.memo?.text || '').trim()
              ? [{ label: 'コピー', icon: <Copy size={16} aria-hidden="true" />, onClick: () => copyMemo(memoMenu.memo) }]
              : []),
            // 🎯 読む→メモる→行動する、の変換点をどの一覧（タイムライン /
            // 検索結果）からでも 1 タップに。ランダム想起カード限定だった
            // handleMemoToAction を長押しメニューにも露出する。
            ...(memoMenu.book && onAddAction
              ? [{ label: '行動に追加', icon: <Target size={16} aria-hidden="true" />, onClick: () => handleMemoToAction(memoMenu.memo) }]
              : []),
            ...(memoMenu.book && !memoMenu.memo?.synth && (memoMenu.memo?.text || '').trim()
              ? [{ label: 'この一文をシェア', icon: <Share size={16} aria-hidden="true" />, onClick: () => { haptic.light(); setShareTarget({ book: memoMenu.book, memoId: memoMenu.memo.id }); } }]
              : []),
            // 思い出しカードの「…」だけ: 別の 1 枚へ（SPEC §4: 覚えた／もう一度 ＋ …）。
            ...(memoMenu.recall
              ? [{ label: '別のメモを見る', icon: <Shuffle size={16} aria-hidden="true" />, onClick: () => { if (!flipping) reroll(); } }]
              : []),
            ...(memoMenu.book
              ? [{ label: '本を開く', icon: <BookOpen size={16} aria-hidden="true" />, onClick: () => onOpenBook?.(memoMenu.book, memoMenu.memo?.id) }]
              : []),
            // 派生ノート（まとめ・収穫など）は DB の 1 行ではないので削除を出さない。
            ...(memoMenu.memo?.synth ? [] : [{
              label: '削除',
              icon: <Trash2 size={16} aria-hidden="true" />,
              destructive: true,
              // メニューからの削除は確認する（スワイプは「ジェスチャー＝意図」で確認なし・取り消しつき）
              onClick: async () => {
                const m = memoMenu.memo;
                const ok = await confirm({
                  title: 'このメモを削除しますか？',
                  message: m?.photoPath
                    ? '写真も削除されます。（取り消した場合、本文は戻りますが写真は戻りません）'
                    : '削除したあと、しばらくは「取り消す」で戻せます。',
                  confirmLabel: '削除する',
                  cancelLabel: 'キャンセル',
                  danger: true,
                });
                if (ok) handleSwipeDelete(m);
              },
            }]),
          ]}
        />
      )}
      {shareTarget && (
        <Suspense fallback={null}>
          <ShareSheet
            book={shareTarget.book}
            initialMemoId={shareTarget.memoId}
            from="memo"
            onClose={() => setShareTarget(null)}
          />
        </Suspense>
      )}

      {/* ⚠️ メモ取得だけ失敗し、本由来の派生ノート（まとめ/収穫等）だけで画面が
          成立してしまった場合の注記。全画面エラーは allNotes が完全に空の時だけ
          なので、ここが無いと「カードメモが全部消えた」ように見える。 */}
      {fetchFailed && memos.length === 0 && (
        <div
          role="alert"
          style={{
            padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius)',
            background: 'var(--fill)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
          }}
        >
          <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
            メモの読み込みに失敗しました（メモは消えていません）。
          </p>
          <button type="button" style={{ ...btnGhost, flexShrink: 0 }} onClick={() => fetchMemos()}>
            再読み込み
          </button>
        </div>
      )}

      {/* ⚠️ 動線再設計（2026-07-17 スクショ監査）:
          - 旧・最上段の「＋メモを追加」単独行（左が全部空白の孤立ボタン）は
            タイムラインのヘッダー行へ移設（メモ一覧の傍が意味的に正しい住処）。
          - 旧・種類別チップカードは撤去 — 検索セクションの種類ドロップダウンと
            機能が完全重複し、種類が1つしか無い初期ユーザーには「メモ 3」だけの
            壊れたカードに見えていた。件数は検索の絞り込みで足りる。
          - これで開いた瞬間の1画面が「今日の想起＝ユーザー自身の言葉」だけになる。 */}

      {/* ===== 1. 全メモ検索（一番上・SPEC §4）===== 検索中は結果をすぐ下に出し、思い出しカードと月ごとのメモは隠す。 */}
      <section aria-label="メモを検索">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* 虫めがねは文字に合わせた大きさ（em）・入力欄の左の余白も同じ em で空ける（文字を大きくしても重ならない・2026-10-04 ui-critic）。 */}
          <div style={{ position: 'relative', fontSize: uiInput.fontSize }}>
            <SearchIcon size="1.1em" aria-hidden="true" style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            {/* type="search" だとブラウザ既定の青い × が出る（トークン外の色）。消すのは下の「クリア」に任せる。 */}
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              maxLength={100}
              placeholder="メモを検索"
              aria-label="メモ横断検索: 本文・書名・著者・タグから探す"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchActive(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
              }}
              style={{ ...uiInput, paddingLeft: 'calc(var(--space-3) + 1.1em + var(--space-2))' }}
            />
          </div>
          {/* 絞り込みは検索欄に触れてから出す（開いた瞬間の画面を、思い出しカードとメモだけにする）。
              出し入れは高さを 200ms で広げる／畳む（一度に 52 押し下げて下の画面が跳ねていた・2026-09-29）。
              畳んでいる間は visibility: hidden で押せない・読み上げない（畳み終わってから隠す）。 */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: filtersOpen ? '1fr' : '0fr',
              visibility: filtersOpen ? 'visible' : 'hidden',
              transition: `grid-template-rows var(--duration-fast) var(--ease-out), visibility 0s linear ${filtersOpen ? '0s' : 'var(--duration-fast)'}`,
            }}
          >
            <div style={{ minHeight: 0, overflow: 'hidden' }}>
            {/* 文字が大きくて 1 行に入らないときは折り返す（「す…」まで縮めない・2026-10-04 ui-critic）。 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', rowGap: 0, alignItems: 'center', paddingTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }}>
              {/* 絞り込みは端末のプルダウンではなく、メモ一覧の「ページ順 ▾」と同じ文字のメニュー（押すと ContextMenu）。 */}
              <button
                type="button"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setFilterMenu({ kind: 'kind', x: r.left + 110, y: r.bottom + 4 }); }}
                aria-haspopup="menu"
                aria-label={`種類で絞り込む（いまは${kindFilter === 'all' ? 'すべての種類' : (KIND_META[kindFilter]?.label || '')}）`}
                // 文字の左端を検索欄の端（16）にそろえる（左右 4 の内側余白は、行の負の余白で打ち消す＝折り返しても左端がそろう）。
                style={filterMenuBtn}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kindFilter === 'all' ? 'すべての種類' : (KIND_META[kindFilter]?.label || 'すべての種類')}</span>
                <ChevronDown size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
              </button>
              {/* 本の状態での絞り込みは廃止（メモが付くのは読書中・読了の本だけで、選ぶ意味が薄い）。 */}
              {allTags.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setFilterMenu({ kind: 'tag', x: r.left + 110, y: r.bottom + 4 }); }}
                  aria-haspopup="menu"
                  aria-label={`タグで絞り込む（いまは${tagFilter ? `#${tagFilter}` : 'すべてのタグ'}）`}
                  style={filterMenuBtn}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tagFilter ? `#${tagFilter}` : 'すべてのタグ'}</span>
                  <ChevronDown size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                style={{ ...btnLink, flexShrink: 0, paddingRight: 0 }}
                onClick={() => {
                  setSearch('');
                  setTagFilter('');
                  setKindFilter('all');
                  setSearchActive(false);
                }}
              >
                {isSearching ? 'クリア' : '閉じる'}
              </button>
            </div>
            </div>
          </div>
        </div>
        {searchResults}
      </section>

      {!showingResults && (<>
      {/* ===== 2. 今日の振り返り (random) ===== */}
      {/* 思い出しカードに出せる自分の言葉が無い（AI まとめだけ）ときは、見出しごと出さない（空の見出しを残さない・2026-10-04）。 */}
      {(randomMemo || recallDone) && (
      <section>
        {/* 思い出しカード（SPEC §4: メモの一番上に小さく）。見出しは小さなラベルだけ。
            「別のメモを見る」はカードの「…」の中（覚えた／もう一度 ＋ …）。 */}
        <h2 style={sectionTitle}>思い出しカード</h2>
        {/* 説明のフレーミング文と「今は少なくても大丈夫」の空きプール文言は撤去 —
            実際のメモカードと同時に出て矛盾し、主役（ユーザー自身の言葉）より先に
            読ませる説明ノイズになっていた。ヘッダー＋「N日前のあなたのメモ」ラベルで
            意味は伝わる（1画面1メッセージ）。 */}
        {/* 「◯ヶ月前のあなたのメモ」はカード右上の「◯ヶ月前」と同じなので出さない（重複をなくす）。 */}
        {(randomMemo || recallDone) && (
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
            {/* 今日出すメモが残っていない（すべて次の間隔を待っている）: 最後の 1 枚を答えたら、同じフリップの
                折り返しでカードの代わりにこの 1 枚（空状態の形・カードと同じ枠）。次に出る日だけを添える（2026-10-01）。 */}
            {!randomMemo ? (extraMemo ? (
              // 「別のメモを見る」: 答えのボタンは出さない（今日の分はもう終わっている）。
              <>
                <ReviewMemoCard
                  memo={extraMemo}
                  book={booksById.get(extraMemo.bookId)}
                  onOpenBook={onOpenBook}
                  onSwipeDelete={handleSwipeDelete}
                  onLongPress={setMemoMenu}
                  onOpenMenu={setMemoMenu}
                  showRelative
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', margin: 'var(--space-1) 0 calc(-1 * var(--space-3))' }}>
                  <button type="button" onClick={() => { haptic.light(); setExtraSeed((s) => (s ?? 0) + 1); }} style={{ ...btnLink, paddingLeft: 0 }}>
                    別のメモを見る
                  </button>
                  {/* 今日の分は終わっていることと、次に出る日を残す（2026-10-01 ui-critic）。 */}
                  {recallNextLabel && (
                    <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', textAlign: 'right' }}>{recallNextLabel}</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div ref={recallDoneRef} tabIndex={-1} className="recall-done" style={{ ...cardBase, outline: 'none' }}>
                  <EmptyState
                    role={null}
                    titleAs="h3"
                    icon={<Check size={20} aria-hidden="true" />}
                    title={<><span style={{ display: 'inline-block' }}>今日の思い出しカードは、</span><span style={{ display: 'inline-block' }}>ここまでです</span></>}
                    description={recallNextLabel || undefined}
                  />
                </div>
                <button type="button" onClick={() => { haptic.light(); setExtraSeed(0); }} style={{ ...btnLink, paddingLeft: 0, margin: 'var(--space-1) 0 calc(-1 * var(--space-3))' }}>
                  別のメモを見る
                </button>
              </>
            )) : (<>
            <ReviewMemoCard
              memo={randomMemo}
              book={booksById.get(randomMemo.bookId)}
              onOpenBook={onOpenBook}
              onSwipeDelete={handleSwipeDelete}
              onLongPress={(payload) => setMemoMenu({ ...payload, recall: true })}
              onOpenMenu={(payload) => setMemoMenu({ ...payload, recall: true })}
              showRelative
            />
            {/* 🧠 間隔反復のフィードバック（当日メモは除く）— 想起カードの主アクション
                なので「行動にする」より先（上）に置く。ホームの想起カードと同じ並び順
                （覚えた/もう一度 → 行動にする）に統一し、面ごとの学び直しを無くす。
                5 分前に書いた一行に「覚えた?」と聞くのは不自然で、「覚えた」を押すと
                last_recalled_at が書かれて本来の初回想起がむしろ遅れる。当日メモには
                正直な予告文だけを出す。synth（まとめ/収穫/行動の振り返り）にもボタンを
                出す — 出さないと synth は永遠に due のままで想起プールを占拠する
                （記録は端末ローカル。recordRandomRecall 参照）。 */}
            {recallFraming(randomMemo.createdAt) && (
              // 2 つは同じ幅で 1 行に。文字を大きくして 1 行に収まらないときは、2 行に積む（はみ出して重なっていた・2026-10-04）。
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <button
                  type="button"
                  disabled={flipping}
                  onClick={() => {
                    if (!answerRandomRecall(randomMemo, true)) return;
                    // ⭐️ 初めて「本物の想起に『覚えた』と応えた」直後 = 核心価値を
                    // 体感した感情のピークで、一度だけレビューを依頼する。実メモのみ
                    // （synth は自分の一行ではないため対象外）。iOS は Apple の仕組みだけ（審査 5.6.1）・
                    // Web は実ストア URL 未設定時は no-op（reviewRequest.js 参照）。「◯日後にまた出します」の取り消しの間は出さない。
                    if (!randomMemo.synth && shouldAskForReview()) {
                      markReviewAsked();
                      setTimeout(() => askForReview(toast), 5600);
                    }
                  }}
                  style={{ ...(flipping ? uiBtnGhostOff : uiBtnGhost), width: 'auto', flex: '1 1 0', minWidth: 'max-content', padding: '0 var(--space-3)', whiteSpace: 'nowrap' }}
                >
                  <Check size="1em" strokeWidth={2.5} aria-hidden="true" style={{ flexShrink: 0 }} />覚えた
                </button>
                {/* 「もう一度」は「もう一度見る」と読めてしまうので、何が起きるか（明日また出る）が分かる名前に（2026-09-29）。 */}
                <button
                  type="button"
                  disabled={flipping}
                  onClick={() => { answerRandomRecall(randomMemo, false); }}
                  // 1 行に収める（2 つのボタンを同じ高さに・語の途中で折り返さない）。
                  style={{ ...(flipping ? uiBtnGhostOff : uiBtnGhost), width: 'auto', flex: '1 1 0', minWidth: 'max-content', padding: '0 var(--space-3)', whiteSpace: 'nowrap' }}
                >
                  まだ覚えていない
                </button>
              </div>
            )}
            {/* 🔄→🎯 この気づきを行動にするは、カード右上の「…」（と長押し）のメニューへ。追加できたら一言だけ残す。 */}
            {actionAddedId === randomMemo.id && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, marginTop: 'var(--space-2)', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)' }}>
                <Check size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
                行動に追加しました
              </div>
            )}
            </>)}
          </div>
        )}
        {/* 🔔 aha 直後の通知の案内（初回・1 枚戻ってきた時だけ・未許可時のみ）。行動に追加の直後・初日クイックスタートと
            同じ部品・同じ文（思い出しの通知と行動の期限の両方を言う・DESIGN §5「閉じられる案内カード」・2026-10-04）。
            以前はここだけ別の文（「週に1回ほど…」・期限の通知を言わない）と別の形（主ボタン＋「今はしない」）だった。 */}
        {randomMemo && recallFraming(randomMemo.createdAt) && (
          <NotifyOptInCard where="recall" style={{ marginTop: 'var(--space-3)' }} />
        )}
        {/* 名言はこのタブから撤去 — 想起の主役はユーザー自身の言葉で、毎回の格言は
            それを薄める（名言はスプラッシュ/オンボに残る）。 */}
      </section>
      )}

      {/* ===== 3. タイムライン ===== */}
      {/* メモが 1 件だけのときは思い出しカードと同じメモになるので、月ごとの一覧は出さない
          （「メモを追加」の行は 1 件から出す）。 */}
      {allNotes.length >= 1 && (showMonthly || (onAddNote && hasMemoableBooks)) && (
      <section>
        {/* 「メモを追加」（高さ 44）と並ぶので、行の下の余白は付けない（見出しの文字から一覧まで約 8〜12）。
            行の高さ 44 の上側の空き（約 12）ぶん引き上げ、思い出しカードから見出しの文字までを約 24 にそろえる。 */}
        {/* 見出しが無い（メモ 1 件で「メモを追加」だけ）ときは引き上げない＝思い出しカードのボタンに寄って見えないように。 */}
        {/* 文字を大きくして 1 行に収まらないときは「メモを追加」を次の行へ（語の途中で割らない・2026-10-04）。 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-3)', justifyContent: showMonthly ? 'space-between' : 'flex-start', alignItems: 'center', marginTop: showMonthly ? 'calc(-1 * var(--space-3))' : 0 }}>
          {showMonthly && <h2 style={{ ...sectionTitle, margin: 0, whiteSpace: 'nowrap' }}>月ごとのメモ</h2>}
          {/* ＋メモを追加 — 旧・最上段の孤立ボタンをここへ（メモ一覧の傍が住処。
              付け先の本＝読書中/読了の本がある時だけ）。 */}
          {onAddNote && hasMemoableBooks && (
            <button
              type="button"
              onClick={onAddNote}
              style={{ ...btnLink, gap: 'var(--space-1)', whiteSpace: 'nowrap', ...(showMonthly ? { paddingRight: 0 } : { paddingLeft: 0 }) }}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              メモを追加
            </button>
          )}
        </div>
        {/* 月は素の開閉行（カードの中にカードを入れない＝左端をメモカードとそろえる）。 */}
        {showMonthly && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {memosByMonth.map(([key, group]) => {
            const open = expanded.has(key);
            return (
              <div key={key} style={{ borderTop: '1px solid var(--separator)' }}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggleMonth(key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    width: '100%',
                    minHeight: 44,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', fontWeight: 600 }}>
                    {monthLabel(key)}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
                    {group.length} 件
                    {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                  </span>
                </button>
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', margin: 'var(--space-1) 0 var(--space-4)' }}>
                    {group.map((m) => (
                      <ReviewMemoCard
                        key={m.id}
                        memo={m}
                        book={booksById.get(m.bookId)}
                        onOpenBook={onOpenBook}
                        onSwipeDelete={handleSwipeDelete}
                        onLongPress={(payload) => setMemoMenu(payload)}
                        // ほかのメモのカードと同じ「…」と、押して編集（2026-09-30）。
                        onOpenMenu={(payload) => setMemoMenu(payload)}
                        tapToEdit
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </section>
      )}
      </>)}
    </div>
    </PullToRefresh>
  );
}
