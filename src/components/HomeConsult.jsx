// 💬 ホーム最上段の「困ったときは、相談する」カード（SPEC §1 の主役）。
//
// Orime の一番の価値＝「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を、
// アプリを開いた瞬間に見せる。ここで書いた困りごとは「相談」タブの
// マイ読書脳へそのまま渡して送信する（onAsk）。
// 「あなたが読んだ N 冊・メモ N 件から答えます」で、積み重ね＝相談の質を毎回伝える。
//   - 本 0 冊: 出さない（ホームの「はじめる」カードが案内する）
//   - メモ 0 件: 入力欄の代わりに予告と「これまで読んだ本から始める」（初日クイックスタート）
// 見た目は DESIGN.md のトークンのみ（主ボタン＝相談する の 1 つだけ）。
import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { LIMITS } from '../lib/limits';
import { track } from '../lib/analytics';
import { btnPrimary, btnGhost, card, input } from '../styles/ui';

// 相談例（AI を使わない＝原価ゼロ）。いま読んでいる本があればそれを使う。
function examplesFor(books) {
  const reading = books.find((b) => b.status === 'reading') || books.find((b) => b.status === 'done');
  const out = [];
  if (reading?.title) out.push(`『${reading.title}』の学びで、明日から使えるものは？`);
  out.push('最近、判断に迷うことがあります。私が読んだ本から、ヒントをください');
  return out;
}

export default function HomeConsult({ books = [], onAsk, onQuickstart }) {
  const { user } = useAuth();
  const [memoCount, setMemoCount] = useState(null);
  const [text, setText] = useState('');
  const bookCount = books.length;
  const examples = useMemo(() => examplesFor(books), [books]);

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

  const send = (q) => {
    const question = (q ?? text).trim();
    if (!question) return;
    track('home_consult_sent', { example: q != null });
    onAsk?.(question);
    setText('');
  };

  const hasMemos = memoCount == null || memoCount > 0;

  return (
    <section aria-labelledby="home-consult-title" style={card}>
      <h2 id="home-consult-title" style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
        困ったときは、相談する
      </h2>
      <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: '8px 0 16px', lineHeight: 1.5 }}>
        {hasMemos
          ? <>あなたの {bookCount}冊{memoCount != null && <>・メモ {memoCount}件</>} から答えます</>
          : '本を読みながらメモを残すと、そのメモを根拠に、あなただけの答えが返ってきます。'}
      </p>

      {!hasMemos && onQuickstart && (
        <button type="button" onClick={onQuickstart} style={btnPrimary}>
          これまで読んだ本から始める
        </button>
      )}

      {hasMemos && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={LIMITS.aiQuestion}
            placeholder="困っていることを、そのまま書いてください"
            aria-label="相談したいこと"
            style={{ ...input, resize: 'none', lineHeight: 1.5, display: 'block' }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!text.trim()}
            style={{ ...btnPrimary, marginTop: 12, opacity: text.trim() ? 1 : 0.4 }}
          >
            相談する
          </button>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: '16px 0 8px' }}>たとえば</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {examples.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                style={{ ...btnGhost, justifyContent: 'flex-start', textAlign: 'left', fontSize: 'var(--text-sub)', fontWeight: 400, color: 'var(--text)', lineHeight: 1.5 }}
              >
                {q}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
