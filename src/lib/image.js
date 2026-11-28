// Client-side image helpers.
//
// Photos straight off a phone camera are huge (8–12 MP, several MB). Before
// sending one to the vision model we downscale + re-encode as JPEG so that:
//   - the request body stays well under Vercel's serverless body limit,
//   - the model gets an image at its recommended resolution (≈1568px long
//     edge — larger costs more tokens with no accuracy gain),
//   - upload/latency stays snappy.
// Returns base64 (no data: prefix) ready for an Anthropic image block.

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('この写真は読み込めませんでした。'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を表示できませんでした。'));
    img.src = src;
  });
}

export async function downscaleImageForVision(file, { maxEdge = 1568, quality = 0.82 } = {}) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error('画像のサイズを取得できませんでした。');

  const longEdge = Math.max(width, height);
  if (longEdge > maxEdge) {
    const scale = maxEdge / longEdge;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を処理できませんでした。');
  ctx.drawImage(img, 0, 0, width, height);

  const out = canvas.toDataURL('image/jpeg', quality);
  const base64 = out.split(',')[1] || '';
  if (!base64) throw new Error('画像を変換できませんでした。');
  return { base64, mediaType: 'image/jpeg' };
}

// ---------------------------------------------------------------------------
// 📚 本棚の写真を、背表紙と同じ向き（縦）に 2〜3 つに分けて送る（2026-11-25 オーナー「精度も上げたい」）。
//   AI は 1 枚を約 115 万画素（長辺 1568）まで縮めて読むので、40 冊並ぶ本棚の写真 1 枚では背表紙 1 本が細くなる。
//   縦に切れば立っている本の背表紙は割れず（重なり 12% で境目の本も片方に丸ごと入る）、1 冊あたりの画素が増える。
//   縮めても細部が増えない写真（小さい写真・縦に長い写真）は分けない（送る量だけ増えるため）。
// ---------------------------------------------------------------------------
export const VISION_MAX_EDGE = 1568;
export const VISION_MAX_PIXELS = 1_150_000;
export const TILE_OVERLAP = 0.12;

// 幅 w・高さ h の画像を、AI が読むときの倍率（元の 1 画素が何画素になるか・1 まで）。
export function visionScale(w, h) {
  if (!w || !h) return 0;
  return Math.min(1, VISION_MAX_EDGE / Math.max(w, h), Math.sqrt(VISION_MAX_PIXELS / (w * h)));
}

/**
 * 縦に n 本に分けたときの切り方（左から・重なりつき）。[{ x, w }]（元の画素）。
 */
export function verticalStrips(width, n, overlap = TILE_OVERLAP) {
  if (n <= 1) return [{ x: 0, w: width }];
  const step = width / n;
  const pad = Math.round(width * overlap / 2);
  return Array.from({ length: n }, (_, i) => {
    const x0 = Math.max(0, Math.round(step * i) - pad);
    const x1 = Math.min(width, Math.round(step * (i + 1)) + pad);
    return { x: x0, w: x1 - x0 };
  });
}

/**
 * 何本に分けるか（1〜maxTiles）。1 本増やすごとに、背表紙 1 本あたりの画素が 8% 以上増えるときだけ増やす（画像 1 枚の原価は答えの文より小さい）。
 */
export function chooseTileCount(width, height, maxTiles = 3) {
  let best = 1;
  let bestScale = visionScale(width, height);
  for (let n = 2; n <= maxTiles; n += 1) {
    const strips = verticalStrips(width, n);
    const s = Math.min(...strips.map((r) => visionScale(r.w, height)));
    if (s >= bestScale * 1.08) { best = n; bestScale = s; } else break;
  }
  return best;
}

/**
 * 本棚の写真 → AI に送る画像（1〜3 枚・JPEG の base64）。合わせて 1.1MB（base64 の字数）を超えるときは画質を下げて作り直す
 * （中継の 1 回の上限 1.5MB の内側）。
 */
export async function visionTiles(file, { maxTiles = 3 } = {}) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) throw new Error('画像のサイズを取得できませんでした。');
  const n = chooseTileCount(W, H, maxTiles);
  const strips = verticalStrips(W, n);
  const encode = (quality) => strips.map((r) => {
    const s = visionScale(r.w, H);
    const cw = Math.max(1, Math.round(r.w * s));
    const ch = Math.max(1, Math.round(H * s));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした。');
    ctx.drawImage(img, r.x, 0, r.w, H, 0, 0, cw, ch);
    const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] || '';
    if (!base64) throw new Error('画像を変換できませんでした。');
    return { base64, mediaType: 'image/jpeg' };
  });
  let out = encode(0.82);
  for (const q of [0.7, 0.55]) {
    if (out.reduce((a, t) => a + t.base64.length, 0) <= 1_100_000) break;
    out = encode(q);
  }
  return out;
}
