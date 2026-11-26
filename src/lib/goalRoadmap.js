// 🗺 目標のロードマップ（2026-11-15 オーナー「それぞれの目標を達成するには？を深掘りして、ロードマップで何が必要かを明確に。課題ややるべきことが見える」）。
//
// 流れ: 目標（lib/goals.js）→ 「達成するには？」の深掘り（AI が 1 つずつ聞く・2 つまで・purpose 'goal_interview'）
//   → ロードマップ（1 回の答え・purpose 'goal_roadmap'）: 必要なこと・今の課題・区切りごとにやること・読む本（本棚から）・本棚に無いテーマ
//   → 読書計画カレンダー（lib/readingPlan.js・日付はアプリが決める）。
// ここは画面に依存しない小道具（区切りの期間・AI に渡す本棚の一覧・答えの解析・保存・相談に渡す短い文）。
// 言い切らない（「達成できます」「必ず」）・数字の目標（%・あと N 冊）を作らない＝指示文（prompts.js の goalRoadmap）で頼み、ここでも消す。

import { supabase, isSupabaseConfigured } from './supabase';
import { horizonOf, goalDeadline, fmtGoalDeadline, GOAL_HORIZONS, ALL_GOALS_KEY } from './goals';
import {
  estimateBookMinutes, PLAN_DEFAULT_MINUTES, readingSpeedFactor, planItemsFromRoadmap, planItemsFromOrder, scheduleBooks, bookOnDay, isPlanSkipped,
} from './readingPlan';

// 聞き返しは 2 つまで（相談と同じ・ゴールが見えるように）。
export const GOAL_ASK_LIMIT = 2;
// 3 つの目標の 8 つの区切り・本は読める目安まで入るので、前より長い（2026-11-16）。
export const ROADMAP_MAX_TOKENS = 5000;
// 画面の目安（つくる・つくり直す・見直す）。
export const ROADMAP_TOKENS_LABEL = '約 35 トークン';
export const INTERVIEW_MAX_TOKENS = 600;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const cut = (s, n) => {
  const t = str(s).replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n) : t;
};
// 言い切り・数字の目標を消す（AI の文の後始末）。
const SOFTEN = [
  [/必ず/g, ''],
  [/達成できます/g, '近づけます'],
  [/確実に/g, ''],
];
const soften = (s) => SOFTEN.reduce((t, [re, to]) => t.replace(re, to), s).replace(/\s{2,}/g, ' ').trim();

// ---- 区切り ----
//   3 つの目標（'all'）: 1 年目は 3 か月ずつ 4 つ（→ 1 年後の目標）、2・3 年目（→ 3 年後）、4・5 年目（→ 5 年後）の 8 つ。
//   1 つの目標だけ（前の版の記録）: 1 年後＝3 か月ずつ 4 つ・3 年後＝1 年ずつ 3 つ・5 年後＝1 年ずつ 5 つ。
const SEGMENTS = {
  [ALL_GOALS_KEY]: [{ n: 4, months: 3, goal: 'y1' }, { n: 2, months: 12, goal: 'y3' }, { n: 2, months: 12, goal: 'y5' }],
  y1: [{ n: 4, months: 3, goal: 'y1' }],
  y3: [{ n: 3, months: 12, goal: 'y3' }],
  y5: [{ n: 5, months: 12, goal: 'y5' }],
};
export function phaseSpecs(horizonKey, at) {
  const segs = SEGMENTS[horizonKey];
  const start = new Date(at);
  if (!segs || !Number.isFinite(start.getTime())) return [];
  const out = [];
  let offset = 0; // 起点から何か月目
  for (const seg of segs) {
    for (let i = 0; i < seg.n; i += 1) {
      const a = new Date(start.getFullYear(), start.getMonth() + offset, 1);
      const b = new Date(start.getFullYear(), start.getMonth() + offset + seg.months - 1, 1);
      const label = seg.months === 3 ? `${offset + 1}〜${offset + 3} か月目` : `${Math.floor(offset / 12) + 1} 年目`;
      const range = a.getFullYear() === b.getFullYear()
        ? `${a.getFullYear()}.${a.getMonth() + 1}–${b.getMonth() + 1}`
        : `${a.getFullYear()}.${a.getMonth() + 1}–${b.getFullYear()}.${b.getMonth() + 1}`;
      out.push({ label, range, months: seg.months, goal: seg.goal, startYm: `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}` });
      offset += seg.months;
    }
  }
  return out;
}

