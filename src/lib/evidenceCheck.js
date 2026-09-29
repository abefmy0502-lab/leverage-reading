// 🔖 相談の「根拠を見る」の引用を、実際に保存されているメモと突き合わせる（2026-09-29）。
//
// AI は【参照した本のメモ】（まとめて）や「根拠：p.25「…」」（本ごとに）に、メモの一節を引用する。
// 言い換えた引用・作った引用をそのまま見せると「自分のメモから答えている」という信頼が崩れるので、
// 答えを書き終えたところで、渡したメモ（sources）と照らし合わせる:
//   - 一致した引用（空白・句読点・かっこの違いは無視／ほぼ同じ文字の並び）→ 実際のメモの文を見せる
//   - 一致しない引用 → 見せない（「メモと一致しなかったので、表示していません」）
//   - 引用のない要約の行 → 同じ本（とページ）のメモと十分に重なれば実際のメモを、そうでなければ AI の要約のまま
// 結果は chat_messages.refs に目印（QUOTE_PREFIX）つきの文字列で残す（表を増やさずに過去の相談にも残す）。
// 画面側（MyBookBrain.jsx）は decodeQuoteRefs で読み戻す。目印の無い古い答えは、これまでどおり AI の文で見せる。
//
// ⚠️ src では正規表現の後読み（lookbehind）を使わない（古い iOS の Safari で構文エラーになるため）。

export const QUOTE_PREFIX = '🔖 ';

// 見せるメモの文の長さの上限（履歴に残す量を抑える）
const MEMO_SHOW_MAX = 240;
const LINE_SHOW_MAX = 200;

// 照合用に整える: 全角/半角をそろえ、空白・句読点・かっこ・記号を落として小文字に。
const PUNCT_RE = /[\s　、。，．,.!！?？・:：;；「」『』（）()[\]【】〈〉《》"'“”‘’…‥―—~〜\-_/／|｜*#]/g;
export function normalizeForMatch(text) {
  let s = String(text || '');
  try { s = s.normalize('NFKC'); } catch { /* 古い環境ではそのまま */ }
  return s.toLowerCase().replace(PUNCT_RE, '');
}

function bigrams(s) {
  const out = [];
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

// quote の文字の並び（2 文字ずつ）のうち、memo にも出てくる割合（0〜1）。
export function overlapRatio(quote, memo) {
  const q = normalizeForMatch(quote);
  const m = normalizeForMatch(memo);
  if (!q || !m) return 0;
  if (m.includes(q)) return 1;
  const qg = bigrams(q);
  if (qg.length === 0) return 0;
  const mg = new Set(bigrams(m));
  let hit = 0;
  qg.forEach((g) => { if (mg.has(g)) hit += 1; });
  return hit / qg.length;
}

// 引用がメモの中にあるか。整えたうえでの部分一致、または文字の並びがほぼ同じ（85% 以上）。
// 短い引用（4 文字未満）は部分一致だけ（偶然の一致で「確かめた」にしない）。
export function quoteInMemo(quote, memo) {
  const q = normalizeForMatch(quote);
  const m = normalizeForMatch(memo);
  if (!q || !m) return false;
  if (m.includes(q)) return true;
  if (q.length < 4) return false;
  // 「…」で省いた引用は、省いた前後がそれぞれメモにあれば一致とみなす
  const parts = String(quote).split(/[…‥]+|\.{3,}/).map(normalizeForMatch).filter((p) => p.length >= 2);
  if (parts.length > 1 && parts.every((p) => m.includes(p))) return true;
  return overlapRatio(q, m) >= 0.85;
}

// 「」の中身を取り出す（入れ子の「」も 1 つの引用として扱う。閉じていなければ行末まで）。
export function extractQuotes(line) {
  const out = [];
  const s = String(line || '');
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '「') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '」' && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        out.push({ text: s.slice(start + 1, i), start, end: i + 1 });
        start = -1;
      }
    }
  }
  if (depth > 0 && start >= 0) out.push({ text: s.slice(start + 1), start, end: s.length });
  return out.filter((q) => q.text.trim());
}

