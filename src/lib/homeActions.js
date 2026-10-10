// 🎯 ホームの「今日の行動」の 1 行（2026-10-10・SPEC §1）。
//
// 期限が今日まで（過ぎたものも含む）の、まだの行動があれば「今日までの行動 N 件」（過ぎたものが無ければ「今日の行動 N 件」）。
// 無くて明日が期限の行動があれば「明日の行動 N 件」。どちらも無ければ出さない（null）。
// 2 行目はいちばん先にやる 1 件の文（期限の古い順・同じなら優先の高い順）。点数・%・連続日数は出さない。
// 責めない: 過ぎた行動も「期限を過ぎた」とは言わず、今日までにやることとしてまとめる。

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function parseDeadline(s) {
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 期限までの日数（今日＝0・過ぎたら負）。期限なし・読めないは null。
export function daysUntilDeadline(deadline, now = new Date()) {
  const d = parseDeadline(deadline);
  if (!d) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

const byUrgency = (a, b) => (
  String(a.deadline || '').localeCompare(String(b.deadline || ''))
  || ((PRIORITY_RANK[a.priority || 'medium'] ?? 1) - (PRIORITY_RANK[b.priority || 'medium'] ?? 1))
  || String(a.created_at || '').localeCompare(String(b.created_at || ''))
);

// allActions: useAllActions の allActions（{ text, deadline, done, priority, bookId, … }）。
// 返り値: { kind: 'today' | 'tomorrow', label, count, first } | null
export function homeActionsSummary(allActions, now = new Date()) {
  const open = (Array.isArray(allActions) ? allActions : []).filter((a) => a && !a.done && String(a.text || '').trim());
  const dueToday = open.filter((a) => { const n = daysUntilDeadline(a.deadline, now); return n != null && n <= 0; }).sort(byUrgency);
  if (dueToday.length) {
    const overdue = dueToday.some((a) => daysUntilDeadline(a.deadline, now) < 0);
    return { kind: 'today', label: overdue ? '今日までの行動' : '今日の行動', count: dueToday.length, first: dueToday[0] };
  }
  const dueTomorrow = open.filter((a) => daysUntilDeadline(a.deadline, now) === 1).sort(byUrgency);
  if (dueTomorrow.length) return { kind: 'tomorrow', label: '明日の行動', count: dueTomorrow.length, first: dueTomorrow[0] };
  return null;
}