// その区切りで読める冊数の目安（1 日の分 × 日数 ÷ 本棚の本の 1 冊の平均の分・1〜8 冊）。
//   2026-11-16 オーナー「該当期間でなぜか 2 冊まで」＝前は AI に「0〜3 冊」と頼んでいて、3 か月で 2 冊・残りが空いていた。
export const PHASE_BOOK_MAX = 8;
export function phaseBookCaps(specs, books = [], { minutesPerDay = PLAN_DEFAULT_MINUTES, speed = 1 } = {}) {
  const unread = (Array.isArray(books) ? books : []).filter((b) => b && !isPlanSkipped(b));
  const avg = unread.length ? unread.reduce((t, b) => t + estimateBookMinutes(b, { speed }), 0) / unread.length : 400 * speed;
  const per = Math.max(5, Number(minutesPerDay) || PLAN_DEFAULT_MINUTES);
  return (specs || []).map((sp) => Math.max(1, Math.min(PHASE_BOOK_MAX, Math.floor((sp.months * 30 * per) / Math.max(60, avg)))));
}

// 本を選ぶのは「この先 3 か月」が中心（2026-11-16 オーナー「5 年間の本を決めるのはしんどい。将来を見据えつつ、この先 3 か月の
//   読むべき本を決めていく」）。いまの区切り＝読める目安まで・次の区切り＝候補 2 冊まで・それより先＝本は選ばない（やることで示す）。
export const NEXT_PHASE_CANDIDATES = 2;
export function focusBookCaps(caps, here = 0) {
  return (caps || []).map((c, i) => (i === here ? c : i === here + 1 ? Math.min(NEXT_PHASE_CANDIDATES, c) : 0));
}

// AI に渡す 3 つの目標（「1 年後（2027 年 11 月まで）: …」）。
//   まだ書いていない目標は「（まだ決めていない）」と渡す（1 年後の目標だけでつくる人・2026-11-22）。
export function goalsPromptText(goals) {
  const anySet = GOAL_HORIZONS.some((h) => goals?.[h.key]?.text);
  return GOAL_HORIZONS
    .filter((h) => goals?.[h.key]?.text || anySet)
    .map((h) => (goals?.[h.key]?.text
      ? `${h.label}（${fmtGoalDeadline(goals[h.key].at, h.years)}）: ${cut(goals[h.key].text, 120)}`
      : `${h.label}: （まだ決めていない）`))
    .join('\n');
}

// AI に渡す区切り（「1. 1〜3 か月目（2026.11–2027.1）→ 1 年後の目標へ・読める目安 約 6 冊」）。
export function phasesPromptText(specs, caps = []) {
  return (specs || []).map((s, i) => {
    const goal = horizonOf(s.goal)?.label;
    const books = caps.length === 0 ? '' : caps[i] > 0 ? `・本は ${caps[i]} 冊まで` : '・本は選ばない';
    return `${i + 1}. ${s.label}（${s.range}）${goal ? `→ ${goal}の目標へ` : ''}${books}`;
  }).join('\n');
}

// いまどの区切りにいるか（0 から）。
export function currentPhaseIndex(horizonKey, at, now = new Date()) {
  const specs = phaseSpecs(horizonKey, at);
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let idx = 0;
  specs.forEach((s, i) => { if (s.startYm <= ym) idx = i; });
  return idx;
}

// ---- AI に渡す本棚（本の id は渡さず B1… の印で） ----
const STATUS_JA = { want: '読みたい', before: '積読', reading: '読書中', done: '読了' };
export function shelfMaterial(books, { maxUnread = 40, maxDone = 20 } = {}) {
  const list = Array.isArray(books) ? books : [];
  // アーカイブした本は読む本として渡さない（2026-11-26・読書計画に置かない本と同じ）。
  const unread = list.filter((b) => b && !isPlanSkipped(b) && str(b.title))
    .sort((a, b) => ({ reading: 0, before: 1, want: 2 }[a.status] ?? 3) - ({ reading: 0, before: 1, want: 2 }[b.status] ?? 3))
    .slice(0, maxUnread);
  const done = list.filter((b) => b?.status === 'done' && str(b.title)).slice(0, maxDone);
  const keyToId = {};
  const lines = unread.map((b, i) => {
    const key = `B${i + 1}`;
    keyToId[key] = b.id;
    const fields = Array.isArray(b.tags) ? b.tags.slice(0, 2).join('・') : '';
    const purpose = cut(b.investPurpose, 60);
    return `${key} | ${STATUS_JA[b.status] || ''} | 『${cut(b.title, 60)}』${b.author ? ` ${cut(b.author, 30)}` : ''}${fields ? ` | 分野: ${fields}` : ''}${purpose ? ` | 得たいこと: ${purpose}` : ''}`;
  });
  const doneLines = done.map((b) => `『${cut(b.title, 60)}』${b.rating ? ` ★${b.rating}` : ''}`);
  // AI がすすめた本の書名が本棚の本と同じなら、その本にする（読了の本はすすめない）。
  const titleToId = {};
  for (const b of list) if (b?.id && str(b.title)) titleToId[titleKey(b.title)] = { id: b.id, done: isPlanSkipped(b) };
  return { text: lines.join('\n'), doneText: doneLines.join('\n'), keyToId, titleToId, count: lines.length };
}

