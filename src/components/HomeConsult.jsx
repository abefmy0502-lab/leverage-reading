// 💬 本棚ホーム最上段の「相談する」入口。
//
// Orime の一番の価値＝「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を、
// アプリを開いた瞬間に見せるためのカード。ここで書いた困りごとは「相談」タブの
// 🧠 マイ読書脳へそのまま渡して送信する（onAsk）。
// 「あなたの本 N 冊・メモ N 件から答えます」で、積み重ね＝相談の質を毎回伝える。
//   - 本 0 冊: 出さない（本棚の空状態と「はじめの一歩」が案内する）
//   - メモ 0 件: 入力欄の代わりに予告と「これまで読んだ本から始める」（初日クイックスタート）
import { useEffect, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { LIMITS } from '../lib/limits';
import { track } from '../lib/analytics';

export default function HomeConsult({ books = [], onAsk, onQuickstart }) {
  const { user } = useAuth();
  const [memoCount, setMemoCount] = useState(null);
  const [text, setText] = useState('');
  const bookCount = books.length;

  useEffect(() => {
    if (!user || !isSupabaseConfigured || bookCount === 0) return undefined;
    let alive = true;
    (async () => {
      try {
        const { count, error } = await supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (alive && !error) setMemoCount(count || 0);
      } catch { /* 件数が取れなくても入口自体は出す */ }
    })();
    return () => { alive = false; };
  }, [user, bookCount]);

  if (bookCount === 0) return null;

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    track('home_consult_sent');
    onAsk?.(q);
    setText('');
  };

  const hasMemos = memoCount == null || memoCount > 0;

  return (
    <section
      aria-label="相談する"
      className="list-item-enter"
      style={{
        marginBottom: 14,
        padding: '14px 14px 12px',
        background: 'var(--c-card)',
        border: '1px solid var(--c-hairline)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 1px 2px rgba(60, 50, 30, 0.04)',
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <MessageCircle size={17} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
        困ったときは、相談する
      </h2>
      <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: '4px 0 10px', lineHeight: 1.6 }}>
        {hasMemos
          ? <>あなたが読んだ <strong style={{ color: 'var(--c-ink)' }}>{bookCount}冊</strong>{memoCount != null && <>・メモ <strong style={{ color: 'var(--c-ink)' }}>{memoCount}件</strong></>} から答えます</>
          : '本を読みながらメモを残すと、そのメモを根拠に、あなただけの答えが返ってくるようになります。'}
      </p>
      {!hasMemos && onQuickstart && (
        <button
          type="button"
          onClick={onQuickstart}
          style={{
            width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--c-hairline-strong)', background: 'var(--c-soft)', color: 'var(--c-ink)',
            fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          📚 これまで読んだ本の「覚えていること」から始める
        </button>
      )}
      {hasMemos && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={LIMITS.aiQuestion}
            placeholder="例：部下が報告をくれなくて困っています"
            aria-label="相談したいこと"
            style={{
              flex: 1, minWidth: 0, fontSize: 16, lineHeight: 1.5, padding: '10px 12px',
              border: '1px solid var(--c-hairline-strong)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface)', color: 'var(--c-ink)', fontFamily: 'inherit',
              resize: 'none', outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            aria-label="相談する"
            style={{
              flexShrink: 0, width: 48, height: 48, borderRadius: 'var(--radius-md)', border: 'none',
              background: text.trim() ? 'var(--c-brand)' : 'var(--c-hairline-strong)',
              color: 'var(--c-brand-ink)', cursor: text.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Send size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
