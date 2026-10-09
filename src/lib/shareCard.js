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
// ロゴは必ず描く（2026-10-05 オーナー裁定「Orime のロゴはマストで入るように」・隠す項目に無い）。場所・大きさ・空きの
// 決まりは shareOverlay.js の LOGO_RULES / logoBox。写真の上はロゴの下の明るさから幕を決める（drawLogoScrim）。
// 重ね方は 4 つ: 記録（record）／数字（stats・大きな数字を真ん中に縦に積む）／一文（quote）／雑誌（magazine・2026-10-09・
// 大きな引用＋続きの文＋右の本のカード＋右上のロゴ＋下の小さな日付）。
// 2 つの印（Strava の橙のルートにあたる「読んだ跡」）:
//   傍線 … 一文の最後の行の下に、橙の手描きの線。メモごとに形が決まっている（メモの id と本文から種を作る）
//   付箋 … 表紙の右の小口から橙の付箋がはみ出す（紙・夜・表紙の色の一文だけ。写真・透明は表紙も本の印も描かない）。
//          その一文が本のどのあたりかを高さで示す（数字は出さない・ページの無いメモには付けない）
//
// 色は tokens.css の --share-* を getComputedStyle で読む（canvas は var() を解決できない）。
// 書体は --font-read / --font-ui の並びをそのまま使い、document.fonts.ready を待つ。
// 幅は 1080 固定（ストーリー 1080×1920 / 投稿 1080×1350 / 正方形 1080×1080）。
// 写真は端末の中だけで描く（どこにも送らない）。例外は throw（呼び出し側が toMessage で整える）。

import {
  FORMATS, clampLine, fitQuote, wrapBalanced, coverTone, rgbCss,
  photoPlacement, scrimAlpha, brightLuminance, coverProxyPath,
  seedFrom, tabPosition, coverWashAlpha, relativeLuminance, shareImageType,
  darkLuminance, filmTone, logoInkOnPhoto, blockScrimStops, photoInkForBand, blockVeilStops, PHOTO_INK_DARK_Q, bandTexture,
} from './shareCardLayout';
import {
  RECORD_QUOTE_MAX, recordFrame, placeRecordBlock, statColumns, splitStatValue, recordBlockPlan, recordTitleScale, recordTitleMaxLines,
  applyShareItems, shareVisibility, recordCoverPlacement, logoBox, LOGO_RULES, statsStackPlan, placeStatsStack, statColumnsScale, mainTitle, pickSubVariant, formatAuthors,
  magazineRecord, magazineLogoBox, magazineFooterItems, MAGAZINE_TAGLINE_TOP,
} from './shareOverlay';
import { phraseLayout, phraseMetrics, phraseColors, phraseDisplayText, stickerPhraseReserve } from './sharePhrase';
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

