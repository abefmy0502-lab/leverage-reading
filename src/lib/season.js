// 🌸 Season detection — currently used by SeasonalEffect to decide
// what particles to render. Japanese seasonal sensibility:
//   spring  : 3, 4         → 桜
//   summer  : 5–8          → (effect off — keep the screen calm)
//   autumn  : 9–11         → 紅葉
//   winter  : 12, 1, 2     → 雪
//
// Returns the kind of effect to render, or null when off. The user
// can also disable seasonal effects by setting localStorage
// `seasonalEffects:off` to '1'.

export function getSeason(date = new Date()) {
  const m = date.getMonth() + 1; // 1-indexed
  if (m === 3 || m === 4) return 'spring';
  if (m >= 5 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export function getSeasonalEffect(date = new Date()) {
  const season = getSeason(date);
  if (season === 'spring') return 'sakura';
  if (season === 'autumn') return 'leaves';
  if (season === 'winter') return 'snow';
  return null; // summer = quiet
}

const OFF_KEY = 'seasonalEffects:off';

export function isSeasonalEffectsDisabled() {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch { return false; }
}

export function setSeasonalEffectsDisabled(disabled) {
  try {
    if (disabled) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch { /* ignore */ }
}
