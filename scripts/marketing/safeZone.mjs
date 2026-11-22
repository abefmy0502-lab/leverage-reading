// 📐 縦の動画（1080×1920）の「安全な範囲」（2026-11-22 オーナー「縦いっぱいに使いすぎ・文字が重なっている。起こらないように」）。
// Instagram のリール・TikTok・X の上の帯（アカウント名・閉じる）と、下の帯（説明文・ボタン）・右のボタンの列に重ねない。
// 画面の動画（record-demo）も概念の動画（render-explainer）も、字と絵はこの中だけに置き、書き出す前に layoutProblems で確かめる。
export const SAFE = { top: 250, bottom: 1440, left: 60, right: 960 };

// ページの中で動かす（page.evaluate に渡す・外の変数を使わない）。見えている要素の、はみ出しと重なりを返す。
export function layoutProblems({ selector, safe, slack = 8 }) {
  const shown = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const items = [...document.querySelectorAll(selector)].filter(shown).map((el) => {
    const r = el.getBoundingClientRect();
    const label = String(el.textContent || el.getAttribute('data-name') || el.id || el.tagName).replace(/\s+/g, '').slice(0, 18);
    return { r, label };
  }).filter(({ r }) => r.width > 0 && r.height > 0);
  const out = [];
  const box = (r) => `(${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)})`;
  for (const { r, label } of items) {
    if (r.top < safe.top - slack || r.bottom > safe.bottom + slack || r.left < safe.left - slack || r.right > safe.right + slack) {
      out.push(`はみ出し「${label}」${box(r)}`);
    }
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i].r; const b = items[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > slack && h > slack) out.push(`重なり「${items[i].label}」と「${items[j].label}」`);
    }
  }
  return out;
}

// 改行の決まり（2026-11-22 オーナー「変なところで改行しないように」）: 半角の空き（「1 日 15 分」の数と単位の間）では割らない＝
// U+00A0 に替える。割るのは文節の切れ目（CSS の word-break: auto-phrase）と「、」「。」の後だけ。収まらなければ字を小さくする。
export const glueSpaces = (text) => String(text || '').replace(/ /g, '\u00a0');
export const PHRASE_BREAK_CSS = 'word-break: keep-all; word-break: auto-phrase; line-break: strict; overflow-wrap: normal;';
