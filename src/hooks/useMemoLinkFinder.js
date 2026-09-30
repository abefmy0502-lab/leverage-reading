// 🔗 本と本がつながる（2026-10-01）: 保存した・開いたメモに、ほかの本で似たことを書いたメモを探す。
// 自分のメモを全部読むのは使い始めたとき（enabled）の 1 回だけ（hooks/useAllMemoRows.js・検索と共通）。
// 似ているかの決め方は lib/memoLinks.js（AI も通信も使わない・トークンを使わない）。
import { useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { useAllMemoRows } from './useAllMemoRows';
// 一節の印（語の端まで広げる・半分を超えたらいちばん長い印だけ）は lib/memoLinks.js の linkSegments。
import { linkIndexFor, findLinkedMemos, linkSegments } from '../lib/memoLinks';

// 返り値: find({ text, bookId, memoId }) → [{ book, hit, score }]（LibrarySearchHit にそのまま渡せる形）/ ready
export function useMemoLinkFinder({ books, enabled = true }) {
  const { user } = useAuth();
  const { rows, status } = useAllMemoRows({ userId: user?.id, books, active: enabled && !!user?.id });
  const index = useMemo(() => (enabled && status === 'ready' ? linkIndexFor(rows) : null), [enabled, status, rows]);
  const bookById = useMemo(() => new Map((books || []).map((b) => [String(b.id), b])), [books]);
  // 同じメモを描き直すたびに探し直さない（索引が変わったら覚え直す）。
  const memo = useMemo(() => new Map(), [index, bookById]); // eslint-disable-line react-hooks/exhaustive-deps
  const find = useCallback(({ text, bookId, memoId = null } = {}) => {
    if (!index || !text) return [];
    const key = `${bookId}|${memoId}|${text}`;
    if (memo.has(key)) return memo.get(key);
    const out = findLinkedMemos(index, { text, bookId, memoId })
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
    memo.set(key, out);
    return out;
  }, [index, bookById, memo]);
  return { find, ready: !!index };
}
