// 🔍 AI 選書アドバイザー（「相談して選ぶ」）。課題ヒアリング（ウィザード）→
// Claude による推薦 → セットアップシート引き継ぎ + 会話履歴。App.jsx から
// 切り出した自己完結コンポーネント。props: onAddBook / sessionApi / books。

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp as IcSend,
  Check as IcCheck,
  ChevronLeft as IcBack,
  ExternalLink as IcExternal,
  History as IcHistory,
  MessageSquarePlus as IcNewChat,
  PencilLine as IcPencil,
  Plus as IcPlus,
  RotateCw as IcRetry,
  Square as IcBox,
  SquareCheck as IcBoxChecked,
  TriangleAlert as IcAlert,
} from 'lucide-react';
import { callClaude, sanitizeForPrompt, gatherAdvisorContext, prewarmAdvisorContext, isAiNoticeString } from '../lib/ai';
import { streamClaude } from '../lib/streamClaude';
import { ensureAiConsent } from '../lib/aiConsent';
import { PROMPTS } from '../lib/prompts';
import { MODEL_FAST, MODEL_ADVISOR } from '../lib/models';
import { LIMITS, clamp } from '../lib/limits';
import { toMessage } from '../lib/errors';
import { track } from '../lib/analytics';
import { isStrictMatch, isExactMatch } from '../lib/bookMatch';
import { verifyBookExists, checkImageExists } from '../lib/bookCover';
import { searchBooksFlat as searchBooksAPIFlat } from '../lib/bookSearch';
import { STORE_DISCLOSURE_TEXT, getRakutenLink, RAKUTEN_LINK_REL } from '../lib/rakutenLink';
import { getAmazonLink, handleAmazonClick, AMAZON_LINK_REL } from '../lib/amazonLink';
import { nextResetLabelJa } from '../lib/freeTrial';
import { TOKEN_COSTS, runCostLine } from '../lib/tokens';
import { groupTitle, btnPrimary as uiBtnPrimary, btnPrimaryOff as uiBtnPrimaryOff, btnGhost as uiBtnGhost, btnGhostOff as uiBtnGhostOff, btnText as uiBtnText, btnLink as uiBtnLink, input as uiInput, card as uiCard } from '../styles/ui';
import { useAuth } from '../hooks/useAuth';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import MarkdownSections from './MarkdownSections';
import Spinner from './Spinner';
import ErrorMessage from './ErrorMessage';
import TightBubble, { withPhraseBreaks } from './TightBubble';
import { displayUserText, concernOf, interviewPairsOf, advisorSetupFields } from '../lib/advisorText';
import { usePaywall } from '../state/PaywallContext';
import { findDuplicateBook } from '../lib/checkDuplicate';
import { filterProseTitles, proseTitleLists } from '../lib/advisorProse';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';

const AdvisorHistoryList = lazy(() => import('./AdvisorHistory').then((m) => ({ default: m.AdvisorHistoryList })));
const AdvisorSessionDetail = lazy(() => import('./AdvisorHistory').then((m) => ({ default: m.AdvisorSessionDetail })));
const AdvisorAddConfirmModal = lazy(() => import('./AdvisorAddConfirmModal'));

// ── AI 選書の部品（DESIGN.md のトークンのみ。見た目は 相談＝MyBookBrain に揃える） ──
// カード: --surface ＋ 枠 --separator ＋ 角丸 12 ＋ 内側 16。影なし。
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const advisorWizardCard = { ...cardStyle, animation: 'fadeIn .25s' };
const headingStyle = { fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 };
// 相談（MyBookBrain）の上の行と同じ寸法（高さ 52・左 16）。右端のアイコンは押せる範囲 44 のまま
// 右の余白を 4 にして、見た目の右端を相談と同じ位置（16）にそろえる（DESIGN §5「画面上部の 1 行」）。
const topRow = { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 52, padding: '0 var(--space-1) 0 var(--space-4)' };
const iconBtn = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 999, color: 'var(--text-2)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0 };
// 読む文章（AI の答え・推薦理由）＝明朝 18・行間 1.6。
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)' };
// カード内の小見出しラベル（DESIGN §5 groupTitle: 12/600/--text-2）と本文。
const fieldLabel = { ...groupTitle, margin: 0 };
const fieldText = { fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6, margin: 'var(--space-1) 0 0' };
// 行の中の副ボタン（DESIGN §5 btnRow: 44・15・600）。
const rowBtn = { ...uiBtnGhost, width: 'auto', minHeight: 44, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sub)', flexShrink: 0 };
// 答えの選択肢＝チップ（--fill 面・枠なし・角丸 12。選択中は --accent-soft ＋ --accent 600）。
const advisorOptionChip = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  width: '100%',
  minHeight: 44,
  padding: 'var(--space-3)',
  textAlign: 'left',
  background: 'var(--fill)',
  border: 'none',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontFamily: 'inherit',
  lineHeight: 1.5,
  cursor: 'pointer',
  touchAction: 'manipulation',
};
// 「読みたいに追加」後の表示（押せない状態はボタンではなく文字で示す。相談の「行動に追加しました」と同じ）。
// ユーザーの相談＝右寄せの --fill 吹き出し（相談と同じ）。
// 相談の吹き出しと同じ: 文字に沿って縮む（TightBubble・最大 85%）・文節の切れ目でだけ折り返す（BudouX の <wbr>＋keep-all・2026-09-29）。
const userBubble = { maxWidth: '85%', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'pretty' };
const advisorOptionChipSelected = { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 };
// 推薦カードの購入リンク＝文字ボタン（btnLink: --accent・15/600・高さ 44・枠なし）。
// 主役は「読みたいに追加」なので、ストアは控えめな文字リンクにする（外部リンクは ↗ と aria-label で伝える）。
const storeLink = { ...uiBtnLink, gap: 'var(--space-1)', textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box' };

function AdvisorStoreLinks({ book }) {
  const title = book?.title || '';
  const amazon = getAmazonLink(book);
  const rakuten = getRakutenLink(book);
  return (
    // 文字の左端をカードの本文にそろえる（btnLink の左右 4 を打ち消す）。
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginLeft: 'calc(-1 * var(--space-1))' }}>
      <a
        href={amazon} target="_blank" rel={AMAZON_LINK_REL}
        onClick={(e) => { e.stopPropagation(); handleAmazonClick(e, amazon); }}
        aria-label={`Amazon で『${title}』を見る（外部リンク）`}
        style={storeLink}
      >
        Amazon<IcExternal size={16} aria-hidden="true" />
      </a>
      <a
        href={rakuten} target="_blank" rel={RAKUTEN_LINK_REL}
        onClick={(e) => e.stopPropagation()}
        aria-label={`楽天ブックス で『${title}』を見る（外部リンク）`}
        style={storeLink}
      >
        楽天ブックス<IcExternal size={16} aria-hidden="true" />
      </a>
    </div>
  );
}

