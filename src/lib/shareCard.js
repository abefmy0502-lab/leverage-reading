// 🖼 一文カード（シェア画像）を canvas で描く。
//
// 「この本の一文」が主役。読了日・メモ件数などの数字は入れない（2026-09-27 オーナー判断）。
// 地は 5 種類:
//   写真（photo）  … 自分の写真を枠いっぱいに敷き、白い文字（Strava の写真の上の白い文字のように）
//   紙 / 夜 / 表紙の色（paper / night / cover）… 雑誌の引用ページのような組版＋小さな表紙
//   透明（sticker）… 地の無い白い文字（ストーリーの自分の写真の上に貼る用）
// 下には Orime のロゴだけ（public/logo-lockup.png から、本の印と文字を切り出して横に並べる。
// 暗い地・写真・透明では白に変え、i の点の橙だけ残す）。サイトの URL は画像に入れない
// （2026-10-01 オーナー裁定「orime.vercel.app の文字は確実に不要。ロゴのみでOK」・URL は共有の文にだけ）。
// 2 つの印（Strava の橙のルートにあたる「読んだ跡」）:
//   傍線 … 一文の最後の行の下に、橙の手描きの線。メモごとに形が決まっている（メモの id と本文から種を作る）
//   付箋 … 表紙（写真・透明では白い線の本の印）の右の小口から橙の付箋がはみ出す。
//          その一文が本のどのあたりかを高さで示す（数字は出さない・ページの無いメモには付けない）
//
// 色は tokens.css の --share-* を getComputedStyle で読む（canvas は var() を解決できない）。
// 書体は --font-read / --font-ui の並びをそのまま使い、document.fonts.ready を待つ。
// 幅は 1080 固定（ストーリー 1080×1920 / 投稿 1080×1350 / 正方形 1080×1080）。
// 写真は端末の中だけで描く（どこにも送らない）。例外は throw（呼び出し側が toMessage で整える）。

import {
  FORMATS, clampLine, fitQuote, wrapBalanced, coverTone, rgbCss,
  photoPlacement, scrimAlpha, brightLuminance, coverProxyPath,
  seedFrom, underlineStroke, tabPosition,
} from './shareCardLayout';
import {
  RECORD_QUOTE_MAX, recordFrame, placeRecordBlock, statColumns, splitStatValue, recordBlockPlan, recordTitleScale, recordTitleMaxLines,
  applyShareItems, shareVisibility, recordCoverPlacement,
} from './shareOverlay';
import { phraseLayout, phraseMetrics, phraseColors, phraseDisplayText } from './sharePhrase';
import { paletteFor } from './coverPalette';
import { apiUrl } from './apiUrl';

// ---------------------------------------------------------------- トークン・書体

function cssVar(name) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

// 'var(--cover-1a)' のような値をそのときの色に。
function resolveVar(value) {
  const m = /^var\((--[\w-]+)\)$/.exec(String(value || '').trim());
  return m ? cssVar(m[1]) : value;
}

// 地ごとの色。表紙の色は、表紙の画素から作った地（無ければ代用表紙の濃い方の色）。
export function readShareTheme(style, { tone = null, title = '' } = {}) {
  if (style === 'photo' || style === 'sticker') {
    const p = (n) => cssVar(`--share-photo-${n}`);
    return {
      key: style,
      bg: null,
      ink: p('ink') || '#ffffff',
      ink2: p('ink-2') || 'rgba(255,255,255,0.86)',
      ink3: p('ink-2') || 'rgba(255,255,255,0.86)',
      accent: cssVar('--share-accent') || '#df8e17',
      shadow: style === 'sticker' ? (cssVar('--share-sticker-shadow') || 'rgba(0,0,0,0.55)') : (p('shadow') || 'rgba(0,0,0,0.35)'),
      scrim: p('scrim') || '14, 12, 10',
      logo: 'white',
    };
  }
  const key = style === 'night' ? 'night' : style === 'cover' ? 'cover' : 'paper';
  const t = (n) => cssVar(`--share-${key}-${n}`);
  if (key === 'cover') {
    const [, b] = paletteFor(title);
    return {
      key,
      bg: tone ? rgbCss(tone) : (resolveVar(b) || '#5d3a22'),
      ink: t('ink') || '#ffffff',
      ink2: t('ink-2') || 'rgba(255,255,255,0.84)',
      ink3: t('ink-3') || 'rgba(255,255,255,0.72)',
      accent: cssVar('--share-accent') || '#df8e17',
      shadow: t('shadow') || 'rgba(0,0,0,0.35)',
      // 表紙の色の地は暗いので、ロゴは白（元の焦げ茶の文字は暗い地で読めない）
      logo: 'white',
    };
  }
  return {
    key, bg: t('bg'), ink: t('ink'), ink2: t('ink-2'), ink3: t('ink-3'), accent: cssVar('--share-accent') || '#df8e17', shadow: t('shadow'),
    logo: key === 'night' ? 'white' : 'color',
  };
}

// CSS の書体の並びから、最後の総称（serif / sans-serif）を外して、Linux・Android 向けの
// 和文書体を足してから総称で閉じる（iOS はヒラギノが先に見つかるので影響しない）。
function stack(varName, extra, generic) {
  const raw = cssVar(varName) || generic;
  const list = raw.split(',').map((s) => s.trim()).filter((s) => s && s !== generic && s !== 'system-ui');
  return [...list, ...extra, generic].join(', ');
}

export function fontStacks() {
  return {
    read: stack('--font-read', ['"IPAPMincho"', '"IPAMincho"', '"Noto Serif CJK JP"'], 'serif'),
    ui: stack('--font-ui', ['"IPAPGothic"', '"Noto Sans CJK JP"'], 'sans-serif'),
  };
}

// 書体の読み込みを待ってから描く（待たずに描くと別の書体で描かれることがある）。
export async function prepareFonts(sample = '') {
  const fonts = fontStacks();
  try {
    if (typeof document !== 'undefined' && document.fonts) {
      const text = `${sample}“『』Orime`.slice(0, 2000);
      await Promise.all([
        document.fonts.load(`400 64px ${fonts.read}`, text),
        document.fonts.load(`600 36px ${fonts.read}`, text),
        document.fonts.load(`400 28px ${fonts.ui}`, text),
        document.fonts.load(`600 32px ${fonts.ui}`, text),
      ]).catch(() => {});
      await document.fonts.ready;
    }
  } catch {
    /* 書体が確かめられなくても、並びの先頭から描ける */
  }
  return fonts;
}

// ---------------------------------------------------------------- 画像の読み込み

// 表紙を canvas に描ける URL にする。外部の画像は自前の中継（/api/cover-image）経由。
export function coverImageSrc(url, { origin = (typeof location !== 'undefined' ? location.origin : '') } = {}) {
  const r = coverProxyPath(url, origin);
  if (!r) return null;
  return r.direct ? r.src : apiUrl(r.src);
}

