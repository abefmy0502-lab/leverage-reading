// 🏷 本の分野を自動で付ける・前の版のタグを移す（2026-10-11・lib/bookFields.js・hooks/useBookFieldsAuto.js）。
//
// 端末に覚えること（localStorage・読み書きは try/catch・消えても壊れない＝もう一度確かめるだけ）:
//   orime.fields.stage.v1:<userId>    … { [本の id]: 'title' | 'info' | 'user' }
//       title＝書名から一度決めた / info＝紹介文・目次まで見て一度決めた / user＝本人が分野を選んだ（もう自動で付けない）
//   orime.fields.migrated.v1:<userId> … 前の版のタグをフォルダ・分野へ移し終えた印（移し替えは何度流しても同じ結果）
//   orime.fields.legacy.v1:<userId>   … 移す前のタグの控え（{ [本の id]: [タグ…] }・念のため・画面には出さない）
// 自動で付けるのは分野が 1 つも無い本だけ。付いている分野は変えない。DB に印は付けない。

const STAGE = 'orime.fields.stage.v1:';
const MIGRATED = 'orime.fields.migrated.v1:';
const LEGACY = 'orime.fields.legacy.v1:';

function store() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
function readJson(key) {
  try { const raw = store()?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeJson(key, value) {
  try { store()?.setItem(key, JSON.stringify(value)); } catch { /* 覚えられなくても動く */ }
}

export function readFieldStages(userId) {
  if (!userId) return {};
  const v = readJson(STAGE + userId);
  return v && typeof v === 'object' ? v : {};
}

// stage の強さ: user ＞ info ＞ title（弱いほうで上書きしない）。
const RANK = { title: 1, info: 2, user: 3 };
export function markFieldStage(userId, bookId, stage) {
  if (!userId || !bookId || !RANK[stage]) return;
  const all = readFieldStages(userId);
  if ((RANK[all[bookId]] || 0) >= RANK[stage] && stage !== 'user') return;
  all[bookId] = stage;
  writeJson(STAGE + userId, all);
}

/**
 * この本に自動で分野を付けてよいか。
 *   withInfo=false: 書名から（まだ何も決めていない本だけ）
 *   withInfo=true : 紹介文・目次から（まだ紹介文まで見ていない本だけ）
 */
export function canAutoFill(stages, book, { withInfo = false } = {}) {
  const s = stages?.[book?.id];
  if (s === 'user') return false;
  if (withInfo) return s !== 'info';
  return !s;
}

export function isMigrated(userId) {
  if (!userId) return true;
  try { return store()?.getItem(MIGRATED + userId) === '1'; } catch { return false; }
}
export function setMigrated(userId) {
  if (!userId) return;
  try { store()?.setItem(MIGRATED + userId, '1'); } catch { /* 次に開いたときにもう一度確かめる（何度流しても同じ） */ }
}

export function backupLegacyTags(userId, bookId, tags) {
  if (!userId || !bookId || !Array.isArray(tags) || !tags.length) return;
  const all = readJson(LEGACY + userId) || {};
  if (!all[bookId]) { all[bookId] = tags.slice(0, 50); writeJson(LEGACY + userId, all); }
}
