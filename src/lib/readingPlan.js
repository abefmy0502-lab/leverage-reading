// 📅 読書計画カレンダー（2026-11-15 オーナー「本棚からいつまでにどの本をどの順番に読むのか計画してカレンダーに・読むスピードを調整できるように」）。
//
// AI が決めるのは「どの本を・どの順で・なぜ」だけ（ロードマップ＝lib/goalRoadmap.js）。日付はここで、本の長さと
// 1 日に読む時間から割り振る（AI に日付を計算させない）。
//   - 1 冊にかかる時間: 読む時間の目安（readTargetMin）＞ ページ数 × 2 分 × 本人の速さ ＞ 決まりの 400 分 × 本人の速さ
//   - 本人の速さ: 読了した本のうち、ページ数と集中モードの記録（30 分以上）がある本の「実際 ÷ ページ数 × 2」の真ん中（0.5〜2 倍）
//   - 読書中の本は、もう読んだ時間を引く（少なくとも 30 分は残す）
// 予定が過ぎても「遅れ」は出さない。速さや 1 日の時間を変えると、今日から全部引き直す。

export const PLAN_MINUTES = [15, 30, 45, 60];
export const PLAN_DEFAULT_MINUTES = 30;
export const MIN_PER_PAGE = 2;
export const DEFAULT_BOOK_MINUTES = 400;
export const MIN_LEFT_MINUTES = 30;

