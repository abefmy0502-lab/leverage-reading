// Time-of-day greeting + name resolution.
//
// Used by the app header to make the surface feel personal. All pure —
// no side effects, no React imports — so it's easy to swap copy without
// touching consumers.

// Resolve the most personal label we have for the user. Falls back from
// display_name → first part of email → 'あなた'. Never returns empty.
export function resolveDisplayName(user) {
  if (!user) return 'あなた';
  const meta = user.user_metadata || user.userMetadata || {};
  const candidates = [
    meta.display_name,
    meta.full_name,
    meta.name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (typeof user.email === 'string' && user.email.includes('@')) {
    const local = user.email.split('@')[0];
    if (local) return local;
  }
  return 'あなた';
}

// Greeting categories — keep emoji + text in one record so swapping copy
// stays consistent. Hours are local-time bucket cutoffs.
const SLOTS = [
  { hourEnd: 4,  emoji: '🌙', greeting: 'こんばんは' },          // 〜04
  { hourEnd: 10, emoji: '☀️', greeting: 'おはようございます' },   // 05〜10
  { hourEnd: 17, emoji: '🌤', greeting: 'こんにちは' },           // 11〜17
  { hourEnd: 21, emoji: '🌇', greeting: 'こんばんは' },           // 18〜21
  { hourEnd: 24, emoji: '🌙', greeting: 'おやすみ前ですね' },     // 22〜23
];

export function getTimeSlot(date = new Date()) {
  const h = date.getHours();
  return SLOTS.find((s) => h < s.hourEnd) || SLOTS[SLOTS.length - 1];
}

// Combine slot + name. The "、" between greeting and name reads naturally
// in Japanese. Empty name resolution still produces a complete greeting.
export function buildGreeting(user, date = new Date()) {
  const slot = getTimeSlot(date);
  const name = resolveDisplayName(user);
  // 'あなた' is our fallback — don't bolt the comma form onto it (sounds
  // stiff). For named users, lead with the greeting + their name.
  if (name === 'あなた') {
    return { emoji: slot.emoji, text: slot.greeting };
  }
  return { emoji: slot.emoji, text: `${slot.greeting}、${name} さん` };
}
