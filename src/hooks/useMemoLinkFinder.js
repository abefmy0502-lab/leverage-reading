// 🔗 本と本がつながる（2026-10-01）: 保存した・開いたメモに、ほかの本で似たことを書いたメモを探す。
// 自分のメモを全部読むのは使い始めたとき（enabled）の 1 回だけ（hooks/useAllMemoRows.js・検索と共通）。
// 似ているかの決め方は lib/memoLinks.js（AI も通信も使わない・トークンを使わない）。
import { useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { useAllMemoRows } from './useAllMemoRows';
import { linkIndexFor, findLinkedMemos } from '../lib/memoLinks';
import { buildSnippet, normalizeSearch, matchRanges } from '../lib/librarySearch';

// 共有する切れ端から、一節の印を付ける所（続けて共有する 3 文字以上、または漢字・カタカナを含む 2 文字）。
function linkSegments(text, shared) {
  const compiled = [...new Set(shared.map((g) => normalizeSearch(g)))].map((term) => ({ term, stem: null, bigrams: [] }));
  const ranges = matchRanges(text, compiled).filter(([a, b]) => {
    const part = String(text).slice(a, b);
    return [...part].length >= 3 || /[^ぁ-ゟ]/u.test(part);
  });
  return buildSnippet(text, compiled, { ranges });
}

// 返り値: find({ text, bookId, memoId }) → [{ book, hit, score }]（LibrarySearchHit にそのまま渡せる形）/ ready
export function useMemoLinkFinder({ books, enabled = true }) {
  const { user } = useAuth();
  const { rows, status } = useAllMemoRows({ userId: user?.id, books, active: enabled && !!user?.id });
  const index = useMemo(() => (enabled && status === 'ready' ? linkIndexFor(rows) : null), [enabled, status, rows]);
  const bookById = useMemo(() => new Map((books || []).map((b) => [String(b.id), b])), [books]);
  const find = useCallback(({ text, bookId, memoId = null } = {}) => {
    if (!index || !text) return [];
    return findLinkedMemos(index, { text, bookId, memoId })
      .map((l) => {
        const book = bookById.get(String(l.bookId));
        if (!book) return null;
        const m = l.memo;
        return {
          key: String(m.id),
          book,
          score: l.score,
          hit: {
            kind: 'memo',
            memoId: m.id,
            page: Number.isFinite(m.page_number ?? m.pageNumber) ? (m.page_number ?? m.pageNumber) : null,
            createdAt: m.created_at || m.createdAt || null,
            segments: linkSegments(m.text || '', l.shared),
          },
        };
      })
      .filter(Boolean);
  }, [index, bookById]);
  return { find, ready: !!index };
}
