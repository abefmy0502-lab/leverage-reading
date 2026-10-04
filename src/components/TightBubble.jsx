// 💬 文字に沿って縮む吹き出し（相談の「あなたの相談」）。
//
// 折り返した文は、いちばん長い行より右が空いたまま（最大幅 85% のまま）になる。
// 描く前（useLayoutEffect）に文字の行の箱（Range.getClientRects）を測り、
// 幅を「いちばん長い行＋左右の内側余白」に詰める。測るのは文と使える幅が変わったときだけ。
// 詰めたことで折り返しが変わった（行が増えた）ときは、詰めずに元の幅へ戻す。
//
// 文節での折り返し: iOS の Safari は word-break: auto-phrase を知らないので、
// BudouX で文節の切れ目に <wbr> を入れ、word-break: keep-all で切れ目でだけ折り返す
// （App.jsx の書名・相談の相談例と同じ）。1 文節が行より長いときだけ中で折る。

import { useLayoutEffect, useRef } from 'react';
import { loadDefaultJapaneseParser } from 'budoux';

let parser = null;
const getParser = () => {
  if (!parser) parser = loadDefaultJapaneseParser();
  return parser;
};

// 文節の中の半角の空き（「結論から 3 行で」の「3 行」・「1on1 は」）は、word-break: keep-all でも
// 折り返しの機会になり「3 ／行で送る」と数と助数詞が割れていた（2026-10-04）。日本語を含む短い文節の
// 内側の空きだけを、折り返さない空き（U+00A0）にする（文節の頭と終わりの空き・英文だけの文節はそのまま）。
const CJK = /[぀-ヿ㐀-鿿＀-￯]/;
const MAX_GLUED_PHRASE = 20;
export function glueInnerSpaces(phrase) {
  const s = String(phrase ?? '');
  if (!s.includes(' ') || !CJK.test(s)) return s;
  const m = /^(\s*)(.*?)(\s*)$/s.exec(s);
  const body = m[2];
  if (!body.includes(' ') || [...body].length > MAX_GLUED_PHRASE) return s;
  return m[1] + body.replace(/ /g, ' ') + m[3];
}

// ── 文字の種類の切れ目（書名などの長い 1 文節の中で折り返してよい所・2026-10-04）
// BudouX は「アウトプット大全」「エリック・シュミット」を 1 つの文節にするので、狭い列では語の途中
// （「アウトプット大／全」）で割れるか、… で切るしかなかった。7 字以上の文節だけ、次の切れ目を足す:
//   カタカナ↔漢字・英字/数字↔日本語・「・」の後ろ。
//   ひらがなの前後には足さない（漢字→ひらがなは送りがな「動／かす」、ひらがな→漢字は「やり／抜く」のように語の中で
//   割れるため。ひらがなの切れ目は BudouX の文節が受け持つ）。ー・記号は前の字の種類に続ける。
//   2 字に満たない切れ端は隣とまとめる（「1／兆」のような 1 字だけの切れ端を作らない）。
const SCRIPT_BREAK_MIN = 7;
function scriptOf(ch) {
  if (ch === '・' || ch === '･') return 'dot';
  if (ch === 'ー') return null; // 前の字の種類に続ける
  if (/[゠-ヿㇰ-ㇿｦ-ﾟ]/.test(ch)) return 'kata';
  if (/[぀-ゟ]/.test(ch)) return 'hira';
  if (/[一-鿿㐀-䶿々〆]/.test(ch)) return 'kanji';
  if (/[A-Za-z0-9０-９Ａ-Ｚａ-ｚ]/.test(ch)) return 'latin';
  return null; // 記号・空白などは前の字の種類に続ける
}
const ALLOWED = new Set(['kata>kanji', 'kanji>kata', 'latin>kata', 'latin>hira', 'latin>kanji', 'kata>latin', 'hira>latin', 'kanji>latin']);
export function scriptBreakPieces(phrase, minLen = SCRIPT_BREAK_MIN) {
  const chars = [...String(phrase ?? '')];
  if (chars.length === 0) return [];
  if (chars.length < minLen) return [chars.join('')];
  const pieces = [];
  let cur = '';
  let prev = null;
  let afterDot = false;
  for (const ch of chars) {
    const own = scriptOf(ch);
    const cls = own === 'dot' ? 'dot' : (own || prev);
    const boundary = cur && cls !== 'dot' && (afterDot || (prev && cls && ALLOWED.has(`${prev}>${cls}`)));
    if (boundary) { pieces.push(cur); cur = ''; }
    cur += ch;
    afterDot = cls === 'dot';
    if (cls !== 'dot') prev = cls;
  }
  if (cur) pieces.push(cur);
  // 2 字に満たない切れ端は隣とまとめる（先頭は次へ、それ以外は前へ）。
  const merged = [];
  pieces.forEach((pc) => {
    if (merged.length && [...pc].length < 2) merged[merged.length - 1] += pc;
    else merged.push(pc);
  });
  if (merged.length > 1 && [...merged[0]].length < 2) { merged[1] = merged[0] + merged[1]; merged.shift(); }
  return merged;
}

