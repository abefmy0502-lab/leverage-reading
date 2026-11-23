// 「すべての本」の上の形（2026-11-23 点検）: 前回読み終えたときに、右上の検索のボタン・状態のチップの行・
// フォルダのチップの行があったかを端末に覚える。読み込み中の骨組みを同じ形にして、読み終えたときに
// 一覧が下へ跳ねたり右上のボタンが動いたりしないようにする（表示の形＝bookshelfViewLast と同じ考え）。

export const LIBRARY_SHAPE_KEY = 'orime.libraryShape.v1';

// 一度も覚えていないときの形: 本がある人（表示の形を覚えている＝本を一度出した）なら検索と状態の行あり・フォルダなし。
export function readLibraryShape(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  let hadBooks = true;
  try {
    const raw = storage?.getItem(LIBRARY_SHAPE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') {
        return { search: v.search !== false, status: v.status !== false, folders: v.folders === true };
      }
    }
    hadBooks = !!storage?.getItem('bookshelfViewLast');
  } catch { /* 読めなければ既定 */ }
  return { search: hadBooks, status: true, folders: false };
}

export function writeLibraryShape(shape, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    storage?.setItem(LIBRARY_SHAPE_KEY, JSON.stringify({ search: !!shape.search, status: !!shape.status, folders: !!shape.folders }));
  } catch { /* 覚えられなくても動く */ }
}
