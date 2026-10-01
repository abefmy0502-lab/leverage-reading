// 🌱 ホームの「はじめの一歩」（本はあるが、メモがまだ 0 件のときだけ・SPEC §1）。
//
// 2026-10-01 オーナー裁定「ホームには相談チャット不要」で相談カード（旧 HomeConsult.jsx）を外した。
// 相談カードがメモ 0 件のときに出していた初日クイックスタート（PastBooksQuickstart）への入口は、
// ここに残す（本 0 冊の「相談相手をつくる」カードと同じ題・同じ主ボタン）。
//   - メモが 1 件でもあれば出さない（そのあとは いま読んでいる本 の『メモ』と 相談タブ が入口）
//   - 件数が分かるまでは出さない（メモのある大半の人に、一瞬だけカードを見せない）
// 「メモ N 件」の数え方は相談・記録と同じ（カード式＋学び＋「この本のまとめ」の入っている本・lib/consultHelpers.js）。
// 見た目は DESIGN.md のトークンのみ（主ボタンはこの 1 つ）。
import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { countSummaryMemos } from '../lib/consultHelpers';
import { btnPrimary, card } from '../styles/ui';

export default function HomeFirstStep({ books = [], onQuickstart }) {
  const { user } = useAuth();
  const cache = useAppDataCache();
  const bookCount = books.length;
  const summaryCount = useMemo(() => countSummaryMemos(books), [books]);
  const [cardCount, setCardCount] = useState(null);

  // メモが動いたら（クイックメモ・本の詳細・初日クイックスタートなど）数え直す＝最初のメモを書いたら消える。
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
        if (alive && !error) setCardCount(count || 0);
      } catch { /* 数えられなければ出さない（メモのある人に初回用の案内を見せない） */ }
    })();
    return () => { alive = false; };
  }, [user?.id, bookCount, memoTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bookCount === 0 || !onQuickstart || cardCount == null || cardCount + summaryCount > 0) return null;

  return (
    <section aria-labelledby="home-first-step-title" style={card}>
      {/* 題は本 0 冊のカード・初日クイックスタートと同じ「相談相手をつくる」（目的を題で伝える・説明の補足文は置かない）。 */}
      <h2 id="home-first-step-title" style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
        相談相手をつくる
      </h2>
      <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 'var(--space-2) 0 var(--space-4)', lineHeight: 1.5 }}>
        本 {bookCount} 冊・メモはまだありません
      </p>
      <button type="button" onClick={onQuickstart} style={btnPrimary}>
        これまで読んだ本から始める
      </button>
    </section>
  );
}
