// 📖 どこまで読んだか・🗄 アーカイブ（2026-11-26 オーナー「本を識別したらその本の総量が何ページか？ってわかるかな？
//   何ページまで読んだかの記録をつけたい」「電子書籍の場合ページが画面の比率によって変わるので自由に登録できるのもいいかも」
//   「読みたい→積読→読書中→読了という概念とアーカイブの概念も入れたい・少し読んだが合わないから読書中や積読からは除外したい」）。
//
// どこまで読んだか: 単位は 'page'（ページ）か 'percent'（％＝電子書籍は画面の大きさでページが変わるので）。
//   総ページは本の情報（openBD・Google Books の pages）から入れておき、本人が直せる。
//   画面は「p.120 / 320」「45％」と数を出すだけ（進み具合の棒・「あと N ページ」・達成の表示は作らない）。
//   保存先は books.current_page / total_pages / progress_unit（supabase_books_progress_archive.sql）。列が無い DB では端末に控える。
// アーカイブ: 4 つの状態とは別の「しまっておく」印（books.archived_at）。状態はそのまま残し、ホーム・すべての本の一覧・
//   積読の提案から外す。メモは消さない（相談の材料に残る）。戻せばもとの状態に戻る。
// このモジュールは pure（localStorage だけ触る）。

export const PROGRESS_UNITS = ['page', 'percent'];
const PAGE_MAX = 20000;
const P_KEY = (id) => `orime.progress.v1:${id}`;
const A_KEY = (id) => `orime.archived.v1:${id}`;

// 空・null は数ではない（Number('') === 0 で、空の欄や「記録を消す」が 0％ と保存されていた・2026-11-27）。
const int = (v) => {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return NaN;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : NaN;
};

/** 入力をそろえる: { current, total, unit }。ページは 1〜20000（総ページより先は総ページに）・％は 0〜100。 */
export function cleanProgress({ current, total, unit } = {}) {
  const u = unit === 'percent' ? 'percent' : 'page';
  if (u === 'percent') {
    const c = int(current);
    return { unit: u, current: Number.isFinite(c) && c >= 0 ? Math.min(100, c) : null, total: null };
  }
  const t = int(total);
  const tot = Number.isFinite(t) && t > 0 && t <= PAGE_MAX ? t : null;
  const c = int(current);
  let cur = Number.isFinite(c) && c > 0 && c <= PAGE_MAX ? c : null;
  if (cur != null && tot != null && cur > tot) cur = tot;
  return { unit: u, current: cur, total: tot };
}

/** 「p.120 / 320」「p.120」「全 320 ページ」「45％」。記録が無ければ ''。 */
export function progressLabel(p) {
  const { unit, current, total } = cleanProgress(p || {});
  if (unit === 'percent') return current != null ? `${current}％` : '';
  if (current != null && total != null) return `p.${current} / ${total}`;
  if (current != null) return `p.${current}`;
  return '';
}

/** 読み上げ用「320 ページのうち 120 ページまで」「45％まで」。 */
export function progressSpoken(p) {
  const { unit, current, total } = cleanProgress(p || {});
  if (unit === 'percent') return current != null ? `${current}％まで` : '';
  if (current != null && total != null) return `${total} ページのうち ${current} ページまで`;
  if (current != null) return `${current} ページまで`;
  return '';
}

export function hasProgress(p) {
  return cleanProgress(p || {}).current != null;
}

export function readLocalProgress(bookId) {
  if (!bookId) return null;
  try {
    const raw = localStorage.getItem(P_KEY(bookId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? cleanProgress(v) : null;
  } catch { return null; }
}

export function writeLocalProgress(bookId, p) {
  if (!bookId) return;
  try {
    if (!p) { localStorage.removeItem(P_KEY(bookId)); return; }
    const v = cleanProgress(p);
    if (v.current == null && v.total == null && v.unit === 'page') localStorage.removeItem(P_KEY(bookId));
    else localStorage.setItem(P_KEY(bookId), JSON.stringify(v));
  } catch { /* 端末に書けなくても画面の中では使える */ }
}

export function readLocalArchived(bookId) {
  if (!bookId) return null;
  try { return localStorage.getItem(A_KEY(bookId)) || null; } catch { return null; }
}

export function writeLocalArchived(bookId, iso) {
  if (!bookId) return;
  try {
    if (iso) localStorage.setItem(A_KEY(bookId), String(iso));
    else localStorage.removeItem(A_KEY(bookId));
  } catch { /* ignore */ }
}

export const isArchived = (b) => !!b?.archivedAt;