// 書名の比べ方（『』・空白・記号・大小を無視）。
export function titleKey(t) {
  return String(t || '').replace(/[『』「」\s\u3000・:：\-－—=＝!！?？]/g, '').toLowerCase();
}
// ロードマップの本の 1 冊の目印（本棚の本は id・すすめた本は書名）。
export const roadmapBookKey = (b) => (b?.bookId ? `id:${b.bookId}` : `t:${titleKey(b?.title)}`);

// ---- 深掘りの問いと答え（AI に渡す形） ----
export function priorQAText(qa) {
  return (Array.isArray(qa) ? qa : [])
    .filter((x) => str(x?.q))
    .map((x, i) => `Q${i + 1}. ${cut(x.q, 120)}\nA${i + 1}. ${cut(x.a, 400) || '（答えなし）'}`)
    .join('\n');
}

// 上の目標（1 年後には 3 年後・5 年後を、3 年後には 5 年後を）の短い文。
export function higherGoalsText(horizonKey, goals, roadmaps = {}) {
  const order = ['y1', 'y3', 'y5'];
  const i = order.indexOf(horizonKey);
  const out = [];
  for (const k of order.slice(i + 1)) {
    const g = goals?.[k];
    if (!g?.text) continue;
    const needs = (roadmaps?.[k]?.roadmap?.needs || []).map((n) => n.name).slice(0, 5).join('・');
    out.push(`${horizonOf(k).label}: ${g.text}${needs ? `（必要なこと: ${needs}）` : ''}`);
  }
  return out.join('\n');
}

// 本の並び（AI の答え）を解く: 本棚の本 { bookId, why } か、すすめる本 { title, author, why }。
//   used（既に挙げた本の印）と重ならない・読了の本は外す・cap 冊まで。
function parseBookList(list, cap, used, keyToId, titleToId) {
  const books = [];
  for (const rb of Array.isArray(list) ? list : []) {
    if (books.length >= cap) break;
    const why = soften(cut(rb?.why, 60));
    const key = str(rb?.key || rb?.id).toUpperCase();
    let bookId = key ? keyToId?.[key] : null;
    let rec = null;
    if (!bookId) {
      const title = cut(str(rb?.title).replace(/^[『「]|[』」]$/g, ''), 80);
      if (!title) continue;
      const shelf = titleToId?.[titleKey(title)];
      if (shelf?.done) continue;
      if (shelf) bookId = shelf.id;
      else rec = { title, author: cut(rb?.author, 40), why };
    }
    const k = bookId ? `id:${bookId}` : `t:${titleKey(rec.title)}`;
    if (used.has(k)) continue;
    used.add(k);
    books.push(bookId ? { bookId, why } : rec);
  }
  return books;
}

// ---- ロードマップの答えを解く ----
//   { needs:[{name, why}], issues:[string], phases:[{focus, todos:[string], books:[{bookId, why}]}], missing:[{theme, why}] } | null
//   books の 1 冊は 本棚の本 { bookId, why } か、すすめる本 { title, author, why }（2026-11-16 オーナー
//   「持っている本を無理やり当てはめるのは嫌だ。読むべき本を勧めて欲しい」）。すすめる本は画面に出す前に実在を確かめる
//   （verifyRoadmapRecs）。titleToId があれば、すすめた本が本棚にあるときはその本に（読了の本は外す）。
export function parseRoadmap(text, keyToId, phaseCount, caps = [], titleToId = {}) {
  if (typeof text !== 'string') return null;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const needs = (Array.isArray(obj.needs) ? obj.needs : [])
    .map((n) => ({ name: soften(cut(n?.name, 24)), why: soften(cut(n?.why, 90)) }))
    .filter((n) => n.name)
    .slice(0, 6);
  const issues = (Array.isArray(obj.issues) ? obj.issues : [])
    .map((x) => soften(cut(typeof x === 'string' ? x : x?.text, 110)))
    .filter(Boolean)
    .slice(0, 3);
  const used = new Set();
  const rawPhases = Array.isArray(obj.phases) ? obj.phases : [];
  const n = Math.max(1, Math.min(phaseCount || rawPhases.length || 1, 8));
  const phases = [];
  for (let i = 0; i < n; i += 1) {
    const p = rawPhases[i] || {};
    // caps があれば区切りごとの上限（0＝本を選ばない区切り）・無ければ前の版と同じ 3 冊まで。
    const cap = caps.length ? (caps[i] || 0) : 3;
    const books = parseBookList(p.books, cap, used, keyToId, titleToId);
    phases.push({
      focus: soften(cut(p.focus, 60)),
      // やること（AI の一般論）は作らない（2026-11-16 オーナー「行動は本を読まないと見つけられない」）。前の版の答えに入っていても捨てる。
      todos: [],
      books,
    });
  }
  const missing = (Array.isArray(obj.missing) ? obj.missing : [])
    .map((m) => ({ theme: soften(cut(m?.theme, 30)), why: soften(cut(m?.why, 80)) }))
    .filter((m) => m.theme)
    .slice(0, 3);
  if (!needs.length && !phases.some((p) => p.focus)) return null;
  return { needs, issues, phases, missing };
}

