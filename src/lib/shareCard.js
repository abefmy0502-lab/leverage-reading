// 🖼 共有できる引用カード（画像生成）
//
// メモ（引用）を「美しい1枚の画像」にして保存・共有できるようにする。
// 共有1枚ごとが無料マーケになる＝獲得の複利。SNS化はしない（1枚だけ外に出す）。
//
// renderQuoteCardBlob({ quote, bookTitle, author, page }) → Promise<Blob>(PNG)
//
// Canvas で固定 1080×1350（縦長 4:5、Instagram / X 映え）を描く。
// devicePixelRatio 非依存（常に 1080px 出力）。Noto Serif JP を待ってから描画し、
// 失敗時は serif にフォールバック。例外は throw（呼び出し側が humanize）。

const W = 1080;
const H = 1350;

// クリーム / ブラウンの世界観（tokens.css と同系統）
const BG = '#fffdf8';
const INK = '#3d362c'; // 本文ブラウン
const SUB = '#8a7e6b'; // 書名・著者
const FAINT = '#c9bfac'; // 枠・装飾
const WORDMARK = '#a89e8c';

const SERIF_FALLBACK = 'Georgia, serif';

// フォント確定を待つ。未ロードのまま描くと sans に化けるため、必要なウェイトを
// 明示ロードする。失敗しても描画は続行（serif フォールバック）。
async function ensureFonts() {
  let ok = true;
  try {
    if (typeof document !== 'undefined' && document.fonts) {
      await Promise.all([
        document.fonts.load("400 40px 'Noto Serif JP'"),
        document.fonts.load("700 64px 'Noto Serif JP'"),
        document.fonts.load("900 64px 'Noto Serif JP'"),
      ]).catch(() => { ok = false; });
      await document.fonts.ready.catch(() => {});
      // 実際に使えるか最終確認（環境によっては load 解決しても未準備のことがある）
      try {
        if (!document.fonts.check("700 64px 'Noto Serif JP'")) ok = false;
      } catch {
        ok = false;
      }
    } else {
      ok = false;
    }
  } catch {
    ok = false;
  }
  return ok;
}

function serifFamily(useNoto, weight) {
  return useNoto ? `${weight} __px 'Noto Serif JP', ${SERIF_FALLBACK}` : `${weight} __px ${SERIF_FALLBACK}`;
}

// font 文字列のサイズ部分を差し替えるヘルパ（__px をピクセルに置換）
function fontAt(template, sizePx) {
  return template.replace('__px', `${Math.round(sizePx)}px`);
}

// 与えられた幅に収まるよう、文字単位で行に折り返す（日本語は単語境界が無いため
// measureText で 1 文字ずつ詰める。英単語の途中改行も許容＝引用は短文前提）。
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  // 明示改行は尊重しつつ、各段落をワードラップ
  const paragraphs = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const ch of para) {
      const next = current + ch;
      if (ctx.measureText(next).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
    if (current.length > 0) lines.push(current);
  }
  return lines;
}

export async function renderQuoteCardBlob({ quote, bookTitle, author, page } = {}) {
  const body = (quote || '').trim();
  if (!body) {
    throw new Error('引用にする本文がありません。');
  }

  const useNoto = await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('この端末では画像を生成できませんでした。');
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 背景（クリーム）
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // 控えめな内枠
  const margin = 72;
  ctx.strokeStyle = FAINT;
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, margin, W - margin * 2, H - margin * 2);

  // 上部に控えめな引用符（装飾）
  ctx.fillStyle = FAINT;
  ctx.font = fontAt(serifFamily(useNoto, 900), 150);
  ctx.textAlign = 'center';
  ctx.fillText('“', W / 2, margin + 190);

  // 本文：枠内に収まるフォントサイズを探索しつつ、長すぎる場合は末尾を省略。
  const contentLeft = margin + 56;
  const contentRight = W - margin - 56;
  const maxWidth = contentRight - contentLeft;
  // 本文を描ける縦の領域（引用符の下〜フッターの上）
  const bodyTop = margin + 260;
  const bodyBottom = H - margin - 230;
  const bodyHeight = bodyBottom - bodyTop;

  // フォントサイズを段階的に下げて、行数 × 行高が領域に収まる最大サイズを採用。
  const SIZES = [72, 64, 58, 52, 46, 42, 38, 34];
  let chosen = { size: SIZES[SIZES.length - 1], lines: [], lineHeight: 0 };
  for (const size of SIZES) {
    ctx.font = fontAt(serifFamily(useNoto, 700), size);
    const lineHeight = Math.round(size * 1.7);
    const lines = wrapLines(ctx, body, maxWidth);
    if (lines.length * lineHeight <= bodyHeight) {
      chosen = { size, lines, lineHeight };
      break;
    }
    // 最小サイズでも収まらなければ、この最小サイズで行数を切り詰める（後段で省略）
    chosen = { size, lines, lineHeight };
  }

  // 領域に収まる最大行数で切り詰め、溢れたら末尾に「…」を付ける
  let { lines, lineHeight, size } = chosen;
  ctx.font = fontAt(serifFamily(useNoto, 700), size);
  const maxLines = Math.max(1, Math.floor(bodyHeight / lineHeight));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    // 最終行に … を収める（必要なら末尾文字を削る）
    let last = lines[maxLines - 1];
    while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = (last + '…');
  }

  // 本文を縦中央寄せで描画（ブラウン）
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  const totalTextHeight = lines.length * lineHeight;
  let y = bodyTop + (bodyHeight - totalTextHeight) / 2 + lineHeight * 0.78;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }

  // 区切りの細線
  const footerY = H - margin - 168;
  ctx.strokeStyle = FAINT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 60, footerY);
  ctx.lineTo(W / 2 + 60, footerY);
  ctx.stroke();

  // 書名 / 著者 / ページ（下部に小さく）
  ctx.textAlign = 'center';
  ctx.fillStyle = SUB;
  const titleText = (bookTitle || '').trim();
  if (titleText) {
    ctx.font = fontAt(serifFamily(useNoto, 700), 32);
    let t = titleText;
    while (t.length > 0 && ctx.measureText('『' + t + '』').width > maxWidth) {
      t = t.slice(0, -1);
    }
    const ellip = t.length < titleText.length ? '…' : '';
    ctx.fillText('『' + t + ellip + '』', W / 2, footerY + 56);
  }

  const metaParts = [];
  if ((author || '').trim()) metaParts.push((author || '').trim());
  if (page != null && page !== '' && Number.isFinite(Number(page))) metaParts.push(`p.${page}`);
  if (metaParts.length > 0) {
    ctx.font = fontAt(serifFamily(useNoto, 400), 26);
    let meta = metaParts.join('　/　');
    while (meta.length > 0 && ctx.measureText(meta).width > maxWidth) {
      meta = meta.slice(0, -1);
    }
    ctx.fillText(meta, W / 2, footerY + 100);
  }

  // ワードマーク「Orime」（控えめ・最下部）
  ctx.font = fontAt(serifFamily(useNoto, 700), 30);
  ctx.fillStyle = WORDMARK;
  ctx.fillText('Orime', W / 2, H - margin - 36);

  // PNG Blob 化
  const blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('画像の書き出しに失敗しました。'));
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });
  return blob;
}

export default renderQuoteCardBlob;
