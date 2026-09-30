// 本とメモを開く合図（2026-10-01・本と本がつながる）。
// メモのカード・メモの編集の画面・相談の「メモが答える相談」から、ほかの本のそのメモを開くときに使う
// （App が受けて、その本の詳細でそのメモまで送って示す＝すべての本の検索のメモの行と同じ openDetail）。
export const OPEN_MEMO_EVENT = 'orime:open-memo';

export function requestOpenMemo(bookId, memoId = null) {
  if (!bookId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_MEMO_EVENT, { detail: { bookId, memoId: memoId || null } }));
}
