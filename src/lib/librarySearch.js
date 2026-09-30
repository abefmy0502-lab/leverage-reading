// 🔎 すべての本の検索（2026-09-30 オーナー要望「本棚の検索に『こんな感じのこと書いていたの、
// なんの本だったかな？』の検索ができるようになりたい」）。
//
// 書名・著者・タグに加えて、自分のメモ（カード式の本文・タグ）・この本のまとめ・読書準備
// （得たいこと・現在の課題・仮説・選書理由・一番の収穫）の言葉からも本を探す。
// AI も通信も使わない（端末の中だけ・すぐ出る・トークンを使わない）純粋な関数だけを置く。
//
// - 正規化: NFKC（全角/半角）・小文字・カタカナ→ひらがな（「バッファ」も「ばっふぁ」も同じ）
// - 言葉の区切り: 空白・、。・！？「」（）など（「断る 持ち帰る」「断る、持ち帰る」）
// - どれかの言葉を含む本を出す。並びは 書名・著者・タグで見つかった本 → メモなどで見つかった本、
//   その中は 見つかった言葉の数 → 見つかった場所の重み の順（同じなら渡された並びのまま）
// - うろ覚えのために、そのままでは見つからない言葉は
//   ①語尾のひらがなを外した形（「持ち帰った」→「持ち帰」）
//   ②2 文字ずつの切れ端がどれだけ含まれるか（「予定を詰め込まない」→「予定を詰めすぎない」）
//   でも探す（どちらも少し軽く数える）
// - メモで見つかった本には、いちばん合うメモの一節（約 40 字・見つかった言葉に印）を添える

// ---- 正規化 ---------------------------------------------------------------

const COMBINING_VOICED = 0x3099;
const COMBINING_SEMI = 0x309a;

// 1 文字（コードポイント）を正規化した文字列にする。
function normChar(ch) {
  const c = ch.codePointAt(0);
  if (c < 0x80) return ch.toLowerCase();
  // ひらがな・漢字はそのまま（よく出る文字を速く通す）
  if ((c >= 0x3041 && c <= 0x309f) || (c >= 0x4e00 && c <= 0x9fff)) return ch;
  // カタカナ → ひらがな（ァ〜ヶ・ヽヾ）
  if ((c >= 0x30a1 && c <= 0x30f6) || c === 0x30fd || c === 0x30fe) return String.fromCodePoint(c - 0x60);
  // 半角カタカナなどは NFKC で全角カタカナになる → ひらがなへ
  let out = '';
  for (const x of ch.normalize('NFKC').toLowerCase()) {
    const xc = x.codePointAt(0);
    out += (xc >= 0x30a1 && xc <= 0x30f6) || xc === 0x30fd || xc === 0x30fe ? String.fromCodePoint(xc - 0x60) : x;
  }
  return out;
}

// 正規化した文字列と、正規化後の各 UTF-16 単位が元の文字列のどこから来たか（start / end）。
// 印を付ける場所（元の文字列の範囲）を求めるのに使う。
export function normalizeWithMap(text) {
  const src = String(text ?? '');
  let norm = '';
  const start = [];
  const end = [];
  let i = 0;
  for (const ch of src) {
    const len = ch.length;
    const n = normChar(ch);
    const c0 = n.codePointAt(0);
    // 半角の濁点・半濁点（NFKC で結合文字になる）は前の文字と合わせる（「ｶﾞ」→「が」）
    if (n.length === 1 && (c0 === COMBINING_VOICED || c0 === COMBINING_SEMI) && norm.length > 0) {
      const prev = norm[norm.length - 1];
      const merged = (prev + n).normalize('NFC');
      if (merged.length === 1) {
        norm = norm.slice(0, -1) + merged;
        end[end.length - 1] = i + len;
        i += len;
        continue;
      }
    }
    for (let k = 0; k < n.length; k += 1) { start.push(i); end.push(i + len); }
    norm += n;
    i += len;
  }
  return { norm, start, end };
}

export function normalizeSearch(text) {
  return normalizeWithMap(text).norm;
}

