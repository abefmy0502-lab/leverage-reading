// 📷 写真で共有の「今月」「今年」のメモの控え（アプリを開いている間・2026-10-08）。
//
// シートを開き直したときに読み直さないための控え。メモを書いた・直した・消した・取り込んだら
// （AppDataCache の subscribeAnyMemo）、App.jsx が clearShareMemoCaches を呼んで捨てる＝次に開いたときに読み直す
// （書いた直後に共有しても、今年のメモの数と一文が古くならない・第 2 回 ui-critic）。
export const monthMemoCache = new Map();
export const yearMemoCache = new Map();

export function clearShareMemoCaches() {
  monthMemoCache.clear();
  yearMemoCache.clear();
}
