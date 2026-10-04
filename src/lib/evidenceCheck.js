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

// 「p.25」「(p.25)」「P. 25」を行から外す（メモに無いページを、事実のように見せない）。
export function stripPageRefs(text) {
  return String(text || '')
    .replace(/\s*[（(]\s*[pP]\.?\s*\d+\s*[)）]/g, '')
    .replace(/(^|[^A-Za-z])[pP]\.\s?\d+/g, '$1')
    .replace(/[ 　]{2,}/g, ' ')
    .trim();
}

// 1 行（参照したメモの 1 項目）を確かめる。
//   { title, page, status: 'ok' | 'ng' | 'none' | 'x', memo: 見せるメモの文 | '', line: AI の行（要約のまま見せるとき）,
//     personal: 学び（本の無いメモ）の行か, date: 一致した学びの記録日 'YYYY-MM-DD' | '' }
//   学びは書名が無いので、画面では「自分の学び（M月D日）」を見出しにする（2026-09-29）。
//   'x'（2026-10-04）: 渡したメモに無い本・学び（AI が材料の外から持ち出した参照）。画面には出さない
//     （それまでは 'none' として AI の文のまま「参照したメモ」に出ていた＝本棚に無い本・作ったページも出ていた）。
//   ページ（2026-10-04）: 一致したメモのページだけを使う（AI が書いたページではなく）。AI の文のまま見せる行は、
//     その本のメモに無いページを外す。
export function verifyRefLine(rawLine, sources) {
  const line = String(rawLine || '').replace(/^\s*(?:[-*・•]|\d+[.)．])\s*/, '').trim();
  const title = titleOf(line);
  const page = pageOf(line);
  const personalLine = !title && /自分の学び|学びログ|あなたの学び/.test(line);
  const withPersonal = (r, m) => ({
    ...r,
    personal: !!(m?.personal || personalLine),
    date: m?.personal && m.created_at ? String(m.created_at).slice(0, 10) : '',
    // 一致したメモそのもの（本を探す問いの答えで、押すとそのメモを開く・日付を出す・2026-09-30）
    memoId: m?.card && m.id ? String(m.id) : '',
    bookId: m?.book_id ? String(m.book_id) : '',
    createdAt: m?.created_at ? String(m.created_at).slice(0, 10) : '',
  });
  const cands = candidatesFor(line, sources || []);
  // 渡したメモに無い本・学び → 出さない（'x'）
  if ((title || personalLine) && cands.length === 0) {
    return withPersonal({ title, page: null, status: 'x', memo: '', line: '' }, null);
  }
  const pageOfMemo = (m) => (m && Number.isFinite(Number(m.page)) && m.page != null ? Number(m.page) : null);
  const quotes = extractQuotes(line);
  if (quotes.length > 0) {
    let matched = null;
    const allOk = quotes.every((q) => {
      const hit = cands.find((s) => quoteInMemo(q.text, s.text));
      if (hit && !matched) matched = hit;
      return !!hit;
    });
    if (allOk && matched) {
      return withPersonal({ title: title || matched.title || '', page: pageOfMemo(matched), status: 'ok', memo: clip(matched.text, MEMO_SHOW_MAX), line: '' }, matched);
    }
    return withPersonal({ title, page: cands.some((s) => pageOfMemo(s) === page) ? page : null, status: 'ng', memo: '', line: '' }, null);
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
    return withPersonal({ title: title || best.title || '', page: pageOfMemo(best), status: 'ok', memo: clip(best.text, MEMO_SHOW_MAX), line: '' }, best);
  }
  if (page != null) {
    const byPage = cands.filter((s) => Number(s.page) === page);
    if (byPage.length === 1) {
      return withPersonal({ title: title || byPage[0].title || '', page, status: 'ok', memo: clip(byPage[0].text, MEMO_SHOW_MAX), line: '' }, byPage[0]);
    }
  }
  // AI の文のまま見せる。その本のメモに無いページは外す（作ったページを事実のように見せない）。
  const pageKnown = page != null && cands.some((s) => pageOfMemo(s) === page);
  const shown = page != null && !pageKnown ? stripPageRefs(line) : line;
  return withPersonal({ title, page: pageKnown ? page : null, status: 'none', memo: '', line: clip(shown, LINE_SHOW_MAX) }, null);
}

