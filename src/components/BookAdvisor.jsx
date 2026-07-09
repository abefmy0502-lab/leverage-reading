// 🔍 AI 選書アドバイザー（「相談して選ぶ」）。課題ヒアリング（ウィザード）→
// Claude による推薦 → セットアップシート引き継ぎ + 会話履歴。App.jsx から
// 切り出した自己完結コンポーネント。props: onAddBook / sessionApi / books。
// 「話題の本を探す」タブ（DiscoverPanel）もこの中でサブタブとして描画する。

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  BookOpen as IcBook,
  Lightbulb as IcBulb,
  CheckCircle2 as IcCheck,
  History as IcHistory,
  MessageSquarePlus as IcNewChat,
  RefreshCw as IcRefresh,
  Sparkles as IcSparkles,
} from 'lucide-react';
import { callClaude, sanitizeForPrompt, gatherAdvisorContext } from '../lib/ai';
import { streamClaude } from '../lib/streamClaude';
import { PROMPTS } from '../lib/prompts';
import { MODEL_SMART, MODEL_FAST } from '../lib/models';
import { LIMITS, clamp } from '../lib/limits';
import { toMessage } from '../lib/errors';
import { track } from '../lib/analytics';
import { isStrictMatch } from '../lib/bookMatch';
import { searchBooksFlat as searchBooksAPIFlat } from '../lib/bookSearch';
import { summarizeAdvisorConversation } from '../lib/aiSetupSummary';
import { STORE_DISCLOSURE_TEXT } from '../lib/rakutenLink';
import { btnO } from './formPrimitives';
import { useAuth } from '../hooks/useAuth';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import MarkdownSections from './MarkdownSections';
import Spinner from './Spinner';
import BookStoreLinks from './BookStoreLinks';

const AdvisorHistoryList = lazy(() => import('./AdvisorHistory').then((m) => ({ default: m.AdvisorHistoryList })));
const AdvisorSessionDetail = lazy(() => import('./AdvisorHistory').then((m) => ({ default: m.AdvisorSessionDetail })));
const AdvisorAddConfirmModal = lazy(() => import('./AdvisorAddConfirmModal'));
const DiscoverPanel = lazy(() => import('./DiscoverPanel'));

