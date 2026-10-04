// 📚 AI 選書の本文（前置き・読む順番・補足）に出てくる書名を「確かめた本だけ」に絞る（2026-09-30）。
//
// なぜ: AI 選書の本文には、カード（RECOMMENDATIONS の JSON）に入れていない書名や、
//   実在を確かめられなかった書名が混ざることがあった（本番の実例: 読む順番に
//   『BtoB営業を成功させるSPIN営業術』『営業提案書とプレゼンの科学』などの架空の本）。
//   それまでの防御は「カードから落とした本の書名を含む行」だけを消していたので、
//   本文にだけ出てくる書名は一度も確かめられていなかった。
//
// 決まり（許可リスト）:
//   本文の『…』（と、書名として使われている「…」）は、次のどちらかと同じ本でなければ、その行（箇条書きなら続きの行ごと）を消す。
//     ① 実在を確かめられたカードの本（exists===true）
//     ② その人の本棚にある本
//   消したあとは番号つきの箇条書きを 1. 2. 3. と振り直し、中身が空になった見出し（「読む順番のおすすめ」など）も消す。
//
// このモジュールは pure（React に依存しない）。BookAdvisor（生成直後・画面に戻ったとき・会話の再開）と
// AdvisorHistory（履歴の中身）の両方で使う。
import { stripEditionPrefix } from './checkDuplicate';