function loadImage(src, timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (!/^(data|blob):/i.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => { clearTimeout(timer); finish(img.naturalWidth > 1 && img.naturalHeight > 1 ? img : null); };
    img.onerror = () => { clearTimeout(timer); finish(null); };
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// 表紙の画素を少しだけ読む（汚れた canvas なら読めないので null）。
function samplePixels(img) {
  try {
    const c = makeCanvas(24, 36);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const out = [];
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) out.push([data[i], data[i + 1], data[i + 2]]);
    return out;
  } catch {
    return null;
  }
}

// 表紙を読み込み、canvas に描けるか確かめる。描けない・無いときは image=null（代用表紙を描く）。
export async function prepareCover(book) {
  const img = await loadImage(coverImageSrc(book?.cover));
  if (!img) return { image: null, tone: null };
  const pixels = samplePixels(img);
  if (!pixels) return { image: null, tone: null }; // 汚れる画像は描かない（書き出せなくなる）
  return { image: img, tone: coverTone(pixels) };
}

// 選んだ写真を読み込む（iPhone の写真の向きを直し、長い辺 2160 までに縮めておく＝動かすときに軽い）。
// 写真はこの端末の中だけで使う（どこにも送らない）。
export async function loadPhotoFile(file) {
  let source = null;
  let close = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      source = bmp;
      close = () => { try { bmp.close(); } catch { /* ignore */ } };
    } catch {
      source = null;
    }
  }
  if (!source) {
    const url = URL.createObjectURL(file);
    try {
      source = await loadImage(url, 15000);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  if (!source) throw new Error('この写真は読み込めませんでした。別の写真を選んでください。');
  const sw = source.width || source.naturalWidth;
  const sh = source.height || source.naturalHeight;
  const scale = Math.min(1, 2160 / Math.max(sw, sh));
  const c = makeCanvas(sw * scale, sh * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  close();
  return { source: c, width: c.width, height: c.height };
}

// ---------------------------------------------------------------- ロゴ

let logoPromise = null;

// public/logo-lockup.png（縦組み: 上に本の印・下に「Orime」）から、印と文字を切り出す。
// 白の版: 焦げ茶の線は白に、クリーム色の面は透明に（なめらかな縁は残す）。i の点の橙はそのまま。
function processLogo(img) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, W, H);
  const a = (x, y) => src.data[(y * W + x) * 4 + 3];
  // 透明な行で区切られた帯（小さな隙間はつなぐ）＝上が印、下が文字。
  const rowsOn = [];
  for (let y = 0; y < H; y += 1) {
    let on = false;
    for (let x = 0; x < W; x += 1) { if (a(x, y) > 16) { on = true; break; } }
    rowsOn.push(on);
  }
  const bands = [];
  let start = -1;
  let gap = 0;
  rowsOn.forEach((on, y) => {
    if (on) {
      if (start < 0) start = y;
      gap = 0;
    } else if (start >= 0) {
      gap += 1;
      if (gap > 12) { bands.push([start, y - gap]); start = -1; gap = 0; }
    }
  });
  if (start >= 0) bands.push([start, H - 1 - gap]);
  if (bands.length < 2) return null;
  const [markBand, wordBand] = [bands[0], bands[bands.length - 1]];
  const crop = ([y0, y1], white) => {
    let x0 = W; let x1 = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = 0; x < W; x += 1) if (a(x, y) > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const out = makeCanvas(w, h);
    const octx = out.getContext('2d');
    const part = ctx.getImageData(x0, y0, w, h);
    if (white) {
      const d = part.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
        const orange = r > 170 && r - b > 90 && g > 100 && g < 205 && b < 140;
        if (orange) continue; // i の点はそのまま（アクセントの橙）
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const ink = Math.min(1, Math.max(0, (205 - L) / 130)); // 焦げ茶＝1・クリーム＝0
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
        d[i + 3] = Math.round(d[i + 3] * ink);
      }
    }
    octx.putImageData(part, 0, 0);
    return out;
  };
  return {
    color: { mark: crop(markBand, false), word: crop(wordBand, false) },
    white: { mark: crop(markBand, true), word: crop(wordBand, true) },
  };
}

// ロゴを 1 回だけ読み込んで加工する（同じサイトの画像なので canvas は汚れない）。失敗したら null＝文字で代用。
export function prepareLogo() {
  if (!logoPromise) {
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    logoPromise = loadImage(`${base}logo-lockup.png`, 8000)
      .then((img) => { try { return img ? processLogo(img) : null; } catch { return null; } })
      .catch(() => null);
  }
  return logoPromise;
}

// ロゴ（印＋文字の横組み）を描く。文字の高さ wordH・基線 baseline・左端 x。戻り値は幅。
function drawLogo(ctx, logo, variant, { x, baseline, wordH, fonts, ink }) {
  const set = logo?.[variant === 'white' ? 'white' : 'color'];
  if (!set) {
    // 代用: 文字だけのロゴ（UI の書体の太字）
    const size = Math.round(wordH * 1.25);
    ctx.font = `700 ${size}px ${fonts.ui}`;
    ctx.fillStyle = ink;
    ctx.fillText('Orime', x, baseline);
    return ctx.measureText('Orime').width;
  }
  const { mark, word } = set;
  const wordW = (word.width / word.height) * wordH;
  const markH = wordH * 1.28;
  const markW = (mark.width / mark.height) * markH;
  const gap = wordH * 0.32;
  const centerY = baseline - wordH / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mark, x, centerY - markH / 2, markW, markH);
  ctx.drawImage(word, x + markW + gap, baseline - wordH, wordW, wordH);
  ctx.restore();
  return markW + gap + wordW;
}

