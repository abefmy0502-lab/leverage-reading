// 🧭 目標（1 年後・3 年後・5 年後）（2026-11-15 オーナー「1 年後・3 年後・5 年後で目標を固定して入れられるように」）。
//
// 欄は 3 つで固定。各 80 字まで・空いていてもよい。書いた日から数えて「◯年◯月まで」を添える。
// 「orime を入れた理由」（lib/appPurpose.js）は初回ガイドで書いたまま残し、目標の画面ではどの欄に入れるかを選んで移せる。
// 相談の材料に入る（2026-11-15 オーナー決定・lib/ai.js の goalsBlock）。
//
// 保存先: Supabase Auth の user_metadata.app_goals = { y1, y3, y5 }（各 { text, at } か null）＋端末の localStorage（利用者ごと）。
// 信じる順: この起動中に書いたこと ＞ user_metadata（キーがあれば）＞ 端末（入れた理由と同じ）。

import { supabase, isSupabaseConfigured } from './supabase';

export const GOALS_META_KEY = 'app_goals';
export const GOAL_MAX = 80;
export const GOALS_CHANGED_EVENT = 'orime:goals-changed';
const LOCAL_KEY = 'orime.goals.v1';

// 並びは近い順（画面は上から いま → 1 年後 → 3 年後 → 5 年後）。
export const GOAL_HORIZONS = [
  { key: 'y1', years: 1, label: '1 年後', example: '1 年後に、チームの会議を自分で回せるようになりたい' },
  { key: 'y3', years: 3, label: '3 年後', example: '3 年後に、チームを任されるリーダーになりたい' },
  { key: 'y5', years: 5, label: '5 年後', example: '5 年後に、自分の名前で仕事をしたい' },
];
export const GOAL_KEYS = GOAL_HORIZONS.map((h) => h.key);
// 3 つの目標をつなぐ 1 本のロードマップ（2026-11-16 オーナー「1 年後・3 年後・5 年後の目標をすべて入れたら AI を動かす」）。
//   ロードマップ・読書計画は 'all' の 1 つだけ（目標ごとには作らない）。
export const ALL_GOALS_KEY = 'all';
const ALL_HORIZON = { key: ALL_GOALS_KEY, years: 5, label: '3 つの目標' };
export const horizonOf = (key) => (key === ALL_GOALS_KEY ? ALL_HORIZON : GOAL_HORIZONS.find((h) => h.key === key) || null);

export function cleanGoalText(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, GOAL_MAX);
}

function normalizeOne(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = cleanGoalText(raw.text);
  const at = typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? raw.at : null;
  return text && at ? { text, at } : null;
}

// { y1, y3, y5 }（無い欄は null）。
export function normalizeGoals(raw) {
  const out = { y1: null, y3: null, y5: null };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of GOAL_KEYS) out[k] = normalizeOne(raw[k]);
  return out;
}

export const hasAnyGoal = (goals) => GOAL_KEYS.some((k) => goals?.[k]?.text);
export const allGoalsSet = (goals) => GOAL_KEYS.every((k) => goals?.[k]?.text);
export const missingGoalCount = (goals) => GOAL_KEYS.filter((k) => !goals?.[k]?.text).length;
// ロードマップをつくれるか（2026-11-22 オーナー承認: 1 年後の目標だけでもつくれる・3 年後・5 年後はあとから書ける）。
//   前（2026-11-16）は 3 つとも書いたときだけ。1 年後しか見えていない人が、押せないボタンで止まっていた。
export const canBuildRoadmap = (goals) => !!goals?.y1?.text;

// 3 つの目標をまとめた 1 つ（ロードマップの起点は 1 年後の目標を書いた日＝1 年後の区切りがそこから始まる）。
//   2026-11-17: 前は「いちばん早く書いた日」。1 年たって 1 年後の目標だけ書き直すと、起点が古いまま区切りが過去から始まっていた。
//   text は「1 年後：…／3 年後：…／5 年後：…」（本を探す下書きなどに使う）。
//   1 年後の目標だけでもつくれる（2026-11-22）。まだ書いていない目標は goals に null のまま・text には入れない。
export function combinedGoal(goals) {
  if (!canBuildRoadmap(goals)) return null;
  return {
    key: ALL_GOALS_KEY,
    at: goals.y1.at,
    text: GOAL_HORIZONS.filter((h) => goals[h.key]?.text).map((h) => `${h.label}：${goals[h.key].text}`).join('／'),
    goals: Object.fromEntries(GOAL_KEYS.map((k) => [k, goals[k] || null])),
  };
}