// ---- 見直し（相談・AI 選書から・2026-11-15 オーナー「自分が認識していない課題を新たに見つけたら、課題もロードマップもカレンダーも更新」） ----

// いまのロードマップを AI に渡す文（本は B1… の印で・本棚の一覧に無い本は書名だけ）。
export function roadmapPromptText(roadmap, keyToId, books = [], specs = []) {
  const idToKey = Object.fromEntries(Object.entries(keyToId || {}).map(([k, id]) => [id, k]));
  const titleOf = new Map((books || []).map((b) => [b.id, b.title]));
  const lines = [];
  lines.push(`必要なこと: ${(roadmap?.needs || []).map((n) => n.name).join('・') || '（なし）'}`);
  lines.push(`今の課題: ${(roadmap?.issues || []).join(' / ') || '（なし）'}`);
  (roadmap?.phases || []).forEach((p, i) => {
    const bs = (p.books || []).map((b) => (b.bookId ? (idToKey[b.bookId] || (titleOf.get(b.bookId) ? `『${cut(titleOf.get(b.bookId), 40)}』` : '')) : (b.title ? `『${cut(b.title, 40)}』（本棚に無い）` : ''))).filter(Boolean).join('・');
    lines.push(`${i + 1}. ${specs[i]?.label || ''}: ${p.focus || ''}${bs ? ` 本: ${bs}` : ''}`);
  });
  return lines.join('\n');
}

// 見直しの答え。{ found:false } か { found:true, newIssues, note, roadmap }（読めなければ null）。
//   いまの区切りより前の区切りは、前のロードマップのまま残す（AI が過去を書き換えない）。
export function parseRoadmapUpdate(text, keyToId, prev, hereIndex = 0, caps = [], titleToId = {}) {
  if (typeof text !== 'string') return null;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  if (obj.found !== true) return { found: false };
  const n = prev?.phases?.length || 1;
  const next = parseRoadmap(JSON.stringify(obj), keyToId, n, caps, titleToId);
  if (!next) return { found: false };
  const keep = Math.max(0, Math.min(hereIndex, n));
  for (let i = 0; i < keep; i += 1) if (prev?.phases?.[i]) next.phases[i] = prev.phases[i];
  // 前に残した区切りの本と、直した区切りの本が重ならないように（前に残した方を優先）。
  const seen = new Set();
  next.phases = next.phases.map((p) => ({ ...p, books: (p.books || []).filter((b) => { const k = roadmapBookKey(b); return seen.has(k) ? false : (seen.add(k), true); }) }));
  const newIssues = (Array.isArray(obj.newIssues) ? obj.newIssues : []).map((x) => soften(cut(x, 60))).filter(Boolean).slice(0, 2);
  if (!newIssues.length) return { found: false };
  return { found: true, newIssues, note: soften(cut(obj.note, 80)), roadmap: next };
}

// ---- この 3 か月の本を選ぶ（2026-11-17 オーナー「1 か月・3 か月・1 年でも使えるか」） ----
//   ロードマップは最初の 3 か月（と次の候補）にしか本を選ばないので、区切りが進むと本が無くなる。
//   いまの区切り＋次の区切りの本だけを、読み終えた本とその評価を踏まえて選び直す（ほかの区切り・必要なこと・課題は変えない）。
export const PHASE_BOOKS_MAX_TOKENS = 1500;
export const PHASE_BOOKS_TOKENS_LABEL = '約 15 トークン';

// いまの区切りに、まだ読んでいない本（本棚の本かすすめた本）が無い。
export function phaseNeedsBooks(roadmap, books, here) {
  const p = roadmap?.phases?.[here];
  if (!p) return false;
  const byId = new Map((books || []).map((b) => [b.id, b]));
  // アーカイブした本も読み終えた本と同じに数えない（2026-11-26）。
  return !(p.books || []).some((b) => !b.bookId || (byId.get(b.bookId) && !isPlanSkipped(byId.get(b.bookId))));
}

