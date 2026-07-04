// 🧠 マイ読書脳 — chat with an AI grounded in the user's own memos.
//
// Three sub-views toggled by top buttons:
//   💬 質問する  : chat (default)
//   💡 学びを追加 : non-book personal learning entry sheet
//   📜 履歴      : full chat history (same data as 💬, dedicated scroll area)
//
// chat_messages live in Supabase; book_memos with source_type='personal'
// are written for personal learnings and surface in the Review tab too.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import { streamMyBookBrain, generateWeeklyQuestion } from '../lib/ai';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from '../styles/ui';
import { track, EVENTS } from '../lib/analytics';
import { LIMITS } from '../lib/limits';
import Spinner from './Spinner';
import KnowledgeManager from './KnowledgeManager';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import { MessageCircle, Lightbulb, History, BookOpenCheck, Sprout, MessageCircleQuestion, Target, Check, Clock } from 'lucide-react';
import KnowledgeJourney from './KnowledgeJourney';

// AI tab の .ai-page-body (flex 1, overflow hidden) の中にぴったり
// 収める flex column。chat 時は内側 .chat-scroll + .ai-input-area で
// LINE 風レイアウト、それ以外 (learning/history/knowledge) は普通の
// 縦スクロールフォーム / リスト。padding は各 view 内側で管理する。
const wrap = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' };
// chat 以外の view 共通: ヘッダ/pill 下にスクロール可能な領域を提供。
const viewScroll = { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 16px 24px' };
const card = { background: 'var(--c-card)', border: '1px solid var(--c-hairline)', borderRadius: 12, padding: '12px 14px' };
const inp = { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid var(--c-hairline-strong)', borderRadius: 10, background: '#fff', color: 'var(--c-ink)', fontFamily: 'inherit', boxSizing: 'border-box' };
const ta = { ...inp, resize: 'vertical', minHeight: 200, lineHeight: 1.7 };
const btnPrimary = { ...uiBtnPrimary, width: 'auto', padding: '12px 20px', fontSize: 14 };
const btnGhost = { ...uiBtnGhost, width: 'auto', padding: '8px 12px', borderRadius: 8, fontSize: 12 };
const pill = (active) => ({
  // Sized to content so labels never wrap; row scrolls horizontally on
  // narrow phones via the parent's overflow-x: auto + lvg-no-scrollbar.
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
  minHeight: 36,
  padding: '6px 10px',
  border: 'none',
  background: active ? 'var(--c-brand)' : 'transparent',
  color: active ? 'var(--c-card)' : 'var(--c-ink-soft)',
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 8,
});

const QUESTION_EXAMPLES = [
  '営業で結果を出すには？',
  'チームをまとめるコツは？',
  '自己肯定感を高めるには？',
  '迷った時の判断基準は？',
  '明日のための 1 つの行動は？',
];

const CATEGORIES = ['会話', '経験', '観察', '気づき', 'その他'];

// 💭 今週の問い — AI 生成に失敗/未接続のときの定型フォールバック（メモに依らず
// 立ち止まれる普遍的な問い）。曜日や週で固定的に1つ選ぶ。
const FALLBACK_WEEKLY = [
  'この1週間で、本から学んだことを1つでも行動に移せましたか？',
  '今いちばん向き合っている課題に、過去のメモはどう答えますか？',
  '繰り返し心に残っている学びは何ですか？それは行動になっていますか？',
  'もし明日1つだけ実践するなら、どの学びを選びますか？',
];

// 文字列 → 安定したハッシュ（定型問いを週で固定選択するため）。
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

// ISO 風の「年-週」キー（端末ローカルの週次キャッシュ用）。
function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

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
function LearningInline({ onCancel, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
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
      toast.success('💡 学びを記録しました');
      onSaved?.();
    } catch (e) {
      toast.error(toMessage(e, '保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-secondary)', fontSize: 14,
            fontFamily: 'inherit', padding: 0, minHeight: 32,
          }}
          aria-label="戻る"
        >
          ← 戻る
        </button>
        <p style={{ fontSize: 14, color: 'var(--color-label)', fontWeight: 600, margin: 0 }}>💡 学びを追加</p>
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: 0, lineHeight: 1.7 }}>
        本以外の気づきも追加。会話・経験・観察など、日常の学びを記録すると、マイ読書脳がよりあなたらしい答えを返します。
      </p>

      <div>
        <label style={{ fontSize: 12, color: 'var(--c-ink-soft)', fontWeight: 500, display: 'block', marginBottom: 4 }}>カテゴリ</label>
        <p style={{ fontSize: 10, color: 'var(--c-ink-2)', margin: '0 0 6px' }}>気づきが生まれた場所を選んでください</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: 'pointer',
                border: category === c ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
                background: category === c ? 'var(--c-soft-2)' : 'transparent',
                color: category === c ? 'var(--c-ink)' : '#8a7e6b',
                fontWeight: category === c ? 600 : 400,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: 'var(--c-ink-soft)', fontWeight: 500, display: 'block', marginBottom: 4 }}>学んだ内容</label>
        <textarea
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

      <div>
        <label style={{ fontSize: 12, color: 'var(--c-ink-soft)', fontWeight: 500, display: 'block', marginBottom: 4 }}>タグ（任意）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {tags.map((t, i) => (
            <span key={`${t}-${i}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--c-soft-2)', color: 'var(--c-ink-2)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t}
              <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--c-ink-2)', cursor: 'pointer', padding: 0 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="タグを追加"
            style={{ ...inp, flex: 1 }}
            maxLength={LIMITS.tag}
          />
          <button type="button" onClick={addTag} style={btnGhost}>追加</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={{ ...btnGhost, flex: 1, minHeight: 44 }}>
          キャンセル
        </button>
        <button type="button" onClick={save} disabled={busy} style={{ ...btnPrimary, flex: 1, minHeight: 44, opacity: busy ? 0.6 : 1 }}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Main MyBookBrain component
// ============================================================================
export default function MyBookBrain({ onOpenBook, books = [], onAddAction, onBooksMutated, onAddActionPickBook }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState('chat'); // 'chat' | 'learning' | 'history' | 'knowledge'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // 🧠→🎯 回答の行動を、紐づく本の行動リストへ追加（成功時にトースト）。
  const handleAnswerToAction = useCallback(async (bookId, text) => {
    if (!onAddAction || !bookId || !text) return false;
    const ok = await onAddAction(bookId, { text, sourceMemoId: null, sourcePage: null });
    if (ok) toast.success('🎯 行動に追加しました');
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
  // 💭 今週の問い（能動化）— マイ読書脳が向こうから問いを投げる。週1キャッシュ。
  const [weeklyQ, setWeeklyQ] = useState(null);
  const [weeklyDismissed, setWeeklyDismissed] = useState(false);
  const weeklyTriedRef = useRef(false);
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
    el.style.height = Math.min(Math.max(el.scrollHeight, 60), 200) + 'px';
  }, [input]);

  const fetchHistory = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setHistoryLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('chat history fetch error:', error);
      setMessages([]);
    } else {
      setMessages((data || []).map(transformMessage));
    }
    setHistoryLoaded(true);
  }, [user]);

  // Load history once on user change.
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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
    const latest = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
    const cut = latest || new Date().toISOString();
    setClearedAt(cut);
    try { localStorage.setItem('brain-cleared-at', cut); } catch { /* ignore */ }
  }, [historyLoaded, messages]);

  // 💭 今週の問い — マイ読書脳を能動化（向こうから問いを投げる）。
  //   メモがある人にだけ、週1で AI が自分のメモ発の問いを 1 つ用意する。
  //   端末ローカルで週次キャッシュ（同じ週は再生成しない）。生成不可なら定型へ。
  //   その週に dismiss されたら出さない。新規ユーザー（メモ無し）には出さない。
  useEffect(() => {
    if (weeklyTriedRef.current || !historyLoaded) return;
    const hasMemos = (memoStats.cards + memoStats.summaries + memoStats.personal) > 0;
    if (!hasMemos) return; // memoStats 反映後に再評価される
    weeklyTriedRef.current = true;
    const wk = isoWeekKey();
    try {
      if (localStorage.getItem('brain-weekly-dismissed') === wk) { setWeeklyDismissed(true); return; }
      const raw = localStorage.getItem('brain-weekly-q');
      const cached = raw ? JSON.parse(raw) : null;
      if (cached && cached.week === wk && cached.q) { setWeeklyQ(cached.q); return; }
    } catch { /* ignore cache */ }
    let alive = true;
    (async () => {
      let q = null;
      try { q = await generateWeeklyQuestion(user.id); } catch { q = null; }
      if (!q) q = FALLBACK_WEEKLY[Math.abs(hashStr(wk)) % FALLBACK_WEEKLY.length];
      if (!alive) return;
      setWeeklyQ(q);
      try { localStorage.setItem('brain-weekly-q', JSON.stringify({ week: wk, q })); } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [historyLoaded, memoStats, user?.id]);

  const answerWeekly = useCallback(() => {
    if (!weeklyQ) return;
    setInput(weeklyQ);
    setTimeout(() => { try { inputRef.current?.focus(); } catch { /* ignore */ } }, 0);
  }, [weeklyQ]);

  const dismissWeekly = useCallback(() => {
    setWeeklyDismissed(true);
    try { localStorage.setItem('brain-weekly-dismissed', isoWeekKey()); } catch { /* ignore */ }
  }, []);

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

  const ask = async (questionText) => {
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

    setBusy(true);
    setAborting(false);
    setInput('');

    // 送信ごとに新しい AbortController。「中止」ボタンが abort() する。
    const controller = new AbortController();
    abortRef.current = controller;

    // Optimistic insert: show the user's message immediately.
    let userRow = null;
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert([{ user_id: user.id, role: 'user', content: q }])
        .select()
        .single();
      if (error) throw error;
      userRow = transformMessage(data);
      setMessages((arr) => [...arr, userRow]);
    } catch (e) {
      setBusy(false);
      toast.error(toMessage(e, 'メッセージの保存に失敗しました。'));
      return;
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
      const { body, refs, memoCount, memoTotal, cardCount, summaryCount, personalCount } = await streamMyBookBrain({
        userId: user.id,
        question: q,
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
      const assistantContent = wasAborted ? `${base}\n\n— ⏹ ここで中止しました` : base;
      const persistRefs = wasAborted ? [] : refs;
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
      if (!wasAborted) track(EVENTS.AI_USED, { feature: 'brain' });
      // 新しい AI 回答が来たら resolution prompt を再表示できるよう dismiss を解除
      setPromptDismissed(false);
    } catch (e) {
      // abort はエラーではない (streamMyBookBrain は正常 resolve するため通常
      // ここには来ないが、念のため abort 由来の例外はトーストしない)。
      if (!(controller.signal.aborted || (e && e.name === 'AbortError'))) {
        toast.error(toMessage(e, '回答の生成に失敗しました。'));
      }
      // 楽観的な streaming 行を error placeholder に差し替える。
      setMessages((arr) => arr.map((m) =>
        m.id === streamingId
          ? {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: controller.signal.aborted
                ? '回答を中止しました。'
                : '回答を生成できませんでした。少し時間をおいて再度お試しください。',
              refs: [],
              createdAt: new Date().toISOString(),
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
    }
  };

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
    toast.success('チャットをクリアしました。履歴タブから見返せます。');
  };

  // 「💬 続けて質問する」: プロンプトだけ閉じる。次の AI 回答までは再表示しない。
  const handleContinue = () => {
    setPromptDismissed(true);
  };

  const regenerate = async () => {
    // Find the last user message; resend it.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        await ask(messages[i].content);
        return;
      }
    }
  };

  const clearHistory = async () => {
    const ok = await confirm({
      title: '履歴を全て削除しますか？',
      message: 'マイ読書脳とのチャット履歴をすべて削除します。元に戻せません。',
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
      toast.success('履歴をクリアしました');
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

  return (
    <div style={wrap}>
      {/* 上部 (ヘッダー + pills) は固定領域。下の view 切替コンテンツが
          flex 1 で残りを埋める。 */}
      <div style={{ flexShrink: 0, padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Unified AI section header (AI 選書 と同じフォーマット) */}
      <div className="ai-section-header" style={{ padding: 0 }}>
        <h2>マイ読書脳</h2>
        <p className="subtitle">
          {(memoStats.cards + memoStats.summaries + memoStats.personal) > 0
            ? <>根拠にできる メモ {memoStats.cards} / まとめ {memoStats.summaries} / 学び {memoStats.personal} 件</>
            : '💡 質問は具体的に書くと精度が上がります'}
        </p>
      </div>

      {/* Action pills — 中央揃え + コンパクト padding。4 つで画面いっぱい
          広げず、中央に固める方がスッキリ見える。狭すぎたら overflow-x:
          auto で横スクロール許容も維持 (保険)。 */}
      <div
        className="lvg-no-scrollbar"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 4,
          padding: 3,
          background: 'var(--c-soft-2)',
          borderRadius: 10,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
        }}
      >
        <button type="button" style={{ ...pill(view === 'chat'), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setView('chat')}>
          <MessageCircle size={13} strokeWidth={1.75} aria-hidden="true" />質問
        </button>
        <button type="button" style={{ ...pill(view === 'learning'), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setView('learning')}>
          <Lightbulb size={13} strokeWidth={1.75} aria-hidden="true" />学び
        </button>
        <button type="button" style={{ ...pill(view === 'history'), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setView('history')}>
          <History size={13} strokeWidth={1.75} aria-hidden="true" />履歴
        </button>
        <button type="button" style={{ ...pill(view === 'knowledge'), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setView('knowledge')}>
          <BookOpenCheck size={13} strokeWidth={1.75} aria-hidden="true" />知識
        </button>
        <button type="button" style={{ ...pill(view === 'journey'), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setView('journey')}>
          <Clock size={13} strokeWidth={1.75} aria-hidden="true" />足あと
        </button>
      </div>
      </div>{/* /固定領域 (header + pills) */}

      {/* 🕰 知識の足あと（変遷追跡） */}
      {view === 'journey' && (
        <div style={viewScroll}>
          <KnowledgeJourney userId={user?.id} />
        </div>
      )}

      {/* Learning view (inline、旧 LearningSheet モーダルを置換) */}
      {view === 'learning' && (
        <div style={viewScroll}>
          <LearningInline
            onCancel={() => setView('chat')}
            onSaved={() => { setView('chat'); setStatsTick((t) => t + 1); }}
          />
        </div>
      )}

      {/* History view */}
      {view === 'history' && (
        <div style={viewScroll}>
        <PullToRefresh onRefresh={fetchHistory}>
          {/* 履歴は静的な過去ログなので live region にはしない (mount 時の
              過剰読み上げを避ける)。region + ラベルで構造だけ与える。 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="region" aria-label="過去の質問と回答">

            <div>
              <p style={{ fontSize: 13, color: 'var(--c-ink)', fontWeight: 600, margin: 0 }}>🕒 過去の質問と答え</p>
              <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '2px 0 0', lineHeight: 1.7 }}>
                気になる質問は再度開いて、答えを見返せます
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: 0 }}>会話 {messages.length} 件</p>
              {messages.length > 0 && (
                <button type="button" style={{ ...btnGhost, color: 'var(--c-critical)', borderColor: '#c4a0a0' }} onClick={clearHistory}>
                  すべて削除
                </button>
              )}
            </div>
            {!historyLoaded && <Spinner message="読み込み中…" />}
            {historyLoaded && messages.length === 0 && (
              <EmptyState
                icon="💬"
                title="まだ質問していません"
                description="左の「質問」タブから AI に話しかけてみましょう。"
              />
            )}
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} onOpenBook={onOpenBook} books={books} onAddAction={handleAnswerToAction} onAddActionPickBook={onAddActionPickBook} />
            ))}
          </div>
        </PullToRefresh>
        </div>
      )}

      {/* Knowledge management view */}
      {view === 'knowledge' && (
        <div style={viewScroll}>
          <KnowledgeManager onChanged={() => setStatsTick((t) => t + 1)} onBooksMutated={onBooksMutated} />
        </div>
      )}

      {/* Chat view — flex column で chat-scroll + ai-input-area の LINE
          風レイアウトを構成する。親 wrap が flex 1 / minHeight 0 で
          高さを与え、ここはそれを継承する。 */}
      {view === 'chat' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            ref={chatScrollRef}
            className="chat-scroll"
            style={{ padding: '0 0 12px' }}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="マイ読書脳との会話"
            aria-busy={busy}
          >
          {isEmpty && historyLoaded && (
            (memoStats.cards + memoStats.summaries + memoStats.personal) === 0 ? (
              // メモが 1 件もない時は、AI に質問させる前に「まず 1 冊メモを残そう」を
              // 先に促す。空のまま質問しても根拠がなく、体験が空振りするため。
              <div style={card}>
                <p style={{ fontSize: 13, color: 'var(--c-ink)', fontWeight: 600, margin: '0 0 8px' }}>
                  <Sprout size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  まずは1冊、メモを残すところから
                </p>
                <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', margin: 0, lineHeight: 1.8 }}>
                  本棚で1冊えらび、気になった一行を残してみましょう。<br />
                  メモがたまると、それを根拠に AI が答えてくれます。
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 💭 今週の問い — マイ読書脳が向こうから問いを投げる（能動化） */}
              {weeklyQ && !weeklyDismissed && (
                <div style={{ background: 'var(--c-soft)', border: '1px solid var(--c-hairline-strong)', borderRadius: 14, padding: '14px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-ink-3)', letterSpacing: '.14em' }}>
                      <MessageCircleQuestion size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5, letterSpacing: 0 }} />
                      今週の問い
                    </span>
                    <button
                      type="button"
                      onClick={dismissWeekly}
                      aria-label="今週の問いを閉じる"
                      style={{ background: 'none', border: 'none', color: '#b3a994', fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 4, fontFamily: 'inherit' }}
                    >×</button>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-ink)', margin: '0 0 12px', lineHeight: 1.6 }}>
                    {weeklyQ}
                  </p>
                  <button
                    type="button"
                    onClick={answerWeekly}
                    style={{ minHeight: 44, width: '100%', borderRadius: 11, border: 'none', background: 'var(--c-brand)', color: 'var(--c-card)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 1px 2px rgba(60,48,30,.18)' }}
                  >
                    この問いに答える →
                  </button>
                </div>
              )}
              <div style={card}>
                <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', margin: '0 0 8px', fontWeight: 500 }}>
                  <Lightbulb size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
                  質問例（タップで入力）
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {QUESTION_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setInput(ex)}
                      style={{
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        // タップしやすいよう 44px の最小高さを確保（iOS HIG）。
                        minHeight: 44,
                        padding: '8px 14px',
                        background: '#fff',
                        border: '1px solid var(--c-hairline)',
                        borderRadius: 10,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'var(--c-ink)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span aria-hidden="true" style={{ color: 'var(--c-ink-2)', flexShrink: 0 }}>›</span>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
              </div>
            )
          )}

          {!historyLoaded && <Spinner message="読み込み中…" />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleMessages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                onOpenBook={onOpenBook}
                stage={m.streaming ? stage : null}
                books={books}
                onAddAction={handleAnswerToAction}
                onAddActionPickBook={onAddActionPickBook}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {lastIsAssistant && !busy && visibleMessages.some((m) => m.role === 'user') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={regenerate} style={{ ...btnGhost, alignSelf: 'flex-start' }}>
                ↻ もう一度違う角度で答えて
              </button>

              {/* 解決しましたか? prompt — dismiss されていない時だけ出す。
                  「✅ 解決した」で chat をクリア (履歴は残る)、「💬 続けて質問する」で
                  プロンプトだけ閉じる。 */}
              {!promptDismissed && (
                <div
                  style={{
                    background: 'var(--c-card)',
                    border: '1px solid var(--c-hairline)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--c-ink)', fontWeight: 600, margin: 0 }}>
                    解決しましたか？
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: 0, lineHeight: 1.7 }}>
                    解決したらチャットをクリアして次の質問に集中できます。履歴タブからいつでも見返せます。
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleResolveAndClear}
                      style={{
                        ...btnPrimary,
                        padding: '8px 14px',
                        fontSize: 13,
                        letterSpacing: 0,
                        minHeight: 40,
                      }}
                    >
                      ✅ 解決した
                    </button>
                    <button
                      type="button"
                      onClick={handleContinue}
                      style={{ ...btnGhost, minHeight: 40, padding: '8px 14px' }}
                    >
                      💬 続けて質問する
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>{/* /chat-scroll */}

          {/* Input area — flex 末尾。.ai-page (100dvh flex) の構造で
              キーボード直上 / BottomNav 直上に自動で張り付く (LINE 風)。
              Enter = 改行 / Shift+Enter or Cmd+Enter = 送信 / IME ガード継続。 */}
          <div className="ai-input-area">
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
              placeholder="質問...（送信ボタン / ⌘・Ctrl+Enter で送信）"
              rows={1}
              disabled={busy}
              maxLength={LIMITS.aiQuestion}
              aria-label="マイ読書脳への質問"
            />
            {busy ? (
              // ストリーミング中は送信ボタンを「中止」ボタンに切り替える。
              // 押すと現在の生成を止め、その時点の内容で確定する。
              <button
                type="button"
                className="send-btn stop-btn"
                onClick={stopStreaming}
                disabled={aborting}
                aria-label={aborting ? '中止しています' : '回答を中止'}
                title={aborting ? '中止しています…' : '回答を中止'}
              >
                {/* ■ 停止アイコン (四角)。アクセシビリティは aria-label で担保。 */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12 22 2 13 22 11 13 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 旧 LearningSheet (modal) は撤去。学びの追加は view === 'learning' の
          <LearningInline /> で対応。 */}
    </div>
  );
}

const STAGE_LABEL = {
  search: 'あなたのメモを読み込み中…',
  generate: 'あなた専用の回答を生成中…',
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
    parts.push(<strong key={i} style={{ color: '#1f1b14' }}>{m[1]}</strong>);
    cursor = m.index + m[0].length;
    i += 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}

// マイ読書脳の回答（【結論】【参照した本のメモ】…の構造）を、素のテキストダンプ
// ではなく「設計された回答」に見せる。【】の見出しは小さなアクセントのラベルに、
// 本文は読みやすい段落に。** は太字化。空行は余白で吸収。
function FormattedAnswer({ text }) {
  const lines = (text || '').split('\n');
  const out = [];
  lines.forEach((line, idx) => {
    const h = line.match(/^【(.+?)】\s*(.*)$/);
    if (h) {
      out.push(
        <p key={`h${idx}`} style={{ fontSize: 11, color: '#8a7c5f', fontWeight: 700, letterSpacing: '0.06em', margin: out.length ? '13px 0 0' : 0 }}>
          {h[1]}
        </p>,
      );
      if (h[2]) out.push(<p key={`b${idx}`} style={{ margin: '3px 0 0', lineHeight: 1.85 }}>{renderBoldInline(h[2])}</p>);
      return;
    }
    if (!line.trim()) return;
    out.push(<p key={`p${idx}`} style={{ margin: '4px 0 0', lineHeight: 1.85 }}>{renderBoldInline(line)}</p>);
  });
  return <>{out}</>;
}

// 回答末尾の「【明日からできる 1 つの行動】」セクション本文を取り出す。
// 見出しが崩れても空振りしないよう、見出しが無ければ「行動」を含む最終文へ。
function extractActionLine(text) {
  if (!text || typeof text !== 'string') return '';
  const m = text.match(/【\s*明日からできる[^】]*】\s*([\s\S]*?)(?:\n\s*【|REFS_START|$)/);
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
    .trim()
    .slice(0, 280);
}

// チャット回答の参照（📚 著者『書名』…）から、行動を紐づける本を解決する。
// クロスブックなので最初に一致した本へ。完全一致 → 部分一致の順。
function resolveActionBookId(refs, books) {
  if (!Array.isArray(refs) || !Array.isArray(books) || books.length === 0) return null;
  for (const r of refs) {
    const tm = String(r).match(/『([^』]+)』/);
    if (!tm) continue;
    const title = tm[1].trim();
    if (!title) continue;
    const exact = books.find((b) => (b.title || '').trim() === title);
    if (exact) return exact.id;
    const partial = books.find((b) => (b.title || '').trim() && title.includes((b.title || '').trim()));
    if (partial) return partial.id;
  }
  return null;
}

function ChatMessage({ message, onOpenBook, stage, books, onAddAction, onAddActionPickBook }) {
  const isUser = message.role === 'user';
  const isStreaming = !!message.streaming;
  const bubbleStyle = {
    maxWidth: '90%',
    // AI の回答は読み物なので少しゆとりを持たせる。ユーザー吹き出しは
    // 短文が多いので従来通りタイト。
    padding: isUser ? '10px 14px' : '12px 15px',
    borderRadius: 14,
    fontSize: 14,
    // 長文（特に日本語）の可読性を優先。.long-text 相当の行間 + 微字間。
    lineHeight: isUser ? 1.7 : 1.85,
    letterSpacing: '0.01em',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    // AI 吹き出しはわずかな影で背景から浮かせ、読み出しの起点を明確にする。
    background: isUser ? 'var(--c-brand)' : '#fbf8f2',
    color: isUser ? 'var(--c-card)' : '#332d23',
    border: isUser ? 'none' : '1px solid #ece5d8',
    boxShadow: isUser ? 'none' : '0 1px 2px rgba(60,54,44,0.04)',
    borderBottomRightRadius: isUser ? 4 : 14,
    borderBottomLeftRadius: isUser ? 14 : 4,
  };

  // 本文がまだ無い (= stream 開始前) は段階ステータス + skeleton を出して
  // 「何かが進んでいる」を視覚化する。本文が届き始めたら本文 + 点滅カーソル
  // に切り替え、stage は隠す。
  const hasBody = typeof message.content === 'string' && message.content.length > 0;
  const showStageBlock = isStreaming && !hasBody;

  // 🧠→🎯 回答の「明日からできる1つの行動」を、紐づく本の行動リストへ1タップ追加。
  const [actionAdded, setActionAdded] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const canAct = !isUser && !isStreaming && (!!onAddAction || !!onAddActionPickBook);
  const actionLine = canAct ? extractActionLine(message.content) : '';
  // 参照メモから本を特定できれば直接その本へ。特定できない一般回答は、
  // 本選択シート（onAddActionPickBook）へフォールバックして行動化できる
  // ようにする（「明日の一歩」が宙に浮かないように）。
  const actionBookId = actionLine && onAddAction ? resolveActionBookId(message.refs, books) : null;
  const canShowAction = !!actionLine && (!!actionBookId || !!onAddActionPickBook);
  const handleAddAction = async () => {
    if (!actionLine || actionBusy) return;
    if (actionBookId && onAddAction) {
      setActionBusy(true);
      const ok = await onAddAction(actionBookId, actionLine);
      setActionBusy(false);
      if (ok) setActionAdded(true);
    } else if (onAddActionPickBook) {
      // 本を特定できない → 本選択シートを開いて行動文をプレフィル。実際の追加は
      // ユーザーが本を選んで確定した時点で行われるので、ここでは済み表示にしない。
      onAddActionPickBook(actionLine);
    }
  };

  return (
    <div
      style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}
      role="article"
      aria-label={isUser ? 'あなたの質問' : 'マイ読書脳の回答'}
      // ストリーミング中は aria-busy=true。読み上げの過剰更新を抑え、
      // 完了 (busy=false) 時にまとまった本文として読まれるようにする。
      aria-busy={isStreaming || undefined}
    >
      <div style={bubbleStyle}>
        {showStageBlock ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 親が role="log" aria-live なので、ここで二重に live 領域を
                作らない (aria-live を外す)。状態テキストは親が拾う。 */}
            <div className="ai-thinking">
              <span className="ai-thinking-dot" aria-hidden="true" />
              <span>{STAGE_LABEL[stage] || '回答を準備中…'}</span>
            </div>
            <div className="ai-skeleton" aria-hidden="true">
              <div className="ai-skeleton-line" style={{ width: '88%' }} />
              <div className="ai-skeleton-line" style={{ width: '74%' }} />
              <div className="ai-skeleton-line" style={{ width: '62%' }} />
            </div>
          </div>
        ) : isUser ? (
          message.content
        ) : isStreaming ? (
          <>
            {message.content}
            {hasBody && <span className="streaming-cursor" aria-hidden="true" />}
          </>
        ) : (
          // 完了した回答は構造化して「設計された回答」に。ストリーミング中は
          // 途中の【】を誤組みしないよう素の本文のまま流す。
          <FormattedAnswer text={message.content} />
        )}
        {!isUser && !isStreaming && message.refs?.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #d8d0c1' }}>
            <p style={{ fontSize: 11, color: '#8a7c5f', margin: '0 0 6px', fontWeight: 700, letterSpacing: '0.06em' }}>
              参照した本・メモ
            </p>
            <ul style={{ fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.75, margin: 0, paddingLeft: 16 }}>
              {message.refs.map((r, i) => (
                <li key={i} style={{ marginTop: i === 0 ? 0 : 3 }}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {/* 🧠→🎯 回答の「明日の1つの行動」を、その場で🎯行動リストへ */}
        {canAct && canShowAction && (
          <div style={{ marginTop: 12 }}>
            {actionAdded ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--c-brand)' }}>
                <Check size={15} aria-hidden="true" />
                行動リストに追加しました
              </span>
            ) : (
              <button
                type="button"
                onClick={handleAddAction}
                disabled={actionBusy}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  minHeight: 44, padding: '8px 16px', borderRadius: 10,
                  border: '1px solid var(--c-brand)', background: 'transparent',
                  color: 'var(--c-brand)', fontSize: 13, fontWeight: 700,
                  fontFamily: 'inherit', cursor: actionBusy ? 'default' : 'pointer',
                  opacity: actionBusy ? 0.6 : 1,
                }}
              >
                <Target size={15} aria-hidden="true" />
                この行動をやってみる
              </button>
            )}
          </div>
        )}
        {!isStreaming && (
          <p style={{ fontSize: 9, color: isUser ? 'rgba(250,246,240,0.6)' : '#a89e8c', margin: '6px 0 0' }}>
            {fmtDate(message.createdAt)}
          </p>
        )}
      </div>
    </div>
  );
}
