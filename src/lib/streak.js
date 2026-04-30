// 🔥 Streak — counts consecutive days the user opened the app.
//
// Definition: the streak ticks up every time the user opens the app on
// a new local-calendar day. If they skip a day, it resets to 1. The
// count is stored per-user in localStorage so it survives reloads but
// not data wipes (which is fine — streaks are a soft motivator, not
// audit-grade data).
//
// Why localStorage and not Supabase: every "open the app" would
// otherwise need a write. We want this to be free and instant.
// Cross-device drift is acceptable for a personal motivator.

const KEY = (userId) => `streak:${userId || 'anon'}`;

function todayYMD(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDays(aYMD, bYMD) {
  const a = new Date(`${aYMD}T00:00:00`);
  const b = new Date(`${bYMD}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function read(userId) {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v.streak !== 'number' || typeof v.lastActiveDate !== 'string') return null;
    return v;
  } catch { return null; }
}

function write(userId, value) {
  try { localStorage.setItem(KEY(userId), JSON.stringify(value)); } catch { /* ignore */ }
}

/**
 * Touch the streak for the current calendar day. Returns the up-to-date
 * record, including whether the streak just incremented (so callers can
 * fire celebration when crossing a milestone).
 *
 * `now` is injectable for testing; default = real time.
 */
export function tickStreak(userId, now = new Date()) {
  const today = todayYMD(now);
  const prev = read(userId);

  if (!prev) {
    const next = { streak: 1, longest: 1, lastActiveDate: today, milestonesCelebrated: [] };
    write(userId, next);
    return { ...next, justIncremented: true, justStarted: true };
  }

  if (prev.lastActiveDate === today) {
    // Already counted today — no change.
    return { ...prev, justIncremented: false, justStarted: false };
  }

  const gap = diffDays(prev.lastActiveDate, today);
  const nextStreak = gap === 1 ? prev.streak + 1 : 1;
  const longest = Math.max(prev.longest || 0, nextStreak);
  const next = {
    streak: nextStreak,
    longest,
    lastActiveDate: today,
    milestonesCelebrated: prev.milestonesCelebrated || [],
  };
  write(userId, next);
  return { ...next, justIncremented: nextStreak > prev.streak, justStarted: gap !== 1 };
}

// Streak milestone thresholds — kept small so the celebration stays rare
// enough to feel earned. 100 = legendary tier.
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

export function nextStreakMilestone(streak) {
  return STREAK_MILESTONES.find((m) => m > streak) || null;
}

export function streakHitMilestone(prevStreak, nextStreak) {
  return STREAK_MILESTONES.find((m) => prevStreak < m && nextStreak >= m) || null;
}

// Mark a streak milestone as celebrated so we don't show the popup
// again on next launch.
export function markStreakMilestoneCelebrated(userId, milestone) {
  const cur = read(userId) || { streak: 0, longest: 0, lastActiveDate: todayYMD(), milestonesCelebrated: [] };
  const list = cur.milestonesCelebrated || [];
  if (list.includes(milestone)) return;
  write(userId, { ...cur, milestonesCelebrated: [...list, milestone] });
}

export function getCelebratedStreakMilestones(userId) {
  const cur = read(userId);
  return (cur && cur.milestonesCelebrated) || [];
}
