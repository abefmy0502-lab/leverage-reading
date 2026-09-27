// 💬 ホーム最上段の「困ったときは、相談する」カード（SPEC §1 の主役）。
//
// Orime の一番の価値＝「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を、
// アプリを開いた瞬間に見せる。ここで書いた困りごとは「相談」タブの
// マイ読書脳へそのまま渡して送信する（onAsk）。
// 「あなたが読んだ N 冊・メモ N 件から答えます」で、積み重ね＝相談の質を毎回伝える。
//   - 本 0 冊: 出さない（ホームの「はじめる」カードが案内する）
//   - 本を読み込めなかった（countUnknown）: 冊数が分からないので「あなたの本から答えます」で出す
//   - メモ 0 件: 入力欄の代わりに「これまで読んだ本から始める」（初日クイックスタート・SPEC §1）
// 見た目は DESIGN.md のトークンのみ（主ボタン＝相談する の 1 つだけ）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { LIMITS } from '../lib/limits';
import { track } from '../lib/analytics';
import { btnPrimary, card, input, groupTitle } from '../styles/ui';

// 相談例（AI を使わない＝原価ゼロ）。いま読んでいる本があればそれを使う。
// memoBookIds: メモのある本の id（null＝まだ分からない）。メモの無い本の名前は例に出さない。
function examplesFor(books, memoBookIds) {
  const ok = (b) => memoBookIds == null || memoBookIds.has(b.id);
  const reading = books.find((b) => b.status === 'reading' && ok(b)) || books.find((b) => b.status === 'done' && ok(b))
    || (memoBookIds ? books.find((b) => memoBookIds.has(b.id)) : null);
  const out = [];
  if (reading?.title) out.push(`『${reading.title}』の学びで、明日から使えるものは？`);
  // 2 つ目は、よく付けているタグから（相談タブの例と同じ作り方）。タグが無いときだけ一般的な例。
  // 1 つ目の本に付いているタグは避ける（2 つの例が同じ本に寄らないように）。
  const firstTags = new Set((reading?.tags || []).map((t) => String(t || '').trim()));
  const tagCount = new Map();
  // タグもメモのある本からだけ数える（メモの無い本のタグで聞いても根拠が無い）。
  books.filter(ok).forEach((b) => (Array.isArray(b.tags) ? b.tags : []).forEach((t) => {
    const k = String(t || '').trim();
    if (k && !firstTags.has(k)) tagCount.set(k, (tagCount.get(k) || 0) + 1);
  }));
  const topTag = [...tagCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  out.push(topTag
    ? `「${topTag}」で迷ったとき、私のメモからヒントをください`
    : '最近、判断に迷うことがあります。私が読んだ本から、ヒントをください');
  return out;
}

// countUnknown: 本の読み込みに失敗して冊数が分からないとき。0 冊扱いで隠さず、件数なしの 1 行で出す。
export default function HomeConsult({ books = [], onAsk, onQuickstart, countUnknown = false }) {
  const { user } = useAuth();
  const cache = useAppDataCache();
  const inputRef = useRef(null);
  const [memoCount, setMemoCount] = useState(null);
  const [text, setText] = useState('');
  const bookCount = books.length;
  const [memoBookIds, setMemoBookIds] = useState(null);
  const examples = useMemo(() => examplesFor(books, memoBookIds), [books, memoBookIds]);

  // メモが動いたら（ホームのクイックメモ・本の詳細など）件数を取り直す。
  // 最初のメモを書いた直後に、案内から入力欄へ切り替わるように。
  const [memoTick, setMemoTick] = useState(0);
  useEffect(() => cache?.subscribeAnyMemo?.(() => setMemoTick((t) => t + 1)), [cache]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured || bookCount === 0) return undefined;
    let alive = true;
    (async () => {
      try {
        const [{ count, error }, idsRes] = await Promise.all([
          supabase
            .from('book_memos')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          // 相談例に出す本を「メモのある本」に限るため（新しい順に最大 1000 件で十分）。
          supabase
            .from('book_memos')
            .select('book_id')
            .eq('user_id', user.id)
            .not('book_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1000),
        ]);
        if (alive && !error) setMemoCount(count || 0);
        if (alive && !idsRes.error) setMemoBookIds(new Set((idsRes.data || []).map((r) => r.book_id)));
      } catch { /* 件数が取れなくても入口自体は出す */ }
    })();
    return () => { alive = false; };
  }, [user?.id, bookCount, memoTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bookCount === 0 && !countUnknown) return null;

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
        {/* メモ 0 件でも同じ 1 行（説明の補足文は置かない・DESIGN §0-6）。 */}
        {countUnknown && bookCount === 0
          ? 'あなたの本から答えます'
          : <>あなたの {bookCount} 冊{memoCount > 0 && <>・メモ {memoCount} 件</>}から答えます</>}
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
            placeholder="例：上司への報告がうまくいかない"
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
          <p style={{ ...groupTitle, margin: 'var(--space-4) 0 var(--space-2)' }}>たとえば</p>
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
                {/* 2 行で止める（1 行だと何を聞く例か読めない）。全文は読み上げ・送信にそのまま使う。 */}
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{q}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
