// 🏷 保存したメモにすすめるタグ（タグの提案・2026-10-02・lib/tagSuggest.js）。
// 保存した 1 回（saved.nonce）ごとに 1 度だけ決めて覚える（タグを付けて一覧が変わっても、チップが消えたり入れ替わったりしない）。
// 決めるのは、保存してからメモを書くシートが閉じ終わるまで（DECIDE_MS）。それより遅れて一覧の上にカードが差し込まれて
// 一覧が下へ跳ねないように、間に合わなかったもの（自分のメモの読み込み）は使わない:
//   - 自分のメモをまだ読めていなければ、その保存ではカードを出さない
// 自分のメモ全部は hooks/useAllMemoRows.js（検索・つながるメモと共通の控え）から、本の詳細を開いたときに読んでおく。
// すすめるのは自分のメモのタグだけ（2026-10-11 に視点の地図の枠をやめた＝本の分野は本の分け方で、メモのタグではない・lib/bookFields.js）。
// 決め方は端末の中だけ（AI なし・トークンを使わない・誰でも）。Jev（TypeSafe AI）は使わない（2026-10-02・docs/jev-plan.md §3-3:
// 保存からシートが閉じ終わるまでの 320ms に往復が間に合わないことが多く、使えない答えのためにメモの文を外へ送ることになるため）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { useAllMemoRows } from './useAllMemoRows';
import { suggestTagsLocal } from '../lib/tagSuggest';
import { isBookField } from '../lib/bookFields';
import { track } from '../lib/analytics';

// 保存 → シートが閉じ終わる（閉じる動き 220ms＋知らせ）まで。
export const DECIDE_MS = 320;

// saved: { id, bookId, text, nonce } | null / book: その本（タグ・書名）/ current: そのメモにいま付いているタグ
// active: 自分のメモを読んでおくか（本の詳細を開いている間）
export function useTagSuggestions({ saved, book = null, current = [], books, active = true }) {
  const { user } = useAuth();
  const { rows, status } = useAllMemoRows({ userId: user?.id, books, active: active && !!user?.id });
  const [result, setResult] = useState(null); // { nonce, list, source }
  const nonce = saved?.id ? saved.nonce ?? null : null;
  // 本の分野はメモのタグの手がかりにしない（分野でない前の版のタグだけ）。
  const bookTags = useMemo(() => (Array.isArray(book?.tags) ? book.tags.filter((t) => !isBookField(t)) : []), [book]);
  // 決める時点の最新の値を読む（effect は保存ごとに 1 回だけ）
  const live = useRef({});
  live.current = { rows, status, current, bookTags, saved };

  useEffect(() => {
    if (nonce == null || !user?.id) return undefined;
    // 本を開き直したときなど、少し前の保存ではあとから出さない（その保存はもう決め終えている）
    if (typeof nonce === 'number' && Date.now() - nonce > 3000) { setResult({ nonce, list: [], source: 'none' }); return undefined; }
    let alive = true;
    const argsNow = () => {
      const l = live.current;
      return { text: l.saved?.text, memoId: l.saved?.id, rows: l.rows, bookTags: l.bookTags, current: l.current || [] };
    };
    const timer = setTimeout(() => {
      if (!alive) return;
      const l = live.current;
      let list = [];
      let source = 'none';
      if (l.status === 'ready' && Array.isArray(l.rows)) { list = suggestTagsLocal(argsNow()); source = 'local'; }
      setResult({ nonce, list, source });
      if (list.length) track('tag_suggest_shown', { n: list.length, source });
    }, DECIDE_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [nonce, user?.id]);

  const list = result && result.nonce === nonce ? result.list : [];
  return { suggestions: list, source: result?.source || null };
}