// 答え {"now":{"books":[…]},"next":{"books":[…]}} を、いまのロードマップの 2 つの区切りに入れる（読めなければ null）。
export function parsePhaseBooks(text, keyToId, prev, here, caps = [], titleToId = {}, doneIds = null) {
  if (typeof text !== 'string' || !prev?.phases?.length) return null;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const n = prev.phases.length;
  const idx = Math.max(0, Math.min(here, n - 1));
  // ほかの区切りに入っている本とは重ねない。
  const used = new Set();
  prev.phases.forEach((p, i) => { if (i !== idx && i !== idx + 1) (p.books || []).forEach((b) => used.add(roadmapBookKey(b))); });
  (prev.phases[idx]?.books || []).forEach((b) => { if (b.bookId && doneIds?.has(b.bookId)) used.add(roadmapBookKey(b)); });
  const nowBooks = parseBookList(obj.now?.books, Math.max(1, caps[idx] || 3), used, keyToId, titleToId);
  const nextBooks = idx + 1 < n ? parseBookList(obj.next?.books, Math.min(NEXT_PHASE_CANDIDATES, caps[idx + 1] || NEXT_PHASE_CANDIDATES), used, keyToId, titleToId) : [];
  if (!nowBooks.length) return null;
  // いまの区切りで読み終えた本は残す（その 3 か月に読んだ記録）・まだの本は入れ替える。
  const keptDone = (prev.phases[idx].books || []).filter((b) => b.bookId && doneIds?.has(b.bookId));
  const phases = prev.phases.map((p, i) => {
    if (i === idx) return { ...p, books: [...keptDone, ...nowBooks.filter((b) => !keptDone.some((k) => k.bookId && k.bookId === b.bookId))] };
    if (i === idx + 1) return { ...p, books: nextBooks };
    return p;
  });
  return { ...prev, phases };
}

// ---- 読むペース（2026-11-17 オーナー「本を読むペースがバラバラでも、心地よく自分を引き上げてくれる設計に」） ----
//   前の 3 か月（90 日）に読み終えた本と読書の時間。次の 3 か月に選ぶ冊数は「前の 3 か月より 1 冊だけ多く」
//   （読めなかった 3 か月のあとは 1 冊から）。ただし 1 日に読む時間で読める分（fallback）を超えない。
//   前の区切りの本が残っていれば、その分は新しく選ばない（積み上げない）。遅れ・%・「あと N 冊」は出さない。
export const PACE_DAYS = 90;
const dayMs = 86400000;
export function readingPace(books, sessions, now = new Date(), days = PACE_DAYS) {
  const to = now.getTime();
  const from = to - days * dayMs;
  const inWin = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) && t >= from && t <= to + dayMs; };
  const doneBooks = (Array.isArray(books) ? books : [])
    .filter((b) => b?.status === 'done' && inWin(b.doneDate || b.done_date))
    .sort((a, b) => String(b.doneDate || b.done_date).localeCompare(String(a.doneDate || a.done_date)));
  const minutes = (Array.isArray(sessions) ? sessions : [])
    .filter((r) => inWin(r?.started_at))
    .reduce((t, r) => t + (Number(r?.seconds) || 0) / 60, 0);
  return { doneBooks, doneCount: doneBooks.length, minutes: Math.round(minutes) };
}

// 前の区切りから残っている本（本棚にある・まだ読み終えていない）。
export function leftoverBooks(roadmap, books, here) {
  const byId = new Map((books || []).map((b) => [b.id, b]));
  const out = [];
  (roadmap?.phases || []).slice(0, Math.max(0, here)).forEach((p) => (p.books || []).forEach((rb) => {
    const b = rb.bookId ? byId.get(rb.bookId) : null;
    if (b && !isPlanSkipped(b) && !out.includes(b)) out.push(b); // アーカイブした本は残りに数えない（2026-11-26）
  }));
  return out;
}

// 次の 3 か月に選ぶ冊数。{ count, base, mode: 'first'|'pace'|'rest' }
//   first＝記録がまだ無い（1 日の時間で読める分）・pace＝前の 3 か月＋1 冊・rest＝読めなかった 3 か月のあと（1 冊から）。
export function quarterBookCount({ pace, fallback = 3, leftover = 0, hasHistory = false }) {
  const cap = Math.max(1, Math.min(PHASE_BOOK_MAX, fallback || 1));
  let base;
  let mode;
  if (!hasHistory) { base = cap; mode = 'first'; } else if (!pace?.doneCount) { base = 1; mode = 'rest'; } else { base = Math.min(cap, pace.doneCount + 1); mode = 'pace'; }
  return { count: Math.max(0, base - Math.max(0, leftover)), base, mode };
}

// これまでの道のり（作り直す・見直すときに AI に渡す・600 字まで）。前のまとめ・課題・作ってから読み終えた本。
export function historyText(record, books) {
  if (!record?.roadmap) return '';
  const since = new Date(record.goalAt).getTime();
  const read = (books || []).filter((b) => b?.status === 'done' && new Date(b.doneDate || b.done_date).getTime() >= since)
    .slice(0, 12).map((b) => `『${cut(b.title, 40)}』${b.rating ? `★${b.rating}` : ''}`);
  const lines = [];
  if (record.summary) lines.push(`前のまとめ: ${cut(record.summary, 160)}`);
  if (record.roadmap.issues?.length) lines.push(`前の課題: ${record.roadmap.issues.map((t) => cut(t, 60)).join(' / ')}`);
  lines.push(`ロードマップを作ってから読み終えた本: ${read.length ? read.join('、') : 'なし'}`);
  return cut(lines.join('\n'), 600);
}

