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
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
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
