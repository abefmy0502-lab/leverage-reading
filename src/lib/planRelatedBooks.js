// 📚 読書計画シートの「関連書籍」を書誌で確かめる（2026-10-01）。
//
// 読書計画シートは安いモデル（Gemini Flash-Lite・docs/ai-routing.md）で作るので、実在しない本を挙げることがある。
// 書き終えたら「## 📚 関連書籍」の各本（### N. 『書名』- 著者）を AI 選書と同じ照合（verifyBookExists・
// api/_bookVerify.js）にかけ、「検索元は答えたが一致する本が無い」（exists: false）本だけを消してから保存する。
//   - 確かめられなかった本（通信の失敗など・exists: null）は残す（実在の疑いではないので）
//   - 消したあとは番号を振り直す。1 冊も残らなければ見出しごと消す
//   - それ以外の節（読み方の戦略など）には触れない。AI は呼ばない（書誌の検索だけ）
// 見出し・行の読み方は components/MarkdownSections.jsx の関連書籍カードと同じ。

const RELATED_HEADING_RE = /関連(書籍|本|する本|図書)|次に読む|次に読むべき|次の(一冊|本)|併読|あわせて読みたい|おすすめ(の本|書籍|図書|の一冊)|参考(書籍|図書|文献)|読むべき本/;
const BOOK_RE = /^\s*(?:\d+\.\s*)?『([^』]+)』(?:\s*[-–—・]\s*(.+))?\s*$/;

// シートの行のうち、関連書籍の節の中の本（### の行）とその説明の行の範囲。
// 返り値: [{ title, author, start, end }]（end は次の ### / ## の行・含まない）
export function relatedBookEntries(sheet) {
  const lines = String(sheet || '').split('\n');
  const out = [];
  let inSection = false;
  let cur = null;
  const close = (i) => { if (cur) { cur.end = i; out.push(cur); cur = null; } };
  lines.forEach((line, i) => {
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2 && !/^###/.test(line)) {
      close(i);
      inSection = RELATED_HEADING_RE.test(h2[1]);
      return;
    }
    if (!inSection) return;
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      close(i);
      const m = h3[1].match(BOOK_RE);
      if (m && m[1].trim()) cur = { title: m[1].trim(), author: (m[2] || '').trim(), start: i, end: lines.length };
    }
  });
  close(lines.length);
  return out;
}

// 消す本（start の行の番号）を外して、番号を振り直したシートを返す。本が 1 冊も残らない節は見出しごと消す。
export function dropRelatedBooks(sheet, dropStarts) {
  const drop = new Set(dropStarts);
  if (drop.size === 0) return String(sheet || '');
  const lines = String(sheet || '').split('\n');
  const entries = relatedBookEntries(sheet);
  const remove = new Set();
  for (const e of entries) if (drop.has(e.start)) for (let i = e.start; i < e.end; i += 1) remove.add(i);
  // 節ごとに番号を振り直す（残った本だけ）
  const renumber = new Map();
  let n = 0;
  let lastSection = -1;
  for (const e of entries) {
    if (drop.has(e.start)) continue;
    let section = e.start;
    while (section >= 0 && !/^##\s/.test(lines[section]) ) section -= 1;
    if (section !== lastSection) { n = 0; lastSection = section; }
    n += 1;
    renumber.set(e.start, n);
  }
  const out = [];
  lines.forEach((line, i) => {
    if (remove.has(i)) return;
    if (renumber.has(i)) out.push(line.replace(/^(###\s+)\d+\./, `$1${renumber.get(i)}.`));
    else out.push(line);
  });
  // 本が残らなかった関連書籍の見出し（と、すぐ下の説明だけの行）を消す
  const result = [];
  for (let i = 0; i < out.length; i += 1) {
    const h2 = out[i].match(/^##\s+(.*)$/);
    if (h2 && !/^###/.test(out[i]) && RELATED_HEADING_RE.test(h2[1])) {
      let j = i + 1;
      let hasBook = false;
      while (j < out.length && !(/^##\s/.test(out[j]) && !/^###/.test(out[j]))) {
        if (/^###\s/.test(out[j])) hasBook = true;
        j += 1;
      }
      if (!hasBook) { i = j - 1; continue; }
    }
    result.push(out[i]);
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

// シートの関連書籍を確かめて、実在しない疑いの本を消したシートを返す。
//   verify: ({ title, author }) => Promise<{ exists: true|false|null }>（lib/bookCover.js の verifyBookExists）
// 返り値 { sheet, removed: [書名…] }。確かめる本が無ければそのまま。
//   timeoutMs: 1 冊を確かめるのを待つ上限（過ぎたら確かめられなかった扱い＝残す・保存を長く待たせない）。
export async function verifyPlanRelatedBooks(sheet, verify, { timeoutMs = 8000 } = {}) {
  const text = String(sheet || '');
  const entries = relatedBookEntries(text);
  if (entries.length === 0 || typeof verify !== 'function') return { sheet: text, removed: [] };
  const withTimeout = (p) => new Promise((resolve) => {
    const t = setTimeout(() => resolve({ exists: null }), timeoutMs);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve({ exists: null }); });
  });
  const results = await Promise.all(entries.map((e) => {
    try { return withTimeout(verify({ title: e.title, author: e.author })); } catch { return { exists: null }; }
  }));
  const dropped = entries.filter((_, i) => results[i]?.exists === false);
  if (dropped.length === 0) return { sheet: text, removed: [] };
  return { sheet: dropRelatedBooks(text, dropped.map((e) => e.start)), removed: dropped.map((e) => e.title) };
}
