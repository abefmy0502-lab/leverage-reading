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
const MAX_ITEM_CHARS = 80;
const MAX_SUMMARY_CHARS = 160;
// 読書計画シートに渡す長さの上限。
export const BRIEF_PROMPT_MAX = 500;

const chars = (s) => [...String(s ?? '')];
const cut = (s, n) => chars(s).slice(0, n).join('');

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
  const out = { summary: '', learn: [], hypotheses: [] };
  let sec = '';
  const summaryLines = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,4}\s*(.+)$/);
    if (h) {
      const name = h[1].replace(/[*_`]/g, '');
      if (name.includes(BRIEF_HEADINGS.summary)) sec = 'summary';
      else if (name.includes(BRIEF_HEADINGS.learn) || name.includes('味わえること')) sec = 'learn';
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

/**
 * 目次に無い『章名』・章番号を含む文・項目を消し、数と長さをそろえる（この本の書名の『』は残す）。
 * 目次が無い本は、書名以外の『』をすべて消す（章の名前を挙げない）。
 * @returns {{ brief: {summary, learn, hypotheses}, removed: string[] }}
 */
export function groundBrief(brief, { toc = [], title = '' } = {}) {
  const allowed = [...(Array.isArray(toc) ? toc : []), title].filter(Boolean);
  const removed = [];
  const keep = (s) => {
    if (isLineGrounded(s, allowed)) return true;
    removed.push(s);
    return false;
  };
  const b = brief || {};
  // 概要は文ごとに確かめる（1 文だけ崩れていても、ほかの文は残す）。
  const sentences = String(b.summary || '').match(/[^。！？!?]+[。！？!?]?/g) || [];
  const summary = cut(sentences.map((x) => x.trim()).filter(Boolean).filter(keep).join(''), MAX_SUMMARY_CHARS);
  const items = (list, max) => (Array.isArray(list) ? list : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .filter(keep)
    .map((x) => cut(x, MAX_ITEM_CHARS))
    .slice(0, max);
  return {
    brief: { summary, learn: items(b.learn, MAX_LEARN), hypotheses: items(b.hypotheses, MAX_HYP) },
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
  const lines = [`## ${BRIEF_HEADINGS.summary}`, brief.summary, '', `## ${BRIEF_HEADINGS.learn}`, ...brief.learn.map((x) => `- ${x}`)];
  if (brief.hypotheses?.length) lines.push('', `## ${BRIEF_HEADINGS.hypotheses}`, ...brief.hypotheses.map((x) => `- ${x}`));
  return lines.join('\n');
}

/** AI の答え → 確かめて保存する文（使えなければ ''）。 */
export function finalizeBrief(text, { toc = [], title = '' } = {}) {
  const { brief } = groundBrief(parseBrief(text), { toc, title });
  return formatBrief(brief);
}

/** 読書計画シートに渡す形（概要と学べることだけ・仮説の例は本の事実ではないので渡さない）。 */
export function briefForPrompt(text) {
  const b = parseBrief(text);
  if (!isUsableBrief(b)) return '';
  return cut([`概要: ${b.summary}`, ...b.learn.map((x) => `- ${x}`)].join('\n'), BRIEF_PROMPT_MAX);
}

/** 仮説の欄に足す（空なら入れる・もう入っていれば何もしない・あれば改行して後ろに）。 */
export function appendHypothesis(current, hypothesis) {
  const cur = String(current || '');
  const h = String(hypothesis || '').trim();
  if (!h) return cur;
  if (cur.includes(h)) return cur;
  return cur.trim() ? `${cur.replace(/\s+$/, '')}\n${h}` : h;
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
