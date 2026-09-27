// 🖼 一文カード（シェア画像）の「決めごと」だけを集めた純粋関数。
//
// canvas も DOM も触らない（テストで検証できるように）。描くのは shareCard.js。
//   - clampLine        … 画像に入れる一文を 120 字までに整える（超えたら文の切れ目か「…」）
//   - segmentPhrases   … 日本語を「ここなら改行してよい」まとまりに分ける（文節もどき＋禁則）
//   - wrapBalanced     … まとまり単位で折り返す。いくつもの組み方から wrapCost（行の長さのばらつき・短い行・
//                        文の切れ目・次の文のぶら下がり・短い最後の行）がいちばん小さいものを選ぶ
//   - fitQuote         … 決められた枠に収まる文字サイズを選ぶ（組み方が悪ければ 70% まで小さくしてみる）
//   - orderLineCandidates … 「どの一文にする？」の並び（ページつき → 新しい順）
//   - buildShareText   … 共有の文（『書名』より＋一文＋#Orime＋URL。画像に入れた文だけ）
//   - coverTone        … 表紙の画素から、白い文字が読める落ち着いた地の色を作る
//   - photoPlacement / panView / zoomView … 写真を枠いっぱいに敷く位置（ずらす・拡大しても枠からはみ出さない）
//   - scrimAlpha       … 写真の明るさから、白い文字が読める暗さの幕（黒の透明度）を決める
//   - coverProxyPath   … 外部の表紙を自前の中継（/api/cover-image）経由の URL にする

export const LINE_MAX_CHARS = 120;

// 画像の大きさ（幅はどれも 1080）。
export const FORMATS = {
  story: { w: 1080, h: 1920 }, // ストーリー 9:16
  post: { w: 1080, h: 1350 }, // 投稿 4:5
  square: { w: 1080, h: 1080 }, // 正方形 1:1
};
// photo＝自分の写真の上に白い文字 / sticker＝透明の地（ストーリーの写真に重ねる用）
export const STYLES = ['photo', 'paper', 'night', 'cover', 'sticker'];

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
const KANJI = /[㐀-䶿一-鿿々〆]/;
// 漢字＋送り仮名 1 字＋漢字 は複合語（取り組む・読み終える・書き出す）なので割らない。
// を・は・が・に・で・と・の などの助詞はここに入れない（「本を｜読む」は割ってよい）。
const RENYO = /[りみきちびぎひえけせねべめれ]/;
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
  // 閉じ括弧のすぐ後ろの助詞・送り仮名（「（イシュー）かを」「『本』を」）は括弧から離さない。
  if (/[）)」』】］\]〉》”’]/.test(a) && HIRA.test(b)) return false;
  if (BREAK_AFTER.test(a)) return true;
  if (NO_END.test(b)) return true; // 開き括弧の前
  if (/\s/.test(b)) return false;
  if (HIRA.test(a) && !HIRA.test(b)) {
    if (KANJI.test(b) && RENYO.test(a) && KANJI.test(chars[i - 2] || '')) return false;
    return true; // 「〜は｜投資」のような文節の切れ目
  }
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

// 文の終わり（。！？＋閉じ括弧）で終わっているか。
const SENTENCE_END = /[。！？!?][」』）)”’]*$/u;
// 行の途中にある文の終わり（その後ろに次の文が始まっている）。
const SENTENCE_END_G = /[。！？!?][」』）)”’]*/gu;

// 幅 maxWidth で左から詰める。sentenceMin を渡すと、文の終わり（。！？）の後ろは、
// 行がその割合（幅に対して）まで埋まっていれば、次の文を詰めずに改行する。
function greedy(phrases, maxWidth, measure, sentenceMin = null) {
  const lines = [];
  let cur = '';
  for (const p of phrases) {
    const next = cur + p;
    const sentenceBreak = sentenceMin != null && cur && SENTENCE_END.test(trimEnd(cur))
      && measure(trimEnd(cur)) >= maxWidth * sentenceMin;
    if (!cur || (!sentenceBreak && measure(trimEnd(next)) <= maxWidth)) {
      cur = next;
    } else {
      lines.push(trimEnd(cur));
      cur = p.replace(/^\s+/u, '');
    }
  }
  if (cur) lines.push(trimEnd(cur));
  return lines;
}

