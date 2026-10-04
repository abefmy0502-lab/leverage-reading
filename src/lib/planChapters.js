// 📖 読書計画シートの「重点的に読む箇所」「流し読みでOKな箇所」に、目次に無い章の名前・章番号を残さない（2026-10-04）。
//
// なぜ（オーナー報告「似たような事象が起きないか」・関連書籍の 2 冊混ぜと同じ「確かめていない事実を事実として見せる」型）:
//   指示文は「目次の項目名をそのまま『』で引く・目次が無ければ章の名前を挙げない」と頼んでいるが（prompts.setupSheet）、
//   安いモデルは目次に無い章（『第9章 AI 時代の働き方』）や章番号（「第3章」）を書くことがある。画面は『』の章名を
//   本の事実のように見せるので、書き終えたところで、目次（と、直すときは直す前のシート）に無いものを含む行を消す。
//   - 『…』: 許可する文字列（目次の項目・直す前のシートの行）のどれかに含まれる（または含む・4 字以上）なら残す
//   - 「第3章」「Part 2」など章の番号: 許可する文字列のどれかに同じ番号があれば残す
//   - 行を消して中身が空になった節: 目次が無いときの「重点的に読む箇所」は決まった 1 行（PLAN_NO_TOC_LINE）にする・それ以外は節ごと消す
// AI は呼ばない。このモジュールは pure。
import { PLAN_NO_TOC_LINE } from './prompts';

const FOCUS_HEADING_RE = /重点的に読む|流し読み|読み飛ばし/;
const CHAPTER_NUM_RE = /第\s*[0-9０-９一二三四五六七八九十百]+\s*[章部節編]|chapter\s*\d+|part\s*\d+/gi;

const norm = (s) => {
  let t = String(s || '');
  try { t = t.normalize('NFKC'); } catch { /* そのまま */ }
  return t.toLowerCase().replace(/[\s「」『』（）()[\]【】〈〉《》・:：、。,.\-―—–~〜!！?？"'“”‘’]/g, '');
};

// シートの節を [{ heading, start, end }] で（heading は ## の後ろ・end は次の ## の行・含まない）。
function sectionsOf(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const h = line.match(/^##\s+(.*)$/);
    if (!h || /^###/.test(line)) return;
    if (out.length) out[out.length - 1].end = i;
    out.push({ heading: h[1], start: i, end: lines.length });
  });
  return out;
}

// 直すときに許可する文字列: 直す前のシートの「重点的に読む箇所」「流し読み」の行（そこに出ていた章名・番号はそのまま使ってよい）。
export function focusLinesOf(sheet) {
  const lines = String(sheet || '').split('\n');
  return sectionsOf(lines)
    .filter((s) => FOCUS_HEADING_RE.test(s.heading))
    .flatMap((s) => lines.slice(s.start + 1, s.end))
    .map((l) => l.trim())
    .filter(Boolean);
}

function lineIsGrounded(line, allowedNorm) {
  const quotes = [...String(line).matchAll(/『([^』\n]+)』/g)].map((m) => norm(m[1])).filter(Boolean);
  for (const q of quotes) {
    const ok = allowedNorm.some((a) => a.includes(q) || (a.length >= 4 && q.includes(a)));
    if (!ok) return false;
  }
  const nums = (String(line).match(CHAPTER_NUM_RE) || []).map(norm);
  for (const n of nums) {
    if (!allowedNorm.some((a) => a.includes(n))) return false;
  }
  return true;
}

/**
 * 目次（と許可する文字列）に無い章の名前・番号を含む行を、重点的に読む箇所・流し読みの節から消す。
 * @param {string} sheet 読書計画シート（Markdown）
 * @param {string[]} allowed 目次の項目（作るとき）・直す前のシートの行（直すとき）
 * @param {{ noToc?: boolean }} opts noToc: 目次が無い本（空になった「重点的に読む箇所」を決まった 1 行にする）
 * @returns {{ sheet: string, removed: string[] }}
 */
export function dropUnknownChapters(sheet, allowed = [], { noToc = false } = {}) {
  const text = String(sheet || '');
  const lines = text.split('\n');
  const allowedNorm = (Array.isArray(allowed) ? allowed : []).map(norm).filter(Boolean);
  const removed = [];
  const out = [];
  let cursor = 0;
  sectionsOf(lines).forEach((s) => {
    while (cursor < s.start) { out.push(lines[cursor]); cursor += 1; }
    const body = lines.slice(s.start + 1, s.end);
    if (!FOCUS_HEADING_RE.test(s.heading)) {
      out.push(lines[s.start], ...body);
      cursor = s.end;
      return;
    }
    const kept = body.filter((l) => {
      if (!l.trim() || lineIsGrounded(l, allowedNorm)) return true;
      removed.push(l.trim());
      return false;
    });
    const hasContent = kept.some((l) => l.trim());
    if (hasContent) out.push(lines[s.start], ...kept);
    else if (noToc && /重点的に読む/.test(s.heading)) out.push(lines[s.start], PLAN_NO_TOC_LINE, ...kept);
    // それ以外の空になった節は、見出しごと消す
    cursor = s.end;
  });
  while (cursor < lines.length) { out.push(lines[cursor]); cursor += 1; }
  if (removed.length === 0) return { sheet: text, removed };
  return { sheet: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, ''), removed };
}
