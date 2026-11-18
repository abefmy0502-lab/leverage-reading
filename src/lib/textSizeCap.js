// 🔠 文字の大きさの上限（2026-11-18・文字サイズ最大の点検）。
//   iOS の「文字サイズ」（Dynamic Type）は html の font: -apple-system-body で効く（index.css）。
//   アクセシビリティの最大（本文 53px＝3 倍）では、1 行に 5〜6 字しか入らず、ボタンの名前・見出し・日付が 1 字ずつ割れた。
//   本文 17 の 2 倍（34px）で止める＝App Store のアクセシビリティの「さらに大きな文字」の基準（200% 以上）を満たしたまま、
//   どの画面も文節で折り返せる大きさ。iOS がアプリに許している上限（maximumContentSizeCategory）と同じ考え方。
//   設定アプリで大きさを変えて戻ってきたときも測り直す（visibilitychange・focus）。
export const BODY_PX = 17;
export const TEXT_SIZE_CAP_PX = BODY_PX * 2;

export function capFontSize(px, cap = TEXT_SIZE_CAP_PX) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > cap ? cap : null; // null＝上書きしない（端末の設定のまま）
}

export function installTextSizeCap(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
  if (!doc || !win) return () => {};
  const html = doc.documentElement;
  const apply = () => {
    html.style.removeProperty('font-size');
    const cap = capFontSize(parseFloat(win.getComputedStyle(html).fontSize));
    if (cap) html.style.setProperty('font-size', `${cap}px`);
  };
  apply();
  const onVisible = () => { if (doc.visibilityState === 'visible') apply(); };
  doc.addEventListener('visibilitychange', onVisible);
  win.addEventListener('focus', apply);
  return () => {
    doc.removeEventListener('visibilitychange', onVisible);
    win.removeEventListener('focus', apply);
  };
}
