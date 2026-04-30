// 🔥 StreakBadge — small inline pill showing the current streak.
//
// Shows nothing for 0/1 days (avoid noise on day 1 — the user hasn't
// committed yet). At 100+ days the badge upgrades to "legendary" gold/
// gradient styling so the achievement is visible at a glance.

export default function StreakBadge({ streak, className, style, title }) {
  if (!streak || streak < 2) return null;
  const legendary = streak >= 100;
  const tooltip =
    title ?? (legendary ? `🔥 ${streak} 日連続 — 伝説級！` : `🔥 ${streak} 日連続`);

  return (
    <span
      className={`streak-badge ${legendary ? 'streak-badge-legendary' : ''} ${className || ''}`.trim()}
      style={style}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className="streak-badge-flame" aria-hidden="true">🔥</span>
      <span>{streak} 日</span>
    </span>
  );
}
