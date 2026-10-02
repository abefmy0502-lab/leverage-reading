// 🏷 保存したメモにすすめるタグ（タグの提案・2026-10-02・lib/tagSuggest.js）。
// 保存した 1 回（saved.nonce）ごとに 1 度だけ決めて覚える（タグを付けて一覧が変わっても、チップが消えたり入れ替わったりしない）。
// 自分のメモ全部は hooks/useAllMemoRows.js（検索・つながるメモと共通の控え）から読む。
// Jev（lib/jev.js）が使えるときだけ、端末の候補を Jev で決め直す（プランの人・版 2 の同意・サーバーのスイッチ）。
// Jev を待つ間は何も出さない（待ちは最大 2.5 秒・使えなければすぐ端末の決め方）。
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { useAllMemoRows } from './useAllMemoRows';
import { scoreTagsLocal, suggestTagsLocal, jevTagCandidates, tagsFromJev } from '../lib/tagSuggest';
import { askJev, jevClientOn } from '../lib/jev';
import { sanitizeForPrompt } from '../lib/ai';
import { track } from '../lib/analytics';

const JEV_PLANS = new Set(['trial', 'paid', 'admin']);

// saved: { id, bookId, text, nonce } | null / book: その本（タグ・書名）/ current: そのメモにいま付いているタグ / plan: PaywallContext の plan
export function useTagSuggestions({ saved, book = null, current = [], books, plan = null }) {
  const { user } = useAuth();
  const enabled = !!saved?.id && !!user?.id;
  const { rows, status } = useAllMemoRows({ userId: user?.id, books, active: enabled });
  const [result, setResult] = useState(null); // { nonce, list, source }
  const nonce = saved?.nonce ?? null;
  const ready = enabled && status === 'ready' && Array.isArray(rows);
  const currentKey = (current || []).join('\u0001');
  const bookTags = useMemo(() => (Array.isArray(book?.tags) ? book.tags : []), [book]);

  useEffect(() => {
    if (!ready || result?.nonce === nonce) return undefined;
    let alive = true;
    const args = { text: saved.text, memoId: saved.id, rows, bookTags, current: currentKey ? currentKey.split('\u0001') : [] };
    const local = suggestTagsLocal(args);
    const useJev = jevClientOn() && JEV_PLANS.has(plan);
    if (!useJev) {
      setResult({ nonce, list: local, source: 'local' });
      if (local.length) track('tag_suggest_shown', { n: local.length, source: 'local' });
      return undefined;
    }
    const scored = scoreTagsLocal(args);
    const candidates = jevTagCandidates(scored);
    if (!candidates.length) { setResult({ nonce, list: [], source: 'local' }); return undefined; }
    askJev('memo_filing', {
      memo: sanitizeForPrompt(String(saved.text || '')).slice(0, 600),
      book: sanitizeForPrompt(String(book?.title || '')).slice(0, 40),
      tags: candidates,
    }).then((r) => {
      if (!alive) return;
      const fromJev = r ? tagsFromJev(candidates, r.probs) : null;
      const list = fromJev || local;
      const source = fromJev ? 'jev' : 'local';
      setResult({ nonce, list, source });
      if (list.length) track('tag_suggest_shown', { n: list.length, source });
    });
    return () => { alive = false; };
    // 1 回の保存につき 1 度だけ（タグを付けて current・rows が変わっても決め直さない）
  }, [ready, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = result && result.nonce === nonce ? result.list : [];
  return { suggestions: list, source: result?.source || null };
}