// 文節（scriptBreaks のときは長い文節の中の文字の種類の切れ目でも）に分ける。改行は '\n' の要素で残す。
export function phrasePieces(text, { scriptBreaks = false } = {}) {
  const src = String(text ?? '');
  if (!src) return [];
  let p = null;
  try { p = getParser(); } catch { p = null; }
  const out = [];
  src.split('\n').forEach((line, li) => {
    if (li > 0) out.push('\n');
    let phrases;
    try { phrases = !line ? [] : p ? p.parse(line) : [line]; } catch { phrases = [line]; }
    phrases.forEach((ph) => { (scriptBreaks ? scriptBreakPieces(ph) : [ph]).forEach((pc) => out.push(pc)); });
  });
  return out;
}

// 文を文節の切れ目（<wbr>）入りの React ノードにする。改行はそのまま（white-space: pre-wrap）。
// scriptBreaks: 書名・著者名など、長い 1 文節の中でも文字の種類の切れ目で折り返してよいもの（scriptBreakPieces）。
export function withPhraseBreaks(text, { scriptBreaks = false } = {}) {
  const src = String(text ?? '');
  if (!src) return src;
  const out = [];
  let k = 0;
  let lineStart = true;
  phrasePieces(src, { scriptBreaks }).forEach((pc) => {
    if (pc === '\n') { out.push('\n'); lineStart = true; return; }
    if (!lineStart) out.push(<wbr key={`w${k++}`} />);
    // 文節の中の半角の空きは折り返さない空きに（数と助数詞を割らない・glueInnerSpaces）。
    out.push(glueInnerSpaces(pc));
    lineStart = false;
  });
  return out;
}

// いちばん長い文節の字数（その文節が 1 行に収まるかを見積もる・MiniCover の書名など）。
export function longestPhraseLength(text, { scriptBreaks = false } = {}) {
  let max = 0;
  phrasePieces(text, { scriptBreaks }).forEach((pc) => { if (pc !== '\n') max = Math.max(max, [...pc].length); });
  return max;
}

// 吹き出しの中の文字（テキストノード）の行の箱から、左端と右端を出す。
function textExtent(el) {
  if (typeof document === 'undefined' || typeof document.createRange !== 'function') return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let left = Infinity;
  let right = -Infinity;
  const tops = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width <= 0) continue;
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      tops.add(Math.round(r.top));
    }
  }
  if (range.detach) range.detach();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return { width: right - left, lines: tops.size };
}

export default function TightBubble({ text, className, style, children, ...rest }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return undefined;
    let lastAvail = -1;
    const fit = () => {
      const parent = el.parentElement;
      const avail = parent ? parent.clientWidth : 0;
      if (avail === lastAvail) return;
      lastAvail = avail;
      el.style.width = '';
      const before = textExtent(el);
      if (!before) return;
      const cs = window.getComputedStyle(el);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
        + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      const target = Math.ceil(before.width + pad);
      if (target >= el.getBoundingClientRect().width - 1) return; // 詰める余地がない
      el.style.width = `${target}px`;
      const after = textExtent(el);
      if (!after || after.lines !== before.lines) el.style.width = '';
    };
    fit();
    // Web フォントが後から効くと文字の幅が変わるので、読み込み後にもう一度。
    let alive = true;
    if (document.fonts?.ready) document.fonts.ready.then(() => { if (alive) { lastAvail = -1; fit(); } }, () => {});
    // 使える幅（親の幅）が変わったときだけ測り直す（吹き出し自身の幅の変化では測らない）。
    let ro = null;
    if (typeof ResizeObserver === 'function' && el.parentElement) {
      ro = new ResizeObserver(() => fit());
      ro.observe(el.parentElement);
    }
    return () => { alive = false; if (ro) ro.disconnect(); };
  }, [text]);

  return (
    <div ref={ref} className={className} style={style} {...rest}>
      {children}
    </div>
  );
}
