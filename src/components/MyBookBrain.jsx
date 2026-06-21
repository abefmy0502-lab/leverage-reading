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
import { streamMyBookBrain } from '../lib/ai';
import { LIMITS } from '../lib/limits';
import Spinner from './Spinner';
import KnowledgeManager from './KnowledgeManager';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import { MessageCircle, Lightbulb, History, BookOpenCheck } from 'lucide-react';

// AI tab の .ai-page-body (flex 1, overflow hidden) の中にぴったり
// 収める flex column。chat 時は内側 .chat-scroll + .ai-input-area で
// LINE 風レイアウト、それ以外 (learning/history/knowledge) は普通の
// 縦スクロールフォーム / リスト。padding は各 view 内側で管理する。
const wrap = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' };
// chat 以外の view 共通: ヘッダ/pill 下にスクロール可能な領域を提供。
const viewScroll = { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 16px 24px' };
const card = { background: '#faf6f0', border: '1px solid #e4ddd0', borderRadius: 12, padding: '12px 14px' };
const inp = { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid #d4ccbe', borderRadius: 10, background: '#fff', color: '#3d362c', fontFamily: 'inherit', boxSizing: 'border-box' };
const ta = { ...inp, resize: 'vertical', minHeight: 200, lineHeight: 1.7 };
const btnPrimary = { padding: '12px 20px', borderRadius: 10, border: 'none', background: '#5c5043', color: '#faf6f0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, letterSpacing: 1 };
const btnGhost = { padding: '8px 12px', borderRadius: 8, border: '1px solid #d4ccbe', background: 'transparent', color: '#5c5043', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 };
const pill = (active) => ({
  // Sized to content so labels never wrap; row scrolls horizontally on
  // narrow phones via the parent's overflow-x: auto + lvg-no-scrollbar.
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
  minHeight: 36,
  padding: '6px 10px',
  border: 'none',
  background: active ? '#5c5043' : 'transparent',
  color: active ? '#faf6f0' : '#5c5548',
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
        <label style={{ fontSize: 12, color: '#5c5548', fontWeight: 500, display: 'block', marginBottom: 4 }}>カテゴリ</label>
        <p style={{ fontSize: 10, color: '#a89e8c', margin: '0 0 6px' }}>気づきが生まれた場所を選んでください</p>
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
                border: category === c ? '1.5px solid #5c5043' : '1px solid #d4ccbe',
                background: category === c ? '#eae3d6' : 'transparent',
                color: category === c ? '#3d362c' : '#8a7e6b',
                fontWeight: category === c ? 600 : 400,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: '#5c5548', fontWeight: 500, display: 'block', marginBottom: 4 }}>学んだ内容</label>
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
        <label style={{ fontSize: 12, color: '#5c5548', fontWeight: 500, display: 'block', marginBottom: 4 }}>タグ（任意）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {tags.map((t, i) => (
            <span key={`${t}-${i}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#eae3d6', color: '#7a6e58', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t}
              <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', fontSize: 12, color: '#a89e8c', cursor: 'pointer', padding: 0 }}>×</button>
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
export default function MyBookBrain({ onOpenBook }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState('chat'); // 'chat' | 'learning' | 'history' | 'knowledge'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
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
    setInput('');

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

    try {
      const { body, refs, memoCount, memoTotal, cardCount, summaryCount, personalCount } = await streamMyBookBrain({
        userId: user.id,
        question: q,
        onStage: (s) => setStage(s),
        onChunk: (visibleText) => {
          // 最初の delta が来た瞬間に stage を消して本文表示に切り替える。
          setStage(null);
          setMessages((arr) => arr.map((m) =>
            m.id === streamingId
              ? { ...m, content: visibleText, streaming: true }
              : m
          ));
        },
      });
      const breakdown = `カード ${cardCount || 0} / まとめ ${summaryCount || 0} / 学び ${personalCount || 0}`;
      const assistantContent = memoTotal > memoCount && memoCount > 0
        ? `${body}\n\n（参照: ${memoCount}/${memoTotal} 件、内訳: ${breakdown}）`
        : body;
      const { data, error } = await supabase
        .from('chat_messages')
        .insert([{ user_id: user.id, role: 'assistant', content: assistantContent, refs }])
        .select()
        .single();
      if (error) throw error;
      // 楽観的な streaming 行を、永続化された row で差し替える。
      setMessages((arr) => arr.map((m) => (m.id === streamingId ? transformMessage(data) : m)));
      // 新しい AI 回答が来たら resolution prompt を再表示できるよう dismiss を解除
      setPromptDismissed(false);
    } catch (e) {
      toast.error(toMessage(e, '回答の生成に失敗しました。'));
      // 楽観的な streaming 行を error placeholder に差し替える。
      setMessages((arr) => arr.map((m) =>
        m.id === streamingId
          ? {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: '回答を生成できませんでした。少し時間をおいて再度お試しください。',
              refs: [],
              createdAt: new Date().toISOString(),
            }
          : m
      ));
      setPromptDismissed(false);
    } finally {
      setStage(null);
      setBusy(false);
    }
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
      await supabase.from('chat_messages').delete().eq('user_id', user.id);
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
        <h2>🧠 マイ読書脳</h2>
        <p className="subtitle">
          あなたが読んだ本の知識から、あなた専用の答えが返ってきます
          {(memoStats.cards + memoStats.summaries + memoStats.personal) > 0 && (
            <>（メモ {memoStats.cards} / まとめ {memoStats.summaries} / 学び {memoStats.personal}）</>
          )}
        </p>
        <p className="subtitle" style={{ marginTop: 4 }}>
          💡 質問は具体的に書くと精度が上がります
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
          background: '#eae3d6',
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
      </div>
      </div>{/* /固定領域 (header + pills) */}

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 600, margin: 0 }}>🕒 過去の質問と答え</p>
              <p style={{ fontSize: 11, color: '#8a7e6b', margin: '2px 0 0', lineHeight: 1.7 }}>
                気になる質問は再度開いて、答えを見返せます
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 12, color: '#8a7e6b', margin: 0 }}>会話 {messages.length} 件</p>
              {messages.length > 0 && (
                <button type="button" style={{ ...btnGhost, color: '#a05040', borderColor: '#c4a0a0' }} onClick={clearHistory}>
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
              <ChatMessage key={m.id} message={m} onOpenBook={onOpenBook} />
            ))}
          </div>
        </PullToRefresh>
        </div>
      )}

      {/* Knowledge management view */}
      {view === 'knowledge' && (
        <div style={viewScroll}>
          <KnowledgeManager onChanged={() => setStatsTick((t) => t + 1)} />
        </div>
      )}

      {/* Chat view — flex column で chat-scroll + ai-input-area の LINE
          風レイアウトを構成する。親 wrap が flex 1 / minHeight 0 で
          高さを与え、ここはそれを継承する。 */}
      {view === 'chat' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div ref={chatScrollRef} className="chat-scroll" style={{ padding: '0 0 12px' }}>
          {isEmpty && historyLoaded && (
            (memoStats.cards + memoStats.summaries + memoStats.personal) === 0 ? (
              // メモが 1 件もない時は、AI に質問させる前に「まず 1 冊メモを残そう」を
              // 先に促す。空のまま質問しても根拠がなく、体験が空振りするため。
              <div style={card}>
                <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 600, margin: '0 0 8px' }}>
                  🌱 まずは1冊、メモを残すところから
                </p>
                <p style={{ fontSize: 12, color: '#5c5548', margin: 0, lineHeight: 1.8 }}>
                  マイ読書脳は、あなた自身のメモを根拠に答えます。<br />
                  本棚で1冊えらび、気になった一行を残してみてください。メモが増えるほど、あなただけの AI に育っていきます。
                </p>
                {onOpenBook && (
                  <p style={{ fontSize: 11, color: '#8a7e6b', margin: '10px 0 0', lineHeight: 1.7 }}>
                    （メモがたまると、ここで質問に答えられるようになります）
                  </p>
                )}
              </div>
            ) : (
              <div style={card}>
                <p style={{ fontSize: 12, color: '#5c5548', margin: '0 0 8px', fontWeight: 500 }}>💡 質問例（タップで入力）</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {QUESTION_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setInput(ex)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: '#fff',
                        border: '1px solid #e4ddd0',
                        borderRadius: 8,
                        fontSize: 13,
                        color: '#3d362c',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {ex}
                    </button>
                  ))}
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
                    background: '#faf6f0',
                    border: '1px solid #e4ddd0',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 600, margin: 0 }}>
                    解決しましたか？
                  </p>
                  <p style={{ fontSize: 11, color: '#8a7e6b', margin: 0, lineHeight: 1.7 }}>
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
              placeholder="質問..."
              rows={1}
              disabled={busy}
              maxLength={LIMITS.aiQuestion}
              aria-label="マイ読書脳への質問"
            />
            <button
              type="button"
              className="send-btn"
              onClick={() => ask()}
              disabled={busy || !input.trim()}
              aria-label={busy ? '送信中' : '送信'}
              title={busy ? '送信中…' : '送信'}
            >
              {busy ? (
                <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 600 }}>…</span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12 22 2 13 22 11 13 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 旧 LearningSheet (modal) は撤去。学びの追加は view === 'learning' の
          <LearningInline /> で対応。 */}
    </div>
  );
}

const STAGE_LABEL = {
  search: '📚 過去の本を検索中…',
  generate: '🧠 あなた専用の回答を生成中…',
};

function ChatMessage({ message, onOpenBook, stage }) {
  const isUser = message.role === 'user';
  const isStreaming = !!message.streaming;
  const bubbleStyle = {
    maxWidth: '90%',
    padding: '10px 14px',
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 1.8,
    whiteSpace: 'pre-wrap',
    background: isUser ? '#5c5043' : '#f7f3ec',
    color: isUser ? '#faf6f0' : '#3d362c',
    borderBottomRightRadius: isUser ? 4 : 14,
    borderBottomLeftRadius: isUser ? 14 : 4,
  };

  // 本文がまだ無い (= stream 開始前) は段階ステータス + skeleton を出して
  // 「何かが進んでいる」を視覚化する。本文が届き始めたら本文 + 点滅カーソル
  // に切り替え、stage は隠す。
  const hasBody = typeof message.content === 'string' && message.content.length > 0;
  const showStageBlock = isStreaming && !hasBody;

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={bubbleStyle}>
        {showStageBlock ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="ai-thinking" aria-live="polite">
              <span className="ai-thinking-dot" aria-hidden="true" />
              <span>{STAGE_LABEL[stage] || '🧠 回答を準備中…'}</span>
            </div>
            <div className="ai-skeleton" aria-hidden="true">
              <div className="ai-skeleton-line" style={{ width: '88%' }} />
              <div className="ai-skeleton-line" style={{ width: '74%' }} />
              <div className="ai-skeleton-line" style={{ width: '62%' }} />
            </div>
          </div>
        ) : (
          <>
            {message.content}
            {isStreaming && hasBody && <span className="streaming-cursor" aria-hidden="true" />}
          </>
        )}
        {!isUser && !isStreaming && message.refs?.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #d4ccbe' }}>
            <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 4px', fontWeight: 500 }}>
              📚 参照した本・メモ
            </p>
            <ul style={{ fontSize: 11, color: '#5c5548', lineHeight: 1.7, margin: 0, paddingLeft: 16 }}>
              {message.refs.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
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