// 次の 3 か月の本の決め方（画面と AI で同じ）。record が無い（はじめてつくる）ときは at から。
export function quarterPlanFor({ record = null, at = null, books = [], sessions = [], now = new Date(), minutesPerDay, usedBefore = false } = {}) {
  const anchor = record?.goalAt || at;
  const specs = phaseSpecs(ALL_GOALS_KEY, anchor);
  const here = currentPhaseIndex(ALL_GOALS_KEY, anchor, now);
  const speed = readingSpeedFactor(books, sessions);
  const fallback = phaseBookCaps(specs, books, { minutesPerDay: minutesPerDay || record?.plan?.minutesPerDay || PLAN_DEFAULT_MINUTES, speed })[here] || 3;
  const pace = readingPace(books, sessions, now);
  const roadmap = record?.roadmap ? pruneRoadmapBooks(record.roadmap, books) : null;
  const leftover = roadmap ? leftoverBooks(roadmap, books, here) : [];
  const ageDays = record?.goalAt ? (now.getTime() - new Date(record.goalAt).getTime()) / dayMs : 0;
  const hasHistory = pace.doneCount > 0 || ageDays >= 60 || usedBefore;
  return { here, pace, leftover, fallback, hasHistory, ...quarterBookCount({ pace, fallback, leftover: leftover.length, hasHistory }) };
}

// 期限を過ぎた目標（書いた日から 1・3・5 年）。[{ key, label, deadline }]
export function overdueGoals(goals, now = new Date()) {
  return GOAL_HORIZONS.filter((h) => goals?.[h.key]?.text).map((h) => {
    const d = goalDeadline(goals[h.key].at, h.years);
    return d && d.getTime() < now.getTime() ? { key: h.key, label: h.label, deadline: d } : null;
  }).filter(Boolean);
}

// ロードマップが、いまの目標と合っていない（目標を書き直した・1 年後の目標を延ばして起点が 60 日以上動いた）。
export function isRoadmapStale(record, goals) {
  if (!record?.roadmap) return false;
  const textChanged = GOAL_HORIZONS.some((h) => record.goals?.[h.key]?.text && cleanText(record.goals[h.key].text) !== cleanText(goals?.[h.key]?.text || ''));
  // つくったときに無かった目標を、あとから書いた（1 年後だけでつくった人が 3 年後・5 年後を書いた・2026-11-22）。
  const added = GOAL_HORIZONS.some((h) => !record.goals?.[h.key]?.text && goals?.[h.key]?.text);
  if (added) return true;
  // 期限を延ばしただけ（「この目標で続ける」＝文は同じ）は古くない（2026-11-17 点検: 続けると選んだ人に、つくり直しを主ボタンですすめていた）。
  return textChanged;
}
const cleanText = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// 見直しの履歴（新しい順・5 件まで）。source: 'consult' | 'advisor'。
export function withUpdateLog(record, { source, newIssues, note, at = new Date().toISOString(), prevRoadmap }) {
  const updates = [{ at, source, newIssues, note }, ...(record?.updates || [])].slice(0, 5);
  return { ...record, updates, prevRoadmap: prevRoadmap || record?.roadmap || null };
}

// ロードマップがあれば ['all']（3 つの目標をつなぐ 1 本・2026-11-16）。無ければ []。
export function roadmapHorizons(goals, records) {
  return records?.[ALL_GOALS_KEY]?.roadmap ? [ALL_GOALS_KEY] : [];
}

// 本棚から消えた本を外す（開くたびに）。
export function pruneRoadmapBooks(roadmap, books) {
  if (!roadmap) return roadmap;
  const ids = new Set((books || []).map((b) => b.id));
  // すすめた本（まだ本棚に無い・bookId が無い）は残す。本棚に入ったら（同じ書名）その本にする。
  const byTitle = new Map((books || []).map((b) => [titleKey(b.title), b]));
  return {
    ...roadmap,
    phases: (roadmap.phases || []).map((p) => ({
      ...p,
      books: (p.books || []).map((b) => {
        if (b.bookId) return ids.has(b.bookId) ? b : null;
        const shelf = byTitle.get(titleKey(b.title));
        if (shelf) return isPlanSkipped(shelf) ? null : { bookId: shelf.id, why: b.why }; // アーカイブした本もすすめ直さない（2026-11-26）
        return b;
      }).filter(Boolean),
    })),
  };
}