const normTitle = (t) => normalizeForMatch(t);
const clip = (t, n) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function titleOf(line) {
  const m = String(line || '').match(/『([^』]+)』/);
  return m ? m[1].trim() : '';
}
function pageOf(line) {
  const m = String(line || '').match(/(?:^|[^A-Za-z])[pP]\.?\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

// 行の本（書名・学び）に当たるメモの候補。書名が無ければ全部。
function candidatesFor(line, sources) {
  const title = titleOf(line);
  if (!title) {
    if (/自分の学び|学びログ|あなたの学び/.test(line)) return sources.filter((s) => s.personal);
    return sources;
  }
  const t = normTitle(title);
  const same = sources.filter((s) => !s.personal && s.title && (normTitle(s.title) === t || normTitle(s.title).includes(t) || t.includes(normTitle(s.title))));
  return same;
}

// 引用の無い行から、照合に使う言葉（書名・ページ・「より：」などの前置きを除いた部分）を取り出す。
function paraphraseOf(line) {
  return String(line || '')
    .replace(/『[^』]*』/g, ' ')
    .replace(/[（(]?\s*[pP]\.?\s*\d+\s*[)）]?/g, ' ')
    .replace(/^.*?(?:より|のメモ|から)\s*[:：]\s*/, '')
    .trim();
}

// 1 行（参照したメモの 1 項目）を確かめる。
//   { title, page, status: 'ok' | 'ng' | 'none', memo: 見せるメモの文 | '', line: AI の行（要約のまま見せるとき） }
export function verifyRefLine(rawLine, sources) {
  const line = String(rawLine || '').replace(/^\s*(?:[-*・•]|\d+[.)．])\s*/, '').trim();
  const title = titleOf(line);
  const page = pageOf(line);
  const cands = candidatesFor(line, sources || []);
  const quotes = extractQuotes(line);
  if (quotes.length > 0) {
    let matched = null;
    const allOk = quotes.every((q) => {
      const hit = cands.find((s) => quoteInMemo(q.text, s.text));
      if (hit && !matched) matched = hit;
      return !!hit;
    });
    if (allOk && matched) {
      return { title: title || matched.title || '', page: page ?? matched.page ?? null, status: 'ok', memo: clip(matched.text, MEMO_SHOW_MAX), line: '' };
    }
    return { title, page, status: 'ng', memo: '', line: '' };
  }
  // 引用の無い要約: 十分に重なるメモ（60% 以上）→ そのメモ。無ければ、ページまで同じメモが 1 件だけならそのメモ。
  const para = paraphraseOf(line);
  let best = null;
  let bestScore = 0;
  cands.forEach((s) => {
    const r = overlapRatio(para, s.text);
    if (r > bestScore) { bestScore = r; best = s; }
  });
  if (best && bestScore >= 0.6 && normalizeForMatch(para).length >= 6) {
    return { title: title || best.title || '', page: page ?? best.page ?? null, status: 'ok', memo: clip(best.text, MEMO_SHOW_MAX), line: '' };
  }
  if (page != null) {
    const byPage = cands.filter((s) => Number(s.page) === page);
    if (byPage.length === 1) {
      return { title: title || byPage[0].title || '', page, status: 'ok', memo: clip(byPage[0].text, MEMO_SHOW_MAX), line: '' };
    }
  }
  return { title, page, status: 'none', memo: '', line: clip(line, LINE_SHOW_MAX) };
}

// 答えの本文から、見出し（【…】）ごとの節を取り出す。
function sectionsOf(body) {
  const out = {};
  let key = null;
  String(body || '').split('\n').forEach((raw) => {
    const h = raw.match(/^\s*【(.+?)】\s*(.*)$/);
    if (h) {
      key = h[1];
      out[key] = out[key] || [];
      if (h[2]) out[key].push(h[2]);
      return;
    }
    if (key) out[key].push(raw);
  });
  return out;
}

// 答え全体を確かめる。返り値は refs に足す文字列（QUOTE_PREFIX つき）の配列。
//   まとめて: 【参照した本のメモ】の 1 行ごと（k: 'r'）
//   本ごとに: ◆『書名』の「根拠：」ごと（k: 'b'・一致しないときだけ意味がある）
export function verifyAnswerQuotes(body, sources) {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const secs = sectionsOf(body);
  const out = [];
  Object.keys(secs).forEach((name) => {
    if (/参照/.test(name)) {
      secs[name].map((l) => l.trim()).filter(Boolean).forEach((l) => {
        // 「（原則 2〜3 冊…）」のような注記の行は飛ばす
        if (/^[（(].*[)）]$/.test(l)) return;
        const v = verifyRefLine(l, sources);
        out.push({ k: 'r', t: v.title, p: v.page, s: v.status, x: v.memo, l: v.line });
      });
    } else if (/本ごと/.test(name)) {
      let cur = null;
      secs[name].forEach((raw) => {
        const l = raw.trim();
        const h = l.match(/^(?:[-*・]\s*)?[◆◇■]\s*(.*)$/);
        if (h) { cur = titleOf(h[1]) || h[1].split(/[｜|]/)[0].trim(); return; }
        const b = l.match(/^(?:[-*・]\s*)?(?:\*\*)?(?:根拠|引用)(?:\*\*)?\s*[：:]\s*(.*)$/);
        if (!cur || !b) return;
        const quotes = extractQuotes(b[1]);
        if (quotes.length === 0) return;
        const cands = candidatesFor(`『${cur}』`, sources);
        const ok = quotes.every((q) => cands.some((s) => quoteInMemo(q.text, s.text)));
        out.push({ k: 'b', t: cur, p: pageOf(b[1]), s: ok ? 'ok' : 'ng', x: '', l: '' });
      });
    }
  });
  return out.map((o) => `${QUOTE_PREFIX}${JSON.stringify(o)}`);
}

// refs から、確かめた結果を読み戻す（壊れた行は捨てる）。
export function decodeQuoteRefs(refs) {
  if (!Array.isArray(refs)) return [];
  const out = [];
  refs.forEach((r) => {
    const s = String(r || '');
    if (!s.startsWith(QUOTE_PREFIX)) return;
    try {
      const o = JSON.parse(s.slice(QUOTE_PREFIX.length));
      if (o && typeof o === 'object' && (o.k === 'r' || o.k === 'b')) out.push(o);
    } catch { /* ignore */ }
  });
  return out;
}

// 本ごとの「根拠：」の引用からだけ、メモと一致しなかった引用を外す（ページは残す）。
export function stripQuotes(text) {
  const s = String(text || '');
  const qs = extractQuotes(s);
  if (qs.length === 0) return s;
  let out = '';
  let at = 0;
  qs.forEach((q) => { out += s.slice(at, q.start); at = q.end; });
  out += s.slice(at);
  return out.replace(/\s+/g, ' ').trim();
}
