// 📗 読み終え方（2026-10-18 オーナー）: 必要なところまで読んで「ここまでで読み終える」を選んだ本の印。
//
// 本は最後まで読まなくてよい（読む目的が満たせたら終えてよい）。状態は読了のまま（4 つの状態は変えない）で、
// 「途中まで」の印だけを残す＝本の詳細の状態の行に「· 途中まで」。読了の数・記録はふつうの読了と同じに数える。
// 保存先は books.finish_kind（supabase_books_finish_kind.sql）。列が無い DB では端末に控える（ほかの端末には出ない）。
// このモジュールは pure（localStorage だけ触る）。

export const FINISH_PARTIAL = 'partial';
const KEY = (id) => `orime.finishKind.v1:${id}`;

export function readLocalFinish(bookId) {
  if (!bookId) return '';
  try { return localStorage.getItem(KEY(bookId)) === FINISH_PARTIAL ? FINISH_PARTIAL : ''; } catch { return ''; }
}

export function writeLocalFinish(bookId, kind) {
  if (!bookId) return;
  try {
    if (kind === FINISH_PARTIAL) localStorage.setItem(KEY(bookId), FINISH_PARTIAL);
    else localStorage.removeItem(KEY(bookId));
  } catch { /* 端末に書けなくても読了にはなっている */ }
}

// 本の詳細の状態の行に「途中まで」を出すか（読了の本で印があるときだけ）。
export function isPartialDone(book) {
  return !!book && book.status === 'done' && book.finishKind === FINISH_PARTIAL;
}
