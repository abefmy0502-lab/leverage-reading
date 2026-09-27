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
import { btnPrimary as uiBtnPrimary, btnPrimaryOff as uiBtnPrimaryOff, btnGhost as uiBtnGhost, btnText as uiBtnText, btnLink as uiBtnLink, groupTitle, input as uiInput } from '../styles/ui';
import { track, EVENTS } from '../lib/analytics';
import { LIMITS } from '../lib/limits';
import KnowledgeManager from './KnowledgeManager';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { X, MessageCircle, History, BookOpenCheck, Target, Check, RotateCw, MoreHorizontal, ChevronLeft, ChevronDown, ChevronRight, PencilLine, ArrowUp, Square, Plus, Minus, Sprout, Trash2 } from 'lucide-react';
import ContextMenu from './ContextMenu';
import { usePaywall } from '../state/PaywallContext';
import { nextResetLabelJa } from '../lib/freeTrial';
import { PAID_TOKENS, monthDayLabelJa } from '../lib/tokens';

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
import { fetchAllRows } from '../lib/fetchAllRows';

// 1 文字も出る前に「止める」を押したときの答え（履歴にもこの文で残る）。
const STOPPED_EMPTY = '回答を中止しました。';

// 答えを作っている途中で相談の画面を離れても、答えは最後まで作って履歴に残す
// （以前は離れた瞬間に止めていたため、原価だけかかって答えは途中で切れていた）。
// 戻ってきたら、その質問と答えを会話に出す。画面を作り直しても消えない場所に覚えておく。
let backgroundAsk = null; // { questionAt, done, finishedAt, leftWhileRunning, promise }

// 相談の画面を離れて（下のタブ・上のサブタブを切り替えて）戻ってきたときは、同じ会話と
// 同じ相談相手のまま続ける。新しい会話になるのは、アプリを開き直したとき（再読み込み）と
// 「新しい相談をはじめる」を押したときだけ。画面を作り直しても消えない場所に覚えておく。
// { userId, clearedAt, scopeIds, answerMode, messages, scrollTop }
let session = null;

// 📚 答え方（2026-09-27）: 'fused'＝まとめて（選んだ本の考え方を合わせて 1 つの答えに・既定）/
//   'perbook'＝本ごとに（本ごとの視点を並べてくらべる）。見る人ごとの好みなので端末にも覚える。
const ANSWER_MODE_KEY = 'brain-answer-mode';
const ANSWER_MODES = [
  { id: 'fused', label: 'まとめて', sub: '選んだ本の考え方を合わせて、1 つの答えに' },
  { id: 'perbook', label: '本ごとに', sub: '本ごとの視点を並べて、くらべる' },
];
const answerModeLabel = (id) => (ANSWER_MODES.find((m) => m.id === id) || ANSWER_MODES[0]).label;
const loadAnswerMode = () => {
  try { return localStorage.getItem(ANSWER_MODE_KEY) === 'perbook' ? 'perbook' : 'fused'; } catch { return 'fused'; }
};
// 境界（clearedAt）が決まる前に離れたときは、覚えていないのと同じ扱い（初めて開いたときと同じ手順）。
const sessionFor = (userId) => (session && userId && session.userId === userId && session.clearedAt !== undefined ? session : null);
const rememberSession = (userId, patch) => {
  if (!userId) return;
  if (!session || session.userId !== userId) session = { userId, clearedAt: undefined, scopeIds: [], messages: [], scrollTop: 0 };
  Object.assign(session, patch);
};

