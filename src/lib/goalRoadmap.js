// 🗺 目標のロードマップ（2026-11-15 オーナー「それぞれの目標を達成するには？を深掘りして、ロードマップで何が必要かを明確に。課題ややるべきことが見える」）。
//
// 流れ: 目標（lib/goals.js）→ 「達成するには？」の深掘り（AI が 1 つずつ聞く・2 つまで・purpose 'goal_interview'）
//   → ロードマップ（1 回の答え・purpose 'goal_roadmap'）: 必要なこと・今の課題・区切りごとにやること・読む本（本棚から）・本棚に無いテーマ
//   → 読書計画カレンダー（lib/readingPlan.js・日付はアプリが決める）。
// ここは画面に依存しない小道具（区切りの期間・AI に渡す本棚の一覧・答えの解析・保存・相談に渡す短い文）。
// 言い切らない（「達成できます」「必ず」）・数字の目標（%・あと N 冊）を作らない＝指示文（prompts.js の goalRoadmap）で頼み、ここでも消す。

import { supabase, isSupabaseConfigured } from './supabase';
import { horizonOf, goalDeadline } from './goals';

// 聞き返しは 2 つまで（相談と同じ・ゴールが見えるように）。
export const GOAL_ASK_LIMIT = 2;
export const ROADMAP_MAX_TOKENS = 2800;
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

// ---- 区切り（1 年後＝3 か月ずつ 4 つ・3 年後＝1 年ずつ 3 つ・5 年後＝1 年ずつ 5 つ） ----
export function phaseSpecs(horizonKey, at) {
  const h = horizonOf(horizonKey);
  const start = new Date(at);
  if (!h || !Number.isFinite(start.getTime())) return [];
  const months = h.key === 'y1' ? 3 : 12;
  const count = h.key === 'y1' ? 4 : h.years;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = new Date(start.getFullYear(), start.getMonth() + i * months, 1);
    const b = new Date(start.getFullYear(), start.getMonth() + (i + 1) * months - 1, 1);
    const label = h.key === 'y1' ? `${i * 3 + 1}〜${i * 3 + 3} か月目` : `${i + 1} 年目`;
    const range = a.getFullYear() === b.getFullYear()
      ? `${a.getFullYear()}.${a.getMonth() + 1}–${b.getMonth() + 1}`
      : `${a.getFullYear()}.${a.getMonth() + 1}–${b.getFullYear()}.${b.getMonth() + 1}`;
    out.push({ label, range, startYm: `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}` });
  }
  return out;
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
export function shelfMaterial(books, { maxUnread = 30, maxDone = 20 } = {}) {
  const list = Array.isArray(books) ? books : [];
  const unread = list.filter((b) => b && b.status !== 'done' && str(b.title))
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
  return { text: lines.join('\n'), doneText: doneLines.join('\n'), keyToId, count: lines.length };
}

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

// ---- ロードマップの答えを解く ----
//   { needs:[{name, why}], issues:[string], phases:[{focus, todos:[string], books:[{bookId, why}]}], missing:[{theme, why}] } | null
export function parseRoadmap(text, keyToId, phaseCount) {
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
    .slice(0, 5);
  const issues = (Array.isArray(obj.issues) ? obj.issues : [])
    .map((x) => soften(cut(typeof x === 'string' ? x : x?.text, 110)))
    .filter(Boolean)
    .slice(0, 3);
  const used = new Set();
  const rawPhases = Array.isArray(obj.phases) ? obj.phases : [];
  const n = Math.max(1, Math.min(phaseCount || rawPhases.length || 1, 5));
  const phases = [];
  for (let i = 0; i < n; i += 1) {
    const p = rawPhases[i] || {};
    const books = [];
    for (const rb of Array.isArray(p.books) ? p.books : []) {
      const key = str(rb?.key || rb?.id).toUpperCase();
      const bookId = keyToId?.[key];
      if (!bookId || used.has(bookId) || books.length >= 3) continue;
      used.add(bookId);
      books.push({ bookId, why: soften(cut(rb?.why, 80)) });
    }
    phases.push({
      focus: soften(cut(p.focus, 60)),
      todos: (Array.isArray(p.todos) ? p.todos : []).map((t) => soften(cut(t, 70))).filter(Boolean).slice(0, 3),
      books,
    });
  }
  const missing = (Array.isArray(obj.missing) ? obj.missing : [])
    .map((m) => ({ theme: soften(cut(m?.theme, 30)), why: soften(cut(m?.why, 80)) }))
    .filter((m) => m.theme)
    .slice(0, 3);
  if (!needs.length && !phases.some((p) => p.focus || p.todos.length)) return null;
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
    const bs = (p.books || []).map((b) => idToKey[b.bookId] || (titleOf.get(b.bookId) ? `『${cut(titleOf.get(b.bookId), 40)}』` : '')).filter(Boolean).join('・');
    lines.push(`${i + 1}. ${specs[i]?.label || ''}: ${p.focus || ''}${p.todos?.length ? `（${p.todos.join(' / ')}）` : ''}${bs ? ` 本: ${bs}` : ''}`);
  });
  return lines.join('\n');
}