// 「フィルム」の地の写真（filmTone で色を整えた写真）。写真ごとに 1 回だけ作って覚える（指で動かしても作り直さない）。
const filmCache = new WeakMap();
export function filmPhoto(photo) {
  if (!photo?.source) return photo;
  const hit = filmCache.get(photo.source);
  if (hit) return hit;
  try {
    const c = makeCanvas(photo.width, photo.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(photo.source, 0, 0, photo.width, photo.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    filmTone(img.data, c.width, c.height);
    ctx.putImageData(img, 0, 0);
    const out = { ...photo, source: c, film: true };
    filmCache.set(photo.source, out);
    return out;
  } catch {
    return photo; // 作れなければ元の写真（共有はできる）
  }
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
// 決まり（LOGO_RULES）より小さく・端に寄せては描かない（どこから呼んでも最小の大きさと余白を守る）。
function drawLogo(ctx, logo, variant, { x: x0, baseline, wordH: h0, fonts, ink }) {
  const wordH = Math.max(LOGO_RULES.minWordH, Number(h0) || 0);
  const x = Math.max(LOGO_RULES.minMargin, Number(x0) || 0);
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

// ロゴの幅（drawLogo と同じ計算・描かない）。右にそろえて置くとき（雑誌の右上）に使う。
function logoWidth(ctx, logo, variant, { wordH: h0, fonts }) {
  const wordH = Math.max(LOGO_RULES.minWordH, Number(h0) || 0);
  const set = logo?.[variant === 'white' ? 'white' : 'color'];
  if (!set) {
    ctx.font = `700 ${Math.round(wordH * 1.25)}px ${fonts.ui}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return ctx.measureText('Orime').width;
  }
  const { mark, word } = set;
  return (mark.width / mark.height) * wordH * 1.28 + wordH * 0.32 + (word.width / word.height) * wordH;
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

// 文字の組み（2026-10-08 オーナー「おしゃれな意識高い人間が使いたくなるように」＝雑誌・装丁のような編集デザイン）。
// 字間を少し広げ、装飾（橙の傍線・付箋・点）をやめて、余白と明朝の組みで見せる。
const QUOTE_TRACK = 0.04; // 一文（明朝）
const TITLE_TRACK = 0.04; // 書名（明朝）
const KICKER_TRACK = 0.18; // 見出し（「読了」「2026」）
const LABEL_TRACK = 0.1; // 数字の名前（「メモ」「実行した行動」）

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
      const m = measurer(ctx, `400 ${size}px ${fonts.read}`, QUOTE_TRACK);
      const trail = Math.round(QUOTE_TRACK * size * 10) / 10; // 行末の字間は墨にならないので数えない
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

// 一文の行（明朝 400・字間 QUOTE_TRACK）。橙の手描きの傍線は 2026-10-08 にやめた（オーナー「オレンジ色の下線がダサい」）。
function drawQuoteLines(ctx, fonts, fit, left, top, color) {
  ctx.font = `400 ${fit.size}px ${fonts.read}`;
  setSpacing(ctx, QUOTE_TRACK, fit.size);
  const ascent = fit.size * 0.88; // 行の箱の上から字の基線まで（明朝のおおよそ）
  const half = (fit.lineHeight - fit.size) / 2;
  ctx.fillStyle = color;
  fit.lines.forEach((ln, i) => {
    // 行頭の開き括弧（「『（）は、字の墨の左端を本文の左端にそろえる（括弧の前の空きを詰める）。
    ctx.fillText(ln, left - inkLeftOffset(ctx, ln), top + i * fit.lineHeight + half + ascent);
  });
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

// 書名を maxLines 行に組む。入らなければ副題の前で切った書名（mainTitle）で組み直し、それでも入らなければ
// 最後の行を … で切る。本の書名は最後まで『』で閉じる（「…『イシューからはじめよ 知的生産の…」で終わらせない・第 3 回）。
function fitTitleLines(ctx, title, { isBook, width, font, em, maxLines }) {
  const m = measurer(ctx, font, em);
  const wrap = (t) => wrapBalanced(isBook ? `『${t}』` : String(t), width, m);
  const lines = wrap(title);
  if (lines.length <= maxLines) return lines;
  if (isBook) {
    const main = mainTitle(title);
    if (main && main !== title) {
      const short = wrap(main);
      if (short.length <= maxLines) return short;
    }
    const close = m('』'); // 書体と字間をここで決める（ellipsize は今の書体で測る）
    const rest = lines.slice(maxLines - 1).join('').replace(/』$/, '');
    return [...lines.slice(0, maxLines - 1), `${ellipsize(ctx, rest, width - close)}』`];
  }
  m('');
  return [...lines.slice(0, maxLines - 1), ellipsize(ctx, lines.slice(maxLines - 1).join(''), width)];
}

// 『書名』（2 行まで）＋ 著者・p.N の組みと高さ。
function layoutBookLines(ctx, fonts, { title, author, page, width, titleFont, titleSize, metaSize }) {
  ctx.font = titleFont;
  setSpacing(ctx, 0.02, titleSize);
  // title が null のときは書名を隠す（表示する項目・2026-10-01）。
  const titleLines = title === null ? [] : fitTitleLines(ctx, title || '無題', { isBook: true, width, font: titleFont, em: TITLE_TRACK, maxLines: 2 });
  const titleLH = Math.round(titleSize * 1.4);
  // 著者は「最初の著者 ほか」・2 行まで折り返す（… で切らない・2026-10-08）。ページは最後の行の後ろに。
  const authorText = formatAuthors(author);
  const pageText = Number.isFinite(page) && page > 0 ? `p.${page}` : '';
  const metaLH = Math.round(metaSize * 1.5);
  const metaFont = `400 ${metaSize}px ${fonts.ui}`;
  let authorLines = [];
  if (authorText) {
    authorLines = wrapBalanced(authorText, width, measurer(ctx, metaFont, 0.04));
    if (authorLines.length > 2) {
      ctx.font = metaFont;
      setSpacing(ctx, 0.04, metaSize);
      authorLines = [authorLines[0], ellipsize(ctx, authorLines.slice(1).join(''), width)];
    }
  }
  // ページが最後の行に入らなければ、もう 1 行（ページだけの行）。
  let pageOwnLine = false;
  if (pageText && authorLines.length) {
    const m = measurer(ctx, metaFont, 0.04);
    pageOwnLine = m(`${authorLines[authorLines.length - 1]}　${pageText}`) > width;
  }
  const metaLines = (authorLines.length || (pageText ? 1 : 0)) + (pageOwnLine ? 1 : 0);
  const hasMeta = metaLines > 0;
  const gap = titleLines.length && hasMeta ? 12 : 0;
  return { titleLines, titleLH, authorText, authorLines, pageText, pageOwnLine, metaLH, height: titleLines.length * titleLH + (hasMeta ? gap + metaLH * metaLines : 0) };
}

function drawBookLines(ctx, fonts, bl, { x, top, width, titleFont, titleSize, metaSize, ink, ink2, ink3 }) {
  let cy = top;
  ctx.fillStyle = ink;
  bl.titleLines.forEach((tl) => {
    ctx.font = titleFont;
    setSpacing(ctx, TITLE_TRACK, titleSize);
    ctx.fillText(tl, x - inkLeftOffset(ctx, tl), cy + bl.titleLH * 0.78);
    cy += bl.titleLH;
  });
  if (bl.authorLines.length || bl.pageText) {
    if (bl.titleLines.length) cy += 12;
    ctx.font = `400 ${metaSize}px ${fonts.ui}`;
    setSpacing(ctx, 0.04, metaSize);
    let mx = x;
    ctx.fillStyle = ink2;
    bl.authorLines.forEach((a, i) => {
      ctx.fillText(a, x, cy + bl.metaLH * 0.72);
      if (i === bl.authorLines.length - 1) mx = x + ctx.measureText(a).width + metaSize;
      else cy += bl.metaLH;
    });
    if (bl.pageText) {
      if (bl.pageOwnLine) { cy += bl.metaLH; mx = x; }
      ctx.fillStyle = ink3;
      ctx.fillText(bl.pageText, mx, cy + bl.metaLH * 0.72);
    }
  }
}

// ロゴだけ（URL は入れない・2026-10-01）。場所と大きさは形ごとに決まった logoBox（重ね方・地で変えない）。
// 左端だけ、その重ね方の文字の左端（margin）にそろえる。
function drawFooter(ctx, { format, margin, logo, theme, fonts }) {
  const b = logoBox(format, { margin });
  drawLogo(ctx, logo, theme.logo, { x: b.x, baseline: b.baseline, wordH: b.wordH, fonts, ink: theme.ink });
}

// 写真の上にロゴ（と日付）しか重ねないとき（記録の項目を全部隠した）のロゴの下地と色（logoInkOnPhoto）:
// ロゴの下（ロゴの上の空きから下端・左右いっぱい）が明るい写真なら、幕を掛けずに元の色（焦げ茶）のロゴと墨の日付。
// そうでなければ白いロゴ＋白と 4.5:1 以上になる黒の幕を下から。戻り値は下の行に使う色の組（theme）。
// fadeFrom: 黒い幕を暗くし始める位置の下限（墨の文字のまとまりの下端より下から・第 4 回。まとまりに黒い幕を重ねない）。
function logoPickOnPhoto(o, place) {
  const b = logoBox(o.format);
  const px = bandPixels(o.photo, place, o.W, o.H, b.clearTop, b.baseline + 8);
  return px && px.length ? logoInkOnPhoto({ bright: brightLuminance(px), dark: darkLuminance(px) }) : { logo: 'white', scrim: 0.6 };
}

function logoFooterOnPhoto(ctx, o, place, { fadeFrom = -Infinity, pick: pick0 = null } = {}) {
  const { W, H } = o;
  const b = logoBox(o.format);
  const pick = pick0 || logoPickOnPhoto(o, place);
  if (pick.logo === 'color') {
    return {
      ...o.theme,
      logo: 'color',
      ink: cssVar('--share-paper-ink') || '#2b2825',
      ink2: cssVar('--share-paper-ink-2') || '#5f5a53',
      shadow: cssVar('--share-phrase-glow') || 'rgba(255,255,255,0.6)',
    };
  }
  const fade = H * 0.12;
  const from = Math.min(b.clearTop - 1, Math.max(fadeFrom, b.clearTop - fade));
  drawScrim(ctx, W, H, o.theme.scrim, [[from, 0], [b.clearTop, pick.scrim * 0.85], [H, pick.scrim]]);
  return o.theme;
}

// 墨の文字のまとまりの下端と、ロゴの黒い幕を立ち上げる場所の間に要る長さ（これより短ければ白い文字＋黒い幕に戻す）。
export const LOGO_SCRIM_MIN_RISE = 48;

// ---------------------------------------------------------------- 紙・夜・表紙の色

// 写真でない地を塗る。表紙の色は、表紙を大きくぼかして敷き（写真が無いときの見栄えのよい代わり・2026-10-05）、
// その上に表紙から作った色（白い文字と 7:1）を、白い文字と 4.5:1 以上になる濃さで重ねる（coverWashAlpha）。
// ぼかしは「ごく小さく縮めてから引き伸ばす」で作る（ctx.filter の無い端末でも同じに見える）。
function drawGround(ctx, W, H, theme, cover) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  if (theme.key !== 'cover') return;
  const img = cover?.image;
  if (img) {
    try {
      // 8 幅まで縮めて色の面だけにし（書名の文字の形を残さない）、32 幅で一度なめらかにしてから引き伸ばす。
      const small = makeCanvas(8, Math.max(8, Math.round(8 * (H / W))));
      const sctx = small.getContext('2d', { willReadFrequently: true });
      if (sctx) {
        // 表紙の真ん中あたりを、画像の比で切り出して縮める。
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const s = Math.max(small.width / iw, small.height / ih);
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(img, (small.width - iw * s) / 2, (small.height - ih * s) / 2, iw * s, ih * s);
        let lum = 0.5;
        try {
          const { data } = sctx.getImageData(0, 0, small.width, small.height);
          const px = [];
          for (let i = 0; i < data.length; i += 4) px.push([data[i], data[i + 1], data[i + 2]]);
          lum = brightLuminance(px);
        } catch { /* 読めなければ明るい表紙とみなす（濃いめに重ねる） */ }
        const mid = makeCanvas(32, Math.max(32, Math.round(32 * (H / W))));
        const mctx = mid.getContext('2d');
        let src = small;
        if (mctx) {
          mctx.imageSmoothingEnabled = true;
          mctx.imageSmoothingQuality = 'high';
          mctx.drawImage(small, 0, 0, mid.width, mid.height);
          src = mid;
        }
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // 端がぼけて薄くならないよう、少し大きく敷く。
        const bleed = W * 0.08;
        ctx.drawImage(src, -bleed, -bleed, W + bleed * 2, H + bleed * 2);
        ctx.restore();
        const bgRgb = parseRgb(theme.bg);
        ctx.save();
        ctx.globalAlpha = coverWashAlpha(lum, bgRgb ? relativeLuminance(bgRgb) : 0.1);
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    } catch { /* ぼかしが作れなければ色だけ */ }
  }
  // 表紙の色の地は、下に向かってわずかに沈める（平板にしない）。
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// 'rgb(1, 2, 3)' / '#aabbcc' → [r, g, b]（読めなければ null）。
function parseRgb(css) {
  const s = String(css || '').trim();
  let m = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return null;
}

// 形ごとの寸法。ストーリーは Instagram などの上下の帯（約 250px）に文字をかけない
// （下の帯は 1920 − 250 ＝ 1670 から。ロゴの基線は 1630＝どの重ね方も shareOverlay.js の logoBox）。
// 著者・ページは、スマホで縮めて見ても読める大きさ（ストーリー 36 以上）。書名はそれより大きく。
// 2026-10-08: 一文を少し小さく・余白を大きく・引用符を小さく（雑誌の引用ページの組み）。
const POSTER = {
  story: { margin: 120, top: 300, bottom: 1460, markInk: 56, sizes: [80, 74, 68, 64, 60, 56, 52, 48, 44, 40], coverW: 132, titleSize: 42, metaSize: 32 },
  post: { margin: 112, top: 136, bottom: 1110, markInk: 46, sizes: [66, 62, 58, 54, 50, 46, 42, 40, 38, 36], coverW: 116, titleSize: 38, metaSize: 31 },
  square: { margin: 104, top: 112, bottom: 870, markInk: 40, sizes: [58, 54, 50, 46, 42, 40, 38, 36, 34, 32], coverW: 104, titleSize: 36, metaSize: 30 },
};

function drawPoster(ctx, o) {
  const { W, H, format, theme, fonts, text } = o;
  const L = POSTER[format] || POSTER.story;
  drawGround(ctx, W, H, theme, o.cover);
  const left = L.margin;
  const contentW = W - L.margin * 2;
  const mark = quoteMark(ctx, fonts, L.markInk);
  const markGap = Math.round(L.sizes[0] * 0.55);
  const coverH = Math.round(L.coverW * 1.45);
  // 書名も著者も隠したときは、本の行（表紙＋書名）ごと出さない。
  const showBook = o.showTitle !== false || o.showAuthor !== false;
  const bookGap = showBook ? Math.round(L.sizes[0] * 1.15) : 0; // 傍線の下から本の行まで
  // 見出し（今年の一文は「2026」・2026-10-08）。引用符の上に。
  const kSize = recordFrame(format).kickerSize;
  const kickerH = o.kicker ? Math.round(kSize * 1.35) + Math.round(L.sizes[0] * 0.5) : 0;
  const fixedH = kickerH + L.markInk + markGap + bookGap + (showBook ? coverH : 0);
  const fit = layoutQuote(ctx, fonts, text, { maxWidth: contentW, maxHeight: (L.bottom - L.top) - fixedH, sizes: L.sizes, lineHeight: 1.75 });
  const quoteH = fit.lines.length * fit.lineHeight;
  // 目で見た中心（数学の中心より少し上）に置く。
  let y = L.top + Math.max(0, (L.bottom - L.top - fixedH - quoteH) * 0.44);

  if (o.kicker) {
    drawKicker(ctx, fonts, { x: left, y, h: Math.round(kSize * 1.35), size: kSize, text: o.kicker, theme });
    y += kickerH;
  }
  drawQuoteMark(ctx, mark, left, y, theme.ink3);
  y += L.markInk + markGap;
  drawQuoteLines(ctx, fonts, fit, left, y, theme.ink);
  y += quoteH + bookGap;

  if (showBook) drawPosterBook(ctx, o, L, { left, y, coverH, theme, fonts });
  drawFooter(ctx, { format, margin: L.margin, logo: o.logo, theme, fonts });
}

function drawPosterBook(ctx, o, L, { left, y, coverH, theme, fonts }) {
  const { W } = o;
  // 付箋（橙）は 2026-10-08 にやめた（装飾を減らす）。
  const tabOut = 0;
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

// 余白は記録の枠（recordFrame）とそろえる・一文と引用符は少し小さく（2026-10-08）。
const PHOTO = {
  story: { margin: 96, safeTop: 270, markInk: 40, sizes: [74, 68, 64, 60, 56, 52, 48, 44, 40], maxBlock: 0.5, titleSize: 40, metaSize: 32 },
  post: { margin: 88, safeTop: 104, markInk: 36, sizes: [64, 60, 56, 52, 48, 44, 40, 36], maxBlock: 0.52, titleSize: 38, metaSize: 31 },
  square: { margin: 80, safeTop: 88, markInk: 32, sizes: [58, 54, 50, 46, 42, 38, 34, 32], maxBlock: 0.56, titleSize: 36, metaSize: 30 },
};

// 文字の塊（引用符・一文・書名・著者）の組み。
function layoutOverlay(ctx, fonts, o, L, maxBlockH) {
  const contentW = o.W - L.margin * 2;
  const mark = quoteMark(ctx, fonts, L.markInk);
  const markGap = Math.round(L.sizes[0] * 0.42);
  const bookGap = Math.round(L.sizes[0] * 0.95); // 傍線の下から書名まで
  const titleFont = `600 ${L.titleSize}px ${fonts.ui}`;
  // 写真・透明では、書名の左に本の印を描かない（下のロゴの本の印と 2 つ並ぶため・2026-10-05 第 2 回 ui-critic）。
  // 書名・著者は一文と同じ左端から。付箋（本のどのあたりか）は紙・夜・表紙の色の表紙にだけ付ける。
  const iconH = 0;
  const iconW = 0;
  const textX = 0;
  const showBook = o.showTitle !== false || o.showAuthor !== false;
  const bl = layoutBookLines(ctx, fonts, bookLineOpts(o, { width: contentW - textX, titleFont, titleSize: L.titleSize, metaSize: L.metaSize }));
  const gapBook = showBook ? bookGap : 0;
  const bookH = showBook ? Math.max(iconH, bl.height) : 0;
  const kSize = recordFrame(o.format || 'story').kickerSize;
  const kLine = Math.round(kSize * 1.35);
  const kickerH = o.kicker ? kLine + Math.round(L.sizes[0] * 0.42) : 0;
  const fixedH = kickerH + L.markInk + markGap + gapBook + bookH;
  const fit = layoutQuote(ctx, fonts, o.text, { maxWidth: contentW, maxHeight: maxBlockH - fixedH, sizes: L.sizes, lineHeight: 1.7 });
  const quoteH = fit.lines.length * fit.lineHeight;
  return { mark, markGap, bookGap: gapBook, showBook, titleFont, bl, fit, quoteH, height: fixedH + quoteH, contentW, iconH, iconW, textX, kickerH, kSize, kLine };
}

function drawOverlay(ctx, fonts, o, L, lay, top, theme) {
  const left = L.margin;
  let y = top;
  if (o.kicker && lay.kickerH) {
    drawKicker(ctx, fonts, { x: left, y, h: lay.kLine, size: lay.kSize, text: o.kicker, theme });
    y += lay.kickerH;
  }
  drawQuoteMark(ctx, lay.mark, left, y, theme.ink3);
  y += L.markInk + lay.markGap;
  drawQuoteLines(ctx, fonts, lay.fit, left, y, theme.ink);
  y += lay.quoteH + lay.bookGap;
  if (!lay.showBook) return;
  const rowH = lay.bl.height;
  drawBookLines(ctx, fonts, lay.bl, { x: left + lay.textX, top: y + (rowH - lay.bl.height) / 2, width: lay.contentW - lay.textX, titleFont: lay.titleFont, titleSize: L.titleSize, metaSize: L.metaSize, ink: theme.ink, ink2: theme.ink2, ink3: theme.ink2 });
}

// 写真の、ある帯（y0〜y1・左右は x0〜x1）の画素（縮めて読む）。読めなければ null。
function bandPixels(photo, place, W, H, y0, y1, x0 = 0, x1 = W, sw = 54) {
  try {
    const k = sw / W;
    const sh = Math.max(1, Math.round(H * k));
    const c = makeCanvas(sw, sh);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(photo.source, place.x * k, place.y * k, place.w * k, place.h * k);
    const r0 = Math.max(0, Math.floor(y0 * k));
    const r1 = Math.min(sh, Math.ceil(y1 * k));
    const c0 = Math.max(0, Math.floor(x0 * k));
    const c1 = Math.min(sw, Math.ceil(x1 * k));
    if (r1 <= r0 || c1 <= c0) return null;
    const { data } = ctx.getImageData(c0, r0, c1 - c0, r1 - r0);
    const px = [];
    for (let i = 0; i < data.length; i += 4) px.push([data[i], data[i + 1], data[i + 2]]);
    px.width = c1 - c0; // 模様の強さ（bandTexture）を測るための幅
    return px;
  } catch {
    return null;
  }
}

// 写真の、ある帯（y0〜y1）の明るい部分の輝度。
function bandLuminance(photo, place, W, H, y0, y1) {
  const px = bandPixels(photo, place, W, H, y0, y1);
  if (!px) return 0.6; // 読めないときは明るい写真とみなして濃いめの幕
  return px.length ? brightLuminance(px) : 0.5;
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
  const lb = logoBox(format);
  const footerTop = lb.baseline - lb.wordH * 1.5;
  const pos = o.textPos === 'top' || o.textPos === 'center' ? o.textPos : 'bottom';
  const maxBlockH = H * L.maxBlock;
  const lay = layoutOverlay(ctx, fonts, o, L, maxBlockH);
  let top;
  if (pos === 'top') top = L.safeTop;
  else if (pos === 'center') top = (H - lay.height) / 2 - H * 0.02;
  else top = footerTop - 56 - lay.height;
  const bottom = top + lay.height;

  // 幕: 記録・数字と同じ（まとまりの周りの帯＋ロゴの帯。明るい写真は白い幕＋墨の文字・第 3 回）。
  let ink = theme;
  let foot = theme;
  const fade = H * 0.2;
  if (pos === 'bottom') {
    ({ theme: ink, foot } = drawBlockScrim(ctx, o, place, recordFrame(format), top, bottom));
  } else {
    const a = scrimAlpha(bandLuminance(o.photo, place, W, H, top, bottom));
    const aFoot = scrimAlpha(bandLuminance(o.photo, place, W, H, lb.clearTop, lb.baseline + 8));
    const stops = pos === 'top'
      ? [[0, a], [bottom + fade * 0.2, a], [bottom + fade, 0]]
      : [[top - fade, 0], [top - fade * 0.2, a], [bottom + fade * 0.2, a], [bottom + fade, 0]];
    drawScrim(ctx, W, H, theme.scrim, stops);
    drawScrim(ctx, W, H, theme.scrim, [[footerTop - fade * 0.8, 0], [H, aFoot]]);
  }

  // 影のぼかしは canvas の拡大・縮小（transform）に追従しないので、縮めて描くとき（shadowScale）は掛けて合わせる。
  const sb = o.shadowScale || 1;
  ctx.save();
  ctx.shadowColor = ink.shadow;
  ctx.shadowBlur = 18 * sb;
  ctx.shadowOffsetY = 2 * sb;
  drawOverlay(ctx, fonts, o, L, lay, top, ink);
  ctx.restore();
  ctx.save();
  ctx.shadowColor = foot.shadow;
  ctx.shadowBlur = 14 * sb;
  drawFooter(ctx, { format, margin: L.margin, logo: o.logo, theme: foot, fonts });
  ctx.restore();
}

// ---------------------------------------------------------------- 透明（ステッカー）

// 透明の地に白い文字の塊＋ロゴ。大きさは中身に合わせる（幅 1080・高さは可変）。
function stickerSize(ctx, o) {
  const L = { ...PHOTO.story, margin: 72 };
  const lay = layoutOverlay(ctx, o.fonts, { ...o, W: 1080 }, L, 1500);
  const pad = 72;
  const logoGap = 56;
  const footH = logoGap + STICKER_WORD_H * 1.3;
  const top = stickerPhraseTop(ctx, o);
  return { L, lay, pad, logoGap, top, w: 1080, h: Math.round(top + pad + lay.height + footH + pad) };
}

// 透明（ステッカー）のロゴの文字の高さ（ストーリーと同じ）。
const STICKER_WORD_H = logoBox('story').wordH;

// 透明の言葉の場所: 言葉があれば、その高さ＋56 を記録・一文の上に足す（言葉は記録に重ねない）。
function stickerPhraseTop(ctx, o) {
  if (!o.phrase) return 0;
  const lay = layoutPhraseOn(ctx, { ...o, style: 'sticker' }, 1080, 1920);
  return stickerPhraseReserve(lay?.h || 0);
}

function drawSticker(ctx, o, size) {
  const { L, lay, logoGap } = size;
  const pad = size.pad + size.top;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.shadowColor = o.theme.shadow;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 3;
  drawOverlay(ctx, o.fonts, { ...o, W: 1080 }, L, lay, pad, o.theme);
  const baseline = pad + lay.height + logoGap + STICKER_WORD_H;
  // ロゴだけ（ほかの地と同じ・SPEC §2-1）。透明は下の写真が分からないので、白いロゴ＋濃い影（--share-sticker-shadow）。
  drawLogo(ctx, o.logo, 'white', { x: L.margin, baseline, wordH: STICKER_WORD_H, fonts: o.fonts, ink: o.theme.ink });
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

// 書名の下の行（著者・今月／今年は読み終えた本）。著者は文節の切れ目で 2 行まで折り返す（… で切らない・2026-10-08
// オーナー「著者の名前が長い、複数いるとキレてしまう」。複数の著者は bookRecord が「最初の著者 ほか」にしてある）。
// 今月・今年の「『A』『B』 ほか N 冊」は幅に入る書き方を選ぶ（pickSubVariant・冊数を切らない）。
// 2 行に入らない長さ（まれ）だけ、2 行目の終わりを … にする（最後の手段）。
function fitSubLines(ctx, rec, { width, font, size }) {
  if (!rec?.sub) return [];
  ctx.font = font;
  setSpacing(ctx, 0.04, size);
  if (rec.subVariants && rec.subVariants.length) {
    return [ellipsize(ctx, pickSubVariant(rec.subVariants, (t) => ctx.measureText(t).width, width), width)];
  }
  const lines = wrapBalanced(String(rec.sub), width, measurer(ctx, font, 0.04));
  if (lines.length <= 2) return lines;
  ctx.font = font;
  setSpacing(ctx, 0.04, size);
  return [lines[0], ellipsize(ctx, lines.slice(1).join(''), width)];
}

function layoutRecord(ctx, fonts, o, F) {
  const rec = o.record || { kicker: '', title: '', stats: [] };
  const contentW = F.W - F.margin * 2;
  const stats = (rec.stats || []).slice(0, 3);
  // 数字を全部隠したときは書名を主役に（大きく・3 行まで）。
  const titleScale = recordTitleScale({ statsCount: stats.length });
  const titleSize = Math.round(F.titleSize * titleScale);
  const titleFont = `600 ${titleSize}px ${fonts.read}`;
  ctx.font = titleFont;
  setSpacing(ctx, TITLE_TRACK, titleSize);
  const maxLines = recordTitleMaxLines({ statsCount: stats.length });
  const titleLines = rec.title ? fitTitleLines(ctx, rec.title, { isBook: !!rec.titleIsBook, width: contentW, font: titleFont, em: TITLE_TRACK, maxLines }) : [];
  const subFont = `400 ${F.subSize}px ${fonts.ui}`;
  const subLines = fitSubLines(ctx, rec, { width: contentW, font: subFont, size: F.subSize });
  const sub = subLines.join('');
  const subLH = Math.round(F.subSize * 1.45);
  const labelH = Math.round(F.statLabelSize * 1.3);
  const parts = { hasKicker: !!rec.kicker, titleLines: titleLines.length, hasSub: subLines.length > 0, subLines: subLines.length, statsCount: stats.length };
  const base = recordBlockPlan(F, parts);
  const bottom = placeRecordBlock(F, 0, { hasFooter: o.hasFooter !== false }).bottom;
  let fit = null;
  // 書名も数字も隠したときは、一文を主役に（大きく・4 行まで）。
  const heroQuote = titleLines.length === 0 && stats.length === 0;
  const sizes = heroQuote ? F.quoteSizes.map((n) => Math.round(n * 1.3)) : F.quoteSizes;
  const quoteGapBelow = base.height > 0 ? Math.round(F.quoteSizes[0] * 0.95) : 0;
  if (o.text) {
    const room = (bottom - F.safeTop) - base.height - quoteGapBelow;
    const cap = Math.min(room, sizes[0] * 1.7 * (heroQuote ? 4 : 3));
    if (cap > sizes[sizes.length - 1] * 1.7) {
      const f = layoutQuote(ctx, fonts, o.text, { maxWidth: contentW, maxHeight: cap, sizes, lineHeight: 1.7 });
      if (f && f.lines.length && f.lines.length * f.lineHeight <= cap + 0.5) fit = f;
    }
  }
  const plan = fit ? recordBlockPlan(F, { ...parts, quoteLines: fit.lines.length, quoteLineHeight: fit.lineHeight }) : base;
  return { rec, titleLines, titleLH: plan.titleLH, titleFont, titleSize, sub, subLines, subFont, subLH, stats, labelH, contentW, fit, plan, height: plan.height };
}

// 数字（大きく 700）と単位（小さく 600）を左から並べる。単位は数字の墨の右端（actualBoundingBoxRight）の 2 右から
// （数字の送り幅で置くと「1」の右に空きができて「1 件」に見えた・2026-10-05 第 2 回 ui-critic）。
// draw=false なら測るだけ。戻り値は全体の幅。
function layoutStatValue(ctx, fonts, value, { valueSize, unitSize }, k = 1, { x0 = 0, baseline = 0, draw = false } = {}) {
  let x = x0;
  let end = x0;
  splitStatValue(value).forEach((p) => {
    // 数字は 600（太すぎない・2026-10-08）、単位は 400 で小さく。
    ctx.font = p.big ? `600 ${Math.round(valueSize * k)}px ${fonts.ui}` : `400 ${Math.round(unitSize * k)}px ${fonts.ui}`;
    setSpacing(ctx, 0, valueSize);
    const m = ctx.measureText(p.text);
    if (p.big) {
      if (draw) ctx.fillText(p.text, x, baseline);
      const inkRight = Number.isFinite(m.actualBoundingBoxRight) && m.actualBoundingBoxRight > 0 ? m.actualBoundingBoxRight : m.width;
      end = x + inkRight;
      x = end;
    } else {
      if (draw) ctx.fillText(p.text, x + 2, baseline);
      end = x + 2 + m.width;
      x = end + 4;
    }
  });
  return end - x0;
}

function statValueWidth(ctx, fonts, value, sizes, k = 1) {
  return layoutStatValue(ctx, fonts, value, sizes, k);
}

// 数字を描く（左端 x・基線 baseline・倍率 k）。
function drawStatValue(ctx, fonts, value, sizes, k, x0, baseline, ink) {
  ctx.fillStyle = ink;
  layoutStatValue(ctx, fonts, value, sizes, k, { x0, baseline, draw: true });
}

// 数字の列: 名前（縮めない）と数字（倍率 1）の幅を測り、入る倍率 k と、中身の幅に合わせて間を等しくした列を決める。
// 3 つの数字は同じ倍率（数字の高さと基線をそろえる＝Strava の数字の行）。
function statsRow(ctx, fonts, F, stats) {
  const sizes = { valueSize: F.statValueSize, unitSize: F.statUnitSize };
  ctx.font = `400 ${F.statLabelSize}px ${fonts.ui}`;
  setSpacing(ctx, LABEL_TRACK, F.statLabelSize);
  const labelW = stats.map((st) => ctx.measureText(st.label).width);
  const valueW = stats.map((st) => statValueWidth(ctx, fonts, st.value, sizes, 1));
  const k = statColumnsScale(F, labelW, valueW);
  const widths = stats.map((st, i) => Math.max(labelW[i], statValueWidth(ctx, fonts, st.value, sizes, k)));
  return { k, cols: statColumns(F, stats.length, widths) };
}

function drawStat(ctx, fonts, F, stat, col, top, lay, theme, k = 1) {
  ctx.font = `400 ${F.statLabelSize}px ${fonts.ui}`;
  setSpacing(ctx, LABEL_TRACK, F.statLabelSize);
  ctx.fillStyle = theme.ink2;
  ctx.fillText(ellipsize(ctx, stat.label, Math.max(col.width, F.W - F.margin - col.x) + 1), col.x, top + lay.labelH * 0.78);
  // 数字は大きく（700）・単位は小さく（600）。基線は列どうしでそろえる。
  const baseline = top + lay.labelH + 10 + F.statValueSize * 0.86;
  drawStatValue(ctx, fonts, stat.value, { valueSize: F.statValueSize, unitSize: F.statUnitSize }, k, col.x, baseline, theme.ink);
}

// 見出し（「読了」「2026」など）。記録・一文で同じ部品（2026-10-08 第 2 回 ui-critic「今年の一文にも年を」）。
// h は見出しの行の高さ（大きさ × 1.35）。
// 2026-10-08: 前の橙の点をやめ、字間を広げた小さな文字だけに（雑誌の小見出しの組み）。align: 'center' は cx を中心に。
function drawKicker(ctx, fonts, { x, y, h, size, text, theme, align = 'left' }) {
  ctx.font = `600 ${size}px ${fonts.ui}`;
  setSpacing(ctx, KICKER_TRACK, size);
  ctx.fillStyle = theme.ink2;
  const trail = KICKER_TRACK * size; // 最後の字の後ろの字間（中央にそろえるときは数えない）
  const w = ctx.measureText(text).width - trail;
  ctx.fillText(text, align === 'center' ? x - w / 2 : x, y + h * 0.78);
}

// recordBlockPlan の組みのとおりに描く（隠した項目は組みに無い＝場所を取らない）。
function drawRecordBlock(ctx, fonts, o, F, lay, top, theme) {
  const left = F.margin;
  for (const el of lay.plan.elements) {
    const y = top + el.top;
    if (el.kind === 'quote') {
      drawQuoteLines(ctx, fonts, lay.fit, left, y, theme.ink);
    } else if (el.kind === 'kicker') {
      drawKicker(ctx, fonts, { x: left, y, h: el.height, size: F.kickerSize, text: lay.rec.kicker, theme });
    } else if (el.kind === 'title') {
      ctx.fillStyle = theme.ink;
      lay.titleLines.forEach((ln, i) => {
        ctx.font = lay.titleFont;
        setSpacing(ctx, TITLE_TRACK, lay.titleSize);
        ctx.fillText(ln, left - inkLeftOffset(ctx, ln), y + i * lay.titleLH + lay.titleLH * 0.8);
      });
    } else if (el.kind === 'sub') {
      ctx.font = lay.subFont;
      setSpacing(ctx, 0.04, F.subSize);
      ctx.fillStyle = theme.ink2;
      lay.subLines.forEach((ln, i) => ctx.fillText(ln, left, y + i * lay.subLH + lay.subLH * 0.76));
    } else if (el.kind === 'rule') {
      // 細い罫線 1 本だけ（2026-10-08）。
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = theme.ink;
      ctx.fillRect(left, y - 0.75, lay.contentW, 1.5);
      ctx.restore();
    } else if (el.kind === 'stats') {
      const { k, cols } = statsRow(ctx, fonts, F, lay.stats);
      lay.stats.forEach((st, i) => drawStat(ctx, fonts, F, st, cols[i], y, lay, theme, k));
    }
  }
}

// ロゴ（左・必ず描く）と、右に今日の日付（2026.10.1・「表示する項目」で隠せる）。URL は入れない
// （2026-10-01 オーナー裁定「ロゴのみでOK」）。どれも安全な枠（余白 F.margin・基線 F.footerBaseline）の中。
// 日付を隠してもロゴの場所は変わらない（ロゴは左の決まった場所・日付は右に足すだけ）。
function drawRecordFooter(ctx, { F, baseline, logo, theme, fonts, stamp }) {
  drawLogo(ctx, logo, theme.logo, { x: F.margin, baseline, wordH: F.wordH, fonts, ink: theme.ink });
  if (!stamp) return;
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.ink2;
  ctx.font = `400 ${F.metaSize}px ${fonts.ui}`;
  setSpacing(ctx, 0.08, F.metaSize);
  // 右にそろえるので、最後の字の後ろの字間ぶん右へ（墨の右端を余白にそろえる）。
  ctx.fillText(stamp, F.W - F.margin + 0.08 * F.metaSize, baseline);
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

// 写真の上の記録・数字の幕: まとまりの周りだけの帯＋ロゴの下（blockScrimStops）。濃さはまとまり・ロゴの帯
// それぞれの明るさから（白い文字と 4.5:1 以上・上限 0.82）。写真の上部と下端は見せる（灰色の板にしない）。
// 明るい写真（photoInkForBand が dark）では、黒い幕の代わりに白い幕＋墨の文字（第 3 回）。ロゴと日付は
// ロゴの帯の判定（logoFooterOnPhoto）のまま。戻り値: { theme（まとまりの色）, foot（ロゴと日付の色） }
function drawBlockScrim(ctx, o, place, F, top, bottom) {
  const lb = logoBox(F.format);
  const px = bandPixels(o.photo, place, F.W, F.H, top, bottom);
  const bright = px && px.length ? brightLuminance(px) : 0.6;
  const dark = px && px.length ? darkLuminance(px, PHOTO_INK_DARK_Q) : 0;
  // 縮めた画素ではこまかい縞が均されるので、帯だけをもう一度細かく読んで模様の強さを測る（第 4 回）。
  const fine = bandPixels(o.photo, place, F.W, F.H, top, bottom, 0, F.W, 216);
  const texture = fine && fine.length ? bandTexture(fine, fine.width) : 0;
  const pick = photoInkForBand({ bright, dark, texture }, photoInkLums());
  // photoInkForBand は幕を描く前の明るさで決めるので、ロゴの黒い幕がまとまりに掛からないことも確かめる（第 4 回）:
  // ロゴの黒い幕はまとまりの下端＋16 より下から暗くし、立ち上げる場所（48）が無ければ白い文字＋黒い幕に戻す。
  const oF = { ...o, W: F.W, H: F.H, format: F.format };
  const logoPick = pick.ink === 'dark' ? logoPickOnPhoto(oF, place) : null;
  const fadeFrom = bottom + 16;
  const roomForLogoScrim = logoPick && (logoPick.logo === 'color' || lb.clearTop - fadeFrom >= LOGO_SCRIM_MIN_RISE);
  if (pick.ink === 'dark' && roomForLogoScrim) {
    const veil = cssVar('--share-photo-veil') || '244, 239, 230';
    if (pick.veil > 0) drawScrim(ctx, F.W, F.H, veil, blockVeilStops({ top, bottom, H: F.H, veil: pick.veil, fade: F.H * 0.22 }));
    const foot = logoFooterOnPhoto(ctx, oF, place, { fadeFrom, pick: logoPick });
    return { theme: darkInkTheme(o.theme), foot };
  }
  const aFoot = scrimAlpha(bandLuminance(o.photo, place, F.W, F.H, lb.clearTop, lb.baseline + 8));
  drawScrim(ctx, F.W, F.H, o.theme.scrim, blockScrimStops({
    top, bottom, H: F.H, a: pick.ink === 'dark' ? scrimAlpha(bright) : pick.scrim, aFoot, logoTop: lb.clearTop, logoBottom: lb.baseline + Math.round(lb.wordH * 0.6), fade: F.H * 0.22, format: F.format,
  }));
  return { theme: o.theme, foot: o.theme };
}

// 明るい写真の上の墨の文字の色（紙の墨・白い光の影）。
function darkInkTheme(theme) {
  return {
    ...theme,
    ink: cssVar('--share-paper-ink') || '#2b2825',
    ink2: cssVar('--share-paper-ink-2') || '#5f5a53',
    ink3: cssVar('--share-paper-ink-2') || '#5f5a53',
    shadow: cssVar('--share-phrase-glow') || 'rgba(255,255,255,0.6)',
  };
}

// photoInkForBand に渡す、ラベル（いちばん淡い墨）と白い幕の相対輝度（トークンから）。
function photoInkLums() {
  const ink = parseRgb(cssVar('--share-paper-ink-2') || '#5f5a53');
  const veil = parseRgb(`rgb(${cssVar('--share-photo-veil') || '244, 239, 230'})`);
  return { inkLum: ink ? relativeLuminance(ink) : 0.104, veilLum: veil ? relativeLuminance(veil) : 0.86 };
}

function drawRecordOverlay(ctx, o, place) {
  const F = recordFrame(o.format);
  const { lay, place: at } = fitRecord(ctx, o, F);
  let foot = o.theme;
  let ink = o.theme;
  if (lay.height <= 0) {
    // 記録の項目を全部隠した: 写真はそのままに、ロゴ（と日付）が読める色・下地にする（ロゴは必ず読める）。
    foot = logoFooterOnPhoto(ctx, o, place);
  } else {
    ({ theme: ink, foot } = drawBlockScrim(ctx, o, place, F, at.top, at.top + lay.height));
  }
  const sb = o.shadowScale || 1;
  ctx.save();
  ctx.shadowColor = ink.shadow;
  ctx.shadowBlur = 18 * sb;
  ctx.shadowOffsetY = 2 * sb;
  drawRecordBlock(ctx, o.fonts, o, F, lay, at.top, ink);
  ctx.shadowColor = foot.shadow;
  drawRecordFooter(ctx, { F, baseline: F.footerBaseline, logo: o.logo, theme: foot, fonts: o.fonts, stamp: o.stamp });
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
  drawGround(ctx, F.W, F.H, theme, o.cover);
  const { lay, place } = fitRecord(ctx, o, F);
  // 言葉を入れたときは、上の空きは言葉が主役（表紙と重ねない）。
  const covers = o.phrase && phraseDisplayText(o.phrase)
    ? []
    : (o.covers && o.covers.length ? o.covers : (o.record?.titleIsBook ? [{ cover: o.cover, title: o.title }] : [])).slice(0, 4);
  const titleOnly = lay.plan.elements.length === 1 && lay.plan.elements[0].kind === 'title';
  const at = recordCoverPlacement(F, place, { count: covers.length, titleOnly });
  if (at) {
    const { x0, y0, w, h, step } = at;
    // 重ねるとき（step < w）は、いちばん手前の表紙だけ書名を出す（後ろの表紙の書名が途中で切れて見えない・第 3 回）。
    covers.forEach((c, i) => {
      drawCover(ctx, { x: x0 + step * i, y: y0 + (covers.length > 1 ? (i % 2) * h * 0.04 : 0), w, h, cover: c.cover, title: c.title, theme, fonts: o.fonts, showText: o.showTitle !== false && (step >= w || i === covers.length - 1) });
    });
  }
  drawRecordBlock(ctx, o.fonts, o, F, lay, place.top, theme);
  drawRecordFooter(ctx, { F, baseline: F.footerBaseline, logo: o.logo, theme, fonts: o.fonts, stamp: o.stamp });
}

// 透明（ステッカー）の記録: 文字の塊とロゴだけ。高さは中身に合わせる。
function recordStickerSize(ctx, o) {
  const F = { ...recordFrame('story'), margin: 72, safeTop: 0, footerTop: 1920, gap: 0 };
  const lay = layoutRecord(ctx, o.fonts, o, F);
  const pad = 72;
  const logoGap = 64;
  const footH = logoGap + F.wordH * 1.3;
  const top = stickerPhraseTop(ctx, o);
  return { F, lay, pad, logoGap, top, w: 1080, h: top + Math.max(pad * 2 + 120, Math.round(pad + lay.height + footH + pad)) };
}

function drawRecordSticker(ctx, o, size) {
  const { F, lay, logoGap } = size;
  const pad = size.pad + size.top;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.shadowColor = o.theme.shadow;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 3;
  drawRecordBlock(ctx, o.fonts, o, F, lay, pad, o.theme);
  drawRecordFooter(ctx, { F, baseline: pad + lay.height + (lay.height > 0 ? logoGap : 0) + F.wordH, logo: o.logo, theme: { ...o.theme, logo: 'white' }, fonts: o.fonts, stamp: o.stamp });
  ctx.restore();
}

// ---------------------------------------------------------------- 数字（Strava の大きな数字・2026-10-05）
//
// 真ん中に縦に積む（中央そろえ）:
//   読了                    … 見出し（小さな文字・日付をオンにしたときだけ「読了 · 9.28」）
//   『書名』                … 明朝 600・2 行まで
//   著者
//      （間）
//   メモ                    … 名前は小さく（UI 400・字間 0.08・ink-2）
//   24件                    … 数字は大きく・3 つの大きさは同じ（いちばん長いものに合わせて縮める）
//   実行した行動 / 3件 …   … 大きく出すのは積み重ねの数だけ（日付は大きな数字にしない・2026-10-09）
//   Orime のロゴ                        2026.10.5   … 記録と同じ下の行
// 写真でない地では、真ん中に表紙（今月は 4 冊まで）を積み方の上に置く。言葉を入れたら積み方を下に寄せる。

function layoutStats(ctx, fonts, o, F) {
  const rec = o.record || { kicker: '', title: '', stats: [] };
  const stats = (rec.stats || []).slice(0, 3);
  // 写真の地は詰める（写真を見せる）。紙・夜・表紙の色・透明はゆったり。
  const compact = o.style === 'photo';
  const plan0 = statsStackPlan(F, { hasKicker: false, compact });
  const st = plan0.style;
  const contentW = F.W - F.margin * 2;
  const titleFont = `600 ${st.titleSize}px ${fonts.read}`;
  ctx.font = titleFont;
  setSpacing(ctx, TITLE_TRACK, st.titleSize);
  const titleLines = rec.title ? fitTitleLines(ctx, rec.title, { isBook: !!rec.titleIsBook, width: contentW, font: titleFont, em: TITLE_TRACK, maxLines: 2 }) : [];
  const subFont = `400 ${st.subSize}px ${fonts.ui}`;
  const subLines = fitSubLines(ctx, rec, { width: contentW, font: subFont, size: st.subSize });
  const sub = subLines.join('');
  const plan = statsStackPlan(F, { hasKicker: !!rec.kicker, titleLines: titleLines.length, hasSub: subLines.length > 0, subLines: subLines.length, statsCount: stats.length, compact });
  // 数字の大きさは 3 つで同じ（いちばん長いものが幅に入るまで縮める）。
  const sizes = { valueSize: st.valueSize, unitSize: st.unitSize };
  const k = stats.reduce((m, s) => Math.min(m, contentW / Math.max(1, statValueWidth(ctx, fonts, s.value, sizes, 1))), 1);
  return { rec, stats, st, titleFont, titleLines, subFont, sub, subLines, plan, k, contentW, height: plan.height };
}

function drawStatsBlock(ctx, fonts, F, lay, top, theme, cx) {
  const { st } = lay;
  ctx.save();
  ctx.textAlign = 'left';
  for (const el of lay.plan.elements) {
    const y = top + el.top;
    if (el.kind === 'kicker') {
      drawKicker(ctx, fonts, { x: cx, y, h: el.height, size: st.kickerSize, text: lay.rec.kicker, theme, align: 'center' });
    } else if (el.kind === 'title') {
      ctx.fillStyle = theme.ink;
      lay.titleLines.forEach((ln, i) => {
        ctx.font = lay.titleFont;
        setSpacing(ctx, TITLE_TRACK, st.titleSize);
        const w = ctx.measureText(ln).width - TITLE_TRACK * st.titleSize;
        ctx.fillText(ln, cx - w / 2, y + i * st.titleLH + st.titleLH * 0.8);
      });
    } else if (el.kind === 'sub') {
      ctx.font = lay.subFont;
      setSpacing(ctx, 0.04, st.subSize);
      ctx.fillStyle = theme.ink2;
      const lh = Math.round(st.subSize * 1.45);
      lay.subLines.forEach((ln, i) => {
        const w = ctx.measureText(ln).width - 0.04 * st.subSize;
        ctx.fillText(ln, cx - w / 2, y + i * lh + lh * 0.76);
      });
    } else if (el.kind === 'stat') {
      const stat = lay.stats[el.index];
      if (!stat) continue;
      ctx.font = `400 ${st.labelSize}px ${fonts.ui}`;
      setSpacing(ctx, LABEL_TRACK, st.labelSize);
      ctx.fillStyle = theme.ink2;
      const label = ellipsize(ctx, stat.label, lay.contentW);
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, cx - lw / 2, y + st.labelH * 0.78);
      const sizes = { valueSize: st.valueSize, unitSize: st.unitSize };
      const vw = statValueWidth(ctx, fonts, stat.value, sizes, lay.k);
      drawStatValue(ctx, fonts, stat.value, sizes, lay.k, cx - vw / 2, y + st.labelH + 4 + st.valueSize * 0.86, theme.ink);
    }
  }
  ctx.restore();
}

function drawStatsPhoto(ctx, o) {
  const F = recordFrame(o.format);
  const place = photoPlacement({ pw: o.photo.width, ph: o.photo.height, W: F.W, H: F.H, ...(o.view || {}) });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(o.photo.source, place.x, place.y, place.w, place.h);
  drawStatsOverlay(ctx, o, place);
}

function drawStatsOverlay(ctx, o, place) {
  const F = recordFrame(o.format);
  const lay = layoutStats(ctx, o.fonts, o, F);
  // 写真の上は、積み方を下に寄せる（写真の上のほうを見せる＝写真が主役・Strava の共有と同じ）。
  const at = placeStatsStack(F, lay.height, { phrase: !!(o.phrase && phraseDisplayText(o.phrase)), align: 'bottom' });
  let foot = o.theme;
  let ink = o.theme;
  if (lay.height <= 0) {
    foot = logoFooterOnPhoto(ctx, o, place);
  } else {
    ({ theme: ink, foot } = drawBlockScrim(ctx, o, place, F, at.top, at.bottom));
  }
  const sb = o.shadowScale || 1;
  ctx.save();
  ctx.shadowColor = ink.shadow;
  ctx.shadowBlur = 18 * sb;
  ctx.shadowOffsetY = 2 * sb;
  drawStatsBlock(ctx, o.fonts, F, lay, at.top, ink, F.W / 2);
  ctx.shadowColor = foot.shadow;
  drawRecordFooter(ctx, { F, baseline: F.footerBaseline, logo: o.logo, theme: foot, fonts: o.fonts, stamp: o.stamp });
  ctx.restore();
}

function drawStatsPoster(ctx, o) {
  const { theme } = o;
  const F = recordFrame(o.format);
  drawGround(ctx, F.W, F.H, theme, o.cover);
  const lay = layoutStats(ctx, o.fonts, o, F);
  const hasPhrase = !!(o.phrase && phraseDisplayText(o.phrase));
  const covers = (o.covers && o.covers.length ? o.covers : (o.record?.titleIsBook ? [{ cover: o.cover, title: o.title }] : [])).slice(0, 4);
  const at = placeStatsStack(F, lay.height, { phrase: hasPhrase, coverCount: covers.length });
  if (at.cover) {
    const { x0, y0, w, h, step } = at.cover;
    covers.forEach((c, i) => {
      drawCover(ctx, { x: x0 + step * i, y: y0 + (covers.length > 1 ? (i % 2) * h * 0.04 : 0), w, h, cover: c.cover, title: c.title, theme, fonts: o.fonts, showText: o.showTitle !== false && (step >= w || i === covers.length - 1) });
    });
  }
  drawStatsBlock(ctx, o.fonts, F, lay, at.top, theme, F.W / 2);
  drawRecordFooter(ctx, { F, baseline: F.footerBaseline, logo: o.logo, theme, fonts: o.fonts, stamp: o.stamp });
}

function statsStickerSize(ctx, o) {
  const F = { ...recordFrame('story'), margin: 72 };
  const lay = layoutStats(ctx, o.fonts, o, F);
  const pad = 72;
  const logoGap = 64;
  const footH = logoGap + F.wordH * 1.3;
  const top = stickerPhraseTop(ctx, o);
  return { F, lay, pad, logoGap, top, w: 1080, h: top + Math.max(pad * 2 + 120, Math.round(pad + lay.height + footH + pad)) };
}

function drawStatsSticker(ctx, o, size) {
  const { F, lay, logoGap } = size;
  const pad = size.pad + size.top;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.shadowColor = o.theme.shadow;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 3;
  drawStatsBlock(ctx, o.fonts, F, lay, pad, o.theme, size.w / 2);
  drawRecordFooter(ctx, { F, baseline: pad + lay.height + (lay.height > 0 ? logoGap : 0) + F.wordH, logo: o.logo, theme: { ...o.theme, logo: 'white' }, fonts: o.fonts, stamp: o.stamp });
  ctx.restore();
}

// ---------------------------------------------------------------- 雑誌（2026-10-09 オーナーの見本）
//
//                                           [本の印] Orime   … 右上・必ず入る（決まり LOGO_RULES の大きさ）
//                                        READ. NOTE. GROW.   … 字間の広い英字のひとこと
//   「正解を探すんじゃなくて、                              … 大きな引用（細い明朝 400・字間 0.14em・3 行まで・
//     自分の問いを持ち続けること。」                            開き括弧は左へぶら下げる）
//     答えはひとつじゃない。            ┌──┐ 書名           … 続きの文（小さく・3 行まで）と、右に本のカード
//     むしろ、…                         │表│ 著者              （表紙・書名・著者だけ）
//                                       └──┘
//                    （写真を見せる余白）
//   2026.10.09 FRI                YOUR BOOKS, YOUR ADVISOR.  … 下の行（日付は小さく・隠せる）
// 数字の帯は作らない（2026-10-09 オーナー）。下の行の左には、あとで短い数を 1 つ（note）だけ添えられる。
// 写真の上は、上のまとまりと下の行それぞれの明るさから、白い文字＋黒い幕／墨の文字＋白い幕を決める。
const MAG_HEAD_TRACK = 0.14;
// 引用は細く（ヒラギノ明朝 W3 など細い字があれば使う・無ければ 400）。
const MAG_HEAD_WEIGHT = 300;
const MAG_BODY_TRACK = 0.06;
const MAG_TAG_TRACK = 0.32;
const MAG_FOOT_TRACK = 0.24;

function magazineStyle(format) {
  const F = recordFrame(format);
  const k = F.format === 'story' ? 1 : 0.92;
  const r = (n) => Math.round(n * k);
  return {
    F,
    k,
    headSizes: [r(70), r(66), r(62), r(58), r(54), r(50), r(46)],
    headLH: 1.62,
    headGap: F.format === 'story' ? 72 : r(44), // ロゴのひとことの下から引用まで
    bodySize: r(28),
    bodyLH: 1.85,
    bodyGap: r(36), // 引用の下から続きの文まで
    coverW: r(104),
    cardGap: r(26), // 表紙と書名の間
    titleSize: r(34),
    authorSize: r(30),
    footSize: r(22),
  };
}

// 文字の幅（字間つき・行末の字間は数えない）。
function trackedMeasure(ctx, font, em, size) {
  const m = measurer(ctx, font, em);
  const trail = Math.round(em * size * 10) / 10;
  return (s) => (s ? Math.max(0, m(s) - trail) : 0);
}

// 書名（括弧なし）を maxLines 行に。入らなければ副題を外し、それでも入らなければ最後の行を … で切る。
function fitPlainTitle(ctx, title, { width, font, size, maxLines }) {
  const m = trackedMeasure(ctx, font, TITLE_TRACK, size);
  let lines = wrapBalanced(title, width, m);
  if (lines.length > maxLines) {
    const main = mainTitle(title);
    if (main && main !== title) {
      const short = wrapBalanced(main, width, m);
      if (short.length <= maxLines) return short;
    }
    ctx.font = font;
    setSpacing(ctx, TITLE_TRACK, size);
    lines = [...lines.slice(0, maxLines - 1), ellipsize(ctx, lines.slice(maxLines - 1).join(''), width)];
  }
  return lines;
}

// 続きの文: 文の切れ目ごとに行を分け（見本のように 1 文 1 行）、入らない文は折り返す。3 行まで（最後は …）。
function magazineBodyLines(ctx, fonts, body, { width, size }) {
  if (!body) return [];
  const font = `400 ${size}px ${fonts.ui}`;
  const m = trackedMeasure(ctx, font, MAG_BODY_TRACK, size);
  const sentences = String(body).match(/[^。！？!?]+[。！？!?]*[」』）)]*/gu) || [body];
  const lines = [];
  for (const sen of sentences) lines.push(...wrapBalanced(sen.trim(), width, m));
  if (lines.length <= 3) return lines.filter(Boolean);
  ctx.font = font;
  setSpacing(ctx, MAG_BODY_TRACK, size);
  return [lines[0], lines[1], ellipsize(ctx, `${lines.slice(2).join('')}`, width)];
}

// 組み（描く前に場所を決める＝写真の幕の範囲もここから）。
function layoutMagazine(ctx, o) {
  const S = magazineStyle(o.format);
  const { F } = S;
  const fonts = o.fonts;
  const rec = o.magazine;
  const LB = magazineLogoBox(F.format);
  const left = F.margin;
  const right = F.W - F.margin;
  const contentW = right - left;
  // 大きな引用（「＋最初の文＋」）。開き括弧は左の余白にぶら下げ、文字の左端を left + hang にそろえる。
  const headTop = LB.clearBottom + S.headGap;
  const headText = `${rec.quote.head}」`;
  const fitOpts = {
    maxWidth: contentW - S.headSizes[0],
    maxHeight: 3 * S.headSizes[0] * S.headLH,
    sizes: S.headSizes,
    lineHeight: S.headLH,
    measureAt: (size) => trackedMeasure(ctx, `${MAG_HEAD_WEIGHT} ${size}px ${fonts.read}`, MAG_HEAD_TRACK, size),
  };
  // 読点（、）で行を分けて、どの句も 1 行に入るいちばん大きな大きさがあれば、そこで改行する
  // （「自分の｜問いを」のような切れ目を作らない・見本の組み）。
  const clauses = headText.split(/(?<=、)/u).filter(Boolean);
  let fit = null;
  if (clauses.length >= 2 && clauses.length <= 3) {
    for (const size of S.headSizes) {
      const m = fitOpts.measureAt(size);
      if (clauses.every((c) => m(c) <= fitOpts.maxWidth)) { fit = { size, lines: clauses, lineHeight: size * S.headLH }; break; }
    }
  }
  if (!fit) fit = fitQuote(headText, fitOpts);
  let headLines = fit.lines;
  if (headLines.length > 3) {
    ctx.font = `${MAG_HEAD_WEIGHT} ${fit.size}px ${fonts.read}`;
    setSpacing(ctx, MAG_HEAD_TRACK, fit.size);
    headLines = [headLines[0], headLines[1], `${ellipsize(ctx, headLines.slice(2).join('').replace(/」$/u, ''), contentW - fit.size * 2)}」`];
  }
  ctx.font = `${MAG_HEAD_WEIGHT} ${fit.size}px ${fonts.read}`;
  setSpacing(ctx, 0, fit.size);
  const hang = ctx.measureText('「').width;
  const textX = left + hang;
  const headBottom = headTop + headLines.length * fit.lineHeight;

  // 本のカード（右）: 表紙・書名・著者。書名も著者も隠したときはカードごと出さない。
  const showCard = o.showTitle !== false || o.showAuthor !== false;
  const coverH = Math.round(S.coverW * 1.45);
  const sideCardX = right - Math.round(contentW * 0.4);
  // 続きの文（左・カードの左まで）。カードが無ければ幅いっぱい。
  const bodyTop = headBottom + S.bodyGap;
  const bodyW = showCard ? sideCardX - Math.round(40 * S.k) - textX : right - textX;
  let bodyLines = magazineBodyLines(ctx, fonts, rec.quote.body, { width: bodyW, size: S.bodySize });
  // カードの横で 3 行に入らない（… で切れる）ときは、続きの文を幅いっぱいにして、カードをその下（右）に置く。
  let cardBelow = false;
  if (showCard && bodyLines.length && /…$/u.test(bodyLines[bodyLines.length - 1]) && !/…$/u.test(rec.quote.body)) {
    const wide = magazineBodyLines(ctx, fonts, rec.quote.body, { width: right - textX, size: S.bodySize });
    if (wide.length < 3 || !/…$/u.test(wide[wide.length - 1])) { bodyLines = wide; cardBelow = true; }
  }
  const bodyLH = Math.round(S.bodySize * S.bodyLH);
  const bodyBottom = bodyTop + bodyLines.length * bodyLH;
  // カードは続きの文の高さに並べる（続きが無ければ引用の下・続きが長ければその下）。
  // カードを続きの文の下に置くときは、幅を広く（書名・著者を細切れにしない）。
  const cardX = cardBelow ? right - Math.round(contentW * 0.56) : sideCardX;
  const colX = cardX + S.coverW + S.cardGap;
  const colW = right - colX;
  const titleFont = `600 ${S.titleSize}px ${fonts.read}`;
  const titleLines = showCard && o.showTitle !== false && rec.title ? fitPlainTitle(ctx, rec.title, { width: colW, font: titleFont, size: S.titleSize, maxLines: 2 }) : [];
  const authorFont = `400 ${S.authorSize}px ${fonts.ui}`;
  let authorLines = [];
  if (showCard && o.showAuthor !== false && rec.sub) {
    authorLines = wrapBalanced(rec.sub, colW, trackedMeasure(ctx, authorFont, 0.04, S.authorSize));
    if (authorLines.length > 2) {
      ctx.font = authorFont;
      setSpacing(ctx, 0.04, S.authorSize);
      authorLines = [authorLines[0], ellipsize(ctx, authorLines.slice(1).join(''), colW)];
    }
  }
  const titleLH = Math.round(S.titleSize * 1.4);
  const authorLH = Math.round(S.authorSize * 1.5);
  const textH = titleLines.length * titleLH + (titleLines.length && authorLines.length ? 12 : 0) + authorLines.length * authorLH;

  const cardTop = cardBelow ? bodyBottom + Math.round(40 * S.k)
    : bodyLines.length ? bodyTop + Math.round(bodyLH * 0.15) : headBottom + Math.round(48 * S.k);
  const cardBottom = showCard ? cardTop + Math.max(coverH, textH) : 0;

  // 下の行（日付・短い数の欄・英字のひとこと）。
  const foot = magazineFooterItems({ stamp: o.stamp, note: rec.note });
  const footBaseline = F.footerBaseline;
  const footTop = footBaseline - Math.round(S.footSize * 1.1);

  return {
    S, F, LB, left, right, contentW, fit, headLines, headTop, headBottom, textX, hang,
    showCard, cardX, cardTop, cardBottom, coverH, colX, colW, titleFont, titleLines, titleLH, authorFont, authorLines, authorLH, textH,
    bodyLines, bodyTop, bodyLH, bodyBottom,
    topBottom: Math.max(headBottom, bodyBottom, cardBottom),
    foot, footBaseline, footTop,
  };
}

// 右にそろえた字間つきの文字（最後の字の後ろの字間ぶん右へ＝墨の右端を余白にそろえる）。
function fillRight(ctx, text, right, baseline, em, size) {
  ctx.textAlign = 'right';
  ctx.fillText(text, right + em * size, baseline);
  ctx.textAlign = 'left';
}

function drawMagazineTop(ctx, o, lay, theme) {
  const { S, LB, fonts } = { ...lay, fonts: o.fonts };
  // ロゴ（右上）とひとこと
  const lw = logoWidth(ctx, o.logo, theme.logo, { wordH: LB.wordH, fonts });
  drawLogo(ctx, o.logo, theme.logo, { x: LB.right - lw, baseline: LB.baseline, wordH: LB.wordH, fonts, ink: theme.ink });
  ctx.font = `400 ${LB.tagSize}px ${fonts.ui}`;
  setSpacing(ctx, MAG_TAG_TRACK, LB.tagSize);
  ctx.fillStyle = theme.ink2;
  fillRight(ctx, MAGAZINE_TAGLINE_TOP, LB.right, LB.tagBaseline, MAG_TAG_TRACK, LB.tagSize);

  // 大きな引用
  const { fit } = lay;
  ctx.font = `${MAG_HEAD_WEIGHT} ${fit.size}px ${fonts.read}`;
  ctx.fillStyle = theme.ink;
  const ascent = fit.size * 0.88;
  const half = (fit.lineHeight - fit.size) / 2;
  setSpacing(ctx, 0, fit.size);
  ctx.fillText('「', lay.left, lay.headTop + half + ascent);
  setSpacing(ctx, MAG_HEAD_TRACK, fit.size);
  lay.headLines.forEach((ln, i) => ctx.fillText(ln, lay.textX, lay.headTop + i * fit.lineHeight + half + ascent));

  // 続きの文
  if (lay.bodyLines.length) {
    ctx.font = `400 ${S.bodySize}px ${fonts.ui}`;
    setSpacing(ctx, MAG_BODY_TRACK, S.bodySize);
    ctx.fillStyle = theme.ink2;
    lay.bodyLines.forEach((ln, i) => ctx.fillText(ln, lay.textX, lay.bodyTop + i * lay.bodyLH + lay.bodyLH * 0.7));
  }

  // 本のカード
  if (lay.showCard) {
    const coverTheme = { ...theme, bg: theme.bg || 'rgba(0,0,0,0.25)', shadow: theme.shadow || 'rgba(0,0,0,0.35)' };
    drawCover(ctx, { x: lay.cardX, y: lay.cardTop, w: S.coverW, h: lay.coverH, cover: o.cover, title: o.magazine.title, theme: coverTheme, fonts, showText: o.showTitle !== false });
    let y = lay.cardTop + Math.max(0, (lay.coverH - lay.textH) / 2);
    ctx.fillStyle = theme.ink;
    lay.titleLines.forEach((ln) => {
      ctx.font = lay.titleFont;
      setSpacing(ctx, TITLE_TRACK, S.titleSize);
      ctx.fillText(ln, lay.colX, y + lay.titleLH * 0.78);
      y += lay.titleLH;
    });
    if (lay.titleLines.length && lay.authorLines.length) y += 12;
    ctx.fillStyle = theme.ink2;
    lay.authorLines.forEach((ln) => {
      ctx.font = lay.authorFont;
      setSpacing(ctx, 0.04, S.authorSize);
      ctx.fillText(ln, lay.colX, y + lay.authorLH * 0.72);
      y += lay.authorLH;
    });
  }
}

// 下の行: 左に日付（と短い数の欄）、右に英字のひとこと。どれも小さく（主役にしない）。
function drawMagazineFoot(ctx, o, lay, theme) {
  const { S, fonts } = { ...lay, fonts: o.fonts };
  ctx.font = `400 ${S.footSize}px ${fonts.ui}`;
  setSpacing(ctx, MAG_FOOT_TRACK, S.footSize);
  ctx.fillStyle = theme.ink2;
  let x = lay.left;
  lay.foot.left.forEach((it) => {
    ctx.fillText(it.text, x, lay.footBaseline);
    x += ctx.measureText(it.text).width + S.footSize * 1.6;
  });
  fillRight(ctx, lay.foot.right, lay.right, lay.footBaseline, MAG_FOOT_TRACK, S.footSize);
}

// 写真の上: 上のまとまり・下の行それぞれの帯の明るさから文字の色と幕を決める（記録と同じ決まり＝photoInkForBand）。
function magazineBandInk(ctx, o, place, y0, y1, fill) {
  const { W, H } = o;
  const px = bandPixels(o.photo, place, W, H, y0, y1);
  const bright = px && px.length ? brightLuminance(px) : 0.6;
  const dark = px && px.length ? darkLuminance(px, PHOTO_INK_DARK_Q) : 0;
  const fine = bandPixels(o.photo, place, W, H, y0, y1, 0, W, 216);
  const texture = fine && fine.length ? bandTexture(fine, fine.width) : 0;
  const pick = photoInkForBand({ bright, dark, texture }, photoInkLums());
  if (pick.ink === 'dark') {
    if (pick.veil > 0) drawScrim(ctx, W, H, cssVar('--share-photo-veil') || '244, 239, 230', fill(pick.veil));
    return { ...darkInkTheme(o.theme), logo: 'color' };
  }
  drawScrim(ctx, W, H, o.theme.scrim, fill(pick.scrim));
  return { ...o.theme, logo: 'white' };
}

function drawMagazineOverlay(ctx, o, place) {
  const lay = layoutMagazine(ctx, o);
  const { H } = o;
  const gap = Math.max(0, lay.footTop - lay.topBottom);
  const fade = Math.max(24, Math.min(H * 0.16, gap / 2 - 24));
  const topEnd = lay.topBottom + 16;
  const top = magazineBandInk(ctx, o, place, lay.LB.top - 8, lay.topBottom + 8, (a) => [[0, a], [topEnd, a], [Math.min(H, topEnd + fade), 0]]);
  const footStart = lay.footTop - 16;
  const foot = magazineBandInk(ctx, o, place, lay.footTop - 8, lay.footBaseline + 8, (a) => [[Math.max(0, footStart - fade), 0], [footStart, a], [H, a]]);
  const sb = o.shadowScale || 1;
  ctx.save();
  ctx.shadowColor = top.shadow;
  ctx.shadowBlur = 18 * sb;
  ctx.shadowOffsetY = 2 * sb;
  drawMagazineTop(ctx, o, lay, top);
  ctx.shadowColor = foot.shadow;
  drawMagazineFoot(ctx, o, lay, foot);
  ctx.restore();
}

function drawMagazine(ctx, o) {
  if (o.style === 'photo') {
    const place = photoPlacement({ pw: o.photo.width, ph: o.photo.height, W: o.W, H: o.H, ...(o.view || {}) });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(o.photo.source, place.x, place.y, place.w, place.h);
    drawMagazineOverlay(ctx, o, place);
    return;
  }
  const lay = layoutMagazine(ctx, o);
  if (o.style === 'sticker') {
    // 透明: 地は描かない・白い文字＋濃い影（下の写真が分からないので）
    const theme = { ...o.theme, logo: 'white' };
    ctx.save();
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 3;
    drawMagazineTop(ctx, o, lay, theme);
    drawMagazineFoot(ctx, o, lay, theme);
    ctx.restore();
    return;
  }
  drawGround(ctx, o.W, o.H, o.theme, o.cover);
  drawMagazineTop(ctx, o, lay, o.theme);
  drawMagazineFoot(ctx, o, lay, o.theme);
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
    // 雑誌の透明は画像の大きさのまま（高さを中身に合わせない）・言葉は右上のロゴの下から。
    sticker: o.style === 'sticker' && o.layout !== 'magazine',
    magazine: o.layout === 'magazine',
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
  // 明朝の引用の下の橙の傍線は 2026-10-08 にやめた（オーナー「オレンジ色の下線がダサい」・「」と余白で見せる）。
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

// 表示する項目（隠した項目）を描く材料に当てる。記録・数字は applyShareItems で見出し・書名・著者・数字を外し、
// 一文・今日の日付はフラグで。一文の見せ方は書名・著者だけ。ロゴは隠せない（必ず描く・下の行はいつもある）。
function visibleOpts(opts, layout, text) {
  const vis = shareVisibility(opts.hidden);
  if (layout === 'magazine') {
    // 雑誌: 引用は主役（隠せない）・書名・著者・今日の日付は隠せる。中身は書名・著者・一文から作る（数字は入れない）。
    const rec = magazineRecord({ title: opts.title, author: opts.author }, text, { note: opts.note || null });
    return { ...opts, magazine: rec, record: null, text, stamp: vis.stamp ? (opts.stamp || '') : '', showTitle: vis.title, showAuthor: vis.author, hasFooter: true };
  }
  const isRecord = layout === 'record' || layout === 'stats';
  const stamp = isRecord && vis.stamp ? (opts.stamp || '') : '';
  return {
    ...opts,
    record: isRecord ? applyShareItems(opts.record, opts.hidden) : opts.record,
    text: layout === 'stats' || (isRecord && !vis.quote) ? '' : text,
    stamp,
    showTitle: vis.title,
    showAuthor: vis.author,
    hasFooter: true,
  };
}

function normalizeLayout(layout) {
  return layout === 'record' || layout === 'stats' || layout === 'magazine' ? layout : 'quote';
}

// canvas に描く（同期）。canvas の大きさもここで決める。
// opts: { line, page, title, author, cover, style, format, photo, view, textPos, fonts, logo,
//         seedKey（傍線の種＝メモの id）, totalPages / knownMaxPage（付箋の高さ）,
//         layout（'quote'＝一文が主役 / 'record'＝記録が主役）, record（shareOverlay の bookRecord / monthRecord）,
//         stamp（右下の日付）, covers（今月の表紙の並び [{ cover, title }]）,
//         kicker（一文の見せ方の見出し・今年は「2026」・2026-10-08）,
//         hidden（表示する項目で隠した項目の名前の配列・shareOverlay の SHARE_ITEM_KEYS）,
//         phrase（自由に入れる言葉の層 { text, style, x, y, scale, invert }・sharePhrase.js） }
// 戻り値: { line, width, height }（line は実際に画像に入れた文＝共有の文にも同じものを使う）
export function drawShareCard(canvas, opts = {}) {
  const layout = normalizeLayout(opts.layout);
  const { text } = clampLine(layout === 'stats' ? '' : opts.line, layout === 'record' ? RECORD_QUOTE_MAX : undefined);
  if (!text && (layout === 'quote' || layout === 'magazine')) throw new Error('画像にする一文がありません。');
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

  if (layout === 'magazine') {
    // 雑誌は透明でも画像の大きさのまま（右上のロゴと下の行の場所を変えない）。
    const F = recordFrame(opts.format);
    if (canvas.width !== F.W || canvas.height !== F.H) { canvas.width = F.W; canvas.height = F.H; }
    ctx.clearRect(0, 0, F.W, F.H);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const o = { ...base, W: F.W, H: F.H, format: F.format, layout };
    drawMagazine(ctx, o);
    drawPhrase(ctx, { ...o, quoteShown: true }, F.W, F.H);
    return { line: text, width: F.W, height: F.H };
  }

  if (layout === 'stats') {
    if (style === 'sticker') {
      const size = statsStickerSize(ctx, base);
      if (canvas.width !== size.w || canvas.height !== size.h) { canvas.width = size.w; canvas.height = size.h; }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      drawStatsSticker(ctx, base, size);
      drawPhrase(ctx, { ...base, quoteShown: false }, size.w, size.h);
      return { line: '', width: size.w, height: size.h };
    }
    const F = recordFrame(opts.format);
    if (canvas.width !== F.W || canvas.height !== F.H) { canvas.width = F.W; canvas.height = F.H; }
    ctx.clearRect(0, 0, F.W, F.H);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const o = { ...base, W: F.W, H: F.H, format: F.format };
    if (style === 'photo') drawStatsPhoto(ctx, o);
    else drawStatsPoster(ctx, o);
    drawPhrase(ctx, { ...o, quoteShown: false }, F.W, F.H);
    return { line: '', width: F.W, height: F.H };
  }

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
  const layout = normalizeLayout(opts.layout);
  const isRecord = layout === 'record';
  const { text } = clampLine(layout === 'stats' ? '' : opts.line, isRecord ? RECORD_QUOTE_MAX : undefined);
  if (!text && (layout === 'quote' || layout === 'magazine')) return false;
  const fmt = FORMATS[opts.format] ? opts.format : 'story';
  const { w: W, h: H } = FORMATS[fmt];
  const k = Math.min(1, Math.max(0.2, targetWidth / W));
  const cw = Math.round(W * k);
  const ch = Math.round(H * k);
  const fonts = opts.fonts || fontStacks();
  const key = JSON.stringify([text, fmt, opts.textPos, opts.title, opts.author, opts.page, opts.totalPages, opts.knownMaxPage, opts.seedKey, opts.photo.width, opts.photo.height, fonts.read, k, opts.layout, opts.record, opts.stamp, opts.hidden, opts.phrase, opts.note, !!opts.cover?.image]);
  if (cache.key !== key || !cache.layer || cache.photoRef !== opts.photo) {
    const theme = readShareTheme('photo', { tone: opts.cover?.tone, title: opts.title });
    const o = {
      ...visibleOpts(opts, layout, text), fonts, theme, style: 'photo', W, H, format: fmt,
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
    if (layout === 'magazine') drawMagazineOverlay(lctx, { ...o, layout }, place0);
    else if (layout === 'stats') drawStatsOverlay(lctx, o, place0);
    else if (isRecord) drawRecordOverlay(lctx, o, place0);
    else drawPhotoOverlay(lctx, o, place0);
    drawPhrase(lctx, { ...o, layout, quoteShown: layout === 'stats' ? false : isRecord ? !!fitRecord(lctx, o, recordFrame(fmt)).lay.fit : true }, W, H);
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
  drawPhrase(ctx, { ...opts, layout: normalizeLayout(opts.layout), quoteShown: cache.quoteShown, fonts: opts.fonts || fontStacks(), style: cache.style, theme: cache.theme, shadowScale: k, format: FORMATS[opts.format] ? opts.format : 'story' }, W, H);
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
  return layoutPhraseOn(ctx, { ...opts, layout: normalizeLayout(opts.layout), style, fonts: opts.fonts || fontStacks(), format: FORMATS[opts.format] ? opts.format : 'story' }, W, H);
}

// 画像にする（style を渡すと、その地に合った種類＝写真は JPEG・ほかは PNG・shareImageType）。
export function canvasToBlob(canvas, { style } = {}) {
  const { type, quality } = shareImageType(style);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('紙・夜など、ほかの色を選ぶか、もう一度お試しください。'))), type, quality);
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