// 1 段落の組み方の悪さ（小さいほどよい）。
//   - 行の長さのばらつき（いちばん長い行に対して）
//   - 最後以外の行が、いちばん長い行の 60% 未満（文の終わりで切った行は除く）
//   - 文の終わり（。！？）の直後で改行している … よい（引く）
//   - 行の終わりに次の文の書き出しがぶら下がっている（「作る。どんな／グラフが」）… 短いほど悪い
//   - 最後の行がいちばん長い行の 1/3 未満（「来る。」だけが残る）
export function wrapCost(lines, measure) {
  if (!Array.isArray(lines) || lines.length < 2) return 0;
  const widths = lines.map((l) => measure(l));
  const max = Math.max(...widths, 1e-6);
  let cost = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    const r = widths[i] / max;
    const line = lines[i];
    if (SENTENCE_END.test(line)) {
      cost += 0.3 * (1 - r) ** 2 - 0.6;
      continue;
    }
    cost += (1 - r) ** 2;
    if (r < 0.6) cost += 2;
    let tailStart = -1;
    for (const m of line.matchAll(SENTENCE_END_G)) {
      const end = m.index + m[0].length;
      if (end < line.length) tailStart = end;
    }
    if (tailStart > 0) {
      const tail = line.slice(tailStart).trim();
      if (tail) cost += 0.6 + 1.2 * (1 - Math.min(1, measure(tail) / max));
    }
  }
  if (widths[widths.length - 1] < max / 3) cost += 2;
  return cost;
}

// 1 段落を折り返す。行数はいちばん少ないまま、幅を変えた組み方・文の終わりで切る組み方を
// いくつも作り、wrapCost がいちばん小さいものを選ぶ（行の長さをそろえる＝CSS の text-wrap: balance
// ＋ 文の切れ目で改行する）。戻り値: { lines, cost }
function wrapParagraph(text, maxWidth, measure) {
  if (!text) return { lines: [''], cost: 0 };
  const phrases = [];
  for (const p of segmentPhrases(text)) {
    if (measure(trimEnd(p)) > maxWidth) phrases.push(...splitLongPhrase(p, maxWidth, measure));
    else phrases.push(p);
  }
  const base = greedy(phrases, maxWidth, measure);
  if (base.length <= 1) return { lines: base, cost: 0 };
  // まとまりが 1 行に入らないほど狭めない。
  const lo = Math.max(maxWidth * 0.4, ...phrases.map((p) => measure(trimEnd(p))));
  const seen = new Set();
  let best = null;
  const consider = (lines) => {
    if (lines.length !== base.length) return;
    const key = lines.join('\n');
    if (seen.has(key)) return;
    seen.add(key);
    const cost = wrapCost(lines, measure);
    if (!best || cost < best.cost - 1e-9) best = { lines, cost };
  };
  const STEPS = 32;
  for (let k = 0; k <= STEPS; k += 1) {
    const w = maxWidth - ((maxWidth - lo) * k) / STEPS;
    consider(greedy(phrases, w, measure));
    consider(greedy(phrases, w, measure, 0.3));
    consider(greedy(phrases, w, measure, 0.5));
  }
  return best || { lines: base, cost: wrapCost(base, measure) };
}

// 段落（明示の改行）ごとに折り返した行と、組み方の悪さの合計。
function wrapScored(text, maxWidth, measure) {
  let cost = 0;
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    const r = wrapParagraph(para, maxWidth, measure);
    lines.push(...r.lines);
    cost += r.cost;
  }
  return { lines, cost };
}

// 段落（明示の改行）ごとに折り返した行の列。
export function wrapBalanced(text, maxWidth, measure) {
  return wrapScored(text, maxWidth, measure).lines;
}

// 行の配列の最後が 1〜2 字だけになっていないか（テスト・確認用）。
export function hasOrphan(lines) {
  if (lines.length < 2) return false;
  return Array.from(lines[lines.length - 1]).length <= 2;
}

// 文字を小さくする重み（収まるいちばん大きな大きさから 25% 小さくすると 2＝短い行 1 つ分）。
const SIZE_WEIGHT = 8;
// 組み方をよくするために小さくしてよいのは、収まるいちばん大きな大きさの 70% まで。
const MIN_SIZE_RATIO = 0.7;