// ---- すすめた本の実在を確かめる（AI 選書と同じ・lib/bookCover.js の verifyBookExists） ----
//   実在を確かめられた本だけを残す（書誌で見つからない・確かめられない本は出さない＝無い本をすすめない）。
//   確かめられなかった本は少し待って 1 回だけ確かめ直す。ISBN と表紙の候補を付ける。
export async function verifyRoadmapRecs(roadmap, verify, { pause = 250, timeoutMs = 6000 } = {}) {
  if (!roadmap || typeof verify !== 'function') return roadmap;
  const once = (b) => Promise.race([
    Promise.resolve().then(() => verify({ title: b.title, author: b.author })).catch(() => ({ exists: null })),
    new Promise((r) => { setTimeout(() => r({ exists: null }), timeoutMs); }),
  ]);
  const phases = [];
  for (const p of roadmap.phases || []) {
    const books = [];
    for (const b of p.books || []) {
      if (b.bookId) { books.push(b); continue; }
      // eslint-disable-next-line no-await-in-loop
      let v = await once(b);
      if (v?.exists == null) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 1500); });
        // eslint-disable-next-line no-await-in-loop
        v = await once(b);
      }
      if (v?.exists === true) books.push({ ...b, isbn: v.isbn || '', cover: v.cover || (v.candidates || [])[0] || '' });
      // eslint-disable-next-line no-await-in-loop
      if (pause) await new Promise((r) => { setTimeout(r, pause); });
    }
    phases.push({ ...p, books });
  }
  return { ...roadmap, phases };
}

// AI 選書に入れる相談の下書き（送らない）。目標の文（「〜している」の叶った姿）をそのままつなげず、
//   「1 年後の目標は「…」。」＋学びたいこと＋問い、の形に（2026-11-16 オーナー「本を探すの指示文がズレている」）。
export function advisorDraftFor(goals, { theme = '', focus = '' } = {}) {
  const g = String(goals?.y1?.text || '').replace(/[。．.\s]+$/u, '').replace(/。\s*/g, '、');
  const parts = [];
  if (g) parts.push(`1 年後の目標は「${g}」です。`);
  if (theme) parts.push(`そのために、${theme}について学べる本を読みたいです。`);
  else if (focus) parts.push(`いまは「${focus}」に取り組んでいます。`);
  parts.push(theme ? 'いまの自分に合う本は？' : 'この 3 か月で読むなら、どの本？');
  return parts.join('');
}

// ---- 読書計画の日付（読書計画の画面とホームの「読書計画」の行で同じ割り振り） ----
//   返り値: { schedule, here, specs }（ロードマップが無い・読む本が無ければ schedule は []）。
export function planScheduleFor(record, books, sessions, today) {
  const roadmap = record?.roadmap ? pruneRoadmapBooks(record.roadmap, books) : null;
  if (!roadmap) return { schedule: [], here: 0, specs: [] };
  const specs = phaseSpecs(ALL_GOALS_KEY, record.goalAt);
  const here = currentPhaseIndex(ALL_GOALS_KEY, record.goalAt, new Date(`${today}T12:00:00`));
  const speed = readingSpeedFactor(books, sessions);
  const order = Array.isArray(record.plan?.order) && record.plan.order.length ? record.plan.order : null;
  const phaseOf = new Map();
  roadmap.phases.forEach((p, i) => p.books.forEach((b) => { if (!phaseOf.has(b.bookId)) phaseOf.set(b.bookId, i); }));
  // 順番を決めたあとにロードマップへ入った本も最後に（2026-11-26・readingPlan.js の planItemsFromOrder）。
  const items = order
    ? planItemsFromOrder(order, books, { speed, sessions, phaseOf, fallbackPhase: here, roadmap, known: Array.isArray(record.plan?.orderKnown) ? record.plan.orderKnown : null })
    : planItemsFromRoadmap(roadmap, books, { speed, sessions, phaseStarts: specs.map((x) => `${x.startYm}-01`) });
  const schedule = scheduleBooks(items, { minutesPerDay: record.plan?.minutesPerDay || PLAN_DEFAULT_MINUTES, start: today });
  return { schedule, here, specs };
}

// ホームの 1 行: 今日読む本（無ければ次の本と始める日）。読書計画が無ければ null。
export function todayPlanItem(record, books, sessions, today) {
  const { schedule } = planScheduleFor(record, books, sessions, today);
  if (!schedule.length) return null;
  const now = bookOnDay(schedule, today);
  if (now) return { kind: 'today', ...now };
  const next = schedule.find((x) => x.start > today);
  return next ? { kind: 'next', ...next } : null;
}