// AI が REFS に挙げた参照（「📚 著者『書名』p.25」「💡 自分の学び (2026-08-15 / 仕事)」）を、
// 渡したメモと突き合わせて整える（2026-10-04・「もとになった本」・相談相手のアイコン・行動を付ける本に使われる）。
//   - 渡したメモに無い本の行は消す（AI が材料の外から持ち出した本＝本棚に無い本・歩みにだけ出てくる本）
//   - 1 行に 2 冊（『』が 2 つ以上）は、渡したメモにある本だけを 1 冊 1 行に分ける
//   - その本のメモに無いページは外す。学びの日付は、その日に書いた学びが無ければ外す
//   - 学びの行は、渡したメモに学びが無ければ消す。書名も学びも無い行はそのまま
// sources が無い（確かめられない）ときはそのまま返す。
export function groundRefs(refs, sources) {
  if (!Array.isArray(refs)) return [];
  if (!Array.isArray(sources) || sources.length === 0) return refs.slice();
  const books = sources.filter((s) => !s.personal && s.title);
  const personal = sources.filter((s) => s.personal);
  const bookFor = (t) => {
    const n = normTitle(t);
    if (!n) return null;
    return books.find((s) => normTitle(s.title) === n) || books.find((s) => normTitle(s.title).includes(n) || n.includes(normTitle(s.title))) || null;
  };
  const out = [];
  refs.forEach((raw) => {
    const r = String(raw || '').trim();
    if (!r) return;
    const titles = [...r.matchAll(/『([^』]+)』/g)].map((m) => m[1].trim()).filter(Boolean);
    if (titles.length === 0) {
      if (/自分の学び|学びログ|あなたの学び/.test(r)) {
        if (personal.length === 0) return;
        const d = (r.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
        const dateOk = !d || personal.some((s) => String(s.created_at || '').startsWith(d));
        const noDate = r.replace(/\d{4}-\d{2}-\d{2}\s*/, '').replace(/([（(])\s+/, '$1').replace(/\s*[（(]\s*[)）]/, '');
        out.push(dateOk ? r : noDate);
        return;
      }
      out.push(r);
      return;
    }
    const known = titles.filter((t) => bookFor(t));
    if (known.length === 0) return;
    if (titles.length > 1) {
      // 2 冊を 1 行に混ぜた参照 → 渡したメモにある本だけ、1 冊 1 行（著者・ページは誰のものか分からないので付けない）
      const lead = (r.match(/^[^\p{L}\p{N}『「(（]+/u) || [''])[0].trim();
      known.forEach((t) => out.push(`${lead ? `${lead} ` : ''}『${bookFor(t).title}』`));
      return;
    }
    const page = pageOf(r);
    if (page == null) { out.push(r); return; }
    const bookTitle = normTitle(bookFor(titles[0]).title);
    const same = books.filter((s) => normTitle(s.title) === bookTitle);
    const pageOk = same.some((s) => s.page != null && Number(s.page) === page);
    out.push(pageOk ? r : stripPageRefs(r));
  });
  return [...new Set(out)];
}

// 答えの根拠が 1 件でも渡したメモで確かめられたか（2026-10-04 ui-critic）。
//   refs: groundRefs で突き合わせたあとの REFS・checks: decodeQuoteRefs の結果。
//   REFS が 1 行でも残った・参照の行が渡したメモの本に当たった（'ok' か AI の要約のまま見せる 'none'）なら true。
//   全部が渡したメモに無い（'x'）・一致しない引用（'ng'）だけ・何も挙げていない → false（「あなたのメモ N 件から答えました」を付けない）。
export function hasGroundedEvidence(refs, checks) {
  if (Array.isArray(refs) && refs.some((r) => String(r || '').trim())) return true;
  return (Array.isArray(checks) ? checks : []).some((c) => c && (c.s === 'ok' || c.s === 'none'));
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
        // u: 学びの行（書名が無い）・d: 一致した学びの記録日（見出し「自分の学び（M月D日）」用）
        // i: 一致したカード式のメモの id・b: その本の id・c: そのメモの記録日（本を探す問いの答えの行・2026-09-30）
        out.push({ k: 'r', t: v.title, p: v.page, s: v.status, x: v.memo, l: v.line, ...(v.personal ? { u: 1 } : null), ...(v.date ? { d: v.date } : null), ...(v.memoId ? { i: v.memoId } : null), ...(v.bookId ? { b: v.bookId } : null), ...(v.createdAt ? { c: v.createdAt } : null) });
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
        const hits = quotes.map((q) => cands.find((s) => quoteInMemo(q.text, s.text)) || null);
        const ok = hits.every(Boolean);
        // ページ（2026-10-04）: 一致したメモのページ（無ければ、その本のメモにあるページのときだけ AI の書いたページ）。
        //   AI の書いたページが違う・メモに無いときは w: 1（画面は根拠の文からページを外す）。
        const aiPage = pageOf(b[1]);
        const memoPage = ok && hits[0] && hits[0].page != null ? Number(hits[0].page) : null;
        const known = aiPage != null && cands.some((s) => s.page != null && Number(s.page) === aiPage);
        const p = ok ? memoPage : (known ? aiPage : null);
        const wrongPage = aiPage != null && aiPage !== p;
        out.push({ k: 'b', t: cur, p, s: ok ? 'ok' : 'ng', x: '', l: '', ...(wrongPage ? { w: 1 } : null) });
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
