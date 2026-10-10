// 📖 この本で学べること（2026-10-08 オーナー「読書計画を作成する前にその本の概要や学べることなどを把握できるように
// したい（前はできていたよね？）そうではないとこの本からどんな仮説を立てられるかを決められない」）。
//
// 材料は出版社・書店が公開している紹介文と目次だけ（lib/bookInfo.js）。AI（purpose 'book_brief'・Google の
// Flash-Lite・読書計画シートと同じ行き先）が ①概要（著者の主張 1〜2 文）②学べること 3〜5 個 ③仮説の例 2〜3 個 を書く。
//   - 紹介も目次も無い（少なすぎる）本では作らない（BRIEF_NO_MATERIAL_TEXT）
//   - 書き終えたら、目次に無い『章名』・章番号を含む行を消す（lib/planChapters.js と同じ考え方・groundBrief）
//   - 一度作ったら本に保存（books.ai_brief・supabase_books_brief.sql）。列が無い DB では端末に控える（readLocalBrief）。
//     開くたびに AI を呼ばない。作り直しは押したときだけ
//   - 読書計画シートの材料にも足す（briefForPrompt・概要と学べることだけ・500 字まで）
// このモジュールは pure（AI は呼ばない・localStorage だけ触る）。

import { isLineGrounded } from './planChapters';
import { BRIEF_HEADINGS } from './prompts';

// 1 回に頼む出力の上限（400 字＋見出し＝日本語でおよそ 500〜600 トークン）。1 回 約 1〜2 トークン（lib/tokens.js の TOKEN_COSTS.bookBrief）。
export const BRIEF_MAX_TOKENS = 700;
// 材料の下限: 紹介文が 40 字以上か、目次が 3 項目以上。どちらも無ければ作らない。
export const BRIEF_MIN_ABOUT_CHARS = 40;
export const BRIEF_MIN_TOC_LINES = 3;
// 画面に出す決まった文（作らないとき）。
export const BRIEF_NO_MATERIAL_TEXT = 'この本の紹介が見つからないため作れません。';
// 数の上限（AI が多く書いても切る）。
const MAX_LEARN = 5;
const MAX_HYP = 3;
const MAX_ITEM_CHARS = 80; // これを超える項目は途中で切らずに捨てる（2026-10-08 ui-critic）
const MAX_SUMMARY_CHARS = 160; // 概要は文の切れ目でここまで（1 文目がこれを超えても 1 文目は残す）
// 読書計画シートに渡す長さの上限。
export const BRIEF_PROMPT_MAX = 500;

const chars = (s) => [...String(s ?? '')];

/** 紹介文か目次が、作るのに足りるだけあるか。 */
export function hasBriefMaterial(info) {
  if (!info) return false;
  const about = String(info.description || '').replace(/\s+/g, '');
  const toc = (info.toc || []).filter((l) => String(l || '').trim());
  return chars(about).length >= BRIEF_MIN_ABOUT_CHARS || toc.length >= BRIEF_MIN_TOC_LINES;
}

/**
 * AI の答え（## 概要 / ## 学べること / ## 仮説の例）を { summary, learn[], hypotheses[] } に。
 * 見出しの絵文字・番号・太字の印は外す。崩れた答えでも読める分だけ拾う。
 */