// AI tab の .ai-page-body (flex 1, overflow hidden) の中にぴったり
// 収める flex column。chat 時は内側 .chat-scroll + .ai-input-area で
// LINE 風レイアウト、それ以外 (learning/history/knowledge) は普通の
// 縦スクロールフォーム / リスト。padding は各 view 内側で管理する。
const wrap = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' };
// chat 以外の view 共通: ヘッダ/pill 下にスクロール可能な領域を提供。
const viewScroll = { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'var(--space-2) var(--space-4) var(--space-6)' };
// ── 相談画面の部品（DESIGN.md のトークンのみ） ──
// 左右の余白は 16。右端のアイコン（押せる範囲 44）は負の余白で外へ出し、見た目の右端を 16 に揃える。
const topRow = { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 52, paddingTop: 'var(--space-1)', paddingBottom: 'var(--space-1)', paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-4)' }; // 押し込まれた画面で paddingTop だけ上書きするので、個別の指定で書く（padding と混ぜない＝React の警告）
const iconBtn = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 999, color: 'var(--text-2)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0 };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const headingStyle = { fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 };
// 相談例＝チップ（--fill 面・枠なし。入力欄と見分けがつくように。ホームと同じ）。
const chipStyle = { display: 'block', width: '100%', minHeight: 44, padding: 'var(--space-3)', textAlign: 'left', wordBreak: 'auto-phrase', background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 };
// 答え＝読むカード（全幅）。ユーザーの相談は右寄せの --fill 吹き出し。
const answerCard = { ...cardStyle, wordBreak: 'break-word' };
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)' };
const rowBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
// 畳む見出し（DESIGN §5: 高さ 48・17/600/--text・右端にシェブロン 20）。
const summaryStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', minHeight: 48, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none' };
// 根拠の中の小さな見出し（DESIGN §5 groupTitle: 12/600/--text-2）。
const subLabel = { ...groupTitle, margin: '0 0 var(--space-1)' };
// 根拠の本文（参照したメモ・解釈）も答えの一部＝読む文章（明朝 18・行間 1.6・DESIGN §2/§7）。
const subText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', color: 'var(--text)', lineHeight: 1.6 };
const refBtn = { width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44, padding: 'var(--space-2) 0', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 };
// 学びを書くの入力欄は ui.js の input（高さ 48）をそのまま使う。
const inp = uiInput;
// 学びの本文＝読む文章（明朝 18・行間 1.6）。display:block で下の余白のずれ（inline のベースライン分）を消す。
const ta = { ...uiInput, display: 'block', resize: 'none', minHeight: 160, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6 };

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
  // 選ぶチップ（DESIGN §5）: 押して選ぶ操作なので、見た目も押せる範囲も高さ 44・15px（負の余白で重ねない）。
  const chip = (on) => ({
    display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.3,
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
          style={{ ...uiBtnLink, padding: 0, gap: 'var(--space-1)' }}
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
                    <span key={`${t}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 32, padding: '0 0 0 var(--space-3)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-meta)' }}>
                      {t}
                      <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} aria-label={`「${t}」を削除`} style={{ width: 44, height: 44, margin: 'calc(-1 * var(--space-2)) 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}>
                        <X size={16} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
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
                {/* 入力欄（48）の隣なので、副ボタンの標準（48・17/600）。 */}
                <button type="button" onClick={addTag} style={{ ...uiBtnGhost, width: 'auto', flexShrink: 0 }}>追加</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        style={canSave ? uiBtnPrimary : uiBtnPrimaryOff}
      >
        {busy ? '保存中…' : '保存'}
      </button>
    </div>
  );
}

// ============================================================================
// Main MyBookBrain component
// ============================================================================
export default function MyBookBrain({ onOpenBook, books = [], onAddAction, onBooksMutated, onAddActionPickBook, onGoBookshelf, onQuickstart, askPreset, scopePreset, onPushedViewChange }) {
  const { user } = useAuth();
  // ⚡ タブを開いた瞬間に知識スキャン（gatherKnowledge）を裏で開始 — 最初の質問時には
  // キャッシュ済みで、RAG 構築の待ち時間（数百ms〜数秒）が消える。
  useEffect(() => { prewarmKnowledge(user?.id); }, [user?.id]);
  const toast = useToast();
  const confirm = useConfirm();
  // 🪙 プランと残りのトークン（src/lib/tokens.js・止めるのはサーバー）。上部に 1 行「今月の残り N トークン」。
  //    無料プラン（相談だけ）で使い切ったら、答えの下で静かに案内＋有料プランの画面へ。
  const { plan, freeMode, trialEndsAt, tokensRemaining, tokenAllowance, purchasedTokens, tokensAvailable, canBuyTokens, openTokenSheet, refreshTokens, openPaywall } = usePaywall();
  const [monthLimitHit, setMonthLimitHit] = useState(false); // トークンの上限に達した（サーバーの 429）
  // 🪙➕ トークンを買い足したら、上限の状態を解く（送れるように戻す）。
  useEffect(() => { if (purchasedTokens > 0) setMonthLimitHit(false); }, [purchasedTokens]);
  const freeUsedUp = freeMode && tokensAvailable != null && tokensAvailable <= 0;
  // プランの人（有料・無料期間）がトークンを使い切った（サーバーの 429 か、残りが 0）。
  const planOut = canBuyTokens && (monthLimitHit || (tokensAvailable != null && tokensAvailable <= 0));
  const outOfTokens = monthLimitHit || planOut;
  // 無料期間が終わる日（「◯月◯日から、毎月 800 トークン使えます」）。分からなければ空。
  const trialEndLabel = plan === 'trial' ? monthDayLabelJa(trialEndsAt) : '';
  const [view, setView] = useState('chat'); // 'chat' | 'learning' | 'history' | 'knowledge'
  // 押し込まれた画面（過去の相談・学びを書く・根拠にできる情報）のあいだは、親がサブタブを隠せるように知らせる
  // （見出しが 3 段に重ならないように）。離れるときは必ず false に戻す。
  const pushedCbRef = useRef(onPushedViewChange);
  useEffect(() => { pushedCbRef.current = onPushedViewChange; });
  const isPushed = view !== 'chat';
  useEffect(() => { pushedCbRef.current?.(isPushed); }, [isPushed]);
  useEffect(() => () => { pushedCbRef.current?.(false); }, []);
  // ブラウザ / Android の「戻る」（App の useHistoryBack）は「‹ 相談」と同じく会話へ戻す。
  useEffect(() => {
    const onBack = () => setView('chat');
    window.addEventListener('orime:consult-back', onBack);
    return () => window.removeEventListener('orime:consult-back', onBack);
  }, []);
  // 同じアプリの起動中に戻ってきたら、前の会話と相談相手をそのまま出す（上の session）。
  const resumed = useRef(sessionFor(user?.id)).current;
  const [messages, setMessages] = useState(() => (resumed
    ? resumed.messages.filter((m) => !m.streaming && !/^(streaming|bg-wait)-/.test(String(m.id)))
    : []));
  useEffect(() => { rememberSession(user?.id, { messages }); }, [messages, user?.id]);
  const [input, setInput] = useState('');
  // 🎯 相談相手（2026-09-26）: [] = すべての本（＋学びログ）/ [id] = その 1 冊だけ /
  //   [id, id, …] = 選んだ数冊だけ。質問ごとに streamMyBookBrain へ bookIds で渡す。
  const [scopeIds, setScopeIds] = useState(() => (resumed ? resumed.scopeIds : []));
  useEffect(() => { rememberSession(user?.id, { scopeIds }); }, [scopeIds, user?.id]);
  const [scopeSheetOpen, setScopeSheetOpen] = useState(false);
  // 📚 答え方（まとめて / 本ごとに）。相談相手が 1 冊のときは「まとめて」で答える（並べる本が無い）。
  const [answerMode, setAnswerMode] = useState(() => (resumed?.answerMode === 'perbook' || resumed?.answerMode === 'fused' ? resumed.answerMode : loadAnswerMode()));
  useEffect(() => {
    rememberSession(user?.id, { answerMode });
    try { localStorage.setItem(ANSWER_MODE_KEY, answerMode); } catch { /* ignore */ }
  }, [answerMode, user?.id]);
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  // 絞った本のメモの件数（上部の「〜件から答えます」を相談相手に合わせる）
  const [scopeMemoCount, setScopeMemoCount] = useState(null);
  useEffect(() => {
    if (!scopeIds.length || !user?.id || !isSupabaseConfigured) { setScopeMemoCount(null); return undefined; }
    let alive = true;
    (async () => {
      const { count } = await supabase.from('book_memos').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).in('book_id', scopeIds);
      if (alive) setScopeMemoCount(typeof count === 'number' ? count : null);
    })();
    return () => { alive = false; };
  }, [scopeIds, user?.id]);
  // 本詳細の「この本に相談する」から来たら、相談相手をその本に絞って質問画面へ。
  useEffect(() => {
    if (!scopePreset?.bookIds || !consumePreset('scope', scopePreset.nonce)) return;
    setScopeIds(scopePreset.bookIds);
    setView('chat');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopePreset?.nonce]);
  const [busy, setBusy] = useState(false);
  // 🧠→🎯 回答の行動を、紐づく本の行動リストへ追加。
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
    // 追加できたことは答えの中の「行動に追加しました」で伝える（同じ文をトーストで重ねない）。
    return onAddAction(bookId, { text: plain, sourceMemoId: null, sourcePage: null, deadline: tomorrow });
  }, [onAddAction]);
  // 段階的ステータス表示: 'search' = 過去のメモを取得中, 'generate' = Claude が回答生成中,
  // null = 未送信 or ストリーミング中で本文が出始めた。
  const [stage, setStage] = useState(null);
  // 「✅ 解決した」をタップした時刻 (ISO 文字列)。chat view ではこの時刻
  // 以降のメッセージのみ表示する。history view は全件表示。localStorage に
  // 永続化して mount/unmount を跨いでも保持。
  const [clearedAt, setClearedAt] = useState(() => {
    if (resumed && resumed.clearedAt !== undefined) return resumed.clearedAt;
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem('brain-cleared-at') || null;
    } catch { return null; }
  });
  // 「解決しましたか？」プロンプトを今のターンで dismiss したか
  // (= 「💬 続けて質問する」を押したか)。dismiss されたら次の AI 回答までは
  // プロンプトを再表示しない。
  const [promptDismissed, setPromptDismissed] = useState(false);
  // 戻ってきたときは覚えていた会話をすぐ出す（読み直しは裏で行い、出ている会話は消さない）。
  const [historyLoaded, setHistoryLoaded] = useState(() => !!resumed);
  const [historyError, setHistoryError] = useState(false);
  // learningOpen state は廃止 — view === 'learning' で表現する。
  const [memoStats, setMemoStats] = useState({ cards: 0, summaries: 0, personal: 0 });
  const [memoStatsLoaded, setMemoStatsLoaded] = useState(false);
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
    let data = null;
    let error = null;
    try {
      ({ data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(300));
    } catch (e) {
      error = e;
    }
    // 読み込めなかったことを「まだ相談していません」と見分けて出す（過去の相談の画面）。
    setHistoryError(!!error);
    // 読み込み中に送られた質問・回答（まだ履歴に無い行）は消さずに後ろへ残す。
    // 以前は履歴で丸ごと上書きしていたため、開いた直後に送ると質問も答えも消えていた。
    const hist = error ? [] : (data || []).reverse().map(transformMessage);
    if (error) console.warn('chat history fetch error:', error);
    historyLatestRef.current = hist.length > 0 ? hist[hist.length - 1].createdAt : null;
    setMessages((prev) => {
      const ids = new Set(hist.map((m) => m.id));
      // 画面の上だけで持っている「相談相手：〇〇」の札は、読み直しても消さない。
      const labels = new Map(prev.filter((m) => m.scopeLabel).map((m) => [m.id, m.scopeLabel]));
      const merged = labels.size ? hist.map((m) => (labels.has(m.id) ? { ...m, scopeLabel: labels.get(m.id) } : m)) : hist;
      return [...merged, ...prev.filter((m) => !ids.has(m.id))];
    });
    setHistoryLoaded(true);
  }, [user]);

  // Load history once on user change.
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 別のタブへ移っても（この画面が消えても）答えは止めない。原価はもう払っているので
  // 最後まで作って履歴に残し、戻ったときに会話へ出す（上の backgroundAsk）。
  useEffect(() => () => {
    if (backgroundAsk && !backgroundAsk.done) backgroundAsk.leftWhileRunning = true;
  }, []);

  // アプリを開いて最初に相談を開いたときは「新しい会話」から始める（過去のやりとりは
  // 過去の相談にすべて残る）。同じ起動中にほかのタブから戻ってきたときは、前の会話の
  // まま（上の session の境界を使う・2026-09-27）。
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
    // 同じアプリの起動中に戻ってきたときは、前の境界をそのまま使う（会話を空にしない）。
    let cut = resumed && resumed.clearedAt !== undefined
      ? resumed.clearedAt
      : (historyLatestRef.current || '1970-01-01T00:00:00.000Z');
    // 答えを待っている途中で画面を離れていたら、その質問から会話に出す。
    const bg = backgroundAsk && backgroundAsk.leftWhileRunning
      && (!backgroundAsk.done || Date.now() - (backgroundAsk.finishedAt || 0) < 10 * 60 * 1000)
      ? backgroundAsk : null;
    if (bg?.questionAt) {
      const before = new Date(Date.parse(bg.questionAt) - 1).toISOString();
      if (before < cut) cut = before;
      if (!bg.done) {
        // まだ作っている途中なら、終わるまで「作っています」を出し、終わったら履歴を読み直す。
        const waitId = `bg-wait-${Date.now()}`;
        setBusy(true);
        setMessages((arr) => [...arr, { id: waitId, role: 'assistant', content: '', refs: [], createdAt: new Date().toISOString(), streaming: true }]);
        bg.promise.then(async () => {
          setMessages((arr) => arr.filter((m) => m.id !== waitId));
          await fetchHistory();
          setBusy(false);
        });
      }
      // 一度出したら忘れる（次に開いたときは、いつもどおり新しい会話から）。
      if (bg.done) backgroundAsk = null;
      else bg.leftWhileRunning = false;
    }
    setClearedAt(cut);
    rememberSession(user?.id, { clearedAt: cut });
    try { localStorage.setItem('brain-cleared-at', cut); } catch { /* ignore */ }
  }, [historyLoaded, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // 📚 メモのある本（相談例に「メモの無い本」を出さないため。新しいメモから最大 1000 件で十分）。
  const [memoBookIds, setMemoBookIds] = useState(null); // Set<bookId> | null（読み込み前）
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return undefined;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('book_memos')
          .select('book_id')
          .eq('user_id', user.id)
          .not('book_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1000);
        if (alive && !error) setMemoBookIds(new Set((data || []).map((r) => r.book_id)));
      } catch { /* 取れなければ従来どおり（本の状態で選ぶ） */ }
    })();
    return () => { alive = false; };
  }, [user?.id, view, statsTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Knowledge counts for the header (cards / summaries / personal)。
  // summaries は books の 7 フィールド (leverage_memo + invest_purpose +
  // current_challenge + hypothesis + ai_summary + roi_summary + ai_strategy)
  // を「いずれかが入っている本の数」ではなく「埋まっているフィールドの合計
  // 件数」で数える。AI が参照する knowledge の厚みを正しく示すため。
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return undefined;
    let cancelled = false;
    (async () => {
     try {
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
        // 選書理由（book_reason）も根拠にできる情報に並ぶので数える（上部の件数と一覧の件数を揃える）。
        // 列の無い古い DB では外して数え直す。
        supabase
          .from('books')
          .select('leverage_memo, invest_purpose, current_challenge, hypothesis, book_reason, ai_summary, roi_summary, ai_strategy')
          .eq('user_id', user.id)
          .then((r) => (r.error
            ? supabase.from('books').select('leverage_memo, invest_purpose, current_challenge, hypothesis, ai_summary, roi_summary, ai_strategy').eq('user_id', user.id)
            : r)),
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
        if (isFilled(b.book_reason)) n += 1;
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
     } catch (e) {
      console.warn('memo stats fetch error:', e?.message || e);
     } finally {
      // 数え終わるまで空の画面（相談例 / 初日の入口）を出さない（出してから入れ替わるちらつきの防止）。
      if (!cancelled) setMemoStatsLoaded(true);
     }
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
      // 自分の相談の吹き出しの上端から見せる（何への答えかが分かるように）。相談が長すぎて
      // 答えが画面の下に隠れてしまうときだけ、答えの先頭に合わせる。
      const q = last.previousElementSibling;
      const isQ = q && q.getAttribute('aria-label') === 'あなたの相談';
      const target = isQ && q.offsetHeight < el.clientHeight * 0.4 ? q : last;
      const gap = parseFloat(getComputedStyle(el).getPropertyValue('--space-4')) || 16;
      const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - gap;
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
    // 相談相手を本に絞っているときは、その本からだけ例を作る（ほかの本やタグの例を出さない）
    if (scopeIds.length > 0) {
      const picked = (books || []).filter((b) => scopeIds.includes(b.id));
      const first = picked[0];
      if (first?.title) {
        qs.push(`『${first.title}』の学びで、明日から使えるものは？`);
        qs.push(`『${first.title}』でいちばん大事なことを、私のメモから教えて`);
      }
      if (picked.length > 1) qs.push('選んだ本に共通する考え方は？');
      qs.push('この本から、今週やる一歩を1つ提案して');
      return qs.slice(0, 3);
    }
    // メモの無い本の名前・タグは出さない（聞いても根拠が無い）。メモの有無が分かるまでは状態で選ぶ。
    const hasMemo = (b) => memoBookIds == null || memoBookIds.has(b.id);
    const tagCount = new Map();
    (books || []).filter(hasMemo).forEach((b) => (Array.isArray(b.tags) ? b.tags : []).forEach((t) => {
      const k = String(t || '').trim();
      if (k) tagCount.set(k, (tagCount.get(k) || 0) + 1);
    }));
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
    // タグの例も相談の形に（「要点を3つにまとめて」はテーマまとめの仕事で、結論→一歩の答えと噛み合わない）。
    topTags.forEach((t) => qs.push(`「${t}」で迷ったとき、私のメモからヒントをください`));
    const recent = (books || []).find((b) => (b.status === 'reading' || b.status === 'done') && hasMemo(b))
      || (memoBookIds ? (books || []).find((b) => memoBookIds.has(b.id)) : null);
    if (recent?.title) qs.push(`『${recent.title}』の学びで、明日から使えるものは？`);
    // 本のメモがあるときだけ（メモが無いのに「最近のメモから」とは聞けない）。
    if (memoBookIds?.size > 0) qs.push('最近のメモから、今週やるべき一歩を1つ提案して');
    return qs.slice(0, 3);
  }, [books, scopeIds, memoBookIds]);

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
    // 無料プランで今月のトークンを使い切っていたら、送らずに有料プランの画面を開く（入力は残す）。
    if (freeUsedUp) { openPaywall('free_used'); return; }
    // プランのトークンを使い切っていたら送らない（入力は残す。案内とトークンの追加は会話の下に出ている）。
    if (outOfTokens) return;
    const askBookIds = Array.isArray(opts.bookIds) ? opts.bookIds : scopeIds;
    const askScopeLabel = scopeLabelFor(askBookIds, books);
    const askMode = opts.mode || (askBookIds.length === 1 ? 'fused' : answerMode);

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
    let savedUserId = null; // 上限・お試し終了で答えられなかったら、履歴から質問を取り下げる
    let questionAt = opts.questionAt || null; // 質問の保存時刻（サーバー時刻・画面を離れて戻ったとき用）
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
        savedUserId = data?.id || null;
        questionAt = data?.created_at || null;
        setMessages((arr) => [...arr, userRow]);
      } catch (e) {
        setBusy(false);
        toast.error(toMessage(e, 'メッセージの保存に失敗しました。'));
        return;
      }
    }

    let finishBackground = () => {};
    const bgPromise = new Promise((resolve) => { finishBackground = resolve; });
    backgroundAsk = { questionAt, done: false, finishedAt: 0, leftWhileRunning: false, promise: bgPromise };
    const myBackground = backgroundAsk;

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
        mode: askMode, // 本ごとには、書いている途中から本のカードの形で見せる（出来上がりで形が跳ねないように）
      },
    ]);
    setStage('search');

    // ストリーミングで届いた最新の可視テキスト。abort 時に refs パースが
    // 走らなくても、ここに溜めた本文をそのまま確定できるよう保持する。
    let lastVisible = '';
    try {
      const { body, refs, memoCount, evidence } = await streamMyBookBrain({
        userId: user.id,
        question: q,
        bookIds: askBookIds,
        mode: askMode,
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
          : (wasAborted ? STOPPED_EMPTY : body);
      // 「（参照: 10/43 件、内訳: …）」の内部向けの注記は答えに付けない（2026-09-27）。
      const base = finalBody;
      // 中止した場合は末尾に控えめな注記を付ける (refs は付けない)。
      // 1 文字も出る前に止めたときは、注記を重ねない（「中止しました」を 2 回出さない）。
      const assistantContent = wasAborted && finalBody !== STOPPED_EMPTY ? `${base}\n\n— ここで中止しました` : base;
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
        track(EVENTS.AI_USED, { feature: 'brain', mode: askMode });
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
      // 答えが返らない理由が上限・お試し終了なら、質問だけの履歴を残さない（過去の相談に空の相談が並ばないように）。
      if ((e?.paywall || e?.monthlyLimit) && savedUserId) {
        supabase.from('chat_messages').delete().eq('id', savedUserId).eq('user_id', user.id).then(() => {}, () => {});
      }
      // 失敗は答えの吹き出しに「もう一度」つきで出す（SPEC §3）。トーストを重ねない。
      if (!(controller.signal.aborted || (e && e.name === 'AbortError') || e?.paywall || e?.monthlyLimit)) {
        console.warn('consult failed:', toMessage(e, '回答の生成に失敗しました。'));
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
                  ? (e.message || '今月のトークンは、ここまでです。')
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
      myBackground.done = true;
      myBackground.finishedAt = Date.now();
      finishBackground();
      setStage(null);
      setBusy(false);
      setAborting(false);
      refreshTokens(); // 残りのトークンを取り直す（数えるのはサーバー）
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
    // 境界は「保存済みの最新メッセージの時刻（サーバー時刻）」。端末の時計を使うと、
    // 時計が進んでいる端末で次の質問と答えが会話から消えていた。
    const saved = messages.filter((m) => m.createdAt && !/^(err|streaming|bg-wait)-/.test(String(m.id)));
    const now = saved.length > 0
      ? saved.reduce((a, m) => (m.createdAt > a ? m.createdAt : a), saved[0].createdAt)
      : new Date().toISOString();
    setClearedAt(now);
    rememberSession(user?.id, { clearedAt: now });
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
        await ask(q, { skipUserInsert: true, questionAt: messages[i].createdAt });
        return;
      }
    }
  };

  // 📚 本ごとの答えの「この本にくわしく聞く」: 相談相手をその 1 冊に絞り、同じ相談を
  // その本の視点で聞き直す（答え方は「まとめて」＝1 冊の本の答え）。
  const askAboutBook = (bookId, title, question) => {
    if (!bookId || busy) return;
    const q0 = String(question || '').replace(/\s+/g, ' ').trim();
    const base = q0.length > 50 ? `${q0.slice(0, 50)}…` : q0;
    const q = base ? `「${base}」について、『${title}』の視点でくわしく教えて` : `『${title}』の視点で、くわしく教えて`;
    setView('chat');
    setScopeIds([bookId]);
    track('brain_perbook_drill', {});
    ask(q, { bookIds: [bookId], mode: 'fused' });
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

  // 過去の相談: 相談（user）とそれに続く答えを 1 組にして、新しい組から並べる。
  const historyGroups = useMemo(() => {
    const groups = [];
    messages.forEach((m) => {
      if (m.role === 'user' || groups.length === 0) groups.push([m]);
      else groups[groups.length - 1].push(m);
    });
    return groups.reverse();
  }, [messages]);
  const knowledgeTotal = memoStats.cards + memoStats.summaries + memoStats.personal;
  // 空の画面の出し分けはメモ（カード式＋学び）の件数で決める（SPEC §3）。読書計画やまとめだけの人も
  // 「これまで読んだ本から始める」へ（相談例の「最近のメモから…」が空振りしないように）。
  const ownMemoTotal = memoStats.cards + memoStats.personal;
  // 答え方（まとめて / 本ごとに）は、並べる本が無い 1 冊のときと、メモがまだ無いとき（答える材料が無い）は出さない。
  const modeApplies = scopeIds.length !== 1 && ownMemoTotal > 0;
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
  const [historyMenu, setHistoryMenu] = useState(null); // 過去の相談の「…」{ x, y }
  const viewTitle = { learning: '学びを書く', history: '過去の相談', knowledge: '根拠にできる情報' }[view];
  // 中身を下へ送ったか（上部の行の下に線を出す）。画面を切り替えたら戻す。
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { setScrolled(false); }, [view]);
  const onBodyScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    if (view === 'chat') rememberSession(user?.id, { scrollTop: top });
    const s = top > 0;
    if (s !== scrolled) setScrolled(s);
  };
  // 戻ってきたときは、会話を読んでいた位置から続ける。
  const resumedScrollRef = useRef(resumed?.scrollTop || 0);
  useEffect(() => {
    const top = resumedScrollRef.current;
    const el = chatScrollRef.current;
    if (top > 0 && el) el.scrollTop = top;
  }, []);

  return (
    <div style={wrap}>
      {/* 上部は 1 行だけ（SPEC §3: 二重タブをやめる）。会話のときは「何を根拠に答えるか」＋
          履歴（時計）＋その他（…）。会話以外の画面では「‹ 相談」で戻る。 */}
      {/* 残りのトークンの行で上部が 2 行になるので、下に線を引いて「下に潜っている」ことを示す */}
      {/* 会話・一覧を下へ送ったときも、上部の行との境目に線を引く（iOS のナビゲーションバーと同じ）。
          押し込まれた画面では親が全体の見出しを隠すので、この行が画面の最上部になる（ノッチを避ける）。 */}
      <div
        style={{
          ...topRow,
          ...((view === 'chat' && tokensRemaining != null) || scrolled ? { borderBottom: '1px solid var(--separator)' } : null),
          ...(isPushed && onPushedViewChange ? { paddingTop: 'max(var(--space-1), env(safe-area-inset-top, 0px))', minHeight: 'calc(52px + env(safe-area-inset-top, 0px))' } : null),
        }}
      >
        {view === 'chat' ? (
          <>
            <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'auto-phrase' }}>
              {scopeIds.length > 0
                ? (scopeMemoCount === 0
                  // メモが無いことは会話の場所で大きく伝えるので、上の行は相談相手の名前だけ（同じ文を 2 回出さない）。
                  ? (scopeIds.length === 1
                    ? <>『{(books.find((b) => b.id === scopeIds[0]) || {}).title || 'この本'}』に相談します</>
                    : <>選んだ <span style={{ whiteSpace: 'nowrap' }}>{scopeIds.length} 冊</span>に相談します</>)
                  : scopeMemoCount != null
                  ? (scopeIds.length === 1
                    ? <>『{(books.find((b) => b.id === scopeIds[0]) || {}).title || 'この本'}』の<span style={{ whiteSpace: 'nowrap' }}>メモ {scopeMemoCount} 件</span>から答えます</>
                    : <>選んだ <span style={{ whiteSpace: 'nowrap' }}>{scopeIds.length} 冊</span>の<span style={{ whiteSpace: 'nowrap' }}>メモ {scopeMemoCount} 件</span>から答えます</>)
                  : '選んだ本のメモから答えます')
                // 件数は「根拠にできる情報」の一覧と同じもの（メモ・学び・まとめ・読書計画＝AI に渡す材料すべて）。
                // メモ（カード式＋学び）が 0 件のときは件数を出さない（下の「まだメモがありません」と食い違わないように）。
                : (knowledgeTotal > 0 && ownMemoTotal > 0 ? <><span style={{ whiteSpace: 'nowrap' }}>メモ・学びなど</span> <span style={{ whiteSpace: 'nowrap' }}>{knowledgeTotal} 件</span>から答えます</> : '読んだ本のメモを根拠に答えます')}
              {/* 残りのトークン（無料・有料は今月・無料期間は期間まるごと）。管理者・読めないときは出さない。 */}
              {tokensRemaining != null && (
                <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
                  {plan === 'trial' ? '無料期間' : '今月'}の残り <span style={{ whiteSpace: 'nowrap' }}>{tokensRemaining}{purchasedTokens > 0 ? <> ＋追加 {purchasedTokens}</> : null} トークン</span>
                </span>
              )}
              {/* 上限に達したときの「◯月1日から」は、答えの吹き出しと入力欄に出す（同じ日付を 3 回並べない）。 */}
            </p>
            <button type="button" style={iconBtn} onClick={() => setView('history')} aria-label="過去の相談を見る" title="過去の相談">
              <History size={22} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              style={{ ...iconBtn, marginRight: 'calc(-1 * var(--space-3))' }}
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
              {/* シェブロンの見た目の左端を余白 16 に揃える（アイコンの内側の空きの分だけ左へ戻す）。 */}
              <button type="button" onClick={() => setView('chat')} style={{ ...uiBtnText, fontSize: 'var(--text-body)', fontWeight: 400, padding: 'var(--space-2) 0', marginLeft: 'calc(-1 * var(--space-2))', gap: 0, lineHeight: 1.3 }}>
                <ChevronLeft size={20} aria-hidden="true" />相談
              </button>
            </div>
            <h2 style={{ flex: 1, minWidth: 0, margin: 0, textAlign: 'center', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{viewTitle}</h2>
            {/* 左の戻ると同じ幅で、題名を画面中央に。過去の相談だけ、右端に「…」（すべて削除はこの中＝一番目立つ場所に赤を置かない）。 */}
            {view === 'history' && messages.length > 0 ? (
              <div style={{ width: 96, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  style={{ ...iconBtn, marginRight: 'calc(-1 * var(--space-3))' }}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHistoryMenu({ x: r.right - 8, y: r.bottom + 4 }); }}
                  aria-label="過去の相談の操作"
                  aria-haspopup="menu"
                >
                  <MoreHorizontal size={22} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div style={{ width: 96, flexShrink: 0 }} aria-hidden="true" />
            )}
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
      {historyMenu && (
        <ContextMenu
          x={historyMenu.x}
          y={historyMenu.y}
          onClose={() => setHistoryMenu(null)}
          items={[
            { label: 'すべて削除', icon: <Trash2 size={16} aria-hidden="true" />, destructive: true, onClick: clearHistory },
          ]}
        />
      )}


      {/* 学びを書く（本以外の学びログ） */}
      {view === 'learning' && (
        <div style={viewScroll} onScroll={onBodyScroll}>
          <LearningInline
            onCancel={() => setView('chat')}
            onSaved={() => { setView('chat'); setStatsTick((t) => t + 1); }}
          />
        </div>
      )}

      {/* 過去の相談 */}
      {view === 'history' && (
        <div style={viewScroll} onScroll={onBodyScroll}>
        <PullToRefresh onRefresh={fetchHistory}>
          {/* 履歴は静的な過去ログなので live region にはしない（mount 時の過剰読み上げを避ける）。 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} role="region" aria-label="過去の相談">
            {messages.length > 0 && (
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{messages.filter((m) => m.role === 'user').length} 件の相談</p>
            )}
            {/* 「N 件の相談」の行の形も一緒に待つ（読み込み後に一覧が下へ跳ねないように）。 */}
            {!historyLoaded && messages.length === 0 && <SkeletonBlock width={72} height={20} radius="var(--radius)" />}
            {!historyLoaded && <HistorySkeleton />}
            {historyLoaded && historyError && (
              <ErrorMessage
                title="過去の相談を読み込めませんでした"
                description="通信の状態を確かめて、もう一度お試しください。"
                actions={[{ label: 'もう一度', onClick: () => { setHistoryError(false); setHistoryLoaded(false); fetchHistory(); } }]}
              />
            )}
            {/* 戻るは上の「‹ 相談」だけ（同じ操作のボタンを 2 か所に出さない）。 */}
            {historyLoaded && !historyError && messages.length === 0 && (
              <EmptyState
                icon={<MessageCircle size={32} strokeWidth={1.5} aria-hidden="true" />}
                title="まだ相談していません"
              />
            )}
            {/* 新しい相談から上に並べる（開いてすぐ最近の相談が見える）。相談とその答えは 1 組のまま。 */}
            {historyGroups.map((g) => (
              <div key={g[0].id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                {g.map((m) => (
                  <ChatMessage key={m.id} message={m} showTime onOpenBook={onOpenBook} books={books} onAddAction={handleAnswerToAction} onAddActionPickBook={onAddActionPickBook} onRetry={busy ? null : regenerate} question={g[0].role === 'user' ? g[0].content : ''} onAskBook={askAboutBook} askBusy={busy} />
                ))}
              </div>
            ))}
          </div>
        </PullToRefresh>
        </div>
      )}

      {/* 根拠にできる情報（旧: 知識） */}
      {view === 'knowledge' && (
        <div style={viewScroll} onScroll={onBodyScroll}>
          <KnowledgeManager onChanged={() => setStatsTick((t) => t + 1)} onBooksMutated={onBooksMutated} onWriteMemo={() => setView('learning')} />
        </div>
      )}

      {/* 会話 — chat-scroll + 入力欄（LINE 風）。画面の主役は最新の相談（古いものは履歴へ）。 */}
      {view === 'chat' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            ref={chatScrollRef}
            className="chat-scroll"
            onScroll={onBodyScroll}
            // 上部の行の下は、空の画面で 24・会話があるときは 16。
            style={{ padding: `${isEmpty ? 'var(--space-6)' : 'var(--space-4)'} var(--space-4) var(--space-4)` }}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="相談の会話"
            aria-busy={busy}
          >
          {isEmpty && historyLoaded && memoStatsLoaded && (
            scopeIds.length > 0 && scopeMemoCount === 0 ? (
              // 相談相手に絞った本にメモが無い（SPEC §3）: 空振りさせず、すべての本へ戻す道だけを出す。
              <section aria-labelledby="brain-scope-empty-title">
                <h2 id="brain-scope-empty-title" style={{ ...headingStyle, marginBottom: 'var(--space-2)' }}>
                  {scopeIds.length === 1 ? 'この本にはまだメモがありません' : '選んだ本にはまだメモがありません'}
                </h2>
                <button type="button" onClick={() => setScopeIds([])} style={{ ...uiBtnText, fontSize: 'var(--text-sub)', padding: 'var(--space-2) 0' }}>
                  すべての本に相談する
                </button>
              </section>
            ) : ownMemoTotal === 0 ? (
              // メモ（カード式＋学び）0 件: 質問させる前に「これまで読んだ本から始める」（根拠が無いと空振りするため）。
              // 読書計画・まとめだけの人もここ（上の行の件数とは別に、メモの件数で決める・SPEC §3）。
              <section style={cardStyle} aria-labelledby="brain-start-title">
                <h2 id="brain-start-title" style={{ ...headingStyle, marginBottom: 'var(--space-4)' }}>まだメモがありません</h2>
                {onQuickstart ? (
                  <button type="button" onClick={onQuickstart} style={uiBtnPrimary}>これまで読んだ本から始める</button>
                ) : onGoBookshelf ? (
                  <button type="button" onClick={onGoBookshelf} style={uiBtnGhost}>本を開いてメモを書く</button>
                ) : null}
              </section>
            ) : planOut ? (
              // 🪙➕ プランの人がトークンを使い切った（SPEC §3）: 押せない相談例は出さず、案内カードを一番上に。
              <TokensOutCard plan={plan} trialEndLabel={trialEndLabel} tokenAllowance={tokenAllowance} onAdd={openTokenSheet} />
            ) : (
              <section aria-labelledby="brain-empty-title">
                <h2 id="brain-empty-title" style={{ ...headingStyle, marginBottom: 'var(--space-6)' }}>困っていることを、相談してください</h2>
                <p style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>たとえば</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {examples.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => { if (!busy && !outOfTokens) ask(q); }}
                      disabled={busy || outOfTokens}
                      style={busy || outOfTokens ? { ...chipStyle, color: 'var(--text-2)', opacity: 1, cursor: 'default' } : chipStyle}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            )
          )}

          {/* 読み込み中は空の画面と同じ形（見出し → 「たとえば」 → 相談例のチップ 3 つ）で待つ（出来上がりで形が跳ねないように）。 */}
          {(!historyLoaded || (isEmpty && !memoStatsLoaded && !!user && isSupabaseConfigured)) && (
            <div role="status" aria-label="読み込み中">
              <SkeletonBlock width="70%" height={26} radius="var(--radius)" style={{ marginBottom: 'var(--space-6)' }} />
              <SkeletonBlock width={64} height={18} radius="var(--radius)" style={{ marginBottom: 'var(--space-2)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {[0, 1, 2].map((i) => <SkeletonBlock key={i} width="100%" height={69} radius="var(--radius)" />)}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {visibleMessages.map((m, i) => (
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
                question={m.role === 'assistant' ? precedingQuestion(visibleMessages, i) : ''}
                onAskBook={askAboutBook}
                askBusy={busy}
              />
            ))}
          </div>

          {/* 無料プランで今月のトークンを使い切ったら、答えの下（まだ話していなければ例の下）で静かに案内
              （読み終えるまで画面を奪わない） */}
          {freeUsedUp && !busy && (lastIsAssistant || isEmpty) && (
            <section
              aria-label="今月のトークンは、ここまで"
              style={{ marginTop: 'var(--space-6)', padding: 'var(--space-4)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}
            >
              <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
                今月のトークンは、ここまでです
              </p>
              <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>
                <span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}</span>に <span style={{ whiteSpace: 'nowrap' }}>{tokenAllowance} トークン</span>に戻ります
              </p>
              <button type="button" onClick={() => openPaywall('free_used')} style={{ ...uiBtnPrimary, marginTop: 'var(--space-3)' }}>
                プランを見る
              </button>
            </section>
          )}
          {/* 🪙➕ プランの人がトークンを使い切ったら「トークンを追加」（答えの欄に案内が出ているのでボタンだけ。
              まだ話していないときの案内カードは、相談例の代わりに一番上に出す＝上の TokensOutCard） */}
          {planOut && !busy && lastIsAssistant && !isEmpty && (
            <button type="button" onClick={openTokenSheet} style={{ ...uiBtnPrimary, marginTop: 'var(--space-4)' }}>
              トークンを追加
            </button>
          )}

          {lastIsAssistant && !busy && visibleMessages.some((m) => m.role === 'user') && (
            // 答えのカード → 文字ボタンの文字まで約 20（8 ＋ 押せる範囲 44 の上の空き）。文字の左端は余白 16 に揃える。
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
              {/* 無料のトークンを使い切ったら、できない操作を出さない */}
              {/* 失敗した答えには吹き出しの「もう一度」があるので、ここでは出さない */}
              {!freeUsedUp && !visibleMessages[visibleMessages.length - 1]?.notice && !visibleMessages[visibleMessages.length - 1]?.error && (
                <button type="button" onClick={regenerate} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>
                  {visibleMessages[visibleMessages.length - 1]?.content === STOPPED_EMPTY ? 'もう一度答えて' : '別の角度で答えて'}
                </button>
              )}
              {/* 文字ボタンは 1 種類（DESIGN §5）。脇役は並び順（2 番目）で控えめにする。 */}
              <button type="button" onClick={handleResolveAndClear} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>
                新しい相談をはじめる
              </button>
            </div>
          )}
          <div ref={messagesEndRef} />
          {/* AI 免責注記（App Store 審査ガイドライン対応 + 誠実な期待値設定）。固定表示にすると
              会話の面積を削るので、会話の流れの最後（空の画面・答えの下）に置く。 */}
          {historyLoaded && !busy && (isEmpty ? (memoStatsLoaded && ownMemoTotal > 0 && !planOut && !(scopeIds.length > 0 && scopeMemoCount === 0)) : (lastIsAssistant && !visibleMessages[visibleMessages.length - 1]?.notice && !visibleMessages[visibleMessages.length - 1]?.error)) && (
            <p style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', margin: 'var(--space-6) 0 0', lineHeight: 1.5 }}>
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
            mode={modeApplies ? answerMode : null}
            onOpenMode={() => setModeSheetOpen(true)}
          />
          {modeSheetOpen && (
            <AnswerModeSheet
              value={answerMode}
              onClose={() => setModeSheetOpen(false)}
              onSelect={(id) => { setAnswerMode(id); setModeSheetOpen(false); track('brain_answer_mode', { mode: id }); }}
            />
          )}
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
                  if (!outOfTokens) ask();
                }
              }}
              placeholder={outOfTokens
                ? (plan === 'trial'
                  ? (trialEndLabel ? `${trialEndLabel}から相談できます` : '無料期間のトークンは、ここまでです')
                  : `${nextResetLabelJa()}から相談できます`)
                : freeUsedUp ? `${nextResetLabelJa()}にまた相談できます` : '例：上司への報告がうまくいかない'}
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
                // 今月の上限に達したら送れない（押せない主ボタンの見た目＝--fill の面・DESIGN §5）。
                disabled={!input.trim() || outOfTokens}
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

// 🪙➕ プランの人（有料・無料期間）がトークンを使い切って、まだ話していないときの案内カード。
// 押せない相談例の代わりに、会話の場所の一番上に置く（SPEC §3）。
function TokensOutCard({ plan, trialEndLabel, tokenAllowance, onAdd }) {
  const sub = { margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 };
  return (
    <section aria-label="トークンは、ここまで" style={cardStyle}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
        {plan === 'trial' ? '無料期間のトークンは、ここまでです' : '今月のトークンは、ここまでです'}
      </p>
      {plan !== 'trial' ? (
        <p style={sub}>
          <span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}</span>に <span style={{ whiteSpace: 'nowrap' }}>{tokenAllowance} トークン</span>に戻ります
        </p>
      ) : trialEndLabel ? (
        <p style={sub}>
          無料期間が終わる<span style={{ whiteSpace: 'nowrap' }}>{trialEndLabel}</span>から、<span style={{ whiteSpace: 'nowrap' }}>毎月 {PAID_TOKENS} トークン使えます。</span>
        </p>
      ) : null}
      <button type="button" onClick={onAdd} style={{ ...uiBtnPrimary, marginTop: 'var(--space-3)' }}>
        トークンを追加
      </button>
    </section>
  );
}

// 過去の相談を読み込むあいだの形（相談の吹き出し＋答えのカードを 2 組）。
function HistorySkeleton() {
  return (
    <div role="status" aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <SkeletonBlock width="70%" height={56} radius="var(--radius)" style={{ alignSelf: 'flex-end' }} />
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SkeletonBlock width="92%" height={16} radius="var(--radius)" />
            <SkeletonBlock width="80%" height={16} radius="var(--radius)" />
            <SkeletonBlock width="56%" height={16} radius="var(--radius)" />
          </div>
        </div>
      ))}
    </div>
  );
}

const STAGE_LABEL = {
  search: 'メモを探しています…',
  generate: '答えを書いています…',
};

// 『』「」の前後に AI が入れがちな空白（「と 『本』 p.95」）を詰める。改行は残す。
// ページの書き方は画面と同じ「p.95」に揃える（以前の答え・履歴に残る「P.95」も）。
function tidyQuotes(text) {
  return String(text || '')
    .replace(/[ \u3000]+([『「])/g, '$1')
    .replace(/([』」])[ \u3000]+/g, '$1')
    .replace(/(^|[^A-Za-z])P\.\s?(\d)/g, '$1p.$2');
}

// **bold** の軽量インラインパーサ。
function renderBoldInline(raw) {
  const text = tidyQuotes(raw);
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

// 以前の答え（履歴）の末尾に付いていた内部向けの注記「（参照: 10/43 件、内訳: …）」。
const REF_NOTE_RE = /^（参照:[^）]*）$/;

// 見出し（【】）の無い回答（旧形式・エラー文など）はそのまま段落で。
function PlainAnswer({ text }) {
  return (
    <>
      {(text || '').split('\n').filter((l) => l.trim() && !REF_NOTE_RE.test(l.trim())).map((line, idx) => {
        // Markdown の見出し記号・箇条書き記号をそのまま見せない（「- 『…』」→「・『…』」）
        const shown = line.replace(/^【(.+?)】\s*/, '$1：').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*]\s+/, '・');
        // 「・」で始まる行はぶら下げ（折り返した 2 行目を「・」の後ろの文字の頭に揃える）。
        const bullet = /^\s*・/.test(shown);
        return (
          <p key={idx} style={{ margin: idx ? 'var(--space-2) 0 0' : 0, ...(bullet ? { paddingLeft: '1em', textIndent: '-1em' } : null) }}>
            {renderBoldInline(bullet ? shown.trimStart() : shown)}
          </p>
        );
      })}
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
      // 以前の答えに付いていた内部向けの「（参照: 10/43 件、内訳: …）」は見せない（2026-09-27）。
      if (REF_NOTE_RE.test(t)) return false;
      if (/^—\s/.test(t)) { notes.push(t.replace(/^—\s*/, '')); return false; }
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
        : /本ごと/.test(name) ? 'books'
        : /(共通点|違い)/.test(name) ? 'compare'
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
  // 📚 答え方「本ごとに」（【本ごとの視点】があるときだけ books を返す。無ければ null＝いつもの答え）
  const bookViews = sections.books ? parseBookViews(join('books')) : null;
  return {
    conclusion,
    refs: join('refs'),
    interp: join('interp'),
    action: (actionHead || '').trim(),
    actionLabel,
    note: [...actionRest.map((t) => t.trim()).filter(Boolean), ...notes].join('\n'),
    books: bookViews ? bookViews.books : null,
    // ◆ の形が崩れて本を 1 冊も取り出せなかったときは、その節をそのまま段落で見せる（捨てない）
    booksRaw: bookViews && bookViews.books.length === 0 ? join('books') : '',
    booksLead: bookViews ? bookViews.lead : '',
    compare: join('compare'),
  };
}

// 【本ごとの視点】の中身を本ごとに分ける。
//   ◆『書名』｜著者
//   視点：…（続く行も視点に足す）
//   根拠：p.25「…」
// 書いている途中（閉じていない『）でも、その時点までの書名で 1 冊として返す。
export function parseBookViews(text) {
  const books = [];
  const lead = [];
  let cur = null;
  let field = 'view';
  const add = (a, b) => (a ? `${a}\n${b}` : b);
  String(text || '').split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const h = line.match(/^(?:[-*・]\s*)?[◆◇■]\s*(.*)$/);
    if (h) {
      const rest = h[1].trim();
      let title = '';
      let author = '';
      const closed = rest.match(/^『([^』]*)』(.*)$/);
      if (closed) { title = closed[1]; author = closed[2]; }
      else if (rest.startsWith('『')) title = rest.slice(1);
      else { const [t, ...a] = rest.split(/[｜|]/); title = t; author = a.join(' '); }
      author = author.replace(/^[\s｜|／/:：・\-—（(]+/, '').replace(/[)）]\s*$/, '').trim();
      cur = { title: title.replace(/\*\*/g, '').trim(), author, view: '', basis: '', page: null };
      books.push(cur);
      field = 'view';
      return;
    }
    if (!cur) { lead.push(line); return; }
    const f = line.match(/^(?:[-*・]\s*)?(?:\*\*)?(視点|根拠|引用)(?:\*\*)?\s*[：:]\s*(.*)$/);
    if (f) {
      field = f[1] === '視点' ? 'view' : 'basis';
      if (f[2]) cur[field] = add(cur[field], f[2]);
      return;
    }
    cur[field] = add(cur[field], line);
  });
  const out = books.filter((b) => b.title || b.view);
  out.forEach((b) => {
    // 視点の書き出しの「『書名』の視点では、」は見出しの繰り返しなので外す。
    b.view = stripViewLead(b.view, b.title);
    const pm = b.basis.match(/(?:^|[^A-Za-z])[pP]\.?\s*(\d+)/);
    b.page = pm ? Number(pm[1]) : null;
  });
  return { books: out, lead: lead.join('\n') };
}

// 「『書名』の視点では、」「『書名』では、」など、見出しと同じ書名で始まる書き出しを外す。
function stripViewLead(view, title) {
  const v = String(view || '');
  const t = String(title || '').trim();
  if (!t || !v.startsWith(`『${t}』`)) return v;
  const rest = v.slice(t.length + 2);
  const m = rest.match(/^(?:の視点(?:では|から(?:見ると|は)?|で)?|では|からは|から見ると)[、,，]\s*/);
  return m ? rest.slice(m[0].length) : v;
}

// 答えの直前の相談（本ごとの答えの「この本にくわしく聞く」で、同じ相談をその本に聞き直すため）。
function precedingQuestion(list, idx) {
  for (let j = idx - 1; j >= 0; j -= 1) if (list[j].role === 'user') return list[j].content || '';
  return '';
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

// 参照 1 件を 2 行に: 1 行目『書名』（長ければ …）、2 行目 著者・ページ（付随情報）。
function RefLines({ r }) {
  const t = tidyQuotes(refText(r));
  const m = t.match(/^(.*?)(『[^』]+』)(.*)$/);
  const title = m ? m[2] : t;
  const meta = m ? [m[1], m[3]].map((x) => x.trim()).filter(Boolean) : [];
  return (
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 『 はぶら下げる（かぎ括弧の空きの分だけ左へ出して、文字の端を揃える）。 */}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(title.startsWith('『') ? { marginLeft: '-0.5em' } : null) }}>{title}</span>
      {meta.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontWeight: 400 }}>
          {meta.map((x, i) => <span key={i}>{x}</span>)}
        </span>
      )}
    </span>
  );
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

// 📚 本ごとの答えの 1 冊分（DESIGN §5 カード）。見出し『書名』17/600 → 著者 13/--text-2 →
// 視点（読む文章＝明朝 18）→ 根拠 13/--text-2（p.N「メモの一節」）→ 文字ボタン「この本にくわしく聞く」。
function PerBookCard({ book, streaming, onAsk, askBusy }) {
  const cursor = streaming ? <span className="streaming-cursor" aria-hidden="true" /> : null;
  const basis = tidyQuotes(String(book.basis || '').replace(/\*\*/g, ''));
  return (
    <article aria-label={`『${book.title}』の視点`} style={cardStyle}>
      {/* 『 はぶら下げる（1 行目だけ。折り返した行はカードの余白 16 に揃う）。 */}
      <h4 style={{ margin: 0, textIndent: '-0.5em', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'auto-phrase' }}>『{book.title}』</h4>
      {book.author && (
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{book.author}</p>
      )}
      {book.view && (
        <div style={{ ...readText, marginTop: 'var(--space-3)' }}>
          {book.view.split('\n').filter((l) => l.trim()).map((l, i, arr) => (
            <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0 }}>{renderBoldInline(l)}{!basis && i === arr.length - 1 && cursor}</p>
          ))}
        </div>
      )}
      {basis && (
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{basis}{cursor}</p>
      )}
      {!book.view && !basis && cursor}
      {onAsk && (
        // 文字の端をカードの内側の余白（16）にそろえる（btnLink の左右 4 を負の余白で打ち消す）。
        <button
          type="button"
          onClick={onAsk}
          disabled={askBusy}
          style={{ ...uiBtnLink, margin: 'var(--space-2) 0 calc(-1 * var(--space-2)) calc(-1 * var(--space-1))', ...(askBusy ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}
        >
          この本にくわしく聞く
        </button>
      )}
    </article>
  );
}

function ChatMessage({ message, onOpenBook, stage, books, onAddAction, onAddActionPickBook, onRetry, onWriteLearning, showTime = false, question = '', onAskBook = null, askBusy = false }) {
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

  // 日時は相談（user）の吹き出しにだけ出す（答えの下に同じ時刻を重ねない）。
  const time = showTime && isUser && !isStreaming && message.createdAt ? (
    // 相談の吹き出し（--fill の面）の上では --text-2（--text-3 は --fill の上で 4.5:1 に届かない・DESIGN §6）。
    <p style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: isUser ? 'var(--text-2)' : 'var(--text-3)', lineHeight: 1.5, margin: 'var(--space-2) 0 0' }}>{fmtDate(message.createdAt)}</p>
  ) : null;

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} role="article" aria-label="あなたの相談">
        <div className="text-pretty" style={{ maxWidth: '85%', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'auto-phrase', overflowWrap: 'break-word' }}>
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
  // 📚 本ごとの答え。書いている途中も同じ形で見せる（出来上がりで形が跳ねないように）。
  //   ただし「本ごとに」で送っても、並べる本が足りずに「まとめて」で答えたとき（参照・解釈の節がある）は、いつもの形。
  const live = isStreaming && hasBody && message.mode === 'perbook' ? parseAnswer(message.content) : null;
  const perBook = parsed && Array.isArray(parsed.books)
    ? parsed
    : (live && !live.refs && !live.interp ? live : null);
  const cursor = <span className="streaming-cursor" aria-hidden="true" />;
  const perBookTail = !isStreaming || !perBook ? null
    : perBook.action ? 'action' : perBook.compare ? 'compare' : perBook.books?.length ? 'book' : 'conclusion';

  // 明日からできる一歩（＋ 行動に追加）
  const renderAction = (p, marginTop) => (p.action ? (
    <div style={{ marginTop, background: 'var(--fill)', borderRadius: 'var(--radius)', padding: 'var(--space-3) var(--space-4)' }}>
      <p style={subLabel}>{p.actionLabel}</p>
      <p style={{ ...readText, margin: 0, whiteSpace: 'pre-wrap' }}>{renderBoldInline(p.action)}{perBookTail === 'action' && cursor}</p>
      {canShowAction && (
        actionAdded ? (
          <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)' }}>
            <Check size={16} aria-hidden="true" />行動に追加しました
          </p>
        ) : (
          <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)', ...(actionBusy ? { color: 'var(--text-3)', borderColor: 'var(--separator)', opacity: 1, cursor: 'default' } : null) }}>
            <Target size={16} aria-hidden="true" />行動に追加
          </button>
        )
      )}
    </div>
  ) : null);
  // 積み重ねが効いていることを、事実だけで一行（盛らない・渡したメモと一致したものだけ）
  const renderEvidence = () => (evidence ? (
    <p style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
      {/* 2 行に折り返しても、アイコンは 1 行目の高さの中央に置く。 */}
      <span style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0 }}>
        <Sprout size={16} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
      </span>
      <span>{evidence}</span>
    </p>
  ) : null);
  // 根拠（参照したメモ・解釈・もとになった本）は畳む
  const renderDetails = (p) => ((p.refs || p.interp || refsList.length > 0) ? (
    <details style={{ marginTop: 'var(--space-3)' }}>
      <summary style={summaryStyle}>
        <span>根拠を見る{nBooks > 0 && !evidence ? `（${nBooks} 冊のメモ）` : ''}</span>
        <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-1)' }}>
        {p.refs && (
          <div>
            <p style={subLabel}>参照したメモ</p>
            <div style={subText}><PlainAnswer text={p.refs} /></div>
          </div>
        )}
        {p.interp && (
          <div>
            <p style={subLabel}>あなたの状況に合わせると</p>
            <div style={subText}><PlainAnswer text={p.interp} /></div>
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
                      <button type="button" onClick={() => onOpenBook(refBookId)} style={refBtn} aria-label={`${refText(r)} を開く`}>
                        <RefLines r={r} />
                        <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      </button>
                    ) : (
                      <div style={{ display: 'flex', minHeight: 44, padding: 'var(--space-2) 0', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 }}><RefLines r={r} /></div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </details>
  ) : null);
  const renderNote = (p) => (p.note ? <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap' }}>{p.note}</p> : null);

  if (perBook) {
    const lastBook = (perBook.books || []).length - 1;
    const hasBooks = (perBook.books || []).length > 0 || !!perBook.booksRaw || !!perBook.booksLead;
    const showFoot = !!(perBook.compare || perBook.action || (!isStreaming && (evidence || refsList.length > 0 || perBook.note)));
    return (
      // 本ごとの答えは、結論のカード → 本のカード（1 冊 1 枚）→ 共通点と違い・一歩・根拠のカード。
      // 外側は枠を付けない（カードの中にカードを入れない）。
      <div role="article" aria-label="相談への答え" aria-busy={isStreaming || undefined} style={{ display: 'flex', flexDirection: 'column', wordBreak: 'break-word' }}>
        <div style={answerCard}>
          <div style={readText}>
            {perBook.conclusion.split('\n').filter((l) => l.trim()).map((l, i, arr) => (
              <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0 }}>{renderBoldInline(l)}{perBookTail === 'conclusion' && i === arr.length - 1 && cursor}</p>
            ))}
          </div>
        </div>
        {hasBooks && (
          <section aria-label="本ごとの視点" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>本ごとの視点</h3>
            {perBook.booksLead && <p style={{ ...readText, margin: '0 0 var(--space-3)' }}>{renderBoldInline(perBook.booksLead)}</p>}
            {perBook.booksRaw ? (
              <div style={answerCard}><div style={readText}><PlainAnswer text={perBook.booksRaw} /></div></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {perBook.books.map((b, i) => {
                  const bookId = !isStreaming && onAskBook && b.title ? resolveRefBookId(`『${b.title}』`, books) : null;
                  return (
                    <PerBookCard
                      key={i}
                      book={b}
                      streaming={perBookTail === 'book' && i === lastBook}
                      onAsk={bookId ? () => onAskBook(bookId, b.title, question) : null}
                      askBusy={askBusy}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
        {showFoot && (
          <div style={{ ...answerCard, marginTop: 'var(--space-6)' }}>
            {perBook.compare && (
              <>
                <p style={subLabel}>共通点と違い</p>
                <div style={readText}>
                  {perBook.compare.split('\n').filter((l) => l.trim()).map((l, i, arr) => (
                    <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0 }}>{renderBoldInline(l)}{perBookTail === 'compare' && i === arr.length - 1 && cursor}</p>
                  ))}
                </div>
              </>
            )}
            {renderAction(perBook, perBook.compare ? 'var(--space-4)' : 0)}
            {!isStreaming && renderEvidence()}
            {!isStreaming && renderDetails(perBook)}
            {!isStreaming && renderNote(perBook)}
          </div>
        )}
        {time}
      </div>
    );
  }

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
          {/* 2. 明日からできる一歩（＋ 行動に追加）→ 使ったメモの一行 → 3. 根拠（畳む） */}
          {renderAction(parsed, 'var(--space-4)')}
          {renderEvidence()}
          {renderDetails(parsed)}
          {renderNote(parsed)}
        </>
      ) : (
        <div style={readText}><PlainAnswer text={message.content} /></div>
      )}
      {/* 旧形式（見出しなし）でも行動化できるように */}
      {!parsed && canShowAction && !message.error && (
        actionAdded ? (
          <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)' }}>
            <Check size={16} aria-hidden="true" />行動に追加しました
          </p>
        ) : (
          <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)' }}>
            <Target size={16} aria-hidden="true" />行動に追加
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

// 入力欄のすぐ上のチップ（見た目 32・押せる範囲 44。DESIGN §5 チップ）。
// 見た目の文字（相談相手：…）がそのまま読み上げ名になる（label-in-name）。
// 押せる範囲 44 は保ったまま、上下のはみ出し（(32-44)/2）を負の余白で打ち消す。
// 既定から変えているとき（絞った相談相手・本ごとに）は --accent-soft の面。
function BarChip({ name, value, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup="dialog"
      // 答えを作っている間も薄くしない（DESIGN §5 押せないボタン）。文字色を 1 段落として示す。
      style={{ minWidth: 0, maxWidth: '100%', minHeight: 44, margin: 'calc((32px - 44px) / 2) 0', display: 'inline-flex', alignItems: 'center', padding: 0, background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', opacity: 1 }}
    >
      <span style={{
        minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', height: 32, padding: '0 var(--space-3)',
        borderRadius: 'var(--radius)', background: active ? 'var(--accent-soft)' : 'var(--fill)', color: disabled ? 'var(--text-2)' : 'var(--text)',
        fontSize: 'var(--text-meta)', fontWeight: 600,
      }}>
        <span style={{ color: 'var(--text-2)', fontWeight: 400, flexShrink: 0 }}>{name}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        <ChevronDown size={16} aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
      </span>
    </button>
  );
}

// 相談相手 ＋ 答え方（2026-09-27）。答え方は相談相手が 1 冊のときは出さない（mode=null・並べる本が無い）。
// 1 行に収めるため、「すべてに戻す」は答え方のチップが無いとき（1 冊に絞ったとき）だけ。
// 数冊に絞ったときは相談相手のシートの「すべての本」から戻す。
function ScopeBar({ label, scoped, onOpen, onReset, disabled, mode = null, onOpenMode }) {
  const showMode = mode != null && !!onOpenMode;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-2)', rowGap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4) 0', flexShrink: 0, minWidth: 0, borderTop: '1px solid var(--separator)' }}>
      <BarChip name="相談相手：" value={label} active={scoped} disabled={disabled} onClick={onOpen} />
      {showMode && (
        <BarChip name="答え方：" value={answerModeLabel(mode)} active={mode === 'perbook'} disabled={disabled} onClick={onOpenMode} />
      )}
      {scoped && !showMode && (
        <button type="button" onClick={onReset} disabled={disabled} style={{ ...uiBtnText, fontSize: 'var(--text-meta)', padding: 0, minHeight: 44, margin: 'calc((32px - 44px) / 2) 0 calc((32px - 44px) / 2) var(--space-1)', flexShrink: 0, ...(disabled ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}>
          すべてに戻す
        </button>
      )}
    </div>
  );
}

// 📚 答え方のシート（まとめて / 本ごとに）。選んだらその場で効く＝右上は「完了」・下の決定ボタンは無し。
// 行の形は相談相手のシートと同じ（選んだ行は右端のチェックだけ）。
function AnswerModeSheet({ value, onClose, onSelect }) {
  const rowStyle = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', minHeight: 56,
    borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    border: '1px solid var(--separator)', background: 'var(--surface)',
  };
  return (
    <BottomSheet title="答え方" onClose={onClose}>
      <div role="radiogroup" aria-label="答え方" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingBottom: 'var(--space-2)' }}>
        {ANSWER_MODES.map((m) => {
          const on = value === m.id;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => onSelect(m.id)} style={rowStyle}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{m.label}</span>
                <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{m.sub}</span>
              </span>
              <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Check size={22} strokeWidth={2} />}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
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
      // 1000 件を超えても本ごとの件数が狂わないよう、ページを分けて全部数える。
      let data = null;
      try {
        ({ data } = await fetchAllRows(() => supabase.from('book_memos').select('id, book_id').eq('user_id', userId).order('id', { ascending: true })));
      } catch { /* 数えられなければ件数なし（本の状態で並べる） */ }
      if (!alive) return;
      const m = new Map();
      (data || []).forEach((r) => { if (r.book_id) m.set(r.book_id, (m.get(r.book_id) || 0) + 1); });
      setCounts(m);
    })();
    return () => { alive = false; };
  }, [userId]);

  const countsLoading = counts == null && !!userId && isSupabaseConfigured;
  const hasKnowledge = (b) => (counts?.get(b.id) || 0) > 0 || !!(b.leverageMemo || '').trim() || !!(b.aiSummary || '').trim();
  const canPick = (b) => counts == null || hasKnowledge(b);
  const list = [...books]
    .filter((b) => b.status === 'reading' || b.status === 'done' || (counts?.get(b.id) || 0) > 0)
    .sort((a, b) => (counts?.get(b.id) || 0) - (counts?.get(a.id) || 0));
  // 選べる本（メモ・まとめのある本）を上に、メモがまだない本はその下にまとめる（「メモがまだありません」を行ごとに繰り返さない）。
  const pickable = list.filter(canPick);
  const notPickable = list.filter((b) => !canPick(b));
  const noneToPick = !countsLoading && pickable.length === 0;

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

  // iOS の一覧の形: 選んだ行は右端のチェックだけで示す（丸いラジオ風の印や色の面は使わない）。
  const rowStyle = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', minHeight: 56,
    borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    border: '1px solid var(--separator)', background: 'var(--surface)',
  };
  const mark = (on) => (
    <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {on && <Check size={22} strokeWidth={2} />}
    </span>
  );

  return (
    <BottomSheet
      title="誰に相談しますか？"
      onClose={onClose}
      dismissLabel="キャンセル"
      footer={(
        <button type="button" onClick={apply} disabled={!canApply} style={canApply ? uiBtnPrimary : uiBtnPrimaryOff}>
          {mode === 'all' ? 'すべての本に相談する' : picked.size === 1 ? 'この本に相談する' : `${picked.size} 冊に相談する`}
        </button>
      )}
    >
      <button type="button" onClick={() => { setMode('all'); setPicked(new Set()); }} aria-pressed={mode === 'all'} style={{ ...rowStyle, marginBottom: 'var(--space-6)' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>すべての本（おすすめ）</span>
        {mark(mode === 'all')}
      </button>
      <p style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>{noneToPick ? '本に絞る' : '本に絞る（複数選べます）'}</p>
      {/* 件数を数え終わるまでは行の形だけ（あとで並び替わって跳ねないように）。 */}
      {countsLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} height={56} radius="var(--radius)" />)}
        </div>
      )}
      {/* 選べる本が 1 冊も無い: 行を並べず 1 行だけ（選べない行を並べても押せないので）。 */}
      {noneToPick && (
        <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>メモのある本はまだありません</p>
      )}
      {!noneToPick && !countsLoading && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {pickable.map((b) => {
              const on = mode === 'pick' && picked.has(b.id);
              const n = counts?.get(b.id) || 0;
              return (
                <button key={b.id} type="button" onClick={() => toggle(b.id)} aria-pressed={on} style={rowStyle}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                    {counts != null && (
                      <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{n > 0 ? `メモ ${n} 件` : 'まとめメモあり'}</span>
                    )}
                  </span>
                  {mark(on)}
                </button>
              );
            })}
          </div>
          {/* メモがまだない本は、見出し 1 つの下にまとめて（押せない・文字色を落とす。薄くはしない）。 */}
          {notPickable.length > 0 && (
            <>
              <p style={{ ...groupTitle, margin: 'var(--space-6) 0 var(--space-2)' }}>メモがまだない本</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {notPickable.map((b) => (
                  <button key={b.id} type="button" disabled aria-disabled="true" style={{ ...rowStyle, opacity: 1, cursor: 'default' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text-3)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}
