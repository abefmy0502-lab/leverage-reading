// 🖼 一文カード（シェア画像）を canvas で描く。
//
// 「この本の一文」を主役に、雑誌の引用ページのように組む:
//   引用符（アクセント色）→ 一文（明朝・大きく・行の長さをそろえる）→ 短い線 →
//   小さな表紙＋『書名』著者 p.N → 下に Orime のロゴ文字とサイトの URL。
// 読了日・メモ件数などの数字は入れない（2026-09-27 オーナー判断）。
//
// 色は tokens.css の --share-* を getComputedStyle で読む（canvas は var() を解決できない）。
// 書体は --font-read / --font-ui の並びをそのまま使い、document.fonts.ready を待つ。
// 大きさは幅 1080 固定（ストーリー 1080×1920 / 投稿 1080×1350）。端末の解像度に依存しない。
// 例外は throw（呼び出し側が toMessage で整える）。

import { FORMATS, clampLine, fitQuote, wrapBalanced, coverTone, rgbCss } from './shareCardLayout';
import { paletteFor } from './coverPalette';
import { apiUrl } from './apiUrl';
import { SITE_URL } from './legalLinks';

export const SITE_LABEL = SITE_URL.replace(/^https?:\/\//, '');

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

// 紙 / 夜 / 表紙の色。表紙の色は、表紙の画素から作った地（無ければ代用表紙の濃い方の色）。
export function readShareTheme(style, { tone = null, title = '' } = {}) {
  const key = style === 'night' ? 'night' : style === 'cover' ? 'cover' : 'paper';
  const t = (n) => cssVar(`--share-${key}-${n}`);
  if (key === 'cover') {
    const [, b] = paletteFor(title);
    return {
      bg: tone ? rgbCss(tone) : (resolveVar(b) || '#5d3a22'),
      ink: t('ink') || '#ffffff',
      ink2: t('ink-2') || 'rgba(255,255,255,0.84)',
      ink3: t('ink-3') || 'rgba(255,255,255,0.72)',
      accent: t('accent') || 'rgba(255,255,255,0.6)',
      shadow: t('shadow') || 'rgba(0,0,0,0.35)',
      key,
    };
  }
  return {
    bg: t('bg'), ink: t('ink'), ink2: t('ink-2'), ink3: t('ink-3'), accent: t('accent'), shadow: t('shadow'), key,
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

async function ensureFonts(fonts, sample) {
  try {
    if (typeof document === 'undefined' || !document.fonts) return;
    await Promise.all([
      document.fonts.load(`400 64px ${fonts.read}`, sample),
      document.fonts.load(`600 36px ${fonts.read}`, sample),
      document.fonts.load(`600 32px ${fonts.ui}`, 'Orime'),
    ]).catch(() => {});
    await document.fonts.ready;
  } catch {
    /* 書体が確かめられなくても、並びの先頭から描ける */
  }
}

// ---------------------------------------------------------------- 表紙

// 表紙を canvas に描ける URL にする。外部の画像は自前の中継（/api/cover-image）経由。
// data: / blob: / 同じサイトの画像はそのまま。
export function coverImageSrc(url, { origin = (typeof location !== 'undefined' ? location.origin : '') } = {}) {
  const u = String(url || '').trim();
  if (!u) return null;
  if (/^(data:image\/|blob:)/i.test(u)) return u;
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  const https = u.replace(/^http:/i, 'https:');
  if (!/^https:\/\//i.test(https)) return null;
  try {
    if (origin && new URL(https).origin === origin) return https;
  } catch {
    return null;
  }
  return apiUrl(`/api/cover-image?url=${encodeURIComponent(https)}`);
}

function loadImage(src, timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (!/^data:/i.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => { clearTimeout(timer); finish(img.naturalWidth > 1 && img.naturalHeight > 1 ? img : null); };
    img.onerror = () => { clearTimeout(timer); finish(null); };
    img.src = src;
  });
}

// 表紙の画素を少しだけ読む（汚れた canvas なら読めないので null）。
function samplePixels(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 36;
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

function measurer(ctx, font) {
  return (s) => { ctx.font = font; return ctx.measureText(s).width; };
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

function drawCover(ctx, { x, y, w, h, cover, title, theme, fonts }) {
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
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    // 代用表紙（アプリの表紙が無い本と同じ色の組・書名入り）。
    const [a, b] = paletteFor(title).map(resolveVar);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, a || '#7d4a2e');
    g.addColorStop(1, b || '#5d3a22');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    const size = Math.round(w * 0.13);
    const font = `600 ${size}px ${fonts.read}`;
    ctx.font = font;
    ctx.fillStyle = cssVar('--on-cover') || '#ffffff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const pad = Math.round(w * 0.1);
    const lines = wrapBalanced(title || '', w - pad * 2, measurer(ctx, font));
    const maxLines = Math.max(1, Math.floor((h - pad * 2) / (size * 1.35)));
    lines.slice(0, maxLines).forEach((l, i) => {
      const text = i === maxLines - 1 && lines.length > maxLines ? ellipsize(ctx, `${l}…`, w - pad * 2) : l;
      ctx.fillText(text, x + pad, y + pad + i * size * 1.35);
    });
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

// ---------------------------------------------------------------- 本体

// 形ごとの寸法。ストーリーは Instagram などの上下の帯（約 250px）に文字をかけない。
const LAYOUT = {
  story: {
    margin: 112, top: 300, bottom: 1560, footerBaseline: 1712,
    mark: 220, markInk: 76, sizes: [92, 84, 76, 70, 64, 60, 56, 52, 48, 44], coverW: 128, titleSize: 38, metaSize: 28,
  },
  post: {
    margin: 104, top: 128, bottom: 1128, footerBaseline: 1262,
    mark: 176, markInk: 60, sizes: [76, 70, 64, 60, 56, 52, 48, 44, 40, 38], coverW: 112, titleSize: 34, metaSize: 26,
  },
};

// line: 画像に入れる一文（clampLine 済みでなくてよい）/ page: ページ番号 / title・author: 書名・著者
// cover: prepareCover() の結果 / style: 'paper' | 'night' | 'cover' / format: 'story' | 'post'
// 戻り値: { blob, line }（line は実際に画像に入れた文＝共有の文にも同じものを使う）
export async function renderLineCard({ line, page = null, title = '', author = '', cover = null, style = 'paper', format = 'story' } = {}) {
  const { text } = clampLine(line);
  if (!text) throw new Error('画像にする一文がありません。');
  const { w: W, h: H } = FORMATS[format] || FORMATS.story;
  const L = LAYOUT[format] || LAYOUT.story;
  const fonts = fontStacks();
  await ensureFonts(fonts, `${text}${title}${author}“`);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('この端末では画像を作れませんでした。');
  const theme = readShareTheme(style, { tone: cover?.tone, title });
  const setSpacing = (em, size) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(em * size * 10) / 10}px`; };

  // 地
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
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // 引用符: 書体によって字の大きさ・位置が違うので、墨の高さが markInk になる大きさを測って決める。
  ctx.font = `400 100px ${fonts.read}`;
  const probe = ctx.measureText('“');
  const probeInk = (probe.actualBoundingBoxAscent ?? 70) + (probe.actualBoundingBoxDescent ?? -35); // 字の墨の高さ
  const markSize = Math.round(Math.min(L.mark * 3, Math.max(L.mark * 0.6, (L.markInk / Math.max(10, probeInk)) * 100)));
  const markFont = `400 ${markSize}px ${fonts.read}`;
  ctx.font = markFont;
  const mm = ctx.measureText('“');
  const markAscent = mm.actualBoundingBoxAscent || markSize * 0.7;
  const markH = L.markInk;
  const markGap = Math.round(L.sizes[0] * 0.55);

  // 本の行（表紙＋書名・著者）の高さ
  const coverW = L.coverW;
  const coverH = Math.round(coverW * 1.45);
  const ruleGap = Math.round(L.sizes[0] * 0.8);
  const bookGap = 48;
  const bookH = coverH;

  // 一文: 枠に収まるいちばん大きな大きさ
  const fixedH = markH + markGap + ruleGap + 3 + bookGap + bookH;
  const quoteMaxH = (L.bottom - L.top) - fixedH;
  const fit = fitQuote(text, {
    maxWidth: contentW,
    maxHeight: quoteMaxH,
    sizes: L.sizes,
    lineHeight: 1.62,
    measureAt: (size) => {
      const font = `400 ${size}px ${fonts.read}`;
      return (s) => { ctx.font = font; setSpacing(0.02, size); return ctx.measureText(s).width; };
    },
  });
  const quoteH = fit.lines.length * fit.lineHeight;
  const totalH = fixedH + quoteH;
  // 目で見た中心（数学の中心より少し上）に置く。
  let y = L.top + Math.max(0, (L.bottom - L.top - totalH) * 0.44);

  // 1. 引用符
  ctx.font = markFont;
  setSpacing(0, markSize);
  ctx.fillStyle = theme.accent;
  ctx.fillText('“', left + (mm.actualBoundingBoxLeft || 0), y + markAscent); // 墨の左端を本文の左端に
  y += markH + markGap;

  // 2. 一文
  ctx.font = `400 ${fit.size}px ${fonts.read}`;
  setSpacing(0.02, fit.size);
  ctx.fillStyle = theme.ink;
  const ascent = fit.size * 0.88; // 行の箱の上から字の基線まで（明朝のおおよそ）
  const half = (fit.lineHeight - fit.size) / 2;
  fit.lines.forEach((ln, i) => {
    // 行頭の開き括弧（「『（）は、字の墨の左端を本文の左端にそろえる（括弧の前の空きを詰める）。
    ctx.fillText(ln, left - inkLeftOffset(ctx, ln), y + i * fit.lineHeight + half + ascent);
  });
  y += quoteH + ruleGap;

  // 3. 短い線
  ctx.fillStyle = theme.accent;
  ctx.fillRect(left, y, 64, 3);
  y += 3 + bookGap;

  // 4. 表紙＋書名・著者・ページ
  drawCover(ctx, { x: left, y, w: coverW, h: coverH, cover, title, theme, fonts });
  const colX = left + coverW + 40;
  const colW = W - L.margin - colX;
  const titleFont = `600 ${L.titleSize}px ${fonts.read}`;
  ctx.font = titleFont;
  setSpacing(0.02, L.titleSize);
  let titleLines = wrapBalanced(`『${title || '無題'}』`, colW, measurer(ctx, titleFont));
  if (titleLines.length > 2) titleLines = [titleLines[0], ellipsize(ctx, `${titleLines[1]}${titleLines.slice(2).join('')}`, colW)];
  const titleLH = Math.round(L.titleSize * 1.4);
  const metaParts = [String(author || '').trim(), Number.isFinite(page) && page > 0 ? `p.${page}` : ''].filter(Boolean); // 著者・ページ
  const metaLH = Math.round(L.metaSize * 1.5);
  const colH = titleLines.length * titleLH + (metaParts.length ? 12 + metaLH : 0);
  let cy = y + (coverH - colH) / 2;
  ctx.fillStyle = theme.ink;
  titleLines.forEach((tl) => {
    ctx.font = titleFont;
    setSpacing(0.02, L.titleSize);
    ctx.fillText(tl, colX - inkLeftOffset(ctx, tl), cy + titleLH * 0.78);
    cy += titleLH;
  });
  if (metaParts.length) {
    cy += 12;
    const metaFont = `400 ${L.metaSize}px ${fonts.ui}`;
    ctx.font = metaFont;
    setSpacing(0.02, L.metaSize);
    const [authorText, pageText] = [String(author || '').trim(), Number.isFinite(page) && page > 0 ? `p.${page}` : ''];
    let mx = colX;
    if (authorText) {
      const a = ellipsize(ctx, authorText, colW - (pageText ? 120 : 0));
      ctx.fillStyle = theme.ink2;
      ctx.fillText(a, mx, cy + metaLH * 0.72);
      mx += ctx.measureText(a).width + 24;
    }
    if (pageText) {
      ctx.fillStyle = theme.ink3;
      ctx.fillText(pageText, mx, cy + metaLH * 0.72);
    }
  }

  // 5. 下: ロゴ文字とサイト
  const wordSize = format === 'post' ? 32 : 36;
  ctx.font = `700 ${wordSize}px ${fonts.ui}`;
  setSpacing(0.04, wordSize);
  ctx.fillStyle = theme.ink;
  ctx.fillText('Orime', left, L.footerBaseline);
  ctx.font = `400 ${L.metaSize - 2}px ${fonts.ui}`;
  setSpacing(0.02, L.metaSize - 2);
  ctx.fillStyle = theme.ink3;
  ctx.textAlign = 'right';
  ctx.fillText(SITE_LABEL, W - L.margin, L.footerBaseline);
  ctx.textAlign = 'left';

  const blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の書き出しに失敗しました。'))), 'image/png');
    } catch (e) {
      reject(e);
    }
  });
  return { blob, line: text };
}
