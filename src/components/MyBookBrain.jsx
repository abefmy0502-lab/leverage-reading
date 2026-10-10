// 💬 相談（旧称「マイ読書脳」・コード識別子は MyBookBrain のまま）— 自分のメモを根拠に答える AI。
//
// SPEC §3: 画面の中は会話だけ。上部は 1 行（何を根拠に答えるか＋履歴の時計＋「…」）。
//   会話（既定）/ 過去の相談（時計）/ 学びを書く・根拠にできる情報（「…」）
// 答えは「結論 → 明日からできる一歩（行動に追加）→ 根拠を見る（畳む）」の順に組み替えて見せる。
//
// chat_messages live in Supabase; book_memos with source_type='personal'
// are written for personal learnings and surface in the Review tab too.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { markActivation } from '../lib/activation';
import { supabase, isSupabaseConfigured, isDemo, demoScenario } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAllActions } from '../hooks/useAllActions';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { setConsultBackGuard } from '../lib/consultBack';
import { toMessage, toSaveMessage, OFFLINE_SAVE_MESSAGE } from '../lib/errors';
// 相談を送るときのオフラインの文（保存の文の「保存して」を「送って」に・2026-10-10）。
const OFFLINE_SEND_MESSAGE = 'オフラインです。つながってから、もう一度送ってください。';
import { streamMyBookBrain, prewarmKnowledge, invalidateKnowledgeCache, EVIDENCE_PREFIX } from '../lib/ai';
import { ensureAiConsent } from '../lib/aiConsent';
import { btnPrimary as uiBtnPrimary, btnPrimaryOff as uiBtnPrimaryOff, btnGhost as uiBtnGhost, btnText as uiBtnText, btnLink as uiBtnLink, groupTitle, fieldNote, input as uiInput } from '../styles/ui';
import { track, EVENTS } from '../lib/analytics';
import { LIMITS } from '../lib/limits';
import { answerActionStatus, rememberAnswerActionAdded } from '../lib/consultActionAdded';
import KnowledgeManager from './KnowledgeManager';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import TightBubble, { withPhraseBreaks } from './TightBubble';
import { createSendGuard } from '../lib/sendGuard';
import TokensOutCard, { trialCancelLineStyle } from './TokensOutCard';
import { SkeletonBlock } from './Skeleton';
import { X, MessageCircle, History, BookOpenCheck, Target, Check, RotateCw, MoreHorizontal, ChevronLeft, ChevronDown, ChevronRight, PencilLine, ArrowUp, Square, Plus, Minus, Sprout, Trash2 } from 'lucide-react';
import ContextMenu from './ContextMenu';
import { usePaywall } from '../state/PaywallContext';
import { nextResetLabelJa } from '../lib/freeTrial';
import { TOKEN_COSTS, monthDayLabelJa, remainingAnswersLabel } from '../lib/tokens';
import { shouldShowTrialNudge, trialNudgeCopy, isTrialNudgeDone, markTrialNudgeDone, normalizeTrialLabel, trialCancelShortLine } from '../lib/trialNudge';
import { getIntroOffer } from '../lib/iap';
import { firstAnswerTrialGroup, isFirstAnswerTrialMoment, canOfferFirstAnswerTrial, holdGrownNudge, firstAnswerTrialText, isFirstAnswerTrialDone, markFirstAnswerTrialDone } from '../lib/firstAnswerTrial';
import { shouldAskForReview, markReviewAsked, askForReview } from '../lib/reviewRequest';
import { isNotifyOptInDone, canOfferNotify, notifyPromptedWithin } from '../lib/notifyOptIn';
import { growthMeterText, firstAnswerEvidence, takeFirstConsult, takeMemosReached, getOnboardPath } from '../lib/firstDay';
import { composerChrome, answerEndScrollTop, isTouchUi } from '../lib/composerView';
import { useComposerHeight } from '../hooks/useComposerHeight';
import { NATIVE_KEYBOARD_EVENT } from '../lib/native';
import { encodeThreadRef, isThreadRef, threadRootOf, groupConsults, threadScopeOf, threadTitleOf, lastConsultThread } from '../lib/consultThreads';
import { buildConsultExamples, standaloneAction, shortTitle, hasSummaryMemo, countSummaryMemos, fmtTokens, consultsLeft, memoSearchQuery, answerStepToAction, stripScenePrefix, selectThreadTurns, isCompletedAnswer, parseAskSection, nextStepChips, wantsAction, isBookLookup, lookupTerm, shouldDecide, countAsks, askProgressText, answerAsks, lensOf, usedLenses, isWorkConsult, LENS_NEXT_LINE } from '../lib/consultHelpers';
import LibrarySearchHit from './LibrarySearchHit';
import { buildSnippet, compileTerms, splitQuery } from '../lib/librarySearch';
import { tomorrowLocal } from '../lib/dates';
import { QUOTE_PREFIX, decodeQuoteRefs, stripQuotes, stripPageRefs } from '../lib/evidenceCheck';
import NotifyOptInCard from './NotifyOptInCard';
import MemoAnswer from './MemoAnswer';
import { runMemoAnswer } from '../lib/memoAnswerRun';
import { loadAllMemoRows, withCachedMemos } from '../hooks/useAllMemoRows';
import { useAppDataCache } from '../state/AppDataCache';

// ホーム・本の詳細・すべての本の検索から渡される「最初の一手」（preset）は、App 側では
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
import PartnerAvatar, { PartnerRow, PartnerBooksSheet, AVATAR_SIZE, AVATAR_SIZE_SMALL } from './PartnerAvatar';
import { consultPartner, partnerFromScope, bookForRef, shelfBookForTitle, withVoice, decodeVoice, encodeVoice, perbookSummaryPartner, VOICE_PREFIX } from '../lib/consultPartner';
import { fetchAllRows } from '../lib/fetchAllRows';

