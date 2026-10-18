// ⏳ 読む時間の目安（2026-10-18 オーナー）: 本ごとに「この本にかける時間」を決めておく。
//
// 時間を決めてから読むと、全部を同じ重さで読まずに済む（どこを読み、どこを流すかを決めやすい）。
// 画面は「読書の時間 4 時間 20 分 / 目安 5 時間」と 2 つの数を並べるだけ。%・「あと N 分」・超えたときの警告・
// 達成の表示は作らない（読書の時間の決まり・CLAUDE.md）。
// 保存先は books.read_target_min（分・supabase_books_read_target.sql）。列が無い DB では端末に控える（ほかの端末には出ない）。
// このモジュールは pure（localStorage だけ触る）。

// 選べる目安（分）。決めないは 0。
export const READ_TARGET_CHOICES = [60, 120, 180, 300, 480];
const MIN = 30;
const MAX = 6000;
const KEY = (id) => `orime.readTarget.v1:${id}`;

export function cleanTarget(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= MIN && n <= MAX ? n : 0;
}

export function readLocalTarget(bookId) {
  if (!bookId) return 0;
  try { return cleanTarget(localStorage.getItem(KEY(bookId))); } catch { return 0; }
}

export function writeLocalTarget(bookId, minutes) {
  if (!bookId) return;
  try {
    const v = cleanTarget(minutes);
    if (v) localStorage.setItem(KEY(bookId), String(v));
    else localStorage.removeItem(KEY(bookId));
  } catch { /* 端末に書けなくても画面の中では使える */ }
}

// 「5 時間」「1 時間 30 分」「45 分」（読書の時間の小さな行と同じ書き方）。
export function fmtTarget(minutes) {
  const m = cleanTarget(minutes);
  if (!m) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} 分`;
  return r ? `${h} 時間 ${r} 分` : `${h} 時間`;
}
