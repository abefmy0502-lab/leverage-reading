// 文字の大きさの設定が大きいとき（ルートの文字 22px 以上）。ShareSheet / ImportSheet / BookMemoEditor と同じ目安。
// 畳む見出しの右の要約（「書いてあります」「紹介・目次」「12 項目」など）は、文字が大きいときは出さない
// （見出しとシェブロンの間に押し込まれて「…」だけが残り、読めない・2026-10-11 点検）。
export const LARGE_TEXT_ROOT_PX = 22;

export function isLargeText() {
  try {
    if (typeof document === 'undefined') return false;
    return parseFloat(getComputedStyle(document.documentElement).fontSize) >= LARGE_TEXT_ROOT_PX;
  } catch {
    return false;
  }
}
