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
import { MessageCircle, Lightbulb, History, BookOpenCheck } from 'lucide-react';

const wrap = { padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 };
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
  minHeight: 40,
  padding: '8px 14px',
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
// Personal Learning Entry Sheet
// ============================================================================
function LearningSheet({ onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [busy, setBusy] = useState(false);
  const taRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    setTimeout(() => taRef.current?.focus(), 80);
  }, []);

  // Keyboard push-up via visualViewport (same pattern as QuickMemoSheet).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const apply = () => {
      if (!sheetRef.current) return;
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheetRef.current.style.transform = offset > 60 ? `translateY(-${offset}px)` : '';
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

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
      // Category is stored as a "@cat" tag prefix so it travels with the memo
      // through the Review tab and AI prompt without needing a separate column.
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
      onClose?.();
    } catch (e) {
      toast.error(toMessage(e, '保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(30,25,20,0.4)', zIndex: 700, WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 701,
          background: '#faf6f0',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.10)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          fontFamily: "'Noto Serif JP', Georgia, serif",
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="lvg-sheet-handle" aria-hidden="true" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 14px', borderBottom: '1px solid #e4ddd0' }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#5c5043', cursor: 'pointer', width: 44, height: 44, padding: 0 }} aria-label="閉じる">
            ✕
          </button>
          <p style={{ fontSize: 14, color: '#3d362c', fontWeight: 500, margin: 0 }}>💡 学びを追加</p>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <p style={{ fontSize: 11, color: '#a89e8c', margin: 0, lineHeight: 1.7 }}>
            本以外の気づき（会話・経験・観察など）を記録します。マイ読書脳の AI に「あなたの体験」として渡されます。
          </p>

          <div>
            <label style={{ fontSize: 12, color: '#5c5548', fontWeight: 500, display: 'block', marginBottom: 4 }}>カテゴリ（任意）</label>
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
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
              }}
              placeholder={'例:\n・先輩との会話で「相手の関心軸を聞く」が刺さった\n・上司の指摘で「結論ファースト」の重要性を再認識'}
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
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid #e4ddd0' }}>
          <button type="button" onClick={onClose} style={{ ...btnGhost, flex: 1, minHeight: 44 }}>
            キャンセル
          </button>
          <button type="button" onClick={save} disabled={busy} style={{ ...btnPrimary, flex: 1, minHeight: 44, opacity: busy ? 0.6 : 1 }}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Main MyBookBrain component
// ============================================================================
export default function MyBookBrain({ onOpenBook }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState('chat'); // 'chat' | 'history' | 'knowledge'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [memoStats, setMemoStats] = useState({ cards: 0, summaries: 0, personal: 0 });
  const [statsTick, setStatsTick] = useState(0);
  const messagesEndRef = useRef(null);

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
  }, [user, learningOpen, messages.length, statsTick]);

  // Auto-scroll only when a NEW message is appended — not on tab open or on
  // history load. Otherwise opening the brain tab with prior history would
  // jump the page down to the latest message.
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (view !== 'chat') return;
    if (messages.length <= prev) return; // initial load or shrink → don't scroll
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }),
      30
    );
  }, [messages, view]);

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
      {/* Hero / explanation */}
      <div style={{ ...card, background: 'linear-gradient(135deg, #faf6f0 0%, #f0ebe2 100%)' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#3d362c', margin: 0 }}>🧠 マイ読書脳</p>
        <p style={{ fontSize: 11, color: '#8a7e6b', margin: '4px 0 0', lineHeight: 1.7 }}>
          過去に読んだ本の知恵があなたに答えます。
          {(memoStats.cards + memoStats.summaries + memoStats.personal) > 0 && (
            <>（メモ {memoStats.cards} 件 + まとめ {memoStats.summaries} 冊 + 学び {memoStats.personal} 件 を参照可能）</>
          )}
        </p>
      </div>

      {/* Action pills — horizontally scroll on narrow phones, no text wrap. */}
      <div
        className="lvg-no-scrollbar"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: '#eae3d6',
          borderRadius: 10,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
        }}
      >
        <button type="button" style={{ ...pill(view === 'chat'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setView('chat')}>
          <MessageCircle size={14} strokeWidth={1.75} aria-hidden="true" />質問する
        </button>
        <button type="button" style={{ ...pill(false), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setLearningOpen(true)}>
          <Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" />学びを追加
        </button>
        <button type="button" style={{ ...pill(view === 'history'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setView('history')}>
          <History size={14} strokeWidth={1.75} aria-hidden="true" />履歴
        </button>
        <button type="button" style={{ ...pill(view === 'knowledge'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setView('knowledge')}>
          <BookOpenCheck size={14} strokeWidth={1.75} aria-hidden="true" />知識管理
        </button>
      </div>

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
              <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: '20px 0' }}>
                まだ会話がありません。「💬 質問する」から始めましょう。
              </p>
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
                <p style={{ fontSize: 11, color: '#a05040', marginTop: 10, lineHeight: 1.6 }}>
                  まだメモが 1 件もありません。本を読んでメモを書くと、マイ読書脳が学習しはじめます。
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

          {/* Input area */}
          <div style={{ display: 'flex', gap: 6, position: 'sticky', bottom: 0, paddingTop: 8 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
                else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask();
                }
              }}
              placeholder="質問を入力（Enter で送信、Shift+Enter で改行）"
              rows={2}
              disabled={busy}
              maxLength={LIMITS.aiQuestion}
              style={{ ...ta, minHeight: 56, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => ask()}
              disabled={busy || !input.trim()}
              style={{ ...btnPrimary, opacity: busy || !input.trim() ? 0.5 : 1, alignSelf: 'flex-end', minHeight: 44 }}
              aria-label="送信"
            >
              送信
            </button>
          </div>
        </>
      )}

      {learningOpen && (
        <LearningSheet
          onClose={() => setLearningOpen(false)}
          onSaved={() => {
            // Memo count refresh handled by the effect above.
          }}
        />
      )}
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
