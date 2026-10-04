// 📄 AI の Markdown（## 見出しで区切った節）を、画面に出す節に分ける（components/MarkdownSections.jsx と共通・2026-10-04）。
//
// 画面に出すかどうかを、描く前に決められるように pure な関数にしてある（App.jsx の「以前の AI 解析を見る」の畳みは、
// 中身が 1 つも出ないなら畳みごと出さない＝hasVisibleSections。MarkdownSections は遅れて読み込むので、ここは別のファイル）。
import { parseRelatedBookLine, RELATED_HEADING_RE } from './planRelatedBooks';

export function parseSections(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const sections = [];
  const lines = text.split('\n');
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: line.replace(/^## /, '').trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.length) sections.push(current);
  // 見出しも中身も無い節（先頭の空行だけ）は出さない
  return sections.filter((s) => s.heading || s.lines.some((l) => l.trim()));
}

// Heading like "## 📚 関連書籍" / "おすすめの本" / "次に読む" → 本のカードにする節。
// AI の見出しは揺れる（おすすめ書籍 / 次に読むべき本 / あわせて読みたい 等）ので広めに拾う。
// 書誌で確かめる側（lib/planRelatedBooks.js）と同じ見出し（片方だけ広いと、確かめていない本がカードになる）。
export function isRelatedBooksHeading(heading) {
  if (!heading) return false;
  return RELATED_HEADING_RE.test(heading);
}

// "### 1. 『title』- 著者" → { title, author }。1 冊と言い切れない行は { skip: true }。本の行でなければ null。
export function parseRelatedBookHeading(text) {
  const parsed = parseRelatedBookLine(text);
  if (!parsed) return null;
  if (parsed.malformed) return { skip: true };
  return { title: parsed.title, author: parsed.author };
}

// 関連書籍の節で、本のカードになる行の数。
export function relatedCardCount(lines) {
  return (lines || []).filter((l) => /^### /.test(l.trimEnd()))
    .map((l) => parseRelatedBookHeading(l.trimEnd().replace(/^### /, '')))
    .filter((b) => b && !b.skip).length;
}

/**
 * 画面に出す節（MarkdownSections と同じ決まり）。
 * @param {string} text
 * @param {{ relatedCards?: boolean, pendingRelated?: boolean, hideRelatedBooks?: boolean }} opts
 *   relatedCards: 関連書籍をカードにする（onAddRelatedBook あり）。カードが 1 枚も出ない関連書籍の節は、見出しごと出さない
 *   pendingRelated: 書いている途中・確かめている途中（関連書籍の節は、見出しと骨組みだけ＝中身を出さない）
 *   hideRelatedBooks: 書誌で確かめていない古い出力（関連書籍の節を出さない）
 * @returns {Array<{ heading: string|null, lines: string[], related: boolean }>}
 */
export function visibleSections(text, { relatedCards = false, pendingRelated = false, hideRelatedBooks = false } = {}) {
  return parseSections(text)
    .map((s) => ({ ...s, related: isRelatedBooksHeading(s.heading) }))
    .filter((s) => {
      if (!s.related) return true;
      if (hideRelatedBooks) return false;
      if (pendingRelated) return true;
      if (relatedCards) return relatedCardCount(s.lines) > 0;
      return true;
    });
}

export function hasVisibleSections(text, opts) {
  return visibleSections(text, opts).length > 0;
}