// 枠（maxWidth × maxHeight）に収まる文字サイズと行。
// 収まるいちばん大きな大きさから 70% までの大きさを試し、「組み方の悪さ（wrapCost）＋小さくした分」が
// いちばん小さいものを選ぶ（「分析の前に／…作る。どんな／」のように短い行やぶら下がりが出るなら、
// 少し小さくして文の切れ目で改行する）。
// measureAt(size) は「その大きさの文字の幅を返す関数」を返す。
export function fitQuote(text, { maxWidth, maxHeight, sizes, lineHeight = 1.6, measureAt }) {
  // 短い一文は、少し小さくしてでも 1 行に収まるなら 1 行で見せる
  // （「チームの／勝利が最優先。」のように、2 行に割ると不自然に切れるのを防ぐ）。
  if (sizes.length > 0 && !String(text || '').includes('\n')) {
    for (const size of sizes) {
      if (size < sizes[0] * 0.7) break;
      const measure = measureAt(size);
      const lines = wrapBalanced(text, maxWidth, measure);
      if (lines.length === 1 && size * lineHeight <= maxHeight) {
        return { size, lines, lineHeight: size * lineHeight };
      }
    }
  }
  let last = null;
  let firstSize = null;
  let best = null;
  for (const size of sizes) {
    if (firstSize != null && size < firstSize * MIN_SIZE_RATIO) break;
    const measure = measureAt(size);
    const { lines, cost } = wrapScored(text, maxWidth, measure);
    const h = lines.length * size * lineHeight;
    last = { size, lines, lineHeight: size * lineHeight };
    if (h > maxHeight) continue;
    if (firstSize == null) firstSize = size;
    const score = cost + SIZE_WEIGHT * (1 - size / firstSize);
    if (!best || score < best.score - 1e-9) best = { ...last, score };
    if (cost <= 0) break; // 直すところの無い組み方＝これより小さくする理由が無い
  }
  if (!best) return last;
  const { score, ...fit } = best; // eslint-disable-line no-unused-vars
  return fit;
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

// ---------------------------------------------------------------- 写真

// 写真（pw×ph）を W×H の枠いっぱいに敷く位置。zoom は 1〜4（1＝ちょうど覆う）、
// panX / panY は -1〜1（はみ出している分の範囲で、どこまでずらすか。0＝中央）。
export function photoPlacement({ pw, ph, W, H, panX = 0, panY = 0, zoom = 1 }) {
  const z = Math.min(4, Math.max(1, Number(zoom) || 1));
  const s = Math.max(W / pw, H / ph) * z;
  const dw = pw * s;
  const dh = ph * s;
  const maxX = Math.max(0, (dw - W) / 2);
  const maxY = Math.max(0, (dh - H) / 2);
  const cx = Math.min(1, Math.max(-1, Number(panX) || 0));
  const cy = Math.min(1, Math.max(-1, Number(panY) || 0));
  return { x: (W - dw) / 2 + cx * maxX, y: (H - dh) / 2 + cy * maxY, w: dw, h: dh, maxX, maxY };
}

// 指で dx, dy（画像の座標）だけずらした後の表示。枠からはみ出さない範囲に収める。
export function panView(view, dx, dy, dims) {
  const { maxX, maxY } = photoPlacement({ ...dims, ...view });
  const clamp = (v) => Math.min(1, Math.max(-1, v));
  return {
    ...view,
    panX: maxX > 0 ? clamp((view.panX || 0) + dx / maxX) : 0,
    panY: maxY > 0 ? clamp((view.panY || 0) + dy / maxY) : 0,
  };
}

export function zoomView(view, factor) {
  const zoom = Math.min(4, Math.max(1, (view.zoom || 1) * factor));
  return { ...view, zoom };
}

// 文字の後ろの写真の明るさ（相対輝度 0〜1・明るい画素寄りの値）から、黒い幕の濃さを決める。
// 幕をかけた後の明るさが 0.18 以下（白い文字と 4.5:1 以上）になるように。最低 0.3・最大 0.82。
export function scrimAlpha(luminance) {
  const L = Math.min(1, Math.max(0, Number(luminance) || 0));
  const need = L > 0.18 ? 1 - 0.18 / L : 0;
  return Math.round(Math.min(0.82, Math.max(0.3, need)) * 100) / 100;
}

// 画素（[r,g,b] の配列）の相対輝度の、明るいほうから 15% の値（白い文字にかかりやすい明るい部分を基準に）。
export function brightLuminance(pixels) {
  if (!Array.isArray(pixels) || pixels.length === 0) return 0;
  const lums = pixels.map(relLum).sort((a, b) => a - b);
  return lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.85))];
}

// ---------------------------------------------------------------- 表紙の中継

