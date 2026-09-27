// 💬 相談（旧称「マイ読書脳」・コード識別子は MyBookBrain のまま）— 自分のメモを根拠に答える AI。
//
// SPEC §3: 画面の中は会話だけ。上部は 1 行（何を根拠に答えるか＋履歴の時計＋「…」）。
//   会話（既定）/ 過去の相談（時計）/ 学びを書く・根拠にできる情報（「…」）
// 答えは「結論 → 明日からできる一歩（行動に追加）→ 根拠を見る（畳む）」の順に組み替えて見せる。
//
// chat_messages live in Supabase; book_memos with source_type='personal'
// are written for personal learnings and surface in the Review tab too.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { markActivation } from '../lib/activation';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import { streamMyBookBrain, prewarmKnowledge, invalidateKnowledgeCache, EVIDENCE_PREFIX } from '../lib/ai';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost, btnText as uiBtnText, input as uiInput } from '../styles/ui';
import { track, EVENTS } from '../lib/analytics';
import { LIMITS } from '../lib/limits';
import Spinner from './Spinner';
import KnowledgeManager from './KnowledgeManager';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import { X, MessageCircle, History, BookOpenCheck, Target, Check, RotateCw, MoreHorizontal, ChevronLeft, ChevronDown, ChevronRight, PencilLine, ArrowUp, Square, Plus, Minus, Sprout } from 'lucide-react';
import ContextMenu from './ContextMenu';
import { usePaywall } from '../state/PaywallContext';
import { AI_MONTHLY_BUDGET_JPY, fetchMonthCostJpy, nextResetLabelJa } from '../lib/freeTrial';

// ホーム・本の詳細・テーマまとめから渡される「最初の一手」（preset）は、App 側では
// 消えずに残る。相談タブを開き直すと MyBookBrain が作り直されるので、使い終わった
// preset の nonce をここ（画面の作り直しでも消えない場所）に覚えて、二度と実行しない。
// （覚えておかないと、開き直すたびに同じ質問が送られて AI の回数を消費していた）
const consumedPresets = new Set();
const consumePreset = (kind, nonce) => {
  if (nonce == null) return false;
  const key = `${kind}:${nonce}`;
  if (consumedPresets.has(key)) return false;
  consumedPresets.add(key);
  return true;
};
import BottomSheet from './BottomSheet';

// AI tab の .ai-page-body (flex 1, overflow hidden) の中にぴったり
// 収める flex column。chat 時は内側 .chat-scroll + .ai-input-area で
// LINE 風レイアウト、それ以外 (learning/history/knowledge) は普通の
// 縦スクロールフォーム / リスト。padding は各 view 内側で管理する。
const wrap = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' };
// chat 以外の view 共通: ヘッダ/pill 下にスクロール可能な領域を提供。
const viewScroll = { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'var(--space-2) var(--space-4) var(--space-6)' };
// ── 相談画面の部品（DESIGN.md のトークンのみ） ──
const topRow = { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 52, padding: '0 var(--space-2) 0 var(--space-4)' };
const iconBtn = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 999, color: 'var(--text-2)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0 };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const headingStyle = { fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 };
// 相談例＝チップ（--fill 面・枠なし。入力欄と見分けがつくように。ホームと同じ）。
const chipStyle = { display: 'block', width: '100%', minHeight: 44, padding: 'var(--space-3)', textAlign: 'left', background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 };
// 答え＝読むカード（全幅）。ユーザーの相談は右寄せの --fill 吹き出し。
const answerCard = { ...cardStyle, wordBreak: 'break-word' };
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)' };
const rowBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
const summaryStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', minHeight: 44, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', listStyle: 'none' };
const subLabel = { fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-1)' };
// 根拠の本文（参照したメモ・解釈）も答えの一部＝読む文章（明朝 18・行間 1.6・DESIGN §2/§7）。
const subText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', color: 'var(--text)', lineHeight: 1.6 };
const refBtn = { width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44, padding: 'var(--space-2) 0', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--accent)', lineHeight: 1.5 };
// 学びを書くの入力欄は ui.js の input（高さ 48）をそのまま使う。
const inp = uiInput;
// 学びの本文＝読む文章（明朝 18・行間 1.6）。display:block で下の余白のずれ（inline のベースライン分）を消す。
const ta = { ...uiInput, display: 'block', resize: 'none', minHeight: 160, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6 };
// 行の中の副ボタン（DESIGN §5 btnRow）。
const btnGhost = { ...uiBtnGhost, width: 'auto', minHeight: 44, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sub)', flexShrink: 0 };

const QUESTION_EXAMPLES = [
  '営業で結果を出すには？',
  'チームをまとめるコツは？',
  '自己肯定感を高めるには？',
  '迷った時の判断基準は？',
  '明日のための 1 つの行動は？',
];

const CATEGORIES = ['会話', '経験', '観察', '気づき', 'その他'];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function transformMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content || '',
    refs: Array.isArray(row.refs) ? row.refs : [],
    createdAt: row.created_at,
  };
}

