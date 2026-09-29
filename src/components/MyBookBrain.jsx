// 💬 相談（旧称「マイ読書脳」・コード識別子は MyBookBrain のまま）— 自分のメモを根拠に答える AI。
//
// SPEC §3: 画面の中は会話だけ。上部は 1 行（何を根拠に答えるか＋履歴の時計＋「…」）。
//   会話（既定）/ 過去の相談（時計）/ 学びを書く・根拠にできる情報（「…」）
// 答えは「結論 → 明日からできる一歩（行動に追加）→ 根拠を見る（畳む）」の順に組み替えて見せる。
//
// chat_messages live in Supabase; book_memos with source_type='personal'
// are written for personal learnings and surface in the Review tab too.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { markActivation } from '../lib/activation';
import { supabase, isSupabaseConfigured, isDemo, demoScenario } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAllActions } from '../hooks/useAllActions';
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
import TightBubble, { withPhraseBreaks } from './TightBubble';
import { SkeletonBlock } from './Skeleton';
import { X, MessageCircle, History, BookOpenCheck, Target, Check, RotateCw, MoreHorizontal, ChevronLeft, ChevronDown, ChevronRight, PencilLine, ArrowUp, Square, Plus, Minus, Sprout, Trash2 } from 'lucide-react';
import ContextMenu from './ContextMenu';
import { usePaywall } from '../state/PaywallContext';
import { nextResetLabelJa } from '../lib/freeTrial';
import { PAID_TOKENS, TOKEN_COSTS, monthDayLabelJa } from '../lib/tokens';
import { shouldShowTrialNudge, trialNudgeCopy, isTrialNudgeDone, markTrialNudgeDone, normalizeTrialLabel } from '../lib/trialNudge';
import { getIntroOffer } from '../lib/iap';
import { buildConsultExamples, standaloneAction, shortTitle, hasSummaryMemo, countSummaryMemos, fmtTokens, consultsLeft, memoSearchQuery } from '../lib/consultHelpers';
import { QUOTE_PREFIX, decodeQuoteRefs, stripQuotes } from '../lib/evidenceCheck';
import NotifyOptInCard from './NotifyOptInCard';

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
const chipStyle = { display: 'block', width: '100%', minHeight: 44, padding: 'var(--space-3)', textAlign: 'left', wordBreak: 'keep-all', overflowWrap: 'anywhere', background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 };
// 答え＝読むカード（全幅）。ユーザーの相談は右寄せの --fill 吹き出し。
const answerCard = { ...cardStyle, wordBreak: 'break-word' };
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)' };
const rowBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
// 一歩の箱（--fill の面）の中の押せない「行動に追加」（DESIGN §5 押せないボタン）。薄くしない＝opacity 1 で
// 全体の button:disabled{opacity:.4} を打ち消し、文字は --text-2（--fill の上では --text-3 が 4.5:1 に届かない・DESIGN §6）。
const rowBtnOffOnFill = { color: 'var(--text-2)', borderColor: 'var(--separator)', opacity: 1, cursor: 'default' };
// 畳む見出し（DESIGN §5: 高さ 48・17/600/--text・右端にシェブロン 20）。
const summaryStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', minHeight: 48, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none' };
// 書いている間の「根拠を見る」（同じ場所・同じ形で見せ、押せないことは --text-3 で示す）。
// 押したときの縮み（全体の button:active）もさせない。
const evidencePending = { ...summaryStyle, width: '100%', marginTop: 'var(--space-3)', padding: 0, background: 'none', border: 'none', fontFamily: 'inherit', textAlign: 'left', color: 'var(--text-3)', cursor: 'default', opacity: 1, transform: 'none' };
// 明日からできる一歩の箱（書いている途中の形と、でき上がりの形で同じ）。
// 書いている途中の「明日からできる一歩」の本文の高さ（ふつうの一歩の 3 行ぶん）。骨組みと書いている途中の両方で使う。
const STEP_SKELETON_LINES = 3;
const STEP_SKELETON_HEIGHT = `calc(var(--text-read) * 1.6 * ${STEP_SKELETON_LINES})`;
const nextStepBox = { background: 'var(--fill)', borderRadius: 'var(--radius)', padding: 'var(--space-3) var(--space-4)' };
// 根拠の中の小さな見出し（DESIGN §5 groupTitle: 12/600/--text-2）。
const subLabel = { ...groupTitle, margin: '0 0 var(--space-1)' };
// 根拠の本文（参照したメモ・解釈）も答えの一部＝読む文章（明朝 18・行間 1.6・DESIGN §2/§7）。
const subText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', color: 'var(--text)', lineHeight: 1.6 };
const refBtn = { width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44, padding: 'var(--space-2) 0', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 };
// 学びを書くの入力欄は ui.js の input（高さ 48）をそのまま使う。
const inp = uiInput;
// 学びの本文＝読む文章（明朝 18・行間 1.6）。display:block で下の余白のずれ（inline のベースライン分）を消す。
const ta = { ...uiInput, display: 'block', resize: 'none', minHeight: 160, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6 };

// 🌿 答えの下の「前の相談から メモ +N 件」（2026-09-29）。refs の先頭側に目印つきで残す（表を増やさずに履歴にも残す）。
const GROWTH_PREFIX = '🌿 ';
// 🪙 関係するメモが無かったので、サーバーがトークンを返した（streamClaude の orime_token_refund）。答えの下に一行。
const REFUND_PREFIX = '🪙 ';
const REFUND_NOTE = '関係するメモが無かったので、トークンは使っていません';
// 🎯 相談の材料（あなたの歩み）に入れた「最近完了した行動」の件数（2026-09-29）。「根拠を見る」の中に
//   「踏まえたこと: 完了した行動 N 件」と一行。refs に目印つきで残す（履歴から開いても出る）。
const ACTED_PREFIX = '🎯 ';
// refs のうち、AI が挙げた本（📚 📖 💡）ではない、画面用の目印つきの行（使ったメモ・前の相談から・引用の照合）。
const isMetaRef = (r) => {
  const s = String(r || '');
  return s.startsWith(EVIDENCE_PREFIX) || s.startsWith(GROWTH_PREFIX) || s.startsWith(QUOTE_PREFIX) || s.startsWith(REFUND_PREFIX) || s.startsWith(ACTED_PREFIX);
};

