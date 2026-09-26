// 🎨 表紙プレースホルダの決定論的カラー。表紙が無い / 404 の本に、タイトル文字列
// から常に同じ色のグラデーションを割り当てる（同じ本は毎回同じ色＝視認の安定）。
// 純粋関数のため App.jsx から切り出して単一責務化。

// 色は tokens.css の --cover-* に置く（明暗で変えない・白い書名が読める暗さ）。
const PLACEHOLDER_PALETTE = [1, 2, 3, 4, 5, 6].map((n) => [`var(--cover-${n}a)`, `var(--cover-${n}b)`]);

// タイトルから決定論的に [from, to] のグラデ色ペアを返す。
export function paletteFor(title) {
  const s = title || '';
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PLACEHOLDER_PALETTE[Math.abs(hash) % PLACEHOLDER_PALETTE.length];
}

export default paletteFor;
