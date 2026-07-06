// 🎨 表紙プレースホルダの決定論的カラー。表紙が無い / 404 の本に、タイトル文字列
// から常に同じ色のグラデーションを割り当てる（同じ本は毎回同じ色＝視認の安定）。
// 純粋関数のため App.jsx から切り出して単一責務化。

const PLACEHOLDER_PALETTE = [
  ['var(--color-accent)', '#5d4a28'], // brown
  ['#7a5080', '#5a3a60'], // plum
  ['#4a6e8a', '#2c4d68'], // slate blue
  ['#5a7a48', '#3a5a30'], // moss
  ['var(--c-critical)', '#703528'], // brick
  ['#9b7b5c', '#6a5340'], // sand
];

// タイトルから決定論的に [from, to] のグラデ色ペアを返す。
export function paletteFor(title) {
  const s = title || '';
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PLACEHOLDER_PALETTE[Math.abs(hash) % PLACEHOLDER_PALETTE.length];
}

export default paletteFor;