// ---- 相談の材料（短く・2026-11-15 オーナー決定「目標とロードマップを相談の材料に入れる」） ----
//   目標 3 つ＋いちばん近い目標のいまの区切りの「必要なこと・今の課題・やること」。600 字まで。
export function goalsConsultBlock(goals, records = {}, now = new Date()) {
  const lines = [];
  for (const k of ['y1', 'y3', 'y5']) {
    const g = goals?.[k];
    if (!g?.text) continue;
    const d = goalDeadline(g.at, horizonOf(k).years);
    lines.push(`- ${horizonOf(k).label}${d ? `（${d.getFullYear()} 年 ${d.getMonth() + 1} 月まで）` : ''}: ${g.text}`);
  }
  if (!lines.length) return '';
  const r = records?.[ALL_GOALS_KEY];
  if (r?.roadmap) {
    const rm = r.roadmap;
    const idx = currentPhaseIndex(ALL_GOALS_KEY, r.goalAt, now);
    const ph = rm.phases?.[idx];
    const needs = (rm.needs || []).map((x) => x.name).slice(0, 5).join('・');
    if (needs) lines.push(`必要なこと: ${needs}`);
    if (rm.issues?.length) lines.push(`今の課題: ${rm.issues.slice(0, 2).join(' / ')}`);
    if (ph?.focus) lines.push(`いまの区切りで取り組むこと: ${ph.focus}`);
  }
  const text = lines.join('\n');
  return text.length > 600 ? text.slice(0, 600) : text;
}

// ---- 保存（goal_roadmaps＝supabase_goal_roadmaps.sql・未適用なら端末だけ） ----
//   1 つの目標に 1 行: { horizon, goal_text, goal_at, data: { qa, summary, roadmap, plan }, updated_at }
const LS_KEY = 'orime.goalRoadmaps.v1';
const lsKey = (uid) => `${LS_KEY}:${uid || 'anon'}`;

function readLocal(uid) {
  try { return JSON.parse(window.localStorage.getItem(lsKey(uid)) || '{}') || {}; } catch { return {}; }
}
function writeLocal(uid, map) {
  try { window.localStorage.setItem(lsKey(uid), JSON.stringify(map)); } catch { /* 端末に残せなくても動く */ }
}
const isMissingTable = (err) => {
  const m = String(err?.message || err?.code || '').toLowerCase();
  return m.includes('goal_roadmaps') || m.includes('does not exist') || m.includes('pgrst205') || m.includes('42p01') || m.includes('schema cache');
};

async function uid() {
  if (!isSupabaseConfigured) return null;
  try { const { data } = await supabase.auth.getSession(); return data?.session?.user?.id || null; } catch { return null; }
}

export const ROADMAPS_CHANGED_EVENT = 'orime:roadmaps-changed';

// 端末に控えたロードマップ（同期で読む・画面の最初の描画用＝目標の 1 行を後から差し込まない・2026-11-21）。
export function localRoadmaps(userId) {
  if (!userId) return {};
  return readLocal(userId);
}

// { y1: record, y3: record, y5: record }（record＝{ goalText, goalAt, qa, summary, roadmap, plan, updatedAt }）
export async function loadRoadmaps() {
  const id = await uid();
  const local = readLocal(id);
  if (!id) return local;
  try {
    const { data, error } = await supabase.from('goal_roadmaps').select('horizon, goal_text, goal_at, data, updated_at').eq('user_id', id);
    if (error) throw error;
    const out = { ...local };
    for (const r of data || []) {
      const rec = { goalText: r.goal_text, goalAt: r.goal_at, ...(r.data || {}), updatedAt: r.updated_at };
      const loc = local[r.horizon];
      out[r.horizon] = loc && loc.updatedAt > rec.updatedAt ? loc : rec;
    }
    writeLocal(id, out);
    return out;
  } catch (e) {
    if (!isMissingTable(e)) console.warn('[goal-roadmaps] load failed:', e?.message);
    return local;
  }
}

export async function saveRoadmap(horizon, record) {
  const id = await uid();
  const rec = { ...record, updatedAt: new Date().toISOString() };
  const map = { ...readLocal(id), [horizon]: rec };
  writeLocal(id, map);
  try { window.dispatchEvent(new CustomEvent(ROADMAPS_CHANGED_EVENT, { detail: { horizon } })); } catch { /* ignore */ }
  if (!id) return { record: rec, synced: false };
  try {
    const { goalText, goalAt, updatedAt, ...data } = rec;
    const { error } = await supabase.from('goal_roadmaps').upsert(
      { user_id: id, horizon, goal_text: goalText, goal_at: goalAt, data, updated_at: updatedAt },
      { onConflict: 'user_id,horizon' },
    );
    if (error) throw error;
    return { record: rec, synced: true };
  } catch (e) {
    if (!isMissingTable(e)) console.warn('[goal-roadmaps] save failed:', e?.message);
    return { record: rec, synced: false };
  }
}

export async function deleteRoadmap(horizon) {
  const id = await uid();
  const map = { ...readLocal(id) };
  delete map[horizon];
  writeLocal(id, map);
  try { window.dispatchEvent(new CustomEvent(ROADMAPS_CHANGED_EVENT, { detail: { horizon } })); } catch { /* ignore */ }
  if (!id) return;
  try { await supabase.from('goal_roadmaps').delete().eq('user_id', id).eq('horizon', horizon); } catch { /* 端末からは消えた */ }
}

// その場で（同期で）分かるロードマップ（相談の材料を組むとき）。
export function roadmapsFor(userId) {
  return readLocal(userId);
}