// 1 文字も出る前に「止める」を押したときの答え（履歴にもこの文で残る）。
const STOPPED_EMPTY = '回答を中止しました。';
// 💬 メモが答える相談（AI を使わない答え・2026-10-01）のやりとりは、画面の上だけに置く（local: true・id は memo-）。
//   chat_messages には保存しない＝過去の相談・続きの相談の文脈（threadBlock）・相談例の「前に相談した…」に入れない。
//   「新しい相談をはじめる」で消える（アプリを開いている間は、ほかのタブへ移って戻っても残る）。
const isLocalMsg = (m) => !!(m && (m.local || /^memo-/.test(String(m.id))));

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
// 答えが返らなかったときの題と説明（ErrorMessage で出す・2026-09-29）。
const ANSWER_FAILED_TITLE = '答えを書けませんでした';
const ANSWER_FAILED_DESC = '少し時間をおいて、送り直してください。';
const topRow = { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 52, paddingTop: 'var(--space-1)', paddingBottom: 'var(--space-1)', paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-4)' }; // 押し込まれた画面で paddingTop だけ上書きするので、個別の指定で書く（padding と混ぜない＝React の警告）
const iconBtn = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 999, color: 'var(--text-2)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0 };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const headingStyle = { fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 };
// 相談例＝チップ（--fill 面・枠なし。入力欄と見分けがつくように。ホームと同じ）。
// 深掘りのチップ（入力欄の上の 1 行・DESIGN §5 操作のチップ＝高さ 44・15/--text・--fill・枠なし）。
// どのときも折り返して並べる（followupRowWrap・横に送ると端のチップが切れていた・2026-10-09 ui-critic・DESIGN §5）。
const followupRow = { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4) 0', flexShrink: 0, borderTop: '1px solid var(--separator)' };
const followupChip = { flexShrink: 0, minHeight: 44, padding: 'var(--space-2) var(--space-3)', background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'nowrap' };
const decideChip = { ...followupChip, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' };
// チップの行（折り返す・間 8 は縦横とも）。
const followupRowWrap = { ...followupRow, flexWrap: 'wrap', rowGap: 'var(--space-2)' };
// 選んだ相談例（初日の下書き・DESIGN §5 の操作のチップの選択中＝--accent-soft の面＋--accent の文字 600）。
const chipPicked = { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 };
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
// 内側は上下左右 12（カードの内側 16 の中にもう一段 16 を取ると、一歩の文が 1 行 10 字ほどで折り返して短すぎた・2026-09-30 ui-critic）。
const nextStepBox = { background: 'var(--fill)', borderRadius: 'var(--radius)', padding: 'var(--space-3)' };
// 🎯 あなたに聞きたいこと（2026-09-30）: 問いはふつう 1〜2 行。書いている間は 2 行ぶんを取っておく（行動の箱と同じ考え方）。
const ASK_SKELETON_LINES = 2;
const ASK_SKELETON_HEIGHT = `calc(var(--text-read) * 1.6 * ${ASK_SKELETON_LINES})`;
const ASK_LABEL = 'あなたに聞きたいこと';
// --fill の面（一歩・問いの箱）の上の骨組みは --separator の棒（ふつうの骨組みの色は --fill と同じ明るさで、暗い画面で見えなかった・
// 2026-09-30 ui-critic）。光の流れは --separator ↔ --fill で残す。
const skeletonOnFill = { background: 'linear-gradient(90deg, var(--separator) 0%, var(--fill) 50%, var(--separator) 100%)', backgroundSize: '200% 100%' };
// 行動を決めた答えか（「心に残るもの」は行動ではない）。「行動を決める」のチップを出すかの判断に使う。
const isActionAnswer = (p) => !!(p && p.action) && !/心に残る/.test(p.actionLabel || '');
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
  return s.startsWith(EVIDENCE_PREFIX) || s.startsWith(GROWTH_PREFIX) || s.startsWith(QUOTE_PREFIX) || s.startsWith(REFUND_PREFIX) || s.startsWith(ACTED_PREFIX) || s.startsWith(VOICE_PREFIX) || isThreadRef(s);
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

// 答えの吹き出しの列の左端（相手のアイコン 32 ＋ 間 8）。答えの下の文字ボタン・注記もこの列にそろえる（2026-09-30）。
const ANSWER_COLUMN = `calc(${AVATAR_SIZE}px + var(--space-2))`;
// 語り口の答えの最後にいつも出す一行（13/--text-3）。名前の行の「（本の語り口で・AI）」と合わせて、閉じられる案内は置かない（2026-09-30 オーナー判断）。
const VOICE_FOOT_TEXT = 'AI が本とあなたのメモから語り口をまねた答えです';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 過去の相談の日時は「M月D日 HH:mm」（ほかの画面の日付と同じ書き方・今年でなければ年を前に・2026-09-30）。
  const year = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : '';
  return `${year}${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
// onDirtyChange: 書きかけ（本文かタグがある）かどうかを親に知らせる（「‹ 相談」・戻るで黙って消さない・2026-09-30）。
function LearningInline({ onSaved, onDirtyChange, initialTags = null }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const textRef = useRef(null);
  // 開いたらすぐ書けるように、本文の欄にカーソルを置く（描き終えた次のフレームで・画面は動かさない）。
  useEffect(() => {
    const raf = requestAnimationFrame(() => { try { textRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ } });
    return () => cancelAnimationFrame(raf);
  }, []);
  // ＋ 分類・タグ（最初は閉じる＝本文と保存だけを見せる。QuickMemoSheet の「＋ 詳しく」と同じ）。
  const [moreOpen, setMoreOpen] = useState(() => !!initialTags?.length);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(() => (Array.isArray(initialTags) ? initialTags.filter(Boolean) : []));
  const [busy, setBusy] = useState(false);
  const dirty = text.trim().length > 0 || tagInput.trim().length > 0;
  const dirtyCbRef = useRef(onDirtyChange);
  useEffect(() => { dirtyCbRef.current = onDirtyChange; });
  useEffect(() => { dirtyCbRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => { dirtyCbRef.current?.(false); }, []);

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
      // タグの欄に書いたまま「追加」を押さずに保存しても、そのタグを落とさない（黙って消えていた・2026-10-04）。
      const pending = tagInput.trim();
      const allTags = pending && !tags.includes(pending) ? [...tags, pending] : tags;
      const tagsWithCategory = [`@${category}`, ...allTags];
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
      dirtyCbRef.current?.(false);
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
          ref={textRef}
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
              <label htmlFor="learning-tag" style={label}>タグ<span style={fieldNote}>（任意）</span></label>
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
// barSlot: App のサブタブ（相談｜AI 選書）の行の右端の要素。会話の 🕒・… はそこへ出す（上の操作を 3 段に積まない・2026-10-01 ui-critic）。
export default function MyBookBrain({ onOpenBook, books = [], onAddAction, onBooksMutated, onAddActionPickBook, onGoBookshelf, onQuickstart, onAddBook, onOpenActions, askPreset, scopePreset, onPushedViewChange, onSearchMemos, barSlot = null }) {
  const { user } = useAuth();
  // ⚡ タブを開いた瞬間に知識スキャン（gatherKnowledge）を裏で開始 — 最初の質問時には
  // キャッシュ済みで、RAG 構築の待ち時間（数百ms〜数秒）が消える。
  useEffect(() => { prewarmKnowledge(user?.id); }, [user?.id]);
  const toast = useToast();
  const confirm = useConfirm();
  const cache = useAppDataCache();
  // 🪙 プランと残りのトークン（src/lib/tokens.js・止めるのはサーバー）。上部に 1 行「今月の残り N トークン」。
  //    無料プラン（相談だけ）で使い切ったら、答えの下で静かに案内＋有料プランの画面へ。
  const { plan, freeMode, trialEndsAt, tokensRemaining, tokenAllowance, freeFirstMonth, tokenNextAllowance, purchasedTokens, tokensAvailable, canBuyTokens, openTokenSheet, refreshTokens, openPaywall, hadPlan } = usePaywall();
  const [monthLimitHit, setMonthLimitHit] = useState(false); // トークンの上限に達した（サーバーの 429）
  // 🪙➕ トークンを買い足したら、上限の状態を解く（送れるように戻す）。
  useEffect(() => { if (purchasedTokens > 0) setMonthLimitHit(false); }, [purchasedTokens]);
  const freeUsedUp = freeMode && tokensAvailable != null && tokensAvailable <= 0;
  // 上部の 1 行の言葉: 無料のトークンを使い切ったら AI ではなくメモから探す（メモが答える相談）ので「から探します」。
  const answerVerb = freeUsedUp ? 'から探します' : 'から答えます';
  // プランの人（有料・無料期間）がトークンを使い切った（サーバーの 429 か、残りが 0）。
  const planOut = canBuyTokens && (monthLimitHit || (tokensAvailable != null && tokensAvailable <= 0));
  const outOfTokens = monthLimitHit || planOut;
  // 無料期間が終わる日（「◯月◯日から、毎月 800 トークン使えます」）。分からなければ空。
  const trialEndLabel = plan === 'trial' ? monthDayLabelJa(trialEndsAt) : '';
  const trialCancelLine = plan === 'trial' ? trialCancelShortLine(trialEndsAt) : '';
  const [view, setView] = useState('chat'); // 'chat' | 'learning' | 'history' | 'knowledge'
  // 押し込まれた画面（過去の相談・学びを書く・根拠にできる情報）のあいだは、親がサブタブを隠せるように知らせる
  // （見出しが 3 段に重ならないように）。離れるときは必ず false に戻す。
  const pushedCbRef = useRef(onPushedViewChange);
  useEffect(() => { pushedCbRef.current = onPushedViewChange; });
  const isPushed = view !== 'chat';
  useEffect(() => { pushedCbRef.current?.(isPushed); }, [isPushed]);
  useEffect(() => () => { pushedCbRef.current?.(false); }, []);
  // 学びを書く画面の書きかけ（LearningInline が知らせる）。離れる前に「編集を続ける／書いたことを消す」を確かめる
  // （「‹ 相談」・ブラウザの戻る・左端スワイプのどれでも黙って消さない・2026-09-30）。
  const learningDirtyRef = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const leaveLearning = useCallback(async () => {
    if (viewRef.current !== 'learning' || !learningDirtyRef.current) return true;
    const ok = await confirm({
      title: '書きかけの学びがあります',
      message: '消すと、元に戻せません。',
      confirmLabel: '書いたことを消す',
      cancelLabel: '編集を続ける',
      danger: true,
    });
    if (ok) learningDirtyRef.current = false;
    else {
      // 「編集を続ける」: 本文の欄にカーソルを戻す（ダイアログを閉じたあと・画面は動かさない・2026-09-30）。
      setTimeout(() => {
        try { document.getElementById('learning-text')?.focus({ preventScroll: true }); } catch { /* ignore */ }
      }, 0);
    }
    return !!ok;
  }, [confirm]);
  // App の左端スワイプ・ブラウザの戻るは、戻る前にここで確かめる（lib/consultBack.js）。
  useEffect(() => setConsultBackGuard(leaveLearning), [leaveLearning]);
  const backToChat = useCallback(async () => {
    if (await leaveLearning()) setView('chat');
  }, [leaveLearning]);
  // ブラウザ / Android の「戻る」（App の useHistoryBack）は「‹ 相談」と同じく会話へ戻す。
  useEffect(() => {
    const onBack = () => { backToChat(); };
    window.addEventListener('orime:consult-back', onBack);
    return () => window.removeEventListener('orime:consult-back', onBack);
  }, [backToChat]);
  // 💬 無料のトークンを使い切ったら、メモが答える相談のために自分のメモを先に読んでおく（送ったらすぐ答える）。
  useEffect(() => { if (freeUsedUp && user?.id) loadAllMemoRows(user.id); }, [freeUsedUp, user?.id]);
  // 同じアプリの起動中に戻ってきたら、前の会話と相談相手をそのまま出す（上の session）。
  const resumed = useRef(sessionFor(user?.id)).current;
  const [messages, setMessages] = useState(() => (resumed
    ? resumed.messages
      .filter((m) => !m.streaming && !/^(streaming|bg-wait)-/.test(String(m.id)))
      // メモの答えを探している途中で離れたときは「もう一度」を出す（探す処理は画面と一緒に終わっている）
      .map((m) => (m.memoAnswer?.status === 'loading' ? { ...m, memoAnswer: { ...m.memoAnswer, status: 'error' } } : m))
    : []));
  useEffect(() => { rememberSession(user?.id, { messages }); }, [messages, user?.id]);
  // 過去の相談の「この相談の続きを聞く」（2026-09-29）: 持ってきた前の相談を会話のいちばん上に出し、
  // 次の相談にだけ文脈として渡す（streamMyBookBrain の prior）。{ id, question, answer, at, used }
  const [carry, setCarry] = useState(() => (resumed?.carry || null));
  useEffect(() => { rememberSession(user?.id, { carry }); }, [carry, user?.id]);
  // 🧵 過去の相談の「この続きを相談する」（2026-10-08）: その会話のやりとり（相談と答えの id）を今の会話として並べる。
  //   { ids, title }。「新しい相談をはじめる」・入力欄の上の × で外す。続けて送ると直前の会話を最大 3 往復渡す（threadBlock）。
  const [resumeThread, setResumeThread] = useState(() => (resumed?.resumeThread || null));
  const focusOnResumeRef = useRef(false);
  useEffect(() => { rememberSession(user?.id, { resumeThread }); }, [resumeThread, user?.id]);
  const [input, setInput] = useState('');
  // 送れなかったときの 1 行（会話の場所のいちばん下に出す・入力欄に重なる赤い帯にしない・2026-10-10）。次に送るときに消す。
  const [sendNotice, setSendNotice] = useState('');
  useEffect(() => {
    if (!sendNotice) return;
    try { messagesEndRef.current?.scrollIntoView({ block: 'end' }); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendNotice]);
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
  // 数えている途中（上部の行を、数が出るまで見えない形で取っておく＝文が入れ替わって見えないように）。
  const [scopeCountPending, setScopeCountPending] = useState(() => scopeIds.length > 0 && !!user?.id && isSupabaseConfigured);
  useEffect(() => {
    if (!scopeIds.length || !user?.id || !isSupabaseConfigured) { setScopeCardCount(null); setScopeCountPending(false); return undefined; }
    let alive = true;
    setScopeCountPending(true);
    (async () => {
      let count = null;
      try {
        ({ count } = await supabase.from('book_memos').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).in('book_id', scopeIds));
      } catch { /* 数えられなければ「選んだ本のメモから答えます」 */ }
      if (alive) { setScopeCardCount(typeof count === 'number' ? count : null); setScopeCountPending(false); }
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
  // 「行動に追加」した答えの id（会話が一区切りついたことを見せる・2026-10-08）。
  const [addedActionIds, setAddedActionIds] = useState([]);
  // 🧪 はじめての相談の答えのあとの 7 日間無料（lib/firstAnswerTrial.js・2026-10-08・実験）。
  //   組はユーザー ID から決まる（'show' ＝ 見せる・'hold' ＝ 見せない＝比べる側）。お試しモードは &trialab=on|off のときだけ
  //   （付けなければ実験に入れない＝ほかの撮影を変えない）。
  const trialAbGroup = useMemo(() => {
    if (isDemo) {
      const v = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('trialab');
      return v === 'on' ? 'show' : v === 'off' ? 'hold' : null;
    }
    return firstAnswerTrialGroup(user?.id);
  }, [user?.id]);
  // カードを出す答えの id（その答えの下に 1 回だけ）と、この画面で一度出したか（出した画面では ③ を出さない）。
  const [firstTrialId, setFirstTrialId] = useState(null);
  const [firstTrialSeen, setFirstTrialSeen] = useState(false);
  // 答えが出きったときに読む、そのときの値（askOnce は送ったときの描画の値を持つので ref で最新を読む）。
  const firstTrialRef = useRef({});
  // 🎯 相談の答えから行動を追加した直後（2026-10-08・マーケ戦略 §6-5）:
  //   ①その答えの下に、思い出しの通知の案内を 1 回だけ（NotifyOptInCard）
  //   ②はじめての 1 回だけ、App Store のレビューを頼む（lib/reviewRequest.js・iOS は Apple の仕組みだけ・一度だけ）。
  //     「自分の相談から、やることが決まった」＝価値を感じた直後（前は思い出しカードの「覚えた」の直後）。
  //     追加の印（「行動に追加しました」）が見えてから頼む。
  const onConsultActionAdded = (answerId) => {
    setOptinAfterId((cur) => cur || answerId);
    //   通知の案内（と許可の確認）と同じ時には頼まない（2026-10-10）: この答えの下に案内が出る／この 1 分に案内を出した・
    //   許可を聞いたときは見送り、次に行動を追加したときに頼む（頼んだ印は、頼んだときだけ付ける）。
    if (shouldAskForReview() && !notifyPromptedWithin()) {
      (async () => {
        let optinNow = false;
        try { optinNow = !isNotifyOptInDone() && await canOfferNotify(); } catch { optinNow = false; }
        if (optinNow) return;
        setTimeout(() => {
          if (notifyPromptedWithin() || !shouldAskForReview()) return;
          markReviewAsked();
          askForReview(toast);
        }, 1500);
      })();
    }
  };
  // 🧠→🎯 回答の行動を、紐づく本の行動リストへ追加。
  const handleAnswerToAction = useCallback(async (bookId, text) => {
    if (!onAddAction || !bookId || !text) return false;
    // 相談の「明日からできる…」なので期限は明日を既定にする（期限なしだと一覧の最後に沈む）。
    // 「〜してみてください」の呼びかけは、行動リストの言い切りの形に直す。
    const tomorrow = tomorrowLocal();
    //   「残してください」→「残す」・「確認してください」→「確認する」（lib/consultHelpers.js の answerStepToAction）。
    //   長い一歩の頭の「「上司への報告」の場面で、」は外す（行動の一覧で 2〜3 行に伸びて、肝心の一歩が埋もれる・2026-09-29）。
    const plain = stripScenePrefix(answerStepToAction(text));
    // 追加できたことは答えの中の「行動に追加しました」で伝える（同じ文をトーストで重ねない）。
    return onAddAction(bookId, { text: plain, sourceMemoId: null, sourcePage: null, deadline: tomorrow, source: 'consult' });
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
  // 戻ってきたときは前に数えた件数をすぐ出す（上部の「あなたのメモ N 件から答えます」が数え直すまで空かないように）。
  const [memoStats, setMemoStats] = useState(() => resumed?.memoStats || { cards: 0, summaries: 0, personal: 0, summaryBooks: 0 });
  const [memoStatsLoaded, setMemoStatsLoaded] = useState(() => !!resumed?.memoStats);
  // メモの件数を数えられなかった（通信断など）。0 件と取り違えて「まだメモがありません」を出さない。
  const [memoStatsFailed, setMemoStatsFailed] = useState(false);
  // 自分のメモの件数（はじめての相談の計測 first_consult_sent に添える・数えている途中は -1）。
  const ownMemoTotalRef = useRef(-1);
  // 🌱 初日の「相談してみる」で入力欄に入れた相談（2026-10-02・askPreset.from === 'firstDay'）。送るまでは、見出しと
  //   「たとえば」を出したまま、入れた相談を選んだ状態で見せる（ふだんの下書きは入力欄だけを主役にする）。
  const [firstDayDraft, setFirstDayDraft] = useState(null);
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
  // 📏 送ったら、相談の吹き出しを会話欄の上端へ 1 回のなめらかな送りで揃えるための「下の余白」（2026-09-29）。
  //   答えが短いうちは欄の下に届かず、上端まで送れない（途中で止まって、答えが伸びるたびに追いかけて 2 段で動いていた）。
  //   会話のいちばん下に余白を置き、「相談の吹き出しから下」が欄の高さ（−上の余白 16）に満たない分だけ埋める。
  //   答えが伸びた分だけ余白が縮むので全体の高さは変わらない（書き終わっても縮んで跳ねない）。次に送るまで残す。
  //   新しい会話（「新しい相談をはじめる」）で外す。
  const reserveRef = useRef(!!resumed?.reserve);
  // 行動を決める回を書き終えたら、一歩の箱（行動に追加まで）を見せる（ask が立て、書き終えた描画のあとで送る）。
  const revealStepRef = useRef(false);
  const spacerRef = useRef(null);
  const messagesColRef = useRef(null);
  const sizeSpacer = useCallback(() => {
    const el = chatScrollRef.current;
    const sp = spacerRef.current;
    if (!el || !sp) return;
    const cur = sp.offsetHeight;
    const target = reserveRef.current ? alignTarget(el) : null;
    let need = 0;
    if (target) {
      const gap = parseFloat(getComputedStyle(el).getPropertyValue('--space-4')) || 16;
      const targetTop = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      need = Math.max(0, Math.ceil(targetTop - gap + el.clientHeight - (el.scrollHeight - cur)));
    }
    if (need !== cur) sp.style.height = need > 0 ? `${need}px` : '0px';
  }, []);
  // 答えを待つ時間が長いとき（8 秒たっても 1 文字も来ない）に、静かな 1 行を出す（2026-09-29・15 秒 → 8 秒）。
  const [slowWait, setSlowWait] = useState(false);
  const gotTextRef = useRef(false);
  // 入力欄は書いた量に合わせて伸びる（空は 1 行 44・5 行を超えたら中を送る＝上限は CSS の max-height・2026-10-08）。
  const inputRef = useRef(null);
  // ⌨️ 入力欄にカーソルがある間（2026-10-08）: 深掘りのチップの行と相談相手・答え方の行を隠し、答えと自分の文に場所を譲る。
  //   以前は「文字が入っている間」だけ隠していたので、カーソルを置いただけの間はチップが出たままだった（オーナーの iPhone）。
  const [inputFocused, setInputFocused] = useState(false);
  // 指で使う端末（キーボードが画面に出る）だけ、カーソルがある間に上の行を隠す。マウスの端末は文字がある間だけ（今までどおり）。
  const touchUi = useMemo(() => isTouchUi(), []);
  // iOS のアプリでは、キーボードが本当に開いているか（lib/native.js の知らせ）。知らせが来るまでは null＝カーソルだけで決める。
  //   カーソルを置いてもキーボードが出ない（画面を開いたときに置いたカーソル）間に、チップを隠したままにしない。
  const [nativeKb, setNativeKb] = useState(null);
  useEffect(() => {
    const on = (e) => setNativeKb(!!e?.detail?.open);
    window.addEventListener(NATIVE_KEYBOARD_EVENT, on);
    return () => window.removeEventListener(NATIVE_KEYBOARD_EVENT, on);
  }, []);
  const blurTimerRef = useRef(0);
  // 描く前に高さを合わせる（useEffect だと、送ったあとに「消えた文字の高さのまま 1 回描く → 縮む」で
  // 入力欄が 2 回動いていた）。
  // 文字の大きさが変わったときも測り直す（hooks/useComposerHeight.js・2026-10-08 ui-critic）。
  useComposerHeight(inputRef, input, view === 'chat');

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
      // 答えを送ったときの相談相手（アイコン用・画面の上だけで持つ）も消さない。
      const scopes = new Map(prev.filter((m) => Array.isArray(m.scopeIds)).map((m) => [m.id, m.scopeIds]));
      const merged = (labels.size || scopes.size)
        ? hist.map((m) => ({ ...m, ...(labels.has(m.id) ? { scopeLabel: labels.get(m.id) } : null), ...(scopes.has(m.id) ? { scopeIds: scopes.get(m.id) } : null) }))
        : hist;
      const rest = prev.filter((m) => !ids.has(m.id));
      const all = [...merged, ...rest];
      // メモが答える相談（画面の上だけのやりとり）があるときは、時刻の順に並べ直す（読み直した履歴の後ろに回さない）。
      return rest.some(isLocalMsg) ? all.sort((x, y) => String(x.createdAt || '').localeCompare(String(y.createdAt || ''))) : all;
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
  // 境界は描く前（useLayoutEffect）に決める。useEffect だと、履歴が届いた最初の 1〜3 コマだけ
  // 前の会話（端末に残っていた古い境界より後のやりとり）が見えてから消えていた（2026-09-29）。
  const freshOnMountRef = useRef(false);
  useLayoutEffect(() => {
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
      const nextStats = {
        cards: Math.max(0, (cardsRes.count || 0) - (personalRes.count || 0)),
        personal: personalRes.count || 0,
        summaries: summariesCount,
        summaryBooks: booksFieldsRes.error ? 0 : (booksFieldsRes.data || []).filter(hasSummaryMemo).length,
      };
      setMemoStats(nextStats);
      rememberSession(user?.id, { memoStats: nextStats });
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
      // 行動を決める回は、相談の吹き出しを揃え直す代わりに、一歩の箱（行動に追加まで）を見せる
      // （揃え直しのなめらかな送りが、見せる送りを打ち消していた・2026-09-30 ui-critic）。
      const reveal = revealStepRef.current;
      revealStepRef.current = false;
      if (userScrolledRef.current) return;
      const el = chatScrollRef.current;
      if (!el) return;
      if (reveal) { revealLastNextStep(el); return; }
      const top = questionAlignTop(el);
      if (top == null || Math.abs(top - el.scrollTop) < 2) return;
      el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, 60);
  }, [busy, view]);
  // 書いている間: 答えが伸びて相談の吹き出しがまだ上端に届いていなければ、届くところまでついていく
  // （答えの書かれている行が欄の下に隠れないように）。上端に届いたらそこで止まる。
  useEffect(() => {
    if (!busy || view !== 'chat' || userScrolledRef.current) return;
    // 下の余白（reserveRef）で上端まで送れるときは、送った直後の 1 回で揃っている（追いかけない＝2 段で動かさない）。
    if (reserveRef.current) return;
    if (Date.now() - sentAtRef.current < 500) return; // 送った直後のなめらかな送りを邪魔しない
    const el = chatScrollRef.current;
    if (!el) return;
    const top = questionAlignTop(el);
    if (top != null && top > el.scrollTop + 1) el.scrollTop = top;
  }, [messages, busy, view]);
  // 8 秒たっても 1 文字も来なければ、静かな 1 行（止めるボタンは入力欄の右にそのまま）。
  useEffect(() => {
    if (!busy) { setSlowWait(false); return undefined; }
    const t = setTimeout(() => { if (!gotTextRef.current) setSlowWait(true); }, 8000);
    return () => clearTimeout(t);
  }, [busy]);
  // 余白は描く前に測り直す（送った直後の送りより先に、上端まで送れる高さにしておく）。
  useLayoutEffect(() => {
    if (view === 'chat') sizeSpacer();
  }, [messages, busy, view, sizeSpacer]);
  // 答えの中を開いた（根拠を見る）・欄の高さが変わった（キーボード）ときも測り直す。
  useEffect(() => {
    if (view !== 'chat' || typeof ResizeObserver === 'undefined') return undefined;
    const el = chatScrollRef.current;
    const col = messagesColRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => sizeSpacer());
    ro.observe(el);
    if (col) ro.observe(col);
    return () => ro.disconnect();
  }, [view, sizeSpacer]);
  // ⌨️ 書いている間も、読みたい答えの終わりが見えるように（2026-10-08）。
  //   カーソルを置いたら最新の答えの終わりまで送る。キーボードが上がって欄が縮んだとき・入力欄が伸びたときは、
  //   その前に答えの終わりが見えていたときだけ見えたままにする（自分で上へ戻して読んでいる場所は奪わない）。
  const forceEndUntilRef = useRef(0);
  // 最後の答えが問いで終わっているか（描くたびに入れる）。
  const lastAsksRef = useRef(false);
  const keepAnswerEnd = useCallback((prevClientHeight) => {
    const el = chatScrollRef.current;
    const end = messagesEndRef.current;
    if (!el || !end) return;
    const forcedNow = Date.now() < forceEndUntilRef.current;
    // 最後の答えが問い（あなたに聞きたいこと）なら、返事を書く相手＝問いの箱の上端を欄の上 8 に合わせる
    //   （答えの終わりに合わせると、問いの箱が上へ押し出されて見えなかった・2026-10-08 ui-critic）。
    //   欄が縮んでも上端の位置は変わらないので、合わせるのはカーソルを置いたとき（とキーボードが上がりきるまで）だけ。
    if (lastAsksRef.current) {
      const boxes = el.querySelectorAll('[data-ask-box]');
      const box = boxes[boxes.length - 1];
      if (box) {
        if (!forcedNow && prevClientHeight != null) return;
        const gap = parseFloat(getComputedStyle(el).getPropertyValue('--space-2')) || 8;
        const want = Math.max(0, Math.round(box.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - gap));
        if (Math.abs(want - el.scrollTop) > 1) el.scrollTop = want;
        return;
      }
    }
    const endOffset = end.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    if (!forcedNow && prevClientHeight != null && endOffset > el.scrollTop + prevClientHeight + 2) return;
    const top = answerEndScrollTop({ scrollTop: el.scrollTop, clientHeight: el.clientHeight, endOffset, pad: 8 });
    if (top != null) el.scrollTop = top;
  }, []);
  useEffect(() => {
    if (view !== 'chat' || !inputFocused || typeof ResizeObserver === 'undefined') return undefined;
    const el = chatScrollRef.current;
    if (!el) return undefined;
    let last = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const prev = last;
      last = el.clientHeight;
      if (last < prev) keepAnswerEnd(prev);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, inputFocused, keepAnswerEnd]);
  const onInputFocus = () => {
    clearTimeout(blurTimerRef.current);
    setInputFocused(true);
    // キーボードが上がりきるまで（iOS で約 0.3 秒）は、縮むたびに答えの終わりへ。
    forceEndUntilRef.current = Date.now() + 700;
    requestAnimationFrame(() => keepAnswerEnd(null));
  };
  // iOS の WKWebView は、送ったあと・アプリに戻ったときなどに blur → focus を続けて送ることがある。
  // 少し待って、まだ入力欄から外れていたら戻す（チップが一瞬出て消える・押した指の下に現れるのを防ぐ）。
  const onInputBlur = () => {
    clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      if (typeof document !== 'undefined' && document.activeElement === inputRef.current) return;
      setInputFocused(false);
    }, 200);
  };
  useEffect(() => () => clearTimeout(blurTimerRef.current), []);
  // 入力補助のバー（∧∨✓）を消したので、会話の何もないところを押したらキーボードを閉じる（押せる部品・文字を選ぶ操作は除く）。
  const onChatTap = (e) => {
    if (!inputFocused) return;
    const t = e.target;
    if (t && typeof t.closest === 'function' && t.closest('button, a, summary, input, textarea, select, label, [role="button"], [role="link"], [tabindex]')) return;
    try { if (window.getSelection && String(window.getSelection())) return; } catch { /* ignore */ }
    inputRef.current?.blur();
  };
  const prevMsgCountRef = useRef(0);
  const historyHydratedRef = useRef(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // メモが答える相談を送ったとき（busy にならない）も、相談の吹き出しを上端にそろえる。
  const alignNextRef = useRef(false);
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
      const align = busyRef.current || alignNextRef.current;
      alignNextRef.current = false;
      const top = align ? questionAlignTop(el) : null;
      el.scrollTo({ top: top != null ? top : el.scrollHeight, behavior });
    }, 30);
  }, [messages, view, historyLoaded]);

  // 💡 相談例（AI 呼び出し無し・即時）。「何を聞けばいいか分からない」という最初の摩擦を消す。
  //   すべての本: 前の相談の続き → 本の「現在の課題」→ メモのある本 → よくある困りごと（lib/consultHelpers.js・ホームと共通）
  //   本に絞ったとき: その本からだけ作る（ほかの本の例を出さない）
  // 前の相談（答えが返ったもの）。「前に相談した「…」、その後どう進める？」と、押したときに開く会話に使う。
  //   🧵 会話のはじめの相談から作る（最後の返事「会議の前」を拾わない・lib/consultThreads.js の lastConsultThread・2026-10-08 ui-critic）。
  const lastConsult = useMemo(() => lastConsultThread(messages, {
    skip: (m) => isLocalMsg(m) || /^(err|streaming|bg-wait)-/.test(String(m.id)),
    isDone: (a) => isCompletedAnswer(a) && a.content !== STOPPED_EMPTY,
  }), [messages]);
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
      // 行動は会話で決める（2026-09-30）ので、最初から「一歩を提案して」とは頼まない例にする。
      qs.push('この本の考え方を、いまの仕事に当てはめたい');
      return qs.slice(0, 3).map((text) => ({ text, kind: 'book' }));
    }
    // メモの件数は下の ownMemoTotal と同じ数え方（ここより後で定義しているので、ここで数える）。
    const memoCount = memoStatsLoaded ? memoStats.cards + memoStats.personal + (memoStats.summaryBooks || 0) : null;
    // この 7 日でふりかえりを書いて完了した行動があれば、1 つ目の例を「やってみた「…」、次はどうする？」に。
    return buildConsultExamples({ books, memoBookIds, lastConsult, count: 3, memoCount, actions: allActions, freeUsedUp });
  }, [books, scopeIds, memoBookIds, lastConsult, memoStatsLoaded, memoStats, allActions, freeUsedUp]);

  // 初日の下書き: 入れた相談が相談例に無ければ先頭に足す（選んだ状態で見せるため・3 つまで）。
  const introExamples = useMemo(() => {
    if (!firstDayDraft || examples.some((e) => e.text === firstDayDraft)) return examples;
    return [{ text: firstDayDraft, kind: 'draft' }, ...examples].slice(0, 3);
  }, [examples, firstDayDraft]);

  // 💬 メモが答える相談（2026-10-01・lib/memoAnswer.js）: 画面の上だけに相談と答えを置き、自分のメモから一節を選ぶ。
  //   AI は使わない（/api/claude を呼ばない・トークンを使わない）。答えは id の行（memoAnswer）を入れ替える。
  //   searchQ: 探すときの言葉（会話の続きでは、はじめの相談＋いまの言葉・askFromMemos）。無ければ q。
  const runMemoAnswerInto = async (answerId, q, bookIds, searchQ = null) => {
    const sq = searchQ && searchQ !== q ? searchQ : null;
    setMessages((arr) => arr.map((m) => (m.id === answerId
      ? { id: answerId, role: 'assistant', content: '', refs: [], createdAt: m.createdAt || new Date().toISOString(), local: true, scopeIds: bookIds, memoAnswer: { status: 'loading', question: q, ...(sq ? { searchQuestion: sq } : {}) } }
      : m)));
    const result = await runMemoAnswer({
      question: sq || q,
      books,
      scopeIds: bookIds,
      loadMemos: async () => {
        const r = await loadAllMemoRows(user.id);
        return r.rows ? { rows: withCachedMemos(r.rows, books, cache), error: null } : r;
      },
    });
    setMessages((arr) => arr.map((m) => (m.id === answerId ? { ...m, memoAnswer: { ...result, question: q, ...(sq ? { searchQuestion: sq } : {}) } } : m)));
    track('brain_memo_answer', { ok: result.status === 'ready', books: result.groups?.length || 0 });
  };
  // 🔎 本を探す問い（「『…』みたいなことを書いた本はどれ？」）は、まず端末の中で自分のメモから探す（2026-10-01・原価を下げる）。
  //   見つかれば、メモが答える相談と同じ形（本とメモの一節・押すとそのメモ）で答える＝AI を呼ばない・トークンを使わない。
  //   見つからなければ false を返し、今までどおり AI が探す（言い回しの違うメモも探せる）。
  //   答えのあとのチップは AI の答えと同じ「いまにどう活かす？」「ほかにも書いてた？」（AI に聞く）。
  const lookupBusyRef = useRef(false);
  const lookupFromMemos = async (q, opts = {}) => {
    if (lookupBusyRef.current || !user?.id) return false;
    lookupBusyRef.current = true;
    try {
      const askBookIds = Array.isArray(opts.bookIds) ? opts.bookIds : scopeIds;
      const result = await runMemoAnswer({
        question: lookupTerm(q) || q,
        books,
        scopeIds: askBookIds,
        loadMemos: async () => {
          const r = await loadAllMemoRows(user.id);
          return r.rows ? { rows: withCachedMemos(r.rows, books, cache), error: null } : r;
        },
      });
      if (result.status !== 'ready' || !(result.groups?.length > 0)) return false;
      const ts = Date.now();
      const at = new Date().toISOString();
      setInput('');
      userScrolledRef.current = false;
      reserveRef.current = true;
      rememberSession(user?.id, { reserve: true });
      alignNextRef.current = true;
      setMessages((arr) => [
        ...arr,
        { id: `memo-q-${ts}`, role: 'user', content: q, refs: [], createdAt: at, local: true, scopeLabel: scopeLabelFor(askBookIds, books) },
        { id: `memo-a-${ts}`, role: 'assistant', content: '', refs: [], createdAt: at, local: true, scopeIds: askBookIds, memoAnswer: { ...result, question: q, lookup: true } },
      ]);
      track('brain_lookup_local', { books: result.groups.length });
      return true;
    } catch {
      return false;
    } finally {
      lookupBusyRef.current = false;
    }
  };
  const askFromMemos = (q, opts = {}) => {
    const askBookIds = Array.isArray(opts.bookIds) ? opts.bookIds : scopeIds;
    // 会話の続き（「〇〇のとき」「どうしたらいい？」など短い返事）は、それだけで探すと
    // 「まだ、この悩みに近いメモがありません」になっていた。はじめの相談と合わせて探す（2026-10-10）。
    const firstQ = (visibleMessages.find((m) => m.role === 'user' && String(m.content || '').trim())?.content || carry?.question || '').trim();
    const searchQ = firstQ && firstQ !== q ? `${firstQ}\n${q}` : null;
    const ts = Date.now();
    const at = new Date().toISOString();
    const answerId = `memo-a-${ts}`;
    setInput('');
    userScrolledRef.current = false;
    reserveRef.current = true;
    rememberSession(user?.id, { reserve: true });
    alignNextRef.current = true;
    setMessages((arr) => [
      ...arr,
      { id: `memo-q-${ts}`, role: 'user', content: q, refs: [], createdAt: at, local: true, scopeLabel: scopeLabelFor(askBookIds, books) },
      { id: answerId, role: 'assistant', content: '', refs: [], createdAt: at, local: true, scopeIds: askBookIds, memoAnswer: { status: 'loading', question: q } },
    ]);
    runMemoAnswerInto(answerId, q, askBookIds, searchQ);
  };

  // 二重送信の見張り（lib/sendGuard.js）: 送信を素早く 2 回押すと、state の busy が描画に反映される前（メモを探す・
  //   同意を待つ・保存する間）に 2 回目も通り抜けていた。同期の印で送っている途中を持ち、終わったら外す（2026-10-04）。
  const sendGuardRef = useRef(null);
  if (!sendGuardRef.current) sendGuardRef.current = createSendGuard();
  const ask = (questionText, opts = {}) => {
    // ⌨️ 指で使う端末では、入力欄から送ったらキーボードを閉じる（2026-10-08）: 答えを画面いっぱいで読み、
    //   書き終えたら入力欄の上のチップ（返事の候補・行動を決める）が出る。続けて書くときは入力欄を押す。
    //   マウスの端末はそのまま（続けて打てる・チップは文字が無ければ出る）。
    if (questionText == null && input.trim() && !busy && touchUi && typeof document !== 'undefined' && document.activeElement === inputRef.current) {
      try { inputRef.current.blur(); } catch { /* ignore */ }
    }
    return sendGuardRef.current.run(() => askOnce(questionText, opts));
  };
  const askOnce = async (questionText, opts = {}) => {
    if (!user) {
      toast.error('ログインが必要です。');
      return;
    }
    if (!isSupabaseConfigured) {
      toast.error('Supabase 未接続です。');
      return;
    }
    const q = (questionText ?? input).trim();
    // 本を探す問いを自分のメモから探している途中（lookupFromMemos・AI なし）に送信をもう一度押しても、
    // 同じ相談を AI にも送らない（二重の吹き出し・トークンの無駄づかいになっていた・2026-10-04）。
    if (!q || busy || lookupBusyRef.current) return;
    // ホームや相談例から渡された相談は、送れないときも入力欄に残す（黙って消えないように）。
    if (outOfTokens && questionText != null) setInput(q);
    // 💬 無料プランで今月のトークンを使い切っていたら、AI を使わずに自分のメモの一節で答える（メモが答える相談・2026-10-01）。
    //   /api/claude は呼ばない（トークンを使わない）。有料プランの画面は開かない（答えの下に静かに 1 回だけ案内）。
    if (freeUsedUp) { askFromMemos(q, opts); return; }
    // 🔎 本を探す問いは、まず自分のメモから探す（AI なし）。見つからなければ下の AI へ（lookupFromMemos）。
    if (isBookLookup(q) && !opts.skipUserInsert && await lookupFromMemos(q, opts)) return;
    // プランのトークンを使い切っていたら送らない（入力は残す。案内とトークンの追加は会話の下に出ている）。
    if (outOfTokens) return;
    // 🤝 はじめて AI に送るときは、送る内容と送り先を見せて同意をもらう（lib/aiConsent.js）。
    //   「今はやめる」なら送らない（相談は入力欄に残す＝ホーム・相談例から来た相談も消えない）。
    if (!(await ensureAiConsent('consult'))) { setInput(q); return; }
    const askBookIds = Array.isArray(opts.bookIds) ? opts.bookIds : scopeIds;
    const askScopeLabel = scopeLabelFor(askBookIds, books);
    const askMode = opts.mode || (askBookIds.length === 1 ? 'fused' : answerMode);
    // 続きの相談（2026-09-29）: 相談例の「前に相談した…」か、過去の相談から持ってきた前の相談（まだ使っていないもの）。
    const askPrior = opts.prior || (carry && !carry.used ? carry : null);
    if (askPrior && carry && askPrior.id === carry.id) setCarry((c) => (c ? { ...c, used: true } : c));
    // 💬 深掘りの会話（2026-09-30）: いま見えている会話に書き終えた答えがあれば、その続きとして聞く。
    //   直近 3 組まで（前の相談 prior と合わせて 3 組・ai.js が古いものから落とす）。「新しい相談をはじめる」で切れる。
    //   「別の角度で答えて」（opts.questionAt）は、答え直す相談とその後を入れない。
    const askThread = selectThreadTurns(visibleMessages, { max: 3, before: opts.questionAt || null, carry: askPrior ? null : carry });
    // 🎯 行動は会話で決める（2026-09-30）: 会話の続きで行動を求めた回だけ、答えの最後が行動になる（ai.js の turnHint と同じ判断）。
    //   書いている途中の形（行動の箱／問いの箱）を先に決める。書き始める前にサーバー側の判断（onStage の decide）で合わせ直す。
    //   🏁 聞き返しは最大 2 回（2026-10-08）: 2 回答えたら、聞き返さずに結論＋行動（shouldDecide＝ai.js の turnHint と同じ判断）。
    // 🧵 この会話のはじめの相談（答えに目印を残す＝過去の相談で 1 つの相談にまとめる・続きを相談した会話は元の会話のはじめ）。
    const threadRootAtSend = threadRootOf(visibleMessages, null);
    const expectAction = shouldDecide({ followUp: askThread.length > 0 || !!askPrior, question: q, asked: countAsks([...(askPrior ? [askPrior] : []), ...askThread]) });
    // この相談より前の、いちばん新しい相談の時刻（「前の相談から メモ +N 件」に使う）。
    const before = opts.questionAt || '9999';
    let prevAskAt = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === 'user' && m.createdAt && m.createdAt < before && !/^(err|streaming|bg-wait)-/.test(String(m.id)) && !isLocalMsg(m)) { prevAskAt = m.createdAt; break; }
    }
    // 前の相談のあとに書いた自分のメモ（カード式＋学び）の数。答えを書いている間に数える（待ち時間を増やさない）。
    const growthPromise = prevAskAt
      ? Promise.resolve(supabase.from('book_memos').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gt('created_at', prevAskAt))
        .then((r) => (r && !r.error && typeof r.count === 'number' ? r.count : 0), () => 0)
      : Promise.resolve(0);

    // 📴 つながっていないときは送らずに、書いた相談を入力欄に残して会話の場所で知らせる（2026-10-10）。
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setInput((cur) => (cur && cur.trim() ? cur : q));
      setSendNotice(OFFLINE_SEND_MESSAGE);
      return;
    }
    setSendNotice('');
    userScrolledRef.current = false;
    sentAtRef.current = Date.now();
    reserveRef.current = true;
    rememberSession(user?.id, { reserve: true });
    gotTextRef.current = false;
    setSlowWait(false);
    setBusy(true);
    setAborting(false);
    setInput('');
    setFirstDayDraft(null);

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
        // 📊 first_consult_sent（lib/firstDay.js・2026-10-02）: はじめての相談を送った（AI に送る相談だけ・この端末で 1 回）。
        //   運営は「登録から 24 時間以内に最初の相談」をこれで数える。path＝初回ガイドで選んだ道（無ければ none）。
        if (!prevAskAt && takeFirstConsult()) {
          track('first_consult_sent', { memos: ownMemoTotalRef.current, path: getOnboardPath() || 'none', preset: questionText != null });
        }
      } catch (e) {
        setBusy(false);
        reserveRef.current = false;
        abortRef.current = null;
        // 書いた相談は消さずに入力欄へ戻す（つながったら、そのまま送り直せる・2026-10-10）。
        setInput((cur) => (cur && cur.trim() ? cur : q));
        // 知らせは入力欄に重なる帯ではなく、会話の場所に 1 行（2026-10-10）。
        const offline = toSaveMessage(e, '') === OFFLINE_SAVE_MESSAGE;
        setSendNotice(offline ? OFFLINE_SEND_MESSAGE : toMessage(e, '相談を送れませんでした。'));
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
        scopeIds: askBookIds, // 相談相手のアイコン（書いている間・失敗・関係するメモが無かった答えは相談相手から）
        mode: askMode, // 本ごとには、書いている途中から本のカードの形で見せる（出来上がりで形が跳ねないように）
        // 本を探す問い（「…を書いた本はどれ？」）は問いも行動も無い答えなので、下に箱の形を取らない（2026-09-30）。
        // 🔭 見方を変える頼みの答えは問いでも行動でもない（書いている途中は箱の形を取らない・2026-10-08 ui-critic）。
        expect: isBookLookup(q) ? 'lookup' : expectAction ? 'action' : ((askThread.length > 0 || !!askPrior) && lensOf(q)) ? 'lens' : 'ask',
      },
    ]);
    setStage('search');

    // ストリーミングで届いた最新の可視テキスト。abort 時に refs パースが
    // 走らなくても、ここに溜めた本文をそのまま確定できるよう保持する。
    let lastVisible = '';
    // 実際の答え方（本ごとにで送っても、並べる本が足りなければ「まとめて」で答える）。
    let liveMode = askMode;
    // 🗣 著者の語り口で答えるか（書き始める前に分かる・onStage の voice）。
    let liveVoice = null;
    try {
      const { body, refs, grounded, memoCount, evidence, quoteRefs, tokenRefund, mode: usedMode, perbookBooks, completedActions, voice: usedVoice, decide: usedDecide } = await streamMyBookBrain({
        userId: user.id,
        question: q,
        bookIds: askBookIds,
        mode: askMode,
        prior: askPrior ? { question: askPrior.question, answer: askPrior.answer, at: askPrior.at } : null,
        thread: askThread.length > 0 ? askThread : null,
        signal: controller.signal,
        onStage: (s, info) => {
          setStage(s);
          if (s === 'generate' && info && typeof info.decide === 'boolean' && info.decide !== expectAction) {
            setMessages((arr) => arr.map((m) => (m.id === streamingId ? { ...m, expect: info.decide ? 'action' : 'ask' } : m)));
          }
          if (s === 'generate' && info?.voice) {
            liveVoice = info.voice;
            setMessages((arr) => arr.map((m) => (m.id === streamingId ? { ...m, voice: liveVoice } : m)));
          }
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
      // 🌱 はじめての相談の答えには、必ず「あなたのメモ N 件から答えました」（2026-10-02・lib/firstDay.js）。
      //   AI の参照から数えられなかったときも、はじめての相談だけは答えに使ったメモの数で出す（関係するメモが無かった答えは除く）。
      const evidenceLine = firstAnswerEvidence({ evidence, memoCount, isFirst: !prevAskAt && !opts.skipUserInsert, refunded: !!tokenRefund, grounded });
      // 🧵 同じ会話の目印（はじめの相談の id・相談相手）。過去の相談の一覧で 1 つの相談にまとめる（止めた答えにも付ける・2026-10-08）。
      const threadMark = encodeThreadRef(threadRootAtSend || savedUserId, askBookIds);
      const persistRefs = wasAborted ? (threadMark ? [threadMark] : []) : [
        ...(evidenceLine ? [`${EVIDENCE_PREFIX}${evidenceLine}`] : []),
        // 関係するメモが無かった答え（トークンを返した）には、積み重ねの一行を付けない（効いていないので）
        ...(grown > 0 && memoCount > 0 && !tokenRefund ? [`${GROWTH_PREFIX}前の相談から メモ +${grown} 件`] : []),
        ...(Array.isArray(quoteRefs) ? quoteRefs : []),
        ...(tokenRefund ? [`${REFUND_PREFIX}${REFUND_NOTE}`] : []),
        ...(completedActions > 0 && !tokenRefund ? [`${ACTED_PREFIX}${completedActions}`] : []),
        // 著者の語り口で書いた答えの印（名前の行の「（本の語り口で・AI）」・過去の相談にも残す）。
        ...(encodeVoice(usedVoice || liveVoice) ? [encodeVoice(usedVoice || liveVoice)] : []),
        ...(threadMark ? [threadMark] : []),
        ...(refs || []),
      ];
      // 本ごとにで送ったのに、並べる本が足りずに「まとめて」で答えた（答えの上に一行で知らせる）。
      // chat_messages に置き場所が無いので、この画面の間だけ（履歴から開き直したときは出ない）。
      const perbookFallback = askMode === 'perbook' && !!usedMode && usedMode !== 'perbook'
        ? { perbookFallback: perbookBooks === 0 ? 'none' : 'one' }
        : null;
      // 答えの吹き出しの id（保存できたら履歴の行の id・できなければ書いている間の id のまま）。
      let answerId = streamingId;
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
        const saved = transformMessage(data);
        answerId = saved.id;
        setMessages((arr) => arr.map((m) => (m.id === streamingId ? { ...saved, ...perbookFallback, scopeIds: askBookIds } : m)));
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
      // 🎯 行動を決める回（2026-09-30 ui-critic）: 書き終えたら「明日からできる一歩」の箱（「行動に追加」まで）が
      //   見えるところまで、会話の欄だけを最小限送る（相談の吹き出しを上端にそろえたままだと、ボタンが画面の下に隠れていた）。
      //   送るのは、書き終えて入力欄の上のチップが出たあと（欄の高さが決まってから）＝答えが出来上がったときの effect。
      //   🏁 問いで終わった答え（あなたに聞きたいこと）も同じく、問いの箱（と中の進み具合の 1 行）が見えるところまで（2026-10-08 ui-critic）。
      if (!wasAborted && ((typeof usedDecide === 'boolean' ? usedDecide : expectAction) || answerAsks(assistantContent))) revealStepRef.current = true;
      // 🧪 はじめての相談の答えが出きったら、その下に 1 回だけ 7 日間無料（見せる組だけ・lib/firstAnswerTrial.js）。
      offerFirstTrialAfter({ id: answerId, isFirst: !prevAskAt && !opts.skipUserInsert, aborted: wasAborted, refunded: !!tokenRefund, grounded, memoCount });
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
      // 💬 無料プランで、送ったときにちょうど今月のトークンが尽きていた（サーバーの 402 free_limit_reached）:
      //   行き止まりにせず、この相談にメモの一節で答える（有料プランの画面はこのとき 1 回だけ開く＝streamClaude）。
      if (e?.paywall && e?.code === 'free_limit_reached' && !controller.signal.aborted) {
        setMessages((arr) => arr.map((m) => (m.id === savedUserId ? { ...m, local: true } : m)));
        runMemoAnswerInto(streamingId, q, askBookIds);
        return;
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
                  // 下のボタン（もう一度）と同じ言葉を重ねない。題と説明に分けて ErrorMessage で出す（ChatMessage）。
                  // 答えを書き始める前の失敗は、サーバーがトークンを戻しているので、そのことも言う（streamClaude の notCharged）。
                  : `${ANSWER_FAILED_TITLE}。${e?.notCharged ? 'トークンは使っていません。' : ''}${ANSWER_FAILED_DESC}`,
              refs: [],
              createdAt: new Date().toISOString(),
              scopeIds: askBookIds,
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
    // 下書き（すべての本の「相談で探す」・振り返りの「相談で聞く」）は入力欄に入れてカーソルを置く（送らない＝トークンは送ったときだけ）。
    if (askPreset.draft) {
      setInput(askPreset.question);
      setFirstDayDraft(askPreset.from === 'firstDay' ? askPreset.question : null);
      // カーソルは、下書きが入って入力欄が描き直されたあと（下の effect）で置く（setTimeout の 80ms では、
      // 相談タブを開く動きの途中で入力欄がまだ無いことがあり、フォーカスの輪が出なかった・2026-10-02 ui-critic）。
      setDraftFocusNonce(askPreset.nonce);
      return;
    }
    // ホームの相談例「前に相談した「…」、その後どう進める？」なら、その会話の全体を開いて続きとして送る（この続きを相談すると同じ）。
    const cont = lastConsult ? buildConsultExamples({ lastConsult, count: 1 })[0] : null;
    if (cont && cont.kind === 'continue' && cont.text === askPreset.question) {
      continueThread(lastConsult.group, { send: askPreset.question, bookIds: Array.isArray(askPreset.bookIds) ? askPreset.bookIds : null });
      return;
    }
    ask(askPreset.question, Array.isArray(askPreset.bookIds) ? { bookIds: askPreset.bookIds } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askPreset?.nonce, historyLoaded]);

  // 下書きを入れて開いたとき: 入力欄が描かれてから（次のフレーム）カーソルを置く。まだ無ければ数フレーム待つ。
  const [draftFocusNonce, setDraftFocusNonce] = useState(null);
  useEffect(() => {
    if (draftFocusNonce == null) return undefined;
    let raf = 0;
    let tries = 0;
    const tryFocus = () => {
      const el = inputRef.current;
      if (el && el.isConnected && el.getClientRects().length > 0) {
        try { el.focus({ preventScroll: true }); el.setSelectionRange?.(el.value.length, el.value.length); } catch { /* ignore */ }
        return;
      }
      if (tries < 30) { tries += 1; raf = requestAnimationFrame(tryFocus); }
    };
    raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, [draftFocusNonce]);

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
    const saved = messages.filter((m) => m.createdAt && !/^(err|streaming|bg-wait)-/.test(String(m.id)) && !isLocalMsg(m));
    const now = saved.length > 0
      ? saved.reduce((a, m) => (m.createdAt > a ? m.createdAt : a), saved[0].createdAt)
      : new Date().toISOString();
    setClearedAt(now);
    // メモが答える相談（画面の上だけのやりとり）は、新しい相談で消す。
    setMessages((arr) => (arr.some(isLocalMsg) ? arr.filter((m) => !isLocalMsg(m)) : arr));
    reserveRef.current = false;
    rememberSession(user?.id, { clearedAt: now, reserve: false });
    setPromptDismissed(false);
    setCarry(null);
    setResumeThread(null);
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

  // 🧵 過去の相談の「この続きを相談する」（2026-10-08）: その会話（相談と答え・相談相手）を今の会話として並べ、
  // 入力欄にカーソル。続けて送ると、直前の会話を最大 3 往復渡す（selectThreadTurns → threadBlock）。答えには同じ会話の
  // 目印を残すので、過去の相談の一覧は 1 つの相談のまま（二重にならない）。古い相談でも使える。
  //   opts.send: 開いたあとに続けて送る相談（相談例の「前に相談した「…」、その後どう進める？」）。
  const continueThread = (group, opts = {}) => {
    if (busy) return;
    const ids = [];
    group.forEach((m, k) => {
      if (m.role !== 'user') return;
      const a = group[k + 1];
      if (!a || a.role !== 'assistant' || !isCompletedAnswer(a) || a.content === STOPPED_EMPTY) return;
      ids.push(m.id, a.id);
    });
    if (ids.length === 0) return;
    clearConversation();
    setResumeThread({ ids, title: threadTitleOf(group) });
    setScopeIds(threadScopeOf(group));
    setView('chat');
    track('brain_continue', { turns: ids.length / 2 });
    // カーソルは描いた直後（useLayoutEffect）に置く。押した操作の中で置くので、iOS でもキーボードが上がりやすい
    //   （setTimeout で待つと、押した操作から外れてキーボードが上がらないことがあった・2026-10-08 ui-critic）。
    focusOnResumeRef.current = !opts.send;
    sendOnResumeRef.current = opts.send ? { q: opts.send, bookIds: opts.bookIds || null } : null;
  };
  // 相談例から開いたときは、会話を並べた描画のあとで送る（その会話の続きとして・threadBlock に入る）。
  const sendOnResumeRef = useRef(null);
  useEffect(() => {
    const pending = sendOnResumeRef.current;
    if (!pending || view !== 'chat' || !resumeThread) return;
    sendOnResumeRef.current = null;
    ask(pending.q, pending.bookIds ? { bookIds: pending.bookIds } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeThread, view]);
  useLayoutEffect(() => {
    if (!focusOnResumeRef.current || view !== 'chat' || !resumeThread) return;
    focusOnResumeRef.current = false;
    try { inputRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
  }, [resumeThread, view]);

  // 「💬 続けて質問する」: プロンプトだけ閉じる。次の AI 回答までは再表示しない。
  const handleContinue = () => {
    setPromptDismissed(true);
  };

  const regenerate = async () => {
    // Find the last user message; resend it.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user' && !isLocalMsg(messages[i])) {
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
  const resumeIdSet = useMemo(() => new Set(resumeThread?.ids || []), [resumeThread]);
  const visibleMessages = clearedAt
    ? messages.filter((m) => isLocalMsg(m) || (m.createdAt || '') > clearedAt || resumeIdSet.has(m.id))
    : messages;
  // メモが答える相談の「AI に答えてもらう（プラン）」は、この会話でいちばん最初のメモの答えにだけ（毎回すすめない）。
  //   見つからなかった答えには出さない（AI もメモが無ければ答えられないので）。
  //   今月のトークンを使い切っている間は、いちばん新しい答えの下に 1 つだけ（続けて相談すると、上の答えの下に残ったまま
  //   画面の外へ流れ、プランへの道が見えなくなっていた・2026-10-10）。見つからなかった答えのときは、その下に案内カード（下の FreeUsedCard）。
  const lastIsMemoAnswer = !!visibleMessages[visibleMessages.length - 1]?.memoAnswer;
  const lastMemoAnswer = lastIsMemoAnswer ? visibleMessages[visibleMessages.length - 1].memoAnswer : null;
  const lastMemoFound = !!(lastMemoAnswer && lastMemoAnswer.status === 'ready' && lastMemoAnswer.groups?.length > 0);
  const firstMemoAnswerId = freeUsedUp
    ? (lastMemoFound ? visibleMessages[visibleMessages.length - 1].id : null)
    : (visibleMessages.find((m) => m.memoAnswer && m.memoAnswer.status === 'ready' && m.memoAnswer.groups?.length > 0)?.id || null);
  // 続きの相談を持ってきたときは、空の画面（相談例）を出さない（会話はその相談から始まる）。
  const isEmpty = visibleMessages.length === 0 && !carry;
  const lastIsAssistant = visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1].role === 'assistant';
  // 最後の答えの下の文字ボタンの行（別の角度で答えて・新しい相談をはじめる）を出しているか。
  // メモが答える相談の読み込み中は出さない（答えより先に次の操作が並ばないように）。
  const answerRowShown = lastIsAssistant && !busy && visibleMessages.some((m) => m.role === 'user')
    && visibleMessages[visibleMessages.length - 1]?.memoAnswer?.status !== 'loading';
  // 💬 深掘りの会話（2026-09-30）: 書き終えた答えがある会話＝次の相談はその続き（入力欄のプレースホルダーを変える）。
  const threadActive = selectThreadTurns(visibleMessages, { max: 1, carry }).length > 0;
  // 深掘りのチップ（入力欄の上）: 最後の答えを書き終えたときだけ（書いている間・失敗・案内・関係するメモが無かった答え・
  // トークンを使い切ったとき・入力欄に書いている間は出さない）。
  const lastVisible = visibleMessages[visibleMessages.length - 1];
  const booksWithMemos = useMemo(() => {
    const ids = new Set(memoBookIds || []);
    return (books || []).filter((b) => (ids.has(b.id) || hasSummaryMemo(b)) && (scopeIds.length === 0 || scopeIds.includes(b.id))).length;
  }, [books, memoBookIds, scopeIds]);
  // 「次に聞く」は入力欄の上のこの 1 行にまとめる（2026-09-30 ui-critic: 答えの下の「別の角度で答えて」と 2 か所に割れていた）。
  // 本を探す問いに自分のメモから答えた（AI なし・lookupFromMemos）あとも、AI の答えと同じチップを出す。
  const lastLocalLookup = !!(lastVisible?.memoAnswer?.lookup && lastVisible.memoAnswer.status === 'ready');
  // 書き終えた答えのあと（入力欄の状態を除く）。プレースホルダー（「返事を書く…」）はこちらで決める＝カーソルを置いても変わらない。
  // チップの行を出すのは、そのうえで入力欄にカーソルも文字も無いとき（composerChrome・2026-10-08）。
  const chrome = composerChrome({ focused: inputFocused && touchUi && nativeKb !== false, text: input });
  const answerReady = !busy && !outOfTokens && !freeUsedUp
    && visibleMessages.length >= 2 && visibleMessages[visibleMessages.length - 2]?.role === 'user'
    && lastVisible?.role === 'assistant' && !lastVisible.streaming && !lastVisible.error && !lastVisible.notice && (!lastVisible.memoAnswer || lastLocalLookup) && !isNoInfoAnswer(lastVisible);
  // 🏁 行動を決めて「行動に追加」したら、会話が一区切り＝チップは出さず「新しい相談をはじめる」（主ボタン）だけ（2026-10-08）。
  //   過去の相談・「この続きを相談する」で開き直した答えも、前に行動に追加していれば同じ扱い（2026-10-09・二重に足さない）。
  const lastActionAdded = !!lastVisible && (addedActionIds.includes(lastVisible.id)
    || (lastVisible.role === 'assistant' && !lastVisible.streaming && answerActionAddedBefore(lastVisible, precedingQuestion(visibleMessages, visibleMessages.length - 1), allActions)));
  // 🌱 メモが 0 件の人の答えのあと（2026-10-09）: 見方・返事のチップや「ここで答えと行動を」を並べても、根拠のメモが無いので
  //   続けても同じ答えにしかならない。代わりに主ボタン「これまで読んだ本から始める」（初日クイックスタート）だけ。
  const noMemosYet = !!onQuickstart && memoStatsLoaded && !memoStatsFailed
    && (memoStats.cards + memoStats.personal + (memoStats.summaryBooks || 0)) === 0;
  const chipRowBase = answerReady && chrome.chips && !lastActionAdded && !noMemosYet;
  const answerDone = answerReady && (lastLocalLookup || isCompletedAnswer(lastVisible));
  const showFollowups = answerDone && chrome.chips && !lastActionAdded && !noMemosYet;
  // いま送った文と同じチップは出さない（「もっと具体的に」のあとにまた「もっと具体的に」を並べない）。
  const lastAsked = visibleMessages[visibleMessages.length - 2]?.content || '';
  // 🔭 見方のチップ（2026-10-08 ui-critic）: いまの区切りで使った見方は出さない・仕事の言葉の見方は仕事の相談のときだけ。
  const convTurns = answerDone ? selectThreadTurns(visibleMessages, { max: 50, carry }) : [];
  const lensesUsed = usedLenses(convTurns);
  const workConsult = answerDone && isWorkConsult({
    texts: convTurns.map((t) => t.question).filter((q) => !lensOf(q)),
    books: scopeIds.length > 0 ? (books || []).filter((b) => scopeIds.includes(b.id)) : [],
  });
  // 見方を変えた答えのあと、答えの下に「「ここで答えと行動を」で…」の 1 行（進み具合の行と同じ見た目）。
  const lensNextShown = answerDone && !!lensOf(lastAsked) && !answerAsks(lastVisible.content) && !extractActionLine(lastVisible.content);
  // 🎯 行動は会話で決める（2026-09-30）: 最後の答えが問いで終わっていれば、その候補（返事）→「行動を決める」。
  //   行動を決めた答えのあとは、これまでの深掘りのチップ。次にすることは入力欄の上のこの 1 行だけ（lib/consultHelpers.js）。
  const lastParsed = answerDone ? parseAnswer(lastVisible.content) : null;
  const lastAsksBack = !!lastParsed?.question;
  // 🔎 最後の相談が本を探す問いなら、そのあとのチップは「いまにどう活かす？」「ほかにも書いてた？」だけ（2026-09-30）。
  const lastLookup = answerDone && isBookLookup(lastAsked);
  const lookupFound = lastLookup
    ? (lastLocalLookup ? lastVisible.memoAnswer.groups.length : decodeQuoteRefs(lastVisible.refs || []).filter((c) => c.k === 'r' && c.s === 'ok').length || (lastVisible.refs || []).filter((r) => !isMetaRef(r)).length)
    : 0;
  const followups = showFollowups
    ? nextStepChips({ replies: lastParsed?.replies || [], hasAction: lastParsed ? isActionAnswer(lastParsed) : !!extractActionLine(lastVisible.content), booksWithMemos, lastAsked, lookup: lastLookup, term: lastLookup ? lookupTerm(lastAsked) : '', found: lookupFound, work: workConsult, used: lensesUsed })
    : [];
  // 同じ相談にもう一度答える（別の角度で／止めた・途中までの答えは「もう一度答えて」）。チップの行の最後に置く。
  // 問いに答えている間（返事の候補がある）は出さない＝チップは「候補＋行動を決める」だけ（2026-09-30 ui-critic）。
  // 途中で止めた答え（「— ここで中止しました」で終わる）も「もう一度答えて」（SPEC §3・角度を変えたいのではなく続きが欲しい・2026-10-04）。
  const stoppedAnswer = !!lastVisible && (lastVisible.content === STOPPED_EMPTY || /— ここで中止しました\s*$/.test(String(lastVisible.content || '')));
  // 🏁 いまどこにいるか（2026-10-08）: 最後の答えが聞き返しなら、その下に「あと 1 つ聞いたら…」「次で…」の 1 行。
  //   見方を変えた答え（🔭 lensOf）の「続けますか？」は聞き返しではないので出さない。
  const askProgress = answerDone && !noMemosYet && !lastLookup && !lensOf(lastAsked) && answerAsks(lastVisible.content)
    ? askProgressText(countAsks(selectThreadTurns(visibleMessages, { max: 3, carry })))
    : '';
  // 「別の角度で答えて」は見方を変える 3 つのチップ（🔭 lensChips）に置き換えた（2026-10-08）。止めた・途中までの答えの「もう一度答えて」だけ残す。
  const regenLabel = !chipRowBase || isBookLookup(lastAsked) || !stoppedAnswer ? '' : 'もう一度答えて';
  // 進み具合の 1 行を出す答え（最後の答え）の id。問いの箱の中のいちばん下に出す（送った直後の 1 画面で見える・2026-10-08）。
  const askProgressFor = askProgress && answerRowShown ? lastVisible.id : null;
  // 入力欄を押したとき、問いの箱（返事を書く相手）を上に合わせて見せるか（keepAnswerEnd）。
  lastAsksRef.current = !!(answerDone && !lastLookup && answerAsks(lastVisible.content));

  // 過去の相談: 相談（user）とそれに続く答えを 1 組にして、新しい組から並べる。
  //   🧵 続きを相談した会話は 1 つにまとめる（答えの目印＝lib/consultThreads.js・2026-10-08）。新しく話した相談から。
  const historyGroups = useMemo(
    // メモが答える相談は過去の相談に入れない（AI の答えではないので）
    () => groupConsults(messages, { skip: isLocalMsg }),
    [messages],
  );
  // 空の画面の出し分けはメモ（カード式＋学び＋この本のまとめ）の件数で決める（SPEC §3）。メモ＝カード式＋まとめ式
  // （GLOSSARY）なので、読書メーター等の感想を「この本のまとめ」に取り込んだだけの人も相談できる（2026-09-29 オーナー裁定）。
  // 読書計画だけの人は「これまで読んだ本から始める」へ（相談例の「最近のメモから…」が空振りしないように）。
  const ownMemoTotal = memoStats.cards + memoStats.personal + (memoStats.summaryBooks || 0);
  ownMemoTotalRef.current = memoStatsLoaded ? ownMemoTotal : -1;
  // 📊 memos_reached_10（lib/firstDay.js）: 10 件より少ないのを見たあとで 10 件以上になったら 1 回だけ（ホームと同じ印）。
  useEffect(() => {
    if (memoStatsLoaded && !memoStatsFailed && takeMemosReached(ownMemoTotal)) track('memos_reached_10', { memos: ownMemoTotal, where: 'consult' });
  }, [memoStatsLoaded, memoStatsFailed, ownMemoTotal]);
  // 🌱 「あと N 件で相談相手が育ちます」（メモ 1〜9 件・10 件で消える＝7 日間無料の案内と重ならない）。
  //   相談相手を絞っていても出す。数は自分のメモの全件（育つのはすべてのメモ・2026-10-02 オーナー判断）。
  //   絞っているときは上の行が絞った本のメモの件数なので「メモ全体で、あと N 件…」と言う（2026-10-02）。
  const growthLine = memoStatsLoaded && !memoStatsFailed ? growthMeterText(ownMemoTotal, { overall: scopeIds.length > 0 }) : null;
  // 上部の「〜件から答えます」の数がまだ分からない（数えている途中）。
  const headCountPending = scopeIds.length > 0 ? scopeCountPending : (!!user && isSupabaseConfigured && !memoStatsLoaded);
  // 答え方（まとめて / 本ごとに）は、並べる本が無い 1 冊のときと、メモがまだ無いとき（答える材料が無い）は出さない。
  // 数え終わるまでは出しておく（メモのある大多数の人で、読み込み後にチップが増えて跳ねないように）。
  // メモが答える相談（無料のトークンを使い切った）では答え方は効かないので出さない（2026-10-01 ui-critic）。
  const modeApplies = !freeUsedUp && scopeIds.length !== 1 && (!memoStatsLoaded || ownMemoTotal > 0 || memoStatsFailed);
  // 🪙 無料プランの使う量の目安は、チップの行の上に 1 回だけ（13/--text-2・2026-10-09）。
  //   上の行（会話の先頭）に「今月の残り…」が出ているときは出さない（量の話を 2 か所にしない・2026-10-09 ui-critic）。
  const chipCostLine = freeMode && tokensRemaining == null && (followups.length > 0 || regenLabel) ? (
    <p style={{ flexBasis: '100%', margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
      1 回 約 {answerMode === 'perbook' && modeApplies ? TOKEN_COSTS.consultPerBook : TOKEN_COSTS.consult} トークン
    </p>
  ) : null;
  // 🌱 相談相手が育ってきました（lib/trialNudge.js・2026-09-28）: 無料プランで自分のメモが 10 件たまったら、
  //    会話の場所のいちばん上に 1 回だけ、7 日間無料（使えないと分かれば「プランを見る」）をすすめる。
  //    閉じる・押すで二度と出さない。お試しモードでは ?demo=freegrown のときだけ出す（ほかの撮影を変えない）。
  const [nudgeDone, setNudgeDone] = useState(() => isTrialNudgeDone() || (isDemo && demoScenario !== 'freegrown'));
  // 🧪 見せる組の人は、はじめての相談を送るまで ③ を出さない（当日の案内は答えのあとの 1 行だけ）。
  //   答えのあとの 1 行を出した画面でも出さない（同じ日に 2 つすすめない・lib/firstAnswerTrial.js）。
  const consultedEver = messages.some((m) => m.role === 'user' && !isLocalMsg(m));
  const nudgeWanted = view === 'chat' && historyLoaded && !busy && !firstTrialSeen
    && !holdGrownNudge({ group: trialAbGroup, consulted: consultedEver }) && shouldShowTrialNudge({
    plan,
    memoCount: memoStatsLoaded ? ownMemoTotal : null,
    done: nudgeDone,
    freeUsedUp,
    empty: isEmpty && !(scopeIds.length > 0 && scopeMemoCount === 0),
  });
  // 無料期間の名前（「7 日間無料」）。'' ＝約束しない文にする。null ＝確かめている途中（まだ出さない＝文が入れ替わらない）。
  const [trialOffer, setTrialOffer] = useState(null);
  // 無料期間のあるプラン（'both' | 'annual' | 'monthly'）。創業メンバー価格のあいだは 'monthly'（年額は 1 年目 ¥9,800）。
  const [trialOfferPlan, setTrialOfferPlan] = useState('both');
  useEffect(() => {
    if (!nudgeWanted || trialOffer !== null) return undefined;
    if (hadPlan) { setTrialOffer(''); return undefined; } // 前に契約していた＝無料期間はもう使えない
    if (isDemo) {
      // お試しモード: 使える人として撮る（&trial=off で「使えない人」の文）。
      //   &founding=on|store で、創業メンバー価格のあいだ（7 日間無料は月額だけ）の文。
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('trial');
      if (['on', 'store'].includes(sp.get('founding'))) setTrialOfferPlan('monthly');
      setTrialOffer(t === 'off' ? '' : normalizeTrialLabel(t || '7日間無料'));
      return undefined;
    }
    let alive = true;
    getIntroOffer(user?.id)
      .then((r) => {
        if (!alive) return;
        if (r.plan) setTrialOfferPlan(r.plan);
        setTrialOffer(r.status === 'eligible' ? normalizeTrialLabel(r.label) : '');
      })
      .catch(() => { if (alive) setTrialOffer(''); });
    return () => { alive = false; };
  }, [nudgeWanted, trialOffer, hadPlan, user?.id]);
  const showNudge = nudgeWanted && trialOffer !== null;
  // 🎁 無料のトークンを使い切ったときの案内（FreeUsedCard）のボタン: 7 日間無料を使える人には「7 日間無料で試す」、
  //   使えない・分からない・月額だけに無料期間があるとき（創業メンバー価格のあいだ）は「プランを見る」（2026-10-10）。
  const [freeUsedOffer, setFreeUsedOffer] = useState('');
  useEffect(() => {
    if (!freeUsedUp || hadPlan) { setFreeUsedOffer(''); return undefined; }
    if (isDemo) {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('trial');
      setFreeUsedOffer(t === 'off' || ['on', 'store'].includes(sp.get('founding')) ? '' : normalizeTrialLabel(t || '7日間無料'));
      return undefined;
    }
    let alive = true;
    getIntroOffer(user?.id)
      .then((r) => { if (alive) setFreeUsedOffer(r.status === 'eligible' && r.plan !== 'monthly' ? normalizeTrialLabel(r.label) : ''); })
      .catch(() => { if (alive) setFreeUsedOffer(''); });
    return () => { alive = false; };
  }, [freeUsedUp, hadPlan, user?.id]);
  const freeUsedCta = freeUsedOffer ? `${freeUsedOffer}で試す` : 'プランを見る';
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
  // 🧪 はじめての相談の答えのあとの 7 日間無料（lib/firstAnswerTrial.js）。
  //   無料期間の名前（「7 日間無料」）を前もって確かめておく（答えが出きったときにすぐ決められるように）。'' ＝使えない・分からない。
  //   両方の組で確かめる（見せない組も「出せる条件がそろった」を数える＝比べる母数）。
  const [firstTrialOffer, setFirstTrialOffer] = useState(null);
  const firstTrialDone = isFirstAnswerTrialDone(user);
  useEffect(() => {
    if (!trialAbGroup || plan !== 'free' || firstTrialOffer !== null || firstTrialDone) return undefined;
    if (hadPlan) { setFirstTrialOffer(''); return undefined; }
    if (isDemo) {
      const t = new URLSearchParams(window.location.search).get('trial');
      setFirstTrialOffer(t === 'off' ? '' : normalizeTrialLabel(t || '7日間無料'));
      return undefined;
    }
    let alive = true;
    getIntroOffer(user?.id)
      .then((r) => { if (alive) setFirstTrialOffer(r.status === 'eligible' ? normalizeTrialLabel(r.label) : ''); })
      .catch(() => { if (alive) setFirstTrialOffer(''); });
    return () => { alive = false; };
  }, [trialAbGroup, plan, hadPlan, firstTrialOffer, firstTrialDone, user?.id]);
  firstTrialRef.current = { group: trialAbGroup, plan, hadPlan, offer: firstTrialOffer || '',
    // ③ を閉じた・押した（端末の印）か、この画面で ③ を見た。お試しモードの ③ を隠す決まり（nudgeDone）とは別に、本当の印で見る。
    otherNudge: isTrialNudgeDone() || nudgeSeenRef.current };
  const offerFirstTrialAfter = (answer) => {
    const st = firstTrialRef.current;
    if (!st.group || !isFirstAnswerTrialMoment(answer)) return;
    if (!canOfferFirstAnswerTrial({ ...st, done: isFirstAnswerTrialDone(user) })) return;
    track('first_answer_trial', { action: 'eligible', group: st.group });
    if (st.group !== 'show') return;
    markFirstAnswerTrialDone('shown');
    setFirstTrialSeen(true);
    setFirstTrialId(answer.id);
    // shown は、カードが実際に画面に入ったときに数える（FirstAnswerTrialCard の onSeen・実験の母数）。
  };
  const firstTrialSeenRef = useRef(false);
  const onFirstTrialSeen = useCallback(() => {
    if (firstTrialSeenRef.current) return;
    firstTrialSeenRef.current = true;
    track('first_answer_trial', { action: 'shown', group: 'show' });
  }, []);
  const closeFirstTrial = (action) => {
    markFirstAnswerTrialDone(action);
    setFirstTrialId(null);
    track('first_answer_trial', { action, group: 'show' });
  };
  const firstTrialCard = (style) => (
    <FirstAnswerTrialCard
      onSeen={onFirstTrialSeen}
      text={firstAnswerTrialText(firstTrialOffer || '')}
      onOpen={() => { closeFirstTrial('tap'); openPaywall('first_answer'); }}
      onDismiss={() => closeFirstTrial('dismiss')}
      style={style}
    />
  );
  const [moreMenu, setMoreMenu] = useState(null); // { x, y }
  // 💬 数冊の本から答えたときの「相手」の一覧（名前の行・アイコンを押したとき）。
  const [partnerSheet, setPartnerSheet] = useState(null);
  // いまの相談相手のアイコン（上部の行・送る前から誰に相談するか分かるように）。
  const scopePartner = useMemo(() => partnerFromScope({ scopeIds, books, memoBookIds }), [scopeIds, books, memoBookIds]);
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

  // 会話の上の操作（過去の相談・その他）。App のサブタブの行の右端へ出す（barSlot）。
  const barButtons = (
    <>
      <button type="button" style={iconBtn} onClick={() => setView('history')} aria-label="過去の相談を見る" title="過去の相談">
        <History size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        // 右端の補正は置き場（App の .sub-tabs__actions）が持つので、ここでは付けない（二重に引くと ？・⚙️ より右へずれた）。
        style={iconBtn}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMoreMenu({ x: r.right - 8, y: r.bottom + 4 }); }}
        aria-label="その他の操作"
        title="その他"
      >
        <MoreHorizontal size={22} aria-hidden="true" />
      </button>
    </>
  );
  // 「あなたのメモ N 件から答えます」＋残りのトークン。会話の先頭の 1 行（スクロールで一緒に流れる・2026-10-01）。
  const statusLine = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', marginBottom: isEmpty ? 'var(--space-6)' : 'var(--space-4)' }}>
      {/* 💬 いまの相談相手のアイコン（24・1 行目の高さの中央・2026-09-30）。飾りなので読み上げない（文は右の 1 行）。 */}
      <PartnerAvatar partner={scopePartner} size={AVATAR_SIZE_SMALL} style={{ alignSelf: 'flex-start', marginTop: 'calc((var(--text-sub) * 1.5 - 24px) / 2)', marginRight: 'var(--space-1)' }} />
      {/* 1 冊に絞ったとき（『書名』…）は 『 をぶら下げる。下の残りトークンの行には引き継がない。 */}
      <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'auto-phrase', ...(scopeIds.length === 1 && scopeMemoCount != null ? { textIndent: '-0.5em' } : null) }}>
        {/* 件数が分かるまでは、同じ 1 行ぶんの高さに文の形の SkeletonBlock（何もない空きにしない・読み上げない。
            「読んだ本のメモを根拠に答えます」→「あなたのメモ N 件から答えます」と入れ替わって見えていた・2026-09-30） */}
        {headCountPending
          ? <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-sub) * 1.5)' }}><SkeletonBlock width="62%" height={14} /></span>
          : scopeIds.length > 0
          ? (scopeMemoCount === 0
            // メモが無いことは会話の場所で大きく伝えるので、上の行は相談相手の名前だけ（同じ文を 2 回出さない）。
            ? (scopeIds.length === 1
              ? <>『{(books.find((b) => b.id === scopeIds[0]) || {}).title || 'この本'}』に相談します</>
              : <>選んだ <span style={{ whiteSpace: 'nowrap' }}>{scopeIds.length} 冊</span>に相談します</>)
            : scopeMemoCount != null
            ? (scopeIds.length === 1
              ? <>『{(books.find((b) => b.id === scopeIds[0]) || {}).title || 'この本'}』の<span style={{ whiteSpace: 'nowrap' }}>メモ {scopeMemoCount} 件</span>{answerVerb}</>
              : <>選んだ <span style={{ whiteSpace: 'nowrap' }}>{scopeIds.length} 冊</span>の<span style={{ whiteSpace: 'nowrap' }}>メモ {scopeMemoCount} 件</span>{answerVerb}</>)
            : `選んだ本のメモ${answerVerb}`)
          // 件数は「メモ N 件」＝自分のメモ（カード式＋学び＋この本のまとめ）。ホームの相談カード・初日クイックスタート・
          // 振り返りの記録と同じ数え方・同じ言葉（2026-09-29）。0 件のときは件数を出さない（下の「まだメモがありません」と食い違わないように）。
          : (ownMemoTotal > 0 ? <><span style={{ whiteSpace: 'nowrap' }}>あなたのメモ {ownMemoTotal} 件</span>{answerVerb}</> : '読んだ本のメモを根拠に答えます')}
        {/* メモが 1〜9 件の間は、答えがメモとともに深くなることを一行で（点数・バッジにしない・2026-10-02）。 */}
        {!headCountPending && growthLine && (
          <span style={{ display: 'block', textIndent: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(growthLine)}</span>
        )}
        {/* 残りのトークン（無料・有料は今月・無料期間は期間まるごと）。管理者・読めないときは出さない。 */}
        {tokensRemaining != null && (
          <span style={{ display: 'block', textIndent: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
            {/* 「無料期間の残り／110 トークン」と切らない（1 つのまとまり）。かっこは重ねない。 */}
            <span style={{ whiteSpace: 'nowrap' }}>{plan === 'trial' ? '無料期間' : '今月'}の残り {fmtTokens(tokensRemaining)}{purchasedTokens > 0 ? <> ＋追加 {fmtTokens(purchasedTokens)}</> : null} トークン</span>
            {/* 無料プラン・7 日間無料は「あと何回相談できるか」を添える（トークンだけでは量が分からない・2026-09-29）。追加分も数に入れる。 */}
            {/* 回数は次の行に置く（「・」でつなぐと 390 幅で途中から折り返して、どこで切れるかが毎回変わる・2026-09-30）。 */}
            {/* 数える単位は「AI の答え」（1 回 約 10 トークン・2026-10-09）。 */}
            {/* 🌱 無料プランのはじめの月は「（はじめの月は 60 トークン）」を添える（来月から 30 になることを先に知らせる）。 */}
            {(freeMode || plan === 'trial') && tokensRemaining + (purchasedTokens || 0) > 0 && <span style={{ display: 'block' }}><span style={{ whiteSpace: 'nowrap' }}>AI の答え {remainingAnswersLabel(tokensRemaining + (purchasedTokens || 0))}</span>{freeMode && freeFirstMonth && <span style={{ whiteSpace: 'nowrap' }}>（はじめの月は {fmtTokens(tokenAllowance)} トークン）</span>}</span>}
          </span>
        )}
        {/* 上限に達したときの「◯月1日から」は、答えの吹き出しと入力欄に出す（同じ日付を 3 回並べない）。 */}
      </p>
    </div>
  );

  return (
    <div style={wrap}>
      {/* 上の操作は 1 行だけ（SPEC §3）。会話のときは、履歴（時計）とその他（…）を App のサブタブ（相談｜AI 選書）の行の右端に出し
          （barSlot・2026-10-01 ui-critic: サブタブ／🕒…の行／件数の行と 3 段に積まない）、「何を根拠に答えるか」の 1 行は会話の先頭へ。
          会話以外の押し込まれた画面では「‹ 相談」で戻る行（押し込まれた画面では親が全体の見出しを隠すので、この行が画面の最上部＝ノッチを避ける）。 */}
      {view === 'chat' && (barSlot ? createPortal(barButtons, barSlot) : (
        <div style={{ ...topRow, justifyContent: 'flex-end' }}>{barButtons}</div>
      ))}
      {view !== 'chat' && (
      <div
        style={{
          ...topRow,
          // 線は中身を下へ送ったときだけ（一番上では出さない・SPEC §3）。線の太さぶんはいつも取って高さを変えない（2026-09-29）。
          borderBottom: `1px solid ${scrolled ? 'var(--separator)' : 'transparent'}`,
          transition: 'border-color var(--duration-fast) var(--ease-out)',
          ...(isPushed && onPushedViewChange ? { paddingTop: 'max(var(--space-1), env(safe-area-inset-top, 0px))', minHeight: 'calc(52px + env(safe-area-inset-top, 0px))' } : null),
        }}
      >
        <>
            {/* iOS のナビゲーションバーの形: 左に戻る・中央に題名・右は同じ幅の空き。 */}
            <div style={{ width: 96, flexShrink: 0 }}>
              {/* シェブロンの見た目の左端を余白 16 に揃える（アイコンの内側の空きの分だけ左へ戻す）。 */}
              <button type="button" onClick={backToChat} style={{ ...uiBtnText, fontSize: 'min(var(--text-body), var(--text-bar-max))', whiteSpace: 'nowrap', fontWeight: 400, padding: 'var(--space-2) 0', marginLeft: 'calc(-1 * var(--space-2))', gap: 0, lineHeight: 1.3 }}>
                <ChevronLeft size={20} aria-hidden="true" />相談
              </button>
            </div>
            <h2 style={{ flex: 1, minWidth: 0, margin: 0, textAlign: 'center', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{viewTitle}</h2>
            {/* 左の戻ると同じ幅で、題名を画面中央に。過去の相談だけ、右端に「…」（すべて削除はこの中＝一番目立つ場所に赤を置かない）。 */}
            {view === 'history' && historyGroups.length > 0 ? (
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
      </div>
      )}
      {moreMenu && (
        <ContextMenu
          x={moreMenu.x}
          y={moreMenu.y}
          onClose={() => setMoreMenu(null)}
          items={[
            { label: '学びを書く', icon: <PencilLine size="1.1em" aria-hidden="true" />, onClick: () => setView('learning') },
            { label: '根拠にできる情報', icon: <BookOpenCheck size="1.1em" aria-hidden="true" />, onClick: () => setView('knowledge') },
          ]}
        />
      )}
      {partnerSheet && (
        <PartnerBooksSheet partner={partnerSheet} onClose={() => setPartnerSheet(null)} onOpenBook={onOpenBook} />
      )}
      {historyMenu && (
        <ContextMenu
          x={historyMenu.x}
          y={historyMenu.y}
          onClose={() => setHistoryMenu(null)}
          items={[
            { label: 'すべて削除', icon: <Trash2 size="1.1em" aria-hidden="true" />, destructive: true, onClick: clearHistory },
          ]}
        />
      )}


      {/* 学びを書く（本以外の学びログ） */}
      {view === 'learning' && (
        <div style={viewScroll} onScroll={onBodyScroll}>
          <LearningInline
            onDirtyChange={(d) => { learningDirtyRef.current = d; }}
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
            {historyGroups.length > 0 && (
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{historyGroups.length} 件の相談</p>
            )}
            {/* 「N 件の相談」の行の形も一緒に待つ（読み込み後に一覧が下へ跳ねないように）。 */}
            {!historyLoaded && historyGroups.length === 0 && <SkeletonBlock width={72} height={20} radius="var(--radius)" />}
            {!historyLoaded && <HistorySkeleton />}
            {historyLoaded && historyError && (
              <ErrorMessage
                title="過去の相談を読み込めませんでした"
                // 下のボタン（もう一度）と同じ言葉を重ねない。
                description="通信の状態を確かめてください。"
                // ほかの画面の「もう一度」と同じ枠線のボタン（variant: 'secondary'・2026-10-04）。
                actions={[{ label: 'もう一度', variant: 'secondary', onClick: () => { setHistoryError(false); setHistoryLoaded(false); fetchHistory(); } }]}
              />
            )}
            {/* 戻るは上の「‹ 相談」だけ（同じ操作のボタンを 2 か所に出さない）。 */}
            {historyLoaded && !historyError && historyGroups.length === 0 && (
              <EmptyState
                icon={<MessageCircle size={32} strokeWidth={1.5} aria-hidden="true" />}
                title="まだ相談していません"
              />
            )}
            {/* 新しい相談から上に並べる（開いてすぐ最近の相談が見える）。相談とその答えは 1 組のまま。 */}
            {historyGroups.map((g, gi) => {
              const canContinue = g[0].role === 'user' && g.some((m) => m.role === 'assistant' && isCompletedAnswer(m) && m.content !== STOPPED_EMPTY);
              return (
                // 相談（会話）どうしの間は 32（中は 12）＝どこからどこまでが 1 つの相談か分かるように（2026-10-08 ui-critic）。
                <div key={g[0].id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'calc(var(--space-8) - var(--space-3))' }}>
                  {g.map((m) => (
                    <ChatMessage key={m.id} message={m} showTime onOpenBook={onOpenBook} books={books} actions={allActions} onAddAction={handleAnswerToAction} onAddActionPickBook={onAddActionPickBook} onRetry={busy ? null : regenerate} question={g[0].role === 'user' ? g[0].content : ''} onAskBook={askAboutBook} askBusy={busy} memoBookIds={memoBookIds} onShowPartner={setPartnerSheet} onOpenActions={onOpenActions} />
                  ))}
                  {/* 🧵 この続きを相談する（2026-10-08）: その相談の下に 1 つ。いちばん新しい相談は主ボタン、それより前は文字ボタン
                      （主ボタンを画面に何本も並べない）。押すと相談の画面で、この会話の続きから。 */}
                  {canContinue && (
                    <button
                      type="button"
                      onClick={() => continueThread(g)}
                      disabled={busy}
                      // いちばん新しい相談だけ主ボタン。2 つ目からは文字ボタン（一覧がボタンの列に見えないように・2026-10-08 ui-critic）。
                      style={gi === 0
                        ? { ...(busy ? uiBtnPrimaryOff : uiBtnPrimary), marginLeft: ANSWER_COLUMN, width: `calc(100% - ${AVATAR_SIZE}px - var(--space-2))` }
                        : { ...uiBtnLink, alignSelf: 'flex-start', margin: `calc(-1 * var(--space-2)) 0 0 calc(${ANSWER_COLUMN} - var(--space-1))`, ...(busy ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}
                    >
                      この続きを相談する
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
            onClick={onChatTap}
            // サブタブの行の下 12 に「あなたのメモ N 件から答えます」の 1 行（その下は空の画面で 24・会話があるときは 16）。
            style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)' }}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="相談の会話"
            aria-busy={busy}
          >
          {statusLine}
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
                // 本がもう本棚にあるときは、ホームのはじめの一歩と同じ「読んだ本に一言ずつ残す」（することを言う・2026-10-01）。
                // 本 0 冊のときは「これまで読んだ本から始める」のまま（開くのはどちらも初日クイックスタート）。
                actions={onQuickstart
                  ? [{ label: books.length > 0 ? '読んだ本に一言ずつ残す' : 'これまで読んだ本から始める', variant: 'primary', onClick: onQuickstart }]
                  : onGoBookshelf ? [{ label: '本を開いてメモを書く', variant: 'secondary', onClick: onGoBookshelf }] : []}
              />
            ) : planOut ? (
              // 🪙➕ プランの人がトークンを使い切った（SPEC §3）: 押せない相談例は出さず、案内カードを一番上に。
              <TokensOutCard plan={plan} trialEndLabel={trialEndLabel} cancelLine={trialCancelLine} tokenAllowance={tokenAllowance} onAdd={openTokenSheet}>
                {searchMemos && <SearchMemosLink onClick={searchMemos} />}
              </TokensOutCard>
            ) : (
              <section aria-labelledby={input.trim() ? undefined : 'brain-empty-title'}>
                {/* 🎁 無料プランで今月のトークンを使い切った（2026-10-01）: 相談はメモから探して答える（メモが答える相談）ので、
                    行き止まりにせず、案内カード（プランは文字ボタン）の下に見出しと相談例をいつもどおり出す。 */}
                {freeUsedUp && (
                  <FreeUsedCard tokenAllowance={tokenNextAllowance ?? tokenAllowance} cta={freeUsedCta} onOpen={() => openPaywall('free_used')} style={{ marginBottom: 'var(--space-6)' }} />
                )}
                {showNudge && (
                  <TrialNudgeCard
                    copy={trialNudgeCopy({ memoCount: ownMemoTotal, offer: trialOffer, offerPlan: trialOfferPlan })}
                    onOpen={() => { closeNudge('tap'); openPaywall('grown'); }}
                    onDismiss={() => closeNudge('dismiss')}
                  />
                )}
                {/* 入力欄に書いている間は見出しも相談例も出さない（深掘りのチップと同じ決まり・下書きを入れて開いたとき＝
                    「相談で探す」は困りごとの相談ではないので、主役を入力欄に・2026-09-30）。
                    ただし初日の「相談してみる」で入れた相談（firstDayDraft）は、見出しと「たとえば」を残し、入れた相談を
                    選んだ状態で見せる（押すと入力欄に入れ替わる＝送るのは送信を押したとき・2026-10-02）。 */}
                {(!input.trim() || firstDayDraft) && <>
                <h2 id="brain-empty-title" style={{ ...headingStyle, marginBottom: 'var(--space-6)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('困っていることを、相談してください')}</h2>
                <p style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>たとえば</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {introExamples.map(({ text: q, kind }) => {
                    const picked = !!firstDayDraft && q === input.trim();
                    return (
                    <button
                      key={q}
                      type="button"
                      // 「前に相談した…」は、その会話の全体を開いて続きとして答える。
                      // 初日の下書きのあいだは、押すと入力欄に入れるだけ（選ぶ・送らない）。
                      onClick={() => {
                        if (busy || outOfTokens) return;
                        if (firstDayDraft) { setInput(q); requestAnimationFrame(() => { try { inputRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ } }); return; }
                        // 「前に相談した…」は、その会話の全体を開いて続きとして送る（この続きを相談すると同じ・2026-10-08 ui-critic）。
                        if (kind === 'continue' && lastConsult) { continueThread(lastConsult.group, { send: q }); return; }
                        ask(q);
                      }}
                      disabled={busy || outOfTokens}
                      aria-pressed={firstDayDraft ? picked : undefined}
                      style={{ ...chipStyle, ...(picked ? chipPicked : null), ...(busy || outOfTokens ? { color: 'var(--text-2)', opacity: 1, cursor: 'default' } : null), ...hangIndent(q) }}
                    >
                      {withPhraseBreaks(q)}
                    </button>
                    );
                  })}
                </div>
                </>}
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

          <div ref={messagesColRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* 過去の相談から持ってきた「前の相談」（この会話の文脈）。まだ送っていない間は × でやめられる。 */}
            {carry && (
              <CarryCard
                carry={carry}
                onCancel={!carry.used && !busy ? () => { setCarry(null); track('brain_continue', { action: 'cancel' }); } : null}
              />
            )}
            {visibleMessages.map((m, i) => (
              <Fragment key={m.id}>
                {/* 1 つのやりとりの入れ物（送ったあと相談の吹き出しを上端にそろえる alignTarget が data-turn で探す）。 */}
                <div data-turn="" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {m.memoAnswer ? (
                  <MemoAnswer
                    message={m}
                    column={ANSWER_COLUMN}
                    onOpen={(b, memoId) => { if (b?.id && onOpenBook) onOpenBook(b, memoId); }}
                    onOpenLearning={() => setView('knowledge')}
                    onRetry={() => runMemoAnswerInto(m.id, m.memoAnswer.question || precedingQuestion(visibleMessages, i), m.scopeIds || [], m.memoAnswer.searchQuestion || null)}
                    onPlan={() => { track('brain_memo_answer_plan', {}); openPaywall('free_used'); }}
                    showPlan={freeMode && m.id === firstMemoAnswerId}
                    // メモが 0 件の人だけ初日クイックスタートへ。メモのある人は AI の「関係するメモが無かった答え」と同じ「本を追加」。
                    onAddMemo={ownMemoTotal === 0 && !memoStatsFailed ? (onQuickstart || null) : null}
                    onAddBook={onAddBook || null}
                    onWriteLearning={() => setView('learning')}
                  />
                ) : (
                <ChatMessage
                  message={m}
                  onOpenBook={onOpenBook}
                  stage={m.streaming ? stage : null}
                  slow={!!m.streaming && slowWait && !aborting}
                  books={books}
                  actions={allActions}
                  onAddAction={handleAnswerToAction}
                  onAddActionPickBook={onAddActionPickBook}
                  onRetry={busy ? null : regenerate}
                  onWriteLearning={() => setView('learning')}
                  question={m.role === 'assistant' ? precedingQuestion(visibleMessages, i) : ''}
                  onAskBook={askAboutBook}
                  askBusy={busy}
                  onActionAdded={() => { onConsultActionAdded(m.id); setAddedActionIds((ids) => (ids.includes(m.id) ? ids : [...ids, m.id])); }}
                  askProgress={m.id === askProgressFor ? askProgress : ''}
                  onOpenActions={onOpenActions}
                  memoBookIds={memoBookIds}
                  onShowPartner={setPartnerSheet}
                />
                )}
                </div>
                {/* 🔔 はじめて「行動に追加」した直後に 1 回だけ、思い出しの通知の案内（lib/notifyOptIn.js）。
                    最後の答えのときは、答えの下の文字ボタンの行（別の角度で答えて…）の後ろに出す（答えと操作を離さない・2026-09-29） */}
                {optinAfterId === m.id && !(answerRowShown && i === visibleMessages.length - 1) && <NotifyOptInCard where="action" />}
                {/* 🧪 はじめての相談の答えのあとの 7 日間無料（続けて相談したあとも、その答えの下に残す）。 */}
                {/* 続けて相談して答えを書いている間は、見えなくするだけで場所は残す（消して戻すと会話が跳ねる）。 */}
                {firstTrialId === m.id && !(answerRowShown && i === visibleMessages.length - 1)
                  && firstTrialCard({ marginLeft: ANSWER_COLUMN, ...(busy ? { visibility: 'hidden' } : null) })}
              </Fragment>
            ))}
          </div>

          {/* 無料プランで今月のトークンを使い切ったら、答えの下（まだ話していなければ例の下）で静かに案内
              （読み終えるまで画面を奪わない） */}
          {freeUsedUp && !busy && lastIsAssistant && !isEmpty && (!lastIsMemoAnswer || (!lastMemoFound && lastMemoAnswer?.status !== 'loading')) && (
            <FreeUsedCard tokenAllowance={tokenNextAllowance ?? tokenAllowance} cta={freeUsedCta} onOpen={() => openPaywall('free_used')} style={{ marginTop: 'var(--space-6)', marginLeft: ANSWER_COLUMN }} />
          )}
          {/* 🪙➕ プランの人がトークンを使い切ったら「トークンを追加」（答えの欄に案内が出ているのでボタンだけ。
              まだ話していないときの案内カードは、相談例の代わりに一番上に出す＝上の TokensOutCard） */}
          {planOut && !busy && lastIsAssistant && !isEmpty && (
            <>
              {/* 7 日間無料は枠線のボタン（まもなく毎月のトークンが来るので強くすすめない・2026-09-30） */}
              <button type="button" onClick={openTokenSheet} style={{ ...(plan === 'trial' ? uiBtnGhost : uiBtnPrimary), marginTop: 'var(--space-4)', marginLeft: ANSWER_COLUMN, width: `calc(100% - ${AVATAR_SIZE}px - var(--space-2))` }}>
                トークンを追加
              </button>
              {/* 7 日間無料: 続けないときの解約の期限を日付だけで（2026-09-29・「あと N 日」は出さない） */}
              {trialCancelLine && <p style={{ ...trialCancelLineStyle, marginLeft: ANSWER_COLUMN }}>{withPhraseBreaks(trialCancelLine)}</p>}
            </>
          )}

          {/* 🔭 見方を変えた答えの下: 進み具合の行と同じ見た目で、次にできること（問いの箱にはしない・2026-10-08 ui-critic） */}
          {answerRowShown && lensNextShown && !lastActionAdded && !noMemosYet && (
            <p style={{ margin: 'var(--space-2) 0 0', marginLeft: ANSWER_COLUMN, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks(LENS_NEXT_LINE)}
            </p>
          )}
          {/* 🏁 行動に追加したら一区切り: 「新しい相談をはじめる」を主ボタンで（2026-10-08） */}
          {answerRowShown && lastActionAdded && (
            <button type="button" onClick={handleResolveAndClear} style={{ ...uiBtnPrimary, marginTop: 'var(--space-4)', marginLeft: ANSWER_COLUMN, width: `calc(100% - ${AVATAR_SIZE}px - var(--space-2))` }}>
              新しい相談をはじめる
            </button>
          )}
          {/* 🌱 メモが 0 件の人: チップの代わりに「これまで読んだ本から始める」を主ボタンで（2026-10-09） */}
          {answerRowShown && !lastActionAdded && noMemosYet && !lastIsMemoAnswer && (
            <button type="button" onClick={onQuickstart} style={{ ...uiBtnPrimary, marginTop: 'var(--space-4)', marginLeft: ANSWER_COLUMN, width: `calc(100% - ${AVATAR_SIZE}px - var(--space-2))` }}>
              これまで読んだ本から始める
            </button>
          )}
          {answerRowShown && !lastActionAdded && (
            // 答えのカード → 文字ボタンの文字まで約 20（8 ＋ 押せる範囲 44 の上の空き）。文字の左端は余白 16 に揃える。
            // メモの答えの下に「AI に答えてもらう（プラン）」が出ているときは、別のまとまりとして 24 離す（2026-10-01 ui-critic）。
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: lastIsMemoAnswer && freeMode && visibleMessages[visibleMessages.length - 1]?.id === firstMemoAnswerId ? 'var(--space-6)' : 'var(--space-2)', marginLeft: ANSWER_COLUMN }}>
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
              ) : null}
              {/* 「別の角度で答えて」は入力欄の上のチップの行へ（2026-09-30）。ここは会話を区切る操作だけ。 */}
              <button type="button" onClick={handleResolveAndClear} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>
                新しい相談をはじめる
              </button>
            </div>
          )}
          {answerRowShown && optinAfterId && optinAfterId === visibleMessages[visibleMessages.length - 1]?.id && (
            <NotifyOptInCard where="action" style={{ marginTop: 'var(--space-6)', marginLeft: ANSWER_COLUMN }} />
          )}
          {/* 🧪 はじめての相談の答えを読み終えたところ（答えの下の文字ボタンの行の後ろ）に 1 回だけ。 */}
          {answerRowShown && firstTrialId && firstTrialId === visibleMessages[visibleMessages.length - 1]?.id
            && firstTrialCard({ marginTop: 'var(--space-6)', marginLeft: ANSWER_COLUMN })}
          {sendNotice && !busy && (
            <p role="alert" style={{ margin: 'var(--space-4) 0 0', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius)', background: 'var(--error-soft)', color: 'var(--text)', fontSize: 'var(--text-sub)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks(sendNotice)}
            </p>
          )}
          <div ref={messagesEndRef} />
          {/* AI 免責注記（App Store 審査ガイドライン対応 + 誠実な期待値設定）。固定表示にすると
              会話の面積を削るので、会話の流れの最後（空の画面・答えの下）に置く。 */}
          {historyLoaded && !busy && (isEmpty ? ((!input.trim() || firstDayDraft) && memoStatsLoaded && (ownMemoTotal > 0 || memoStatsFailed) && !planOut && !freeUsedUp && !(scopeIds.length > 0 && scopeMemoCount === 0)) : (lastIsAssistant && !lastIsMemoAnswer && !visibleMessages[visibleMessages.length - 1]?.notice && !visibleMessages[visibleMessages.length - 1]?.error)) && (
            <p style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', marginTop: 'var(--space-6)', marginRight: 0, marginBottom: 0, marginLeft: isEmpty ? 0 : ANSWER_COLUMN, lineHeight: 1.5 }}>
              AI の回答には誤りが含まれることがあります
            </p>
          )}
          {/* 📏 送った相談を上端へ揃えるための下の余白（高さは sizeSpacer が決める） */}
          <div ref={spacerRef} aria-hidden="true" style={{ height: 0, flexShrink: 0 }} />
          </div>{/* /chat-scroll */}

          {/* 🪙 無料プランは、チップの行の上に 1 回だけ使う量（どのチップも相談 1 回分・チップごとには添えない＝横に送る行で切れていた・2026-10-09） */}
          {/* 💬 深掘りのチップ（2026-09-30・SPEC §3）: 答えを書き終えたら、入力欄の上に続きの聞き方を 2〜3 つ。押すとすぐ送る。 */}
          {(followups.length > 0 || regenLabel) && (
            followups.some((c) => c.kind === 'reply' || c.kind === 'decide') ? (
              // 「行動を決める」を出すあいだは折り返す（2026-09-30 ui-critic）: 返事の候補・深掘りの聞き方 →「行動を決める」→
              // 「別の角度で答えて」（返事の候補があるときは出さない）。薄れも横送りも無し＝どのチップも切れない。
              <div role="group" aria-label="続けて聞く" style={followupRowWrap}>
                {chipCostLine}
                {followups.filter((c) => c.kind !== 'decide').map((c, i) => (
                  <button key={`${c.kind}-${c.label}`} type="button" onClick={() => { track('brain_followup', { chip: i, kind: c.kind }); ask(c.send); }} style={followupChip}>
                    {c.label}
                  </button>
                ))}
                {/* 🎯「行動を決める」は決まった頼み方（DECIDE_REQUEST）で送る。行動の印（Target）つき。 */}
                {followups.filter((c) => c.kind === 'decide').map((c) => (
                  // 🔭 見方を変えた答えのあとは「ここで答えと行動を」を行の先頭に（この見方で結論＋行動が次の主な一歩・2026-10-08 ui-critic）。
                  <button key="decide" type="button" onClick={() => { track('brain_followup', { kind: 'decide' }); ask(c.send); }} style={lensOf(lastAsked) ? { ...decideChip, order: -1 } : decideChip}>
                    <Target size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                    {c.label}
                  </button>
                ))}
                {regenLabel && (
                  <button type="button" onClick={regenerate} style={followupChip}>
                    {regenLabel}
                  </button>
                )}
              </div>
            ) : (
              // 行動を決めたあと（深掘りの聞き方だけ）も折り返して並べる（横に送ると端のチップが切れて読めなかった・DESIGN §5・2026-10-09 ui-critic）。
              <div role="group" aria-label="続けて聞く" style={followupRowWrap}>
                {chipCostLine}
                {followups.map((c, i) => (
                  <button key={`${c.kind}-${c.label}`} type="button" onClick={() => { track('brain_followup', { chip: i, kind: c.kind }); ask(c.send); }} style={followupChip}>
                    {c.label}
                  </button>
                ))}
                {regenLabel && (
                  <button type="button" onClick={regenerate} style={followupChip}>
                    {regenLabel}
                  </button>
                )}
              </div>
            )
          )}
          {/* 相談相手は入力欄のすぐ上（SPEC §3）。入力欄にカーソルがある間は出さない（答えと自分の文に場所を譲る・2026-10-08）。 */}
          {/* 続きを相談している間は、相談相手・答え方の行の代わりに「〈題〉の続き」の 1 行（相談相手はその会話のまま・
              × で外すと戻る）。入力欄のまとまりを 1 段減らす（2026-10-08 ui-critic）。 */}
          {chrome.scopeBar && !resumeThread && (
          <ScopeBar
            label={scopeLabelFor(scopeIds, books)}
            scoped={scopeIds.length > 0}
            onOpen={() => setScopeSheetOpen(true)}
            onReset={() => setScopeIds([])}
            disabled={busy}
            mode={modeApplies ? answerMode : null}
            onOpenMode={() => setModeSheetOpen(true)}
            // 深掘りのチップを出しているときは、区切り線はチップの上に 1 本だけ（入力欄のまとまりにチップを入れる）。
            noBorder={followups.length > 0 || !!regenLabel}
          />
          )}
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
          {/* 区切り線は相談相手の行の上に 1 本だけ（入力欄側の線は消す）。相談相手の行を隠している間は入力欄の上に 1 本。 */}
          {/* 🧵 過去の相談の続き（2026-10-08）: 入力欄の上に「〈相談の題〉の続き」の 1 行。× で外すと新しい相談に戻る。 */}
          {resumeThread && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-4)', flexShrink: 0, borderTop: followups.length > 0 || !!regenLabel ? 'none' : '1px solid var(--separator)' }}>
              <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                「{resumeThread.title}」の続き{scopeIds.length > 0 ? `・${scopeLabelFor(scopeIds, books)}` : ''}
              </p>
              <button
                type="button"
                onClick={() => { clearConversation(); track('brain_continue', { action: 'cancel' }); }}
                onMouseDown={(e) => { if (document.activeElement === inputRef.current) e.preventDefault(); }}
                disabled={busy}
                aria-label="続きをやめて、新しい相談にする"
                style={{ ...iconBtn, color: busy ? 'var(--text-3)' : 'var(--text-2)', marginRight: 'calc(-1 * var(--space-3))' }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="ai-input-area" style={chrome.scopeBar || resumeThread ? { borderTop: 'none' } : undefined}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
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
                // メモが答える相談（AI を使わない）: 送れることと、何から答えるかを 1 行で（390 幅で 1 行に収まる長さ）。
                : freeUsedUp ? '困りごと（メモから探します）'
                : carry && !carry.used ? 'この相談の続きを書く'
                // メモが 0 件の人は続けても同じ答えなので、最初の画面と同じ新しい相談の例（2026-10-09 ui-critic）。
                : noMemosYet ? '例：上司への報告がうまくいかない'
                // 390 幅の入力欄に 1 行で収まる長さ（「例：上司への報告がうまくいかない」と同じ 16 字）。
                // AI が状況を聞き返しているときは、答えを書くか続けて聞く（候補のチップのほかに自分の言葉でも）。
                : lastAsksBack ? '返事を書く・続けて相談する'
                // 関係するメモが無かった答えのあとは、続きの例ではなく新しい相談の例（2026-09-30 ui-critic）。
                // 本を探す問いの答えのあとは、見つかったメモをいまに活かす問いの例（本を探す問いは続きの材料に入れないので threadActive に頼らない）。
                : lastLookup && !isNoInfoAnswer(lastVisible) ? '続けて聞く・ほかの言葉で探す'
                : threadActive && !isNoInfoAnswer(lastVisible) ? '続けて聞く：乗り気でないときは？' : '例：上司への報告がうまくいかない'}
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

// 🧪 はじめての相談の答えのあとの 7 日間無料（lib/firstAnswerTrial.js・2026-10-08・実験）。
// 閉じられる 1 行のカード（DESIGN §5「閉じられる 1 行の案内」）: 面は案内カードと同じ・行全体が押せる（右に ›）・右端に ×。
// 押すと有料プランの画面（reason 'first_answer'）。題を立てない（答えのすぐ下で静かに 1 行）。
function FirstAnswerTrialCard({ text, onOpen, onDismiss, onSeen = null, style = null }) {
  // 画面に半分以上入ったら 1 回だけ onSeen（計測の shown＝実験の母数）。見えなくしている間（書いている間）は数えない。
  const ref = useRef(null);
  const hidden = style?.visibility === 'hidden';
  useEffect(() => {
    const el = ref.current;
    if (!el || !onSeen || hidden) return undefined;
    if (typeof IntersectionObserver === 'undefined') { onSeen(); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { onSeen(); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [onSeen, hidden]);
  return (
    <section
      ref={ref}
      aria-hidden={hidden || undefined}
      aria-label="7 日間無料の案内"
      style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', ...style }}
    >
      <button
        type="button"
        onClick={onOpen}
        tabIndex={hidden ? -1 : undefined}
        style={{
          flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-2) var(--space-3) var(--space-4)', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, fontFamily: 'inherit',
        }}
      >
        {/* 狭い画面で 2 行になるときは「、」の後ろで折り返す（「7 日間無料で」と「もっと話す」を離さない）。 */}
        <span style={{ flex: 1, minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {(text.match(/[^、]+、?/g) || [text]).map((part, i) => (
            <span key={i} style={{ display: 'inline-block' }}>{withPhraseBreaks(part.replace('もっと話す', 'もっと\u2060話す'))}</span>
          ))}
        </span>
        {/* アイコンは文字の大きさに合わせる（15 の文字で 20 相当・DESIGN §5 文字の横のアイコンは em）。 */}
        <ChevronRight size="1.34em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="閉じる"
        tabIndex={hidden ? -1 : undefined}
        // 押せる範囲は 44 以上（文字を大きくしたら × と一緒に広がる）。
        style={{ ...iconBtn, minWidth: 44, minHeight: 44, width: '2.94em', height: '2.94em', fontSize: 'var(--text-sub)', color: 'var(--text-3)', flexShrink: 0, marginRight: 'var(--space-1)' }}
      >
        <X size="1.34em" aria-hidden="true" />
      </button>
    </section>
  );
}

// 🎁 無料プランで今月のトークンを使い切ったときの案内カード（会話の場所のいちばん上・AI の答えの下で共通）。
// 2026-10-01: 相談はメモから探して答える（メモが答える相談・AI なし）ので、行き止まりの形（主ボタン「プランを見る」＋
//   「メモを検索して探す」）をやめ、そのことを 1 文で言い、「プランを見る」は文字ボタンに（押し付けない）。
// tokenAllowance: 来月 1 日に戻る量（はじめの月の人も来月は毎月の量）。
// cta: ボタンの文字（7 日間無料を使える人は「7 日間無料で試す」・ほかは「プランを見る」・2026-10-10）。
function FreeUsedCard({ tokenAllowance, onOpen, cta = 'プランを見る', style = null }) {
  return (
    <section aria-label="今月のトークンは、ここまで" style={{ ...cardStyle, ...style }}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
        今月のトークンは、ここまでです
      </p>
      <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        <span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}</span>に <span style={{ whiteSpace: 'nowrap' }}>{fmtTokens(tokenAllowance)} トークン</span>に戻ります。{withPhraseBreaks('それまでは、あなたのメモから探して答えます。')}
      </p>
      <button type="button" onClick={onOpen} style={{ ...uiBtnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
        {cta}
      </button>
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

// 🪙➕ プランの人（有料・無料期間）がトークンを使い切って、まだ話していないときの案内カードは
//   components/TokensOutCard.jsx（AI 選書と共通・2026-10-04）。押せない相談例の代わりに、会話の場所の一番上に置く（SPEC §3）。

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
          {/* 答えは本物と同じ枠（左に相手のアイコンの列 40＝ANSWER_COLUMN の空き → 名前の行 13×1.5 → カード・2026-10-04）。 */}
          <div style={{ marginLeft: ANSWER_COLUMN, display: 'flex', flexDirection: 'column' }}>
            <SkeletonBlock width={96} height="calc(var(--text-meta) * 1.5)" radius="var(--radius)" style={{ marginBottom: 'var(--space-1)' }} />
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <SkeletonBlock width="92%" height={16} radius="var(--radius)" />
              <SkeletonBlock width="80%" height={16} radius="var(--radius)" />
              <SkeletonBlock width="56%" height={16} radius="var(--radius)" />
            </div>
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
// 送った直後で答えの吹き出しがまだ無いときは、その相談の吹き出し（前の答えに合わせて 2 段で動かさない）。
// 会話の欄の中で、いちばん新しい「明日からできる一歩」の箱（[data-next-step]）が欄の下に隠れていたら、
// 欄だけを送って見せる（ページ全体は動かさない）。答えの名前の行から箱まで収まるなら名前の行を上端に、
// 収まらなければ scrollIntoView の block: 'nearest' と同じ最小限の送り。
function revealLastNextStep(el) {
  if (!el) return;
  const boxes = el.querySelectorAll('[data-next-step], [data-ask-box]');
  const box = boxes[boxes.length - 1];
  if (!box) return;
  const r = box.getBoundingClientRect();
  const c = el.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(el).getPropertyValue('--space-4')) || 16;
  if (r.bottom + gap <= c.bottom) return; // もう見えている
  // 答えの入れ物（data-turn＝名前の行から）の上端に揃えても箱が収まるなら、そこへ送る
  // （最小限の送りだと名前の行が文字の途中で切れて見えた・2026-09-30 ui-critic）。
  const turn = box.closest('[data-turn]');
  if (turn) {
    const toTurn = turn.getBoundingClientRect().top - c.top - gap;
    if (toTurn > 0 && r.bottom - toTurn + gap <= c.bottom) {
      el.scrollTo({ top: el.scrollTop + toTurn, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      return;
    }
  }
  let delta = r.bottom + gap - c.bottom;
  if (r.top - delta < c.top) delta = r.top - c.top - gap; // 箱が欄より高いときは上端を見せる
  if (Math.abs(delta) < 1) return;
  el.scrollTo({ top: el.scrollTop + delta, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

function alignTarget(el) {
  const answers = el.querySelectorAll('[aria-label="相談への答え"]');
  const last = answers[answers.length - 1];
  const questions = el.querySelectorAll('[aria-label="あなたの相談"]');
  const lastQ = questions[questions.length - 1];
  if (lastQ && (!last || !(lastQ.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING))) return lastQ;
  if (!last) return null;
  // 答えは 1 つずつ data-turn の入れ物に入っている（語り口の一行と答えをまとめる・2026-09-30）。
  // 直前の入れ物の中の相談の吹き出しを探し、答えに合わせるときは入れ物ごと（上の一行を半分に切らない）。
  const turn = last.closest('[data-turn]');
  const q = turn?.previousElementSibling?.querySelector('[aria-label="あなたの相談"]') || null;
  const isQ = !!q;
  return isQ && q.offsetHeight < el.clientHeight * 0.4 ? q : (turn || last);
}

function questionAlignTop(el) {
  const target = alignTarget(el);
  if (!target) return null;
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
// 文節の切れ目でだけ折り返す版（明日からできる一歩など・keep-all と一緒に使う・2026-09-30）。
// 数と単位の間の空き（「1 回」「1 行」）では折り返さない（「を 1／回だけ」と割れていた）。
const keepNumberUnit = (t) => String(t ?? '').replace(/(\d) (?=[回件冊行つ日週分秒時年人度個枚ページか])/g, '$1\u00a0');
function renderBoldPhrased(raw) {
  const parts = renderBoldInline(raw);
  const list = Array.isArray(parts) ? parts : [parts];
  return list.map((part, i) => {
    if (typeof part === 'string') return <span key={`p${i}`}>{withPhraseBreaks(keepNumberUnit(part))}</span>;
    if (part && part.type === 'strong') return <strong key={`p${i}`} style={part.props.style}>{withPhraseBreaks(keepNumberUnit(part.props.children))}</strong>;
    return part;
  });
}

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

// 回答（【結論】【参照した本のメモ】【あなたの状況に合わせた解釈】【あなたに聞きたいこと】か【明日からできる 1 つの行動】）を
// 「結論 → 聞きたいこと／明日の一歩 → 根拠（畳む）」の順に組み替える（SPEC §3: 結論と、次にすることを先に）。
// 🎯 行動は会話で決める（2026-09-30）: 最初の答えは【あなたに聞きたいこと】（問い 1 文＋候補「・…」）で終わる。
//   question＝問い（カードに出す）・replies＝候補（入力欄の上の返事のチップ）。前の形の答え（一歩つき）はこれまでどおり action。
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
        : /聞きたい/.test(name) ? 'ask'
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
  // 🎯 【あなたに聞きたいこと】の問いと候補（候補の後ろの段落＝お試しの注記などは note へ）
  const ask = sections.ask ? parseAskSection(join('ask')) : null;
  // 📚 答え方「本ごとに」（【本ごとの視点】があるときだけ books を返す。無ければ null＝いつもの答え）
  const bookViews = sections.books ? parseBookViews(join('books')) : null;
  return {
    conclusion,
    refs: join('refs'),
    interp: join('interp'),
    action: (actionHead || '').trim(),
    actionLabel,
    question: ask ? ask.question : '',
    replies: ask ? ask.replies : [],
    note: [...actionRest.map((t) => t.trim()).filter(Boolean), ...(ask && ask.rest ? [ask.rest] : []), ...notes].join('\n'),
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
      // titleDone: 書名が書き終わっている（『』が閉じた・「｜」で著者に進んだ・次の行が来た）＝本棚の本か確かめてよい
      let titleDone = false;
      const closed = rest.match(/^『([^』]*)』(.*)$/);
      if (closed) { title = closed[1]; author = closed[2]; titleDone = true; }
      else if (rest.startsWith('『')) title = rest.slice(1);
      else { const [t, ...a] = rest.split(/[｜|]/); title = t; author = a.join(' '); titleDone = a.length > 0; }
      author = author.replace(/^[\s｜|／/:：・\-—（(]+/, '').replace(/[)）]\s*$/, '').trim();
      cur = { title: title.replace(/\*\*/g, '').trim(), author, view: '', basis: '', page: null, titleDone };
      books.push(cur);
      field = 'view';
      return;
    }
    if (!cur) { lead.push(line); return; }
    cur.titleDone = true; // 次の行が来た＝書名の行は書き終わった
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

// 案内文の「10月1日」を途中で改行させない。
function renderNoticeText(text) {
  const parts = String(text || '').split(/(\d{1,2}月\d{1,2}日)/);
  return parts.map((p, i) => (/^\d{1,2}月\d{1,2}日$/.test(p) ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{p}</span> : p));
}

// 📚 本ごとの答えの 1 冊分（DESIGN §5 カード）。書名と著者はカードの上の名前の行（PartnerRow・表紙のアイコンつき）→
// 視点（読む文章＝明朝 18）→ 根拠 13/--text-2（p.N「メモの一節」）→ 文字ボタン「この本にくわしく聞く」。
function PerBookCard({ book, streaming, onAsk, askBusy, basisCheck = null, showTitle = false }) {
  const cursor = streaming ? <span className="streaming-cursor" aria-hidden="true" /> : null;
  // 根拠の引用がメモと一致しなかったとき（evidenceCheck.js）は、引用を外してページだけ残し、その旨を書く。
  const basisNg = basisCheck?.s === 'ng';
  // その本のメモに無い・一致したメモと違うページ（w・2026-10-04）は根拠の文から外し、一致したメモのページがあればそれに替える
  // （作ったページを見せない）。
  const basisRaw0 = tidyQuotes(String(book.basis || '').replace(/\*\*/g, ''));
  const basisRaw = basisCheck?.w
    ? `${Number.isFinite(basisCheck.p) ? `p.${basisCheck.p}` : ''}${stripPageRefs(basisRaw0)}`
    : basisRaw0;
  const basis = basisNg ? stripQuotes(basisRaw) : basisRaw;
  return (
    <article aria-label={`『${book.title}』の視点`} style={cardStyle}>
      {/* 書名と著者は、カードの上の名前の行（「著者『書名』」・表紙のアイコンつき・PartnerRow）に出す（2026-09-30）。
          語り口の答えは名前の行が「著者名（本の語り口で・AI）」なので、書名をカードの 1 行目に（『 はぶら下げる）。 */}
      {showTitle && book.title && (
        <p style={{ margin: '0 0 var(--space-2)', textIndent: '-0.5em', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>『{withPhraseBreaks(book.title)}』</p>
      )}
      {book.view && (
        <div style={readText}>
          {book.view.split('\n').filter((l) => l.trim()).map((l, i, arr) => (
            <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0, ...hangIndent(l) }}>{renderBoldInline(l)}{!basis && i === arr.length - 1 && cursor}</p>
          ))}
        </div>
      )}
      {(basis || basisNg) && (
        <p style={{ margin: book.view ? 'var(--space-2) 0 0' : 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
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
// 「（期限は明日）見る」をひとまとまり（nowrap）にする。「見る」は押せる範囲 44×44（幅も 44・2026-09-30）のまま、上下の負の余白で行の高さを変えない。
// ✓ は 2 行になっても 1 行目の高さの中央に置く。
// deadline: null = 明日（既定）。本を選んで追加するときに期限を変えたら、その期限（'' = 期限なし・2026-09-30）。
// focus: 追加した行動（{ bookId, text }）。「見る」で行動の一覧のその行まで送る（2026-09-30）。
// already: 前に（ほかの画面で）足した答えを開き直したとき＝「行動に追加済み」（期限は書かない・画面を送らない・2026-10-09）。
function ActionAddedNote({ onOpenActions, deadline = null, focus = null, already = false }) {
  const deadlineText = already ? ''
    : deadline == null ? '（期限は明日）'
    : deadline ? `（期限は${Number(deadline.slice(5, 7))}月${Number(deadline.slice(8, 10))}日）` : '';
  // 出たら、画面の外（下）に隠れないよう最小限だけ送って見せる（キーボードや下の欄に隠れていた・2026-09-29）。
  const ref = useRef(null);
  useEffect(() => {
    if (already) return;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    try { ref.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } catch { /* ignore */ }
  }, []);
  return (
    <p ref={ref} role={already ? undefined : 'status'} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', minHeight: 'var(--tap-min)', boxSizing: 'border-box', paddingBlock: 'calc((var(--tap-min) - 1.5em) / 2)', margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, color: 'var(--success)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0 }}>
        <Check size="1.1em" aria-hidden="true" />
      </span>
      <span style={{ minWidth: 0 }}>
        {already ? '行動に追加済み' : '行動に追加しました'}
        {/* かっこは詰める（palt）: 行頭に来ても左が空いて見えず、「）」と「見る」の間も空きすぎない。 */}
        <span style={{ whiteSpace: 'nowrap' }}>
          {deadlineText && <span style={{ fontFeatureSettings: '"palt"' }}>{deadlineText}</span>}
          {/* 入った先（振り返り › 行動）をその場で見られる（2026-09-29）。左右 4 の内側余白が文字との間になる。 */}
          {onOpenActions && (
            <button type="button" onClick={() => onOpenActions(focus)} aria-label="追加した行動を見る" style={{ ...uiBtnLink, minWidth: 'var(--tap-min)', justifyContent: 'center', verticalAlign: 'middle', marginBlock: 'calc((1.5em - var(--tap-min)) / 2)' }}>見る</button>
          )}
        </span>
      </span>
    </p>
  );
}

// 🎯 この答えの一歩を行動に入れるときの文（handleAnswerToAction・本を選ぶシートと同じ形）。
function answerActionText(content, question) {
  const line = extractActionLine(content);
  if (!line) return '';
  return stripScenePrefix(answerStepToAction(standaloneAction(line, question, LIMITS.actionText)));
}

// 🎯 前に（ほかの画面・ほかの端末で）この答えから行動を足したか（lib/consultActionAdded.js・2026-10-09）。
function answerActionAddedBefore(message, question, actions) {
  const text = answerActionText(message?.content, question);
  if (!text) return false;
  return answerActionStatus({ answerId: message.id, actionText: text, actions }).added;
}

function ChatMessage({ message, onOpenBook, stage, slow = false, books, actions = null, onAddAction, onAddActionPickBook, onRetry, onWriteLearning, showTime = false, question = '', onAskBook = null, askBusy = false, onActionAdded = null, onOpenActions = null, memoBookIds = null, onShowPartner = null, askProgress = '' }) {
  const isUser = message.role === 'user';
  const isStreaming = !!message.streaming;
  const hasBody = typeof message.content === 'string' && message.content.length > 0;
  const showStageBlock = isStreaming && !hasBody;

  // 🧠→🎯 回答の「明日からできる一歩」を、紐づく本の行動リストへ 1 タップ追加。
  const [actionAdded, setActionAdded] = useState(false);
  // 本を選んで追加したとき、期限を変えていたらその期限（'' = 期限なし）。null = 明日のまま。
  const [addedDeadline, setAddedDeadline] = useState(null);
  // 追加した行動の目印（{ bookId, text }・「見る」でその行へ）。
  const [addedFocus, setAddedFocus] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const canAct = !isUser && !isStreaming && !message.error && (!!onAddAction || !!onAddActionPickBook);
  const actionLine = canAct ? extractActionLine(message.content) : '';
  // 行動の一覧では相談の文脈なしに読まれるので、「この件」「それ」で始まる一歩には相談の要約を頭に付ける（lib/consultHelpers.js）。
  const actionForList = actionLine ? standaloneAction(actionLine, question, LIMITS.actionText) : '';
  // 参照メモから本を特定できれば直接その本へ。特定できない一般回答は本選択シートへ。
  const actionBookId = actionLine && onAddAction ? resolveActionBookId((message.refs || []).filter((r) => !isMetaRef(r)), books) : null;
  // 関係するメモが無かった答えの一歩（「次に読む本で…」など）は行動にしない（下に「本を追加」「学びを書く」を出す）。
  const canShowAction = !!actionLine && (!!actionBookId || !!onAddActionPickBook) && !isNoInfoAnswer(message);
  // 前にこの答えから行動を足していたら（過去の相談・この続きを相談するで開き直したとき）、「行動に追加済み」で押せない（2026-10-09）。
  const priorAdded = useMemo(() => {
    if (!canShowAction || actionAdded) return null;
    const st = answerActionStatus({ answerId: message.id, actionText: stripScenePrefix(answerStepToAction(actionForList)), actions });
    if (!st.added) return null;
    return { focus: st.action ? { bookId: st.action.bookId, text: st.action.text } : null };
  }, [canShowAction, actionAdded, message.id, actionForList, actions]);
  const handleAddAction = async () => {
    if (!actionLine || actionBusy || priorAdded) return;
    if (actionBookId && onAddAction) {
      setActionBusy(true);
      const ok = await onAddAction(actionBookId, actionForList);
      setActionBusy(false);
      if (ok) { rememberAnswerActionAdded(message.id, (typeof ok === 'object' && ok?.text) || stripScenePrefix(answerStepToAction(actionForList))); setAddedFocus(typeof ok === 'object' ? ok : null); setActionAdded(true); onActionAdded?.(); }
    } else if (onAddActionPickBook) {
      // 本を特定できない（いちばんの根拠が自分の学びなど）→ 本選択シートで行動文をプレフィル（確定は本を選んだ時点）。
      // 本を選んで追加できたら、答えの中を「行動に追加しました（期限は明日）見る」に変える（二重に足さない・2026-09-30）。
      // シートの上には、この答えの根拠になった本を先に並べる。
      const evidenceBookIds = [...new Set((message.refs || []).filter((r) => !isMetaRef(r)).map((r) => resolveRefBookId(r, books)).filter(Boolean))];
      onAddActionPickBook(stripScenePrefix(answerStepToAction(actionForList)), (deadline, focus) => {
        setAddedDeadline(deadline === tomorrowLocal() ? null : (deadline ?? null));
        setAddedFocus(focus && typeof focus === 'object' ? focus : null);
        rememberAnswerActionAdded(message.id, (focus && typeof focus === 'object' && focus.text) || stripScenePrefix(answerStepToAction(actionForList)));
        setActionAdded(true);
        onActionAdded?.();
      }, { evidenceBookIds });
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
  // 💬 相談相手のアイコン（2026-09-30・lib/consultPartner.js）: 書き終えた答えは根拠の本から、書いている途中・失敗・
  //   案内・関係するメモが無かった答えは相談相手（送ったときのすべての本／1 冊／選んだ数冊）から。
  // 🗣 著者の語り口で書いた答え（2026-09-30）: 名前を「著者名（本の語り口で・AI）」に。本ごとには本のカードごと。
  const voice = message.error || message.notice ? null : (message.voice || decodeVoice(message.refs));
  const partner = consultPartner({
    refs: message.refs,
    scopeIds: message.scopeIds || [],
    books,
    memoBookIds,
    useScope: isStreaming || !!message.error || !!message.notice || isNoInfoAnswer(message),
    voice: voice && !voice.perbook ? voice : null,
  });
  // 数冊の本から答えたときは、名前（アイコン）を押すと本の一覧（「あなたの本棚」は全部の本なので一覧にしない）。
  const openPartnerList = onShowPartner && partner.kind === 'group' && !partner.shelf && partner.books.length > 0
    ? () => onShowPartner(partner)
    : null;
  // 🌱 「使ったメモ」の一行は refs の先頭に目印付きで保存している（表を増やさずに履歴にも残す）。
  const allRefs = Array.isArray(message.refs) ? message.refs : [];
  const evidence = (allRefs.find((r) => String(r).startsWith(EVIDENCE_PREFIX)) || '').slice(EVIDENCE_PREFIX.length);
  // 「前の相談から メモ +N 件」（積み重ねが効いていることを事実で・点数やバッジにしない）
  const growth = (allRefs.find((r) => String(r).startsWith(GROWTH_PREFIX)) || '').slice(GROWTH_PREFIX.length);
  // 相談の材料に入れた「最近完了した行動」の件数（0＝行を出さない）
  const actedCount = Math.max(0, parseInt((allRefs.find((r) => String(r).startsWith(ACTED_PREFIX)) || '').slice(ACTED_PREFIX.length), 10) || 0);
  // 引用を実際のメモと突き合わせた結果（無い＝古い答え。そのときは AI の文のまま見せる）
  const quoteChecks = decodeQuoteRefs(allRefs);
  // 渡したメモに無い本・学びの参照（'x'・2026-10-04）は出さない。照合の結果があるのに全部 'x' なら、AI の文（p.refs）にも戻さない。
  const refChecksAll = quoteChecks.filter((c) => c.k === 'r');
  const refChecks = refChecksAll.filter((c) => c.s !== 'x');
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
    return [...byTitle].filter(([, ss]) => ss.every((x) => x === 'ng' || x === 'x')).map(([t]) => t);
  })();
  const shelfLoaded = Array.isArray(books) && books.length > 0;
  const refsList = allRefs.filter((r) => {
    if (isMetaRef(r)) return false;
    const m = String(r).match(/『([^』]+)』/);
    const t = m ? m[1].trim() : '';
    // 本棚に無い本の参照は「もとになった本」に出さない（以前の答えにも効く・2026-10-04。新しい答えは ai.js の groundRefs で外してある）
    if (t && shelfLoaded && !shelfBookForTitle(t, books)) return false;
    if (failedTitles.length === 0) return true;
    return !t || !failedTitles.some((f) => f === t || f.includes(t) || t.includes(f));
  });
  // 🔎 本を探す問い（「『…』みたいなことを書いた本はどれ？」・2026-09-30）: 照合で一致したメモを、結論のすぐ下に
  //   開いたまま並べる（すべての本の検索のメモの行と同じ組み立て・押すとその本のそのメモ）。「根拠を見る」は出さない。
  const isLookup = message.expect === 'lookup' || isBookLookup(question);
  const lookupRows = isLookup && parsed ? (() => {
    const compiled = compileTerms(splitQuery(lookupTerm(question)));
    const seen = new Set();
    return refChecks.filter((c) => c.s === 'ok' && !c.u && c.x).map((c, i) => {
      const book = (c.b && (books || []).find((b) => b.id === c.b)) || bookForRef(`『${c.t}』`, books) || { id: null, title: c.t || '', author: '' };
      const key = c.i || `${book.id || c.t}-${c.p ?? ''}-${i}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { key, book, hit: { kind: 'memo', memoId: c.i || undefined, page: Number.isFinite(c.p) ? c.p : null, createdAt: c.c || null, segments: buildSnippet(c.x, compiled) } };
    }).filter(Boolean);
  })() : [];
  // 関係するメモが無くてトークンを返したとき（答えの下に 13/--text-2 の一行）
  const refundNote = allRefs.some((r) => String(r).startsWith(REFUND_PREFIX)) ? REFUND_NOTE : '';
  const renderRefund = () => (refundNote && !isStreaming ? (
    <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(refundNote)}</p>
  ) : null);
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
  const fusedTail = !liveFused ? null : liveFused.action ? 'action' : liveFused.question ? 'ask' : (liveFused.refs || liveFused.interp) ? 'middle' : 'conclusion';
  // 書いている途中は、最後が行動の箱か問いの箱かを先に決めて待つ（行動を決める回だけ行動の箱・message.expect）。
  const expectAction = message.expect === 'action';
  const cursor = <span className="streaming-cursor" aria-hidden="true" />;
  const fallbackNote = !message.error && !message.notice && message.perbookFallback
    ? (message.perbookFallback === 'none' ? '並べられる本がまだないので、' : '並べられる本が 1 冊だけなので、')
    : '';
  const perBookTail = !isStreaming || !perBook ? null
    : perBook.action ? 'action' : perBook.question ? 'ask' : perBook.compare ? 'compare' : perBook.books?.length ? 'book' : 'conclusion';
  const tail = perBookTail || fusedTail;

  // 明日からできる一歩（＋ 行動に追加）
  const renderAction = (p, marginTop) => (p.action ? (
    <div data-next-step="" style={{ marginTop, ...nextStepBox }}>
      {/* 行動の箱だけ 🎯 の印（Target）を見出しの頭に（問いの箱・「心に残るもの」には付けない＝行動と見分ける・2026-09-30 ui-critic）。 */}
      {isActionAnswer(p) ? (
        <p style={{ ...subLabel, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <Target size={16} aria-hidden="true" style={{ flexShrink: 0 }} />{p.actionLabel}
        </p>
      ) : (
        <p style={subLabel}>{p.actionLabel}</p>
      )}
      {/* 書いている間は、書き始める前の形（3 行）と同じ高さを取っておく（一歩の 1 行目が出た瞬間に
          箱が 2 行ぶん縮み、書き進むとまた伸びて「行動に追加」が上下していた・2026-09-29）。 */}
      <p style={{ ...readText, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'break-word', ...hangIndent(p.action), ...(isStreaming ? { minHeight: STEP_SKELETON_HEIGHT } : null) }}>{renderBoldPhrased(p.action)}{tail === 'action' && cursor}</p>
      {/* 書いている間は、押せない形で同じ場所に置く（書き終わったときに下が押し下がらないように） */}
      {isStreaming && (onAddAction || onAddActionPickBook) && (
        <button type="button" disabled aria-hidden="true" tabIndex={-1} style={{ ...rowBtn, ...rowBtnOffOnFill, marginTop: 'var(--space-3)' }}>
          <Target size={16} aria-hidden="true" />行動に追加
        </button>
      )}
      {canShowAction && (
        actionAdded ? (
          <ActionAddedNote onOpenActions={onOpenActions} deadline={addedDeadline} focus={addedFocus} />
        ) : priorAdded ? (
          <ActionAddedNote already onOpenActions={onOpenActions} focus={priorAdded.focus} />
        ) : (
          <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)', ...(actionBusy ? rowBtnOffOnFill : null) }}>
            <Target size={16} aria-hidden="true" />行動に追加
          </button>
        )
      )}
    </div>
  ) : null);
  // 🎯 あなたに聞きたいこと（行動を決めない回の締め・2026-09-30）。候補はカードに並べず、入力欄の上の返事のチップだけ
  //   （次にすることは 1 か所）。行動の箱と同じ面・同じ場所（結論のすぐ下）。
  const renderAsk = (p, marginTop) => (p.question ? (
    <div data-ask-box="" style={{ marginTop, ...nextStepBox }}>
      <p style={subLabel}>{ASK_LABEL}</p>
      <p style={{ ...readText, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'break-word', ...hangIndent(p.question), ...(isStreaming ? { minHeight: ASK_SKELETON_HEIGHT } : null) }}>{renderBoldPhrased(p.question)}{tail === 'ask' && cursor}</p>
      {/* 🏁 いまどこにいるか（2026-10-08）: 問いの下 8 に 13/--text-2 の 1 行（状態色・段階のバーは使わない）。
          送った直後の 1 画面（答えの上端＝問いの箱が見える位置）で読めるよう、答えの下ではなく箱の中に置く。 */}
      {askProgress && !isStreaming && (
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {withPhraseBreaks(askProgress)}
        </p>
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
        {/* 文節の切れ目でだけ折り返す（「いちば／ん古いのは」のように語の途中で割らない・2026-10-02 ui-critic）。 */}
        {evidence && <span style={{ display: 'block', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(evidence)}</span>}
        {/* 前の相談から増えたメモ（事実だけ・点数やバッジにしない）。数字は等幅。 */}
        {growth && <span style={{ display: 'block', fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(growth)}</span>}
      </span>
    </div>
  ) : null);
  // 根拠（参照したメモ・解釈・もとになった本）は畳む
  // 参照したメモを出すか: 照合の結果があればそのうち出せるもの（'x' 以外）・結果が無い古い答えは AI の文（p.refs）。
  //   全部が渡したメモに無い参照（'x'）で、解釈・もとになった本・踏まえたことも無ければ「根拠を見る」ごと出さない（2026-10-04 ui-critic）。
  const showRefChecks = (p) => (refChecksAll.length > 0 ? refChecks.length > 0 : !!p.refs);
  const renderDetails = (p) => ((showRefChecks(p) || p.interp || refsList.length > 0 || actedCount > 0) ? (
    <details style={{ marginTop: 'var(--space-3)' }}>
      <summary style={summaryStyle}>
        {/* 見出しは書いたばかりの答えと過去の相談で同じ「根拠を見る」だけ（過去の相談にだけ「（N 冊のメモ）」が付いて
            食い違っていた・2026-09-30）。何冊かは中の「もとになった本」で分かる。 */}
        <span>根拠を見る</span>
        <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-1)' }}>
        {!showRefChecks(p) ? null : refChecks.length > 0 ? (
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
                        // 書名・メモは文節の切れ目でだけ折り返す（BudouX の <wbr>＋keep-all・2026-09-29）。
                        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere', ...(c.t ? { textIndent: '-0.5em' } : null) }}>
                          {/* 学び（本の無いメモ）は書名の代わりに「自分の学び（M月D日）」（2026-09-29） */}
                          {withPhraseBreaks(c.t ? `『${c.t}』` : c.u ? `自分の学び${learningDateLabel(c.d)}` : '')}{c.p != null ? <span style={{ whiteSpace: 'nowrap' }}>p.{c.p}</span> : ''}
                        </p>
                      )}
                      {c.s === 'ok' ? (
                        // 引いたメモの本文はそのまま流す（文節の区切りで止めると、長い一節の右端がぎざぎざに空く・2026-09-30）。
                        // 文節で折り返すのは上の書名の行だけ。
                        <p style={{ ...subText, margin: 'var(--space-1) 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.x}</p>
                      ) : (
                        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                          {withPhraseBreaks('メモと一致しない引用だったので、表示していません')}
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
  // 🗣 語り口の答えには、いつも答えの最後に一行（名前の行と、この最後の一行でいつも分かる・2026-09-30）。
  const renderVoiceLine = () => (voice && !isStreaming ? (
    <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(VOICE_FOOT_TEXT)}</p>
  ) : null);
  // 注記は段落ごとに分け、先頭の「（」をぶら下げ・文節で折り返す（DESIGN・SPEC §3）。
  const renderNote = (p) => (p.note ? p.note.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((line, i) => (
    <p key={i} style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, margin: 'var(--space-2) 0 0', wordBreak: 'keep-all', overflowWrap: 'anywhere', ...hangIndent(line) }}>{withPhraseBreaks(line)}</p>
  )) : null);

  // 答えが 1 文字も返らなかった失敗は、答えのカードに入れず ErrorMessage だけを置く
  // （カードの中に --error-soft の面を重ねない・DESIGN §5「カードの中にカードを入れない」・2026-09-30）。
  if (!isStreaming && !message.notice && message.error && typeof message.content === 'string' && message.content.startsWith(`${ANSWER_FAILED_TITLE}。`)) {
    return (
      <div role="article" aria-label="相談への答え">
        <PartnerRow partner={partner}>
          <ErrorMessage
            title={ANSWER_FAILED_TITLE}
            description={message.content.slice(ANSWER_FAILED_TITLE.length + 1) || ANSWER_FAILED_DESC}
            actions={onRetry ? [{ label: 'もう一度', onClick: onRetry, variant: 'secondary' }] : []}
          />
        </PartnerRow>
      </div>
    );
  }

  if (perBook) {
    // 渡していない本（本棚に無い本）のカードは出さない（AI が材料の外から本を持ち出したとき・2026-10-04）。
    //   書いている途中も、◆ の書名の行が書き終わった時点で確かめる（書き終えた瞬間にカードが消えないように・ui-critic）。
    //   書名を書いている途中のカードは、書き終わるまで出さない（本棚に無い本を一瞬でも見せない）。
    const perBookBooks = (perBook.books || []).filter((b) => {
      if (!b.title) return !isStreaming;
      if (isStreaming && !b.titleDone) return false;
      return !shelfLoaded || !!shelfBookForTitle(b.title, books);
    });
    const lastBook = perBookBooks.length - 1;
    // ◆ の形が崩れて本を取り出せなかった答え（booksRaw）も、本棚に無い本の書名を含む行は出さない（確かめていない書名を見せない）。
    const booksRaw = !perBook.booksRaw ? '' : perBook.booksRaw.split('\n').filter((l) => {
      const ts = [...l.matchAll(/『([^』\n]+)』/g)].map((m) => m[1].trim()).filter(Boolean);
      return !shelfLoaded || ts.every((t) => shelfBookForTitle(t, books));
    }).join('\n').trim();
    const hasBooks = perBookBooks.length > 0 || !!booksRaw || !!perBook.booksLead;
    const showFoot = !!(perBook.compare || perBook.action || perBook.question || (!isStreaming && (evidence || refsList.length > 0 || perBook.note || refundNote)));
    return (
      // 本ごとの答えは、結論のカード → 本のカード（1 冊 1 枚）→ 共通点と違い・一歩・根拠のカード。
      // 外側は枠を付けない（カードの中にカードを入れない）。
      <div role="article" aria-label="相談への答え" aria-busy={isStreaming || undefined} style={{ display: 'flex', flexDirection: 'column', wordBreak: 'break-word' }}>
        {/* 結論のカードには、並べた本たちのアイコン（数冊）。本のカードには、それぞれの本の表紙と「著者『書名』」。
            見出し・共通点と違いのカードは、アイコンの列の分だけ下げて左端をそろえる（PartnerRow の空き）。 */}
        <PartnerRow partner={perbookSummaryPartner(partner)} onOpenList={openPartnerList}>
          <div style={answerCard}>
            <div style={readText}>
              {perBook.conclusion.split('\n').filter((l) => l.trim()).map((l, i, arr) => (
                <p key={i} style={{ margin: i ? 'var(--space-2) 0 0' : 0, ...hangIndent(l) }}>{renderBoldInline(l)}{perBookTail === 'conclusion' && i === arr.length - 1 && cursor}</p>
              ))}
            </div>
          </div>
        </PartnerRow>
        {hasBooks && (
          <section aria-label="本ごとの視点" style={{ marginTop: 'var(--space-6)' }}>
            <PartnerRow partner={null}>
              <h3 style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>本ごとの視点</h3>
              {perBook.booksLead && <p style={{ ...readText, margin: '0 0 var(--space-3)' }}>{renderBoldInline(perBook.booksLead)}</p>}
            </PartnerRow>
            {booksRaw ? (
              <PartnerRow partner={null}>
                <div style={answerCard}><div style={readText}><PlainAnswer text={booksRaw} gap="var(--space-4)" /></div></div>
              </PartnerRow>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {perBookBooks.map((b, i) => {
                  const shelfBook = b.title ? shelfBookForTitle(b.title, books) : null;
                  const bookId = !isStreaming && onAskBook && shelfBook ? shelfBook.id : null;
                  // 本のアイコンと名前（本棚の本と合えばその表紙・著者。合わなければ答えの書名と著者だけ）。
                  const plainPartner = consultPartner({ refs: [`📚 『${shelfBook ? shelfBook.title : b.title}』`], scopeIds: [], books: shelfBook ? [shelfBook] : [{ id: `perbook-${i}`, title: b.title, author: b.author, cover: null }] });
                  // 語り口の答えは「著者名（本の語り口で・AI）」＋カードの中に『書名』。それより前の答えは「著者『書名』」。
                  const bookPartner = voice?.perbook ? withVoice(plainPartner) : plainPartner;
                  return (
                    <PartnerRow key={i} partner={bookPartner} nameAs="h4">
                      <PerBookCard
                        showTitle={!!voice?.perbook}
                        book={b}
                        basisCheck={isStreaming ? null : basisCheckFor(b.title)}
                        streaming={perBookTail === 'book' && i === lastBook}
                        onAsk={bookId ? () => onAskBook(bookId, b.title, question) : null}
                        askBusy={askBusy}
                      />
                    </PartnerRow>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {showFoot && (
          <PartnerRow partner={null} style={{ marginTop: 'var(--space-6)' }}>
          <div style={answerCard}>
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
            {renderAsk(perBook, perBook.compare || perBook.action ? 'var(--space-4)' : 0)}
            {!isStreaming && renderEvidence()}
            {!isStreaming && renderDetails(perBook)}
            {!isStreaming && renderNote(perBook)}
            {renderRefund()}
            {renderVoiceLine()}
          </div>
          </PartnerRow>
        )}
        {/* 書いている間は、最後のカードの下に「答えを書いています…」（本のカードが順に増えるので、続きがあると分かるように）。
            中止を押したら（stage が消える）すぐに外す。親が role="log" aria-live なので live 領域は重ねない。 */}
        {isStreaming && stage === 'generate' && (
          // 左端は本のカードの列（アイコン 32＋間 8＝40）にそろえる（2026-10-04 ui-critic）
          <div className="ai-thinking" style={{ alignSelf: 'stretch', marginTop: 'var(--space-3)', position: 'sticky', bottom: 0, background: 'var(--bg)', paddingBlock: 'var(--space-2)', paddingLeft: 'var(--space-10)' }}>
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
    >
    {/* 💬 相手のアイコン（左）＋名前の行（13/--text-2）＋答えのカード（LINE の相手の吹き出しと同じ並び・2026-09-30） */}
    {/* 本を探す問いは、見つかった本を並べる答えなので、ひとりの著者の名前にしない（「N 冊の本」・本ごとにの結論と同じ）。 */}
    <PartnerRow partner={isLookup ? perbookSummaryPartner(partner) : partner} onOpenList={openPartnerList}>
    <div style={answerCard}>
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
          {/* 8 秒たっても 1 文字も来ないとき（止めるのは入力欄の右のボタン）。形の下に足すので、骨組みは動かさない。 */}
          {slow && (
            // 文節の切れ目でだけ折り返す（「お待ちくだ／さい」と語の途中で切らない・2026-10-04）。
            <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {/* 折り返すときは「。」のあとで（文ごとのまとまり）。 */}
              <span style={{ display: 'inline-block' }}>時間がかかっています。</span><span style={{ display: 'inline-block' }}>もう少しお待ちください</span>
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
          {/* 結論を書いている間は、その下に一歩の形も「根拠を見る」も出さない（結論が伸びるたびに下の箱が押し下げられて
              揺れていた・2026-09-30）。結論を書き終えてから一歩の形を出す（新しいものは下に足されるだけ＝読んでいる行は動かない）。 */}
          {tail === 'conclusion' || ((message.expect === 'lookup' || message.expect === 'lens') && !liveFused.action && !liveFused.question) ? null : liveFused.action ? renderAction(liveFused, 'var(--space-4)') : liveFused.question ? renderAsk(liveFused, 'var(--space-4)') : (
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
              {/* 最初の答え・続きの返事は問いの箱（2 行・ボタンなし）、行動を決める回は行動の箱（3 行＋押せない「行動に追加」）で待つ。 */}
              {(expectAction ? ['92%', '84%', '56%'].slice(0, STEP_SKELETON_LINES) : ['88%', '52%'].slice(0, ASK_SKELETON_LINES)).map((w) => (
                <div key={w} style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-read) * 1.6)' }}>
                  <SkeletonBlock width={w} height={14} style={skeletonOnFill} />
                </div>
              ))}
              {expectAction && (onAddAction || onAddActionPickBook) && (
                <button type="button" disabled tabIndex={-1} style={{ ...rowBtn, ...rowBtnOffOnFill, marginTop: 'var(--space-3)' }}>
                  <Target size={16} aria-hidden="true" />行動に追加
                </button>
              )}
            </div>
          )}
          {/* 「根拠を見る」は書いている間も同じ場所に見せ、書き終わるまで押せない（--text-3・aria-disabled・SPEC §3）。
              見えない場所取りにすると、書き終わった瞬間に行が現れて目が跳ねていた。 */}
          {tail !== 'conclusion' && (
            <button type="button" aria-disabled="true" tabIndex={-1} style={evidencePending}>
              <span>根拠を見る</span>
              <ChevronDown size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
            </button>
          )}
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
        // 途中まで書けていた答え（通信が中断）は、書けたところを残して「もう一度」を添える。
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
          {/* 本を探す問い: 見つかったメモの行を結論のすぐ下に開いて並べる（「根拠を見る」の代わり）。 */}
          {lookupRows.length > 0 && (
            <div style={{ marginTop: 'var(--space-3)' }} role="list" aria-label="見つかったメモ">
              {lookupRows.map((r) => (
                <div role="listitem" key={r.key}>
                  <LibrarySearchHit inline showStatus={false} result={{ book: r.book, hit: r.hit }} onOpen={(b, id) => { if (b?.id && onOpenBook) onOpenBook(b, id); }} />
                </div>
              ))}
            </div>
          )}
          {/* 2. 明日からできる一歩（＋ 行動に追加）か、あなたに聞きたいこと → 使ったメモの一行 → 3. 根拠（畳む） */}
          {renderAction(parsed, 'var(--space-4)')}
          {renderAsk(parsed, 'var(--space-4)')}
          {renderEvidence()}
          {lookupRows.length === 0 && renderDetails(parsed)}
          {renderNote(parsed)}
        </>
      ) : (
        <div style={readText}><PlainAnswer text={message.content} /></div>
      )}
      {renderRefund()}
      {/* 語り口の一行はカードのいちばん最後（本ごとにと同じ順） */}
      {parsed && renderVoiceLine()}
      {/* 旧形式（見出しなし）でも行動化できるように */}
      {!parsed && canShowAction && !message.error && (
        actionAdded ? (
          <ActionAddedNote onOpenActions={onOpenActions} deadline={addedDeadline} focus={addedFocus} />
        ) : priorAdded ? (
          <ActionAddedNote already onOpenActions={onOpenActions} focus={priorAdded.focus} />
        ) : (
          // 答えのカード（--surface）の上なので、押せない間は副ボタンの押せない形（--separator の枠＋--text-3）。
          <button type="button" onClick={handleAddAction} disabled={actionBusy} style={{ ...rowBtn, marginTop: 'var(--space-3)', ...(actionBusy ? { color: 'var(--text-3)', borderColor: 'var(--separator)', opacity: 1, cursor: 'default' } : null) }}>
            <Target size={16} aria-hidden="true" />行動に追加
          </button>
        )
      )}
      {time}
    </div>
    </PartnerRow>
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
        {/* 文字の横のアイコンは em で（文字サイズの設定に合わせて大きくなる・DESIGN §5） */}
        <ChevronDown size="1.2em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
      </span>
    </button>
  );
}

// 相談相手 ＋ 答え方（2026-09-27）。答え方は相談相手が 1 冊のときは出さない（mode=null・並べる本が無い）。
// 1 行に収めるため、「すべてに戻す」は答え方のチップが無いとき（1 冊に絞ったとき）だけ。
// 数冊に絞ったときは相談相手のシートの「すべての本」から戻す。
function ScopeBar({ label, scoped, onOpen, onReset, disabled, mode = null, onOpenMode, noBorder = false }) {
  const showMode = mode != null && !!onOpenMode;
  return (
    // 「すべてに戻す」を出すときは折り返さず、長い書名のチップの方を縮めて（… で省略）1 行に収める。
    <div style={{ display: 'flex', flexWrap: scoped && !showMode ? 'nowrap' : 'wrap', alignItems: 'center', columnGap: 'var(--space-2)', rowGap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4) 0', flexShrink: 0, minWidth: 0, borderTop: noBorder ? 'none' : '1px solid var(--separator)' }}>
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

// 本ごとのメモ件数を、同じアプリの起動中は覚えておく（2 回目からは開いた瞬間に一覧を出す＝
// 骨組みの短いシートが出てから高さが伸びる、をなくす・数え直しは裏で・2026-09-29）。
const scopeCountsMemory = { uid: null, counts: null };
function ScopeSheet({ books = [], userId, initial = [], onClose, onApply }) {
  const [mode, setMode] = useState(initial.length ? 'pick' : 'all');
  const [picked, setPicked] = useState(new Set(initial));
  const [counts, setCounts] = useState(() => (scopeCountsMemory.uid === userId ? scopeCountsMemory.counts : null)); // Map<bookId, メモ件数>

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
      if (data) { scopeCountsMemory.uid = userId; scopeCountsMemory.counts = m; }
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
      {/* 件数を数え終わるまでは行の形だけ（あとで並び替わって跳ねないように）。行の数は、読書中・読了の本の数
          （＝出てくる行のおよその数・最大 6）にして、シートの高さが数え終わってから伸びないようにする（2026-09-29）。
          形の高さは本の行と同じ 72（表紙・書名・メモの件数の 2 行・2026-09-30）。 */}
      {countsLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {Array.from({ length: Math.min(6, Math.max(3, list.length)) }, (_, i) => <SkeletonBlock key={i} height={72} radius="var(--radius)" />)}
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
