// 🔢 全角の英数字を半角に（2026-11-25 オーナー「全角数字を使わないで、半角の数字を使って」）。
//   書店の書誌は「７つの習慣」のように全角の数字で来ることがある。本を読み込む・保存する・取り込むときに半角にそろえる。
//   英字も同じ幅にそろえる（「ＯＫＲ」→「OKR」）。記号・カタカナは変えない。
export function toHalfWidthAlnum(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}
