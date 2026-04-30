// 🔥 useStreak — touches the per-user streak on mount and exposes the
// current count + any "just hit a milestone" event so the caller can
// pop the celebration modal.
//
// Refreshes when the local date crosses midnight (the user keeping the
// app open overnight should see their streak roll over).

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import {
  tickStreak,
  getCelebratedStreakMilestones,
  STREAK_MILESTONES,
} from '../lib/streak';

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function useStreak() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState({
    streak: 0,
    longest: 0,
    pendingMilestone: null,
  });

  useEffect(() => {
    if (!userId) return undefined;

    const apply = () => {
      const before = state.streak;
      const result = tickStreak(userId);
      const celebrated = new Set(getCelebratedStreakMilestones(userId));
      // Find the largest milestone we've crossed but not yet celebrated.
      // Use the post-tick streak as the upper bound (handles
      // first-launch-after-N-days as well as natural increments).
      let pending = null;
      for (const m of STREAK_MILESTONES) {
        if (result.streak >= m && !celebrated.has(m)) pending = m;
      }
      setState({
        streak: result.streak,
        longest: result.longest,
        pendingMilestone: pending,
      });
      return todayKey();
    };

    let lastDay = apply();
    // Re-tick on visibility change (laptop wakes, tab refocus) — checks if
    // the local date has moved on while the app was idle.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && todayKey() !== lastDay) {
        lastDay = apply();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return state; // { streak, longest, pendingMilestone }
}
