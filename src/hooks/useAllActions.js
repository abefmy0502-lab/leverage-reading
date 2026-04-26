// Cross-book action aggregator for the standalone "行動リスト" page.
//
// Each `book.actions` row already arrives sorted by created_at from useBooks.
// We flatten across all books and decorate each action with the originating
// book's metadata so the list view can render the source line + jump back to
// the book detail. The actionIdx is the index inside that book's actions
// array, which the parent uses for toggle/delete via saveBook.

import { useMemo } from 'react';

export function useAllActions(books) {
  const allActions = useMemo(() => {
    const out = [];
    (books || []).forEach((b) => {
      (b.actions || []).forEach((act, i) => {
        if (!act?.text?.trim()) return;
        out.push({
          ...act,
          bookId: b.id,
          bookTitle: b.title,
          bookAuthor: b.author,
          bookCover: b.cover,
          bookStatus: b.status,
          actionIdx: i,
        });
      });
    });
    return out;
  }, [books]);

  const stats = useMemo(() => {
    const total = allActions.length;
    const completed = allActions.filter((a) => a.done).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    // "今週期限" — open actions whose deadline falls within the next 7 days
    // (today inclusive). Used as a forward-looking nudge in the summary card,
    // since the actions table doesn't store a per-row completed_at.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const upcomingThisWeek = allActions.filter((a) => {
      if (a.done || !a.deadline) return false;
      const d = new Date(a.deadline);
      if (Number.isNaN(d.getTime())) return false;
      return d >= today && d < weekEnd;
    }).length;

    return { total, completed, pct, upcomingThisWeek };
  }, [allActions]);

  return { allActions, stats };
}