export function parseBrief(text) {
  // kind: 'learn'（学べること）| 'savor'（小説・物語などの「味わえること」・2026-10-08 ui-critic）
  const out = { summary: '', learn: [], hypotheses: [], kind: 'learn' };
  let sec = '';
  const summaryLines = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,4}\s*(.+)$/);
    if (h) {
      const name = h[1].replace(/[*_`]/g, '');
      if (name.includes(BRIEF_HEADINGS.summary)) sec = 'summary';
      else if (name.includes(BRIEF_HEADINGS.learn)) sec = 'learn';
      else if (name.includes(BRIEF_HEADINGS.savor)) { sec = 'learn'; out.kind = 'savor'; }
      else if (name.includes('仮説')) sec = 'hypotheses';
      else sec = '';
      continue;
    }
    const item = line.replace(/^(?:[-*・•]|\d+[.)．、])\s*/, '').replace(/\*\*/g, '').trim();
    if (!item) continue;
    if (sec === 'summary') summaryLines.push(item);
    else if (sec === 'learn') out.learn.push(item);
    else if (sec === 'hypotheses') out.hypotheses.push(item);
  }
  out.summary = summaryLines.join('');
  return out;
}

// 材料（紹介文と目次）に無い数字・カタカナ語・英字の語を含むか（2026-10-08 ui-critic「材料に無いことを書いている」）。
//   数字: 「5 年後」「週に 1 回」のような、材料に無い数を足していないか（概要・学べること・仮説の例のすべて）
//   語:   カタカナ 3 字以上・英字 2 字以上の語（固有の語・用語）が材料にあるか（概要と学べることだけ。
//         仮説の例は読む人の見立てなので、ふつうの語で書けるよう語は見ない）
const normText = (t) => {
  let v = String(t || '');
  try { v = v.normalize('NFKC'); } catch { /* そのまま */ }
  return v.toLowerCase().replace(/\s+/g, '');
};
export function unknownTermsIn(line, material, { words = true } = {}) {
  const mat = normText(material);
  const src = normText(line).replace(/『[^』]*』/g, ''); // 『章名』は章名の確かめ方（isLineGrounded）で見る
  const out = [];
  // 数は数としてそろえる（材料の「100」の中の「1」を「1 回」の裏付けにしない）。
  const nums = new Set((mat.match(/\d+/g) || []).map((n) => String(Number(n))));
  for (const n of src.match(/\d+/g) || []) if (!nums.has(String(Number(n)))) out.push(n);
  if (words) {
    for (const w of src.match(/[ァ-ヺー]{3,}|[a-z][a-z0-9]+/g) || []) {
      if (/^ー+$/.test(w)) continue;
      if (!mat.includes(w)) out.push(w);
    }
  }
  return out;
}

/**
 * 目次に無い『章名』・章番号、材料に無い数字・語を含む文・項目を消し、数と長さをそろえる（この本の書名の『』は残す）。
 * 目次が無い本は、書名以外の『』をすべて消す（章の名前を挙げない）。
 * 概要は文の切れ目で 160 字まで（文の途中で切らない）・項目は 80 字を超えたら捨てる（途中で切らない）。
 * @param {{ toc?: string[], title?: string, about?: string }} material about が無いときは数字・語を確かめない（古い呼び出し）
 * @returns {{ brief: {summary, learn, hypotheses, kind}, removed: string[] }}
 */
export function groundBrief(brief, { toc = [], title = '', about = null } = {}) {
  const tocList = Array.isArray(toc) ? toc : [];
  const allowed = [...tocList, title].filter(Boolean);
  const material = about == null ? null : [about, ...tocList, title].join('\n');
  const removed = [];
  const keep = (s, { words = true } = {}) => {
    const ok = isLineGrounded(s, allowed) && (material == null || unknownTermsIn(s, material, { words }).length === 0);
    if (!ok) removed.push(s);
    return ok;
  };
  const b = brief || {};
  // 概要は文ごとに確かめる（1 文だけ崩れていても、ほかの文は残す）・文の切れ目で長さをそろえる。
  const sentences = (String(b.summary || '').match(/[^。！？!?]+[。！？!?]?/g) || []).map((x) => x.trim()).filter(Boolean).filter((x) => keep(x));
  let summary = '';
  for (const x of sentences) {
    if (summary && chars(summary + x).length > MAX_SUMMARY_CHARS) break;
    summary += x;
  }
  const items = (list, max, opts) => (Array.isArray(list) ? list : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .filter((x) => chars(x).length <= MAX_ITEM_CHARS)
    .filter((x) => keep(x, opts))
    .slice(0, max);
  return {
    brief: {
      summary,
      learn: items(b.learn, MAX_LEARN),
      hypotheses: items(b.hypotheses, MAX_HYP, { words: false }),
      kind: b.kind === 'savor' ? 'savor' : 'learn',
    },
    removed,
  };
}

/** 見せられる中身か（概要と、学べることが 1 つ以上）。 */
export function isUsableBrief(brief) {
  return !!(brief && String(brief.summary || '').trim() && Array.isArray(brief.learn) && brief.learn.length > 0);
}

/** 保存する形（決まった 3 つの見出しの Markdown）。 */
export function formatBrief(brief) {
  if (!isUsableBrief(brief)) return '';
  const learnHeading = brief.kind === 'savor' ? BRIEF_HEADINGS.savor : BRIEF_HEADINGS.learn;
  const lines = [`## ${BRIEF_HEADINGS.summary}`, brief.summary, '', `## ${learnHeading}`, ...brief.learn.map((x) => `- ${x}`)];
  if (brief.hypotheses?.length) lines.push('', `## ${BRIEF_HEADINGS.hypotheses}`, ...brief.hypotheses.map((x) => `- ${x}`));
  return lines.join('\n');
}

/** AI の答え → 確かめて保存する文（使えなければ ''）。 */
export function finalizeBrief(text, { toc = [], title = '', about = null } = {}) {
  const { brief } = groundBrief(parseBrief(text), { toc, title, about });
  return formatBrief(brief);
}

/** 読書計画シートに渡す形（概要と学べることだけ・仮説の例は本の事実ではないので渡さない）。 */
export function briefForPrompt(text) {
  const b = parseBrief(text);
  if (!isUsableBrief(b)) return '';
  // 500 字を超えるときは項目の切れ目で止める（途中で切らない）。
  let out = `概要: ${b.summary}`;
  for (const x of b.learn) {
    const next = `${out}\n- ${x}`;
    if (chars(next).length > BRIEF_PROMPT_MAX) break;
    out = next;
  }
  return chars(out).length > BRIEF_PROMPT_MAX ? '' : out;
}

/** 添え書き（どの材料から作ったか・いま読める紹介文・目次に合わせる）。 */
export function briefSourceLine(info) {
  const hasAbout = !!String(info?.description || '').trim();
  const hasToc = (info?.toc || []).some((l) => String(l || '').trim());
  if (hasAbout && hasToc) return '紹介文と目次から AI がまとめました';
  if (hasAbout) return '紹介文から AI がまとめました';
  if (hasToc) return '目次から AI がまとめました';
  return '公開の紹介から AI がまとめました';
}

/** 見出しの名前（小説・物語は「この本で味わえること」）。 */
export function briefLabels(text) {
  const b = parseBrief(text);
  const savor = b.kind === 'savor';
  // 畳む見出しの右の要約は中身に合わせる（仮説の例があれば「・仮説」まで）。
  const hyp = b.hypotheses.length ? '・仮説' : '';
  return savor
    ? { title: 'この本で味わえること', learn: BRIEF_HEADINGS.savor, short: `概要・味わえること${hyp}` }
    : { title: 'この本で学べること', learn: BRIEF_HEADINGS.learn, short: `概要・学べること${hyp}` };
}

/** 仮説の欄に足す（空なら入れる・もう入っていれば何もしない・あれば改行して「・」から後ろに＝前の仮説と続いて読めないように・2026-10-10）。 */
export function appendHypothesis(current, hypothesis) {
  const cur = String(current || '');
  const h = String(hypothesis || '').trim();
  if (!h) return cur;
  if (cur.includes(h)) return cur;
  return cur.trim() ? `${cur.replace(/\s+$/, '')}\n・${h.replace(/^[・\-*]\s*/, '')}` : h;
}

// ── 列（books.ai_brief）が無い DB のための、端末の控え ─────────────────────
const LS_PREFIX = 'orime.bookBrief.v1:';
export function readLocalBrief(bookId) {
  if (!bookId) return '';
  try { return globalThis.localStorage?.getItem(LS_PREFIX + bookId) || ''; } catch { return ''; }
}
export function writeLocalBrief(bookId, text) {
  if (!bookId) return;
  try {
    if (text) globalThis.localStorage?.setItem(LS_PREFIX + bookId, String(text));
    else globalThis.localStorage?.removeItem(LS_PREFIX + bookId);
  } catch { /* 書けない端末では、その場だけ */ }
}

/** その本の保存済みの「この本で学べること」（本の列 → 端末の控え）。 */
export function storedBriefOf(book) {
  if (!book) return '';
  return String(book.aiBrief || '') || readLocalBrief(book.id);
}
