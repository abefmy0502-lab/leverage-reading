// ✍️ 共有の画像に、自分で入れる「言葉」の層（2026-10-01 オーナー要望「気に入った言葉をおしゃれに画面上に入力して反映できたら」）。
//
// メモの一文（記録・一文の見せ方）とは別の層。メモに無い言葉（本の帯の言葉・自分の一言）を好きな場所に置く。
// 一文と両方あってもよい（重ねたくなければ「表示する項目」で一文を隠す）。
// canvas も DOM も触らない純粋関数だけ（テストで確かめられるように）。描くのは shareCard.js の drawPhrase。
//   - cleanPhrase       … 入れた言葉を整える（空白・改行・80 字まで）
//   - newPhrase         … 最初の置き方（上のほうの中央・明朝の引用）
//   - phraseFrame       … 言葉を置いてよい範囲（SNS で切られない安全な枠＝記録と同じ recordFrame・下はロゴの上の空きまで・透明は記録の上の言葉の場所だけ）
//   - phraseLayout      … 大きさ・改行（文節の切れ目で）・箱の位置。枠に入らなければ小さくし、はみ出さない場所に寄せる
//   - phraseColors      … 文字の色（写真・夜・表紙の色・透明は白、紙は墨。1 タップで入れ替え）

import { wrapBalanced, segmentPhrases } from './shareCardLayout';
import { recordFrame, logoBox, magazineLogoBox } from './shareOverlay';

export const PHRASE_MAX = 80;
export const PHRASE_STYLES = ['mincho', 'bold', 'hand', 'band'];
export const PHRASE_STYLE_LABELS = { mincho: '明朝の引用', bold: '太いゴシック', hand: '手書き風', band: '白抜きの帯' };
// 大きさの倍率（指でつまむ・下の「大きさ」で変える）。
export const PHRASE_SCALE_MIN = 0.6;
export const PHRASE_SCALE_MAX = 1.8;

// 形ごとの文字の大きさ（幅 1080 のとき・倍率 1）と行間・字間・箱の内側の余白（文字の大きさに対する割合）。
const STYLE_METRICS = {
  mincho: { size: 64, lineHeight: 1.6, spacing: 0.06, padX: 0, padY: 0, underline: 0 }, // 傍線は 2026-10-08 にやめた
  bold: { size: 78, lineHeight: 1.22, spacing: 0.02, padX: 0, padY: 0, underline: 0 },
  hand: { size: 70, lineHeight: 1.45, spacing: 0.02, padX: 0, padY: 0, underline: 0 },
  band: { size: 54, lineHeight: 1.4, spacing: 0.04, padX: 0.6, padY: 0.42, underline: 0 },
};
export const phraseMetrics = (style) => STYLE_METRICS[style] || STYLE_METRICS.mincho;

// 入れた言葉を整える: 前後の空白を取り、連続した空白は 1 つ・改行は 1 つまで（2 行に分けたいとき用）・80 字まで。
export function cleanPhrase(text) {
  const s = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t　 ]+/g, (m) => (m.includes('　') ? '　' : ' '))
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
  return Array.from(s).slice(0, PHRASE_MAX).join('');
}

export const clampScale = (v) => Math.min(PHRASE_SCALE_MAX, Math.max(PHRASE_SCALE_MIN, Number(v) || 1));

// 最初の置き方: 横は中央、縦は上から 24%（記録・一文は下にあるので重ならない）。
export function newPhrase(text = '') {
  return { text: cleanPhrase(text), style: 'mincho', x: 0.5, y: 0.24, scale: 1, invert: false };
}

// 透明（ステッカー）: 言葉は記録・一文の上に、言葉の高さの場所を取って置く（重ねない・2026-10-01 ui-critic）。
// 言葉の場所と記録の間は 56。記録の塊は「上の余白 72＋言葉の高さ＋56」から始まる。
export const STICKER_PAD = 72;
export const PHRASE_STICKER_GAP = 56;
// 雑誌の重ね方: 引用のまとまり（引用・続きの文・本のカード）の下端から言葉までの空き（幅 1080 のとき）。
export const PHRASE_MAGAZINE_GAP = 48;
// 透明のとき、言葉のために上に足す高さ（言葉が無ければ 0）。
export function stickerPhraseReserve(phraseH) {
  return phraseH > 0 ? Math.ceil(phraseH) + PHRASE_STICKER_GAP : 0;
}