// 関係するメモが無かった答え（トークンを返した答え・返金の回数の上限を超えたときは決まり文句で見分ける）。
// この答えには「別の角度で答えて」「行動に追加」を出さず、「本を追加」「学びを書く」へ案内する（2026-09-29）。
// 決まり文句は api/_aiAccess.js の NO_INFO_RE と同じ。
const NO_INFO_TEXT_RE = /情報[がは]\s*まだ\s*(?:ありません|ない)|該当するメモ[がは]\s*(?:ありません|ない|見つかりません)/;
function isNoInfoAnswer(m) {
  if (!m || m.role !== 'assistant' || m.streaming || m.error || m.notice) return false;
  const refs = Array.isArray(m.refs) ? m.refs : [];
  if (refs.some((r) => String(r).startsWith(REFUND_PREFIX))) return true;
  if (refs.some((r) => !isMetaRef(r))) return false; // 本を挙げている答えは、ふつうの答え
  return NO_INFO_TEXT_RE.test(String(m.content || '').slice(0, 200));
}

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
export default function MyBookBrain({ onOpenBook, books = [], onAddAction, onBooksMutated, onAddActionPickBook, onGoBookshelf, onQuickstart, onAddBook, onOpenActions, askPreset, scopePreset, onPushedViewChange, onSearchMemos }) {
  const { user } = useAuth();
  // ⚡ タブを開いた瞬間に知識スキャン（gatherKnowledge）を裏で開始 — 最初の質問時には
  // キャッシュ済みで、RAG 構築の待ち時間（数百ms〜数秒）が消える。
  useEffect(() => { prewarmKnowledge(user?.id); }, [user?.id]);
  const toast = useToast();
  const confirm = useConfirm();
  // 🪙 プランと残りのトークン（src/lib/tokens.js・止めるのはサーバー）。上部に 1 行「今月の残り N トークン」。
  //    無料プラン（相談だけ）で使い切ったら、答えの下で静かに案内＋有料プランの画面へ。
  const { plan, freeMode, trialEndsAt, tokensRemaining, tokenAllowance, purchasedTokens, tokensAvailable, canBuyTokens, openTokenSheet, refreshTokens, openPaywall, hadPlan } = usePaywall();
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
  // 過去の相談の「この相談の続きを聞く」（2026-09-29）: 持ってきた前の相談を会話のいちばん上に出し、
  // 次の相談にだけ文脈として渡す（streamMyBookBrain の prior）。{ id, question, answer, at, used }
  const [carry, setCarry] = useState(() => (resumed?.carry || null));
  useEffect(() => { rememberSession(user?.id, { carry }); }, [carry, user?.id]);
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
  // 絞った本のメモの件数（上部の「〜件から答えます」を相談相手に合わせる）。
  // カード式＋「この本のまとめ」（1 冊 1 件）＝ほかの画面の「メモ N 件」と同じ数え方（lib/consultHelpers.js）。
  const [scopeCardCount, setScopeCardCount] = useState(null);
  useEffect(() => {
    if (!scopeIds.length || !user?.id || !isSupabaseConfigured) { setScopeCardCount(null); return undefined; }
    let alive = true;
    (async () => {
      const { count } = await supabase.from('book_memos').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).in('book_id', scopeIds);
      if (alive) setScopeCardCount(typeof count === 'number' ? count : null);
    })();
    return () => { alive = false; };
  }, [scopeIds, user?.id]);
  const scopeMemoCount = scopeCardCount == null ? null : scopeCardCount + countSummaryMemos(books, scopeIds);
  // 本詳細の「この本に相談する」から来たら、相談相手をその本に絞って質問画面へ。
  useEffect(() => {
    if (!scopePreset?.bookIds || !consumePreset('scope', scopePreset.nonce)) return;
    setScopeIds(scopePreset.bookIds);
    setView('chat');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopePreset?.nonce]);
  const [busy, setBusy] = useState(false);
  // 🔔 はじめて「行動に追加」した答えの id（その下に、思い出しの通知の案内を 1 回だけ出す）
  const [optinAfterId, setOptinAfterId] = useState(null);
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
  // cards＝カード式 / personal＝学び / summaryBooks＝「この本のまとめ」の入っている本（1 冊 1 件）/
  // summaries＝根拠にできる情報の合計（読書準備なども含む・件数の表示には使わない）
  const [memoStats, setMemoStats] = useState({ cards: 0, summaries: 0, personal: 0, summaryBooks: 0 });
  const [memoStatsLoaded, setMemoStatsLoaded] = useState(false);
  // メモの件数を数えられなかった（通信断など）。0 件と取り違えて「まだメモがありません」を出さない。
  const [memoStatsFailed, setMemoStatsFailed] = useState(false);
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
  // 答えを書いている間に、自分で会話を動かしたか（指・ホイール・つまんで動かす）。
  // 動かしたら、書き終わったときの自動の送りをしない（読んでいる場所を奪わない）。次に送るときに戻す。
  const userScrolledRef = useRef(false);
  const sentAtRef = useRef(0);
  // 答えを待つ時間が長いとき（15 秒たっても 1 文字も来ない）に、静かな 1 行を出す（2026-09-29）。
  const [slowWait, setSlowWait] = useState(false);
  const gotTextRef = useRef(false);
  // Auto-grow textarea: 60px min, 200px max, scrolls past 200.
  const inputRef = useRef(null);
  // 描く前に高さを合わせる（useEffect だと、送ったあとに「消えた文字の高さのまま 1 回描く → 縮む」で
  // 入力欄が 2 回動いていた）。
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
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
      // メモの件数（カード式＋学び）は book_memos の全件を 1 回で数え、「この本のまとめ」の入っている本を
      // 1 冊 1 件として足す（ホーム・初日クイックスタート・記録と同じ数え方＝「メモ N 件」を画面をまたいで
      // 同じ数にする・2026-09-29）。
      // （source_type が空の古いメモも数える。neq('source_type', 'personal') だと空の行が落ちていた）
      const [cardsRes, personalRes, booksFieldsRes] = await Promise.all([
        supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
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
      if (cardsRes.error || personalRes.error) {
        setMemoStatsFailed(true);
        return;
      }
      setMemoStatsFailed(false);
      setMemoStats({
        cards: Math.max(0, (cardsRes.count || 0) - (personalRes.count || 0)),
        personal: personalRes.count || 0,
        summaries: summariesCount,
        summaryBooks: booksFieldsRes.error ? 0 : (booksFieldsRes.data || []).filter(hasSummaryMemo).length,
      });
     } catch (e) {
      console.warn('memo stats fetch error:', e?.message || e);
      if (!cancelled) setMemoStatsFailed(true);
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
  // 送ったら、自分の相談の吹き出しを会話欄の上端へ（questionAlignTop）。答えはその下に書かれていくので、
  // 書いている間も見えたまま・書き終わっても動かさずに済む（2026-09-29。以前は送ると最下部へ送り、
  // 書き終わってから上へ戻していた＝2 回動いていた）。
  // 書いている間に自分で会話を動かしたら（userScrolledRef）、自動では送らない。
  useEffect(() => {
    if (!busy || view !== 'chat') return undefined;
    const el = chatScrollRef.current;
    if (!el) return undefined;
    const mark = () => { userScrolledRef.current = true; };
    let startY = null;
    const onPointerDown = (e) => { if (e.pointerType === 'mouse') startY = e.clientY; };
    const onPointerMove = (e) => { if (startY != null && Math.abs(e.clientY - startY) > 4) mark(); };
    const onPointerUp = () => { startY = null; };
    el.addEventListener('touchstart', mark, { passive: true });
    el.addEventListener('wheel', mark, { passive: true });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      el.removeEventListener('touchstart', mark);
      el.removeEventListener('wheel', mark);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [busy, view]);
  // 答えが出来上がったとき: 相談の吹き出しが上端にあれば何もしない（ふつうはもう揃っている）。
  // 相談が短くて上端まで届かなかったときだけ、揃える。自分で動かしていたら何もしない。
  const prevBusyRef = useRef(false);
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (!wasBusy || busy || view !== 'chat') return;
    setTimeout(() => {
      if (userScrolledRef.current) return;
      const el = chatScrollRef.current;
      if (!el) return;
      const top = questionAlignTop(el);
      if (top == null || Math.abs(top - el.scrollTop) < 2) return;
      el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, 60);
  }, [busy, view]);
  // 書いている間: 答えが伸びて相談の吹き出しがまだ上端に届いていなければ、届くところまでついていく
  // （答えの書かれている行が欄の下に隠れないように）。上端に届いたらそこで止まる。
  useEffect(() => {
    if (!busy || view !== 'chat' || userScrolledRef.current) return;
    if (Date.now() - sentAtRef.current < 500) return; // 送った直後のなめらかな送りを邪魔しない
    const el = chatScrollRef.current;
    if (!el) return;
    const top = questionAlignTop(el);
    if (top != null && top > el.scrollTop + 1) el.scrollTop = top;
  }, [messages, busy, view]);
  // 15 秒たっても 1 文字も来なければ、静かな 1 行（止めるボタンは入力欄の右にそのまま）。
  useEffect(() => {
    if (!busy) { setSlowWait(false); return undefined; }
    const t = setTimeout(() => { if (!gotTextRef.current) setSlowWait(true); }, 15000);
    return () => clearTimeout(t);
  }, [busy]);
  const prevMsgCountRef = useRef(0);
  const historyHydratedRef = useRef(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
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
    // chat-scroll を直接動かす。scrollIntoView だと document scroll も巻き込んで
    // AI タブ全体が上下する不具合があった。
    // 相談を送った直後（busy）は、自分の相談の吹き出しを上端へ（答えがその下に書かれていく）。
    // それ以外の追加は最下部へ。
    setTimeout(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
      const top = busyRef.current ? questionAlignTop(el) : null;
      el.scrollTo({ top: top != null ? top : el.scrollHeight, behavior });
    }, 30);
  }, [messages, view, historyLoaded]);

  // 💡 相談例（AI 呼び出し無し・即時）。「何を聞けばいいか分からない」という最初の摩擦を消す。
  //   すべての本: 前の相談の続き → 本の「現在の課題」→ メモのある本 → よくある困りごと（lib/consultHelpers.js・ホームと共通）
  //   本に絞ったとき: その本からだけ作る（ほかの本の例を出さない）
  // 前の相談（答えが返ったもの）。「前に相談した「…」、その後どう進める？」と、押したときの文脈に使う。
  const lastConsult = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role !== 'user' || /^(err|streaming|bg-wait)-/.test(String(m.id))) continue;
      const ans = messages.slice(i + 1).find((n) => n.role === 'assistant');
      if (!ans || ans.error || ans.notice || ans.streaming || ans.content === STOPPED_EMPTY) continue;
      return { id: m.id, question: m.content, answer: ans.content, at: m.createdAt };
    }
    return null;
  }, [messages]);
  // 行動（本に入っている）。相談例の「やってみた「…」、次はどうする？」に使う。
  const { allActions } = useAllActions(books);
  // 🔎 トークンを使い切ったとき: 書きかけの相談（無ければいちばん新しい相談）の言葉で、振り返り › メモを検索して開く。
  const searchMemos = onSearchMemos ? () => {
    const lastAsked = [...messages].reverse().find((m) => m.role === 'user' && !/^(err|streaming|bg-wait)-/.test(String(m.id)));
    const q = input.trim() || lastAsked?.content || '';
    track('brain_search_memos', { typed: !!input.trim() });
    onSearchMemos(memoSearchQuery(q));
  } : null;
  const examples = useMemo(() => {
    if (scopeIds.length > 0) {
      const qs = [];
      const picked = (books || []).filter((b) => scopeIds.includes(b.id));
      const first = picked[0];
      if (first?.title) {
        // 副題まで入った書名（読書メーターなど）は短くする（lib/consultHelpers.js の shortTitle）。
        const t = shortTitle(first.title);
        qs.push(`『${t}』の学びで、明日から使えるものは？`);
        qs.push(`『${t}』でいちばん大事なことを、私のメモから教えて`);
      }
      if (picked.length > 1) qs.push('選んだ本に共通する考え方は？');
      qs.push('この本から、今週やる一歩を1つ提案して');
      return qs.slice(0, 3).map((text) => ({ text, kind: 'book' }));
    }
    // メモの件数は下の ownMemoTotal と同じ数え方（ここより後で定義しているので、ここで数える）。
    const memoCount = memoStatsLoaded ? memoStats.cards + memoStats.personal + (memoStats.summaryBooks || 0) : null;
    // この 7 日でふりかえりを書いて完了した行動があれば、1 つ目の例を「やってみた「…」、次はどうする？」に。
    return buildConsultExamples({ books, memoBookIds, lastConsult, count: 3, memoCount, actions: allActions });
  }, [books, scopeIds, memoBookIds, lastConsult, memoStatsLoaded, memoStats, allActions]);

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
    // ホームや相談例から渡された相談は、送れないときも入力欄に残す（黙って消えないように）。
    if ((freeUsedUp || outOfTokens) && questionText != null) setInput(q);
    // 無料プランで今月のトークンを使い切っていたら、送らずに有料プランの画面を開く（入力は残す）。
    if (freeUsedUp) { openPaywall('free_used'); return; }
    // プランのトークンを使い切っていたら送らない（入力は残す。案内とトークンの追加は会話の下に出ている）。
    if (outOfTokens) return;
    const askBookIds = Array.isArray(opts.bookIds) ? opts.bookIds : scopeIds;
    const askScopeLabel = scopeLabelFor(askBookIds, books);
    const askMode = opts.mode || (askBookIds.length === 1 ? 'fused' : answerMode);
    // 続きの相談（2026-09-29）: 相談例の「前に相談した…」か、過去の相談から持ってきた前の相談（まだ使っていないもの）。
    const askPrior = opts.prior || (carry && !carry.used ? carry : null);
    if (askPrior && carry && askPrior.id === carry.id) setCarry((c) => (c ? { ...c, used: true } : c));
    // この相談より前の、いちばん新しい相談の時刻（「前の相談から メモ +N 件」に使う）。
    const before = opts.questionAt || '9999';
    let prevAskAt = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === 'user' && m.createdAt && m.createdAt < before && !/^(err|streaming|bg-wait)-/.test(String(m.id))) { prevAskAt = m.createdAt; break; }
    }
    // 前の相談のあとに書いた自分のメモ（カード式＋学び）の数。答えを書いている間に数える（待ち時間を増やさない）。
    const growthPromise = prevAskAt
      ? Promise.resolve(supabase.from('book_memos').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gt('created_at', prevAskAt))
        .then((r) => (r && !r.error && typeof r.count === 'number' ? r.count : 0), () => 0)
      : Promise.resolve(0);

    userScrolledRef.current = false;
    sentAtRef.current = Date.now();
    gotTextRef.current = false;
    setSlowWait(false);
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
    // 実際の答え方（本ごとにで送っても、並べる本が足りなければ「まとめて」で答える）。
    let liveMode = askMode;
    try {
      const { body, refs, memoCount, evidence, quoteRefs, tokenRefund, mode: usedMode, perbookBooks, completedActions } = await streamMyBookBrain({
        userId: user.id,
        question: q,
        bookIds: askBookIds,
        mode: askMode,
        prior: askPrior ? { question: askPrior.question, answer: askPrior.answer, at: askPrior.at } : null,
        signal: controller.signal,
        onStage: (s, info) => {
          setStage(s);
          // 書き始める前に、書いている途中の形を実際の答え方に合わせる（本のカードから、いつもの形へ跳ねないように）。
          //   本ごとにで送ったのに「まとめて」で答えるときは、その一行も書き始める前から出す。
          if (s === 'generate' && info?.mode && info.mode !== liveMode) {
            liveMode = info.mode;
            const fallback = askMode === 'perbook' && liveMode !== 'perbook' ? (info.perbookBooks === 0 ? 'none' : 'one') : undefined;
            setMessages((arr) => arr.map((m) => (m.id === streamingId ? { ...m, mode: liveMode, perbookFallback: fallback } : m)));
          }
        },
        onChunk: (visibleText) => {
          // 最初の delta が来た瞬間に stage を消して本文表示に切り替える。
          // 本ごとには、書いている間も最後のカードの下に「答えを書いています…」を残す（本のカードが順に増えるので、続きがあると分かるように）。
          if (liveMode !== 'perbook') setStage(null);
          lastVisible = visibleText;
          if (visibleText && !gotTextRef.current) { gotTextRef.current = true; setSlowWait(false); }
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
      // 答えの下の一行（使ったメモ・前の相談から増えたメモ）と、引用をメモと突き合わせた結果も refs に残す（履歴にも出る）。
      const grown = wasAborted ? 0 : await growthPromise;
      const persistRefs = wasAborted ? [] : [
        ...(evidence ? [`${EVIDENCE_PREFIX}${evidence}`] : []),
        // 関係するメモが無かった答え（トークンを返した）には、積み重ねの一行を付けない（効いていないので）
        ...(grown > 0 && memoCount > 0 && !tokenRefund ? [`${GROWTH_PREFIX}前の相談から メモ +${grown} 件`] : []),
        ...(Array.isArray(quoteRefs) ? quoteRefs : []),
        ...(tokenRefund ? [`${REFUND_PREFIX}${REFUND_NOTE}`] : []),
        ...(completedActions > 0 && !tokenRefund ? [`${ACTED_PREFIX}${completedActions}`] : []),
        ...(refs || []),
      ];
      // 本ごとにで送ったのに、並べる本が足りずに「まとめて」で答えた（答えの上に一行で知らせる）。
      // chat_messages に置き場所が無いので、この画面の間だけ（履歴から開き直したときは出ない）。
      const perbookFallback = askMode === 'perbook' && !!usedMode && usedMode !== 'perbook'
        ? { perbookFallback: perbookBooks === 0 ? 'none' : 'one' }
        : null;
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
        setMessages((arr) => arr.map((m) => (m.id === streamingId ? { ...transformMessage(data), ...perbookFallback } : m)));
      } catch (saveErr) {
        // 表示は確定させたまま（streaming フラグだけ落とす）、保存失敗を控えめに知らせる。
        setMessages((arr) => arr.map((m) =>
          m.id === streamingId
            ? { ...m, content: assistantContent, refs: persistRefs, streaming: false, ...perbookFallback }
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
                  // 下のボタン（もう一度）と同じ言葉を重ねない。
                  : '答えを書けませんでした。少し時間をおいて、送り直してください。',
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
    // 下書きだけ（振り返りのメモ検索で見つからなかった言葉など）: 送らずに入力欄へ入れる（勝手にトークンを使わない）。
    if (askPreset.draft) { setInput(askPreset.question); return; }
    // ホームの相談例「前に相談した「…」、その後どう進める？」なら、その相談と答えを文脈として渡す。
    const cont = lastConsult ? buildConsultExamples({ lastConsult, count: 1 })[0] : null;
    const prior = cont && cont.kind === 'continue' && cont.text === askPreset.question ? { prior: lastConsult } : {};
    ask(askPreset.question, Array.isArray(askPreset.bookIds) ? { bookIds: askPreset.bookIds, ...prior } : prior);
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
  const clearConversation = () => {
    // 境界は「保存済みの最新メッセージの時刻（サーバー時刻）」。端末の時計を使うと、
    // 時計が進んでいる端末で次の質問と答えが会話から消えていた。
    const saved = messages.filter((m) => m.createdAt && !/^(err|streaming|bg-wait)-/.test(String(m.id)));
    const now = saved.length > 0
      ? saved.reduce((a, m) => (m.createdAt > a ? m.createdAt : a), saved[0].createdAt)
      : new Date().toISOString();
    setClearedAt(now);
    rememberSession(user?.id, { clearedAt: now });
    setPromptDismissed(false);
    setCarry(null);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('brain-cleared-at', now);
      }
    } catch { /* ignore */ }
  };
  const handleResolveAndClear = () => {
    clearConversation();
    toast.success('新しい相談をはじめます。これまでの相談は右上の時計から見返せます。');
  };

  // 過去の相談の「この相談の続きを聞く」: その相談と答えを新しい会話のいちばん上に置き、
  // 次の相談に文脈として渡す（いまの会話は過去の相談に残る）。入力欄にすぐ書けるようにする。
  const continueFrom = (group) => {
    const u = group[0];
    const a = group.find((m) => m.role === 'assistant' && !m.error && !m.notice && m.content !== STOPPED_EMPTY);
    if (busy || !u || u.role !== 'user' || !a) return;
    clearConversation();
    setCarry({ id: u.id, question: u.content, answer: a.content, at: u.createdAt, used: false });
    setView('chat');
    track('brain_continue', {});
    setTimeout(() => { try { inputRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ } }, 80);
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
  // 続きの相談を持ってきたときは、空の画面（相談例）を出さない（会話はその相談から始まる）。
  const isEmpty = visibleMessages.length === 0 && !carry;
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
  // 空の画面の出し分けはメモ（カード式＋学び＋この本のまとめ）の件数で決める（SPEC §3）。メモ＝カード式＋まとめ式
  // （GLOSSARY）なので、読書メーター等の感想を「この本のまとめ」に取り込んだだけの人も相談できる（2026-09-29 オーナー裁定）。
  // 読書計画だけの人は「これまで読んだ本から始める」へ（相談例の「最近のメモから…」が空振りしないように）。
  const ownMemoTotal = memoStats.cards + memoStats.personal + (memoStats.summaryBooks || 0);
  // 答え方（まとめて / 本ごとに）は、並べる本が無い 1 冊のときと、メモがまだ無いとき（答える材料が無い）は出さない。
  // 数え終わるまでは出しておく（メモのある大多数の人で、読み込み後にチップが増えて跳ねないように）。
  const modeApplies = scopeIds.length !== 1 && (!memoStatsLoaded || ownMemoTotal > 0 || memoStatsFailed);
  // 🌱 相談相手が育ってきました（lib/trialNudge.js・2026-09-28）: 無料プランで自分のメモが 10 件たまったら、
  //    会話の場所のいちばん上に 1 回だけ、7 日間無料（使えないと分かれば「プランを見る」）をすすめる。
  //    閉じる・押すで二度と出さない。お試しモードでは ?demo=freegrown のときだけ出す（ほかの撮影を変えない）。
  const [nudgeDone, setNudgeDone] = useState(() => isTrialNudgeDone() || (isDemo && demoScenario !== 'freegrown'));
  const nudgeWanted = view === 'chat' && historyLoaded && !busy && shouldShowTrialNudge({
    plan,
    memoCount: memoStatsLoaded ? ownMemoTotal : null,
    done: nudgeDone,
    freeUsedUp,
    empty: isEmpty && !(scopeIds.length > 0 && scopeMemoCount === 0),
  });
  // 無料期間の名前（「7 日間無料」）。'' ＝約束しない文にする。null ＝確かめている途中（まだ出さない＝文が入れ替わらない）。
  const [trialOffer, setTrialOffer] = useState(null);
  useEffect(() => {
    if (!nudgeWanted || trialOffer !== null) return undefined;
    if (hadPlan) { setTrialOffer(''); return undefined; } // 前に契約していた＝無料期間はもう使えない
    if (isDemo) {
      // お試しモード: 使える人として撮る（&trial=off で「使えない人」の文）。
      const t = new URLSearchParams(window.location.search).get('trial');
      setTrialOffer(t === 'off' ? '' : normalizeTrialLabel(t || '7日間無料'));
      return undefined;
    }
    let alive = true;
    getIntroOffer(user?.id)
      .then((r) => { if (alive) setTrialOffer(r.status === 'eligible' ? normalizeTrialLabel(r.label) : ''); })
      .catch(() => { if (alive) setTrialOffer(''); });
    return () => { alive = false; };
  }, [nudgeWanted, trialOffer, hadPlan, user?.id]);
  const showNudge = nudgeWanted && trialOffer !== null;
  const nudgeSeenRef = useRef(false);
  useEffect(() => {
    if (!showNudge || nudgeSeenRef.current) return;
    nudgeSeenRef.current = true;
    track('trial_nudge', { action: 'shown', offer: trialOffer ? 'trial' : 'plan' });
  }, [showNudge, trialOffer]);
  const closeNudge = (action) => {
    markTrialNudgeDone();
    setNudgeDone(true);
    track('trial_nudge', { action, offer: trialOffer ? 'trial' : 'plan' });
  };
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
            {/* 1 冊に絞ったとき（『書名』…）は 『 をぶら下げる。下の残りトークンの行には引き継がない。 */}
            <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'auto-phrase', ...(scopeIds.length === 1 && scopeMemoCount != null ? { textIndent: '-0.5em' } : null) }}>
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
                // 件数は「メモ N 件」＝自分のメモ（カード式＋学び＋この本のまとめ）。ホームの相談カード・初日クイックスタート・
                // 振り返りの記録と同じ数え方・同じ言葉（2026-09-29）。0 件のときは件数を出さない（下の「まだメモがありません」と食い違わないように）。
                : (ownMemoTotal > 0 ? <><span style={{ whiteSpace: 'nowrap' }}>あなたのメモ {ownMemoTotal} 件</span>から答えます</> : '読んだ本のメモを根拠に答えます')}
              {/* 残りのトークン（無料・有料は今月・無料期間は期間まるごと）。管理者・読めないときは出さない。 */}
              {tokensRemaining != null && (
                <span style={{ display: 'block', textIndent: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
                  {/* 折り返すときは「・」のあとで（「無料期間の残り／110 トークン」と切らない）。かっこは重ねない。 */}
                  <span style={{ whiteSpace: 'nowrap' }}>{plan === 'trial' ? '無料期間' : '今月'}の残り {fmtTokens(tokensRemaining)}{purchasedTokens > 0 ? <> ＋追加 {fmtTokens(purchasedTokens)}</> : null} トークン</span>
                  {/* 無料プラン・7 日間無料は「あと何回相談できるか」を添える（トークンだけでは量が分からない・2026-09-29）。追加分も数に入れる。 */}
                  {(freeMode || plan === 'trial') && tokensRemaining + (purchasedTokens || 0) > 0 && <>・<span style={{ whiteSpace: 'nowrap' }}>相談 約 {consultsLeft(tokensRemaining + (purchasedTokens || 0), TOKEN_COSTS.consult)} 回</span></>}
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
                actions={[{ label: 'もう一度', variant: 'primary', onClick: () => { setHistoryError(false); setHistoryLoaded(false); fetchHistory(); } }]}
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
            {historyGroups.map((g) => {
              const canContinue = g[0].role === 'user' && g.some((m) => m.role === 'assistant' && !m.error && !m.notice && m.content !== STOPPED_EMPTY);
              return (
                <div key={g[0].id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  {g.map((m) => (
                    <ChatMessage key={m.id} message={m} showTime onOpenBook={onOpenBook} books={books} onAddAction={handleAnswerToAction} onAddActionPickBook={onAddActionPickBook} onRetry={busy ? null : regenerate} question={g[0].role === 'user' ? g[0].content : ''} onAskBook={askAboutBook} askBusy={busy} />
                  ))}
                  {/* この相談の続きを聞く: 答えのカードのすぐ下（文字ボタン・文字の端を余白 16 にそろえる）。 */}
                  {canContinue && (
                    <button
                      type="button"
                      onClick={() => continueFrom(g)}
                      disabled={busy}
                      style={{ ...uiBtnLink, alignSelf: 'flex-start', margin: 'calc(-1 * var(--space-2)) 0 0 calc(-1 * var(--space-1))', ...(busy ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}
                    >
                      この相談の続きを聞く
                    </button>
                  )}
                </div>
              );
            })}
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
                <button type="button" onClick={() => setScopeIds([])} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>
                  すべての本に相談する
                </button>
              </section>
            ) : ownMemoTotal === 0 && !memoStatsFailed ? (
              // メモ（カード式＋学び）0 件: 質問させる前に「これまで読んだ本から始める」（根拠が無いと空振りするため）。
              // 読書計画・まとめだけの人もここ（上の行の件数とは別に、メモの件数で決める・SPEC §3）。
              // 空の画面は共通の EmptyState（DESIGN §5 空・エラー・読み込み）。主ボタンはこの 1 つ。
              <EmptyState
                icon={<PencilLine size={32} strokeWidth={1.5} aria-hidden="true" />}
                title="まだメモがありません"
                actions={onQuickstart
                  ? [{ label: 'これまで読んだ本から始める', variant: 'primary', onClick: onQuickstart }]
                  : onGoBookshelf ? [{ label: '本を開いてメモを書く', variant: 'secondary', onClick: onGoBookshelf }] : []}
              />
            ) : planOut ? (
              // 🪙➕ プランの人がトークンを使い切った（SPEC §3）: 押せない相談例は出さず、案内カードを一番上に。
              <TokensOutCard plan={plan} trialEndLabel={trialEndLabel} tokenAllowance={tokenAllowance} onAdd={openTokenSheet} onSearch={searchMemos} />
            ) : freeUsedUp ? (
              // 🎁 無料プランで今月のトークンを使い切った（SPEC §3・2026-09-29）: プランの人と同じく、
              //   押しても答えられない相談例は出さず、案内カードを会話の場所のいちばん上に置く。
              <FreeUsedCard tokenAllowance={tokenAllowance} onOpen={() => openPaywall('free_used')} onSearch={searchMemos} />
            ) : (
              <section aria-labelledby="brain-empty-title">
                {showNudge && (
                  <TrialNudgeCard
                    copy={trialNudgeCopy({ memoCount: ownMemoTotal, offer: trialOffer })}
                    onOpen={() => { closeNudge('tap'); openPaywall('grown'); }}
                    onDismiss={() => closeNudge('dismiss')}
                  />
                )}
                <h2 id="brain-empty-title" style={{ ...headingStyle, marginBottom: 'var(--space-6)' }}>困っていることを、相談してください</h2>
                <p style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>たとえば</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {examples.map(({ text: q, kind }) => (
                    <button
                      key={q}
                      type="button"
                      // 「前に相談した…」は、その相談と答えを文脈として渡す（続きとして答える）。
                      onClick={() => { if (!busy && !outOfTokens) ask(q, kind === 'continue' && lastConsult ? { prior: lastConsult } : {}); }}
                      disabled={busy || outOfTokens}
                      style={{ ...chipStyle, ...(busy || outOfTokens ? { color: 'var(--text-2)', opacity: 1, cursor: 'default' } : null), ...hangIndent(q) }}
                    >
                      {withPhraseBreaks(q)}
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
            {/* 過去の相談から持ってきた「前の相談」（この会話の文脈）。まだ送っていない間は × でやめられる。 */}
            {carry && (
              <CarryCard
                carry={carry}
                onCancel={!carry.used && !busy ? () => { setCarry(null); track('brain_continue', { action: 'cancel' }); } : null}
              />
            )}
            {visibleMessages.map((m, i) => (
              <Fragment key={m.id}>
                <ChatMessage
                  message={m}
                  onOpenBook={onOpenBook}
                  stage={m.streaming ? stage : null}
                  slow={!!m.streaming && slowWait && !aborting}
                  books={books}
                  onAddAction={handleAnswerToAction}
                  onAddActionPickBook={onAddActionPickBook}
                  onRetry={busy ? null : regenerate}
                  onWriteLearning={() => setView('learning')}
                  question={m.role === 'assistant' ? precedingQuestion(visibleMessages, i) : ''}
                  onAskBook={askAboutBook}
                  askBusy={busy}
                  onActionAdded={() => setOptinAfterId((cur) => cur || m.id)}
                  onOpenActions={onOpenActions}
                />
                {/* 🔔 はじめて「行動に追加」した直後に 1 回だけ、思い出しの通知の案内（lib/notifyOptIn.js） */}
                {optinAfterId === m.id && <NotifyOptInCard where="action" />}
              </Fragment>
            ))}
          </div>

          {/* 無料プランで今月のトークンを使い切ったら、答えの下（まだ話していなければ例の下）で静かに案内
              （読み終えるまで画面を奪わない） */}
          {freeUsedUp && !busy && lastIsAssistant && !isEmpty && (
            <FreeUsedCard tokenAllowance={tokenAllowance} onOpen={() => openPaywall('free_used')} onSearch={searchMemos} style={{ marginTop: 'var(--space-6)' }} />
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
              {/* 関係するメモが無かった答えは、角度を変えても答えられないので「本を追加」「学びを書く」へ（2026-09-29） */}
              {isNoInfoAnswer(visibleMessages[visibleMessages.length - 1]) ? (
                <>
                  {onAddBook && (
                    <button type="button" onClick={onAddBook} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>本を追加</button>
                  )}
                  <button type="button" onClick={() => setView('learning')} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>学びを書く</button>
                </>
              ) : !freeUsedUp && !visibleMessages[visibleMessages.length - 1]?.notice && !visibleMessages[visibleMessages.length - 1]?.error && (
                <button type="button" onClick={regenerate} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>
                  {visibleMessages[visibleMessages.length - 1]?.content === STOPPED_EMPTY ? 'もう一度答えて' : '別の角度で答えて'}
                  {/* 無料プランはトークンが少ないので、押す前に使う量を添える（相談 1 回分・2026-09-29） */}
                  {freeMode && <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>（約 {answerMode === 'perbook' && modeApplies ? TOKEN_COSTS.consultPerBook : TOKEN_COSTS.consult} トークン）</span>}
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
          {historyLoaded && !busy && (isEmpty ? (memoStatsLoaded && (ownMemoTotal > 0 || memoStatsFailed) && !planOut && !freeUsedUp && !(scopeIds.length > 0 && scopeMemoCount === 0)) : (lastIsAssistant && !visibleMessages[visibleMessages.length - 1]?.notice && !visibleMessages[visibleMessages.length - 1]?.error)) && (
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
                : freeUsedUp ? `${nextResetLabelJa()}から相談できます`
                : carry && !carry.used ? 'この相談の続きを書く' : '例：上司への報告がうまくいかない'}
              rows={1}
              // 答えを書いている間も押せなくしない（disabled にすると入力欄からフォーカスが外れ、下のタブが
              // 出てきて入力欄がもう一度動いていた・2026-09-29）。送るのは答えが終わってから（ask が busy で止める）。
              maxLength={LIMITS.aiQuestion}
              aria-label="相談したいこと"
            />
            {busy ? (
              // ストリーミング中は送信ボタンを「中止」に切り替える（その時点の内容で確定）。
              <button
                type="button"
                className="send-btn stop-btn"
                onMouseDown={(e) => { if (document.activeElement === inputRef.current) e.preventDefault(); }}
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
                // 押しても入力欄からフォーカスを外さない（外れると下のタブが遅れて出てきて、入力欄が
                // 「縮む → 押し上がる」の 2 回動いていた・2026-09-29。チャットと同じく入力欄はそのまま）。
                onMouseDown={(e) => { if (document.activeElement === inputRef.current) e.preventDefault(); }}
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

// 🌱 相談相手が育ってきました（無料プランで自分のメモが 10 件たまったとき・1 回だけ）。
// 相談例の上に置く案内カード（DESIGN §5 の案内カード＝.card の面・アイコンなし）。右上の × で閉じる。
// 主ボタンは有料プランの画面を重ねて開く（reason 'grown'）。答えの途中には出さない（親が empty で決める）。
function TrialNudgeCard({ copy, onOpen, onDismiss }) {
  return (
    <section aria-labelledby="brain-nudge-title" style={{ ...cardStyle, marginBottom: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        {/* 見出しとして読み上げる（見た目は本文の大きさ・600 のまま） */}
        <h3 id="brain-nudge-title" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
          {copy.title}
        </h3>
        {/* 押せる範囲 44 のまま、負の余白で × の見た目をカードの余白 16 の角にそろえる */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="閉じる"
          style={{ ...iconBtn, color: 'var(--text-3)', margin: 'calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0' }}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'auto-phrase', textWrap: 'pretty' }}>
        {/* 句読点ごとのまとまりで折り返す（「AI／選書」「を試せます。」のように語の途中で割れないように）。
            inline-block なので、文字を大きくして 1 行に収まらないまとまりだけは中で折り返す。 */}
        {(copy.body.match(/[^、。]+[、。]?|[、。]/g) || []).map((part, i) => (
          <span key={i} style={{ display: 'inline-block' }}>{part}</span>
        ))}
      </p>
      <button type="button" onClick={onOpen} style={{ ...uiBtnPrimary, marginTop: 'var(--space-3)' }}>
        {copy.cta}
      </button>
    </section>
  );
}

// 🎁 無料プランで今月のトークンを使い切ったときの案内カード（会話の場所のいちばん上・答えの下で共通）。
// onSearch: 「メモを検索して探す」（AI を使わずに、自分のメモから手がかりを探す・2026-09-29）。主ボタンの下の文字ボタン。
function FreeUsedCard({ tokenAllowance, onOpen, onSearch = null, style = null }) {
  return (
    <section aria-label="今月のトークンは、ここまで" style={{ ...cardStyle, ...style }}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
        今月のトークンは、ここまでです
      </p>
      <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}</span>に <span style={{ whiteSpace: 'nowrap' }}>{fmtTokens(tokenAllowance)} トークン</span>に戻ります
      </p>
      <button type="button" onClick={onOpen} style={{ ...uiBtnPrimary, marginTop: 'var(--space-3)' }}>
        プランを見る
      </button>
      {onSearch && <SearchMemosLink onClick={onSearch} />}
    </section>
  );
}

// 過去の相談の「この相談の続きを聞く」で持ってきた前の相談（会話のいちばん上）。
// 小さな見出し「前の相談の続き」→ カード（相談の日付・相談の文・そのときの結論を 3 行まで）。
function CarryCard({ carry, onCancel }) {
  const conclusion = (parseAnswer(carry.answer)?.conclusion || String(carry.answer || '').split('\n').find((l) => l.trim()) || '').replace(/\*\*/g, '');
  const d = carry.at ? new Date(carry.at) : null;
  const when = d && !Number.isNaN(d.getTime()) ? `${d.getMonth() + 1}月${d.getDate()}日` : '';
  return (
    <section aria-label="前の相談の続き">
      <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>前の相談の続き</p>
      <div style={{ ...cardStyle, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
          <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {when && <span style={{ display: 'block', fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)' }}>{when}の相談</span>}
            {withPhraseBreaks(carry.question)}
          </p>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="続きの相談をやめる"
              style={{ ...iconBtn, color: 'var(--text-3)', margin: 'calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0' }}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        {conclusion && (
          <p style={{ ...readText, margin: 'var(--space-2) 0 0', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }}>
            {renderBoldInline(conclusion)}
          </p>
        )}
      </div>
    </section>
  );
}

// 🪙➕ プランの人（有料・無料期間）がトークンを使い切って、まだ話していないときの案内カード。
// 押せない相談例の代わりに、会話の場所の一番上に置く（SPEC §3）。
function TokensOutCard({ plan, trialEndLabel, tokenAllowance, onAdd, onSearch = null }) {
  const sub = { margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 };
  return (
    <section aria-label="トークンは、ここまで" style={cardStyle}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
        {plan === 'trial' ? '無料期間のトークンは、ここまでです' : '今月のトークンは、ここまでです'}
      </p>
      {plan !== 'trial' ? (
        <p style={sub}>
          <span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}</span>に <span style={{ whiteSpace: 'nowrap' }}>{fmtTokens(tokenAllowance)} トークン</span>に戻ります
        </p>
      ) : trialEndLabel ? (
        <p style={sub}>
          無料期間が終わる<span style={{ whiteSpace: 'nowrap' }}>{trialEndLabel}</span>から、<span style={{ whiteSpace: 'nowrap' }}>毎月 {fmtTokens(PAID_TOKENS)} トークン使えます。</span>
        </p>
      ) : null}
      <button type="button" onClick={onAdd} style={{ ...uiBtnPrimary, marginTop: 'var(--space-3)' }}>
        トークンを追加
      </button>
      {onSearch && <SearchMemosLink onClick={onSearch} />}
    </section>
  );
}

// 🔎 トークンを使い切ったときの脇役の文字ボタン（振り返り › メモを、相談の言葉を入れて開く）。
function SearchMemosLink({ onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ ...uiBtnLink, width: '100%', marginTop: 'var(--space-2)' }}>
      メモを検索して探す
    </button>
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

function prefersReducedMotion() {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; }
}

// 会話欄（el）で、いちばん新しい答えの前の「自分の相談の吹き出し」を上端（余白 16）に合わせる scrollTop。
// 相談が長すぎて答えが画面の下に隠れてしまうとき（欄の 4 割以上）・直前が相談でないとき（別の角度で答える）は、
// 答えの先頭に合わせる。送れる範囲に収める。答えが無ければ null。
function questionAlignTop(el) {
  const answers = el.querySelectorAll('[aria-label="相談への答え"]');
  const last = answers[answers.length - 1];
  if (!last) return null;
  const q = last.previousElementSibling;
  const isQ = q && q.getAttribute('aria-label') === 'あなたの相談';
  const target = isQ && q.offsetHeight < el.clientHeight * 0.4 ? q : last;
  const gap = parseFloat(getComputedStyle(el).getPropertyValue('--space-4')) || 16;
  const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - gap;
  return Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
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

// 『「（ で始まる段落は、かっこをぶら下げる（1 行目だけ左へ 0.5em 出して、文字の端を揃える・PerBookCard の見出しと同じ）。
// 先頭の **（太字の印）は見えないので飛ばして判定する。
const HANG_RE = /^(\*\*)?[『「（]/;
function hangIndent(text) {
  return HANG_RE.test(String(text || '').trimStart()) ? { textIndent: '-0.5em' } : null;
}

// 以前の答え（履歴）の末尾に付いていた内部向けの注記「（参照: 10/43 件、内訳: …）」。
const REF_NOTE_RE = /^（参照:[^）]*）$/;

// 見出し（【】）の無い回答（旧形式・エラー文など）はそのまま段落で。
// gap: 段落の間（ふつうは 8。本ごとの視点を段落のまま見せるときは 1 冊ごとの区切りなので 16）。
function PlainAnswer({ text, gap = 'var(--space-2)' }) {
  return (
    <>
      {(text || '').split('\n').filter((l) => l.trim() && !REF_NOTE_RE.test(l.trim())).map((line, idx) => {
        // Markdown の見出し記号・箇条書き記号をそのまま見せない（「- 『…』」→「・『…』」）
        const shown = line.replace(/^【(.+?)】\s*/, '$1：').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*]\s+/, '・');
        // 「・」で始まる行はぶら下げ（折り返した 2 行目を「・」の後ろの文字の頭に揃える）。
        const bullet = /^\s*・/.test(shown);
        return (
          <p key={idx} style={{ margin: idx ? `${gap} 0 0` : 0, ...(bullet ? { paddingLeft: '1em', textIndent: '-1em' } : hangIndent(shown)) }}>
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
    // （本を取り出せなかったときは節まるごとが booksRaw に入るので、同じ文を前置きとして二重に出さない）
    booksLead: bookViews && bookViews.books.length > 0 ? bookViews.lead : '',
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
// いちばんの根拠が自分の学び（💡・本に結びつかない学びログ）なら、2 つ目の根拠の本に勝手に付けない
// （null を返す＝本を選ぶシートで、行動の文を入れたまま本を選んでもらう・2026-09-29）。
function resolveActionBookId(refs, books) {
  if (!Array.isArray(refs) || !Array.isArray(books) || books.length === 0) return null;
  if (refs.length > 0 && String(refs[0]).trim().startsWith('💡')) return null;
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

// 学びの記録日（'YYYY-MM-DD'）→「（9月29日）」。分からなければ空。
function learningDateLabel(d) {
  const m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `（${Number(m[1])}月${Number(m[2])}日）` : '';
}

// 参照の先頭の絵文字（📚 📖 💡）は外す（DESIGN §3: 絵文字をアイコン代わりにしない）。
function refText(r) {
  return String(r || '').replace(/^[^\p{L}\p{N}『「(（]+/u, '').trim();
}

// 参照 1 件を 2 行に: 1 行目『書名』（長ければ …）、2 行目 著者・ページ（付随情報）。
function RefLines({ r }) {
  const t = tidyQuotes(refText(r));
  // 学びの参照「自分の学び (2026-08-15 / 仕事)」は、根拠の表示と同じ「自分の学び（8月15日）」に（カテゴリは 2 行目）。
  const lm = t.match(/^自分の学び\s*[（(]\s*(\d{4}-\d{2}-\d{2})?\s*(?:[/／]\s*([^)）]*))?[)）]/);
  if (lm) {
    const cat = String(lm[2] || '').trim();
    return (
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`自分の学び${learningDateLabel(lm[1])}`}</span>
        {cat && <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontWeight: 400 }}>{cat}</span>}
      </span>
    );
  }
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
function PerBookCard({ book, streaming, onAsk, askBusy, basisCheck = null }) {
  const cursor = streaming ? <span className="streaming-cursor" aria-hidden="true" /> : null;
  // 根拠の引用がメモと一致しなかったとき（evidenceCheck.js）は、引用を外してページだけ残し、その旨を書く。
  const basisNg = basisCheck?.s === 'ng';
  const basisRaw = tidyQuotes(String(book.basis || '').replace(/\*\*/g, ''));
  const basis = basisNg ? stripQuotes(basisRaw) : basisRaw;
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
            <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0, ...hangIndent(l) }}>{renderBoldInline(l)}{!basis && i === arr.length - 1 && cursor}</p>
          ))}
        </div>
      )}
      {(basis || basisNg) && (
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {basis}{basisNg && <>{basis ? '　' : ''}メモと一致しない引用だったので、表示していません</>}{cursor}
        </p>
      )}
      {!book.view && !basis && !basisNg && cursor}
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

// 「✓ 行動に追加しました（期限は明日）見る」。狭い幅で折り返しても「見る」だけが次の行に落ちないよう、
// 「（期限は明日）見る」をひとまとまり（nowrap）にする。「見る」は押せる範囲 44 のまま、上下の負の余白で行の高さを変えない。
// ✓ は 2 行になっても 1 行目の高さの中央に置く。
function ActionAddedNote({ onOpenActions }) {
  return (
    <p role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', minHeight: 44, boxSizing: 'border-box', paddingBlock: 'calc((44px - 1.5em) / 2)', margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, color: 'var(--success)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0 }}>
        <Check size={16} aria-hidden="true" />
      </span>
      <span style={{ minWidth: 0 }}>
        行動に追加しました
        {/* かっこは詰める（palt）: 行頭に来ても左が空いて見えず、「）」と「見る」の間も空きすぎない。 */}
        <span style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontFeatureSettings: '"palt"' }}>（期限は明日）</span>
          {/* 入った先（振り返り › 行動）をその場で見られる（2026-09-29）。左右 4 の内側余白が文字との間になる。 */}
          {onOpenActions && (
            <button type="button" onClick={onOpenActions} aria-label="追加した行動を見る" style={{ ...uiBtnLink, verticalAlign: 'middle', marginBlock: 'calc((1.5em - 44px) / 2)' }}>見る</button>
          )}
        </span>
      </span>
    </p>
  );
}

function ChatMessage({ message, onOpenBook, stage, slow = false, books, onAddAction, onAddActionPickBook, onRetry, onWriteLearning, showTime = false, question = '', onAskBook = null, askBusy = false, onActionAdded = null, onOpenActions = null }) {
  const isUser = message.role === 'user';
  const isStreaming = !!message.streaming;
  const hasBody = typeof message.content === 'string' && message.content.length > 0;
  const showStageBlock = isStreaming && !hasBody;

  // 🧠→🎯 回答の「明日からできる一歩」を、紐づく本の行動リストへ 1 タップ追加。
  const [actionAdded, setActionAdded] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const canAct = !isUser && !isStreaming && !message.error && (!!onAddAction || !!onAddActionPickBook);
  const actionLine = canAct ? extractActionLine(message.content) : '';
  // 行動の一覧では相談の文脈なしに読まれるので、「この件」「それ」で始まる一歩には相談の要約を頭に付ける（lib/consultHelpers.js）。
  const actionForList = actionLine ? standaloneAction(actionLine, question, LIMITS.actionText) : '';
  // 参照メモから本を特定できれば直接その本へ。特定できない一般回答は本選択シートへ。
  const actionBookId = actionLine && onAddAction ? resolveActionBookId((message.refs || []).filter((r) => !isMetaRef(r)), books) : null;
  // 関係するメモが無かった答えの一歩（「次に読む本で…」など）は行動にしない（下に「本を追加」「学びを書く」を出す）。
  const canShowAction = !!actionLine && (!!actionBookId || !!onAddActionPickBook) && !isNoInfoAnswer(message);
  const handleAddAction = async () => {
    if (!actionLine || actionBusy) return;
    if (actionBookId && onAddAction) {
      setActionBusy(true);
      const ok = await onAddAction(actionBookId, actionForList);
      setActionBusy(false);
      if (ok) { setActionAdded(true); onActionAdded?.(); }
    } else if (onAddActionPickBook) {
      // 本を特定できない → 本選択シートで行動文をプレフィル（確定は本を選んだ時点）。
      onAddActionPickBook(actionForList);
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
        {/* 文字に沿って縮む（いちばん長い行＋内側余白・最大 85%）。文節の切れ目（BudouX の <wbr>）でだけ折り返す。 */}
        <TightBubble
          text={`${message.scopeLabel || ''}\n${message.content || ''}\n${time ? message.createdAt : ''}`}
          className="text-pretty"
          style={{ maxWidth: '85%', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'pretty' }}
        >
          {message.scopeLabel && message.scopeLabel !== SCOPE_ALL_LABEL && (
            <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', marginBottom: 'var(--space-1)' }}>相談相手：{withPhraseBreaks(message.scopeLabel)}</span>
          )}
          {withPhraseBreaks(message.content)}
          {time}
        </TightBubble>
      </div>
    );
  }

  const parsed = !isStreaming && !message.error && !message.notice ? parseAnswer(message.content) : null;
  // 🌱 「使ったメモ」の一行は refs の先頭に目印付きで保存している（表を増やさずに履歴にも残す）。
  const allRefs = Array.isArray(message.refs) ? message.refs : [];
  const evidence = (allRefs.find((r) => String(r).startsWith(EVIDENCE_PREFIX)) || '').slice(EVIDENCE_PREFIX.length);
  // 「前の相談から メモ +N 件」（積み重ねが効いていることを事実で・点数やバッジにしない）
  const growth = (allRefs.find((r) => String(r).startsWith(GROWTH_PREFIX)) || '').slice(GROWTH_PREFIX.length);
  // 相談の材料に入れた「最近完了した行動」の件数（0＝行を出さない）
  const actedCount = Math.max(0, parseInt((allRefs.find((r) => String(r).startsWith(ACTED_PREFIX)) || '').slice(ACTED_PREFIX.length), 10) || 0);
  // 引用を実際のメモと突き合わせた結果（無い＝古い答え。そのときは AI の文のまま見せる）
  const quoteChecks = decodeQuoteRefs(allRefs);
  const refChecks = quoteChecks.filter((c) => c.k === 'r');
  const basisCheckFor = (title) => quoteChecks.find((c) => c.k === 'b' && c.t === title) || null;
  // 「もとになった本」から、引用がすべてメモと一致しなかった本を外す（作った引用の本を根拠として並べない・2026-09-29）。
  //   一致しない引用が 1 つでもあり、同じ本に一致した引用も要約の行も無い本だけを外す。
  const failedTitles = (() => {
    const byTitle = new Map();
    quoteChecks.forEach((c) => {
      const t = String(c.t || '').trim();
      if (!t) return;
      if (!byTitle.has(t)) byTitle.set(t, []);
      byTitle.get(t).push(c.s);
    });
    return [...byTitle].filter(([, ss]) => ss.every((x) => x === 'ng')).map(([t]) => t);
  })();
  const refsList = allRefs.filter((r) => {
    if (isMetaRef(r)) return false;
    if (failedTitles.length === 0) return true;
    const m = String(r).match(/『([^』]+)』/);
    const t = m ? m[1].trim() : '';
    return !t || !failedTitles.some((f) => f === t || f.includes(t) || t.includes(f));
  });
  // 関係するメモが無くてトークンを返したとき（答えの下に 13/--text-2 の一行）
  const refundNote = allRefs.some((r) => String(r).startsWith(REFUND_PREFIX)) ? REFUND_NOTE : '';
  const renderRefund = () => (refundNote && !isStreaming ? (
    <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(refundNote)}</p>
  ) : null);
  const nBooks = refBookCount(refsList);
  // 📚 本ごとの答え。書いている途中も同じ形で見せる（出来上がりで形が跳ねないように）。
  //   ただし「本ごとに」で送っても、並べる本が足りずに「まとめて」で答えたとき（参照・解釈の節がある）は、いつもの形。
  const liveAny = isStreaming && hasBody ? parseAnswer(message.content) : null;
  const live = message.mode === 'perbook' ? liveAny : null;
  const perBook = parsed && Array.isArray(parsed.books)
    ? parsed
    : (live && !live.refs && !live.interp ? live : null);
  // 「まとめて」も書いている途中から出来上がりと同じ形（結論 → 一歩 → 根拠を見る）で見せる
  // （【…】の見出しのまま流して、書き終わった瞬間に高さが半分になるのをやめる・2026-09-29）。
  const liveFused = !perBook && liveAny && !Array.isArray(liveAny.books) ? liveAny : null;
  // 見出しは来たが結論の文がまだ無い間は、書き始める前と同じ形（点＋骨組み）で待つ。
  const waitingHead = isStreaming && hasBody && !liveAny && /^\s*【/.test(message.content);
  const fusedTail = !liveFused ? null : liveFused.action ? 'action' : (liveFused.refs || liveFused.interp) ? 'middle' : 'conclusion';
  const cursor = <span className="streaming-cursor" aria-hidden="true" />;
  const fallbackNote = !message.error && !message.notice && message.perbookFallback
    ? (message.perbookFallback === 'none' ? '並べられる本がまだないので、' : '並べられる本が 1 冊だけなので、')
    : '';
  const perBookTail = !isStreaming || !perBook ? null
    : perBook.action ? 'action' : perBook.compare ? 'compare' : perBook.books?.length ? 'book' : 'conclusion';
  const tail = perBookTail || fusedTail;

  // 明日からできる一歩（＋ 行動に追加）
  const renderAction = (p, marginTop) => (p.action ? (
    <div data-next-step="" style={{ marginTop, ...nextStepBox }}>
      <p style={subLabel}>{p.actionLabel}</p>
      {/* 書いている間は、書き始める前の形（3 行）と同じ高さを取っておく（一歩の 1 行目が出た瞬間に
          箱が 2 行ぶん縮み、書き進むとまた伸びて「行動に追加」が上下していた・2026-09-29）。 */}
      <p style={{ ...readText, margin: 0, whiteSpace: 'pre-wrap', ...(isStreaming ? { minHeight: STEP_SKELETON_HEIGHT } : null) }}>{renderBoldInline(p.action)}{tail === 'action' && cursor}</p>
      {/* 書いている間は、押せない形で同じ場所に置く（書き終わったときに下が押し下がらないように） */}
      {isStreaming && (onAddAction || onAddActionPickBook) && (
        <button type="button" disabled aria-hidden="true" tabIndex={-1} style={{ ...rowBtn, ...rowBtnOffOnFill, marginTop: 'var(--space-3)' }}>
          <Target size={16} aria-hidden="true" />行動に追加
        </button>
      )}
      {canShowAction && (
        actionAdded ? (
          <ActionAddedNote onOpenActions={onOpenActions} />
        ) : (
          <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)', ...(actionBusy ? rowBtnOffOnFill : null) }}>
            <Target size={16} aria-hidden="true" />行動に追加
          </button>
        )
      )}
    </div>
  ) : null);
  // 積み重ねが効いていることを、事実だけで一行（盛らない・渡したメモと一致したものだけ）
  const renderEvidence = () => ((evidence || growth) ? (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
      {/* 2 行に折り返しても、アイコンは 1 行目の高さの中央に置く。 */}
      <span style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0 }}>
        <Sprout size={16} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        {evidence && <span style={{ display: 'block' }}>{evidence}</span>}
        {/* 前の相談から増えたメモ（事実だけ・点数やバッジにしない）。数字は等幅。 */}
        {growth && <span style={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>{growth}</span>}
      </span>
    </div>
  ) : null);
  // 根拠（参照したメモ・解釈・もとになった本）は畳む
  const renderDetails = (p) => ((p.refs || p.interp || refsList.length > 0 || actedCount > 0) ? (
    <details style={{ marginTop: 'var(--space-3)' }}>
      <summary style={summaryStyle}>
        <span>根拠を見る{nBooks > 0 && !evidence ? `（${nBooks} 冊のメモ）` : ''}</span>
        <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-1)' }}>
        {refChecks.length > 0 ? (
          // 引用を実際のメモと突き合わせた結果（evidenceCheck.js）: 一致したものは保存しているメモの文そのもの、
          // 一致しない引用は見せない（作った引用を「あなたのメモ」として出さない）。
          <div>
            <p style={subLabel}>参照したメモ</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {refChecks.map((c, i) => (
                <li key={i}>
                  {c.s === 'none' ? (
                    <div style={subText}><PlainAnswer text={c.l} /></div>
                  ) : (
                    <>
                      {(c.t || c.p != null || c.u) && (
                        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, ...(c.t ? { textIndent: '-0.5em' } : null) }}>
                          {/* 学び（本の無いメモ）は書名の代わりに「自分の学び（M月D日）」（2026-09-29） */}
                          {c.t ? `『${c.t}』` : c.u ? `自分の学び${learningDateLabel(c.d)}` : ''}{c.p != null ? `p.${c.p}` : ''}
                        </p>
                      )}
                      {c.s === 'ok' ? (
                        <p style={{ ...subText, margin: 'var(--space-1) 0 0', whiteSpace: 'pre-wrap' }}>{c.x}</p>
                      ) : (
                        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>
                          メモと一致しない引用だったので、表示していません
                        </p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : p.refs ? (
          <div>
            <p style={subLabel}>参照したメモ</p>
            <div style={subText}><PlainAnswer text={p.refs} /></div>
          </div>
        ) : null}
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
        {/* 答えが踏まえた歩み（事実だけの一行・2026-09-29）。 */}
        {actedCount > 0 && (
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
            踏まえたこと: <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>完了した行動 {actedCount} 件</span>
          </p>
        )}
      </div>
    </details>
  ) : null);
  const renderNote = (p) => (p.note ? <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap' }}>{p.note}</p> : null);

  if (perBook) {
    const lastBook = (perBook.books || []).length - 1;
    const hasBooks = (perBook.books || []).length > 0 || !!perBook.booksRaw || !!perBook.booksLead;
    const showFoot = !!(perBook.compare || perBook.action || (!isStreaming && (evidence || refsList.length > 0 || perBook.note || refundNote)));
    return (
      // 本ごとの答えは、結論のカード → 本のカード（1 冊 1 枚）→ 共通点と違い・一歩・根拠のカード。
      // 外側は枠を付けない（カードの中にカードを入れない）。
      <div role="article" aria-label="相談への答え" aria-busy={isStreaming || undefined} style={{ display: 'flex', flexDirection: 'column', wordBreak: 'break-word' }}>
        <div style={answerCard}>
          <div style={readText}>
            {perBook.conclusion.split('\n').filter((l) => l.trim()).map((l, i, arr) => (
              <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0, ...hangIndent(l) }}>{renderBoldInline(l)}{perBookTail === 'conclusion' && i === arr.length - 1 && cursor}</p>
            ))}
          </div>
        </div>
        {hasBooks && (
          <section aria-label="本ごとの視点" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>本ごとの視点</h3>
            {perBook.booksLead && <p style={{ ...readText, margin: '0 0 var(--space-3)' }}>{renderBoldInline(perBook.booksLead)}</p>}
            {perBook.booksRaw ? (
              <div style={answerCard}><div style={readText}><PlainAnswer text={perBook.booksRaw} gap="var(--space-4)" /></div></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {perBook.books.map((b, i) => {
                  const bookId = !isStreaming && onAskBook && b.title ? resolveRefBookId(`『${b.title}』`, books) : null;
                  return (
                    <PerBookCard
                      key={i}
                      book={b}
                      basisCheck={isStreaming ? null : basisCheckFor(b.title)}
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
                    <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0, ...hangIndent(l) }}>{renderBoldInline(l)}{perBookTail === 'compare' && i === arr.length - 1 && cursor}</p>
                  ))}
                </div>
              </>
            )}
            {renderAction(perBook, perBook.compare ? 'var(--space-4)' : 0)}
            {!isStreaming && renderEvidence()}
            {!isStreaming && renderDetails(perBook)}
            {!isStreaming && renderNote(perBook)}
            {renderRefund()}
          </div>
        )}
        {/* 書いている間は、最後のカードの下に「答えを書いています…」（本のカードが順に増えるので、続きがあると分かるように）。
            中止を押したら（stage が消える）すぐに外す。親が role="log" aria-live なので live 領域は重ねない。 */}
        {isStreaming && stage === 'generate' && (
          <div className="ai-thinking" style={{ alignSelf: 'stretch', marginTop: 'var(--space-3)', position: 'sticky', bottom: 0, background: 'var(--bg)', paddingBlock: 'var(--space-2)' }}>
            <span className="ai-thinking-dot" aria-hidden="true" />
            <span>{STAGE_LABEL.generate}</span>
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
      {/* 本ごとにで送ったのに、並べる本が足りずに「まとめて」で答えたとき（SPEC §3）。書き始める前から出す。 */}
      {fallbackNote && (
        <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
          {/* 折り返すときは「、」のあとで（「まと／めて」と切らない）。 */}
          {fallbackNote}<span style={{ whiteSpace: 'nowrap' }}>まとめて答えました</span>
        </p>
      )}
      {showStageBlock || waitingHead ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* 親が role="log" aria-live なので、ここで二重に live 領域を作らない。 */}
          <div className="ai-thinking">
            <span className="ai-thinking-dot" aria-hidden="true" />
            <span>{STAGE_LABEL[stage] || (waitingHead ? STAGE_LABEL.generate : '答えを準備しています…')}</span>
          </div>
          <div className="ai-skeleton" aria-hidden="true">
            <div className="ai-skeleton-line" style={{ width: '88%' }} />
            <div className="ai-skeleton-line" style={{ width: '74%' }} />
            <div className="ai-skeleton-line" style={{ width: '62%' }} />
          </div>
          {/* 15 秒たっても 1 文字も来ないとき（止めるのは入力欄の右のボタン）。形の下に足すので、骨組みは動かさない。 */}
          {slow && (
            <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
              時間がかかっています。もう少しお待ちください
            </p>
          )}
        </div>
      ) : liveFused ? (
        <>
          {/* 1. 結論 → 2. 一歩（まだなら「答えを書いています…」を同じ場所に）→ 3. 根拠を見る（書き終わるまで押せない） */}
          <div style={readText}>
            {liveFused.conclusion.split('\n').filter((l) => l.trim()).map((l, i, arr) => (
              <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0, ...hangIndent(l) }}>{renderBoldInline(l)}{tail === 'conclusion' && i === arr.length - 1 && cursor}</p>
            ))}
          </div>
          {/* 一歩がまだの間は、一歩の箱と同じ形（面・1 行目に「答えを書いています…」・3 行・押せない「行動に追加」）で待つ
              （以前は 44 の「答えを書いています…」→ 約 130 の箱に変わって、下が 87px 跳ねていた・2026-09-29）。 */}
          {liveFused.action ? renderAction(liveFused, 'var(--space-4)') : (
            <div aria-hidden="true" style={{ marginTop: 'var(--space-4)', ...nextStepBox }}>
              {/* 1 行目は点つきの「答えを書いています…」（SPEC §3・骨組みだけだと何を待っているか分からない）。
                  高さは小さな見出し（subLabel: 12・行間 1.5・下 4）と同じにして、一歩が来たときに跳ねさせない。 */}
              <div style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-caption) * 1.5)', marginBottom: 'var(--space-1)' }}>
                <span className="ai-thinking" style={{ paddingBlock: 0 }}>
                  <span className="ai-thinking-dot" />
                  <span>{STAGE_LABEL.generate}</span>
                </span>
              </div>
              {/* 一歩はふつう 3 行（2 行だと、書き終わったときに「行動に追加」が一度上がってから下がっていた）。
                  書き始めてからも同じ 3 行ぶんを取っておく（renderAction の STEP_SKELETON_HEIGHT）。 */}
              {['92%', '84%', '56%'].slice(0, STEP_SKELETON_LINES).map((w) => (
                <div key={w} style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-read) * 1.6)' }}>
                  <SkeletonBlock width={w} height={14} />
                </div>
              ))}
              {(onAddAction || onAddActionPickBook) && (
                <button type="button" disabled tabIndex={-1} style={{ ...rowBtn, ...rowBtnOffOnFill, marginTop: 'var(--space-3)' }}>
                  <Target size={16} aria-hidden="true" />行動に追加
                </button>
              )}
            </div>
          )}
          {/* 「根拠を見る」は書いている間も同じ場所に見せ、書き終わるまで押せない（--text-3・aria-disabled・SPEC §3）。
              見えない場所取りにすると、書き終わった瞬間に行が現れて目が跳ねていた。 */}
          <button type="button" aria-disabled="true" tabIndex={-1} style={evidencePending}>
            <span>根拠を見る</span>
            <ChevronDown size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
          </button>
        </>
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
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(message.content)}</p>
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
              <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0, ...hangIndent(l) }}>{renderBoldInline(l)}</p>
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
      {renderRefund()}
      {/* 旧形式（見出しなし）でも行動化できるように */}
      {!parsed && canShowAction && !message.error && (
        actionAdded ? (
          <ActionAddedNote onOpenActions={onOpenActions} />
        ) : (
          // 答えのカード（--surface）の上なので、押せない間は副ボタンの押せない形（--separator の枠＋--text-3）。
          <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)', ...(actionBusy ? { color: 'var(--text-3)', borderColor: 'var(--separator)', opacity: 1, cursor: 'default' } : null) }}>
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
      style={{ minWidth: 0, maxWidth: '100%', minHeight: 44, margin: 'calc((var(--space-8) - 44px) / 2) 0', display: 'inline-flex', alignItems: 'center', padding: 0, background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', opacity: 1 }}
    >
      <span style={{
        minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', height: 'var(--space-8)', padding: '0 var(--space-3)',
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
    // 「すべてに戻す」を出すときは折り返さず、長い書名のチップの方を縮めて（… で省略）1 行に収める。
    <div style={{ display: 'flex', flexWrap: scoped && !showMode ? 'nowrap' : 'wrap', alignItems: 'center', columnGap: 'var(--space-2)', rowGap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4) 0', flexShrink: 0, minWidth: 0, borderTop: '1px solid var(--separator)' }}>
      <BarChip name="相談相手：" value={label} active={scoped} disabled={disabled} onClick={onOpen} />
      {showMode && (
        <BarChip name="答え方：" value={answerModeLabel(mode)} active={mode === 'perbook'} disabled={disabled} onClick={onOpenMode} />
      )}
      {scoped && !showMode && (
        <button type="button" onClick={onReset} disabled={disabled} style={{ ...uiBtnLink, margin: 'calc((var(--space-8) - 44px) / 2) 0', marginRight: 'calc(-1 * var(--space-1))', flexShrink: 0, whiteSpace: 'nowrap', ...(disabled ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}>
          すべてに戻す
        </button>
      )}
    </div>
  );
}

// 📚 答え方のシート（まとめて / 本ごとに）。行を押すと選んで閉じる＝右上は何も変えずに閉じる「キャンセル」
// （相談相手のシート・ほかのシートと同じ閉じ方・2026-09-29）。下の決定ボタンは無し。
// 行の形は相談相手のシートと同じ（選んだ行は右端のチェックだけ）。
function AnswerModeSheet({ value, onClose, onSelect }) {
  const rowStyle = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', minHeight: 56,
    borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    border: '1px solid var(--separator)', background: 'var(--surface)',
  };
  return (
    <BottomSheet title="答え方" onClose={onClose} dismissLabel="キャンセル">
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
      <p style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>{(countsLoading || pickable.length > 1) ? '本に絞る（複数選べます）' : '本に絞る'}</p>
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
                      <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{n > 0 ? `メモ ${n} 件` : 'この本のまとめあり'}</span>
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
              {/* 押せる行（枠つきのカード）と見分けがつくよう、枠のない 1 行の一覧にする。 */}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {notPickable.map((b, i) => (
                  <li key={b.id} style={{ display: 'flex', alignItems: 'center', minHeight: 44, borderTop: i > 0 ? '1px solid var(--separator)' : 'none', fontSize: 'var(--text-sub)', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}
