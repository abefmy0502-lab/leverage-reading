// 📚 読書計画シートの「関連書籍」を書誌で確かめる（2026-10-01）。
//
// 読書計画シートは安いモデル（Gemini Flash-Lite・docs/ai-routing.md）で作るので、実在しない本を挙げることがある。
// 書き終えたら「## 📚 関連書籍」の各本（### N. 『書名』- 著者）を AI 選書と同じ照合（verifyBookExists・
// api/_bookVerify.js）にかけ、「検索元は答えたが一致する本が無い」（exists: false）本だけを消してから保存する。
//   - 確かめられなかった本（通信の失敗など・exists: null）は残す（実在の疑いではないので）
//   - 消したあとは番号を振り直す。1 冊も残らなければ見出しごと消す
//   - それ以外の節（読み方の戦略など）には触れない。AI は呼ばない（書誌の検索だけ）
// 見出し・行の読み方は components/MarkdownSections.jsx の関連書籍カードと同じ。

//   - 1 行に 2 冊を混ぜた行（「『A』関連 または『B』- 著者」・2026-10-04 オーナー報告）は「崩れた行」として、
//     『』の中の書名を 1 冊ずつ確かめ、見つかった最初の 1 冊だけの行に書き直す（見つからなければ消す）。
//     画面（MarkdownSections）は崩れた行を本のカードにしない（parseRelatedBookLine の malformed）。

//   - 『』の無い行（「### 1. 7つの習慣 - スティーブン・R・コヴィー」・2026-10-04）も、1 冊の書名に見える形
//     （番号つき・書名は 40 字まで・「または」などは候補に分ける）なら「崩れた行」として確かめ、『』の行に直すか消す。
//     確かめるまでは本のカードにしない（それまでは AI が書いた形のまま「読みたいに追加」が出ていた＝確かめていなかった）。
//   - 確かめられなかった（通信の失敗など）崩れた行は消さずに残す（画面には出さない・次に開いたときにまた確かめる）。

import { splitBookTitle, looksLikeSingleTitle } from './bookItemShape';

// 関連書籍の見出し（「## 📚 関連書籍」「おすすめの本」「次に読む」…）。MarkdownSections の本のカードも同じ見出しで決める。
export const RELATED_HEADING_RE = /関連(書籍|本|する本|図書)|次に読む|次に読むべき|次の(一冊|本)|併読|あわせて読みたい|おすすめ(の本|書籍|図書|の一冊)|参考(書籍|図書|文献)|読むべき本/;
const CLEAN_BOOK_RE = /^『([^』]+)』(?:\s*[-–—・]\s*([^『』]+))?$/;
// 『』の無い行の「書名 - 著者」の区切り（中黒「・」は名前の中に出るので区切りにしない）。
const PLAIN_SPLIT_RE = /^(.+?)(?:\s+[-–—]\s+|\s*[–—]\s*)(.+)$/;

// 関連書籍の 1 行（### の後ろ）を読む。返り値 { title, author, malformed, candidates, plain? } か null（本の行ではない）。
//   - きれいな行: 『書名』だけ、または『書名』- 著者 → malformed: false
//   - 崩れた行: 『』が 2 つ以上・『』の後ろに著者以外の言葉（「関連」「または」「（上）」など）→ malformed: true・
//     candidates は『』の中の書名（出てきた順）・author は最後の『』の後ろの「- 著者」
//   - 『』の無い番号つきの行で、1 冊の書名に見えるもの → malformed: true・plain: true（確かめて『』の行に直す）
export function parseRelatedBookLine(text) {
  const src = String(text || '').trim();
  const raw = src.replace(/^\d+\.\s*/, '');
  const titles = [...raw.matchAll(/『([^』]+)』/g)].map((m) => m[1].trim()).filter(Boolean);
  if (titles.length === 0) {
    if (!/^\d+\.\s*/.test(src)) return null; // 番号の無い小見出し（「### 読む順番」など）は本ではない
    const m = raw.match(PLAIN_SPLIT_RE);
    const shape = splitBookTitle(m ? m[1] : raw);
    if (shape.candidates.length === 0 || !shape.candidates.every(looksLikeSingleTitle)) return null;
    return { title: shape.title, author: m ? m[2].trim() : '', malformed: true, plain: true, candidates: shape.candidates };
  }
  const clean = raw.match(CLEAN_BOOK_RE);
  if (clean && titles.length === 1) {
    return { title: clean[1].trim(), author: (clean[2] || '').trim(), malformed: false, candidates: [clean[1].trim()] };
  }
  const tail = raw.slice(raw.lastIndexOf('』') + 1);
  const am = tail.match(/[-–—]\s*([^『』]+)$/);
  return { title: titles[0], author: am ? am[1].trim() : '', malformed: true, candidates: titles.slice(0, 3) };
}

// シートの行のうち、関連書籍の節の中の本（### の行）とその説明の行の範囲。
// 返り値: [{ title, author, malformed, candidates, start, end }]（end は次の ### / ## の行・含まない）
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
      const b = parseRelatedBookLine(h3[1]);
      if (b) cur = { ...b, start: i, end: lines.length };
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
  if (entries.length === 0 || typeof verify !== 'function') return { sheet: text, removed: [], fixed: [] };
  const withTimeout = (p) => new Promise((resolve) => {
    const t = setTimeout(() => resolve({ exists: null }), timeoutMs);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve({ exists: null }); });
  });
  const check = (title, author) => {
    try { return withTimeout(verify({ title, author })); } catch { return Promise.resolve({ exists: null }); }
  };
  // きれいな行は 1 冊を確かめる。崩れた行は『』の中の書名を順に確かめ、見つかった最初の 1 冊を選ぶ。
  //   どれも「無い」と分かった崩れた行は消す。1 つでも確かめられなかったら（通信の失敗など）消さずに残す
  //   （画面には出さない・次に開いたときにまた確かめる。オフラインで開いただけで本が消えないように）。
  const results = await Promise.all(entries.map(async (e) => {
    if (!e.malformed) return { exists: (await check(e.title, e.author))?.exists ?? null };
    const rs = await Promise.all(e.candidates.map((t) => check(t, e.author)));
    const k = rs.findIndex((r) => r?.exists === true);
    if (k >= 0) return { exists: true, pick: e.candidates[k] };
    return rs.every((r) => r?.exists === false) ? { exists: false } : { exists: null };
  }));
  // 崩れた行は、見つかった 1 冊だけの行に書き直す（行の数は変えない）。見つからなければ消す。
  const lines = text.split('\n');
  const fixed = [];
  entries.forEach((e, i) => {
    if (!e.malformed || !results[i].pick) return;
    const prefix = (lines[e.start].match(/^(###\s+(?:\d+\.\s*)?)/) || ['### '])[0];
    lines[e.start] = `${prefix}『${results[i].pick}』${e.author ? ` - ${e.author}` : ''}`;
    fixed.push(results[i].pick);
  });
  const rewritten = lines.join('\n');
  const dropped = entries.filter((_, i) => results[i]?.exists === false);
  if (dropped.length === 0) return { sheet: rewritten, removed: [], fixed };
  return { sheet: dropRelatedBooks(rewritten, dropped.map((e) => e.start)), removed: dropped.map((e) => e.title), fixed };
}

// シートに崩れた関連書籍の行（2 冊を混ぜた行など）があるか。保存済みのシートを開いたときに直すかどうかに使う。
export function hasMalformedRelatedBooks(sheet) {
  return relatedBookEntries(sheet).some((e) => e.malformed);
}
