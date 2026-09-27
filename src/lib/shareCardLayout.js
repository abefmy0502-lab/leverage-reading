// 🖼 一文カード（シェア画像）の「決めごと」だけを集めた純粋関数。
//
// canvas も DOM も触らない（テストで検証できるように）。描くのは shareCard.js。
//   - clampLine        … 画像に入れる一文を 120 字までに整える（超えたら文の切れ目か「…」）
//   - segmentPhrases   … 日本語を「ここなら改行してよい」まとまりに分ける（文節もどき＋禁則）
//   - wrapBalanced     … まとまり単位で折り返し、行の長さをそろえる（最後の行が 1〜2 字にならない）
//   - fitQuote         … 決められた枠に収まる、いちばん大きな文字サイズを選ぶ
//   - orderLineCandidates … 「どの一文にする？」の並び（ページつき → 新しい順）
//   - buildShareText   … 共有の文（『書名』より＋一文＋#Orime＋URL。画像に入れた文だけ）
//   - coverTone        … 表紙の画素から、白い文字が読める落ち着いた地の色を作る

export const LINE_MAX_CHARS = 120;

// 画像の大きさ（幅はどちらも 1080）。
export const FORMATS = {
  story: { w: 1080, h: 1920 }, // ストーリー 9:16
  post: { w: 1080, h: 1350 }, // 投稿 4:5
};
export const STYLES = ['paper', 'night', 'cover'];

// ---------------------------------------------------------------- 一文を整える

// 空白を整え、120 字を超えたら切る。文の切れ目（。！？）が後ろ半分にあればそこで止め、
// 無ければ 119 字＋「…」。明示の改行は段落として残す（連続した改行は 1 つに）。
export function clampLine(text, max = LINE_MAX_CHARS) {
  const s = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t　]+/g, (m) => (m.includes('　') ? '　' : ' '))
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  const chars = Array.from(s);
  if (chars.length <= max) return { text: s, trimmed: false };
  const head = chars.slice(0, max);
  let cut = -1;
  for (let i = head.length - 1; i >= Math.floor(max * 0.5); i -= 1) {
    if (/[。！？!?]/.test(head[i])) { cut = i + 1; break; }
  }
  if (cut > 0) return { text: head.slice(0, cut).join('').trim(), trimmed: true };
  return { text: `${chars.slice(0, max - 1).join('').replace(/[、。，．,.\s]+$/u, '')}…`, trimmed: true };
}

// ---------------------------------------------------------------- 改行位置

const HIRA = /[ぁ-ゟ]/;
const LATIN = /[A-Za-z0-9]/;
const LATIN_JOIN = /[A-Za-z0-9.,'’%\-+/:&]/; // 英単語・数字のひとかたまり
// 行頭に来てはいけない字（閉じ括弧・句読点・小さいかな・長音）
const NO_START = /[、。，．,.！？!?：:；;）)」』】］\]〉》”’…‥・ーぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々ゝゞヽヾ]/;
// 行末に来てはいけない字（開き括弧）
const NO_END = /[（(「『【［[〈《“‘]/;
// この字の後ろで区切ってよい（句読点・閉じ括弧・空白）
const BREAK_AFTER = /[、。，．！？!?）)」』】］\]〉》”’…\s]/;

// 文字 i の前（i-1 と i の間）で改行してよいか。
function canBreakBefore(chars, i) {
  if (i <= 0 || i >= chars.length) return false;
  const a = chars[i - 1];
  const b = chars[i];
  if (NO_START.test(b) || NO_END.test(a)) return false;
  if (LATIN_JOIN.test(a) && LATIN_JOIN.test(b)) return false; // 英単語・数字の途中
  if (BREAK_AFTER.test(a)) return true;
  if (NO_END.test(b)) return true; // 開き括弧の前
  if (/\s/.test(b)) return false;
  if (HIRA.test(a) && !HIRA.test(b)) return true; // 「〜は｜投資」のような文節の切れ目
  if (LATIN.test(a) !== LATIN.test(b)) return true; // 英数字と和文の境目
  return false;
}

// 改行してよい位置で区切ったまとまりの列（つなげると元の文）。
export function segmentPhrases(text) {
  const chars = Array.from(String(text || ''));
  const out = [];
  let cur = '';
  chars.forEach((ch, i) => {
    if (cur && canBreakBefore(chars, i)) { out.push(cur); cur = ''; }
    cur += ch;
  });
  if (cur) out.push(cur);
  return out;
}