// 推薦の後ろの文から「## 💬 まとめ」（励ましの一言だけの区画）を取り除く。
// 読む順番など他の区画は残す。古い応答・履歴の再開にも効くよう表示側で落とす。
function dropSummarySection(md) {
  if (!md || typeof md !== 'string') return md || '';
  const out = [];
  let dropping = false;
  for (const raw of md.split('\n')) {
    if (/^#{1,6}\s/.test(raw.trim())) dropping = /まとめ/.test(raw);
    if (!dropping) out.push(raw);
  }
  return out.join('\n').trim();
}

// 推薦の前置き（「## 👋 はじめに」＋共感の数行）から、見出し行を落として 1 段落の文にする。
function introTextOf(md) {
  if (!md || typeof md !== 'string') return '';
  return md
    .split('\n')
    .filter((l) => !/^#{1,6}\s/.test(l.trim()))
    .map((l) => l.trim().replace(/^[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'))
    .filter(Boolean)
    .join('');
}
// 前置き＝本のカードより控えめな 1 段落（15/--text-2）。
const introText = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 };

// 案内文の「10月1日」を途中で改行させない（サーバーの文に結合文字が無い場合の保険）。
function keepDateTogether(text) {
  const re = /(\d{1,2}\u2060?月\u2060?\d{1,2}\u2060?日)/;
  return String(text || '').split(re).map((p, i) => (i % 2 === 1 ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{p}</span> : p));
}

const ADVISOR_EXAMPLES = [
  '営業成績を上げたい',
  'チームマネジメント',
  '自信を持ちたい',
  '時間管理',
  'お金の不安',
];

// ヒアリングの最大ラウンド数。AI は途中で done を返せるが、上限で必ず締める。
const MAX_INTERVIEW_ROUNDS = 3;

// 🧭 画面を離れても、おすすめ・会話を覚えておく（アプリの起動中だけ・ログイン中の人ごと）。
//   追加した本の詳細を開いて「‹ AI 選書」で戻ったとき、さっきのおすすめのまま戻れるように
//   （相談の `session` と同じ考え方・2026-09-29）。読み込み中の状態は覚えない。
const advisorMemory = { uid: null, state: null };
// AI に聞いている途中（ヒアリングの質問づくり・本を選ぶ推薦）の控え。画面を離れても止めずに最後まで作り、
// 結果は advisorMemory に書く（原価はもう払っているので捨てない・相談の backgroundAsk と同じ考え・2026-10-04）。
// { kind: 'interview' | 'reco', uid, done, promise }。戻ってきた画面は、終わるまで同じ待ちの形を出し、終わったら結果を出す。
let advisorPendingJob = null;


// barSlot: App のサブタブ（相談｜AI 選書）の行の右端の要素。履歴・新規のアイコンはそこへ出す（🕒 だけの行を作らない・2026-10-01 ui-critic）。
export default function BookAdvisor({ onAddBook, sessionApi, books, onSearchBook, onManualBook, onOpenBook, barSlot = null }) {
  // 🎁 AI 選書はプランの機能（フリーミアム・2026-09-27）。無料プランの人が送ったら、有料プランの画面を
  //    重ねて開く（入力は残す・画面はそのまま見せる）。サーバーも 402 plan_required で止める。
  const { requirePlan, canBuyTokens, openTokenSheet, plan, freeMode, tokensRemaining, purchasedTokens } = usePaywall();
  // 送るボタンのそばに 1 回の目安と残り（相談と同じ言い方・無料プランはプランの機能なので出さない・2026-09-29）。
  const costLine = freeMode ? '' : runCostLine({ plan, remaining: tokensRemaining, purchased: purchasedTokens, cost: TOKEN_COSTS.advisor });
  // 生成中にアンマウントされたら進行中のストリームを中断する（コスト・二重セッション対策）。
  const activeControllerRef = useRef(null);
  const unmountedRef = useRef(false);
  // 実在検証の世代トークン（再生成で旧検証の結果適用を無効化する）。
  const verifyGenRef = useRef(0);
  // 直前の推薦の依頼（{ userMsg, sourceQuery }）。エラーの「もう一度試す」用。
  const lastRecoArgsRef = useRef(null);
  useEffect(() => {
    // StrictMode（dev）の疑似 unmount → 再マウントでフラグが立ちっぱなしに
    // ならないよう、マウント時に必ずリセットする。
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      // 本を選んでいる途中（推薦）は止めない＝離れても最後まで作って advisorMemory に残す（2026-10-04）。
      //   以前はここで止めていたため、ほかのタブへ移って戻るとヒアリングの答えも推薦も消え、トークンだけ減っていた。
      if (!(advisorPendingJob && !advisorPendingJob.done)) {
        try { activeControllerRef.current?.abort(); } catch { /* noop */ }
      }
    };
  }, []);

  // 旧: 挨拶 seed メッセージで例を箇条書き → サブタブ画面では冗長
  // (タップ不可で文字を読まされるだけ)。例はチップ UI に分離した。
  // 「📚 読みたいに追加」のタップ受付を触覚で即時 ack するため。
  const { user: advisorUser } = useAuth();
  // ⚡ 読書傾向コンテキストをタブ表示時に先読み — 推薦開始時にはキャッシュ済みで、
  // 「選んでいます…」までの初動が速くなる（ai.js 側で TTL キャッシュ）。
  useEffect(() => { prewarmAdvisorContext(advisorUser?.id); }, [advisorUser?.id]);
  const advisorHaptic = useHaptic();
  const advisorToast = useToast();
  const advisorConfirm = useConfirm();
  // 前回この画面を離れたときの状態（同じ人のときだけ）。
  const memo0 = useRef(advisorMemory.uid && advisorMemory.uid === (advisorUser?.id || null) ? advisorMemory.state : null).current || {};
  const [messages, setMessages] = useState(() => memo0.messages || []);
  const [input, setInput] = useState(() => memo0.input || "");
  const [recommendations, setRecommendations] = useState(() => memo0.recommendations || null);
  const [chatHistory, setChatHistory] = useState(() => memo0.chatHistory || []);
  // 直近の「ユーザーの課題」入力 — 本棚に追加した時に source_query として
  // 持ち回り、読書計画シートの投資目的にプレフィルする。
  const [lastUserQuery, setLastUserQuery] = useState(() => memo0.lastUserQuery || '');
  // 「📚 読みたいに追加」を押した本のタイトル set。
  // 連打防止 + UI 即時反映 (ボタンを「✅ 追加済み」表示に切替) の両方を担う。
  // 旧実装は addingTitle を「処理中の本」のロックに使い、AI 要約と DB
  // insert を await してから state を戻していたため、ボタンの反応に
  // 5〜15 秒かかっていた。新実装はクリック時 UI を即更新、すべての I/O は
  // .then() で fire-and-forget。失敗時のみ rollback。
  const [addedTitles, setAddedTitles] = useState(() => new Set(memo0.addedTitles || []));
  // 「読みたいに追加」を押して、同じ本かを確かめている間の本（まだ追加していない＝「追加済み」にしない）。
  const [checkingTitles, setCheckingTitles] = useState(() => new Set());
  // 「読みたいに追加」押下後に search の strict match 結果を確認させる
  // モーダル。{ rec, candidates } | null。確認後に proceedAdd(verifiedRec)
  // を呼んで実際の DB insert に進む。
  const [confirmAdd, setConfirmAdd] = useState(null);
  // 履歴サブビュー: 'chat' | 'history' | 'detail'
  const [view, setView] = useState('chat');
  const [selectedSession, setSelectedSession] = useState(null);
  // 履歴・履歴の中身では、左端から右へ払うと 1 段戻る（左上の ‹ と同じ・2026-09-29）。
  useEdgeSwipeBack({
    enabled: view === 'history' || view === 'detail',
    onBack: () => {
      if (view === 'detail') { setSelectedSession(null); setView('history'); }
      else setView('chat');
    },
  });
  // 現在進行中のセッション ID。null なら次回送信時に createSession で新規作成。
  const [currentSessionId, setCurrentSessionId] = useState(() => memo0.currentSessionId || null);
  // 検証が終わった時点の会話 ID（非同期の後で読むので ref でも持つ）。
  const sessionIdRef = useRef(currentSessionId);
  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  // ── ガイド付きヒアリング（チップ選択ウィザード）の状態 ───────────────────
  // 旧来の「4 問を一括テキストで投げて自由記述で受ける」摩擦を解消するため、
  // 初回の相談内容から AI が質問セットを設計 → 1 問ずつ選択肢タップで答える。
  const [concern, setConcern] = useState(() => memo0.concern || '');            // 初回の相談（課題）
  const [interview, setInterview] = useState(() => memo0.interview || null);      // [{q, options[]}] | null
  const [interviewStep, setInterviewStep] = useState(() => memo0.interviewStep || 0); // 現在の質問 index
  const [interviewRound, setInterviewRound] = useState(() => memo0.interviewRound || 1); // 現在のヒアリング周回（1..MAX）
  const [interviewAnswers, setInterviewAnswers] = useState(() => memo0.interviewAnswers || []); // [{q, a}] 全周通算
  const [interviewLoading, setInterviewLoading] = useState(false); // 質問生成中
  const [otherMode, setOtherMode] = useState(() => !!memo0.otherMode);     // 「その他」自由入力モード
  const [otherText, setOtherText] = useState(() => memo0.otherText || '');
  const [multiSelected, setMultiSelected] = useState(() => memo0.multiSelected || []); // 複数選択質問の選択中の答え
  const [recoLoading, setRecoLoading] = useState(false); // 推薦生成中
  const [recoStream, setRecoStream] = useState(''); // 推薦生成中のライブ前置き文（体感速度）
  const [recoError, setRecoError] = useState(() => memo0.recoError || null);
  // 月の上限・プラン案内は「失敗」ではないので、再試行ボタンのない案内として出す（相談と同じ）。
  const [recoNotice, setRecoNotice] = useState(() => !!memo0.recoNotice);
  // 画面を離れても戻れるように、いまの状態を覚えておく（上の advisorMemory）。
  useEffect(() => {
    advisorMemory.uid = advisorUser?.id || null;
    advisorMemory.state = {
      messages, input, recommendations, chatHistory, lastUserQuery, addedTitles: [...addedTitles],
      currentSessionId, concern, interview, interviewStep, interviewRound, interviewAnswers,
      otherMode, otherText, multiSelected, recoError, recoNotice,
    };
  }, [advisorUser?.id, messages, input, recommendations, chatHistory, lastUserQuery, addedTitles, currentSessionId, concern, interview, interviewStep, interviewRound, interviewAnswers, otherMode, otherText, multiSelected, recoError, recoNotice]);
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
    // 空のときは 1 行（44）。相談の入力欄と同じ高さから伸びる。
    el.style.height = Math.min(Math.max(el.scrollHeight + 2, 44), 200) + 'px';
  }, [input]);

  // Parse the new richer response: leading prose + JSON recs + trailing prose.
  // 表示用: RECOMMENDATIONS ブロック（マーカー + JSON）を本文から取り除く。
  // END マーカー欠落（max_tokens 打ち切り等）でも途中までの JSON を残さない。
  // ※ chatHistory / advisor_sessions への永続化は生テキストのまま（AI 文脈維持）。
  const stripRecoBlock = (text) =>
    (typeof text === 'string' ? text : '')
      .replace(/RECOMMENDATIONS_START[\s\S]*?(?:RECOMMENDATIONS_END|$)/g, '')
      // 推薦ブロックを剥がした結果「## 📚 おすすめの本」が中身ゼロで残る
      // （直後が次の見出し or 末尾）場合は、その空見出しごと除去する
      // （カードが出せなかった回に空の見出しだけが浮く表示崩れを防ぐ）。
      .replace(/\n*#{1,4}\s*📚?\s*おすすめの本[^\n]*\s*(?=#{1,4}\s|$)/gu, '\n')
      .trim();

  // 本文（prose）から、モデルが「下書き→最終版」と推敲したときに残る
  //   ①RECOMMENDATIONS マーカー・ブロック
  //   ②マーカー無しで裸に出てくる推薦候補の生 JSON（{ "title": ... } の羅列）
  //   ③「最終版」「再提示」「差し替え」等の推敲メタ・見出し
  // を除去して、ユーザーに見せられる説明文だけを残す。カードは別途 recs で描く。
  const cleanProse = (text) => {
    let s = stripRecoBlock(text);
    // 生 JSON の残骸を行単位で除去（括弧/カンマだけの行・"key": ... の行・マーカー行）。
    s = s
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '') return true;
        if (/^[[\]{},]+$/.test(t)) return false;          // [ ] { } , だけの行
        if (/^"[^"]+"\s*:/.test(t)) return false;          // "title": "..." の行
        if (/^RECOMMENDATIONS_(START|END)\b/.test(t)) return false;
        return true;
      })
      .join('\n');
    // 推敲・訂正・謝罪のメタ発言と「おすすめの本（最終版）」等の見出しを行ごと除去。
    s = s
      .replace(/^.*(最終版|再提示|差し替え|文脈に合わないため|確証が持てなかった|確度の高い書籍で).*$/gm, '')
      .replace(/^#{1,4}\s*📚?\s*おすすめの本[^\n]*$/gmu, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return s;
  };

  // 推薦 JSON を寛容にパースする。LLM は例の「// 3〜5 冊」コメントを真似たり、
  // 末尾カンマを付けたり、前後にノイズを混ぜたりして strict JSON.parse を落とす。
  // ①素の parse → ②行コメント/末尾カンマ除去 → ③最初の[〜最後の]抽出、の順で試す。
  const tolerantRecArray = (raw) => {
    if (typeof raw !== 'string') return null;
    const clean = (s) => s
      .replace(/^\s*\/\/[^\n]*$/gm, '')   // 行頭コメント（例の "// 3〜5 冊" 等）
      .replace(/,(\s*[\]}])/g, '$1');     // 末尾カンマ
    const tries = [raw, clean(raw)];
    const s = raw.indexOf('[');
    const e = raw.lastIndexOf(']');
    if (s >= 0 && e > s) tries.push(clean(raw.slice(s, e + 1)));
    for (const t of tries) {
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr)) return arr;
      } catch { /* 次の候補へ */ }
    }
    // 最終フォールバック: 配列としては壊れていても（max_tokens 打ち切りで閉じ ']'
    // が無い等）、完成している先頭のオブジェクト群だけを波括弧バランスで救い出す。
    // 5 冊中 4 冊まで生成済みなのに全滅する事故を防ぐ。
    const out = [];
    let depth = 0; let start = -1; let inStr = false; let esc = false;
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') { if (depth === 0) start = i; depth += 1; }
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          try {
            const o = JSON.parse(clean(raw.slice(start, i + 1)));
            if (o && typeof o === 'object') out.push(o);
          } catch { /* この 1 冊は諦めて次へ */ }
          start = -1;
        }
      }
    }
    return out.length ? out : null;
  };

  const parseAdvisorResponse = (text) => {
    if (typeof text !== 'string') return { recs: null, prose: '' };
    const START = 'RECOMMENDATIONS_START';
    const END = 'RECOMMENDATIONS_END';
    if (text.indexOf(START) < 0) return { recs: null, prose: cleanProse(text) };

    // モデルは「下書き → やっぱり最終版」と RECOMMENDATIONS ブロックを複数回
    // 吐くことがある（本来は 1 回・プロンプトで禁止済みだが保険）。全ブロックを
    // 走査し、valid な非空配列が取れた「最後の」ブロックを最終版として採用する。
    let recs = null;
    let firstStart = -1;
    let lastEnd = -1;
    let from = 0;
    // 無限ループ保険（最大 8 ブロックまで）。
    for (let guard = 0; guard < 8; guard += 1) {
      const s = text.indexOf(START, from);
      if (s < 0) break;
      if (firstStart < 0) firstStart = s;
      const afterStart = text.slice(s + START.length);
      const endRel = afterStart.indexOf(END);
      let jsonRaw;
      let blockEndAbs;
      if (endRel >= 0) {
        jsonRaw = afterStart.slice(0, endRel);
        blockEndAbs = s + START.length + endRel + END.length;
      } else {
        // END 欠落（max_tokens 打ち切り 等）→ 次のブロック開始 or 次の見出しまでを
        // JSON 候補にする（どちらも無ければ以降すべて）。
        const nextStartRel = afterStart.indexOf(START);
        const nextHeadingRel = afterStart.search(/\n#{1,4}\s/);
        const cuts = [nextStartRel, nextHeadingRel].filter((x) => x >= 0);
        const cut = cuts.length ? Math.min(...cuts) : -1;
        jsonRaw = cut >= 0 ? afterStart.slice(0, cut) : afterStart;
        blockEndAbs = cut >= 0 ? s + START.length + cut : text.length;
      }
      const arr = tolerantRecArray(jsonRaw);
      const parsed = Array.isArray(arr) ? arr.filter((r) => r && typeof r.title === 'string') : null;
      if (parsed && parsed.length > 0) recs = parsed; // 最後の valid を保持
      lastEnd = blockEndAbs;
      from = blockEndAbs > s ? blockEndAbs : s + START.length; // 必ず前進
    }

    // どのブロックも valid でなければ、マーカー・生 JSON・推敲メタを消して本文だけ返す。
    if (!recs) return { recs: null, prose: cleanProse(text) };
    // prose は「最初のブロックより前」＋「最後のブロックより後」を、それぞれ
    // cleanProse で洗って結合（間の下書き群はまるごと捨てる）。
    const before = cleanProse(text.slice(0, firstStart));
    const after = cleanProse(text.slice(lastEnd));
    return { recs, prose: { before, after } };
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
    // c / x.a は呼び出し元（startInterview / answerQuestion）で既に
    // sanitizeForPrompt+clamp 済みだが、AI プロンプトへ渡す直前でも二重に
    // 適用しておく（呼び出し元の前提が将来崩れても壊れない防御的境界）。
    const safeConcern = clamp(sanitizeForPrompt(c || ''), LIMITS.aiQuestion);
    const priorQA = (priorAnswers || [])
      .map((x) => `Q. ${clamp(sanitizeForPrompt(x.q || ''), LIMITS.aiQuestion)}\nA. ${clamp(sanitizeForPrompt(x.a || ''), 120)}`)
      .join('\n');
    let text = '';
    try {
      text = await callClaude(
        PROMPTS.advisorInterview.system,
        PROMPTS.advisorInterview.user({ concern: safeConcern, priorQA, round, maxRounds: MAX_INTERVIEW_ROUNDS }),
        // ヒアリング質問は「定型 JSON（質問文＋選択肢）」の生成で、Haiku 4.5 で十分な
        // 品質が出る領域（事実想起や横断推論を伴わない）。コスト削減のため FAST に。
        // ※ 最終的な「本の推薦」は捏造リスク＆横断推論があるため別関数で SMART 維持。
        // purpose: サーバーが用途ごとに安いモデルへ送る（docs/ai-routing.md・失敗したら Claude）。
        { max_tokens: 700, cacheSystem: true, model: MODEL_FAST, purpose: 'advisor_interview' },
      );
    } catch {
      return null;
    }
    // トークンの上限・プランの案内なら、推薦にも進まず案内だけ出す（もう一度 AI を呼んでも同じ結果なので呼ばない）。
    if (isAiNoticeString(text)) return { stop: text };
    const parsed = parseInterview(text);
    if (!parsed) return null;
    // done でも質問が来ていても、最終ラウンドなら締める。
    if (parsed.done || round > MAX_INTERVIEW_ROUNDS) return [];
    return parsed.questions;
  };

  // トークンの上限・プランの案内: 失敗ではないので、再試行ボタンのない案内として出す（相談と同じ）。
  const showLimitNotice = (message) => {
    setRecoNotice(true);
    setRecoError(message);
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

  // 🔎 推薦の実在検証＋表紙先読み（並列・非ブロッキング）。
  //   - 目的1（ハルシネーション対策）: 楽天総合検索/NDL/Google で書名（と著者）が
  //     はっきり一致する本が見つかったかを 1 冊ずつ確かめ、_verify に残す:
  //       'ok'      実在を確かめた（exists===true）
  //       'unknown' 確かめられなかった（exists===null＝通信失敗・時間切れ・検索元が使えない）
  //       'suspect' 実在しない疑い（exists===false＝検索元は答えたが一致する本が無い）
  //     実在が確認できた本が 3 冊以上あれば疑わしい本は表示から落とし、予備（6〜7冊目）で埋める。
  //     3 冊未満なら落とさず警告バッジ付きで残す（実在本を誤って落とさないための安全策）。
  //   - 本文（前置き・読む順番・補足）の書名は、ここで 'ok' になったカードの本と本棚の本だけを
  //     許可する（lib/advisorProse.js の filterProseTitles・描画のときに毎回かける・2026-09-30）。
  //     検証が終わるまで（checked=false）は読む順番を出さない（架空の書名を一瞬でも見せない）。
  //   - 目的2（体感速度＝質）: 実在本の表紙をここで先読みしてカードに載せる。
  //     追加時に別途解決していた表紙が、カード表示中に埋まる。
  //   実装ノート（レビューボード監査で是正済みの2点）:
  //   - 世代ガード: 検証中に「別の条件で探す」→再生成されると、古い検証結果が
  //     後から resolve して新しい推薦カードを上書きするレースがあった。呼び出し時の
  //     世代トークンを持ち、apply 時に最新世代でなければ静かに破棄する。
  //   - 逐次実行: 旧実装は Promise.all で最大7並列 → /api/cover 経由で楽天
  //     （約1req/秒制限）へ同時多発し大半が 429、検証品質がむしろ落ちていた。
  //     1冊ずつ逐次＋250ms スタガに変更（非ブロッキングなので体感への影響なし。
  //     coverAutoRetry の 1req/秒ペーシングと同じ流儀）。
  //   返り値: 表示に使うカード（_verify つき）。古い世代・離脱済みなら null。
  const verifyAndEnrich = async (pool, gen) => {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const stale = () => unmountedRef.current || verifyGenRef.current !== gen;
    const results = [];
    for (const rec of pool) {
      if (stale()) return null; // 再生成/離脱済み — 外部APIをこれ以上叩かない
      let v = { exists: null };
      try {
        // eslint-disable-next-line no-await-in-loop
        v = await Promise.race([
          verifyBookExists({ title: rec.title, author: rec.author, isbn: rec.isbn }),
          new Promise((res) => { setTimeout(() => res({ exists: null }), 6000); }),
        ]);
      } catch { v = { exists: null }; }
      // 表紙: rec.cover → サーバー cover → candidates を <img> 実在検証で採用。
      let cover = (rec.cover || '').trim();
      // eslint-disable-next-line no-await-in-loop
      if (cover && !(await checkImageExists(cover))) cover = '';
      // eslint-disable-next-line no-await-in-loop
      if (!cover && v.cover && await checkImageExists(v.cover)) cover = v.cover;
      if (!cover && Array.isArray(v.candidates)) {
        for (const u of v.candidates) {
          // eslint-disable-next-line no-await-in-loop
          if (await checkImageExists(u)) { cover = u; break; }
        }
      }
      const verify = v.exists === true ? 'ok' : v.exists === false ? 'suspect' : 'unknown';
      // 古い保存形式の _suspect は持ち越さない（_verify だけを見る）。
      const { _suspect: _oldSuspect, ...base } = rec;
      results.push({ ...base, cover, isbn: v.isbn || rec.isbn || '', _verify: verify });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 250); });
    }
    if (stale()) return null;
    // 並びは「実在を確かめた本」→「確かめられなかった本」→「実在しない疑いの本」（同じ組の中は AI の順のまま）。
    const verified = results.filter((r) => r._verify === 'ok');       // 実在を確かめた
    const unknown = results.filter((r) => r._verify === 'unknown');   // 確かめられなかった（罰しないが、確かめた扱いにもしない）
    const suspects = results.filter((r) => r._verify === 'suspect');  // 実在しない疑い
    // ハルシネーション（実在の著者＋架空の書名）は原則カードに出さない。
    // ただし疑い以外が 3 冊未満（検証 API が不調な日）は suspects を落とすとカードが
    // 1〜2 枚に痩せるため、⚠️警告バッジ付きで残して枚数を維持する（正直に「確認できていない」を見せる方を選ぶ）。
    const solid = [...verified, ...unknown];
    const items = (solid.length >= 3 ? solid : [...solid, ...suspects]).slice(0, 5);
    setRecommendations((prev) => (prev ? { ...prev, items, checked: true } : prev));
    return items;
  };

  // 検証が終わったカード（_verify つき）を、この会話の履歴にも残す（履歴の中身・再開でも本文の書名を絞れるように）。
  const persistVerified = (sessionId, items) => {
    if (!items || !sessionId || !sessionApi?.available) return;
    Promise.resolve(sessionApi.updateSession(sessionId, { recommended_books: items })).catch(() => { /* 永続化失敗は UX を壊さない */ });
  };

  // 検証を（やり直して）走らせ、終わったら履歴にも残す。画面に戻ったとき・会話の再開で使う。
  const startVerify = (pool, sessionId) => {
    verifyGenRef.current += 1;
    verifyAndEnrich(pool, verifyGenRef.current).then((items) => persistVerified(sessionId, items)).catch(() => {});
  };
  // 検証の途中で画面を離れて戻ってきたら、検証をやり直す（離れると検証は止まるので、読む順番が出ないままにしない）。
  useEffect(() => {
    const r = recommendations;
    if (r && r.checked === false && Array.isArray(r.pool) && r.pool.length > 0) startVerify(r.pool, sessionIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // AI に聞いている途中で離れて戻ってきた（2026-10-04）: 終わるまで同じ待ちの形（質問を考えています…／
  //   本を選んでいます…）を出し、終わったら覚えている状態（離れていた間に書かれた結果）をそのまま出す。
  //   ヒアリングから推薦へ続いたときは、続けて推薦を待つ。
  useEffect(() => {
    const waitJob = () => {
      const p = advisorPendingJob;
      if (!p || p.done || p.uid !== (advisorUser?.id || null)) return;
      if (p.kind === 'reco') setRecoLoading(true);
      else setInterviewLoading(true);
      p.promise.then(() => {
        if (unmountedRef.current) return;
        const st = advisorMemory.uid === p.uid ? (advisorMemory.state || {}) : {};
        if (st.interview !== undefined) setInterview(st.interview);
        if (st.interviewStep !== undefined) setInterviewStep(st.interviewStep);
        if (st.interviewRound !== undefined) setInterviewRound(st.interviewRound);
        if (st.interviewAnswers) setInterviewAnswers(st.interviewAnswers);
        if (st.recommendations !== undefined) setRecommendations(st.recommendations);
        if (st.chatHistory) setChatHistory(st.chatHistory);
        if (st.lastUserQuery !== undefined) setLastUserQuery(st.lastUserQuery);
        if (st.messages) setMessages(st.messages);
        setRecoError(st.recoError || null);
        setRecoNotice(!!st.recoNotice);
        if (st.currentSessionId) setCurrentSessionId(st.currentSessionId);
        setInterviewLoading(false);
        setRecoLoading(false);
        const r = st.recommendations;
        if (p.kind === 'reco' && r && r.checked === false && Array.isArray(r.pool) && r.pool.length > 0) startVerify(r.pool, st.currentSessionId || sessionIdRef.current);
        waitJob(); // ヒアリングのあと推薦へ続いていれば、それも待つ
      });
    };
    waitJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AI に聞く処理（ヒアリング・推薦）の始まりに呼ぶ。画面を離れたあとに終わった結果は remember で覚えている状態へ書き、
  // settle で戻ってきた画面へ知らせる（上の advisorPendingJob・2026-10-04）。
  const beginJob = (kind) => {
    let finish = () => {};
    const job = { kind, uid: advisorUser?.id || null, done: false, promise: new Promise((r) => { finish = r; }) };
    advisorPendingJob = job;
    const remember = (patch) => {
      if (!unmountedRef.current || advisorMemory.uid !== job.uid) return;
      advisorMemory.state = { ...(advisorMemory.state || {}), ...patch };
    };
    const settle = () => {
      job.done = true;
      if (advisorPendingJob === job) advisorPendingJob = null;
      finish();
    };
    return { remember, settle };
  };

  // 推薦生成 — ヒアリング完了後（または fallback の直接相談）に bookAdvisor を
  // 1 回ストリーム。userMsg は AI へ渡す本文、sourceQuery は本棚追加時の
  // source_query（投資目的プレフィル）に使う「ユーザーの元の課題」。
  const generateRecommendations = async (userMsg, sourceQuery) => {
    if (!userMsg || recoLoading) return;
    // 失敗したときの「もう一度試す」で同じ条件をそのまま送り直せるように控える。
    lastRecoArgsRef.current = { userMsg, sourceQuery };
    const historyBefore = chatHistory;
    // 離れても止めない（上の advisorPendingJob）。最初の await より前に控える（ヒアリングから続けて呼ばれたとき、
    // 戻ってきた画面が「ヒアリングが終わった」だけを見て待つのをやめないように）。
    const { remember, settle: settlePending } = beginJob('reco');
    setRecoError(null);
    setRecoStream('');
    setRecoLoading(true);
    // userMsg は複数の呼び出し元（proceedToRecommend /
    // startInterview の fallback）から来るテンプレート済み文字列。個々の
    // ユーザー入力片は呼び出し元で既に sanitize 済みだが、AI に渡す直前の
    // 単一の境界としてもう一段 sanitize+clamp する（改行は保持されるので
    // テンプレートの見出し構造は壊れない）。
    const safeMsg = clamp(sanitizeForPrompt(userMsg), LIMITS.memoText);
    const newHistory = [...chatHistory, { role: 'user', content: safeMsg }];
    setChatHistory(newHistory);

    // 🔑 差別化: ユーザーの既読/高評価本と高評価メモの要点を推薦の足場にする
    //   （既読の重複推薦を避け、「あなたが○○を高評価したので」とパーソナル化し、
    //    実在の既読本を土台にして捏造を減らす）。best-effort — 失敗しても推薦は続行。
    // gatherAdvisorContext は ai.js 側で TTL キャッシュ済み。ヒアリング開始時の
    // prewarmAdvisorContext で先読みされていれば、ここは即座に解決する（往復ゼロ）。
    let readerContext = '';
    try { readerContext = await gatherAdvisorContext(advisorUser?.id); } catch { /* graceful */ }

    // 🕐 無通信ウォッチドッグ: SSE がストール（モバイル回線切替等）しても
    // 「選んでいます…」で無期限に固まらないよう、チャンク間 45 秒無通信で中断する。
    // streamClaude は abort 時に部分テキストで正常 resolve するため、途中まで
    // 生成済みの推薦は下の salvage パースで拾える。
    const controller = new AbortController();
    activeControllerRef.current = controller;
    let watchdog = null;
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => { try { controller.abort(); } catch { /* noop */ } }, 45000);
    };

    let finalText = '';
    try {
      armWatchdog();
      // readerContext（ユーザーの読書傾向）を system に焼き込むと、ユーザーごとに
      // system が変わりプロンプトキャッシュが一切効かない。そこで readerContext は
      // 「先頭の（永続化しない）参考ターン」として messages に注入し、system は完全に
      // 静的（bookAdvisor.system）に保つ。これで大きな選書 system が常時キャッシュされ、
      // 入力コスト（−70〜90%）と TTFT が大きく下がる。読書傾向データの扱い方（既読の
      // 非再推薦・高評価を足場にしたパーソナル化）は system 側に恒常ルールとして内包済み。
      // 永続化するのは newHistory のみ（readerContext は毎回その場で注入し直す）。
      const sendMessages = readerContext
        ? [{ role: 'user', content: readerContext }, ...newHistory]
        : newHistory;
      finalText = await streamClaude({
        system: PROMPTS.bookAdvisor.system,
        cacheSystem: true,
        messages: sendMessages,
        // 前置き + 3〜4 冊の JSON + 読む順番 + まとめ（ふだん 1,500 トークン前後）。JSON が途中で
        // 切れて推薦カードが全滅しないよう余裕は残しつつ、原価の予約（最大の出力で見積もる）を
        // 小さくするため 4096 → 3000（2026-09-27）。
        max_tokens: 3000,
        // 推薦は実在の本を挙げるので Sonnet 5 に残す（models.js の MODEL_ADVISOR・2026-09-27）
        model: MODEL_ADVISOR,
        // 推薦は Claude だけ（サーバーの api/_aiRouting.js が Claude Sonnet 5.5 へ・ほかの会社には送らない）
        purpose: 'book_advisor',
        signal: controller.signal,
        // チャンク受信のたびに (1) 無通信ウォッチドッグを再武装し、(2) 生成中の
        // 前置き文（「👋 はじめに」の共感コメント）をライブ表示する。死んだスケルトン
        // ではなく動く文字を見せて体感速度を上げる。RECOMMENDATIONS ブロック以降は
        // 生 JSON なので表示しない。見出し行（## …）はプレビューでは落とす。
        onChunk: (full) => {
          armWatchdog();
          const head = String(full)
            .split('RECOMMENDATIONS_START')[0]
            .replace(/^#{1,6}\s.*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (head) setRecoStream(head);
        },
      });
    } catch (e) {
      const expected = !!(e?.monthlyLimit || e?.paywall || e?.consentDeclined);
      const errText = expected ? e.message : toMessage(e, '通信エラーが発生しました。もう一度お試しください。');
      setRecoNotice(expected);
      setRecoError(errText);
      setChatHistory(historyBefore); // 答えの無い相談を履歴に残さない（送り直しで二重にならないように）
      setRecoStream('');
      setRecoLoading(false);
      remember({ recoNotice: expected, recoError: errText, chatHistory: historyBefore });
      settlePending();
      return;
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }

    if (controller.signal.aborted && !finalText.trim()) {
      // ストール中断かつ 1 文字も生成されていない → エラーとして再試行を促す。
      setRecoNotice(false);
      setRecoError('通信が途切れました。電波の良い場所でもう一度お試しください。');
      setChatHistory(historyBefore);
      setRecoLoading(false);
      remember({ recoNotice: false, recoError: '通信が途切れました。電波の良い場所でもう一度お試しください。', chatHistory: historyBefore });
      settlePending();
      return;
    }

    // 計測は「応答を最後まで受け取れた」時のみ（ストール中断の部分応答は除外し、
    // 運営ダッシュボードの AI 利用集計を歪めない）。
    if (!controller.signal.aborted) track('ai_used', { feature: 'advisor' });

    const { recs, prose } = parseAdvisorResponse(finalText);
    let nextRecs = null;
    let verifyDone = null;
    if (recs) {
      // 提案された本は「全部」表示する。以前は findIsbnCandidates で実在確認できた
      // 本だけに絞っていたが、Google Books 429 / NDL 照合の厳格さで「実在する本でも
      // 確認できない」ことが多く、5 冊提案でも 1 冊しか出ない事故になっていた。
      // 「実在しない本を出さない」担保は bookAdvisor プロンプト側の厳格ルールに任せ、
      // ISBN は本棚追加時に解決する（Amazon リンクは title+author 検索で十分機能する）。
      // AI は最大 7 冊まで挙げてよい（実在検証で絞る余地＝予備を作るため）。
      // まず上位 5 冊を楽観的に即表示し（体感速度を落とさない）、裏で全 7 冊の
      // 実在検証＋表紙先読みを回す。ゴースト（実在しない本）は検証後に予備と
      // 差し替えられる。
      const verifyPool = recs.slice(0, 7);
      const finalList = verifyPool.slice(0, 5);
      const nextReco = {
        items: finalList,
        before: prose?.before || '',
        after: prose?.after || '',
        // 検証に使う候補（予備を含む）と、検証が終わったか（終わるまで読む順番を出さない）。
        pool: verifyPool,
        checked: false,
      };
      setRecommendations(nextReco);
      setLastUserQuery(concernOf(sourceQuery || safeMsg));
      remember({ recommendations: nextReco, lastUserQuery: concernOf(sourceQuery || safeMsg) });
      nextRecs = finalList;
      // 🔎 実在検証＋表紙先読み（並列・非ブロッキング）。表示は上で済ませているので
      //    体感は落ちない。検証結果で「実在しない本」を除外/警告し、実在本には
      //    表紙を後追いで載せる（カードの質と信頼が上がる）。
      verifyGenRef.current += 1;
      verifyDone = verifyAndEnrich(verifyPool, verifyGenRef.current);
    } else {
      // 推薦 JSON が取れなかった → 本文（マーカー/壊れた JSON は除去済み）を提示。
      // 空になった（=JSON だけで打ち切られた等）場合は案内文を出し、袋小路を防ぐ。
      const visible = typeof prose === 'string' && prose
        ? prose
        : '提案の生成が途中で途切れてしまいました。お手数ですが、もう一度質問を送ってください。';
      setMessages([{ role: 'assistant', text: visible }]);
      remember({ messages: [{ role: 'assistant', text: visible }] });
    }
    const nextHistory = [...newHistory, { role: 'assistant', content: finalText }];
    setChatHistory(nextHistory);
    remember({ chatHistory: nextHistory, recoError: null, recoNotice: false });
    // 推薦カードは既に確定。セッション永続化（ネットワーク往復）を待たずにローディングを
    // 解除して結果を即表示する（永続化は下でバックグラウンド実行。以前はここで待って
    // いたため「本は選び終わっているのにスケルトンのまま」の無駄待ちが数百 ms あった）。
    setRecoStream('');
    setRecoLoading(false);

    // 画面を離れたあとに終わったときも会話の記録を作り、その id を覚えている状態に書く
    // （戻ってきた画面が同じ記録を使う＝履歴に重複を作らない・2026-10-04）。
    if (sessionApi?.available) {
      let sid = currentSessionId;
      try {
        if (!currentSessionId) {
          const created = await sessionApi.createSession({
            messages: nextHistory,
            recommendedBooks: nextRecs || [],
          });
          if (created?.id) {
            sid = created.id;
            setCurrentSessionId(created.id);
            remember({ currentSessionId: created.id });
          }
        } else {
          const patch = { messages: nextHistory };
          if (nextRecs) patch.recommended_books = nextRecs;
          await sessionApi.updateSession(currentSessionId, patch);
        }
      } catch {
        // 永続化失敗は UX を壊さない
      }
      // 実在の検証が終わったら、確かめた結果つきのカードで履歴を上書きする。
      if (verifyDone) verifyDone.then((items) => persistVerified(sid, items)).catch(() => {});
    }
    // 戻ってきた画面へ結果を渡す（会話の記録の id まで書いてから＝戻った画面が別の記録を作らない）。
    settlePending();
  };

  // テーマのチップをタップ — AI の良書の棚（テーマ別の推薦）を生成する。
  // 初回の相談を受けて、第 1 ラウンドのヒアリング質問を設計させる。
  // 失敗（生成エラー / JSON 解釈不能）時はヒアリングを skip して直接推薦へ。
  const startInterview = async (rawConcern) => {
    if (interviewLoading || recoLoading) return;
    const c = clamp(sanitizeForPrompt(rawConcern || ''), LIMITS.aiQuestion);
    if (!c) return;
    if (!requirePlan('AI 選書')) return; // 無料プラン: 有料プランの画面を開く（入力は残す）
    // 🤝 はじめて AI に送るときの同意（lib/aiConsent.js）。やめたら送らない（入力は残す）。
    if (!(await ensureAiConsent('advisor_interview'))) return;
    // ヒアリング開始と同時に読書傾向コンテキストを裏で先読み（推薦時の待ちを隠す）。
    // マウント時の prewarm から時間が経ち TTL 切れの場合の再ウォーム。
    prewarmAdvisorContext(advisorUser?.id);
    setRecoError(null);
    setRecoNotice(false);
    setConcern(c);
    setInput('');
    setOtherMode(false);
    setOtherText('');
    setMultiSelected([]);
    setInterviewAnswers([]);
    setInterviewStep(0);
    setInterviewRound(1);
    setInterviewLoading(true);
    // 離れても止めない（ヒアリングの質問も覚えておく・2026-10-04）。
    const { remember, settle } = beginJob('interview');
    const qs = await runInterviewRound(c, [], 1);
    setInterviewLoading(false);
    if (qs?.stop) { showLimitNotice(qs.stop); remember({ recoNotice: true, recoError: qs.stop }); settle(); return; }
    if (qs === null || qs.length === 0) {
      // 質問を組めなかった / いきなり done → 相談内容だけで直接推薦（graceful）
      // 注: concern state はまだ反映前なので c を直接渡す。
      const lines = '';
      const compiled =
        `【相談内容】\n${c}\n\n【ヒアリングの回答】\n${lines || '（なし）'}\n\n` +
        `上記を踏まえて、その人に本当に刺さる実在の本を推薦してください。`;
      generateRecommendations(compiled, c); // 推薦の控えを先に作ってから、ヒアリングの控えを終える
      settle();
      return;
    }
    setInterview(qs);
    setInterviewStep(0);
    remember({ interview: qs, interviewStep: 0 });
    settle();
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
    // 離れても止めない（次の質問も覚えておく・2026-10-04）。
    const { remember, settle } = beginJob('interview');
    (async () => {
      const qs = await runInterviewRound(concern, nextAnswers, nextRound);
      setInterviewLoading(false);
      if (qs?.stop) { showLimitNotice(qs.stop); remember({ recoNotice: true, recoError: qs.stop }); settle(); return; }
      if (qs === null || qs.length === 0) {
        // done もしくは失敗 → 集めた回答で推薦へ（推薦の控えを先に作ってから、ヒアリングの控えを終える）
        proceedToRecommend(nextAnswers);
        settle();
        return;
      }
      // さらに深掘りラウンドへ
      setInterview(qs);
      setInterviewStep(0);
      setInterviewRound(nextRound);
      remember({ interview: qs, interviewStep: 0, interviewRound: nextRound });
      settle();
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
    // 走行中の実在検証（最長 ~45 秒の外部 API 連打）を stale 化して止める。
    verifyGenRef.current += 1;
    setMessages([]);
    setRecommendations(null);
    setRecoError(null);
    setRecoStream('');
    setInterview(null);
    setInterviewAnswers([]);
    setInterviewStep(0);
    setInterviewRound(1);
    setOtherMode(false);
    setOtherText('');
    setMultiSelected([]);
    // 最初の相談の言葉は入力欄に残す（条件を少し変えて探し直せる・書き直しにしない・2026-09-30）。
    setInput(concern || lastUserQuery || '');
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
    setChatHistory(histMessages); // AI 文脈は生テキストのまま保持
    setMessages(
      histMessages
        .map((m) => ({
          role: m.role,
          // 表示は RECOMMENDATIONS ブロック（マーカー + 生 JSON）を剥がす。
          text: m.role === 'assistant'
            ? stripRecoBlock((m.content ?? m.text ?? '').toString())
            : displayUserText((m.content ?? m.text ?? '').toString()),
        }))
        .filter((m) => m.text), // 剥がして空になった吹き出しは出さない
    );
    const recsList = Array.isArray(s.recommended_books) ? s.recommended_books : [];
    // 実在の検証の結果（_verify）を持たない古い会話は、開いたときに確かめ直す（本文の書名もそれで絞る）。
    const needsCheck = recsList.length > 0 && recsList.some((r) => !r?._verify);
    setRecommendations(recsList.length > 0 ? { items: recsList, before: '', after: '', pool: recsList, checked: !needsCheck } : null);
    if (needsCheck) startVerify(recsList, s.id);
    else verifyGenRef.current += 1; // 前の会話の検証が後から結果を上書きしないように
    // 直近の user 発話を lastUserQuery として復元 → 「読みたいに追加」時の課題（と得たいことの分け方）に使う
    //   （保存は AI 向けのテンプレートなので、本人の相談だけを取り出す。ヒアリングの答えも
    //    この会話のものに入れ替える＝前の会話の答えが「現在の課題」に混ざらないように）
    const lastUser = [...histMessages].reverse().find((m) => m.role === 'user');
    const lastRaw = (lastUser?.content || lastUser?.text || '').toString();
    setLastUserQuery(concernOf(lastRaw));
    setInterviewAnswers(interviewPairsOf(lastRaw));
    setCurrentSessionId(s.id);
    setSelectedSession(null);
    // 表示用: 直前の会話の相談（concern）の吹き出しを、再開した会話に持ち越さない。
    setConcern('');
    setView('chat');
  };

  // 本文の書名の許可リスト（実在を確かめたカードの本＋本棚の本だけ・lib/advisorProse.js・2026-09-30）。
  //   前置き・読む順番・補足・会話の再開で出す AI の文・生成中のライブの前置きのすべてにかける。
  const proseLists = proseTitleLists(recommendations?.items, books);
  // 検証が終わって、どの本も確かめられなかった（検索元が使えなかった）＝カードの下に 1 行の注意だけを出す
  //   （同じ「確認できませんでした」をカードごとに並べない）。
  const recoItems = Array.isArray(recommendations?.items) ? recommendations.items : [];
  const allUnverifiable = recommendations?.checked !== false && recoItems.length > 0 && recoItems.every((r) => r?._verify === 'unknown');
  const cleanProseTitles = (text) => filterProseTitles(text, proseLists);

  const isEmpty = messages.length === 0 && !recommendations;
  // ガイド付きヒアリングのいずれかが動いている = 相談入力フェーズではない。
  const inInterview = !!interview || interviewLoading || recoLoading;
  // 相談入力（textarea + 例チップ）は「推薦カードが出ていない間」は常に出す。
  // 旧条件（isEmpty のみ）だと、推薦 JSON が取れなかった回や履歴再開
  // （recommended_books 空）で messages だけがあると、入力欄も再スタート
  // 導線も無い袋小路になっていた。
  const showConcernInput = !inInterview && !recommendations;
  // 失敗・月の上限の案内が出ている間は、送った相談を残し、はじめの見出しと例は出さない
  // （何を送って失敗したのかが見えなくなるため）。入力欄は出したまま＝別の相談も送れる。
  const showErrorState = !!recoError && !recoLoading;
  // はじめの画面（まだ何も話していない）だけ見出しを出す。
  const showStartHeading = showConcernInput && messages.length === 0 && !showErrorState;
  const chatScrollRef = useRef(null);
  // 中身を下へ送ったら、上の行の下に線を出す（相談と同じ・iOS のナビゲーションバーと同じ）。
  const [scrolled, setScrolled] = useState(false);
  const onChatScroll = (e) => {
    const s = e.currentTarget.scrollTop > 0;
    if (s !== scrolled) setScrolled(s);
  };

  // ---------------------------------------------------------------------------
  // 「📚 読みたいに追加」フロー
  //
  //   1. handleClickAdd(rec): ボタンを即「確かめています…」に切替 (< 5ms)、裏で
  //      searchBooksAPIFlat を走らせる（「追加済み」は実際に追加へ進んだときだけ・2026-09-29）
  //   2. strict match で絞り込んだ candidates が 1 件だけで書名・著者が完全に同じなら確認なしで追加。
  //      それ以外で 1 件以上あれば確認モーダルへ
  //      → AdvisorAddConfirmModal で視覚確認 → 選んだ candidate の isbn /
  //      cover を rec に焼き込んで proceedAdd を呼ぶ
  //   3. candidates が 0 件なら確認モーダル skip → そのまま proceedAdd (rec
  //      は title/author だけ。addFromAdvisor 側の bg resolver に解決を任せる)
  // ---------------------------------------------------------------------------
  // 本のカードの「読みたいに追加」の行（タイトル → 要素）。追加の完了トーストが画面の下に出るので、
  // 「追加済み」がトーストに隠れないよう、行が画面の下のほうにあるときは中央まで送る。
  const addRowRefs = useRef({});
  const revealAddedRow = (title) => {
    const el = addRowRefs.current[title];
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    if (r.bottom <= window.innerHeight * 0.6) return;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* noop */ }
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  };
  const clearChecking = (title) => setCheckingTitles((prev) => {
    if (!prev.has(title)) return prev;
    const next = new Set(prev);
    next.delete(title);
    return next;
  });
  // 読書準備の 4 項目は、AI を呼ばずに手元の材料から埋める（2026-09-27・原価の節約）。
  //   以前は追加のたびに会話を AI で要約していた（本人は AI を頼んでいない＝見えない原価）。
  //   課題＝最初の相談＋ヒアリングの 1 問目 / 得たいこと＝理想の状態の答え（2026-09-29・lib/advisorText.js）/
  //   理由＝推薦の「なぜ」＋「この本の核心: …」。どれも本人がその場で見た言葉なので、ずれない。
  //   仮説は空のまま（推薦の核心は AI の言葉で、本人の仮説ではない＝読む前に自分で書く欄・2026-09-30）。
  //   確認の「書名で探す」「手動で入力する」から追加するときも同じ中身を渡す（2026-10-04・以前はそちらの道だと空のままだった）。
  const setupPayloadFor = (rec) => {
    const setup = advisorSetupFields(
      lastUserQuery,
      interviewAnswers.map((x) => ({ q: x?.q, a: clamp(sanitizeForPrompt(String(x?.a || '')), 120) })),
    );
    // sourceQuery は「得たいこと」へのプレフィル・「AI 選書で入力した内容に戻す」の元（App.jsx buildFormFromBook /
    // BookPhases）なので、得たいことと同じ値にする（相談＝課題が得たいことへ戻らないように）。
    return {
      sourceQuery: clamp(setup.purpose, 400),
      investPurpose: clamp(setup.purpose, 400),
      currentChallenge: clamp(setup.challenge, 400),
      hypothesis: '',
      bookReason: clamp([String(rec?.why || '').trim(), rec?.core ? `この本の核心: ${String(rec.core).trim()}` : ''].filter(Boolean).join('\n'), 400),
    };
  };
  const proceedAdd = (verifiedRec) => {
    // ここで初めて「追加済み」にする（確認でキャンセルした本は、押す前の見た目のまま）。
    clearChecking(verifiedRec.title);
    setAddedTitles((prev) => {
      const next = new Set(prev);
      next.add(verifiedRec.title);
      return next;
    });
    revealAddedRow(verifiedRec.title);
    // すべての I/O を Promise.resolve().then で次の tick へ。handler 同期維持。
    Promise.resolve().then(async () => {
      try {
        const saved = await onAddBook(verifiedRec, setupPayloadFor(verifiedRec));
        // onAddBook (addFromAdvisor) は失敗を内部 catch で握りつぶし null を
        // 返す（throw しない）。falsy を失敗として扱わないと rollback が
        // 一度も発火せず、追加されていないのに「✅ 追加済み」で固まる。
        if (!saved) {
          setAddedTitles((prev) => {
            const next = new Set(prev);
            next.delete(verifiedRec.title);
            return next;
          });
          return; // トーストは addFromAdvisor 側が出している（二重表示しない）
        }
        if (saved?.id && currentSessionId && sessionApi?.available) {
          try { await sessionApi.addBookToSession(currentSessionId, saved.id); } catch { /* non-critical */ }
        }
      } catch (error) {
        // 失敗時は「追加済み」表示を rollback。これまではトーストを出さず
        // 「押しても何も起きない」状態だったので、必ず原因を可視化する。
        setAddedTitles((prev) => {
          const next = new Set(prev);
          next.delete(verifiedRec.title);
          return next;
        });
        advisorToast.error(toMessage(error, '本の追加に失敗しました。'));
      }
    });
  };

  const handleClickAdd = (rec) => {
    if (addedTitles.has(rec.title) || checkingTitles.has(rec.title)) return;
    // 触覚で即時 ack (画面の見た目とは別経路で「タップ受付」を確実に伝える)。
    try { advisorHaptic.light(); } catch { /* non-critical */ }
    // UI を即「確かめています…」に切替 (連打防止 + 視覚 ack)。「追加済み」は proceedAdd で。
    setCheckingTitles((prev) => {
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
        // 候補が 1 冊だけで、書名も著者も完全に同じ → 確かめるまでもないので、そのまま追加する（2026-09-29）。
        if (matched.length === 1 && isExactMatch(matched[0], rec)) {
          proceedAdd({ ...rec, isbn: matched[0].isbn || rec.isbn || '', cover: matched[0].cover || '' });
          return;
        }
        // それ以外 → 視覚確認モーダルへ。「追加済み」は確認して追加したときだけ（キャンセルなら元のまま）。
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
    // まだ追加していないので、ボタンを押す前の「読みたいに追加」に戻すだけ。
    clearChecking(rec.title);
  };
  // 候補に目当ての本が無いとき: 書名で探し直す／手動で入力する（App の本の追加へ渡す）。
  const handleConfirmSearch = () => {
    if (!confirmAdd) return;
    const { rec } = confirmAdd;
    setConfirmAdd(null);
    clearChecking(rec.title);
    onSearchBook?.(rec.title || '', setupPayloadFor(rec));
  };
  const handleConfirmManual = () => {
    if (!confirmAdd) return;
    const { rec } = confirmAdd;
    setConfirmAdd(null);
    clearChecking(rec.title);
    onManualBook?.({ title: rec.title || '', author: rec.author || '', setup: setupPayloadFor(rec) });
  };

  // 新メッセージ追加時に最下部へオートスクロール (LINE 挙動)。
  useEffect(() => {
    if (!chatScrollRef.current || messages.length === 0) return;
    chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);
  // 推薦が出たときは、最下部ではなく推薦の先頭（前置き → 1 冊目のカードと「読みたいに追加」）へ。
  // 表紙の後追い（verifyAndEnrich）で items が差し替わっても、もう一度は動かさない（出た瞬間だけ）。
  const recoBlockRef = useRef(null);
  const hadRecoRef = useRef(!!memo0.recommendations); // 戻ってきたときは位置を動かさない
  useEffect(() => {
    const has = !!recommendations;
    const appeared = has && !hadRecoRef.current;
    hadRecoRef.current = has;
    if (!appeared) return;
    setTimeout(() => recoBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }, [recommendations]);

  // 履歴サブビューでは入力欄を出さず、専用 UI に切り替える。
  if (view === 'history') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* 余白は履歴側が持つ（左右 16 を二重にしない）。 */}
        <div className="chat-scroll" style={{ padding: 0 }}>
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
                  advisorToast.success('履歴を削除しました。');
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
        <div className="chat-scroll" style={{ padding: 0 }}>
          <Suspense fallback={<Spinner />}>
            <AdvisorSessionDetail
              session={selectedSession}
              books={books}
              onAddBook={onAddBook}
              onBookAdded={(bookId) => {
                // 履歴詳細からの追加もセッションに記録（一覧の「N 冊追加」を正しく）。
                if (bookId && sessionApi?.available && selectedSession?.id) {
                  sessionApi.addBookToSession(selectedSession.id, bookId).catch(() => {});
                }
              }}
              onResume={resumeSession}
              onNewSession={startNewSession}
              onClose={() => { setSelectedSession(null); setView('history'); }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // 上の操作（履歴・新規）。App のサブタブの行の右端へ出す（barSlot）。
  const barButtons = (
    <>
    {sessionApi?.available && (
      <button
        type="button"
        onClick={() => setView('history')}
        aria-label="履歴を見る"
        title="履歴"
        style={iconBtn}
      >
        <IcHistory size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
    )}
    {/* 推薦が出ている間は、やり直しの入口を下の「別の条件で探す」1 つにする（同じ操作を 2 か所に出さない）。 */}
    {messages.length > 0 && !recommendations && (
      <button
        type="button"
        onClick={startNewSession}
        aria-label="新しい会話を始める"
        title="新規"
        style={iconBtn}
      >
        <IcNewChat size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
    )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* 履歴・新規のアイコンは App のサブタブ（相談｜AI 選書）の行の右端へ（相談の 🕒・… と同じ場所・2026-10-01 ui-critic）。
          barSlot が無いとき（単体で使うとき）だけ、自前の上の行に出す。 */}
      {barSlot ? createPortal(barButtons, barSlot) : (
        <div style={{ ...topRow, ...(scrolled ? { borderBottom: '1px solid var(--separator)' } : null) }}>
          <div style={{ flex: 1, minWidth: 0 }} />
          {barButtons}
        </div>
      )}
      {/* Scroll 領域: 見出し / 例チップ / メッセージ / 推薦カード をまとめる */}
      <div ref={chatScrollRef} onScroll={onChatScroll} className="chat-scroll" style={{ padding: `${barSlot ? 'var(--space-6)' : 'var(--space-2)'} var(--space-4) var(--space-4)` }}>
      {/* 入力欄の「いまの課題を書いてください」と同じ問い（課題から本を選ぶ・2026-09-29） */}
      {showStartHeading && <h2 style={headingStyle}>いま、どんなことに困っていますか</h2>}

      {/* Example chips — タップでそのまま送る（相談の相談例と同じ・2026-09-29）。
          無料プランで有料プランの画面が開いたときは、入力欄に残す。 */}
      {showConcernInput && !showErrorState && (
        <div className="example-chips" style={{ marginTop: showStartHeading ? 'var(--space-6)' : 'var(--space-2)' }}>
          <p className="example-chips-label">たとえば</p>
          {ADVISOR_EXAMPLES.map((ex) => (
            <button
              type="button"
              key={ex}
              className="example-chip"
              onClick={() => { setInput(ex); startInterview(ex); }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* 会話（相談 → 質問 → 推薦）。chat-scroll が overflow を担うため、ここは縦並びのみ。 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>

      {/* ユーザーの相談（右寄せの --fill 吹き出し。相談と同じ） */}
      {concern && (!showConcernInput || showErrorState) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} role="article" aria-label="あなたの相談">
          <TightBubble text={concern} className="text-pretty" style={userBubble}>{withPhraseBreaks(concern)}</TightBubble>
        </div>
      )}

      {/* ガイド付きヒアリング — 質問生成中のローディング（初回 or 深掘り） */}
      {interviewLoading && (
        <div style={advisorWizardCard}>
          <div className="ai-thinking">
            <span className="ai-thinking-dot" aria-hidden="true" />
            <span>
              {/* 待っている間の文は、いま何をしているかを 1 つだけ言う（質問を作る／本を選ぶ・2026-09-29）。
                  最初の質問はまだ何も聞いていないので「追加で」とは言わない（2026-09-30）。 */}
              {interviewAnswers.length > 0 ? '追加で聞くことを考えています…' : 'あなたに聞くことを考えています…'}
            </span>
          </div>
          <div className="ai-skeleton" aria-label="質問を準備中" style={{ marginTop: 'var(--space-2)' }}>
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
        const submitOther = () => {
          if (!otherText.trim()) return;
          if (isMulti) {
            toggleMulti(otherText.trim());
            setOtherText('');
            setOtherMode(false);
          } else {
            answerQuestion(otherText);
          }
        };
        return (
          <div style={advisorWizardCard}>
            {/* 戻る + 進捗 */}
            {/* 戻るの「‹」の見た目の左端を質問文の左端にそろえる（押せる範囲 44 は保ったまま左へ寄せる）。 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 'calc(-1 * var(--space-3)) 0 var(--space-2) calc(-1 * var(--space-2))' }}>
              <button
                type="button"
                onClick={goBackQuestion}
                aria-label={interviewStep === 0 ? '最初の入力に戻る' : '前の質問に戻る'}
                style={{ ...iconBtn, justifyContent: 'flex-start' }}
              >
                <IcBack size={22} aria-hidden="true" />
              </button>
              <div style={{ flex: 1, display: 'flex', gap: 'var(--space-1)' }} aria-hidden="true">
                {interview.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 999,
                      background: i <= interviewStep ? 'var(--text-2)' : 'var(--separator)',
                      transition: 'background .25s',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', flexShrink: 0 }}>
                {interviewRound > 1 ? `深掘り${interviewRound} · ` : ''}{stepNo}/{total}
              </span>
            </div>

            {/* これまでの回答（小チップ） */}
            {interviewAnswers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                {interviewAnswers.map((x, i) => (
                  <span
                    key={i}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', maxWidth: '100%', fontSize: 'var(--text-meta)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text-2)' }}
                  >
                    <IcCheck size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.a}</span>
                  </span>
                ))}
              </div>
            )}

            {/* 質問文 */}
            <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
              {q.q}
            </p>
            {/* 複数選択できる質問だけ明示する */}
            {isMulti && (
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 'var(--space-1) 0 0' }}>
                複数選べます
              </p>
            )}

            {/* 選択肢チップ（縦並び・全幅タップ） */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              {q.options.map((opt) => {
                const selected = isMulti && multiSelected.includes(opt);
                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => (isMulti ? toggleMulti(opt) : answerQuestion(opt))}
                    aria-pressed={isMulti ? selected : undefined}
                    style={{ ...advisorOptionChip, ...(selected ? advisorOptionChipSelected : null) }}
                  >
                    {isMulti && (selected
                      ? <IcBoxChecked size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
                      : <IcBox size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-3)' }} />)}
                    <span style={{ minWidth: 0 }}>{opt}</span>
                  </button>
                );
              })}

              {/* その他（自由入力）。複数選択モードでは選択肢に「追加」する。 */}
              {!otherMode ? (
                <button
                  type="button"
                  onClick={() => setOtherMode(true)}
                  style={{ ...uiBtnText, alignSelf: 'flex-start', minHeight: 44, padding: 'var(--space-2) 0', fontSize: 'var(--text-sub)' }}
                >
                  <IcPencil size={18} aria-hidden="true" />
                  その他（自由に入力）
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
                        submitOther();
                      }
                    }}
                    style={{ ...uiInput, flex: 1, minWidth: 0, width: 'auto' }}
                  />
                  <button
                    type="button"
                    onClick={submitOther}
                    disabled={!otherText.trim()}
                    aria-label={isMulti ? '選択肢に追加' : 'この内容で回答'}
                    style={{ ...rowBtn, minHeight: 48, ...(otherText.trim() ? null : { color: uiBtnGhostOff.color, border: uiBtnGhostOff.border, opacity: 1, cursor: 'default' }) }}
                  >
                    {isMulti ? '追加' : '決定'}
                  </button>
                </div>
              )}

              {/* 複数選択モードの確定ボタン（この画面の主ボタン） */}
              {isMulti && (
                <button
                  type="button"
                  onClick={() => { if (multiSelected.length) answerQuestion(multiSelected.join('、')); }}
                  disabled={multiSelected.length === 0}
                  style={{ ...(multiSelected.length ? uiBtnPrimary : uiBtnPrimaryOff), marginTop: 'var(--space-2)' }}
                >
                  {multiSelected.length ? `決定（${multiSelected.length} 件）` : '1つ以上選んでください'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 推薦生成中のローディング */}
      {recoLoading && (
        <div style={advisorWizardCard} aria-live="polite">
          <div className="ai-thinking">
            <span className="ai-thinking-dot" aria-hidden="true" />
            <span>あなたに合う本を選んでいます…</span>
          </div>
          {recoStream ? (
            // 生成中の前置き文をライブ表示（動く文字＝進行が見える）。カードは完了時に出る。
            // 完成後の前置きと同じ見た目（15/--text-2）にして、出来上がった瞬間に文字が跳ねないようにする。
            <p style={{ ...introText, margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap' }}>
              {cleanProseTitles(recoStream)}
              <span className="streaming-cursor" aria-hidden="true" />
            </p>
          ) : (
            <div className="ai-skeleton" aria-label="本を選んでいます" style={{ marginTop: 'var(--space-2)' }}>
              <div className="ai-skeleton-line" style={{ width: '90%' }} />
              <div className="ai-skeleton-line" style={{ width: '76%' }} />
              <div className="ai-skeleton-line" style={{ width: '58%' }} />
            </div>
          )}
        </div>
      )}

      {/* 推薦生成エラー（リトライ可能） */}
      {recoError && !recoLoading && recoNotice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p role="status" style={{ ...uiCard, margin: 0, fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {keepDateTogether(recoError)}
          </p>
          {/* 🪙➕ プランの人がトークンを使い切ったら、案内のすぐ下に「トークンを追加」 */}
          {canBuyTokens && /^(今月のトークン|無料期間のトークン)/.test(recoError) && (
            <button type="button" onClick={openTokenSheet} style={uiBtnPrimary}>
              トークンを追加
            </button>
          )}
        </div>
      )}
      {recoError && !recoLoading && !recoNotice && (
        // 失敗の文は 1 つの言い方にそろえる（題＋次にすること・内部の文言を見せない・2026-09-29）。
        <ErrorMessage
          icon={null}
          title="本を探せませんでした"
          description="通信の状態を確かめて、もう一度お試しください。"
          actions={[{
            label: 'もう一度',
            // 同じ相談・同じ答えで送り直す（控えが無いときだけ最初から）。
            onClick: () => {
              const a = lastRecoArgsRef.current;
              if (a) generateRecommendations(a.userMsg, a.sourceQuery);
              else resetToConcern();
            },
            // ほかの画面の「もう一度」（メモの読み込みの失敗など）と同じ副ボタン（2026-09-30）。
            variant: 'secondary',
            // ErrorMessage の「もう一度」はアイコンを付けない（ほかの画面と同じ・DESIGN §5・2026-09-30）。
          }]}
        />
      )}

      {/* Messages — ユーザーは右寄せの --fill 吹き出し、AI は読むカード（相談と同じ）。 */}
      {messages.map((m, i) => {
        const body = m.streaming && !m.text ? (
          // 空の assistant 吹き出し (= 最初の delta 到達前) は skeleton で待ち時間を埋める。
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
        );
        return m.role === 'user' ? (
          <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <TightBubble text={m.text} className="text-pretty" style={userBubble}>{withPhraseBreaks(m.text)}</TightBubble>
          </div>
        ) : m.streaming ? (
          <div key={i} style={{ ...cardStyle, ...readText, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {body}
          </div>
        ) : (() => {
          // 完成した AI の文章は Markdown（見出し・箇条書き）として描画（生の ## を出さない）。
          // 書名は確かめた本・本棚の本だけ残す（消して空になったら、もう一度送る案内に替える）。
          const shown = cleanProseTitles(m.text);
          return <MarkdownSections key={i} text={shown || 'ご提案に確かめられない本が含まれていたため、表示を控えました。お手数ですが、もう一度送ってください。'} />;
        })();
      })}

      {/* Recommendations — 1 冊 1 カード（理由つき） */}
      {recommendations && (
        // 3 つのまとまり（前置き＋本のカード → 読む順番 → 注記＋やり直し）。中は 12・間は 24（DESIGN §1）。
        <div ref={recoBlockRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', animation: 'fadeIn .3s', scrollMarginTop: 'var(--space-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* 前置き（「## 👋 はじめに」）は、本のカードより控えめな 1 段落（15/--text-2・カードも見出しも付けない）。
              見出し行と、末尾の空見出し「## 📚 おすすめの本」（本のカードと重複）は落とす。 */}
          {/* 選んだ答えを 1 行で（「何をもとに選ばれたか」が見える・13/--text-2・2026-09-29） */}
          {interviewAnswers.length > 0 && (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, margin: 0, overflowWrap: 'anywhere' }}>
              {interviewAnswers.map((x) => x?.a).filter(Boolean).join('・')}
            </p>
          )}
          {recommendations.before && (() => {
            const intro = introTextOf(cleanProseTitles(recommendations.before));
            return intro ? <p style={introText}>{intro}</p> : null;
          })()}
          {recommendations.items.map((rec, i) => {
            const added = addedTitles.has(rec.title);
            return (
              <div key={i} style={{ ...cardStyle, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  {/* 実在検証で先読みした表紙（あれば）。本の表紙は本の形として角丸 4。 */}
                  {rec.cover && (
                    <img
                      src={rec.cover}
                      alt=""
                      width="52"
                      loading="lazy"
                      style={{ width: 52, height: 74, objectFit: 'cover', borderRadius: 4, flexShrink: 0, background: 'var(--fill)' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0 }}>#{i + 1}</p>
                    <p style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: 'var(--space-1) 0 0', overflowWrap: 'anywhere', textIndent: '-0.5em' }}>『{rec.title}』</p>
                    {rec.author && (
                      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 'var(--space-1) 0 0' }}>{rec.author}</p>
                    )}
                  </div>
                </div>
                {/* 実在を確認できなかった本（AI が実在しない書名を挙げた疑い）。
                    削除はせず注意喚起に留める（実在するのに検証を取りこぼした本を
                    誤って葬らないため）。 */}
                {/* 実在を確かめられなかった本（通信失敗・検索元が使えない）。疑いではないので短い 1 行。
                    すべての本が確かめられなかったときは、カードの下の 1 行の注意にまとめる。 */}
                {rec._verify === 'unknown' && !allUnverifiable && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'var(--warning-soft)', borderRadius: 'var(--radius)' }}>
                    <IcAlert size={16} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 'var(--space-1)' }} />
                    <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
                      確認できませんでした
                    </p>
                  </div>
                )}
                {rec._verify === 'suspect' && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'var(--warning-soft)', borderRadius: 'var(--radius)' }}>
                    <IcAlert size={16} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 'var(--space-1)' }} />
                    <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
                      この本は書誌情報が見つかりませんでした。書名・著者が正しいか、実在する本かご確認ください。
                    </p>
                  </div>
                )}
                {rec.why && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <p style={fieldLabel}>なぜあなたに</p>
                    <p style={{ ...readText, margin: 'var(--space-1) 0 0' }}>{rec.why}</p>
                  </div>
                )}
                {rec.core && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <p style={fieldLabel}>この本の核心</p>
                    <p style={fieldText}>{rec.core}</p>
                  </div>
                )}
                {rec.focus && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <p style={fieldLabel}>注目ポイント</p>
                    <p style={fieldText}>{rec.focus}</p>
                  </div>
                )}
                {rec.duration && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <p style={fieldLabel}>目安</p>
                    <p style={fieldText}>{rec.duration}</p>
                  </div>
                )}
                <div ref={(el) => { if (el) addRowRefs.current[rec.title] = el; else delete addRowRefs.current[rec.title]; }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                  {(added || findDuplicateBook(books || [], rec)) ? ((() => {
                    // 追加した本・もう本棚にある本は、押す前の「読みたいに追加」と同じ箱（高さ 48・全幅）のまま
                    // 「✓ 追加済み・開く」に替える（行の高さが変わらない・トーストを見逃してもここから本の詳細へ）。
                    const shelfBook = onOpenBook ? findDuplicateBook(books || [], rec) : null;
                    const label = added ? '追加済み' : '本棚にあります';
                    const check = <IcCheck size={18} aria-hidden="true" style={{ color: 'var(--success)', flexShrink: 0 }} />;
                    return shelfBook ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onOpenBook(shelfBook); }}
                        aria-label={`『${rec.title}』は${label === '追加済み' ? '追加済みです' : '本棚にあります'}。開く`}
                        style={{ ...uiBtnGhost, touchAction: 'manipulation' }}>
                        {check}{label}・開く
                      </button>
                    ) : (
                      <p role="status" style={{ ...uiBtnGhostOff, margin: 0, cursor: 'default', color: 'var(--text-2)' }}>
                        {check}{label}
                      </p>
                    );
                  })()
                  ) : checkingTitles.has(rec.title) ? (
                    // 同じ本かを確かめている間（確認で追加するまでは「追加済み」にしない）。薄くせず文言で示す。
                    <button type="button" disabled aria-busy="true" style={{ ...uiBtnGhostOff, touchAction: 'manipulation' }}>
                      確かめています…
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClickAdd(rec);
                      }}
                      // カードの主役の操作なので全幅の副ボタン（48・17/600）。下の「別の条件で探す」より強く見せる。
                      style={{ ...uiBtnGhost, touchAction: 'manipulation' }}
                    >
                      <IcPlus size={18} aria-hidden="true" />読みたいに追加
                    </button>
                  )}
                  {/* Amazon + 楽天 の両方（統一）は控えめな文字リンク。開示は推薦の最後にまとめて 1 回 */}
                  <AdvisorStoreLinks book={rec} />
                </div>
              </div>
            );
          })}
          {allUnverifiable && (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              本の実在を確かめられませんでした。購入前に書名を確かめてください
            </p>
          )}
        </div>
          {/* 「## 📋 読む順番」等は Markdown（表・見出し・箇条書き）として描画。励ましだけの「まとめ」は出さない。 */}
          {/* 書名は実在を確かめたカードの本・本棚の本だけ（検証が終わるまでは出さない＝架空の書名を一瞬でも見せない）。 */}
          {recommendations.checked !== false && (() => {
            const after = cleanProseTitles(dropSummarySection(recommendations.after));
            return after ? <MarkdownSections text={after} /> : null;
          })()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
            {STORE_DISCLOSURE_TEXT}
          </p>
          {/* やり直しは脇役＝文字ボタン（本のカードの「読みたいに追加」より弱く）。文字の左端を注記にそろえる。 */}
          <button type="button" onClick={resetToConcern} style={{ ...uiBtnLink, gap: 'var(--space-1)', alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>
            <IcRetry size={16} aria-hidden="true" />
            別の条件で探す
          </button>
        </div>
        </div>
      )}

      <div ref={messagesEndRef} />
      </div>
      </div>{/* /chat-scroll */}

      {/* Input — flex column の末尾に置かれ、親 (.ai-page) の 100dvh 構造で
          自動的にキーボード直上 / BottomNav 直上に張り付く (LINE 風)。 */}
      {showConcernInput && (() => {
        // トークンを使い切った間は、送っても同じ案内に戻るだけなので送れない形にする（相談と同じ）。
        const tokensOut = !!(recoError && recoNotice && /^(今月のトークン|無料期間のトークン)/.test(recoError));
        const monthOut = tokensOut && /^今月のトークン/.test(recoError);
        return (
        // 1 回の目安と残りは、入力欄と送るボタンの下の行に（折り返して全幅）。
        // 無料プランは、書く前に「プランの機能」だと分かるように 1 行（書いて送ってから断らない・2026-09-30）。
        //   7 日間無料はここではすすめない（押したときの有料プランの画面で案内する＝GLOSSARY）。
        <div className="ai-input-area" style={(costLine && !tokensOut) || freeMode ? { flexWrap: 'wrap' } : undefined}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tokensOut ? (monthOut ? `${nextResetLabelJa()}から探せます` : 'トークンを使い切りました') : 'いまの課題を書いてください'}
            rows={1}
            disabled={interviewLoading || tokensOut}
            maxLength={LIMITS.aiQuestion}
            aria-label="AI 選書への相談内容"
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
            disabled={!input.trim() || interviewLoading || tokensOut}
            aria-label={interviewLoading ? '準備中' : '本を探す'}
            title={interviewLoading ? '準備中…' : '本を探す'}
          >
            {interviewLoading ? (
              <span aria-hidden="true">…</span>
            ) : (
              <IcSend size={20} strokeWidth={2.25} aria-hidden="true" />
            )}
          </button>
          {costLine && !tokensOut && (
            <p style={{ flexBasis: '100%', margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
              {costLine}
            </p>
          )}
          {freeMode && (
            <p style={{ flexBasis: '100%', margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
              AI 選書はプランの機能です
            </p>
          )}
        </div>
        );
      })()}
      {confirmAdd && (
        <Suspense fallback={<Spinner />}>
          <AdvisorAddConfirmModal
            original={confirmAdd.rec}
            candidates={confirmAdd.candidates}
            onConfirm={handleConfirmCandidate}
            onCancel={handleConfirmCancel}
            onSearchByTitle={onSearchBook ? handleConfirmSearch : undefined}
            onManual={onManualBook ? handleConfirmManual : undefined}
          />
        </Suspense>
      )}
    </div>
  );
}