// 見直しの答え。{ found:false } か { found:true, newIssues, note, roadmap }（読めなければ null）。
//   いまの区切りより前の区切りは、前のロードマップのまま残す（AI が過去を書き換えない）。
export function parseRoadmapUpdate(text, keyToId, prev, hereIndex = 0) {
  if (typeof text !== 'string') return null;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  if (obj.found !== true) return { found: false };
  const n = prev?.phases?.length || 1;
  const next = parseRoadmap(JSON.stringify(obj), keyToId, n);
  if (!next) return { found: false };
  const keep = Math.max(0, Math.min(hereIndex, n));
  for (let i = 0; i < keep; i += 1) if (prev?.phases?.[i]) next.phases[i] = prev.phases[i];
  // 前に残した区切りの本と、直した区切りの本が重ならないように（前に残した方を優先）。
  const seen = new Set();
  next.phases = next.phases.map((p) => ({ ...p, books: (p.books || []).filter((b) => (seen.has(b.bookId) ? false : (seen.add(b.bookId), true))) }));
  const newIssues = (Array.isArray(obj.newIssues) ? obj.newIssues : []).map((x) => soften(cut(x, 60))).filter(Boolean).slice(0, 2);
  if (!newIssues.length) return { found: false };
  return { found: true, newIssues, note: soften(cut(obj.note, 80)), roadmap: next };
}

// 見直しの履歴（新しい順・5 件まで）。source: 'consult' | 'advisor'。
export function withUpdateLog(record, { source, newIssues, note, at = new Date().toISOString(), prevRoadmap }) {
  const updates = [{ at, source, newIssues, note }, ...(record?.updates || [])].slice(0, 5);
  return { ...record, updates, prevRoadmap: prevRoadmap || record?.roadmap || null };
}

// ロードマップのある目標（近い順）。
export function roadmapHorizons(goals, records) {
  return ['y1', 'y3', 'y5'].filter((k) => goals?.[k]?.text && records?.[k]?.roadmap);
}

// 本棚から消えた本を外す（開くたびに）。
export function pruneRoadmapBooks(roadmap, books) {
  if (!roadmap) return roadmap;
  const ids = new Set((books || []).map((b) => b.id));
  return { ...roadmap, phases: (roadmap.phases || []).map((p) => ({ ...p, books: (p.books || []).filter((b) => ids.has(b.bookId)) })) };
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
  const nearKey = ['y1', 'y3', 'y5'].find((k) => goals?.[k]?.text && records?.[k]?.roadmap);
  if (nearKey) {
    const r = records[nearKey];
    const rm = r.roadmap;
    const idx = currentPhaseIndex(nearKey, goals[nearKey].at, now);
    const ph = rm.phases?.[idx];
    const needs = (rm.needs || []).map((x) => x.name).slice(0, 5).join('・');
    if (needs) lines.push(`必要なこと（${horizonOf(nearKey).label}の目標）: ${needs}`);
    if (rm.issues?.length) lines.push(`今の課題: ${rm.issues.slice(0, 2).join(' / ')}`);
    if (ph?.focus) lines.push(`いまの区切りで取り組むこと: ${ph.focus}${ph.todos?.length ? `（${ph.todos.slice(0, 2).join(' / ')}）` : ''}`);
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
