// 🏷 保存したメモにすすめるタグ（タグの提案・2026-10-02・lib/tagSuggest.js）。
// 保存した 1 回（saved.nonce）ごとに 1 度だけ決めて覚える（タグを付けて一覧が変わっても、チップが消えたり入れ替わったりしない）。
// 決めるのは、保存してからメモを書くシートが閉じ終わるまで（DECIDE_MS）。それより遅れて一覧の上にカードが差し込まれて
// 一覧が下へ跳ねないように、間に合わなかったもの（Jev の答え・自分のメモの読み込み）は使わない:
//   - Jev が答えていれば Jev の結果、まだなら端末の中の決め方
//   - 自分のメモをまだ読めていなければ、その保存ではカードを出さない
// 自分のメモ全部は hooks/useAllMemoRows.js（検索・つながるメモと共通の控え）から、本の詳細を開いたときに読んでおく。
// Jev（lib/jev.js）は使えるときだけ（プランの人・版 2 の同意・サーバーのスイッチ）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { useAllMemoRows } from './useAllMemoRows';
import { scoreTagsLocal, suggestTagsLocal, jevTagCandidates, tagsFromJev } from '../lib/tagSuggest';
import { askJev, jevClientOn } from '../lib/jev';
import { sanitizeForPrompt } from '../lib/ai';
import { track } from '../lib/analytics';

const JEV_PLANS = new Set(['trial', 'paid', 'admin']);
// 保存 → シートが閉じ終わる（閉じる動き 220ms＋知らせ）まで。
export const DECIDE_MS = 320;

// saved: { id, bookId, text, nonce } | null / book: その本（タグ・書名）/ current: そのメモにいま付いているタグ / plan: PaywallContext の plan
// active: 自分のメモを読んでおくか（本の詳細を開いている間）
export function useTagSuggestions({ saved, book = null, current = [], books, plan = null, active = true }) {
  const { user } = useAuth();
  const { rows, status } = useAllMemoRows({ userId: user?.id, books, active: active && !!user?.id });
  const [result, setResult] = useState(null); // { nonce, list, source }
  const nonce = saved?.id ? saved.nonce ?? null : null;
  const bookTags = useMemo(() => (Array.isArray(book?.tags) ? book.tags : []), [book]);
  // 決める時点の最新の値を読む（effect は保存ごとに 1 回だけ）
  const live = useRef({});
  live.current = { rows, status, current, bookTags, saved, book, plan };

  useEffect(() => {
    if (nonce == null || !user?.id) return undefined;
    // 本を開き直したときなど、少し前の保存ではあとから出さない（その保存はもう決め終えている）
    if (typeof nonce === 'number' && Date.now() - nonce > 3000) { setResult({ nonce, list: [], source: 'none' }); return undefined; }
    let alive = true;
    let jev = null; // { list } | null
    const argsNow = () => {
      const l = live.current;
      return { text: l.saved?.text, memoId: l.saved?.id, rows: l.rows, bookTags: l.bookTags, current: l.current || [] };
    };
    // 自分のメモをもう読めていれば、Jev にもすぐ聞く（間に合えば使う）
    const l0 = live.current;
    if (l0.status === 'ready' && Array.isArray(l0.rows) && jevClientOn() && JEV_PLANS.has(l0.plan)) {
      const candidates = jevTagCandidates(scoreTagsLocal(argsNow()));
      if (candidates.length) {
        askJev('memo_filing', {
          memo: sanitizeForPrompt(String(l0.saved?.text || '')).slice(0, 600),
          book: sanitizeForPrompt(String(l0.book?.title || '')).slice(0, 40),
          tags: candidates,
        }, { timeoutMs: DECIDE_MS }).then((r) => {
          const fromJev = r ? tagsFromJev(candidates, r.probs) : null;
          if (alive && fromJev) jev = { list: fromJev };
        });
      }
    }
    const timer = setTimeout(() => {
      if (!alive) return;
      const l = live.current;
      let list = [];
      let source = 'none';
      if (jev) { list = jev.list; source = 'jev'; }
      else if (l.status === 'ready' && Array.isArray(l.rows)) { list = suggestTagsLocal(argsNow()); source = 'local'; }
      setResult({ nonce, list, source });
      if (list.length) track('tag_suggest_shown', { n: list.length, source });
    }, DECIDE_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [nonce, user?.id]);

  const list = result && result.nonce === nonce ? result.list : [];
  return { suggestions: list, source: result?.source || null };
}