// ---- 言葉の区切り ---------------------------------------------------------

// 正規化のあと（全角の！？（）などは半角になっている）に区切る記号。「ー」「-」は語の中にあるので区切らない。
const SEPARATORS = /[\s、。,.・!?「」『』()【】[\]{}<>〈〉《》"'“”‘’:;/\\|…‥〜~]+/u;
const MAX_TERMS = 8;
const isKanaOnly1 = (t) => [...t].length === 1 && /^[ぁ-ゟ]$/u.test(t);

export function splitQuery(query) {
  const norm = normalizeSearch(String(query ?? '').slice(0, 200));
  const seen = new Set();
  const terms = [];
  for (const t of norm.split(SEPARATORS)) {
    const term = t.trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  // ひらがな 1 文字（「の」「を」）は、ほかに言葉があれば外す（ほぼ全部の本に当たるため）
  const useful = terms.filter((t) => !isKanaOnly1(t));
  return (useful.length ? useful : terms).slice(0, MAX_TERMS);
}

// ---- 1 つの言葉の探し方 ---------------------------------------------------

// 語尾のひらがな（送りがな）を外した形（「持ち帰った」→「持ち帰」）。漢字で終わる形だけ
// （カタカナはひらがなにそろえてあるので、「チーム」→「ちー」のように外さない）。2 文字未満なら null。
export function stemOf(term) {
  const m = term.match(/^(.*[一-鿿々])[ぁ-ゟ]+$/u);
  if (!m) return null;
  const s = m[1];
  return [...s].length >= 2 ? s : null;
}

function bigramsOf(term) {
  const chars = [...term];
  const out = [];
  for (let i = 0; i < chars.length - 1; i += 1) {
    const bg = chars[i] + chars[i + 1];
    if (!/\s/u.test(bg) && !out.includes(bg)) out.push(bg);
  }
  return out;
}

const PARTIAL_MIN = 0.6; // 切れ端の 6 割以上が含まれれば「近い」とみなす

// 言葉ごとの探し方を前もって作る（exact / stem / 2 文字の切れ端）。
export function compileTerms(terms) {
  return terms.map((t) => {
    const len = [...t].length;
    return {
      term: t,
      stem: len >= 3 ? stemOf(t) : null,
      // 4 文字以上のときだけ（短い言葉は切れ端がほぼ言葉そのもの）
      bigrams: len >= 4 ? bigramsOf(t) : [],
    };
  });
}

// 正規化した文字列 hay の中で、言葉 ct がどう見つかるか。{ kind: 'exact'|'stem'|'partial', weight } | null
export function matchTerm(hay, ct) {
  if (!hay) return null;
  if (hay.includes(ct.term)) return { kind: 'exact', weight: 1 };
  if (ct.stem && hay.includes(ct.stem)) return { kind: 'stem', weight: 0.7 };
  if (ct.bigrams.length >= 3) {
    let hit = 0;
    for (const bg of ct.bigrams) if (hay.includes(bg)) hit += 1;
    const cover = hit / ct.bigrams.length;
    if (cover >= PARTIAL_MIN) return { kind: 'partial', weight: 0.5 * cover };
  }
  return null;
}

// ---- 本とメモの索引 -------------------------------------------------------

// 読書準備など、本に書いた欄（名前は GLOSSARY・画面の見出しと同じ）。
export const PREP_FIELDS = [
  ['investPurpose', '得たいこと'],
  ['currentChallenge', '現在の課題'],
  ['hypothesis', '仮説'],
  ['bookReason', '選書理由'],
  ['roiSummary', '一番の収穫'],
];

const WEIGHT = { title: 100, author: 80, tag: 60, memo: 30, summary: 26, prep: 20 };
const TEXT_ORDER = { memo: 0, summary: 1, prep: 2 };

// books: アプリの本（camelCase）/ memos: book_memos の行（book_id・text・page_number・tags・id）。
// 本ごとに正規化した文字列をまとめる（メモを読み込み直したときと本が変わったときだけ作り直す）。
export function buildLibraryIndex(books = [], memos = []) {
  const byBook = new Map();
  for (const m of memos || []) {
    const bookId = m?.book_id ?? m?.bookId;
    const text = String(m?.text || '');
    if (bookId == null || !text.trim()) continue;
    if (!byBook.has(bookId)) byBook.set(bookId, []);
    const tags = (m.tags || []).filter((t) => typeof t === 'string' && t && !t.startsWith('@'));
    byBook.get(bookId).push({
      kind: 'memo',
      id: m.id,
      page: Number.isFinite(m.page_number ?? m.pageNumber) ? (m.page_number ?? m.pageNumber) : null,
      text,
      norm: normalizeSearch(text),
      tagNorm: tags.length ? normalizeSearch(tags.join(' ')) : '',
      createdAt: m.created_at || m.createdAt || '',
    });
  }
  return (books || []).map((b) => {
    const texts = [...(byBook.get(b.id) || [])];
    const summary = String(b.leverageMemo || '');
    if (summary.trim()) texts.push({ kind: 'summary', label: 'この本のまとめ', text: summary, norm: normalizeSearch(summary) });
    for (const [key, label] of PREP_FIELDS) {
      const v = String(b[key] || '');
      if (v.trim()) texts.push({ kind: 'prep', label, text: v, norm: normalizeSearch(v) });
    }
    return {
      book: b,
      title: normalizeSearch(b.title || ''),
      author: normalizeSearch(b.author || ''),
      tags: (b.tags || []).map((t) => normalizeSearch(t || '')).filter(Boolean),
      texts,
    };
  });
}

// ---- 一節（スニペット） ---------------------------------------------------

export const SNIPPET_CHARS = 40;

// 元の文字列の中で、言葉（exact / stem / 切れ端）が当たった範囲 [s, e)（元の文字列の位置）を集める。
export function matchRanges(text, compiled) {
  const { norm, start, end } = normalizeWithMap(text);
  const ranges = [];
  const addAll = (needle) => {
    if (!needle) return;
    let from = 0;
    for (;;) {
      const k = norm.indexOf(needle, from);
      if (k < 0) break;
      ranges.push([start[k], end[k + needle.length - 1]]);
      from = k + needle.length;
    }
  };
  for (const ct of compiled) {
    const m = matchTerm(norm, ct);
    if (!m) continue;
    if (m.kind === 'exact') addAll(ct.term);
    else if (m.kind === 'stem') addAll(ct.stem);
    else ct.bigrams.forEach(addAll);
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

// 約 40 字の一節と、印を付ける所。[{ text, match }]（先頭・末尾を切ったら「…」を付ける）。
// 見つかった言葉の文の頭から始める（文の頭が遠いときは、言葉の少し前から）。
export function buildSnippet(text, compiled, { chars = SNIPPET_CHARS, lead = 10, sentenceReach = 24 } = {}) {
  const src = String(text || '');
  const ranges = matchRanges(src, compiled);
  const anchor = ranges.length ? ranges[0][0] : 0;
  const before = src.slice(0, anchor);
  const sentStart = Math.max(before.lastIndexOf('。'), before.lastIndexOf('\n'), before.lastIndexOf('！'), before.lastIndexOf('？'), before.lastIndexOf('!'), before.lastIndexOf('?')) + 1;
  let s = anchor - sentStart <= sentenceReach ? sentStart : Math.max(0, anchor - lead);
  let e = Math.min(src.length, s + chars);
  // 前後の空白・改行は落とす
  while (s < e && /\s/u.test(src[s])) s += 1;
  while (e > s && /\s/u.test(src[e - 1])) e -= 1;
  // サロゲートペアの途中で切らない
  if (s > 0 && /[\udc00-\udfff]/.test(src[s])) s -= 1;
  if (e < src.length && /[\udc00-\udfff]/.test(src[e])) e += 1;
  const segments = [];
  const push = (t, match) => {
    const v = t.replace(/\s+/gu, ' ');
    if (!v) return;
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += v;
    else segments.push({ text: v, match });
  };
  if (s > 0) push('…', false);
  let pos = s;
  for (const [a, b] of ranges) {
    if (b <= s || a >= e) continue;
    const ra = Math.max(a, s);
    const rb = Math.min(b, e);
    if (ra > pos) push(src.slice(pos, ra), false);
    push(src.slice(ra, rb), true);
    pos = rb;
  }
  if (pos < e) push(src.slice(pos, e), false);
  if (e < src.length) push('…', false);
  return segments;
}

// ---- 検索 -----------------------------------------------------------------

// index: buildLibraryIndex の結果（並びは画面の並び順＝同点のときの順）。
// 返り値: { terms, results: [{ book, meta, matched, score, hit }] }（見つかった本だけ・並べ替え済み）
//   meta:    書名・著者・タグで見つかった（先に並べる・一節は出さない）
//   matched: 見つかった言葉の数（切れ端・語尾を外した形も 1 と数える）
//   hit:     メモなどで見つかったときの一節 { kind: 'memo'|'summary'|'prep', memoId, page, label, segments } | null
export function searchLibrary(index, query) {
  const terms = splitQuery(query);
  if (!terms.length) return { terms, results: [] };
  const compiled = compileTerms(terms);
  const results = [];
  (index || []).forEach((entry, order) => {
    let matched = 0;
    let score = 0;
    let meta = false;
    const metaTerms = new Set();
    compiled.forEach((ct, ti) => {
      let best = 0;
      const exactOrStem = (hay, w) => {
        const m = matchTerm(hay, ct);
        if (m && m.kind !== 'partial') { best = Math.max(best, w * m.weight); return true; }
        return false;
      };
      // 書名・著者・タグは 3 つとも見る（いちばん重い場所を best に残すため、途中でやめない）
      const inTitle = exactOrStem(entry.title, WEIGHT.title);
      const inAuthor = exactOrStem(entry.author, WEIGHT.author);
      const inTags = entry.tags.map((t) => exactOrStem(t, WEIGHT.tag)).some(Boolean);
      if (inTitle || inAuthor || inTags) {
        meta = true;
        metaTerms.add(ti);
      }
      for (const tx of entry.texts) {
        const m = matchTerm(tx.norm, ct) || (tx.tagNorm && matchTerm(tx.tagNorm, ct));
        if (m) best = Math.max(best, WEIGHT[tx.kind] * m.weight);
      }
      if (best > 0) { matched += 1; score += best; }
    });
    if (!matched) return;
    // 一節: 書名・著者で見つからなかった言葉が、いちばん多く・強く当たる文から
    let hit = null;
    const rest = compiled.filter((_, ti) => !metaTerms.has(ti));
    if (rest.length) {
      let bestTx = null;
      let bestKey = null;
      for (const tx of entry.texts) {
        let n = 0;
        let w = 0;
        for (const ct of rest) {
          const m = matchTerm(tx.norm, ct);
          if (m) { n += 1; w += m.weight; }
        }
        if (!n) continue;
        const key = [n, w, -TEXT_ORDER[tx.kind]];
        const better = !bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])));
        if (better) { bestTx = tx; bestKey = key; }
      }
      if (bestTx) {
        hit = {
          kind: bestTx.kind,
          memoId: bestTx.kind === 'memo' ? bestTx.id : null,
          page: bestTx.kind === 'memo' ? bestTx.page : null,
          label: bestTx.kind === 'memo' ? null : bestTx.label,
          segments: buildSnippet(bestTx.text, rest),
        };
      }
    }
    results.push({ book: entry.book, meta, matched, score, hit, order });
  });
  results.sort((a, b) => (Number(b.meta) - Number(a.meta)) || (b.matched - a.matched) || (b.score - a.score) || (a.order - b.order));
  return { terms, results };
}

// 相談で探すときの問い（送らずに入力欄に入れる）。長い言葉は 40 字で切る。
export function consultQuestionFor(query) {
  const q = String(query || '').replace(/\s+/gu, ' ').trim();
  const short = [...q].length > 40 ? `${[...q].slice(0, 40).join('')}…` : q;
  return `『${short}』みたいなことを書いた本はどれ？`;
}