// まとまりが 1 行に入らないときだけ、禁則を守って文字で切る。
function splitLongPhrase(phrase, maxWidth, measure) {
  const chars = Array.from(phrase);
  const parts = [];
  let cur = '';
  chars.forEach((ch, i) => {
    const next = cur + ch;
    if (cur && measure(next) > maxWidth && !NO_START.test(ch) && !NO_END.test(chars[i - 1] || '')) {
      parts.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  });
  if (cur) parts.push(cur);
  return parts;
}

// 行末の空白は幅に数えない（英語の単語間）。
const trimEnd = (s) => s.replace(/\s+$/u, '');

function greedy(phrases, maxWidth, measure) {
  const lines = [];
  let cur = '';
  for (const p of phrases) {
    const next = cur + p;
    if (!cur || measure(trimEnd(next)) <= maxWidth) {
      cur = next;
    } else {
      lines.push(trimEnd(cur));
      cur = p.replace(/^\s+/u, '');
    }
  }
  if (cur) lines.push(trimEnd(cur));
  return lines;
}

// 1 段落を折り返す。行数が変わらない範囲で幅を狭め、行の長さをそろえる（CSS の text-wrap: balance）。
function wrapParagraph(text, maxWidth, measure) {
  if (!text) return [''];
  const phrases = [];
  for (const p of segmentPhrases(text)) {
    if (measure(trimEnd(p)) > maxWidth) phrases.push(...splitLongPhrase(p, maxWidth, measure));
    else phrases.push(p);
  }
  const base = greedy(phrases, maxWidth, measure);
  if (base.length <= 1) return base;
  let lo = maxWidth * 0.4;
  let hi = maxWidth;
  let best = base;
  for (let k = 0; k < 14; k += 1) {
    const mid = (lo + hi) / 2;
    // 狭めた幅でも、まとまりが 1 行に入らないなら狭めすぎ。
    const fits = phrases.every((p) => measure(trimEnd(p)) <= mid);
    const lines = fits ? greedy(phrases, mid, measure) : null;
    if (lines && lines.length === base.length) { best = lines; hi = mid; } else { lo = mid; }
  }
  return best;
}

// 段落（明示の改行）ごとに折り返した行の列。
export function wrapBalanced(text, maxWidth, measure) {
  return String(text || '').split('\n').flatMap((para) => wrapParagraph(para, maxWidth, measure));
}

// 行の配列の最後が 1〜2 字だけになっていないか（テスト・確認用）。
export function hasOrphan(lines) {
  if (lines.length < 2) return false;
  return Array.from(lines[lines.length - 1]).length <= 2;
}

// 枠（maxWidth × maxHeight）に収まる、いちばん大きな文字サイズと行。
// measureAt(size) は「その大きさの文字の幅を返す関数」を返す。
export function fitQuote(text, { maxWidth, maxHeight, sizes, lineHeight = 1.6, measureAt }) {
  let last = null;
  for (const size of sizes) {
    const measure = measureAt(size);
    const lines = wrapBalanced(text, maxWidth, measure);
    const h = lines.length * size * lineHeight;
    last = { size, lines, lineHeight: size * lineHeight };
    if (h <= maxHeight) return last;
  }
  return last;
}

// ---------------------------------------------------------------- 一文の候補

// 本文のあるメモだけ。ページ番号つき（＝本からの抜き書き）を先に、それぞれ新しい順。
// preferId があれば先頭に（メモの「…」→「この一文をシェア」から開いたとき）。
export function orderLineCandidates(memos, preferId = null) {
  const list = (Array.isArray(memos) ? memos : []).filter((m) => m && String(m.text || '').trim());
  const time = (m) => {
    const t = Date.parse(m.createdAt || m.created_at || '');
    return Number.isFinite(t) ? t : 0;
  };
  const hasPage = (m) => Number.isFinite(m.pageNumber) && m.pageNumber > 0;
  const sorted = [...list].sort((a, b) => (Number(hasPage(b)) - Number(hasPage(a))) || (time(b) - time(a)));
  if (preferId) {
    const i = sorted.findIndex((m) => m.id === preferId);
    if (i > 0) sorted.unshift(sorted.splice(i, 1)[0]);
  }
  return sorted;
}

// ---------------------------------------------------------------- 共有の文

export function buildShareText({ title, line, siteUrl }) {
  const parts = [];
  const t = String(title || '').trim();
  if (t) parts.push(`『${t}』より`);
  const l = String(line || '').trim();
  if (l) parts.push(l);
  parts.push('#Orime');
  const url = String(siteUrl || '').trim();
  if (url) parts.push(url);
  return parts.join('\n');
}

// 保存するファイル名（書名は入れない＝端末の写真アプリに書名が残らない・記号の問題も避ける）。
export function shareFilename({ format = 'story', style = 'paper', now = new Date() } = {}) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `orime-${format}-${style}-${stamp}.png`;
}

// ---------------------------------------------------------------- 表紙の色

function relLum([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl([r, g, b]) {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0));
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue = (p, q, t) => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
}

// 表紙の画素（[r,g,b] の配列）から地の色を作る。色みの強い画素を重く数えた平均を、
// 落ち着いた暗さ（白い文字と 7:1 以上）まで沈める。画素が無ければ null。
export function coverTone(pixels) {
  if (!Array.isArray(pixels) || pixels.length === 0) return null;
  let r = 0; let g = 0; let b = 0; let w = 0;
  for (const p of pixels) {
    const [, s, l] = rgbToHsl(p);
    // 白い余白・黒い文字は色の手がかりにならないので軽く。
    const weight = 0.15 + s * (1 - Math.abs(l - 0.5) * 1.6);
    const ww = Math.max(0.05, weight);
    r += p[0] * ww; g += p[1] * ww; b += p[2] * ww; w += ww;
  }
  const avg = [r / w, g / w, b / w];
  let [h, s, l] = rgbToHsl(avg);
  s = Math.min(0.5, Math.max(0.12, s));
  l = Math.min(l, 0.26);
  let rgb = hslToRgb([h, s, l]);
  for (let k = 0; k < 20 && contrastRatio(rgb, [255, 255, 255]) < 7; k += 1) {
    l *= 0.9;
    rgb = hslToRgb([h, s, l]);
  }
  return rgb;
}

export const rgbCss = (rgb) => `rgb(${rgb.map((v) => Math.round(v)).join(', ')})`;
