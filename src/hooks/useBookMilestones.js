// 🏆 useBookMilestones — watches the in-memory books list for new
// completion milestones (1 / 5 / 10 / 25 / 50 / 100 冊).
//
// Returns the milestone that's pending celebration (if any). The caller
// is responsible for showing a modal and then calling `markCelebrated`
// from lib/milestones once the user dismisses it.

import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { getCompletedCount, pendingReadingMilestone } from '../lib/milestones';

export function useBookMilestones(books) {
  const { user } = useAuth();
  const userId = user?.id || null;
  return useMemo(() => {
    if (!userId) return { completedCount: 0, pendingMilestone: null };
    const completedCount = getCompletedCount(books);
    const pendingMilestone = pendingReadingMilestone(userId, completedCount);
    return { completedCount, pendingMilestone };
  }, [userId, books]);
}