// 言葉を置いてよい範囲（画像の座標）。投稿・ストーリーは記録と同じ安全な枠（ストーリーは上下 270・投稿は左右 80）。
// 透明は左右 72・上 72 から言葉の高さ（phraseH）まで＝記録の塊には入らない（phraseH が無ければ下 72 まで）。
// magazine（雑誌の重ね方）は、右上のロゴとひとことの下から（言葉でロゴを隠せない・2026-10-09）。
export function phraseFrame({ W = 1080, H = 1350, format = 'post', sticker = false, phraseH = 0, magazine = false } = {}) {
  if (sticker) {
    const top = STICKER_PAD;
    return { left: STICKER_PAD, right: W - STICKER_PAD, top, bottom: phraseH > 0 ? top + phraseH : Math.max(top * 2, H - STICKER_PAD) };
  }
  if (format !== 'post' && format !== 'story') {
    return { left: 72, right: W - 72, top: 72, bottom: Math.max(144, H - 72) };
  }
  const f = recordFrame(format);
  const sx = W / f.W;
  const sy = H / f.H;
  // 下はロゴの上の空きまで（言葉でロゴを隠せない・2026-10-05「ロゴは必ず入る」）。
  const bottom = Math.min(f.safeBottom, logoBox(format).clearTop);
  const top = magazine ? Math.max(f.safeTop, magazineLogoBox(format).clearBottom) : f.safeTop;
  return { left: f.margin * sx, right: W - f.margin * sx, top: top * sy, bottom: bottom * sy };
}

// 箱（中心 cx, cy・幅 w・高さ h）を枠の中に収める中心。枠より大きければ枠の中央。
export function clampPhraseCenter({ cx, cy, w, h }, frame) {
  const clampAxis = (c, size, lo, hi) => (size >= hi - lo ? (lo + hi) / 2 : Math.min(hi - size / 2, Math.max(lo + size / 2, c)));
  return { cx: clampAxis(cx, w, frame.left, frame.right), cy: clampAxis(cy, h, frame.top, frame.bottom) };
}

// 描く文（明朝の引用は「」で包む。すでに括弧で始まる言葉は包まない）。
export function phraseDisplayText(phrase) {
  const t = cleanPhrase(phrase?.text);
  if (!t) return '';
  if ((phrase?.style || 'mincho') === 'mincho' && !/^[「『“"]/.test(t)) return `「${t}」`;
  return t;
}

// 中央にそろえる言葉は、行の長さもそろえる（CSS の text-wrap: balance と同じ考え）:
// 同じ行数のまま入るいちばん狭い幅で組み直す（「問いの質が、答えの質を／決める。」→「問いの質が、／答えの質を決める。」）。
export function balanceLines(text, maxWidth, measure) {
  const base = wrapBalanced(text, maxWidth, measure);
  if (base.length < 2) return base;
  // 文節（改行してよいまとまり）が 1 行に入らないほど狭めない（語の途中で割らない）。
  const longest = Math.max(0, ...segmentPhrases(text).map((p) => measure(p.trim())));
  let lo = Math.max(maxWidth * 0.3, Math.min(maxWidth, longest));
  let hi = maxWidth;
  let best = base;
  for (let i = 0; i < 10; i += 1) {
    const mid = (lo + hi) / 2;
    const lines = wrapBalanced(text, mid, measure);
    if (lines.length <= base.length && lines.every((l) => measure(l) <= mid + 0.5)) { best = lines; hi = mid; } else { lo = mid; }
  }
  // 読点・句点の後ろで改行できるなら、そちらを選ぶ（「答えの／質を決める。」より「問いの質が、／答えの質を決める。」）。
  // 同じ行数で、いちばん長い行がそろえた幅の 1.2 倍までに収まるときだけ。
  if (!text.includes('\n')) {
    const clauses = text.match(/[^、。！？!?]+[、。！？!?」』）)]*|[、。！？!?」』）)]+/gu) || [];
    if (clauses.length > 1) {
      const limit = Math.min(maxWidth, Math.max(...best.map((l) => measure(l))) * 1.2);
      const lines = [];
      let cur = '';
      for (const c of clauses) {
        if (cur && measure(cur + c) > limit) { lines.push(cur); cur = c; } else { cur += c; }
      }
      if (cur) lines.push(cur);
      if (lines.length === best.length && lines.every((l) => measure(l) <= limit + 0.5)) return lines;
      // 行数が合わないとき（節が 1 行に入らない大きさ）は、節ごとに組んで並べる。行数が増えなければそちら
      // （「問いの／質が、答えの／質を決める。」→「問いの質が、／答えの質を／決める。」・2026-10-05 第 2 回 ui-critic）。
      const perClause = clauses.flatMap((c) => wrapBalanced(c, maxWidth, measure));
      if (perClause.length <= best.length && perClause.every((l) => measure(l) <= maxWidth + 0.5)) return perClause;
    }
  }
  return best;
}