// 書名の「副題の前まで」を切る区切り（空白・コロン・ダッシュ・括弧・波ダッシュ・縦棒・スラッシュ）。
// ⚠️ 長音「ー」と中黒「・」は書名の中に普通に出るので区切りにしない。
const CORE_SEP = /[\s:：―—–\-(（[［【〔〜~|｜／/]/;
// 比べるときに落とす記号（空白・かっこ・中黒・句読点）。
const FLAT_DROP = /[\s「」『』【】[\]［］（）()〔〕〈〉《》・･·:：―—–\-〜~!！?？、,，.。'"“”‘’*＊]/g;

// 比べる形その 1: 書名まるごと（版の頭を外し、記号・空白を落とす）。
export function titleFlat(raw) {
  return stripEditionPrefix(raw || '').replace(FLAT_DROP, '');
}
// 比べる形その 2: 副題の前まで（版の頭を外し、最初の区切りで切ってから記号を落とす）。
export function titleCore(raw) {
  const t = stripEditionPrefix(raw || '');
  const head = t.split(CORE_SEP)[0] || t;
  return head.replace(FLAT_DROP, '');
}

// 本文の書名と、カード・本棚の書名が「同じ本」か（ゆるめ・副題の有無と版の頭は同じとみなす）。
//   - まるごと同じ → 同じ本
//   - 副題の前までが同じで、片方がもう片方の頭にある → 同じ本（「無敗営業」↔「無敗営業 「3つの質問」と…」）
//   - 副題の前までが同じでも、どちらの副題も違う → 別の本（「マンガ でわかる営業術」↔「マンガ 7つの習慣」）
export function titlesLooselySame(a, b) {
  const fa = titleFlat(a);
  const fb = titleFlat(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const ca = titleCore(a);
  const cb = titleCore(b);
  if (!ca || ca !== cb || ca.length < 2) return false;
  const [short, long] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
  return long.startsWith(short);
}

const matchesAny = (title, list) => (list || []).some((t) => t && titlesLooselySame(title, t));

const LIST_ITEM = /^(\s*)(?:\d+[.)．]|[-*+・])\s+/;
const NUMBERED = /^(\s*)\d+[.)．](\s+)/;
const HEADING = /^\s*#{1,6}\s/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

// 1 行の中の書名らしきもの（『…』は全部・「…」は書名として使われているときだけ）。
//   「…」は強調や引用にも使うので、次のどれかのときだけ書名とみなす:
//     - カードの本（確かめられなかった本も含む）・本棚の本の書名と同じ
//     - 箇条書き・見出しの頭に置かれている（「1. 「〇〇」 — 理由」）
//     - すぐあとに（著者）や「著」が続く
export function titleMentions(line, { pool = [], shelf = [] } = {}) {
  const s = String(line || '');
  const out = [];
  const reBook = /『([^』\n]{1,120})』/g;
  let m;
  while ((m = reBook.exec(s)) !== null) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  // 『…』の中の「…」（『大型商談を成約に導く「SPIN」営業術』の「SPIN」）は書名として数えない。
  const rest = s.replace(/『[^』\n]*』/g, '');
  const reQuote = /「([^」\n]{2,120})」/g;
  while ((m = reQuote.exec(rest)) !== null) {
    const t = m[1].trim();
    if (!t) continue;
    const before = rest.slice(0, m.index);
    const after = rest.slice(m.index + m[0].length);
    const atHead = /^\s*(?:#{1,6}\s+|(?:\d+[.)．]|[-*+・])\s+|\|\s*(?:\d+\s*\|\s*)?)(?:\*\*|__)?\s*$/.test(before);
    const withAuthor = /^\s*(?:\*\*|__)?\s*[（(][^）)\n]{1,40}[）)]/.test(after) || /^\s*(?:\*\*|__)?\s*(?:著|訳|編)/.test(after);
    if (atHead || withAuthor || matchesAny(t, pool) || matchesAny(t, shelf)) out.push(t);
  }
  return out;
}

// 連続する番号つきの箇条書き（1. 2. …）を振り直す（行を消して 1, 2, 4 と飛ぶのを防ぐ）。
// 空行はリストの続きとみなし、見出しなどの本文が来たら数え直す。
// 表の 1 列目が番号だけのとき（| 1 | 『…』 |）も表ごとに振り直す。
export function renumberLists(text) {
  let n = 0;
  let row = 0;
  return String(text || '')
    .split('\n')
    .map((ln) => {
      if (TABLE_ROW.test(ln)) {
        if (TABLE_SEP.test(ln)) return ln;
        const cell = ln.match(/^(\s*\|\s*)(\d+)(\s*\|)/);
        if (cell) { row += 1; return ln.replace(/^(\s*\|\s*)\d+(\s*\|)/, `$1${row}$2`); }
        return ln;
      }
      row = 0;
      if (NUMBERED.test(ln) && !/^\s{2,}/.test(ln)) {
        n += 1;
        return ln.replace(/^(\s*)\d+([.)．])/, `$1${n}$2`);
      }
      if (ln.trim() !== '' && !/^\s{2,}/.test(ln)) n = 0;
      return ln;
    })
    .join('\n');
}

/**
 * 本文から「確かめた本・本棚の本」以外の書名を含む行を消す。
 * @param {string} text  Markdown の本文
 * @param {{ allowed?: string[], pool?: string[], shelf?: string[] }} opts
 *   allowed: 実在を確かめたカードの書名（exists===true）
 *   shelf:   本棚の本の書名（そのまま許可）
 *   pool:    カードに出した・出しかけた書名すべて（「…」を書名と見分けるためだけに使う）
 * @returns {string}
 */
export function filterProseTitles(text, { allowed = [], pool = [], shelf = [] } = {}) {
  if (!text || typeof text !== 'string') return text || '';
  const ok = [...allowed, ...shelf];
  const lines = text.split('\n');
  const kept = [];
  const removedIn = new Map(); // 見出しの位置 → その区画で消した行の数
  let section = -1;             // いまの区画の見出しの kept 内の位置（-1＝見出しの前）
  let dropCont = false;         // 消した箇条書きの続きの行（字下げ）も消す
  for (const ln of lines) {
    if (HEADING.test(ln)) {
      dropCont = false;
      kept.push(ln);
      section = kept.length - 1;
      continue;
    }
    if (dropCont) {
      // 消した箇条書きの続き＝字下げした行（入れ子の箇条書きも含む）。空行か字下げの無い行で終わり。
      if (ln.trim() !== '' && /^(\s{2,}|\t)/.test(ln)) {
        removedIn.set(section, (removedIn.get(section) || 0) + 1);
        continue;
      }
      dropCont = false;
    }
    const mentions = titleMentions(ln, { pool, shelf });
    const bad = mentions.some((t) => !matchesAny(t, ok));
    if (bad) {
      removedIn.set(section, (removedIn.get(section) || 0) + 1);
      dropCont = LIST_ITEM.test(ln);
      continue;
    }
    kept.push(ln);
  }
  // 行を消したせいで中身が空になった区画は、見出しごと消す。表は見出し行と区切り行だけ残ったら表ごと消す。
  const out = [];
  for (let i = 0; i < kept.length; i += 1) {
    const ln = kept[i];
    if (HEADING.test(ln) && removedIn.get(i)) {
      let j = i + 1;
      const body = [];
      while (j < kept.length && !HEADING.test(kept[j])) { body.push(kept[j]); j += 1; }
      const rows = body.filter((b) => TABLE_ROW.test(b) && !TABLE_SEP.test(b));
      const hasTable = body.some((b) => TABLE_SEP.test(b));
      const textLines = body.filter((b) => b.trim() !== '' && !TABLE_ROW.test(b));
      const tableEmpty = !hasTable || rows.length <= 1;
      if (textLines.length === 0 && tableEmpty) { i = j - 1; continue; }
    }
    out.push(ln);
  }
  // 見出しの無い本文（前置き）で表だけが空になったときも表ごと消す。
  const cleaned = dropEmptyTables(out);
  return renumberLists(cleaned.join('\n')).replace(/\n{3,}/g, '\n\n').trim();
}

function dropEmptyTables(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (TABLE_ROW.test(lines[i])) {
      let j = i;
      const block = [];
      while (j < lines.length && TABLE_ROW.test(lines[j])) { block.push(lines[j]); j += 1; }
      const dataRows = block.filter((b) => !TABLE_SEP.test(b)).length;
      const hasSep = block.some((b) => TABLE_SEP.test(b));
      if (!(hasSep && dataRows <= 1)) out.push(...block);
      i = j;
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  return out;
}

/**
 * カードの一覧から、本文の許可リスト（allowed）と書名の見分け用（pool）を作る。
 * 実在を確かめられたカード（_verify === 'ok'）だけを allowed にする（不明・疑いは許可しない）。
 */
export function proseTitleLists(items, books) {
  const list = Array.isArray(items) ? items : [];
  return {
    allowed: list.filter((r) => r && r._verify === 'ok' && r.title).map((r) => r.title),
    pool: list.filter((r) => r && r.title).map((r) => r.title),
    shelf: (Array.isArray(books) ? books : []).map((b) => b && b.title).filter(Boolean),
  };
}

// 推薦の後ろの文から「## 💬 まとめ」（励ましの一言だけの区画）を取り除く（SPEC §3-2「励ましだけのまとめは出さない」）。
// 読む順番など他の区画は残す。会話中のおすすめ（BookAdvisor）と過去の AI 選書の中身（AdvisorHistory）で同じ（2026-10-04 に共通化）。
export function dropSummarySection(md) {
  if (!md || typeof md !== 'string') return md || '';
  const out = [];
  let dropping = false;
  for (const raw of md.split('\n')) {
    if (/^#{1,6}\s/.test(raw.trim())) dropping = /まとめ/.test(raw);
    if (!dropping) out.push(raw);
  }
  return out.join('\n').trim();
}
