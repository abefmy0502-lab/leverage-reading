// 💬 相談の中の押し込まれた画面（学びを書く など）から離れてよいかを、App の「戻る」（左端スワイプ・ブラウザの戻る）が
// 先に確かめるための小さな窓口（2026-09-30）。MyBookBrain が確かめる関数（書きかけの学びがあれば
// 「編集を続ける／書いたことを消す」を出して、離れてよければ true）を登録する。無ければいつでも離れてよい。
let guard = null;

export function setConsultBackGuard(fn) {
  guard = typeof fn === 'function' ? fn : null;
  return () => { if (guard === fn) guard = null; };
}

export async function consultCanLeave() {
  if (!guard) return true;
  try { return (await guard()) !== false; } catch { return true; }
}
