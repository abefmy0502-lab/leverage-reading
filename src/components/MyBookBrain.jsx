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
import { callMyBookBrain } from '../lib/ai';
import { LIMITS } from '../lib/limits';
import Spinner from './Spinner';
import KnowledgeManager from './KnowledgeManager';
import PullToRefresh from './PullToRefresh';
import EmptyState from './EmptyState';
import { MessageCircle, Lightbulb, History, BookOpenCheck } from 'lucide-react';

// padding-bottom は fixed の .ai-input-area (高さ ~76px) +
// BottomNav (56px) + safe-area の合計分を予約。chat/learning 等の
// content が input の裏に隠れないようにするため。
const wrap = { padding: '12px 16px calc(160px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12 };
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
        本以外の気づき（会話・経験・観察など）を記録します。マイ読書脳の AI に「あなたの体験」として渡されます。
      </p>

      <div>
        <label style={{ fontSize: 12, color: '#5c5548', fontWeight: 500, display: 'block', marginBottom: 4 }}>カテゴリ</label>
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
          placeholder="今日の学びを入力..."
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
  const [historyLoaded, setHistoryLoaded] = useState(false);
  // learningOpen state は廃止 — view === 'learning' で表現する。
  const [memoStats, setMemoStats] = useState({ cards: 0, summaries: 0, personal: 0 });
  const [statsTick, setStatsTick] = useState(0);
  const messagesEndRef = useRef(null);
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

  // Knowledge counts for the header (cards / summaries / personal).
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return undefined;
    let cancelled = false;
    (async () => {
      const [cardsRes, personalRes, summariesRes] = await Promise.all([
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
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .not('leverage_memo', 'is', null)
          .neq('leverage_memo', ''),
      ]);
      if (cancelled) return;
      setMemoStats({
        cards: cardsRes.count || 0,
        personal: personalRes.count || 0,
        summaries: summariesRes.count || 0,
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
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }),
      30,
    );
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

    try {
      const { body, refs, memoCount, memoTotal, cardCount, summaryCount, personalCount } = await callMyBookBrain({
        userId: user.id,
        question: q,
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
      setMessages((arr) => [...arr, transformMessage(data)]);
    } catch (e) {
      toast.error(toMessage(e, '回答の生成に失敗しました。'));
      // Insert a placeholder error message so the chat doesn't dangle.
      const fallback = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: '回答を生成できませんでした。少し時間をおいて再度お試しください。',
        refs: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((arr) => [...arr, fallback]);
    } finally {
      setBusy(false);
    }
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

  const isEmpty = messages.length === 0;
  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1].role === 'assistant';

  return (
    <div style={wrap}>
      {/* Unified AI section header (AI 選書 と同じフォーマット) */}
      <div className="ai-section-header" style={{ padding: 0 }}>
        <h2>🧠 マイ読書脳</h2>
        <p className="subtitle">
          過去に読んだ本の知恵があなたに答えます
          {(memoStats.cards + memoStats.summaries + memoStats.personal) > 0 && (
            <>（メモ {memoStats.cards} / まとめ {memoStats.summaries} / 学び {memoStats.personal}）</>
          )}
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

      {/* Learning view (inline、旧 LearningSheet モーダルを置換) */}
      {view === 'learning' && (
        <LearningInline
          onCancel={() => setView('chat')}
          onSaved={() => { setView('chat'); setStatsTick((t) => t + 1); }}
        />
      )}

      {/* History view */}
      {view === 'history' && (
        <PullToRefresh onRefresh={fetchHistory}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                title="まだ会話がありません"
                description="「💬 質問する」から、過去の本と対話を始めましょう。"
              />
            )}
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} onOpenBook={onOpenBook} />
            ))}
          </div>
        </PullToRefresh>
      )}

      {/* Knowledge management view */}
      {view === 'knowledge' && (
        <KnowledgeManager onChanged={() => setStatsTick((t) => t + 1)} />
      )}

      {/* Chat view */}
      {view === 'chat' && (
        <>
          {isEmpty && historyLoaded && (
            <div style={card}>
              <p style={{ fontSize: 12, color: '#5c5548', margin: '0 0 8px', fontWeight: 500 }}>💡 質問例</p>
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
              {memoStats.count === 0 && (
                <p style={{ fontSize: 11, color: '#a05040', marginTop: 10, lineHeight: 1.7 }}>
                  まだメモが 1 件もありません。本を読んでメモを書くほど、マイ読書脳があなただけの AI に育っていきます 🌱
                </p>
              )}
            </div>
          )}

          {!historyLoaded && <Spinner message="読み込み中…" />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} onOpenBook={onOpenBook} />
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '10px 14px', background: '#f7f3ec', borderRadius: 14, borderBottomLeftRadius: 4 }}>
                <p style={{ fontSize: 12, color: '#8a7e6b', margin: 0 }}>分析中… 過去の本を参照しています</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {lastIsAssistant && !busy && messages.some((m) => m.role === 'user') && (
            <button type="button" onClick={regenerate} style={{ ...btnGhost, alignSelf: 'flex-start' }}>
              ↻ もう一度違う角度で答えて
            </button>
          )}

          {/* Input area — sticky 底辺、BottomNav 上に乗る。Enter = 改行、
              Shift+Enter / Cmd+Enter = 送信、IME 中は無視。 */}
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
              placeholder="質問を入力..."
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
              aria-label="送信"
            >
              {busy ? '送信中…' : '送信 →'}
            </button>
          </div>
        </>
      )}

      {/* 旧 LearningSheet (modal) は撤去。学びの追加は view === 'learning' の
          <LearningInline /> で対応。 */}
    </div>
  );
}

function ChatMessage({ message, onOpenBook }) {
  const isUser = message.role === 'user';
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

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={bubbleStyle}>
        {message.content}
        {!isUser && message.refs?.length > 0 && (
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
        <p style={{ fontSize: 9, color: isUser ? 'rgba(250,246,240,0.6)' : '#a89e8c', margin: '6px 0 0' }}>
          {fmtDate(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
