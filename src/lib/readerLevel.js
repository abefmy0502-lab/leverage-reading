// 📚 その人の読書の慣れ（AI 選書で難しすぎる本をすすめないため・2026-11-17 オーナー「読書初心者に難しい本を進めても微妙」）。
//   自動＝本棚の読了の冊数から決める。本人が AI 選書で「やさしめ／ふつう／歯ごたえ」を選んだら、そちらを使う（端末に覚える）。
//   難しさの段階は推薦用の本のデータ（advisor_books.difficulty）と同じ 1 入門・2 中級・3 上級。

export const LEVEL_PREFS = ['auto', 'easy', 'normal', 'hard'];
export const LEVEL_PREF_LABELS = { auto: 'おまかせ', easy: 'やさしめ', normal: 'ふつう', hard: '歯ごたえ' };
export const DIFFICULTY_LABELS = { 1: '入門', 2: '中級', 3: '上級' };
// 画面の言葉（チップと同じ物差し・2026-11-17 ui-critic「チップはやさしめ、案内は入門で結びつかない」）
export const LEVEL_WORDS = { 1: 'やさしめ', 2: 'ふつう', 3: '歯ごたえ' };

/** 確かめのカードの案内の 1 行。 */
export function levelNote({ level, done, chosen }) {
  const w = LEVEL_WORDS[level] || LEVEL_WORDS[2];
  // 390 幅で 1 行に収まる長さ（2026-11-17 撮影で「探し／ます」と割れた）
  if (chosen) return `「${w}」の本を中心に探します`;
  if (!done) return 'はじめての方向けに、やさしめの本を中心に探します';
  return `読了 ${done} 冊から「${w}」の本を中心に探します`;
}
const PREF_LEVEL = { easy: 1, normal: 2, hard: 3 };
const STORE_KEY = 'orime.advisor.level';

// 読了の冊数 → 段階（5 冊未満＝1・20 冊未満＝2・それより多い＝3）。
export const LEVEL_DONE_STEPS = [5, 20];

/** 本棚から自動の段階。{ level, done } */
export function autoLevel(books) {
  const done = (Array.isArray(books) ? books : []).filter((b) => b && b.status === 'done').length;
  const level = done < LEVEL_DONE_STEPS[0] ? 1 : done < LEVEL_DONE_STEPS[1] ? 2 : 3;
  return { level, done };
}

/** 本人の選び（pref）と本棚から、使う段階。{ level, done, pref, chosen }＝chosen は本人が選んだか。 */
export function readerLevel(books, pref = 'auto') {
  const { level, done } = autoLevel(books);
  const p = LEVEL_PREFS.includes(pref) ? pref : 'auto';
  if (p !== 'auto') return { level: PREF_LEVEL[p], done, pref: p, chosen: true };
  return { level, done, pref: 'auto', chosen: false };
}

/** 推薦の AI に渡す 1 段（この回の相談のすぐ後ろ・会話の記録には残さない）。 */
export function levelBlock({ level, done, chosen }) {
  const lv = DIFFICULTY_LABELS[level] || DIFFICULTY_LABELS[2];
  const why = chosen
    ? `本人が難しさを「${LEVEL_PREF_LABELS[{ 1: 'easy', 2: 'normal', 3: 'hard' }[level]]}」と選んだ`
    : `本棚の読了 ${done} 冊から見立てた`;
  return `【この人の読書の慣れ】${lv}（${why}）。候補の【難しさ】がこれに近い本を中心に選ぶ。`;
}

export function loadLevelPref() {
  try {
    const v = globalThis.localStorage?.getItem(STORE_KEY);
    return LEVEL_PREFS.includes(v) ? v : 'auto';
  } catch { return 'auto'; }
}
export function saveLevelPref(v) {
  try { globalThis.localStorage?.setItem(STORE_KEY, LEVEL_PREFS.includes(v) ? v : 'auto'); } catch { /* 覚えられないだけ */ }
}