// ---------------------------------------------------------------- 描画の部品

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const setSpacing = (ctx, em, size) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(em * size * 10) / 10}px`; };

function measurer(ctx, font, em = 0) {
  return (s) => { ctx.font = font; setSpacing(ctx, em, parseFloat(font.split(' ')[1]) || 16); return ctx.measureText(s).width; };
}

// 行に収まらなければ末尾を「…」で切る。
function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = Array.from(text);
  while (s.length > 0 && ctx.measureText(`${s.join('')}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.join('').replace(/[、。\s]+$/u, '')}…`;
}

// 行頭が開き括弧のとき、字の枠の左端から墨（実際に描かれる線）の左端までの距離。
// その分だけ左へずらすと、括弧の墨が他の行の文字の左端とそろう。
function inkLeftOffset(ctx, line) {
  const first = Array.from(line)[0] || '';
  if (!/[「『（(【〈《“]/.test(first)) return 0;
  const m = ctx.measureText(first);
  const inkLeft = -(m.actualBoundingBoxLeft || 0); // 正の値＝墨が枠の左端より右から始まる
  return Math.max(0, Math.min(inkLeft, m.width * 0.6));
}

// 引用符「“」の墨の高さが inkH になる大きさ（書体によって字の大きさが違うため測る）。
function quoteMark(ctx, fonts, inkH) {
  ctx.font = `400 100px ${fonts.read}`;
  setSpacing(ctx, 0, 100);
  const probe = ctx.measureText('“');
  const probeInk = (probe.actualBoundingBoxAscent ?? 70) + (probe.actualBoundingBoxDescent ?? -35);
  const size = Math.round(Math.min(inkH * 6, Math.max(inkH, (inkH / Math.max(10, probeInk)) * 100)));
  ctx.font = `400 ${size}px ${fonts.read}`;
  const m = ctx.measureText('“');
  return { font: ctx.font, size, ascent: m.actualBoundingBoxAscent || size * 0.7, left: m.actualBoundingBoxLeft || 0 };
}

function drawQuoteMark(ctx, mark, x, top, color) {
  ctx.font = mark.font;
  setSpacing(ctx, 0, mark.size);
  ctx.fillStyle = color;
  ctx.fillText('“', x + mark.left, top + mark.ascent); // 墨の左端を本文の左端に
}

// 一文の組み（枠に収まる大きさと改行）。いくつもの組み方を比べるので、同じ条件の結果は覚えておく
// （写真を指で動かしている間は毎フレーム描き直すため）。
const quoteLayoutCache = new Map();
function layoutQuote(ctx, fonts, text, { maxWidth, maxHeight, sizes, lineHeight }) {
  const key = JSON.stringify([fonts.read, text, maxWidth, Math.round(maxHeight), sizes, lineHeight]);
  const hit = quoteLayoutCache.get(key);
  if (hit) return hit;
  const fit = fitQuote(text, {
    maxWidth,
    maxHeight,
    sizes,
    lineHeight,
    measureAt: (size) => {
      const m = measurer(ctx, `400 ${size}px ${fonts.read}`, 0.02);
      const trail = Math.round(0.02 * size * 10) / 10; // 行末の字間は墨にならないので数えない
      const memo = new Map();
      return (s) => {
        if (!memo.has(s)) memo.set(s, s ? Math.max(0, m(s) - trail) : 0);
        return memo.get(s);
      };
    },
  });
  if (quoteLayoutCache.size > 40) quoteLayoutCache.delete(quoteLayoutCache.keys().next().value);
  quoteLayoutCache.set(key, fit);
  return fit;
}

// 手描きの傍線（最後の行の下・文字より先に描いて文字の後ろに回す）。
function drawUnderline(ctx, { x0, x1, y, weight, seed, color }) {
  const st = underlineStroke({ x0, x1, y, weight, seed });
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  st.top.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
  st.bottom.forEach(([x, yy]) => ctx.lineTo(x, yy));
  ctx.closePath();
  ctx.fill();
  [st.capStart, st.capEnd].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}

function drawQuoteLines(ctx, fonts, fit, left, top, color, underline = null) {
  ctx.font = `400 ${fit.size}px ${fonts.read}`;
  setSpacing(ctx, 0.02, fit.size);
  const ascent = fit.size * 0.88; // 行の箱の上から字の基線まで（明朝のおおよそ）
  const half = (fit.lineHeight - fit.size) / 2;
  if (underline && fit.lines.length) {
    const last = fit.lines[fit.lines.length - 1];
    const lx = left - inkLeftOffset(ctx, last);
    const m = ctx.measureText(last);
    const inkRight = lx + (m.actualBoundingBoxRight || m.width);
    const baseline = top + (fit.lines.length - 1) * fit.lineHeight + half + ascent;
    drawUnderline(ctx, { x0: left, x1: inkRight, y: baseline + fit.size * 0.24, weight: Math.max(8, fit.size * 0.2), seed: underline.seed, color: underline.color });
    ctx.font = `400 ${fit.size}px ${fonts.read}`;
    setSpacing(ctx, 0.02, fit.size);
  }
  ctx.fillStyle = color;
  fit.lines.forEach((ln, i) => {
    // 行頭の開き括弧（「『（）は、字の墨の左端を本文の左端にそろえる（括弧の前の空きを詰める）。
    ctx.fillText(ln, left - inkLeftOffset(ctx, ln), top + i * fit.lineHeight + half + ascent);
  });
}

// 付箋（橙）: 本の右の小口から、その一文のあたりの高さで少しはみ出す。
// 本の裏に差し込んだように、本（表紙）より先に描く。frac＝本の上 0〜下 1。
function tabGeometry({ y, h, w, frac, seed }) {
  const th = Math.max(10, h * 0.1); // 付箋の幅（縦）
  const inset = h * 0.05;
  const ty = y + inset + (h - inset * 2 - th) * frac;
  const protrude = Math.max(12, w * 0.24);
  const tilt = ((((seed >>> 8) % 1000) / 1000) - 0.5) * 0.08; // ±2.3° の傾き（メモごとに決まる）
  return { ty, th, protrude, tilt };
}
function drawTab(ctx, { rightX, y, h, w, frac, seed, color }) {
  const { ty, th, protrude, tilt } = tabGeometry({ y, h, w, frac, seed });
  ctx.save();
  ctx.translate(rightX, ty + th / 2);
  ctx.rotate(tilt);
  ctx.fillStyle = color;
  const r = Math.min(3, th * 0.25);
  roundRectPath(ctx, -th * 2, -th / 2, th * 2 + protrude, th, r);
  ctx.fill();
  ctx.restore();
  return protrude;
}

// 写真・透明の地で使う小さな本の印（白い線の本＋橙の付箋）。表紙の代わり。
function drawBookIcon(ctx, { x, y, w, h, frac, seed, line, accent }) {
  if (frac != null) drawTab(ctx, { rightX: x + w, y, h, w, frac, seed, color: accent });
  const lw = Math.max(2.5, w * 0.07);
  ctx.save();
  ctx.lineWidth = lw;
  ctx.strokeStyle = line;
  roundRectPath(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, Math.max(3, w * 0.08));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.22, y + lw);
  ctx.lineTo(x + w * 0.22, y + h - lw);
  ctx.stroke();
  ctx.restore();
}

function drawCover(ctx, { x, y, w, h, cover, title, theme, fonts, showText = true }) {
  const r = Math.round(w * 0.035); // 本の形（DESIGN §4 の例外・角丸 4 相当）
  ctx.save();
  ctx.shadowColor = theme.shadow;
  ctx.shadowBlur = Math.round(w * 0.22);
  ctx.shadowOffsetY = Math.round(w * 0.07);
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  if (cover?.image) {
    const img = cover.image;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    // 代用表紙（アプリの表紙が無い本と同じ色の組・書名入り。書名を隠したときは色だけ）。
    const [a, b] = paletteFor(title).map(resolveVar);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, a || '#7d4a2e');
    g.addColorStop(1, b || '#5d3a22');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    const size = Math.round(w * 0.13);
    const font = `600 ${size}px ${fonts.read}`;
    if (!showText) { ctx.restore(); return; }
    ctx.font = font;
    setSpacing(ctx, 0, size);
    ctx.fillStyle = cssVar('--on-cover') || '#ffffff';
    ctx.textBaseline = 'top';
    const pad = Math.round(w * 0.1);
    const lines = wrapBalanced(title || '', w - pad * 2, measurer(ctx, font));
    const maxLines = Math.max(1, Math.floor((h - pad * 2) / (size * 1.35)));
    lines.slice(0, maxLines).forEach((l, i) => {
      const text = i === maxLines - 1 && lines.length > maxLines ? ellipsize(ctx, `${l}…`, w - pad * 2) : l;
      ctx.fillText(text, x + pad, y + pad + i * size * 1.35);
    });
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // ごく細い縁（表紙の白い部分が地に溶けないように）。
  ctx.save();
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.strokeStyle = theme.key === 'paper' ? 'rgba(43,40,37,0.12)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// 『書名』（2 行まで）＋ 著者・p.N の組みと高さ。
function layoutBookLines(ctx, fonts, { title, author, page, width, titleFont, titleSize, metaSize }) {
  ctx.font = titleFont;
  setSpacing(ctx, 0.02, titleSize);
  // title が null のときは書名を隠す（表示する項目・2026-10-01）。
  let titleLines = title === null ? [] : wrapBalanced(`『${title || '無題'}』`, width, measurer(ctx, titleFont, 0.02));
  if (titleLines.length > 2) titleLines = [titleLines[0], ellipsize(ctx, `${titleLines[1]}${titleLines.slice(2).join('')}`, width)];
  const titleLH = Math.round(titleSize * 1.4);
  const authorText = String(author || '').trim();
  const pageText = Number.isFinite(page) && page > 0 ? `p.${page}` : '';
  const metaLH = Math.round(metaSize * 1.5);
  const hasMeta = !!(authorText || pageText);
  const gap = titleLines.length && hasMeta ? 10 : 0;
  return { titleLines, titleLH, authorText, pageText, metaLH, height: titleLines.length * titleLH + (hasMeta ? gap + metaLH : 0) };
}

function drawBookLines(ctx, fonts, bl, { x, top, width, titleFont, titleSize, metaSize, ink, ink2, ink3 }) {
  let cy = top;
  ctx.fillStyle = ink;
  bl.titleLines.forEach((tl) => {
    ctx.font = titleFont;
    setSpacing(ctx, 0.02, titleSize);
    ctx.fillText(tl, x - inkLeftOffset(ctx, tl), cy + bl.titleLH * 0.78);
    cy += bl.titleLH;
  });
  if (bl.authorText || bl.pageText) {
    if (bl.titleLines.length) cy += 10;
    ctx.font = `400 ${metaSize}px ${fonts.ui}`;
    setSpacing(ctx, 0.02, metaSize);
    let mx = x;
    if (bl.authorText) {
      const a = ellipsize(ctx, bl.authorText, width - (bl.pageText ? 120 : 0));
      ctx.fillStyle = ink2;
      ctx.fillText(a, mx, cy + bl.metaLH * 0.72);
      mx += ctx.measureText(a).width + 24;
    }
    if (bl.pageText) {
      ctx.fillStyle = ink3;
      ctx.fillText(bl.pageText, mx, cy + bl.metaLH * 0.72);
    }
  }
}

// ロゴだけ（URL は入れない・2026-10-01）。
function drawFooter(ctx, { margin, baseline, wordH, logo, theme, fonts }) {
  drawLogo(ctx, logo, theme.logo, { x: margin, baseline, wordH, fonts, ink: theme.ink });
}

// ---------------------------------------------------------------- 紙・夜・表紙の色

// 形ごとの寸法。ストーリーは Instagram などの上下の帯（約 250px）に文字をかけない
// （下の帯は 1920 − 250 ＝ 1670 から。ロゴと URL の基線は 1630）。
// 著者・ページ・URL は、スマホで縮めて見ても読める大きさ（ストーリー 36・URL 34 以上）。書名はそれより大きく。
const POSTER = {
  story: { margin: 112, top: 300, bottom: 1460, footerBaseline: 1630, markInk: 76, sizes: [92, 84, 76, 70, 64, 60, 56, 52, 48, 44], coverW: 140, titleSize: 46, metaSize: 36, wordH: 44 },
  post: { margin: 104, top: 128, bottom: 1110, footerBaseline: 1258, markInk: 60, sizes: [76, 70, 64, 60, 56, 52, 48, 44, 40, 38], coverW: 124, titleSize: 42, metaSize: 35, wordH: 38 },
  square: { margin: 96, top: 104, bottom: 870, footerBaseline: 1000, markInk: 50, sizes: [68, 62, 56, 52, 48, 44, 40, 36, 34, 32], coverW: 112, titleSize: 40, metaSize: 34, wordH: 34 },
};

function drawPoster(ctx, o) {
  const { W, H, format, theme, fonts, text } = o;
  const L = POSTER[format] || POSTER.story;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  if (theme.key === 'cover') {
    // 表紙の色の地は、下に向かってわずかに沈める（平板にしない）。
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const left = L.margin;
  const contentW = W - L.margin * 2;
  const mark = quoteMark(ctx, fonts, L.markInk);
  const markGap = Math.round(L.sizes[0] * 0.55);
  const coverH = Math.round(L.coverW * 1.45);
  // 書名も著者も隠したときは、本の行（表紙＋書名）ごと出さない。
  const showBook = o.showTitle !== false || o.showAuthor !== false;
  const bookGap = showBook ? Math.round(L.sizes[0] * 1.15) : 0; // 傍線の下から本の行まで
  const fixedH = L.markInk + markGap + bookGap + (showBook ? coverH : 0);
  const fit = layoutQuote(ctx, fonts, text, { maxWidth: contentW, maxHeight: (L.bottom - L.top) - fixedH, sizes: L.sizes, lineHeight: 1.62 });
  const quoteH = fit.lines.length * fit.lineHeight;
  // 目で見た中心（数学の中心より少し上）に置く。
  let y = L.top + Math.max(0, (L.bottom - L.top - fixedH - quoteH) * 0.44);

  drawQuoteMark(ctx, mark, left, y, theme.accent);
  y += L.markInk + markGap;
  drawQuoteLines(ctx, fonts, fit, left, y, theme.ink, { seed: o.seed, color: theme.accent });
  y += quoteH + bookGap;

  if (showBook) drawPosterBook(ctx, o, L, { left, y, coverH, theme, fonts });
  if (o.showLogo !== false) drawFooter(ctx, { margin: L.margin, baseline: L.footerBaseline, wordH: L.wordH, logo: o.logo, theme, fonts });
}

function drawPosterBook(ctx, o, L, { left, y, coverH, theme, fonts }) {
  const { W } = o;
  // 付箋（ページがあるときだけ）→ 表紙の順に描く（付箋が本に挟まって見える）。
  const tabOut = o.frac != null
    ? drawTab(ctx, { rightX: left + L.coverW, y, h: coverH, w: L.coverW, frac: o.frac, seed: o.seed, color: theme.accent })
    : 0;
  drawCover(ctx, { x: left, y, w: L.coverW, h: coverH, cover: o.cover, title: o.title, theme, fonts, showText: o.showTitle !== false });
  const colX = left + L.coverW + tabOut + 36;
  const colW = W - L.margin - colX;
  const titleFont = `600 ${L.titleSize}px ${fonts.read}`;
  const bl = layoutBookLines(ctx, fonts, bookLineOpts(o, { width: colW, titleFont, titleSize: L.titleSize, metaSize: L.metaSize }));
  drawBookLines(ctx, fonts, bl, { x: colX, top: y + (coverH - bl.height) / 2, width: colW, titleFont, titleSize: L.titleSize, metaSize: L.metaSize, ink: theme.ink, ink2: theme.ink2, ink3: theme.ink3 });
}

// 表示する項目に合わせた書名・著者（隠した書名は null・隠した著者は空）。
function bookLineOpts(o, rest) {
  return { title: o.showTitle === false ? null : o.title, author: o.showAuthor === false ? '' : o.author, page: o.showAuthor === false ? null : o.page, ...rest };
}

// ---------------------------------------------------------------- 写真

const PHOTO = {
  story: { margin: 88, safeTop: 270, footerBaseline: 1630, markInk: 50, sizes: [84, 76, 70, 64, 60, 56, 52, 48, 44, 40], maxBlock: 0.5, titleSize: 44, metaSize: 36, wordH: 46 },
  post: { margin: 80, safeTop: 96, footerBaseline: 1266, markInk: 44, sizes: [72, 66, 60, 56, 52, 48, 44, 40, 36], maxBlock: 0.52, titleSize: 42, metaSize: 35, wordH: 40 },
  square: { margin: 72, safeTop: 80, footerBaseline: 1008, markInk: 40, sizes: [64, 58, 54, 50, 46, 42, 38, 34, 32], maxBlock: 0.56, titleSize: 40, metaSize: 34, wordH: 36 },
};

// 文字の塊（引用符・一文・書名・著者）の組み。
function layoutOverlay(ctx, fonts, o, L, maxBlockH) {
  const contentW = o.W - L.margin * 2;
  const mark = quoteMark(ctx, fonts, L.markInk);
  const markGap = Math.round(L.sizes[0] * 0.42);
  const bookGap = Math.round(L.sizes[0] * 0.95); // 傍線の下から書名まで
  const titleFont = `600 ${L.titleSize}px ${fonts.ui}`;
  // 書名の左に小さな本の印（白い線）と付箋。書名はその分だけ右から始める。
  const iconH = Math.round(L.titleSize * 1.4 + L.metaSize * 1.5 + 10);
  const iconW = Math.round(iconH * 0.7);
  const iconOut = Math.max(12, iconW * 0.24);
  const textX = iconW + iconOut + 28;
  const showBook = o.showTitle !== false || o.showAuthor !== false;
  const bl = layoutBookLines(ctx, fonts, bookLineOpts(o, { width: contentW - textX, titleFont, titleSize: L.titleSize, metaSize: L.metaSize }));
  const gapBook = showBook ? bookGap : 0;
  const bookH = showBook ? Math.max(iconH, bl.height) : 0;
  const fixedH = L.markInk + markGap + gapBook + bookH;
  const fit = layoutQuote(ctx, fonts, o.text, { maxWidth: contentW, maxHeight: maxBlockH - fixedH, sizes: L.sizes, lineHeight: 1.55 });
  const quoteH = fit.lines.length * fit.lineHeight;
  return { mark, markGap, bookGap: gapBook, showBook, titleFont, bl, fit, quoteH, height: fixedH + quoteH, contentW, iconH, iconW, textX };
}

function drawOverlay(ctx, fonts, o, L, lay, top, theme) {
  const left = L.margin;
  let y = top;
  drawQuoteMark(ctx, lay.mark, left, y, theme.accent);
  y += L.markInk + lay.markGap;
  drawQuoteLines(ctx, fonts, lay.fit, left, y, theme.ink, { seed: o.seed, color: theme.accent });
  y += lay.quoteH + lay.bookGap;
  if (!lay.showBook) return;
  const rowH = Math.max(lay.iconH, lay.bl.height);
  drawBookIcon(ctx, { x: left, y: y + (rowH - lay.iconH) / 2, w: lay.iconW, h: lay.iconH, frac: o.frac, seed: o.seed, line: theme.ink, accent: theme.accent });
  drawBookLines(ctx, fonts, lay.bl, { x: left + lay.textX, top: y + (rowH - lay.bl.height) / 2, width: lay.contentW - lay.textX, titleFont: lay.titleFont, titleSize: L.titleSize, metaSize: L.metaSize, ink: theme.ink, ink2: theme.ink2, ink3: theme.ink2 });
}

// 写真の、ある帯（y0〜y1）の明るい部分の輝度。
function bandLuminance(photo, place, W, H, y0, y1) {
  try {
    const sw = 54;
    const k = sw / W;
    const sh = Math.max(1, Math.round(H * k));
    const c = makeCanvas(sw, sh);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(photo.source, place.x * k, place.y * k, place.w * k, place.h * k);
    const r0 = Math.max(0, Math.floor(y0 * k));
    const r1 = Math.min(sh, Math.ceil(y1 * k));
    if (r1 <= r0) return 0.5;
    const { data } = ctx.getImageData(0, r0, sw, r1 - r0);
    const px = [];
    for (let i = 0; i < data.length; i += 4) px.push([data[i], data[i + 1], data[i + 2]]);
    return brightLuminance(px);
  } catch {
    return 0.6; // 読めないときは明るい写真とみなして濃いめの幕
  }
}

// 黒の幕（上下どちらかから・または帯）。stops は [位置(0〜H), 濃さ(0〜1)] の並び。
function drawScrim(ctx, W, H, scrim, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach(([y, a]) => g.addColorStop(Math.min(1, Math.max(0, y / H)), `rgba(${scrim}, ${a})`));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawPhoto(ctx, o) {
  const { W, H } = o;
  const place = photoPlacement({ pw: o.photo.width, ph: o.photo.height, W, H, ...(o.view || {}) });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(o.photo.source, place.x, place.y, place.w, place.h);
  drawPhotoOverlay(ctx, o, place);
}

// 写真の上に重ねるもの（幕・一文・書名・ロゴ）。幕の濃さは、写真のこの置き方（place）の明るさで決める。
// 写真を指で動かしている間は、これを 1 回だけ別の canvas に描いておき、写真の上に重ねるだけにする（drawPhotoDragFrame）。
function drawPhotoOverlay(ctx, o, place) {
  const { W, H, format, theme, fonts } = o;
  const L = PHOTO[format] || PHOTO.story;
  const footerTop = L.footerBaseline - L.wordH * 1.5;
  const pos = o.textPos === 'top' || o.textPos === 'center' ? o.textPos : 'bottom';
  const maxBlockH = H * L.maxBlock;
  const lay = layoutOverlay(ctx, fonts, o, L, maxBlockH);
  let top;
  if (pos === 'top') top = L.safeTop;
  else if (pos === 'center') top = (H - lay.height) / 2 - H * 0.02;
  else top = footerTop - 56 - lay.height;
  const bottom = top + lay.height;

  // 幕: 文字の後ろの明るさに合わせて濃さを決める（白い文字と 4.5:1 以上を目安に）。
  const a = scrimAlpha(bandLuminance(o.photo, place, W, H, top, bottom));
  const aFoot = scrimAlpha(bandLuminance(o.photo, place, W, H, footerTop, L.footerBaseline + 8));
  // 幕は文字の塊の上端（引用符）より手前で決めた濃さに届かせる＝一文の 1 行目から白い文字が読める。
  const fade = H * 0.2;
  if (pos === 'bottom') {
    drawScrim(ctx, W, H, theme.scrim, [[top - fade, 0], [top - fade * 0.2, a], [H, Math.max(a, aFoot)]]);
  } else {
    const stops = pos === 'top'
      ? [[0, a], [bottom + fade * 0.2, a], [bottom + fade, 0]]
      : [[top - fade, 0], [top - fade * 0.2, a], [bottom + fade * 0.2, a], [bottom + fade, 0]];
    drawScrim(ctx, W, H, theme.scrim, stops);
    drawScrim(ctx, W, H, theme.scrim, [[footerTop - fade * 0.8, 0], [H, aFoot]]);
  }

  // 影のぼかしは canvas の拡大・縮小（transform）に追従しないので、縮めて描くとき（shadowScale）は掛けて合わせる。
  const sb = o.shadowScale || 1;
  ctx.save();
  ctx.shadowColor = theme.shadow;
  ctx.shadowBlur = 18 * sb;
  ctx.shadowOffsetY = 2 * sb;
  drawOverlay(ctx, fonts, o, L, lay, top, theme);
  ctx.restore();
  ctx.save();
  ctx.shadowColor = theme.shadow;
  ctx.shadowBlur = 14 * sb;
  if (o.showLogo !== false) drawFooter(ctx, { margin: L.margin, baseline: L.footerBaseline, wordH: L.wordH, logo: o.logo, theme, fonts });
  ctx.restore();
}

// ---------------------------------------------------------------- 透明（ステッカー）

// 透明の地に白い文字の塊＋ロゴ。大きさは中身に合わせる（幅 1080・高さは可変）。
function stickerSize(ctx, o) {
  const L = { ...PHOTO.story, margin: 72 };
  const lay = layoutOverlay(ctx, o.fonts, { ...o, W: 1080 }, L, 1500);
  const pad = 72;
  const logoGap = 56;
  const footH = o.showLogo !== false ? logoGap + L.wordH * 1.3 : 0;
  return { L, lay, pad, logoGap, w: 1080, h: Math.round(pad + lay.height + footH + pad) };
}

function drawSticker(ctx, o, size) {
  const { L, lay, pad, logoGap } = size;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.shadowColor = o.theme.shadow;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 3;
  drawOverlay(ctx, o.fonts, { ...o, W: 1080 }, L, lay, pad, o.theme);
  const baseline = pad + lay.height + logoGap + L.wordH;
  // ロゴだけ（ほかの地と同じ・SPEC §2-1）。
  if (o.showLogo !== false) drawFooter(ctx, { margin: L.margin, baseline, wordH: L.wordH, logo: o.logo, theme: { ...o.theme, logo: 'white' }, fonts: o.fonts });
  ctx.restore();
}

// ---------------------------------------------------------------- 記録（Strava の形・2026-09-30）
//
// 写真の下のほうに、読書の記録を重ねる:
//   （一文・任意・3 行まで・橙の傍線）
//   ● 読了                 … 見出し（橙の点＋小さな文字）
//   『書名』               … 明朝の太字・2 行まで
//   著者                   … 1 行
//   ─────────
//   読了      メモ    実行した行動   … 数字は大きく・単位は小さく（3 つまで・0 は出さない）
//   9月28日   24件    5件
//   Orime のロゴ                        2026.9.30
// 文字は SNS で切られない範囲（recordFrame の安全な枠）の中だけ。写真でない地では、空いた上に表紙を置く。

function layoutRecord(ctx, fonts, o, F) {
  const rec = o.record || { kicker: '', title: '', stats: [] };
  const contentW = F.W - F.margin * 2;
  const stats = (rec.stats || []).slice(0, 3);
  // 数字を全部隠したときは書名を主役に（大きく・3 行まで）。
  const titleScale = recordTitleScale({ statsCount: stats.length });
  const titleSize = Math.round(F.titleSize * titleScale);
  const titleFont = `600 ${titleSize}px ${fonts.read}`;
  ctx.font = titleFont;
  setSpacing(ctx, 0.01, titleSize);
  const tText = rec.title ? (rec.titleIsBook ? `『${rec.title}』` : String(rec.title)) : '';
  let titleLines = tText ? wrapBalanced(tText, contentW, measurer(ctx, titleFont, 0.01)) : [];
  const maxLines = recordTitleMaxLines({ statsCount: stats.length });
  if (titleLines.length > maxLines) titleLines = [...titleLines.slice(0, maxLines - 1), ellipsize(ctx, titleLines.slice(maxLines - 1).join(''), contentW)];
  const subFont = `400 ${F.subSize}px ${fonts.ui}`;
  let sub = '';
  if (rec.sub) {
    ctx.font = subFont;
    setSpacing(ctx, 0.02, F.subSize);
    sub = ellipsize(ctx, String(rec.sub), contentW);
  }
  const subLH = Math.round(F.subSize * 1.45);
  const labelH = Math.round(F.statLabelSize * 1.3);
  const parts = { hasKicker: !!rec.kicker, titleLines: titleLines.length, hasSub: !!sub, statsCount: stats.length };
  const base = recordBlockPlan(F, parts);
  const bottom = placeRecordBlock(F, 0, { hasFooter: o.hasFooter !== false }).bottom;
  let fit = null;
  // 書名も数字も隠したときは、一文を主役に（大きく・4 行まで）。
  const heroQuote = titleLines.length === 0 && stats.length === 0;
  const sizes = heroQuote ? F.quoteSizes.map((n) => Math.round(n * 1.3)) : F.quoteSizes;
  const quoteGapBelow = base.height > 0 ? Math.round(F.quoteSizes[0] * 0.95) : 0;
  if (o.text) {
    const room = (bottom - F.safeTop) - base.height - quoteGapBelow;
    const cap = Math.min(room, sizes[0] * 1.55 * (heroQuote ? 4 : 3));
    if (cap > sizes[sizes.length - 1] * 1.55) {
      const f = layoutQuote(ctx, fonts, o.text, { maxWidth: contentW, maxHeight: cap, sizes, lineHeight: 1.55 });
      if (f && f.lines.length && f.lines.length * f.lineHeight <= cap + 0.5) fit = f;
    }
  }
  const plan = fit ? recordBlockPlan(F, { ...parts, quoteLines: fit.lines.length, quoteLineHeight: fit.lineHeight }) : base;
  return { rec, titleLines, titleLH: plan.titleLH, titleFont, titleSize, sub, subFont, subLH, stats, labelH, contentW, fit, plan, height: plan.height };
}

function drawStat(ctx, fonts, F, stat, col, top, lay, theme) {
  ctx.font = `400 ${F.statLabelSize}px ${fonts.ui}`;
  setSpacing(ctx, 0.04, F.statLabelSize);
  ctx.fillStyle = theme.ink2;
  ctx.fillText(ellipsize(ctx, stat.label, col.width - 16), col.x, top + lay.labelH * 0.78);
  // 数字は大きく（700）・単位は小さく（600）。列に入らなければ全体を縮める。
  const parts = splitStatValue(stat.value);
  const widthAt = (k) => parts.reduce((w, p) => {
    ctx.font = p.big ? `700 ${Math.round(F.statValueSize * k)}px ${fonts.ui}` : `600 ${Math.round(F.statUnitSize * k)}px ${fonts.ui}`;
    setSpacing(ctx, 0, F.statValueSize);
    return w + ctx.measureText(p.text).width + (p.big ? 0 : 2);
  }, 0);
  const k = Math.min(1, (col.width - 20) / Math.max(1, widthAt(1)));
  const baseline = top + lay.labelH + 10 + F.statValueSize * 0.86;
  let x = col.x;
  ctx.fillStyle = theme.ink;
  parts.forEach((p) => {
    ctx.font = p.big ? `700 ${Math.round(F.statValueSize * k)}px ${fonts.ui}` : `600 ${Math.round(F.statUnitSize * k)}px ${fonts.ui}`;
    setSpacing(ctx, 0, F.statValueSize);
    ctx.fillText(p.text, x + (p.big ? 0 : 2), baseline);
    x += ctx.measureText(p.text).width + (p.big ? 0 : 4);
  });
}

// recordBlockPlan の組みのとおりに描く（隠した項目は組みに無い＝場所を取らない）。
function drawRecordBlock(ctx, fonts, o, F, lay, top, theme) {
  const left = F.margin;
  for (const el of lay.plan.elements) {
    const y = top + el.top;
    if (el.kind === 'quote') {
      drawQuoteLines(ctx, fonts, lay.fit, left, y, theme.ink, { seed: o.seed, color: theme.accent });
    } else if (el.kind === 'kicker') {
      // 見出しの前に橙の点（ロゴの i の点と同じ色・Strava の橙にあたる印）。
      const r = Math.round(F.kickerSize * 0.2);
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(left + r, y + el.height * 0.52, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.font = `600 ${F.kickerSize}px ${fonts.ui}`;
      setSpacing(ctx, 0.08, F.kickerSize);
      ctx.fillStyle = theme.ink2;
      ctx.fillText(lay.rec.kicker, left + r * 2 + 14, y + el.height * 0.78);
    } else if (el.kind === 'title') {
      ctx.fillStyle = theme.ink;
      lay.titleLines.forEach((ln, i) => {
        ctx.font = lay.titleFont;
        setSpacing(ctx, 0.01, lay.titleSize);
        ctx.fillText(ln, left - inkLeftOffset(ctx, ln), y + i * lay.titleLH + lay.titleLH * 0.8);
      });
    } else if (el.kind === 'sub') {
      ctx.font = lay.subFont;
      setSpacing(ctx, 0.02, F.subSize);
      ctx.fillStyle = theme.ink2;
      ctx.fillText(lay.sub, left, y + lay.subLH * 0.76);
    } else if (el.kind === 'rule') {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = theme.ink;
      ctx.fillRect(left, y - 1, lay.contentW, 2);
      ctx.restore();
    } else if (el.kind === 'stats') {
      const cols = statColumns(F, lay.stats.length);
      lay.stats.forEach((st, i) => drawStat(ctx, fonts, F, st, cols[i], y, lay, theme));
    }
  }
}

// ロゴ（左）と、右に今日の日付（2026.10.1）。URL は入れない（2026-10-01 オーナー裁定「ロゴのみでOK」）。
// どちらも「表示する項目」で隠せる。どれも安全な枠（余白 F.margin・基線 F.footerBaseline）の中。
function drawRecordFooter(ctx, { F, baseline, logo, theme, fonts, stamp, showLogo = true }) {
  if (showLogo) drawLogo(ctx, logo, theme.logo, { x: F.margin, baseline, wordH: F.wordH, fonts, ink: theme.ink });
  if (!stamp) return;
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.ink2;
  ctx.font = `400 ${F.metaSize}px ${fonts.ui}`;
  setSpacing(ctx, 0.04, F.metaSize);
  ctx.fillText(stamp, F.W - F.margin, baseline);
  ctx.textAlign = 'left';
}

// 一文が入らなければ一文を外して組み直す（書名と数字は必ず見せる）。
function fitRecord(ctx, o, F) {
  let lay = layoutRecord(ctx, o.fonts, o, F);
  const opt = { hasFooter: o.hasFooter !== false };
  let place = placeRecordBlock(F, lay.height, opt);
  if (!place.fits && lay.fit) {
    lay = layoutRecord(ctx, o.fonts, { ...o, text: '' }, F);
    place = placeRecordBlock(F, lay.height, opt);
  }
  return { lay, place };
}

function drawRecordOverlay(ctx, o, place) {
  const F = recordFrame(o.format);
  const { lay, place: at } = fitRecord(ctx, o, F);
  // 何も重ねない（全部の項目を隠した）ときは幕も掛けない（写真そのまま）。
  if (lay.height <= 0 && o.hasFooter === false) return;
  // 幕: 文字の後ろ（まとまりの上端からロゴまで）の明るさで濃さを決め、上端より手前で届かせる。
  const a = scrimAlpha(bandLuminance(o.photo, place, F.W, F.H, at.top, F.footerBaseline + 8));
  const fade = F.H * 0.22;
  drawScrim(ctx, F.W, F.H, o.theme.scrim, [[at.top - fade, 0], [at.top - fade * 0.2, a], [F.H, Math.min(0.88, a + 0.06)]]);
  const sb = o.shadowScale || 1;
  ctx.save();
  ctx.shadowColor = o.theme.shadow;
  ctx.shadowBlur = 18 * sb;
  ctx.shadowOffsetY = 2 * sb;
  drawRecordBlock(ctx, o.fonts, o, F, lay, at.top, o.theme);
  drawRecordFooter(ctx, { F, baseline: F.footerBaseline, logo: o.logo, theme: o.theme, fonts: o.fonts, stamp: o.stamp, showLogo: o.showLogo !== false });
  ctx.restore();
}

function drawRecordPhoto(ctx, o) {
  const place = photoPlacement({ pw: o.photo.width, ph: o.photo.height, W: o.W, H: o.H, ...(o.view || {}) });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(o.photo.source, place.x, place.y, place.w, place.h);
  drawRecordOverlay(ctx, o, place);
}

// 写真でない地（紙・夜・表紙の色）: 下に記録、空いた上に表紙（今月は読み終えた本の表紙を 4 冊まで）。
function drawRecordPoster(ctx, o) {
  const { theme } = o;
  const F = recordFrame(o.format);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, F.W, F.H);
  if (theme.key === 'cover') {
    const g = ctx.createLinearGradient(0, 0, 0, F.H);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, F.W, F.H);
  }
  const { lay, place } = fitRecord(ctx, o, F);
  // 言葉を入れたときは、上の空きは言葉が主役（表紙と重ねない）。
  const covers = o.phrase && phraseDisplayText(o.phrase)
    ? []
    : (o.covers && o.covers.length ? o.covers : (o.record?.titleIsBook ? [{ cover: o.cover, title: o.title }] : [])).slice(0, 4);
  const titleOnly = lay.plan.elements.length === 1 && lay.plan.elements[0].kind === 'title';
  const at = recordCoverPlacement(F, place, { count: covers.length, titleOnly });
  if (at) {
    const { x0, y0, w, h, step } = at;
    covers.forEach((c, i) => {
      drawCover(ctx, { x: x0 + step * i, y: y0 + (covers.length > 1 ? (i % 2) * h * 0.04 : 0), w, h, cover: c.cover, title: c.title, theme, fonts: o.fonts, showText: o.showTitle !== false });
    });
  }
  drawRecordBlock(ctx, o.fonts, o, F, lay, place.top, theme);
  drawRecordFooter(ctx, { F, baseline: F.footerBaseline, logo: o.logo, theme, fonts: o.fonts, stamp: o.stamp, showLogo: o.showLogo !== false });
}

// 透明（ステッカー）の記録: 文字の塊とロゴだけ。高さは中身に合わせる。
function recordStickerSize(ctx, o) {
  const F = { ...recordFrame('story'), margin: 72, safeTop: 0, footerTop: 1920, gap: 0 };
  const lay = layoutRecord(ctx, o.fonts, o, F);
  const pad = 72;
  const logoGap = 64;
  const footH = o.hasFooter !== false ? logoGap + F.wordH * 1.3 : 0;
  return { F, lay, pad, logoGap, w: 1080, h: Math.max(pad * 2 + 120, Math.round(pad + lay.height + footH + pad)) };
}

function drawRecordSticker(ctx, o, size) {
  const { F, lay, pad, logoGap } = size;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.shadowColor = o.theme.shadow;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 3;
  drawRecordBlock(ctx, o.fonts, o, F, lay, pad, o.theme);
  drawRecordFooter(ctx, { F, baseline: pad + lay.height + (lay.height > 0 ? logoGap : 0) + F.wordH, logo: o.logo, theme: { ...o.theme, logo: 'white' }, fonts: o.fonts, stamp: o.stamp, showLogo: o.showLogo !== false });
  ctx.restore();
}

// ---------------------------------------------------------------- 言葉の層（2026-10-01）
//
// 自分で入れる言葉（sharePhrase.js）を、いちばん上に描く。形は 4 つ:
//   明朝の引用 … 明朝 400・「」で包む・最後の行の下に橙の手描きの傍線（メモの一文と同じ印）
//   太いゴシック … UI の書体 700（Strava の太い文字のように）
//   手書き風 … Klee One（Google Fonts・読み込めたときだけ選べる。読み込めなければこの形は出さない）
//   白抜きの帯 … 半透明の帯の上に文字（写真の上は明るい帯に墨の文字）
// 文字の色は自動（写真・夜・表紙の色・透明＝白・紙＝墨）で、白い文字には影、墨の文字を暗い地に置いたときは白い光。

export const HAND_FONT_FAMILY = '"Klee One"';
const HAND_FONT_CSS = 'https://fonts.googleapis.com/css2?family=Klee+One:wght@600&display=swap';
let handSheetPromise = null;

// Google Fonts の CSS を 1 回だけ読み込む（読み込めたら true・失敗なら false。遅い通信では待ち続ける）。
function loadHandSheet() {
  if (!handSheetPromise) {
    handSheetPromise = new Promise((resolve) => {
      try {
        const found = document.querySelector('link[data-share-hand-font]');
        if (found) { resolve(!!found.sheet); return; }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = HAND_FONT_CSS;
        link.setAttribute('data-share-hand-font', '');
        link.onload = () => resolve(true);
        link.onerror = () => { handSheetPromise = null; resolve(false); }; // 次に開いたときにもう一度
        document.head.appendChild(link);
      } catch {
        resolve(false);
      }
    });
  }
  return handSheetPromise;
}

// 手書き風の書体が、その言葉の字の分まで使えるようになるまで待つ（待つ時間の上限なし）。
export function whenHandFontReady(sample = '') {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve(false);
  return loadHandSheet().then(async (ok) => {
    if (!ok) return false;
    try {
      const text = `${sample}「」あいうえお読書`.slice(0, 200);
      const faces = await document.fonts.load(`600 64px ${HAND_FONT_FAMILY}`, text);
      return Array.isArray(faces) && faces.length > 0 && document.fonts.check(`600 64px ${HAND_FONT_FAMILY}`, text);
    } catch {
      return false;
    }
  });
}

// 手書き風の書体を読み込む（timeoutMs で諦める＝そのときは手書き風を出さない。読み込めたらあとから出せる）。
// 戻り値: true（使える）/ false（使えない）。
export function prepareHandFont(sample = '', { timeoutMs = 8000 } = {}) {
  return Promise.race([whenHandFontReady(sample), new Promise((r) => setTimeout(() => r(false), timeoutMs))]);
}

function phraseFont(style, fonts, size) {
  if (style === 'bold') return `700 ${size}px ${fonts.ui}`;
  if (style === 'hand') return `600 ${size}px ${HAND_FONT_FAMILY}, ${fonts.read}`;
  if (style === 'band') return `600 ${size}px ${fonts.ui}`;
  return `400 ${size}px ${fonts.read}`;
}

// 画像（W×H）の上の言葉の組み（描く前に位置と大きさを知りたいとき＝編集画面の指で動かす箱にも使う）。
export function layoutPhraseOn(ctx, o, W, H) {
  if (!o?.phrase || !ctx) return null;
  const style = o.phrase.style || 'mincho';
  const fonts = o.fonts || fontStacks();
  const { spacing } = phraseMetrics(style);
  return phraseLayout(o.phrase, {
    W,
    H,
    format: o.format,
    sticker: o.style === 'sticker',
    measureAt: (size) => {
      const m = measurer(ctx, phraseFont(style, fonts, size), spacing);
      const trail = Math.round(spacing * size * 10) / 10;
      const memo = new Map(); // 行の組み方をいくつも比べるので、同じ文字列の幅は覚えておく
      return (s) => {
        if (!s) return 0;
        if (!memo.has(s)) memo.set(s, Math.max(0, m(s) - trail));
        return memo.get(s);
      };
    },
  });
}

function drawPhrase(ctx, o, W, H) {
  const lay = layoutPhraseOn(ctx, o, W, H);
  if (!lay) return null;
  const fonts = o.fonts || fontStacks();
  const { spacing } = phraseMetrics(lay.style);
  const colors = phraseColors({ ground: o.style, style: lay.style, invert: !!o.phrase.invert });
  const light = cssVar('--share-photo-ink') || '#ffffff';
  const dark = cssVar('--share-paper-ink') || '#2b2825';
  const ink = colors.ink === 'light' ? light : dark;
  const sb = o.shadowScale || 1;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (colors.band) {
    ctx.fillStyle = colors.band === 'light' ? (cssVar('--share-band-light') || 'rgba(244,239,230,0.92)') : (cssVar('--share-band-dark') || 'rgba(43,40,37,0.86)');
    roundRectPath(ctx, lay.x0, lay.y0, lay.w, lay.h, Math.max(4, Math.round(lay.size * 0.16)));
    ctx.fill();
  }
  if (!colors.band && colors.ink === 'light' && o.style === 'photo' && o.photo) {
    // 写真の上の白い文字: 言葉の高さの帯に、画面の幅いっぱいの上下になだらかな幕を敷く
    // （楕円だと明るい空の上で黒いしみに見えた・2026-10-01 ui-critic）。濃さは写真の明るさから・最大 0.55。
    const place = photoPlacement({ pw: o.photo.width, ph: o.photo.height, W, H, ...(o.view || {}) });
    const a = Math.min(0.55, scrimAlpha(bandLuminance(o.photo, place, W, H, lay.y0, lay.y0 + lay.h)) * 0.8);
    const scrim = o.theme?.scrim || cssVar('--share-photo-scrim') || '14, 12, 10';
    const fade = lay.size * 1.5;
    drawScrim(ctx, W, H, scrim, [[lay.y0 - fade, 0], [lay.y0, a], [lay.y0 + lay.h, a], [lay.y0 + lay.h + fade, 0]]);
  }
  const font = phraseFont(lay.style, fonts, lay.size);
  ctx.font = font;
  setSpacing(ctx, spacing, lay.size);
  const trail = Math.round(spacing * lay.size * 10) / 10;
  const lineW = (l) => Math.max(0, ctx.measureText(l).width - trail);
  const baselineOf = (i) => lay.y0 + lay.padY + i * lay.lineHeight + (lay.lineHeight - lay.size) / 2 + lay.size * 0.88;
  if (lay.style === 'mincho' && lay.lines.length && !o.quoteShown) {
    // 最後の行の下に橙の手描きの傍線（文字の後ろ・影なし）。メモの一文も出ているときは付けない
    // （傍線は「メモの一文」の印・1 枚に 2 本の傍線を並べない・2026-10-01）。
    const last = lay.lines[lay.lines.length - 1];
    const w = lineW(last);
    const x0 = lay.cx - w / 2;
    drawUnderline(ctx, { x0, x1: x0 + w, y: baselineOf(lay.lines.length - 1) + lay.size * 0.24, weight: Math.max(6, lay.size * 0.18), seed: seedFrom(`phrase|${lay.text}`), color: o.theme?.accent || cssVar('--share-accent') || '#df8e17' });
    ctx.font = font;
    setSpacing(ctx, spacing, lay.size);
  }
  if (!colors.band) {
    if (colors.ink === 'light') {
      ctx.shadowColor = o.theme?.shadow || cssVar('--share-photo-shadow') || 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 18 * sb;
      ctx.shadowOffsetY = 2 * sb;
    } else if (o.style !== 'paper') {
      ctx.shadowColor = cssVar('--share-phrase-glow') || 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 16 * sb;
    }
  }
  ctx.fillStyle = ink;
  lay.lines.forEach((l, i) => {
    ctx.fillText(l, lay.cx - lineW(l) / 2, baselineOf(i));
  });
  ctx.restore();
  return lay;
}

// ---------------------------------------------------------------- 本体

// 表示する項目（隠した項目）を描く材料に当てる。記録は applyShareItems で見出し・書名・著者・数字を外し、
// 一文・今日の日付・ロゴはフラグで。一文の見せ方は書名・著者・ロゴだけ。
function visibleOpts(opts, layout, text) {
  const vis = shareVisibility(opts.hidden);
  const isRecord = layout === 'record';
  const stamp = isRecord && vis.stamp ? (opts.stamp || '') : '';
  return {
    ...opts,
    record: isRecord ? applyShareItems(opts.record, opts.hidden) : opts.record,
    text: isRecord && !vis.quote ? '' : text,
    stamp,
    showLogo: vis.logo,
    showTitle: vis.title,
    showAuthor: vis.author,
    hasFooter: vis.logo || !!stamp,
  };
}

// canvas に描く（同期）。canvas の大きさもここで決める。
// opts: { line, page, title, author, cover, style, format, photo, view, textPos, fonts, logo,
//         seedKey（傍線の種＝メモの id）, totalPages / knownMaxPage（付箋の高さ）,
//         layout（'quote'＝一文が主役 / 'record'＝記録が主役）, record（shareOverlay の bookRecord / monthRecord）,
//         stamp（右下の日付）, covers（今月の表紙の並び [{ cover, title }]）,
//         hidden（表示する項目で隠した項目の名前の配列・shareOverlay の SHARE_ITEM_KEYS）,
//         phrase（自由に入れる言葉の層 { text, style, x, y, scale, invert }・sharePhrase.js） }
// 戻り値: { line, width, height }（line は実際に画像に入れた文＝共有の文にも同じものを使う）
export function drawShareCard(canvas, opts = {}) {
  const layout = opts.layout === 'record' ? 'record' : 'quote';
  const { text } = clampLine(opts.line, layout === 'record' ? RECORD_QUOTE_MAX : undefined);
  if (!text && layout !== 'record') throw new Error('画像にする一文がありません。');
  const fonts = opts.fonts || fontStacks();
  let style = opts.style || 'paper';
  if (style === 'photo' && !opts.photo) style = 'night';
  const theme = readShareTheme(style, { tone: opts.cover?.tone, title: opts.title });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('紙・夜など、ほかの色を選ぶか、もう一度お試しください。');
  const base = {
    ...visibleOpts(opts, layout, text), fonts, theme, style,
    seed: seedFrom(`${opts.seedKey || ''}|${text}`),
    frac: tabPosition(opts.page, opts.totalPages, opts.knownMaxPage),
  };

  if (layout === 'record') {
    if (style === 'sticker') {
      const size = recordStickerSize(ctx, base);
      if (canvas.width !== size.w || canvas.height !== size.h) { canvas.width = size.w; canvas.height = size.h; }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      drawRecordSticker(ctx, base, size);
      drawPhrase(ctx, { ...base, quoteShown: !!size.lay.fit }, size.w, size.h);
      return { line: size.lay.fit ? base.text : '', width: size.w, height: size.h };
    }
    const F = recordFrame(opts.format);
    if (canvas.width !== F.W || canvas.height !== F.H) { canvas.width = F.W; canvas.height = F.H; }
    ctx.clearRect(0, 0, F.W, F.H);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const o = { ...base, W: F.W, H: F.H, format: F.format };
    if (style === 'photo') drawRecordPhoto(ctx, o);
    else drawRecordPoster(ctx, o);
    // 実際に一文を入れたか（入らなければ外している）を返す＝共有の文も画像と同じにする。
    const { lay } = fitRecord(ctx, o, F);
    drawPhrase(ctx, { ...o, quoteShown: !!lay.fit }, F.W, F.H);
    return { line: lay.fit ? o.text : '', width: F.W, height: F.H };
  }

  if (style === 'sticker') {
    // 大きさを決めるために一度測る（canvas の大きさを変えると中身が消えるので、測ってから決める）
    const size = stickerSize(ctx, base);
    if (canvas.width !== size.w || canvas.height !== size.h) { canvas.width = size.w; canvas.height = size.h; }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    drawSticker(ctx, base, size);
    drawPhrase(ctx, { ...base, quoteShown: true }, size.w, size.h);
    return { line: text, width: size.w, height: size.h };
  }

  const { w: W, h: H } = FORMATS[opts.format] || FORMATS.story;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const o = { ...base, W, H, format: FORMATS[opts.format] ? opts.format : 'story' };
  if (style === 'photo') drawPhoto(ctx, o);
  else drawPoster(ctx, o);
  drawPhrase(ctx, { ...o, quoteShown: true }, W, H);
  return { line: text, width: W, height: H };
}

// 🖐 写真を指で動かしている間の 1 コマ（2026-09-29・F8）。毎コマ全部を 1080 幅で描き直すと、
// 幕の明るさの測り直し・影つきの文字で 1 コマ 30〜100ms かかり、指に遅れていた。動かしている間は:
//   ① 画面に見える大きさ（幅 約 570）で描く（canvas の中身の大きさだけ変え、見た目の大きさは CSS のまま）
//   ② 幕・一文・書名・ロゴは、動かし始めに 1 回だけ別の canvas に描いておき、写真の上に重ねるだけ
//   ③ 写真も、動かし始めに必要な大きさへ縮めたものを使う
// 幕の濃さは動かし始めの置き方で決めたまま（指を離したら drawShareCard で正しく描き直す）。
// 書き出す画像は必ず drawShareCard（全部を 1080 幅で）から作る。
// cache: 呼び出し側が持つ入れ物（{}）。同じ一文・形・地の間は中身を使い回す。
// 戻り値: 描けたら true（写真でないとき・準備できないときは false＝呼び出し側で drawShareCard）。
export function drawPhotoDragFrame(canvas, opts = {}, cache = {}, { targetWidth = 570 } = {}) {
  if (!canvas || !opts.photo || (opts.style && opts.style !== 'photo')) return false;
  const isRecord = opts.layout === 'record';
  const { text } = clampLine(opts.line, isRecord ? RECORD_QUOTE_MAX : undefined);
  if (!text && !isRecord) return false;
  const fmt = FORMATS[opts.format] ? opts.format : 'story';
  const { w: W, h: H } = FORMATS[fmt];
  const k = Math.min(1, Math.max(0.2, targetWidth / W));
  const cw = Math.round(W * k);
  const ch = Math.round(H * k);
  const fonts = opts.fonts || fontStacks();
  const key = JSON.stringify([text, fmt, opts.textPos, opts.title, opts.author, opts.page, opts.totalPages, opts.knownMaxPage, opts.seedKey, opts.photo.width, opts.photo.height, fonts.read, k, opts.layout, opts.record, opts.stamp, opts.hidden, opts.phrase]);
  if (cache.key !== key || !cache.layer || cache.photoRef !== opts.photo) {
    const theme = readShareTheme('photo', { tone: opts.cover?.tone, title: opts.title });
    const o = {
      ...visibleOpts(opts, isRecord ? 'record' : 'quote', text), fonts, theme, style: 'photo', W, H, format: fmt,
      seed: seedFrom(`${opts.seedKey || ''}|${text}`),
      frac: tabPosition(opts.page, opts.totalPages, opts.knownMaxPage),
      shadowScale: k,
    };
    const layer = makeCanvas(cw, ch);
    const lctx = layer.getContext('2d');
    if (!lctx) return false;
    lctx.setTransform(k, 0, 0, k, 0, 0);
    lctx.textAlign = 'left';
    lctx.textBaseline = 'alphabetic';
    const place0 = photoPlacement({ pw: opts.photo.width, ph: opts.photo.height, W, H, ...(opts.view || {}) });
    if (isRecord) drawRecordOverlay(lctx, o, place0);
    else drawPhotoOverlay(lctx, o, place0);
    drawPhrase(lctx, { ...o, quoteShown: isRecord ? !!fitRecord(lctx, o, recordFrame(fmt)).lay.fit : true }, W, H);
    // 写真は、動かし始めの大きさの 1.5 倍まで縮めておく（拡大しても粗くなりすぎない・元より大きくはしない）。
    const want = Math.max(cw, Math.round(place0.w * k * 1.5));
    const sk = Math.min(1, want / opts.photo.width);
    let small = opts.photo.source;
    if (sk < 0.95) {
      small = makeCanvas(opts.photo.width * sk, opts.photo.height * sk);
      const sctx = small.getContext('2d');
      if (sctx) {
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(opts.photo.source, 0, 0, small.width, small.height);
      } else {
        small = opts.photo.source;
      }
    }
    Object.assign(cache, { key, layer, small, photoRef: opts.photo });
  }
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const place = photoPlacement({ pw: opts.photo.width, ph: opts.photo.height, W, H, ...(opts.view || {}) });
  ctx.imageSmoothingQuality = 'low'; // 動いている間は速さを優先（離したら 'high' で描き直す）
  ctx.drawImage(cache.small, place.x * k, place.y * k, place.w * k, place.h * k);
  ctx.drawImage(cache.layer, 0, 0);
  return true;
}

// ✍️ 言葉を指で動かしている・大きさを変えている間の 1 コマ（2026-10-01）。
// 言葉の下の 1 枚（写真・記録・ロゴ）は動かし始めに 1 回だけ画面の大きさで描いておき、毎コマ言葉だけを重ねる。
// cache: 呼び出し側が動かし始めに新しく渡す入れ物（{}）。戻り値: 描けたら true。
export function drawPhraseDragFrame(canvas, opts = {}, cache = {}, { targetWidth = 570 } = {}) {
  if (!canvas || !opts.phrase) return false;
  if (!cache.base) {
    const full = makeCanvas(1, 1);
    const r = drawShareCard(full, { ...opts, phrase: null });
    const k = Math.min(1, Math.max(0.2, targetWidth / r.width));
    const base = makeCanvas(r.width * k, r.height * k);
    const bctx = base.getContext('2d');
    if (!bctx) return false;
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(full, 0, 0, base.width, base.height);
    let style = opts.style || 'paper';
    if (style === 'photo' && !opts.photo) style = 'night';
    const theme = readShareTheme(style, { tone: opts.cover?.tone, title: opts.title });
    Object.assign(cache, { base, k, W: r.width, H: r.height, style, theme, quoteShown: !!r.line });
  }
  const { base, k, W, H } = cache;
  if (canvas.width !== base.width || canvas.height !== base.height) { canvas.width = base.width; canvas.height = base.height; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawPhrase(ctx, { ...opts, quoteShown: cache.quoteShown, fonts: opts.fonts || fontStacks(), style: cache.style, theme: cache.theme, shadowScale: k, format: FORMATS[opts.format] ? opts.format : 'story' }, W, H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}

// 言葉の箱の位置（画像の座標）。編集画面が、指で掴める範囲を画像に重ねるのに使う。
export function measurePhraseBox(opts = {}, { W, H }) {
  if (!opts.phrase) return null;
  const c = makeCanvas(1, 1);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  let style = opts.style || 'paper';
  if (style === 'photo' && !opts.photo) style = 'night';
  return layoutPhraseOn(ctx, { ...opts, style, fonts: opts.fonts || fontStacks(), format: FORMATS[opts.format] ? opts.format : 'story' }, W, H);
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('紙・夜など、ほかの色を選ぶか、もう一度お試しください。'))), 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

// 1 枚を作って PNG にする（書体・ロゴの準備から）。戻り値: { blob, line }
export async function renderLineCard(opts = {}) {
  const fonts = await prepareFonts(`${opts.line || ''}${opts.title || ''}${opts.author || ''}`);
  const logo = opts.logo !== undefined ? opts.logo : await prepareLogo();
  const canvas = makeCanvas(1, 1);
  const { line } = drawShareCard(canvas, { ...opts, fonts, logo });
  const blob = await canvasToBlob(canvas);
  return { blob, line };
}
