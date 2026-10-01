// 🌱 ホームの「はじめの一歩」（本はあるが、メモがまだ 0 件のときだけ・SPEC §1）。
//
// 2026-10-01 オーナー裁定「ホームには相談チャット不要」で相談カード（旧 HomeConsult.jsx）を外した。
// 相談カードがメモ 0 件のときに出していた初日クイックスタート（PastBooksQuickstart）への入口は、
// ここに残す（題は本 0 冊のカード・初日クイックスタートと同じ「相談相手をつくる」）。
//   - メモが 1 件でもあれば出さない（そのあとは いま読んでいる本 の「メモを書く」と 相談タブ が入口）
//   - 件数が分かるまでは、ホームはスケルトンのまま（HomeScreen が useHomeMemoState で決める）。
//     カードが遅れて差し込まれて、いま読んでいる本が下へ押し出されないように（ui-critic・2026-10-01）
// 「メモ N 件」の数え方は相談・記録と同じ（カード式＋学び＋「この本のまとめ」の入っている本・lib/consultHelpers.js）。
// 見た目は DESIGN.md のトークンのみ（主ボタンはこの 1 つ）。
import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { peekAllMemoRows } from '../hooks/useAllMemoRows';
import { countSummaryMemos } from '../lib/consultHelpers';
import { btnPrimary, card } from '../styles/ui';

// 件数がこれだけ待っても分からなければ「メモあり」として扱う（初回用の案内を、メモのある人に見せない）。
export const MEMO_COUNT_WAIT_MS = 800;

// 最後に分かったカード式のメモの件数（ログイン中の人ごと）。ホームに戻るたびにスケルトンを出し直さない。
let lastKnown = { userId: null, count: null };

// ホームの「メモがあるか」。{ known, hasMemos }。
//   - 「この本のまとめ」の入っている本があれば、その場で hasMemos（数えに行かなくてよい）
//   - 数え終わる前は known=false（ホームはスケルトン）。MEMO_COUNT_WAIT_MS で打ち切って hasMemos=true
//   - メモが動いたら（クイックメモ・初日クイックスタートなど）数え直す＝最初のメモを書いたらカードが消える
export function useHomeMemoState(books = []) {
  const { user } = useAuth();
  const cache = useAppDataCache();
  const userId = user?.id || null;
  const bookCount = books.length;
  const summaryCount = useMemo(() => countSummaryMemos(books), [books]);
  const initial = () => {
    if (lastKnown.userId === userId && lastKnown.count != null) return lastKnown.count;
    const rows = userId ? peekAllMemoRows(userId) : null;
    return Array.isArray(rows) ? rows.length : null;
  };
  const [cardCount, setCardCount] = useState(initial);
  const [timedOut, setTimedOut] = useState(false);
  const [memoTick, setMemoTick] = useState(0);
  useEffect(() => cache?.subscribeAnyMemo?.(() => setMemoTick((t) => t + 1)), [cache]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured || bookCount === 0) return undefined;
    let alive = true;
    (async () => {
      try {
        const { count, error } = await supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (alive && !error) {
          lastKnown = { userId, count: count || 0 };
          setCardCount(count || 0);
        }
      } catch { /* 数えられなければ下の打ち切りで「メモあり」 */ }
    })();
    return () => { alive = false; };
  }, [userId, bookCount, memoTick]);

  const unknown = cardCount == null && summaryCount === 0 && !!userId && isSupabaseConfigured && bookCount > 0;
  useEffect(() => {
    if (!unknown) return undefined;
    const t = setTimeout(() => setTimedOut(true), MEMO_COUNT_WAIT_MS);
    return () => clearTimeout(t);
  }, [unknown]);

  if (summaryCount > 0) return { known: true, hasMemos: true };
  if (cardCount != null) return { known: true, hasMemos: cardCount > 0 };
  if (!unknown || timedOut) return { known: true, hasMemos: true };
  return { known: false, hasMemos: true };
}

export default function HomeFirstStep({ bookCount = 0, onQuickstart }) {
  if (bookCount === 0 || !onQuickstart) return null;
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