const advisorWizardCard = {
  background: 'var(--c-soft)',
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

export default function BookAdvisor({ onAddBook, sessionApi, books }) {
  // 旧: 挨拶 seed メッセージで例を箇条書き → サブタブ画面では冗長
  // (タップ不可で文字を読まされるだけ)。例はチップ UI に分離した。
  // 「📚 読みたいに追加」のタップ受付を触覚で即時 ack するため。
  const { user: advisorUser } = useAuth();
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
  // AI 選書のメインタブ: 'consult'(相談して選ぶ) | 'discover'(話題の本を探す)
  const [advisorView, setAdvisorView] = useState('consult');
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
    const startIdx = text.indexOf(START);
    if (startIdx < 0) return { recs: null, prose: stripRecoBlock(text) };

    const afterStart = text.slice(startIdx + START.length);
    const endRel = afterStart.indexOf(END);
    let jsonRaw;
    let blockEndAbs;
    if (endRel >= 0) {
      jsonRaw = afterStart.slice(0, endRel);
      blockEndAbs = startIdx + START.length + endRel + END.length;
    } else {
      // END マーカー欠落（max_tokens 打ち切り等）でも、次の見出し(## )までを
      // JSON 候補として拾って復旧を試みる（見出しが無ければ以降すべて）。
      const nextHeading = afterStart.search(/\n#{1,4}\s/);
      jsonRaw = nextHeading >= 0 ? afterStart.slice(0, nextHeading) : afterStart;
      blockEndAbs = nextHeading >= 0 ? startIdx + START.length + nextHeading : text.length;
    }

    const arr = tolerantRecArray(jsonRaw);
    const recs = Array.isArray(arr) ? arr.filter((r) => r && typeof r.title === 'string') : null;
    // JSON が壊れていた/空だった場合も、マーカーと生 JSON・空見出しをユーザーに見せない。
    if (!recs || recs.length === 0) return { recs: null, prose: stripRecoBlock(text) };
    const before = text.slice(0, startIdx).trim();
    const after = text.slice(blockEndAbs).trim();
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
        // ヒアリング質問生成は定型 JSON なので FAST(Haiku)。安価・高速で品質十分。
        { max_tokens: 700, cacheSystem: true, model: MODEL_FAST },
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
    let readerContext = '';
    try { readerContext = await gatherAdvisorContext(advisorUser?.id); } catch { /* graceful */ }

    // 🕐 無通信ウォッチドッグ: SSE がストール（モバイル回線切替等）しても
    // 「選んでいます…」で無期限に固まらないよう、チャンク間 45 秒無通信で中断する。
    // streamClaude は abort 時に部分テキストで正常 resolve するため、途中まで
    // 生成済みの推薦は下の salvage パースで拾える。
    const controller = new AbortController();
    let watchdog = null;
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => { try { controller.abort(); } catch { /* noop */ } }, 45000);
    };

    let finalText = '';
    try {
      armWatchdog();
      finalText = await streamClaude({
        system: PROMPTS.bookAdvisor.systemWith(readerContext),
        // readerContext はユーザーごとに変わるためキャッシュ読取ヒットが起きない。
        // 汎用（context 空）の時だけキャッシュを効かせる。
        cacheSystem: !readerContext,
        messages: newHistory,
        // 前置き + 3〜5冊の JSON + 読む順番 + まとめを 1 応答で要求するため、
        // JSON が途中で切れて推薦カードが全滅しないよう余裕を持たせる
        // （Sonnet 5 の新トークナイザは同じ日本語で約 3 割トークン増）。
        max_tokens: 4096,
        model: MODEL_SMART,
        signal: controller.signal,
        onChunk: () => armWatchdog(),
      });
    } catch (e) {
      setRecoError(toMessage(e, '通信エラーが発生しました。もう一度お試しください。'));
      setRecoLoading(false);
      return;
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }

    if (controller.signal.aborted && !finalText.trim()) {
      // ストール中断かつ 1 文字も生成されていない → エラーとして再試行を促す。
      setRecoError('通信が途切れました。電波の良い場所でもう一度お試しください。');
      setRecoLoading(false);
      return;
    }

    // 計測は「応答を最後まで受け取れた」時のみ（ストール中断の部分応答は除外し、
    // 運営ダッシュボードの AI 利用集計を歪めない）。
    if (!controller.signal.aborted) track('ai_used', { feature: 'advisor' });

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
      setLastUserQuery(sourceQuery || safeMsg);
      nextRecs = finalList;
    } else {
      // 推薦 JSON が取れなかった → 本文（マーカー/壊れた JSON は除去済み）を提示。
      // 空になった（=JSON だけで打ち切られた等）場合は案内文を出し、袋小路を防ぐ。
      const visible = typeof prose === 'string' && prose
        ? prose
        : '提案の生成が途中で途切れてしまいました。お手数ですが、もう一度質問を送ってください。';
      setMessages([{ role: 'assistant', text: visible }]);
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

  // テーマのチップをタップ — AI の良書の棚（テーマ別の推薦）を生成する。
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
    setChatHistory(histMessages); // AI 文脈は生テキストのまま保持
    setMessages(
      histMessages
        .map((m) => ({
          role: m.role,
          // 表示は RECOMMENDATIONS ブロック（マーカー + 生 JSON）を剥がす。
          text: m.role === 'assistant'
            ? stripRecoBlock((m.content ?? m.text ?? '').toString())
            : (m.content ?? m.text ?? '').toString(),
        }))
        .filter((m) => m.text), // 剥がして空になった吹き出しは出さない
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
  // 相談入力（textarea + 例チップ）は「推薦カードが出ていない間」は常に出す。
  // 旧条件（isEmpty のみ）だと、推薦 JSON が取れなかった回や履歴再開
  // （recommended_books 空）で messages だけがあると、入力欄も再スタート
  // 導線も無い袋小路になっていた。
  const showConcernInput = !inInterview && !recommendations;
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
        // 正常系（推薦カードが出る）では会話は chatHistory に積まれ、messages は空。
        // ヒアリングで集めた本人の言葉を読書計画シートに反映するため chatHistory を優先する。
        const convo = chatHistory.length ? chatHistory : messages;
        summary = await summarizeAdvisorConversation(convo, verifiedRec);
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

      {/* AI 選書のメインタブ: 相談して選ぶ / 話題の本を探す（楽天ブックスの実データ）。
          旧「テーマの棚」(AI 生成) を実データのディスカバリーに置換し、2 機能を分離。 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: 'var(--c-soft-2)', borderRadius: 12, padding: 4 }}>
        {[
          { k: 'consult', label: '💬 相談して選ぶ' },
          { k: 'discover', label: '🔥 話題の本を探す' },
        ].map((t) => (
          <button
            type="button"
            key={t.k}
            onClick={() => { setAdvisorView(t.k); try { advisorHaptic.light(); } catch { /* non-critical */ } }}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 9,
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              minHeight: 40,
              background: advisorView === t.k ? 'var(--c-card)' : 'transparent',
              color: advisorView === t.k ? 'var(--c-brand)' : 'var(--c-ink-2)',
              boxShadow: advisorView === t.k ? '0 1px 3px rgba(60,48,30,0.12)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {advisorView === 'discover' ? (
        <Suspense fallback={<Spinner />}>
          <DiscoverPanel onAddBook={onAddBook} books={books} />
        </Suspense>
      ) : (<>

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
                    style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'var(--c-soft-2)', color: 'var(--c-ink-2)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '0 0 12px' }}>
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
                        ? { background: 'var(--c-soft-2)', borderColor: 'var(--c-brand)', color: 'var(--c-ink)', fontWeight: 600 }
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
              background: m.role === "user" ? "var(--c-brand)" : "var(--c-soft)",
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
                    <p style={{ fontSize: 11, color: '#9a7e44', fontWeight: 700, letterSpacing: '0.06em', margin: 0 }}>なぜあなたに</p>
                    <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.75, margin: '4px 0 0' }}>{rec.why}</p>
                  </div>
                )}
                {rec.core && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 11, color: 'var(--c-ink-2)', fontWeight: 700, letterSpacing: '0.06em', margin: 0 }}>この本の核心</p>
                    <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.75, margin: '3px 0 0' }}>{rec.core}</p>
                  </div>
                )}
                {rec.focus && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 11, color: 'var(--c-ink-2)', fontWeight: 700, letterSpacing: '0.06em', margin: 0 }}>注目ポイント</p>
                    <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.75, margin: '3px 0 0' }}>{rec.focus}</p>
                  </div>
                )}
                {rec.duration && (
                  <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: '10px 0 0' }}>
                    <span style={{ color: 'var(--c-ink-2)', fontWeight: 700, letterSpacing: '0.04em' }}>目安</span>　{rec.duration}
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    disabled={addedTitles.has(rec.title)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClickAdd(rec);
                    }}
                    style={{ width: '100%', padding: "11px 0", borderRadius: 8, border: "none", background: addedTitles.has(rec.title) ? 'var(--c-soft-2)' : "var(--c-brand)", color: addedTitles.has(rec.title) ? 'var(--c-ink-2)' : "#fff", fontSize: 13, fontFamily: "inherit", cursor: addedTitles.has(rec.title) ? "not-allowed" : "pointer", fontWeight: 700, minHeight: 44, touchAction: 'manipulation' }}
                  >
                    {addedTitles.has(rec.title)
                      ? (<><IcCheck size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />追加済み</>)
                      : (<><IcBook size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読みたいに追加</>)}
                  </button>
                  {/* Amazon + 楽天 の両方（統一）。カード下にまとめ開示があるので個別開示は省略 */}
                  <BookStoreLinks book={rec} variant="compact" showDisclosure={false} stopPropagation />
                </div>
              </div>
            ))}
            {/* 「## 📋 読む順番」「## 💬 まとめ」等は Markdown（表・見出し・箇条書き）
                として描画。生の `|---|` パイプや `##` が見えていた問題を解消。 */}
            {recommendations.after && <MarkdownSections text={recommendations.after} />}
            <small style={{ fontSize: 10, color: 'var(--c-ink-2)', lineHeight: 1.6, padding: '0 4px' }}>
              {STORE_DISCLOSURE_TEXT}
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
      </>)}
      </div>{/* /chat-scroll */}

      {/* Input — flex column の末尾に置かれ、親 (.ai-page) の 100dvh 構造で
          自動的にキーボード直上 / BottomNav 直上に張り付く (LINE 風)。
          話題の本タブ (discover) では相談入力を出さない。 */}
      {advisorView === 'consult' && showConcernInput && (
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
        <Suspense fallback={<Spinner />}>
          <AdvisorAddConfirmModal
            original={confirmAdd.rec}
            candidates={confirmAdd.candidates}
            onConfirm={handleConfirmCandidate}
            onCancel={handleConfirmCancel}
          />
        </Suspense>
      )}
    </div>
  );
}