// 大きさ・改行・箱。measureAt(size) は「その大きさの文字の幅を返す関数」を返す（canvas の measureText・テストでは字数×大きさ）。
// 戻り値: { text, lines, size, lineHeight, w, h, cx, cy, x0, y0, padX, padY, underlineH, style } （画像の座標・箱は余白と傍線を含む）
// 箱が枠に入らないときは、入るまで小さくする（文字の大きさの下限 28）。
// below（雑誌の重ね方・言葉をまだ動かしていないとき）: 引用・続きの文・本のカードの下端（画像の座標）。
//   言葉はその下 PHRASE_MAGAZINE_GAP（幅 1080 のとき）から置き、引用に重ねない（2026-10-10 ui-critic）。
//   入らなければ、その下の空きに入るまで小さくする。指で動かした言葉（moved）は今までどおり置いた場所に。
export function phraseLayout(phrase, { W = 1080, H = 1350, format = 'post', sticker = false, magazine = false, below = null, measureAt } = {}) {
  const text = phraseDisplayText(phrase);
  if (!text || typeof measureAt !== 'function') return null;
  const style = PHRASE_STYLES.includes(phrase.style) ? phrase.style : 'mincho';
  const m = phraseMetrics(style);
  // 透明は高さが中身で決まるので、大きさは幅だけで決め（高さは 1600 まで）、決まった高さをそのまま言葉の場所にする。
  let frame = phraseFrame({ W, H: sticker ? STICKER_PAD * 2 + 1600 * (W / 1080) : H, format, sticker, magazine });
  const underBlock = magazine && !sticker && !phrase.moved && Number.isFinite(below);
  if (underBlock) frame = { ...frame, top: Math.min(frame.bottom - 28, Math.max(frame.top, below + PHRASE_MAGAZINE_GAP * (W / 1080))) };
  const frameW = frame.right - frame.left;
  const frameH = frame.bottom - frame.top;
  const k = W / 1080;
  let size = Math.round(m.size * clampScale(phrase.scale) * k);
  let out = null;
  for (let guard = 0; guard < 40; guard += 1) {
    const padX = Math.round(size * m.padX);
    const padY = Math.round(size * m.padY);
    const maxWidth = Math.max(size * 2, frameW - padX * 2);
    const measure = measureAt(size);
    const lines = wrapBalanced(text, maxWidth, measure);
    const lineHeight = Math.round(size * m.lineHeight);
    const textW = Math.max(...lines.map((l) => measure(l)), 0);
    const underlineH = m.underline ? Math.round(size * m.underline) : 0;
    const w = Math.ceil(textW + padX * 2);
    const h = Math.ceil(lines.length * lineHeight + padY * 2 + underlineH);
    out = { text, lines, size, lineHeight, w, h, padX, padY, underlineH, style, maxWidth, measure };
    const fits = w <= frameW + 0.5 && h <= frameH + 0.5 && lines.every((l) => measure(l) <= maxWidth + 0.5);
    if (fits || size <= 28) break;
    size = Math.max(28, Math.round(size * 0.92));
  }
  // 大きさが決まってから、行の長さをそろえる（同じ行数のまま狭める＝箱は小さくなるだけなので枠に入ったまま）。
  {
    const { maxWidth, measure, ...rest } = out;
    const lines = balanceLines(text, maxWidth, measure);
    const textW = Math.max(...lines.map((l) => measure(l)), 0);
    out = { ...rest, lines, w: Math.ceil(textW + rest.padX * 2) };
  }
  if (sticker) frame = phraseFrame({ W, format, sticker, phraseH: out.h });
  const want = underBlock
    ? { cx: 0.5 * W, cy: frame.top + out.h / 2 }
    : { cx: (Number.isFinite(phrase.x) ? phrase.x : 0.5) * W, cy: (Number.isFinite(phrase.y) ? phrase.y : 0.24) * H };
  const { cx, cy } = clampPhraseCenter({ ...want, w: out.w, h: out.h }, frame);
  return { ...out, cx, cy, x0: cx - out.w / 2, y0: cy - out.h / 2, frame };
}

// 画像の座標の中心から、保存する置き方（0〜1）へ。枠からはみ出さないように寄せてから割る。
export function phrasePositionFrom({ cx, cy }, layout, { W, H }) {
  const c = layout ? clampPhraseCenter({ cx, cy, w: layout.w, h: layout.h }, layout.frame) : { cx, cy };
  // moved: 指・矢印キーで動かした印（雑誌の重ね方は、動かすまで引用の下に置く）。
  return { x: Math.round((c.cx / W) * 10000) / 10000, y: Math.round((c.cy / H) * 10000) / 10000, moved: true };
}

// 文字の色（自動）: 写真・夜・表紙の色・透明＝白い文字、紙＝墨の文字。
// 白抜きの帯（band）は、どの地でも暗い帯に白い文字（白抜き）。
// invert（「文字を黒にする」「帯を明るくする」）が効くのは、写真の上の文字と帯だけ
// （紙の墨・夜や表紙の色の白を入れ替えると読めないので、画面にも入れ替えを出さない）。
// 戻り値: { ink: 'light' | 'dark', band: 'light' | 'dark' | null }
export function phraseCanInvert({ ground = 'photo', style = 'mincho' } = {}) {
  return style === 'band' || ground === 'photo';
}
export function phraseColors({ ground = 'photo', style = 'mincho', invert = false } = {}) {
  let light = style === 'band' ? true : ground !== 'paper';
  if (invert && phraseCanInvert({ ground, style })) light = !light;
  return { ink: light ? 'light' : 'dark', band: style === 'band' ? (light ? 'dark' : 'light') : null };
}
