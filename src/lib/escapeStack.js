// ⎋ Escape は、いちばん上に開いている層だけを閉じる（2026-11-26 点検「一文を選ぶ・背景のメニューで Esc を押すと、
//   下の写真で共有のシートまで一緒に閉じた」）。
// 開いた順に積み、document の capture で 1 回だけ受けて、いちばん上の層にだけ渡す（下の層・設定のモーダルなど window の
//   Esc の受け手には届かせない）。確かめるダイアログ・共有の画像の編集は window の capture で先に受けて止める（従来どおり）。
const stack = [];
let installed = false;

function onKey(e) {
  if (e.key !== 'Escape' || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  try { top.handler(e); } catch { /* ignore */ }
}

/** 層を積む。戻り値は外す関数（useEffect の後始末にそのまま返す）。 */
export function pushEscape(handler) {
  if (typeof document === 'undefined' || typeof handler !== 'function') return () => {};
  if (!installed) { document.addEventListener('keydown', onKey, true); installed = true; }
  const entry = { handler };
  stack.push(entry);
  return () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); };
}

/** いま積んでいる層の数（テスト用）。 */
export const escapeDepth = () => stack.length;