// ============================================================================
// Personal Learning Inline Form
// ============================================================================
// 旧: position: fixed のボトムシート (z-index 700 / backdrop blur) で表示
// していたが、iOS Safari で上端が見切れる + 下に元画面が透ける問題が
// あった。タブ画面なのでモーダルにする必然性も薄く、インライン展開に
// 変更。
function LearningInline({ onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  // ＋ 分類・タグ（最初は閉じる＝本文と保存だけを見せる。QuickMemoSheet の「＋ 詳しく」と同じ）。
  const [moreOpen, setMoreOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [busy, setBusy] = useState(false);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const save = async () => {
    if (!text.trim()) {
      toast.error('学んだ内容を入力してください。');
      return;
    }
    if (!user || !isSupabaseConfigured) {
      toast.error('ログインが必要です。');
      return;
    }
    setBusy(true);
    try {
      const tagsWithCategory = [`@${category}`, ...tags];
      const { error } = await supabase.from('book_memos').insert([
        {
          user_id: user.id,
          book_id: null,
          source_type: 'personal',
          page_number: null,
          text: text.trim(),
          tags: tagsWithCategory,
          photo_path: null,
        },
      ]);
      if (error) throw error;
      invalidateKnowledgeCache(); // 直後の相談でこの学びを使えるように
      toast.success('学びを記録しました。');
      onSaved?.();
    } catch (e) {
      toast.error(toMessage(e, '保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  // 上の「‹ 相談」と題名「学びを書く」は親の上部の行が出す（ここでは戻るを重ねない）。
  const label = { fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', display: 'block', margin: '0 0 var(--space-2)' };
  const chip = (on) => ({
    minHeight: 44, padding: '0 var(--space-3)', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    background: on ? 'var(--accent-soft)' : 'var(--fill)', color: on ? 'var(--accent)' : 'var(--text)',
    fontSize: 'var(--text-sub)', fontWeight: on ? 600 : 400,
  });
  const canSave = !busy && text.trim().length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <label htmlFor="learning-text" style={label}>学んだこと</label>
        <textarea
          id="learning-text"
          data-font-lg=""
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
          }}
          placeholder="例：先輩との会話で「相手の関心軸を聞く」が刺さった"
          style={ta}
          maxLength={LIMITS.memoText}
        />
      </div>

      {/* ＋ 分類・タグ — 閉じていても分類は既定（会話）で保存される。 */}
      <div>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-controls="learning-more"
          style={{ ...uiBtnText, fontSize: 'var(--text-sub)', padding: 'var(--space-2) 0', gap: 'var(--space-1)', color: 'var(--text-2)' }}
        >
          {moreOpen ? <Minus size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          分類・タグ
          {!moreOpen && (
            <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>
              （{[category, ...tags].join('・')}）
            </span>
          )}
        </button>
        {moreOpen && (
          <div id="learning-more" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', margin: 'var(--space-2) 0 var(--space-3)' }}>
            <div>
              {/* 見出しは「学び」— 選択肢の「気づき」と意味が重ならないように。保存値（@会話 など）は不変。 */}
              <span style={label}>どこで得た学びか</span>
              <div role="radiogroup" aria-label="どこで得た学びか" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} style={chip(category === c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="learning-tag" style={label}>タグ（任意）</label>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  {tags.map((t, i) => (
                    <span key={`${t}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 32, padding: '0 0 0 var(--space-3)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-sub)' }}>
                      {t}
                      <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} aria-label={`「${t}」を削除`} style={{ width: 44, height: 44, margin: 'calc(-1 * var(--space-2)) 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}>
                        <X size={16} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  id="learning-tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="タグを追加"
                  style={{ ...inp, flex: 1, minWidth: 0, width: 'auto' }}
                  maxLength={LIMITS.tag}
                />
                <button type="button" onClick={addTag} style={{ ...btnGhost, minHeight: 48 }}>追加</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        style={{ ...uiBtnPrimary, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'default' }}
      >
        {busy ? '保存中…' : '保存'}
      </button>
    </div>
  );
}

// ============================================================================
// Main MyBookBrain component
// ============================================================================
export default function MyBookBrain({ onOpenBook, books = [], onAddAction, onBooksMutated, onAddActionPickBook, onGoBookshelf, onQuickstart, askPreset, scopePreset }) {
  const { user } = useAuth();
  // ⚡ タブを開いた瞬間に知識スキャン（gatherKnowledge）を裏で開始 — 最初の質問時には
  // キャッシュ済みで、RAG 構築の待ち時間（数百ms〜数秒）が消える。
  useEffect(() => { prewarmKnowledge(user?.id); }, [user?.id]);
  const toast = useToast();
  const confirm = useConfirm();
  // 🎁 お試し中（未課金・登録直後）: 残り回数の表示と、使い切ったら有料プランの画面へ。
  const { freeMode, freeRemaining, refreshFree, openPaywall } = usePaywall();
  // 💴 今月の AI の利用（円）。上限の 7 割を超えたら、上部に一言だけ出す（止めるのはサーバー）。
  const [monthCost, setMonthCost] = useState(null);
  const refreshMonthCost = useCallback(async () => {
    if (!user?.id || freeMode) return;
    setMonthCost(await fetchMonthCostJpy(user.id));
  }, [user?.id, freeMode]);
  useEffect(() => { refreshMonthCost(); }, [refreshMonthCost]);
  const [monthLimitHit, setMonthLimitHit] = useState(false); // この月の上限に達した（サーバーの 429）
  const nearMonthLimit = !freeMode && !monthLimitHit && monthCost != null && monthCost >= AI_MONTHLY_BUDGET_JPY * 0.7;
  const [view, setView] = useState('chat'); // 'chat' | 'learning' | 'history' | 'knowledge'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  // 🎯 相談相手（2026-09-26）: [] = すべての本（＋学びログ）/ [id] = その 1 冊だけ /
  //   [id, id, …] = 選んだ数冊だけ。質問ごとに streamMyBookBrain へ bookIds で渡す。
  const [scopeIds, setScopeIds] = useState([]);
  const [scopeSheetOpen, setScopeSheetOpen] = useState(false);
  // 本詳細の「この本に相談する」から来たら、相談相手をその本に絞って質問画面へ。
  useEffect(() => {
    if (!scopePreset?.bookIds || !consumePreset('scope', scopePreset.nonce)) return;
    setScopeIds(scopePreset.bookIds);
    setView('chat');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopePreset?.nonce]);
  const [busy, setBusy] = useState(false);
  // 🧠→🎯 回答の行動を、紐づく本の行動リストへ追加（成功時にトースト）。
  const handleAnswerToAction = useCallback(async (bookId, text) => {
    if (!onAddAction || !bookId || !text) return false;
    // 相談の「明日からできる…」なので期限は明日を既定にする（期限なしだと一覧の最後に沈む）。
    // 「〜してみてください」の呼びかけは、行動リストの言い切りの形に直す。
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const plain = String(text).trim()
      .replace(/してみてください[。！!]?$/, 'してみる')
      .replace(/てみてください[。！!]?$/, 'てみる')
      .replace(/でみてください[。！!]?$/, 'でみる')
      .replace(/してください[。！!]?$/, 'する')
      .replace(/しましょう[。！!]?$/, 'する');
    const ok = await onAddAction(bookId, { text: plain, sourceMemoId: null, sourcePage: null, deadline: tomorrow });
    if (ok) toast.success('行動に追加しました（期限は明日）');
    return ok;
  }, [onAddAction, toast]);
  // 段階的ステータス表示: 'search' = 過去のメモを取得中, 'generate' = Claude が回答生成中,
  // null = 未送信 or ストリーミング中で本文が出始めた。
  const [stage, setStage] = useState(null);
  // 「✅ 解決した」をタップした時刻 (ISO 文字列)。chat view ではこの時刻
  // 以降のメッセージのみ表示する。history view は全件表示。localStorage に
  // 永続化して mount/unmount を跨いでも保持。
  const [clearedAt, setClearedAt] = useState(() => {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem('brain-cleared-at') || null;
    } catch { return null; }
  });
  // 「解決しましたか？」プロンプトを今のターンで dismiss したか
  // (= 「💬 続けて質問する」を押したか)。dismiss されたら次の AI 回答までは
  // プロンプトを再表示しない。
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  // learningOpen state は廃止 — view === 'learning' で表現する。
  const [memoStats, setMemoStats] = useState({ cards: 0, summaries: 0, personal: 0 });
  const [statsTick, setStatsTick] = useState(0);
  const messagesEndRef = useRef(null);
  // ストリーミング中の AbortController。送信ごとに作り直し、「中止」ボタンで
  // abort() する。abort 後は streamMyBookBrain が途中までの内容で正常終了する
  // ので、その時点の本文をそのまま確定 (DB 保存) する。
  const abortRef = useRef(null);
  // 「中止」を押した瞬間に true。trailing なエラートーストを抑止し、
  // ボタン表示 (中止中…) の即時フィードバックに使う。
  const [aborting, setAborting] = useState(false);
  // chat-scroll を直接掴んで scrollHeight ベースのオートスクロールを使う
  // (messagesEndRef.scrollIntoView だと document も巻き込んで動くため)。
  const chatScrollRef = useRef(null);
  // Auto-grow textarea: 60px min, 200px max, scrolls past 200.
  const inputRef = useRef(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // 空のときは 1 行（44）。書くほど伸び、200 を超えたらスクロール。
    el.style.height = 'auto';
    el.style.height = Math.min(Math.max(el.scrollHeight + 2, 44), 200) + 'px';
  }, [input]);

  const historyLatestRef = useRef(null);
  const fetchHistory = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setHistoryLoaded(true);
      return;
    }
    // 新しい順に最大 300 件（過去の相談の一覧に十分。全件だと使うほど重くなる）。
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300);
    // 読み込み中に送られた質問・回答（まだ履歴に無い行）は消さずに後ろへ残す。
    // 以前は履歴で丸ごと上書きしていたため、開いた直後に送ると質問も答えも消えていた。
    const hist = error ? [] : (data || []).reverse().map(transformMessage);
    if (error) console.warn('chat history fetch error:', error);
    historyLatestRef.current = hist.length > 0 ? hist[hist.length - 1].createdAt : null;
    setMessages((prev) => {
      const ids = new Set(hist.map((m) => m.id));
      return [...hist, ...prev.filter((m) => !ids.has(m.id))];
    });
    setHistoryLoaded(true);
  }, [user]);

  // Load history once on user change.
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // アンマウント時に進行中のストリームを中止する（ThemeReport と同じ防御）。
  // AI サブタブ（選書/レバレッジメモ）や下部ナビへ切り替えると本コンポーネントは
  // unmount されるが、これが無いと /api/claude ストリームが走り続けて月次 AI
  // コール枠を空費し、完了時に unmount 済みへ setState してしまう。
  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* ignore */ } }, []);

  // マイ読書脳を開くたびに、💬 質問 は「新しい会話」から始める。
  // 過去のやりとりは 📜 履歴 にすべて残るので失われない。「開いた瞬間に前回の
  // 会話がそのまま出てきて違和感」を解消する。
  // クロックずれ対策で、クライアント時刻ではなく「読み込んだ最新メッセージの
  // 作成時刻(サーバ時刻)」を境界にする → 以降に送る質問(サーバ now() で必ず
  // 後)は確実に chat に表示される。
  const freshOnMountRef = useRef(false);
  useEffect(() => {
    if (freshOnMountRef.current || !historyLoaded) return;
    freshOnMountRef.current = true;
    // 境界は「読み込んだ履歴の最新（サーバ時刻）」。読み込み中に送った質問は境界より
    // 後なので表示される。履歴が空なら隠すものは無い（端末の時計は使わない＝時計が
    // 進んでいる端末で初回の相談が隠れる不具合の防止）。
    const cut = historyLatestRef.current || '1970-01-01T00:00:00.000Z';
    setClearedAt(cut);
    try { localStorage.setItem('brain-cleared-at', cut); } catch { /* ignore */ }
  }, [historyLoaded, messages]);

  // Knowledge counts for the header (cards / summaries / personal)。
  // summaries は books の 7 フィールド (leverage_memo + invest_purpose +
  // current_challenge + hypothesis + ai_summary + roi_summary + ai_strategy)
  // を「いずれかが入っている本の数」ではなく「埋まっているフィールドの合計
  // 件数」で数える。AI が参照する knowledge の厚みを正しく示すため。
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return undefined;
    let cancelled = false;
    (async () => {
      const [cardsRes, personalRes, booksFieldsRes] = await Promise.all([
        supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .neq('source_type', 'personal'),
        supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('source_type', 'personal'),
        supabase
          .from('books')
          .select('leverage_memo, invest_purpose, current_challenge, hypothesis, ai_summary, roi_summary, ai_strategy')
          .eq('user_id', user.id),
      ]);
      if (cancelled) return;
      // 埋まっている (非 null + 空文字でない) フィールドだけ数える
      const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;
      const summariesCount = (booksFieldsRes.data || []).reduce((sum, b) => {
        let n = 0;
        if (isFilled(b.leverage_memo)) n += 1;
        if (isFilled(b.invest_purpose)) n += 1;
        if (isFilled(b.current_challenge)) n += 1;
        if (isFilled(b.hypothesis)) n += 1;
        if (isFilled(b.ai_summary)) n += 1;
        if (isFilled(b.roi_summary)) n += 1;
        if (isFilled(b.ai_strategy)) n += 1;
        return sum + n;
      }, 0);
      setMemoStats({
        cards: cardsRes.count || 0,
        personal: personalRes.count || 0,
        summaries: summariesCount,
      });
    })();
    return () => {
      cancelled = true;
    };
  // view が learning から戻った時に統計を再フェッチしたい → view を deps に
  }, [user, view, messages.length, statsTick]);

  // Strict auto-scroll: only when a true append happens *from a non-zero
  // baseline*. The `prev > 0` guard is the second line of defence — even
  // if React schedules an unexpected effect run during initial hydration,
  // we will not scroll the page. Combined with historyHydratedRef this
  // makes the chat window feel inert on tab open and never yank the
  // viewport down to the latest message.
  // 答えが出来上がったら、答えの先頭を会話欄の上端へ（結論と「明日からできる一歩」を最初に見せる）。
  const prevBusyRef = useRef(false);
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (!wasBusy || busy || view !== 'chat') return;
    setTimeout(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      const answers = el.querySelectorAll('[aria-label="相談への答え"]');
      const last = answers[answers.length - 1];
      if (!last) return;
      // 自分の相談の最後の行が少し見える位置（何への答えかが分かるように）。
      const top = last.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 48;
      el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 60);
  }, [busy, view]);
  const prevMsgCountRef = useRef(0);
  const historyHydratedRef = useRef(false);
  useEffect(() => {
    // Initial history load (whether 0 or N rows): just snap the counter
    // and don't scroll. We mark hydrated only AFTER the history fetch
    // resolved — otherwise we'd accept "messages came in but historyLoaded
    // was already true" as hydration too.
    if (!historyHydratedRef.current && historyLoaded) {
      historyHydratedRef.current = true;
      prevMsgCountRef.current = messages.length;
      return;
    }
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (view !== 'chat') return;
    // Only scroll if (a) we have a non-zero baseline and (b) something
    // was appended. Either condition failing skips the scroll entirely.
    if (prev <= 0) return;
    if (messages.length <= prev) return;
    // chat-scroll の scrollHeight ベースで最下部へ。scrollIntoView だと
    // document scroll も巻き込んで AI タブ全体が上下する不具合があった。
    setTimeout(() => {
      const el = chatScrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 30);
  }, [messages, view, historyLoaded]);

  // 💡 おすすめの質問 — ユーザー自身のデータ（タグ・直近の本）から質問テンプレを
  // 組み立てる（AI 呼び出し無し・即時）。「何を聞けばいいか分からない」という
  // 最初の摩擦を消し、メモ資産→質問の接続を作る。会話が空のときだけ表示。
  const suggestedQuestions = useMemo(() => {
    const qs = [];
    const tagCount = new Map();
    (books || []).forEach((b) => (Array.isArray(b.tags) ? b.tags : []).forEach((t) => {
      const k = String(t || '').trim();
      if (k) tagCount.set(k, (tagCount.get(k) || 0) + 1);
    }));
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
    topTags.forEach((t) => qs.push(`「${t}」について、私のメモから要点を3つにまとめて`));
    const recent = (books || []).find((b) => b.status === 'reading' || b.status === 'done');
    if (recent?.title) qs.push(`『${recent.title}』の学びで、明日から使えるものは？`);
    qs.push('最近のメモから、今週やるべき一歩を1つ提案して');
    return qs.slice(0, 3);
  }, [books]);

  const ask = async (questionText, opts = {}) => {
    if (!user) {
      toast.error('ログインが必要です。');
      return;
    }
    if (!isSupabaseConfigured) {
      toast.error('Supabase 未接続です。');
      return;
    }
    const q = (questionText ?? input).trim();
    if (!q || busy) return;
    // お試しを使い切っていたら、送らずに有料プランの画面を開く（入力は残す）。
    if (freeMode && freeRemaining <= 0) { openPaywall('free_used'); return; }
    const askBookIds = Array.isArray(opts.bookIds) ? opts.bookIds : scopeIds;
    const askScopeLabel = scopeLabelFor(askBookIds, books);

    setBusy(true);
    setAborting(false);
    setInput('');

    // 送信ごとに新しい AbortController。「中止」ボタンが abort() する。
    const controller = new AbortController();
    abortRef.current = controller;

    // Optimistic insert: show the user's message immediately.
    // ただし再生成（regenerate）は既存の質問を answer し直すだけなので、
    // user 行を再 INSERT しない（skipUserInsert）。しないと押すたびに同じ質問が
    // chat_messages に重複保存され、履歴と「会話 N 件」が水増しされる。
    if (!opts.skipUserInsert) {
      let userRow = null;
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .insert([{ user_id: user.id, role: 'user', content: q }])
          .select()
          .single();
        if (error) throw error;
        userRow = { ...transformMessage(data), scopeLabel: askScopeLabel };
        setMessages((arr) => [...arr, userRow]);
      } catch (e) {
        setBusy(false);
        toast.error(toMessage(e, 'メッセージの保存に失敗しました。'));
        return;
      }
    }

    // ★ 送信後すぐに assistant 吹き出しを optimistically 追加。空文字 +
    //   streaming:true で skeleton/cursor を出し、TTFT を体感的に短縮する。
    const streamingId = `streaming-${Date.now()}`;
    setMessages((arr) => [
      ...arr,
      {
        id: streamingId,
        role: 'assistant',
        content: '',
        refs: [],
        createdAt: new Date().toISOString(),
        streaming: true,
      },
    ]);
    setStage('search');

    // ストリーミングで届いた最新の可視テキスト。abort 時に refs パースが
    // 走らなくても、ここに溜めた本文をそのまま確定できるよう保持する。
    let lastVisible = '';
    try {
      const { body, refs, memoCount, memoTotal, cardCount, summaryCount, personalCount, evidence } = await streamMyBookBrain({
        userId: user.id,
        question: q,
        bookIds: askBookIds,
        signal: controller.signal,
        onStage: (s) => setStage(s),
        onChunk: (visibleText) => {
          // 最初の delta が来た瞬間に stage を消して本文表示に切り替える。
          setStage(null);
          lastVisible = visibleText;
          setMessages((arr) => arr.map((m) =>
            m.id === streamingId
              ? { ...m, content: visibleText, streaming: true }
              : m
          ));
        },
      });
      // abort 時は streamMyBookBrain が途中までの body で正常 resolve する。
      // body が空 (= 1 文字も生成される前に中止) の場合は lastVisible で補い、
      // それも空なら中止メッセージを残す。
      const wasAborted = controller.signal.aborted;
      const finalBody = (body && body.trim())
        ? body
        : (lastVisible && lastVisible.trim())
          ? lastVisible
          : (wasAborted ? '（回答を中止しました）' : body);
      const breakdown = `カード ${cardCount || 0} / まとめ ${summaryCount || 0} / 学び ${personalCount || 0}`;
      const base = (!wasAborted && memoTotal > memoCount && memoCount > 0)
        ? `${finalBody}\n\n（参照: ${memoCount}/${memoTotal} 件、内訳: ${breakdown}）`
        : finalBody;
      // 中止した場合は末尾に控えめな注記を付ける (refs は付けない)。
      const assistantContent = wasAborted ? `${base}\n\n— ここで中止しました` : base;
      const persistRefs = wasAborted ? [] : (evidence ? [`${EVIDENCE_PREFIX}${evidence}`, ...(refs || [])] : refs);
      // 保存（履歴への insert）は「回答の表示」と切り離す。回答生成は成功して
      // いるのに保存だけ失敗した場合、画面の回答をエラー文言で消さない。
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .insert([{ user_id: user.id, role: 'assistant', content: assistantContent, refs: persistRefs }])
          .select()
          .single();
        if (error) throw error;
        // 楽観的な streaming 行を、永続化された row で差し替える。
        setMessages((arr) => arr.map((m) => (m.id === streamingId ? transformMessage(data) : m)));
      } catch (saveErr) {
        // 表示は確定させたまま（streaming フラグだけ落とす）、保存失敗を控えめに知らせる。
        setMessages((arr) => arr.map((m) =>
          m.id === streamingId
            ? { ...m, content: assistantContent, refs: persistRefs, streaming: false }
            : m
        ));
        console.warn('[brain] answer insert failed:', saveErr?.message || saveErr);
        toast.error('回答は表示できましたが、履歴への保存に失敗しました。');
      }
      // AI 応答を正常に得て確定できた時のみ計測 (中止/中断パスは除外、PII なし)。
      if (!wasAborted) {
        track(EVENTS.AI_USED, { feature: 'brain' });
        // 🌱 初週の aha「自分のメモから答えが返ってきた」を体験した＝活性化ステップ完了。
        // メモ 0 件の案内文（AI を呼ばない空応答）は体験に数えない。
        if (memoCount > 0) markActivation('consult');
      }
      // 新しい AI 回答が来たら resolution prompt を再表示できるよう dismiss を解除
      setPromptDismissed(false);
    } catch (e) {
      // abort はエラーではない (streamMyBookBrain は正常 resolve するため通常
      // ここには来ないが、念のため abort 由来の例外はトーストしない)。
      // 有料プランの画面を開いたとき（e.paywall）は、エラーの案内を重ねない。
      if (e?.monthlyLimit) setMonthLimitHit(true);
      if (!(controller.signal.aborted || (e && e.name === 'AbortError') || e?.paywall || e?.monthlyLimit)) {
        toast.error(toMessage(e, '回答の生成に失敗しました。'));
      }
      // 楽観的な streaming 行を差し替える。途中まで本文が生成されていた場合は
      // 捨てずに残し、末尾に中断注記を付ける（8 割生成済みの回答がエラーで全文
      // 消える事故を防ぐ。abort 時の部分保持と対称にする）。
      const partial = (lastVisible || '').trim();
      setMessages((arr) => arr.map((m) =>
        m.id === streamingId
          ? {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: controller.signal.aborted
                ? '回答を中止しました。'
                : e?.paywall
                  ? 'お試しの相談は、ここまでです。続けて相談するには、プランを始めてください。'
                : e?.monthlyLimit
                  ? e.message
                : partial
                  ? `${partial}\n\n— 通信が中断されたため、回答はここまでです。`
                  : '回答を生成できませんでした。少し時間をおいて再度お試しください。',
              refs: [],
              createdAt: new Date().toISOString(),
              // 通信エラー（ユーザーの中止ではない）はその場で再試行できるように
              // フラグを立てる。行き止まりで打ち直しを強いると看板機能で最悪の離脱に。
              error: !controller.signal.aborted && !e?.paywall && !e?.monthlyLimit,
              // 上限・お試し終了の案内には「別の角度で答えて」を出さない（押しても答えられない）
              notice: !!(e?.paywall || e?.monthlyLimit),
            }
          : m
      ));
      setPromptDismissed(false);
    } finally {
      // この run の controller が現役なら掃除する (新しい送信が始まっていれば
      // 上書きしない)。
      if (abortRef.current === controller) abortRef.current = null;
      setStage(null);
      setBusy(false);
      setAborting(false);
      if (freeMode) refreshFree(); // お試しの残りを取り直す（数えるのはサーバー）
      else refreshMonthCost();
    }
  };

  // 🏠→🧠 本棚ホームの「相談する」から来た質問を、履歴の読込完了後に 1 回だけ送る。
  // 履歴読込（fetchHistory）より先に送ると、読込結果で画面の会話が上書きされるため待つ。
  const askPresetDoneRef = useRef(null);
  useEffect(() => {
    if (!askPreset?.question || !historyLoaded) return;
    if (askPresetDoneRef.current === askPreset.nonce) return;
    askPresetDoneRef.current = askPreset.nonce;
    if (!consumePreset('ask', askPreset.nonce)) return;
    setView('chat');
    if (Array.isArray(askPreset.bookIds)) setScopeIds(askPreset.bookIds);
    ask(askPreset.question, Array.isArray(askPreset.bookIds) ? { bookIds: askPreset.bookIds } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askPreset?.nonce, historyLoaded]);

  // 「中止」ボタン: 進行中のストリームを止める。abort 後は streamMyBookBrain が
  // 途中までの内容で正常終了し、ask() の try ブロックがその時点で確定する。
  const stopStreaming = () => {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    setAborting(true);
    setStage(null);
    try { controller.abort(); } catch { /* ignore */ }
  };

  // 「✅ 解決した」: chat view を空に戻す。DB は消さないので履歴タブには残る。
  // clearedAt を「今」にすることで、それ以降の新規メッセージだけが chat に
  // 出るようになる。
  const handleResolveAndClear = () => {
    const now = new Date().toISOString();
    setClearedAt(now);
    setPromptDismissed(false);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('brain-cleared-at', now);
      }
    } catch { /* ignore */ }
    toast.success('新しい相談をはじめます。これまでの相談は右上の時計から見返せます。');
  };

  // 「💬 続けて質問する」: プロンプトだけ閉じる。次の AI 回答までは再表示しない。
  const handleContinue = () => {
    setPromptDismissed(true);
  };

  const regenerate = async () => {
    // Find the last user message; resend it.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        const q = messages[i].content;
        // 再試行前に、以前のエラー吹き出しを取り除く。エラー行は DB に保存されない
        // UI 上だけの行（err- id）なので消して安全。残すと再試行成功後も
        // 「生成できませんでした + 再試行」が新しい回答の上に居座り、もう一度
        // 押せば同じ質問の回答が二重生成されてしまう。
        setMessages((arr) => arr.filter((m) => !(m.role === 'assistant' && m.error)));
        // 既存の質問を answer し直すだけ — user 行は再 INSERT しない（重複防止）。
        await ask(q, { skipUserInsert: true });
        return;
      }
    }
  };

  const clearHistory = async () => {
    const ok = await confirm({
      title: 'これまでの相談をすべて削除しますか？',
      message: 'これまでの相談をすべて削除します。元に戻せません。',
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    try {
      // supabase-js は失敗を throw せず { error } で返す。チェックしないと
      // 削除に失敗しても「クリアしました」と偽の成功表示になる。
      const { error } = await supabase.from('chat_messages').delete().eq('user_id', user.id);
      if (error) throw error;
      setMessages([]);
      toast.success('履歴をクリアしました。');
    } catch (e) {
      toast.error(toMessage(e, '履歴の削除に失敗しました。'));
    }
  };

  // chat view では clearedAt 以降のメッセージだけ表示する。history view は
  // 全件表示のままで OK (DB は削除していない)。
  const visibleMessages = clearedAt
    ? messages.filter((m) => (m.createdAt || '') > clearedAt)
    : messages;
  const isEmpty = visibleMessages.length === 0;
  const lastIsAssistant = visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1].role === 'assistant';

  const noteCount = memoStats.cards + memoStats.personal;
  const knowledgeTotal = memoStats.cards + memoStats.summaries + memoStats.personal;
  // 相談例は 3 つだけ（SPEC §3）。あなたのタグ・本から → 汎用 の順で重複なく。
  // （AI で作る「今週の問い」は 2026-09-27 に廃止＝開くだけで AI が動かないように）
  const examples = useMemo(() => {
    const out = [];
    const push = (q) => { if (q && !out.includes(q) && out.length < 3) out.push(q); };
    suggestedQuestions.forEach(push);
    QUESTION_EXAMPLES.forEach(push);
    return out;
  }, [suggestedQuestions]);
  const [moreMenu, setMoreMenu] = useState(null); // { x, y }
  const viewTitle = { learning: '学びを書く', history: '過去の相談', knowledge: '根拠にできる情報' }[view];

  return (
    <div style={wrap}>
      {/* 上部は 1 行だけ（SPEC §3: 二重タブをやめる）。会話のときは「何を根拠に答えるか」＋
          履歴（時計）＋その他（…）。会話以外の画面では「‹ 相談」で戻る。 */}
      {/* お試し中は上部が 2 行になるので、下に線を引いて「下に潜っている」ことを示す */}
      <div style={freeMode || nearMonthLimit || monthLimitHit ? { ...topRow, borderBottom: '1px solid var(--separator)' } : topRow}>
        {view === 'chat' ? (
          <>
            <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.4 }}>
              {noteCount > 0 ? <>あなたのメモ {noteCount} 件から答えます</> : '読んだ本のメモを根拠に答えます'}
              {freeMode && freeRemaining > 0 && (
                <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
                  お試しで、あと {freeRemaining} 回相談できます
                </span>
              )}
              {nearMonthLimit && (
                <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
                  今月の相談は、残りわずかです
                </span>
              )}
              {monthLimitHit && (
                <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
                  今月の相談は、<span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}</span>から使えます
                </span>
              )}
            </p>
            <button type="button" style={iconBtn} onClick={() => setView('history')} aria-label="過去の相談を見る" title="過去の相談">
              <History size={22} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              style={iconBtn}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMoreMenu({ x: r.right - 8, y: r.bottom + 4 }); }}
              aria-label="その他の操作"
              title="その他"
            >
              <MoreHorizontal size={22} aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            {/* iOS のナビゲーションバーの形: 左に戻る・中央に題名・右は同じ幅の空き。 */}
            <div style={{ width: 96, flexShrink: 0 }}>
              <button type="button" onClick={() => setView('chat')} style={{ ...uiBtnText, fontSize: 'var(--text-body)', fontWeight: 400, padding: 'var(--space-2) 0', gap: 2, lineHeight: 1.3 }}>
                <ChevronLeft size={20} aria-hidden="true" />相談
              </button>
            </div>
            <h2 style={{ flex: 1, minWidth: 0, margin: 0, textAlign: 'center', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{viewTitle}</h2>
            {/* 行の右の余白（8）が左（16）より狭い分、右の空きを 8 広げて題名を画面中央に。 */}
            <div style={{ width: 104, flexShrink: 0 }} aria-hidden="true" />
          </>
        )}
      </div>
      {moreMenu && (
        <ContextMenu
          x={moreMenu.x}
          y={moreMenu.y}
          onClose={() => setMoreMenu(null)}
          items={[
            { label: '学びを書く', icon: <PencilLine size={16} aria-hidden="true" />, onClick: () => setView('learning') },
            { label: '根拠にできる情報', icon: <BookOpenCheck size={16} aria-hidden="true" />, onClick: () => setView('knowledge') },
          ]}
        />
      )}


      {/* 学びを書く（本以外の学びログ） */}
      {view === 'learning' && (
        <div style={viewScroll}>
          <LearningInline
            onCancel={() => setView('chat')}
            onSaved={() => { setView('chat'); setStatsTick((t) => t + 1); }}
          />
        </div>
      )}

      {/* 過去の相談 */}
      {view === 'history' && (
        <div style={viewScroll}>
        <PullToRefresh onRefresh={fetchHistory}>
          {/* 履歴は静的な過去ログなので live region にはしない（mount 時の過剰読み上げを避ける）。 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} role="region" aria-label="過去の相談">
            {messages.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0 }}>{messages.filter((m) => m.role === 'user').length} 件の相談</p>
              {messages.length > 0 && (
                <button type="button" style={{ ...uiBtnText, fontSize: 'var(--text-sub)', color: 'var(--error)', padding: '8px 0' }} onClick={clearHistory}>
                  すべて削除
                </button>
              )}
            </div>}
            {!historyLoaded && <Spinner message="読み込み中…" />}
            {historyLoaded && messages.length === 0 && (
              <EmptyState
                icon={<MessageCircle size={32} strokeWidth={1.5} aria-hidden="true" />}
                title="まだ相談していません"
                actions={[{ label: '相談する', onClick: () => setView('chat'), variant: 'secondary' }]}
              />
            )}
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} showTime onOpenBook={onOpenBook} books={books} onAddAction={handleAnswerToAction} onAddActionPickBook={onAddActionPickBook} onRetry={busy ? null : regenerate} />
            ))}
          </div>
        </PullToRefresh>
        </div>
      )}

      {/* 根拠にできる情報（旧: 知識） */}
      {view === 'knowledge' && (
        <div style={viewScroll}>
          <KnowledgeManager onChanged={() => setStatsTick((t) => t + 1)} onBooksMutated={onBooksMutated} />
        </div>
      )}

      {/* 会話 — chat-scroll + 入力欄（LINE 風）。画面の主役は最新の相談（古いものは履歴へ）。 */}
      {view === 'chat' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            ref={chatScrollRef}
            className="chat-scroll"
            style={{ padding: 'var(--space-2) var(--space-4) var(--space-4)' }}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="相談の会話"
            aria-busy={busy}
          >
          {isEmpty && historyLoaded && (
            knowledgeTotal === 0 ? (
              // メモ 0 件: 質問させる前に「これまで読んだ本から始める」（根拠が無いと空振りするため）。
              <section style={cardStyle} aria-labelledby="brain-start-title">
                <h2 id="brain-start-title" style={{ ...headingStyle, marginBottom: 'var(--space-4)' }}>まだ、相談の根拠になるメモがありません</h2>
                {onQuickstart ? (
                  <button type="button" onClick={onQuickstart} style={uiBtnPrimary}>これまで読んだ本から始める</button>
                ) : onGoBookshelf ? (
                  <button type="button" onClick={onGoBookshelf} style={uiBtnGhost}>本を開いてメモを書く</button>
                ) : null}
              </section>
            ) : (
              <section aria-labelledby="brain-empty-title">
                <h2 id="brain-empty-title" style={{ ...headingStyle, marginBottom: 'var(--space-6)' }}>困っていることを、相談してください</h2>
                <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: '0 0 var(--space-2)' }}>たとえば</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {examples.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => { if (!busy) ask(q); }}
                      disabled={busy}
                      style={{ ...chipStyle, opacity: busy ? 0.6 : 1 }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            )
          )}

          {!historyLoaded && <Spinner message="読み込み中…" />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {visibleMessages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                onOpenBook={onOpenBook}
                stage={m.streaming ? stage : null}
                books={books}
                onAddAction={handleAnswerToAction}
                onAddActionPickBook={onAddActionPickBook}
                onRetry={busy ? null : regenerate}
                onWriteLearning={() => setView('learning')}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* お試しを使い切ったら、答えの下で静かに案内（読み終えるまで画面を奪わない） */}
          {freeMode && freeRemaining <= 0 && !busy && lastIsAssistant && (
            <section
              aria-label="お試しの相談は、ここまで"
              style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}
            >
              <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
                お試しの相談は、ここまでです
              </p>
              <button type="button" onClick={() => openPaywall('free_used')} style={{ ...uiBtnPrimary, marginTop: 'var(--space-3)' }}>
                この相談相手を使い続ける
              </button>
            </section>
          )}

          {lastIsAssistant && !busy && visibleMessages.some((m) => m.role === 'user') && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
              {/* お試しを使い切ったら、できない操作を出さない */}
              {!(freeMode && freeRemaining <= 0) && !visibleMessages[visibleMessages.length - 1]?.notice && (
                <button type="button" onClick={regenerate} style={{ ...uiBtnText, fontSize: 'var(--text-sub)', padding: 'var(--space-2) 0' }}>
                  別の角度で答えて
                </button>
              )}
              <button type="button" onClick={handleResolveAndClear} style={{ ...uiBtnText, fontSize: 'var(--text-sub)', padding: 'var(--space-2) 0' }}>
                新しい相談をはじめる
              </button>
            </div>
          )}
          {/* AI 免責注記（App Store 審査ガイドライン対応 + 誠実な期待値設定）。固定表示にすると
              会話の面積を削るので、会話の流れの最後（空の画面・答えの下）に置く。 */}
          {historyLoaded && !busy && (isEmpty ? knowledgeTotal > 0 : (lastIsAssistant && !visibleMessages[visibleMessages.length - 1]?.notice)) && (
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-3)', margin: 'var(--space-4) 0 0', lineHeight: 1.5 }}>
              AI の回答には誤りが含まれることがあります
            </p>
          )}
          </div>{/* /chat-scroll */}

          {/* 相談相手は入力欄のすぐ上（SPEC §3）。 */}
          <ScopeBar
            label={scopeLabelFor(scopeIds, books)}
            scoped={scopeIds.length > 0}
            onOpen={() => setScopeSheetOpen(true)}
            onReset={() => setScopeIds([])}
            disabled={busy}
          />
          {scopeSheetOpen && (
            <ScopeSheet
              books={books}
              userId={user?.id}
              initial={scopeIds}
              onClose={() => setScopeSheetOpen(false)}
              onApply={(ids) => { setScopeIds(ids); setScopeSheetOpen(false); track('brain_scope_set', { count: ids.length }); }}
            />
          )}
          {/* 区切り線は相談相手の行の上に 1 本だけ（入力欄側の線は消す）。 */}
          <div className="ai-input-area" style={{ borderTop: 'none' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  ask();
                }
              }}
              placeholder="困っていることを書いてください"
              rows={1}
              disabled={busy}
              maxLength={LIMITS.aiQuestion}
              aria-label="相談したいこと"
            />
            {busy ? (
              // ストリーミング中は送信ボタンを「中止」に切り替える（その時点の内容で確定）。
              <button
                type="button"
                className="send-btn stop-btn"
                onClick={stopStreaming}
                disabled={aborting}
                aria-label={aborting ? '中止しています' : '回答を中止'}
                title={aborting ? '中止しています…' : '回答を中止'}
              >
                <Square size={16} fill="currentColor" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={() => ask()}
                disabled={!input.trim()}
                aria-label="送信"
                title="送信"
              >
                <ArrowUp size={20} strokeWidth={2.25} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STAGE_LABEL = {
  search: 'メモを探しています…',
  generate: '答えを書いています…',
};

// **bold** の軽量インラインパーサ。
function renderBoldInline(text) {
  const parts = [];
  let cursor = 0;
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(text.slice(cursor, m.index));
    parts.push(<strong key={i} style={{ fontWeight: 600 }}>{m[1]}</strong>);
    cursor = m.index + m[0].length;
    i += 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}

// 見出し（【】）の無い回答（旧形式・エラー文など）はそのまま段落で。
function PlainAnswer({ text }) {
  return (
    <>
      {(text || '').split('\n').filter((l) => l.trim()).map((line, idx) => (
        <p key={idx} style={{ margin: idx ? 'var(--space-2) 0 0' : 0 }}>{renderBoldInline(line.replace(/^【(.+?)】\s*/, '$1：'))}</p>
      ))}
    </>
  );
}

// 回答（【結論】【参照した本のメモ】【あなたの状況に合わせた解釈】【明日からできる 1 つの行動】）を
// 「結論 → 明日の一歩 → 根拠（畳む）」の順に組み替える（SPEC §3: 結論と一歩を先に）。
// 見出しが 1 つも取れなければ null（→ PlainAnswer）。
export function parseAnswer(text) {
  const src = String(text || '');
  const notes = [];
  const body = src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (/^（参照:/.test(t) || /^—\s/.test(t)) { notes.push(t.replace(/^—\s*/, '')); return false; }
      return true;
    })
    .join('\n');
  const sections = {};
  let key = null;
  let actionLabel = '明日からできる一歩';
  body.split('\n').forEach((line) => {
    const h = line.match(/^\s*【(.+?)】\s*(.*)$/);
    if (h) {
      const name = h[1];
      key = /結論/.test(name) ? 'conclusion'
        : /参照/.test(name) ? 'refs'
        : /解釈/.test(name) ? 'interp'
        : /(明日|行動|一歩|心に残る)/.test(name) ? 'action'
        : 'other';
      // 小説など行動がそぐわない問いでは見出しが「心に残るもの」になる（prompts の規約）。
      if (key === 'action' && !/明日/.test(name)) actionLabel = name;
      sections[key] = sections[key] || [];
      if (h[2]) sections[key].push(h[2]);
      return;
    }
    if (key) (sections[key] = sections[key] || []).push(line);
  });
  const join = (k) => (sections[k] || []).join('\n').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
  const conclusion = join('conclusion');
  if (!conclusion) return null;
  // 一歩は最初の段落だけ。後ろに続く補足（お試しモードの注記など）は note へ。
  const [actionHead, ...actionRest] = join('action').replace(/^[\s:：・\-*>]+/, '').split(/\n\s*\n/);
  return {
    conclusion,
    refs: join('refs'),
    interp: join('interp'),
    action: (actionHead || '').trim(),
    actionLabel,
    note: [...actionRest.map((t) => t.trim()).filter(Boolean), ...notes].join('\n'),
  };
}

// 回答末尾の「【明日からできる 1 つの行動】」セクション本文を取り出す。
// 見出しが崩れても空振りしないよう、見出しが無ければ「行動」を含む最終文へ。
function extractActionLine(text) {
  if (!text || typeof text !== 'string') return '';
  const m = text.match(/【\s*明日からできる[^】]*】\s*([\s\S]*?)(?:\n\s*【|\n\s*（参照:|REFS_START|$)/);
  let body = m ? m[1] : '';
  if (!body) {
    // フォールバック: 「明日からできる」を含む行以降を拾う。
    const idx = text.indexOf('明日からできる');
    if (idx !== -1) body = text.slice(idx).replace(/^明日からできる[^\n:：]*[:：]?/, '');
  }
  return body
    .replace(/^[\s:：・\-*>]+/, '')
    .split(/\n\s*\n/)[0]
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\*\*/g, '')
    .trim()
    .slice(0, 280);
}

// チャット回答の参照（📚 著者『書名』…）から、行動を紐づける本を解決する。
// クロスブックなので最初に一致した本へ。完全一致 → 部分一致の順。
function resolveActionBookId(refs, books) {
  if (!Array.isArray(refs) || !Array.isArray(books) || books.length === 0) return null;
  for (const r of refs) {
    const id = resolveRefBookId(r, books);
    if (id) return id;
  }
  return null;
}

// 単一の参照文字列（📚 著者『書名』…）から本 ID を解決する。解決できた参照だけ
// タップで本へ飛べるリンクにする（「本当に私の記録から答えている」を確認できる）。
function resolveRefBookId(ref, books) {
  if (!Array.isArray(books) || books.length === 0) return null;
  const tm = String(ref).match(/『([^』]+)』/);
  if (!tm) return null;
  const title = tm[1].trim();
  if (!title) return null;
  const exact = books.find((b) => (b.title || '').trim() === title);
  if (exact) return exact.id;
  const partial = books.find((b) => (b.title || '').trim() && title.includes((b.title || '').trim()));
  return partial ? partial.id : null;
}

// 参照の先頭の絵文字（📚 📖 💡）は外す（DESIGN §3: 絵文字をアイコン代わりにしない）。
function refText(r) {
  return String(r || '').replace(/^[^\p{L}\p{N}『「(（]+/u, '').trim();
}

function refBookCount(refs) {
  const titles = new Set();
  (refs || []).forEach((r) => { const m = String(r).match(/『([^』]+)』/); if (m) titles.add(m[1].trim()); });
  return titles.size;
}

// 案内文の「10月1日」を途中で改行させない。
function renderNoticeText(text) {
  const parts = String(text || '').split(/(\d{1,2}月\d{1,2}日)/);
  return parts.map((p, i) => (/^\d{1,2}月\d{1,2}日$/.test(p) ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{p}</span> : p));
}

function ChatMessage({ message, onOpenBook, stage, books, onAddAction, onAddActionPickBook, onRetry, onWriteLearning, showTime = false }) {
  const isUser = message.role === 'user';
  const isStreaming = !!message.streaming;
  const hasBody = typeof message.content === 'string' && message.content.length > 0;
  const showStageBlock = isStreaming && !hasBody;

  // 🧠→🎯 回答の「明日からできる一歩」を、紐づく本の行動リストへ 1 タップ追加。
  const [actionAdded, setActionAdded] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const canAct = !isUser && !isStreaming && !message.error && (!!onAddAction || !!onAddActionPickBook);
  const actionLine = canAct ? extractActionLine(message.content) : '';
  // 参照メモから本を特定できれば直接その本へ。特定できない一般回答は本選択シートへ。
  const actionBookId = actionLine && onAddAction ? resolveActionBookId((message.refs || []).filter((r) => !String(r).startsWith(EVIDENCE_PREFIX)), books) : null;
  const canShowAction = !!actionLine && (!!actionBookId || !!onAddActionPickBook);
  const handleAddAction = async () => {
    if (!actionLine || actionBusy) return;
    if (actionBookId && onAddAction) {
      setActionBusy(true);
      const ok = await onAddAction(actionBookId, actionLine);
      setActionBusy(false);
      if (ok) setActionAdded(true);
    } else if (onAddActionPickBook) {
      // 本を特定できない → 本選択シートで行動文をプレフィル（確定は本を選んだ時点）。
      onAddActionPickBook(actionLine);
    }
  };

  const time = showTime && !isStreaming && message.createdAt ? (
    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-3)', margin: 'var(--space-2) 0 0' }}>{fmtDate(message.createdAt)}</p>
  ) : null;

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} role="article" aria-label="あなたの相談">
        <div style={{ maxWidth: '85%', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {message.scopeLabel && message.scopeLabel !== SCOPE_ALL_LABEL && (
            <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', marginBottom: 'var(--space-1)' }}>相談相手：{message.scopeLabel}</span>
          )}
          {message.content}
          {time}
        </div>
      </div>
    );
  }

  const parsed = !isStreaming && !message.error && !message.notice ? parseAnswer(message.content) : null;
  // 🌱 「使ったメモ」の一行は refs の先頭に目印付きで保存している（表を増やさずに履歴にも残す）。
  const allRefs = Array.isArray(message.refs) ? message.refs : [];
  const evidence = (allRefs.find((r) => String(r).startsWith(EVIDENCE_PREFIX)) || '').slice(EVIDENCE_PREFIX.length);
  const refsList = allRefs.filter((r) => !String(r).startsWith(EVIDENCE_PREFIX));
  const nBooks = refBookCount(refsList);

  return (
    <div
      role="article"
      aria-label="相談への答え"
      // ストリーミング中は aria-busy=true。完了時にまとまった本文として読まれるようにする。
      aria-busy={isStreaming || undefined}
      style={answerCard}
    >
      {showStageBlock ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* 親が role="log" aria-live なので、ここで二重に live 領域を作らない。 */}
          <div className="ai-thinking">
            <span className="ai-thinking-dot" aria-hidden="true" />
            <span>{STAGE_LABEL[stage] || '答えを準備しています…'}</span>
          </div>
          <div className="ai-skeleton" aria-hidden="true">
            <div className="ai-skeleton-line" style={{ width: '88%' }} />
            <div className="ai-skeleton-line" style={{ width: '74%' }} />
            <div className="ai-skeleton-line" style={{ width: '62%' }} />
          </div>
        </div>
      ) : isStreaming ? (
        <div style={{ ...readText, whiteSpace: 'pre-wrap' }}>
          {message.content}
          <span className="streaming-cursor" aria-hidden="true" />
        </div>
      ) : message.notice ? (
        // 運営からの案内（月の上限・お試しの終了）。答え用の明朝ではなく UI の書体で。
        <>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {renderNoticeText(message.content)}
          </p>
          {onWriteLearning && /今月の AI/.test(message.content) && (
            <>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>
                それまでに残したメモや学びは、次の相談の材料になります。
              </p>
              <button type="button" onClick={onWriteLearning} style={{ ...rowBtn, marginTop: 'var(--space-3)' }}>
                <PencilLine size={16} aria-hidden="true" />学びを書く
              </button>
            </>
          )}
        </>
      ) : message.error ? (
        <>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{message.content}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} style={{ ...rowBtn, marginTop: 'var(--space-3)' }}>
              <RotateCw size={16} aria-hidden="true" />もう一度
            </button>
          )}
        </>
      ) : parsed ? (
        <>
          {/* 1. 結論（読む文章＝明朝 18・行間 1.6） */}
          <div style={readText}>
            {parsed.conclusion.split('\n').filter((l) => l.trim()).map((l, i) => (
              <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0 }}>{renderBoldInline(l)}</p>
            ))}
          </div>
          {/* 2. 明日からできる一歩（＋ 行動に追加） */}
          {parsed.action && (
            <div style={{ marginTop: 'var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)', padding: 'var(--space-3) var(--space-4)' }}>
              <p style={{ margin: 0, fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)' }}>{parsed.actionLabel}</p>
              <p style={{ ...readText, margin: 'var(--space-1) 0 0', whiteSpace: 'pre-wrap' }}>{renderBoldInline(parsed.action)}</p>
              {canShowAction && (
                actionAdded ? (
                  <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)' }}>
                    <Check size={16} aria-hidden="true" />行動に追加しました
                  </p>
                ) : (
                  <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)', opacity: actionBusy ? 0.6 : 1 }}>
                    <Target size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />行動に追加
                  </button>
                )
              )}
            </div>
          )}
          {/* 積み重ねが効いていることを、事実だけで一行（盛らない・渡したメモと一致したものだけ） */}
          {evidence && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
              <Sprout size={16} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <span>{evidence}</span>
            </p>
          )}
          {/* 3. 根拠（参照したメモ・解釈）は畳む */}
          {(parsed.refs || parsed.interp || refsList.length > 0) && (
            <details style={{ marginTop: 'var(--space-3)' }}>
              <summary style={summaryStyle}>
                <span>根拠を見る{nBooks > 0 && !evidence ? `（${nBooks} 冊のメモ）` : ''}</span>
                <ChevronDown size={18} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingBottom: 'var(--space-1)' }}>
                {parsed.refs && (
                  <div>
                    <p style={subLabel}>参照したメモ</p>
                    <div style={subText}><PlainAnswer text={parsed.refs} /></div>
                  </div>
                )}
                {parsed.interp && (
                  <div>
                    <p style={subLabel}>あなたの状況に合わせると</p>
                    <div style={subText}><PlainAnswer text={parsed.interp} /></div>
                  </div>
                )}
                {refsList.length > 0 && (
                  <div>
                    <p style={subLabel}>もとになった本</p>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {refsList.map((r, i) => {
                        const refBookId = onOpenBook ? resolveRefBookId(r, books) : null;
                        return (
                          <li key={i}>
                            {refBookId ? (
                              <button type="button" onClick={() => onOpenBook(refBookId)} style={refBtn} aria-label={`${r} を開く`}>
                                <span style={{ flex: 1, minWidth: 0 }}>{refText(r)}</span>
                                <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                              </button>
                            ) : (
                              <p style={{ ...subText, margin: 0, padding: 'var(--space-2) 0' }}>{refText(r)}</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}
          {parsed.note && <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-3)', margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap' }}>{parsed.note}</p>}
        </>
      ) : (
        <div style={readText}><PlainAnswer text={message.content} /></div>
      )}
      {/* 旧形式（見出しなし）でも行動化できるように */}
      {!parsed && canShowAction && !message.error && (
        actionAdded ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)' }}>
            <Check size={16} aria-hidden="true" />行動に追加しました
          </p>
        ) : (
          <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)' }}>
            <Target size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />行動に追加
          </button>
        )
      )}
      {time}
    </div>
  );
}


// ===== 🎯 相談相手の選択（すべての本 / 1 冊 / 数冊） =====
const SCOPE_ALL_LABEL = 'すべての本';

function scopeLabelFor(ids, books) {
  if (!ids || ids.length === 0) return SCOPE_ALL_LABEL;
  if (ids.length === 1) {
    const b = (books || []).find((x) => x.id === ids[0]);
    return b ? `『${b.title}』` : '1冊';
  }
  return `選んだ ${ids.length} 冊`;
}

// 入力欄のすぐ上のチップ 1 つ（見た目 32・押せる範囲 44。DESIGN §5 チップ）。
// 固定表示の高さを抑えて、会話に使える面積を残す。
function ScopeBar({ label, scoped, onOpen, onReset, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4) 0', flexShrink: 0, minWidth: 0, borderTop: '1px solid var(--separator)' }}>
      {/* 見た目の文字（相談相手：…）がそのまま読み上げ名になる（label-in-name）。
          押せる範囲 44 は保ったまま、上下のはみ出し（(32-44)/2）を負の余白で打ち消す。 */}
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-haspopup="dialog"
        style={{ minWidth: 0, maxWidth: '100%', minHeight: 44, margin: 'calc(-1 * var(--space-2)) 0', display: 'inline-flex', alignItems: 'center', padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{
          minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', height: 32, padding: '0 var(--space-3)',
          borderRadius: 'var(--radius)', background: scoped ? 'var(--accent-soft)' : 'var(--fill)', color: 'var(--text)',
          fontSize: 'var(--text-meta)', fontWeight: 600,
        }}>
          <span style={{ color: 'var(--text-2)', fontWeight: 400, flexShrink: 0 }}>相談相手：</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <ChevronDown size={16} aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
        </span>
      </button>
      {scoped && (
        <button type="button" onClick={onReset} disabled={disabled} style={{ ...uiBtnText, fontSize: 'var(--text-meta)', padding: 0, minHeight: 44, margin: 'calc(-1 * var(--space-2)) 0', flexShrink: 0 }}>
          すべてに戻す
        </button>
      )}
    </div>
  );
}

function ScopeSheet({ books = [], userId, initial = [], onClose, onApply }) {
  const [mode, setMode] = useState(initial.length ? 'pick' : 'all');
  const [picked, setPicked] = useState(new Set(initial));
  const [counts, setCounts] = useState(null); // Map<bookId, メモ件数>

  // 本ごとのメモ件数（メモの無い本は根拠が無いので選べない）。
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return undefined;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('book_memos').select('book_id').eq('user_id', userId);
      if (!alive) return;
      const m = new Map();
      (data || []).forEach((r) => { if (r.book_id) m.set(r.book_id, (m.get(r.book_id) || 0) + 1); });
      setCounts(m);
    })();
    return () => { alive = false; };
  }, [userId]);

  const hasKnowledge = (b) => (counts?.get(b.id) || 0) > 0 || !!(b.leverageMemo || '').trim() || !!(b.aiSummary || '').trim();
  const list = [...books]
    .filter((b) => b.status === 'reading' || b.status === 'done' || (counts?.get(b.id) || 0) > 0)
    .sort((a, b) => (counts?.get(b.id) || 0) - (counts?.get(a.id) || 0));

  const toggle = (id) => {
    setMode('pick');
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const canApply = mode === 'all' || picked.size > 0;
  const apply = () => onApply(mode === 'all' ? [] : [...picked]);

  const rowStyle = (on) => ({
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', minHeight: 56,
    borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--separator)'}`, background: on ? 'var(--accent-soft)' : 'var(--surface)',
  });
  const mark = (on) => (
    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent)' : 'transparent', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {on && <Check size={14} strokeWidth={3} />}
    </span>
  );

  return (
    <BottomSheet
      title="誰に相談しますか？"
      onClose={onClose}
      dismissLabel="キャンセル"
      footer={(
        <button type="button" onClick={apply} disabled={!canApply} style={{ ...uiBtnPrimary, opacity: canApply ? 1 : 0.5 }}>
          {mode === 'all' ? 'すべての本に相談する' : picked.size === 1 ? 'この本に相談する' : `${picked.size} 冊に相談する`}
        </button>
      )}
    >
      <button type="button" onClick={() => { setMode('all'); setPicked(new Set()); }} aria-pressed={mode === 'all'} style={{ ...rowStyle(mode === 'all'), marginBottom: 'var(--space-6)' }}>
        {mark(mode === 'all')}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>すべての本（おすすめ）</span>
          <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>読んだ本と学びのすべてを根拠に、複数の本をつなげて答えます</span>
        </span>
      </button>
      <p style={{ fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-2)' }}>本に絞る（1 冊でも、数冊でも）</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {list.length === 0 && <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>読書中・読了の本がまだありません。</p>}
        {list.map((b) => {
          const on = mode === 'pick' && picked.has(b.id);
          const ok = counts == null || hasKnowledge(b);
          const n = counts?.get(b.id) || 0;
          return (
            <button key={b.id} type="button" onClick={() => ok && toggle(b.id)} disabled={!ok} aria-pressed={on} style={{ ...rowStyle(on), opacity: ok ? 1 : 0.5 }}>
              {mark(on)}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-body)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>{ok ? (n > 0 ? `メモ ${n} 件` : 'まとめメモあり') : 'メモがまだありません'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
