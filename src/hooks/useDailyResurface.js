// 💭 useDailyResurface — ホーム最上部に「ふと、思い出したい一節」を出すための
// 軽量フック。ユーザーの過去メモ (本のメモ + 学びの記録) から 1 件を引いて返す。
//
// 設計意図:
//   読書アプリの本質的価値は「読みっぱなしにしない = 過去の気づきがふと甦る」こと。
//   その魔法をナビの奥 (振り返りタブ) ではなく、アプリを開いた瞬間の主役に置く。
//
// - 直近 80 件までを取得 (軽量カラムのみ)。本文が空のメモは除外。
// - セッション内では同じ 1 件を表示し続け、reroll() で引き直す (= 毎回ランダムに
//   散らさず「今日の一節」感を出す)。
// - メモが 0 件なら memo=null を返し、呼び出し側は何も描画しない (新規ユーザーは
//   空状態の案内に任せる)。

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';

const MAX_FETCH = 80;

export function useDailyResurface() {
  const { user } = useAuth();
  const [memos, setMemos] = useState([]);
  const [loading, setLoading] = useState(true);
  // セッションごとに 1 つ選ぶための種。初期値はランダムにして「開くたびに違う一節」に。
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !isSupabaseConfigured) {
        setMemos([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('book_memos')
        .select('id, text, book_id, page_number, created_at, source_type')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(MAX_FETCH);
      if (cancelled) return;
      if (error) {
        setMemos([]);
      } else {
        setMemos((data || []).filter((m) => (m.text || '').trim().length > 0));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const memo = memos.length > 0 ? memos[seed % memos.length] : null;
  const reroll = useCallback(() => setSeed((s) => s + 1), []);

  return { memo, count: memos.length, loading, reroll };
}

export default useDailyResurface;