// 表紙を canvas に描ける URL（の path）にする。data: / blob: / 同じサイトはそのまま、
// 外部は /api/cover-image?url=…（http は https に）。使えない URL は null。
export function coverProxyPath(url, origin = '') {
  const u = String(url || '').trim();
  if (!u) return null;
  if (/^(data:image\/|blob:)/i.test(u)) return { direct: true, src: u };
  if (u.startsWith('/') && !u.startsWith('//')) return { direct: true, src: u };
  const https = u.replace(/^http:/i, 'https:');
  if (!/^https:\/\//i.test(https)) return null;
  try {
    if (origin && new URL(https).origin === origin) return { direct: true, src: https };
  } catch {
    return null;
  }
  return { direct: false, src: `/api/cover-image?url=${encodeURIComponent(https)}` };
}

// ---------------------------------------------------------------- 傍線と付箋（カードの印）

// 文字列から決まる 32bit の種（同じメモは毎回同じ線になる）。
export function seedFrom(str) {
  let h = 2166136261;
  for (const ch of String(str || '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 小さな乱数（mulberry32）。種が同じなら同じ並び。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 手で引いた傍線（マーカーの 1 本線）の輪郭。x0〜x1 の下、基準の高さ y に、太さ weight。
// ゆるい揺れ・わずかな傾き・両端の細り・少しのはみ出しを、種から決める。
// 戻り値: { top: [[x,y]…], bottom: [[x,y]…], capStart: [x,y,r], capEnd: [x,y,r] }（上の縁を左→右、下の縁を右→左で結ぶ）
export function underlineStroke({ x0, x1, y, weight, seed }) {
  const rnd = mulberry32(seed);
  const len = Math.max(1, x1 - x0);
  const over0 = weight * (0.4 + rnd() * 0.9); // 書き出しのはみ出し
  const over1 = weight * (0.8 + rnd() * 1.6); // 書き終わりのはみ出し（少し長め）
  const sx = x0 - over0;
  const ex = x1 + over1;
  const tilt = (rnd() - 0.5) * weight * 0.9; // 全体の傾き（右端の上下）
  const lift = -(0.3 + rnd() * 0.7) * weight * 0.55; // 書き終わりが少し上がる
  const bow = (rnd() < 0.7 ? 1 : -1) * weight * (0.25 + rnd() * 0.45); // 全体のゆるい弧（多くは下にふくらむ）
  const f1 = 1.2 + rnd() * 1.4; const p1 = rnd() * Math.PI * 2; const a1 = weight * (0.18 + rnd() * 0.16);
  const f2 = 3.1 + rnd() * 2.4; const p2 = rnd() * Math.PI * 2; const a2 = weight * (0.06 + rnd() * 0.07);
  const w1 = 1.5 + rnd() * 1.5; const wp = rnd() * Math.PI * 2;
  const N = Math.max(24, Math.round(len / 12));
  const top = [];
  const bottom = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const x = sx + (ex - sx) * t;
    const cy = y + tilt * t + lift * t ** 3 + bow * Math.sin(Math.PI * t)
      + a1 * Math.sin(t * Math.PI * f1 + p1) + a2 * Math.sin(t * Math.PI * f2 + p2);
    // 太さ: 書き出しは素早く太く、終わりにかけて細る（筆圧）
    const taper = Math.min(1, t / 0.06) * Math.min(1, (1 - t) / 0.16);
    const w = weight * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.08))) * (0.82 + 0.18 * Math.sin(t * Math.PI * w1 + wp)) * Math.max(0.18, taper);
    top.push([x, cy - w / 2]);
    bottom.push([x, cy + w / 2]);
  }
  const mid = (arr, k) => arr[k];
  const r0 = Math.abs(mid(bottom, 0)[1] - mid(top, 0)[1]) / 2;
  const rN = Math.abs(mid(bottom, N)[1] - mid(top, N)[1]) / 2;
  return {
    top,
    bottom: bottom.reverse(),
    capStart: [top[0][0], (top[0][1] + bottom[bottom.length - 1][1]) / 2, r0],
    capEnd: [top[N][0], (top[N][1] + bottom[0][1]) / 2, rN],
  };
}

// 付箋の高さ（本の上＝0・下＝1）。ページが無いメモは null（付箋を出さない）。
// 総ページが分からないときは、分かっているメモのページの最大か、このページ＋50 の大きいほう。
export function tabPosition(page, totalPages, knownMaxPage = 0) {
  const p = Number(page);
  if (!Number.isFinite(p) || p <= 0) return null;
  const total = Number(totalPages) > 0 && Number(totalPages) >= p
    ? Number(totalPages)
    : Math.max(Number(knownMaxPage) || 0, p + 50);
  return Math.min(1, Math.max(0, (p - 1) / Math.max(1, total - 1)));
}