// ---- 日付（端末の現地の日付だけ・'YYYY-MM-DD'） ----
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function addDays(s, n) {
  const d = parseYmd(s);
  if (!d) return s;
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function daysBetween(a, b) {
  const x = parseYmd(a);
  const y = parseYmd(b);
  if (!x || !y) return 0;
  return Math.round((y - x) / 86400000);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// 本ごとに読んだ分（sessions は { book_id, seconds }）。
export function minutesByBook(sessions) {
  const m = new Map();
  for (const r of Array.isArray(sessions) ? sessions : []) {
    const id = r?.book_id ?? r?.bookId;
    const sec = Number(r?.seconds) || 0;
    if (!id || sec <= 0) continue;
    m.set(id, (m.get(id) || 0) + sec / 60);
  }
  return m;
}

// 本人の速さ（1 = ふつう・1 ページ 2 分）。分からなければ 1。
export function readingSpeedFactor(books, sessions) {
  const read = minutesByBook(sessions);
  const ratios = [];
  for (const b of Array.isArray(books) ? books : []) {
    if (b?.status !== 'done') continue;
    const pages = Number(b.totalPages) || 0;
    const min = read.get(b.id) || 0;
    if (pages < 30 || min < 30) continue;
    ratios.push(min / (pages * MIN_PER_PAGE));
  }
  if (!ratios.length) return 1;
  return Math.min(2, Math.max(0.5, Math.round(median(ratios) * 100) / 100));
}

// 1 冊にかかる分（残り）。
export function estimateBookMinutes(book, { speed = 1, readMinutes = 0 } = {}) {
  const target = Number(book?.readTargetMin) || 0;
  const pages = Number(book?.totalPages) || 0;
  let total;
  if (target > 0) total = target;
  else if (pages > 0) total = pages * MIN_PER_PAGE * speed;
  else total = DEFAULT_BOOK_MINUTES * speed;
  const left = book?.status === 'reading' ? total - (Number(readMinutes) || 0) : total;
  return Math.max(MIN_LEFT_MINUTES, Math.round(left));
}

// 順に並べた本（[{ bookId, minutes, phase, notBefore? }]）を、start の日から 1 日 minutesPerDay で割り振る。
//   notBefore（'YYYY-MM-DD'）があれば、その日より前には始めない（ロードマップの区切りが始まる日・前の区切りの本が早く終われば間があく）。
//   返り値: [{ bookId, phase, minutes, start, end, days }]（end はその本を読む最後の日・同じ日に 2 冊は置かない）。
export function scheduleBooks(items, { minutesPerDay = PLAN_DEFAULT_MINUTES, start } = {}) {
  const per = Math.max(5, Number(minutesPerDay) || PLAN_DEFAULT_MINUTES);
  let day = start;
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const minutes = Math.max(MIN_LEFT_MINUTES, Number(it.minutes) || 0);
    if (it.notBefore && parseYmd(it.notBefore) && it.notBefore > day) day = it.notBefore;
    const days = Math.max(1, Math.ceil(minutes / per));
    const end = addDays(day, days - 1);
    out.push({ bookId: it.bookId, phase: it.phase ?? 0, minutes, start: day, end, days });
    day = addDays(end, 1);
  }
  return out;
}

// ロードマップの区切りの順に、まだ読み終えていない本を並べる（同じ本は最初の区切りだけ）。
//   phaseStarts: 区切りが始まる日（'YYYY-MM-DD'・lib/goalRoadmap.js の phaseSpecs の startYm の 1 日）。
export function planItemsFromRoadmap(roadmap, books, { speed = 1, sessions = [], phaseStarts = [] } = {}) {
  const byId = new Map((Array.isArray(books) ? books : []).map((b) => [b.id, b]));
  const read = minutesByBook(sessions);
  const seen = new Set();
  const out = [];
  (roadmap?.phases || []).forEach((p, phase) => {
    for (const rb of p.books || []) {
      const b = byId.get(rb.bookId);
      if (!b || b.status === 'done' || seen.has(b.id)) continue;
      seen.add(b.id);
      out.push({ bookId: b.id, phase, notBefore: phaseStarts[phase] || null, minutes: estimateBookMinutes(b, { speed, readMinutes: read.get(b.id) || 0 }) });
    }
  });
  return out;
}

// 「3 日」「約 2 週間」「約 2 か月」
export function fmtSpan(days) {
  const d = Math.max(1, Math.round(days));
  if (d < 14) return `${d} 日`;
  if (d < 60) return `約 ${Math.round(d / 7)} 週間`;
  return `約 ${Math.round(d / 30)} か月`;
}
// 「11/16」「12/3」。refYear と違う年なら「2027/2/1」。
export function fmtMd(s, refYear = null) {
  const d = parseYmd(s);
  if (!d) return '';
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return refYear != null && d.getFullYear() !== refYear ? `${d.getFullYear()}/${md}` : md;
}
// 読む期間「11/16〜11/25」「11/26」（1 日だけなら 1 つ）。
export function fmtRange(start, end, refYear = null) {
  return start === end ? fmtMd(start, refYear) : `${fmtMd(start, refYear)}〜${fmtMd(end, refYear)}`;
}
// 「5 時間 20 分」「45 分」
export function fmtHoursMin(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} 分`;
  return r ? `${h} 時間 ${r} 分` : `${h} 時間`;
}

// ---- カレンダー（月曜はじまり・行動リストの「今週（月〜日）」と同じ） ----

// その月の週（各 7 日・前後の月の日は inMonth=false）。
export function monthWeeks(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 月=0
  const startDay = new Date(year, month, 1 - lead);
  const last = new Date(year, month + 1, 0);
  const trail = 6 - ((last.getDay() + 6) % 7);
  const total = lead + last.getDate() + trail;
  const weeks = [];
  for (let i = 0; i < total; i += 7) {
    const week = [];
    for (let j = 0; j < 7; j += 1) {
      const d = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i + j);
      week.push({ date: ymd(d), day: d.getDate(), inMonth: d.getMonth() === month });
    }
    weeks.push(week);
  }
  return weeks;
}

// 1 週の中の帯（本ごと・その週にかかる列）。col は 0〜6・span は列の数・head＝この週に読み始める・tail＝この週に読み終える。
export function weekBands(week, schedule) {
  const first = week[0].date;
  const last = week[6].date;
  const out = [];
  for (const s of Array.isArray(schedule) ? schedule : []) {
    if (s.end < first || s.start > last) continue;
    const from = s.start < first ? first : s.start;
    const to = s.end > last ? last : s.end;
    const col = daysBetween(first, from);
    out.push({ bookId: s.bookId, phase: s.phase, col, span: daysBetween(from, to) + 1, head: s.start >= first, tail: s.end <= last });
  }
  return out;
}

// 予定のある月の範囲（[{ year, month }]・はじめの月から最後の月まで）。
export function planMonths(schedule, today) {
  const startS = schedule?.[0]?.start || today;
  const endS = schedule?.length ? schedule[schedule.length - 1].end : today;
  const a = parseYmd(startS < today ? startS : today);
  const b = parseYmd(endS);
  if (!a || !b) return [];
  const out = [];
  const d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b && out.length < 72) {
    out.push({ year: d.getFullYear(), month: d.getMonth() });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

// 今日はどの本を読む日か（無ければ null）。
export function bookOnDay(schedule, day) {
  return (schedule || []).find((s) => s.start <= day && day <= s.end) || null;
}
