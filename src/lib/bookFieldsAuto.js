// 🏷 本の分野を自動で付ける・前の版のタグを移す（2026-10-11・lib/bookFields.js・hooks/useBookFieldsAuto.js）。
//
// 端末に覚えること（localStorage・読み書きは try/catch・消えても壊れない＝もう一度確かめるだけ）:
//   orime.fields.stage.v2:<userId>    … { [本の id]: 'title' | 'info' | 'user' }
//       title＝書名から一度決めた / info＝紹介文・目次まで見て一度決めた / user＝本人が分野を選んだ（もう自動で付けない）
//       2026-10-11 に分野を 4 つの大分類・19 分野に作り直したので v2 に（前の v1 からは 'user' だけを引き継ぐ＝
//       前の一覧で付かなかった本も、新しい一覧でもう一度だけ確かめる）
//   orime.fields.refined.v<REFINE_VERSION>:<userId> … { [本の id]: 1 }＝紹介文・目次・楽天ブックスのジャンルを取ってきて決め直した本
//       （2026-10-11 の 2 回目・本人が選んでいない本だけ・1 冊 1 回）
//   orime.fields.migrated.v1:<userId> … 前の版のタグをフォルダ・分野へ移し終えた印（移し替えは何度流しても同じ結果）
//   orime.fields.legacy.v1:<userId>   … 移す前のタグの控え（{ [本の id]: [タグ…] }・念のため・画面には出さない）
// 自動で付けるのは分野が 1 つも無い本だけ。付いている分野は変えない。DB に印は付けない。

const STAGE = 'orime.fields.stage.v2:';
const STAGE_V1 = 'orime.fields.stage.v1:';
const MIGRATED = 'orime.fields.migrated.v1:';
const LEGACY = 'orime.fields.legacy.v1:';
// 仕分けの仕組みを変えたら版を上げる＝自動で付けた分野の本を、もう一度だけ決め直す（本人が選んだ本はそのまま）。
//   v2（2026-10-11）: 「小説家」「文庫完全版」で小説・物語になっていた本（『半径5メートルの野望 完全版』）を直す。
export const REFINE_VERSION = 2;
const REFINED = `orime.fields.refined.v${REFINE_VERSION}:`;

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
  if (v && typeof v === 'object') return v;
  const old = readJson(STAGE_V1 + userId);
  if (!old || typeof old !== 'object') return {};
  const kept = Object.fromEntries(Object.entries(old).filter(([, st]) => st === 'user'));
  writeJson(STAGE + userId, kept);
  return kept;
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

/**
 * アプリが自動で選んだ分野か（本人が選んでいない・前の版のタグから移したものでもない）。
 * 今の印（v2）と、前の一覧の印（v1）の title / info を見る。
 */
export function isAutoChosen(userId, stages, bookId) {
  const st = stages?.[bookId];
  if (st === 'user') return false;
  if (st === 'title' || st === 'info') return true;
  const v1 = userId ? readJson(STAGE_V1 + userId) : null;
  return !!(v1 && (v1[bookId] === 'title' || v1[bookId] === 'info'));
}

export function readRefined(userId) {
  if (!userId) return {};
  const v = readJson(REFINED + userId);
  return v && typeof v === 'object' ? v : {};
}
export function markRefined(userId, bookId) {
  if (!userId || !bookId) return;
  const all = readRefined(userId);
  if (all[bookId]) return;
  all[bookId] = 1;
  writeJson(REFINED + userId, all);
}

/**
 * 紹介文・ジャンルを取ってきて決め直してよい本か: 本人が選んでおらず、まだ決め直していない本で、
 * 分野が無いか、分野がアプリの自動のもの（前の版のタグから移した分野・お試しの本の分野は変えない）。
 */
export function canRefine(userId, stages, refined, book, hasFields) {
  if (!book?.id || stages?.[book.id] === 'user' || refined?.[book.id]) return false;
  return !hasFields || isAutoChosen(userId, stages, book.id);
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