// 期限の日（書いた日の年に years を足す・月末は丸める）。
export function goalDeadline(at, years) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear() + years;
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}

// 「2027 年 11 月まで」
export function fmtGoalDeadline(at, years) {
  const d = goalDeadline(at, years);
  return d ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月まで` : '';
}

// 画面の期限（過ぎていれば「2026 年 10 月まで（過ぎました）」・2026-11-17 長く使ったときの確認）。
export function fmtGoalDeadlineNow(at, years, now = new Date()) {
  const d = goalDeadline(at, years);
  if (!d) return '';
  return `${fmtGoalDeadline(at, years)}${d.getTime() < now.getTime() ? '（過ぎました）' : ''}`;
}

// 入れた理由の文から、入れる欄の見当（「1 年」「来年」→ 1 年後・「5 年」「10 年」→ 5 年後・ほかは 3 年後）。
export function suggestHorizon(text) {
  const t = String(text || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/(^|[^0-9])1\s*年|一年|来年|今年/.test(t)) return 'y1';
  if (/(^|[^0-9])(5|10)\s*年|五年|十年/.test(t)) return 'y5';
  return 'y3';
}

// ---- 読み書き ----

function readLocal(userId) {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_KEY}:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeLocal(userId, goals) {
  if (!userId) return;
  try { window.localStorage.setItem(`${LOCAL_KEY}:${userId}`, JSON.stringify(goals)); } catch { /* 端末に残せなくても動く */ }
}

let override = null; // { userId, goals }

export function resolveGoals({ override: ov, metadata, local } = {}) {
  if (ov !== undefined) return normalizeGoals(ov);
  if (metadata && typeof metadata === 'object' && Object.prototype.hasOwnProperty.call(metadata, GOALS_META_KEY)) {
    return normalizeGoals(metadata[GOALS_META_KEY]);
  }
  return normalizeGoals(local);
}

async function currentUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch { return null; }
}

export async function readGoals() {
  const user = await currentUser();
  if (!user) return normalizeGoals(null);
  return resolveGoals({
    override: override && override.userId === user.id ? override.goals : undefined,
    metadata: user.user_metadata,
    local: readLocal(user.id),
  });
}

// その場で分かる目標（相談の材料を組むとき・同期で）。
export function goalsFor(user) {
  if (!user?.id) return normalizeGoals(null);
  return resolveGoals({
    override: override && override.userId === user.id ? override.goals : undefined,
    metadata: user.user_metadata,
    local: readLocal(user.id),
  });
}

// 1 つの欄を書く（空なら消す）。keepAt=true なら書いた日（期限の起点）を変えない。
//   返すのは { goals, synced }（synced=false＝この端末にだけ残った）。
export async function saveGoal(key, text, { keepAt = false, now = new Date() } = {}) {
  if (!GOAL_KEYS.includes(key)) return null;
  const user = await currentUser();
  if (!user) return null;
  const cur = await readGoals();
  const clean = cleanGoalText(text);
  const prevAt = cur[key]?.at;
  const next = { ...cur, [key]: clean ? { text: clean, at: keepAt && prevAt ? prevAt : now.toISOString() } : null };
  override = { userId: user.id, goals: next };
  writeLocal(user.id, next);
  try { window.dispatchEvent(new CustomEvent(GOALS_CHANGED_EVENT, { detail: { goals: next } })); } catch { /* ignore */ }
  let synced = true;
  try {
    const { error } = await supabase.auth.updateUser({ data: { [GOALS_META_KEY]: next } });
    if (error) synced = false;
  } catch { synced = false; }
  return { goals: next, synced };
}

export function __resetGoalsForTest() { override = null; }
