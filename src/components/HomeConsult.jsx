// 💬 ホーム最上段の「困ったときは、相談する」カード（SPEC §1 の主役）。
//
// Orime の一番の価値＝「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を、
// アプリを開いた瞬間に見せる。ここで書いた困りごとは「相談」タブの
// マイ読書脳へそのまま渡して送信する（onAsk）。
// 「あなたが読んだ N 冊・メモ N 件から答えます」で、積み重ね＝相談の質を毎回伝える。
//   - 本 0 冊: 出さない（ホームの「はじめる」カードが案内する）
//   - メモ 0 件: 入力欄の代わりに予告と「これまで読んだ本から始める」（初日クイックスタート）
// 見た目は DESIGN.md のトークンのみ（主ボタン＝相談する の 1 つだけ）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { LIMITS } from '../lib/limits';
import { track } from '../lib/analytics';
import { btnPrimary, card, input } from '../styles/ui';

// 相談例（AI を使わない＝原価ゼロ）。いま読んでいる本があればそれを使う。
function examplesFor(books) {
  const reading = books.find((b) => b.status === 'reading') || books.find((b) => b.status === 'done');
  const out = [];
  if (reading?.title) out.push(`『${reading.title}』の学びで、明日から使えるものは？`);
  // 2 つ目は、よく付けているタグから（相談タブの例と同じ作り方）。タグが無いときだけ一般的な例。
  // 1 つ目の本に付いているタグは避ける（2 つの例が同じ本に寄らないように）。
  const firstTags = new Set((reading?.tags || []).map((t) => String(t || '').trim()));
  const tagCount = new Map();
  books.forEach((b) => (Array.isArray(b.tags) ? b.tags : []).forEach((t) => {
    const k = String(t || '').trim();
    if (k && !firstTags.has(k)) tagCount.set(k, (tagCount.get(k) || 0) + 1);
  }));
  const topTag = [...tagCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  out.push(topTag
    ? `「${topTag}」について、私が読んだ本からヒントをください`
    : '最近、判断に迷うことがあります。私が読んだ本から、ヒントをください');
  return out;
}

export default function HomeConsult({ books = [], onAsk, onQuickstart }) {
  const { user } = useAuth();
  const cache = useAppDataCache();
  const inputRef = useRef(null);
  const [memoCount, setMemoCount] = useState(null);
  const [text, setText] = useState('');
  const bookCount = books.length;
  const examples = useMemo(() => examplesFor(books), [books]);

  // メモが動いたら（ホームのクイックメモ・本の詳細など）件数を取り直す。
  // 最初のメモを書いた直後に、案内から入力欄へ切り替わるように。
  const [memoTick, setMemoTick] = useState(0);
  useEffect(() => cache?.subscribeAnyMemo?.(() => setMemoTick((t) => t + 1)), [cache]);

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
  }, [user?.id, bookCount, memoTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bookCount === 0) return null;

  const send = (q) => {
    const question = (q ?? text).trim();
    // 空のまま押されたら入力欄へ案内する（主ボタンを薄く無効化すると「主役」が
    // 脇役より弱く見えるため、見た目は常に主ボタンのままにする・DESIGN §0）。
    if (!question) { inputRef.current?.focus(); return; }
    track('home_consult_sent', { example: q != null });
    onAsk?.(question);
    setText('');
  };

  // 書きかけの文字があるときは、件数が後から 0 と分かっても入力欄を消さない。
  const hasMemos = memoCount == null || memoCount > 0 || text.trim().length > 0;

  return (
    <section aria-labelledby="home-consult-title" style={card}>
      <h2 id="home-consult-title" style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
        困ったときは、相談する
      </h2>
      <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 'var(--space-2) 0 var(--space-4)', lineHeight: 1.5 }}>
        {hasMemos
          ? <>あなたの{bookCount}冊{memoCount != null && <>・メモ{memoCount}件</>}から答えます</>
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
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={LIMITS.aiQuestion}
            placeholder="困っていることを書いてください"
            aria-label="相談したいこと"
            style={{ ...input, resize: 'none', lineHeight: 1.5, display: 'block' }}
          />
          <button
            type="button"
            onClick={() => send()}
            style={{ ...btnPrimary, marginTop: 'var(--space-3)' }}
          >
            相談する
          </button>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 'var(--space-4) 0 var(--space-2)' }}>たとえば</p>
          {/* 相談例はチップ（--fill 面・枠なし）。入力欄（枠あり）と見分けがつくように。 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {examples.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                style={{
                  display: 'block', width: '100%', minHeight: 44, padding: 'var(--space-3)', textAlign: 'left',
                  background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5,
                }}
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
