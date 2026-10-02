// 📚 本の検索結果の「並べ方」と「著者名の整え方」（2026-10-02）。
//
// サーバーの本の検索（api/cover.js の ?search=・api/_bookSearch.js）と、端末の予備の検索
// （src/lib/bookSearch.js・BookSearchModal.jsx）の両方から使う。外部に出ない純粋な関数だけ。
// ファイル名が _ で始まるので Vercel のルートにはならない。流れと理由は docs/book-search.md。
//
// 並べ方（rankBooks）: まず検索語と書名・著者の一致の段（まるごと > 頭 > 途中 > 副題だけ・著者に当たった語）、
// 同じ段の中で よく売れている順（楽天の売上順の位置・レビュー件数）・ISBN・表紙の有無・新しさ（弱く）、
// 図書館にしか無い古い本・学術の出版は下げる（段はまたがない）。どの語も書名・著者に無い本（説明文だけで当たった本）は、関係する本が十分ある
// ときは外す。

// ─── 文字の正規化 ────────────────────────────────────────────────────────
const HIRA = /[ぁ-ゖ]/g;
const toKatakana = (s) => s.replace(HIRA, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// 比べるための正規化: 全角半角・大小・ひらがな/カタカナをそろえ、空白と記号を落とす。
//   長音符「ー」は落とさない（カタカナ語の一部）。
export function normText(s) {
  return toKatakana(String(s || '').normalize('NFKC').toLowerCase())
    .replace(/[\s・･,，、.。:：;；!！?？「」『』【】〔〕［］[\]()（）<>〈〉《》"“”'‘’\-‐‑–—―−~〜/／|｜&＆+＋*＊#＃]/g, '');
}

const HAS_CJK = /[぀-ヿ㐀-鿿豈-﫿々〆]/;
const KANJI_KANA = '぀-ゟ㐀-鿿豈-﫿々〆';

// 書名から副題を落とした「核の書名」（「考え方 人生・仕事の結果が変わる」→「考え方」
// 「アートとしてのソフトウェア：機能と表現の考え方」→「アートとしてのソフトウェア」）。
//   末尾の（単行本）【電子書籍】のような括弧も外す。英語の書名は空白では切らない。
export function coreTitleOf(title) {
  let s = String(title || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*[(（【［[〔][^)）】］\]〕]{0,20}[)）】］\]〕]\s*$/, '').trim() || s;
  if (/^[\x20-\x7E]+$/.test(s)) return (s.split(/\s*[:|~—–]\s*|\s+-\s+/)[0] || s).trim();
  return (s.split(/\s*[:：|｜〜~／/—–]\s*|\s+/)[0] || s).trim();
}

// 書名の中の副題を分ける（NDL の「考え方 : 人生・仕事の結果が変わる」・「流儀：考え方」・「X — Y」）。
//   区切りは「：」「 : 」「 — 」の最初の 1 つ。どちらかが空なら分けない。副題が既にある本には使わない（呼び出し側）。
export function splitSubtitle(title) {
  const s = String(title || '').trim();
  const m = s.match(/^(.+?)(?:：| : | — )(.+)$/);
  if (!m) return { title: s, subtitle: '' };
  const t = m[1].trim();
  const sub = m[2].trim();
  return t && sub ? { title: t, subtitle: sub } : { title: s, subtitle: '' };
}

// ─── 著者名 ──────────────────────────────────────────────────────────────
// 生没年・世紀などの「名前でない」部分（NDL の「稲盛, 和夫, 1932-2022」の 3 つ目）。
const YEAR_PART = /^(?:\d{1,4}\??(?:年)?\s*[-–]\s*(?:\d{1,4}\??(?:年)?)?|[-–]\s*\d{1,4}|\d{3,4}\??|生年不詳|没年不詳|生没年不詳|fl\.?\s*\d.*|\d{1,2}世紀.*|ca\.\s*\d.*)$/i;
// 名前の後ろの役割（「稲盛和夫 著」「[著]」）。訳・編などは本の担当を表すので残す。
const ROLE_SUFFIX = /\s*[[［(（]?\s*(?:著|作|文|共著|著者|作者|原著|原作|ほか著|他著|ほか|他)\s*[\]］)）]?\s*$/;
const isKatakanaName = (s) => /^[゠-ヿ・･=＝\s.A-Za-z]+$/.test(s) && /[゠-ヿ]/.test(s);

function tidyName(s) {
  return String(s || '')
    .replace(/\s*[(（][^)）]*[)）]\s*/g, ' ') // 「Drucker, Peter F. (Peter Ferdinand)」の括弧
    .replace(new RegExp(`([${KANJI_KANA}])\\s+(?=[${KANJI_KANA}])`, 'g'), '$1') // 「稲盛 和夫」→「稲盛和夫」
    .replace(/\s+/g, ' ')
    .trim();
}

// 1 人分の名前を、本の表紙に載る形にそろえる。
//   「稲盛, 和夫, 1932-2022」→「稲盛和夫」・「Heckel, Paul」→「Paul Heckel」
//   「コヴィー, スティーブン・R.」→「スティーブン・R.・コヴィー」・「稲盛和夫 著」→「稲盛和夫」
export function formatPersonName(raw) {
  let s = String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(ROLE_SUFFIX, '').trim();
  const parts = s.split(/\s*[,，]\s*/).map((p) => p.trim()).filter((p) => p && !YEAR_PART.test(p));
  if (parts.length === 0) return '';
  if (parts.length === 1) return tidyName(parts[0]);
  if (parts.length === 2) {
    const family = tidyName(parts[0]);
    const given = tidyName(parts[1]);
    if (!family) return given;
    if (!given) return family;
    const fc = HAS_CJK.test(family);
    const gc = HAS_CJK.test(given);
    if (fc && gc) {
      if (isKatakanaName(family) && isKatakanaName(given)) return `${given}・${family}`;
      return `${family}${given}`;
    }
    if (!fc && !gc) return `${given} ${family}`;
    // 片方だけ漢字・かな（「ドラッカー, P.F.」）
    return /\.$/.test(given) ? `${given}${family}` : `${given}・${family}`;
  }
  return tidyName(parts.join(' '));
}

// NDL の名前を「, 」でつないだだけの古い文字列（「Heckel, Paul, 酒井, 邦秀, 1945-」）を 1 人ずつに分ける。
//   生没年は 1 人の終わりの印。2 つ組（姓, 名）で区切る。どの部分にも空白が無いときだけ（「Paul Heckel, Kunihide Sakai」
//   のような「名前, 名前」の並びは 1 人ずつそのまま）。
function splitNdlJoined(s) {
  const parts = s.split(/\s*[,，]\s*/).filter(Boolean);
  const names = parts.filter((p) => !YEAR_PART.test(p));
  const looksPaired = names.length >= 2 && names.every((p) => !/\s/.test(p.trim()))
    && names.every((p) => !HAS_CJK.test(p) || [...p].length <= 4);
  if (!looksPaired) return parts.filter((p) => !YEAR_PART.test(p));
  const out = [];
  let cur = [];
  for (const p of parts) {
    if (YEAR_PART.test(p)) {
      if (cur.length) out.push(cur.join(', '));
      cur = [];
      continue;
    }
    cur.push(p);
    if (cur.length === 2) { out.push(cur.join(', ')); cur = []; }
  }
  if (cur.length) out.push(cur.join(', '));
  return out;
}

// 著者（配列でも文字列でも）を「稲盛和夫」「楠木建、杉浦泰」の形の 1 行にする。同じ人は 1 回だけ。
export function formatAuthors(input) {
  let list;
  if (Array.isArray(input)) list = input;
  else {
    const s = String(input || '').normalize('NFKC').trim();
    if (!s) return '';
    // 楽天は連名を「/」、ほかは「、」「;」で区切る。
    const bySep = s.split(/\s*[/／、;；]\s*/).filter(Boolean);
    list = bySep.flatMap((p) => (/[,，]/.test(p) ? splitNdlJoined(p) : [p]));
  }
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const name = formatPersonName(raw);
    const key = normText(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.join('、');
}

// ─── 年 ─────────────────────────────────────────────────────────────────
// 「2017年04月」「2017-04-01」「2017」などから 4 桁の年。
export function yearOf(s) {
  const m = String(s || '').normalize('NFKC').match(/(1[5-9]\d\d|20\d\d)/);
  return m ? m[1] : '';
}

// ─── 並べ方 ──────────────────────────────────────────────────────────────
// 点数の重み（docs/book-search.md §4 に表）。
export const RANK_WEIGHTS = {
  titleExact: 100,     // 核の書名（または書名全体）が検索語とまったく同じ
  titlePrefix: 55,     // 核の書名が検索語で始まる
  titleContains: 40,   // 核の書名の途中にある
  subtitleOnly: 12,    // 副題・書名の後ろのほうにだけある
  authorToken: 45,     // 検索語のひとつが著者名に一致（1 語ごと・上限 2 語）
  missingToken: -40,   // 書名にも著者にも無い語（説明文で当たっただけ）1 語ごと
  salesMax: 30,        // 楽天の売上順の 1 位（30 位で 0）
  reviewMax: 15,       // レビュー件数（log）
  cover: 10,
  isbn: 6,
  recencyMax: 6,       // 1990 年から 5 年ごとに +1（最大 6）
  libraryOld: -20,     // 図書館にしか無い古い本（NDL だけ・ISBN なしか 1990 年より前）
  libraryOnly: -8,     // NDL だけ（売られている記録が無い）
  academic: -8,        // 大学・学会の出版
};
const W = RANK_WEIGHTS;

function tokensOf(query) {
  return String(query || '').normalize('NFKC').trim().split(/\s+/).map(normText).filter(Boolean);
}

// 1 冊の点数を 2 つに分ける（2026-10-02 ui-critic「段が入れ替わらないように」）:
//   match   = 一致の段（書名の一致の強さ＋著者に当たった語−どこにも無い語）
//   quality = 同じ段の中の並び（売上順・レビュー・表紙・ISBN・新しさ・図書館だけ・学術の出版）
//   並べるときは match が先、同じ match の中で quality（＝人気の本が書名の弱い一致で上がりすぎない）。
export function scoreParts(query, book) {
  const tokens = tokensOf(query);
  const title = book.title || '';
  const core = normText(coreTitleOf(title));
  const full = normText(`${title}${book.subtitle ? ` ${book.subtitle}` : ''}`);
  const kana = normText(book.titleKana || '');
  const coreKana = normText(coreTitleOf(book.titleKana || ''));
  const author = normText(book.author || '');
  const authorKana = normText(book.authorKana || '');

  // 著者に当たる語と、書名に当たる語に分ける（「稲盛和夫 考え方」「考え方 稲盛」）。
  const authorTokens = [];
  const titleTokens = [];
  for (const t of tokens) {
    const inAuthor = (author && author.includes(t)) || (authorKana && authorKana.includes(t));
    const inTitle = full.includes(t) || (kana && kana.includes(t));
    if (inAuthor && !(inTitle && tokens.length === 1)) authorTokens.push(t);
    else titleTokens.push(t);
  }

  let match = 0;
  const titleQ = titleTokens.join('');
  if (titleQ) {
    const hit = (c, f) => {
      if (!f) return 0;
      if (c && (c === titleQ || f === titleQ)) return W.titleExact;
      if (c && c.startsWith(titleQ)) return W.titlePrefix;
      if (c && c.includes(titleQ)) return W.titleContains;
      if (titleTokens.length > 1 && titleTokens.every((t) => c.includes(t))) return W.titleContains;
      if (f.includes(titleQ) || titleTokens.every((t) => f.includes(t))) return W.subtitleOnly;
      return 0;
    };
    match += Math.max(hit(core, full), hit(coreKana, kana));
  }
  match += Math.min(authorTokens.length, 2) * W.authorToken;
  const missing = titleTokens.filter((t) => !full.includes(t) && !(kana && kana.includes(t)));
  match += missing.length * W.missingToken;

  let score = 0;
  // よく読まれているか
  if (Number.isFinite(book.salesRank) && book.salesRank >= 0) {
    score += Math.max(0, W.salesMax * (1 - book.salesRank / 30));
  }
  const rc = Number(book.reviewCount) || 0;
  if (rc > 0) score += Math.min(W.reviewMax, 6 * Math.log10(1 + rc));

  if (book.cover) score += W.cover;
  if (book.isbn) score += W.isbn;
  const y = Number(book.pubYear || yearOf(book.pubdate)) || 0;
  if (y >= 1990) score += Math.min(W.recencyMax, Math.floor((y - 1990) / 5) + 1);

  const sources = book.sources || (book.source ? [book.source] : []);
  const libraryOnly = sources.length > 0 && sources.every((s) => s === 'ndl');
  if (libraryOnly) score += (!book.isbn || (y && y < 1990)) ? W.libraryOld : W.libraryOnly;
  if (/大学出版|大学.*出版会|学会|研究所|研究会|学術/.test(book.publisher || '')) score += W.academic;
  return { match, quality: score };
}

// 1 冊の点数（並べ替えの鍵・テストと docs のために外へ出す）。match を 1000 倍して quality（−36〜+67）を足すので、
//   match の段は quality では入れ替わらない。
export function scoreBook(query, book) {
  const { match, quality } = scoreParts(query, book);
  return match * 1000 + quality;
}

// 検索語のどれかが書名（副題・読みを含む）か著者に入っているか（説明文で当たっただけの本を見分ける）。
export function isRelated(query, book) {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return true;
  const hay = [book.title, book.subtitle, book.titleKana, book.author, book.authorKana].map(normText).join('|');
  return tokens.some((t) => hay.includes(t));
}

// 並べ替え。関係する本が 3 冊以上あれば、関係しない本は外す。元の順は同点のときだけ使う。
export function rankBooks(query, books, { dropUnrelated = true } = {}) {
  const list = (books || []).filter((b) => b && b.title);
  const related = list.filter((b) => isRelated(query, b));
  const base = dropUnrelated && related.length >= 3 ? related : list;
  return base
    .map((b, i) => ({ b, i, s: scoreBook(query, b) }))
    .sort((x, y) => (y.s - x.s) || (x.i - y.i))
    .map((x) => x.b);
}

// ─── 重なりを除く ────────────────────────────────────────────────────────
const SOURCE_ORDER = { rakuten: 0, google: 1, openbd: 2, ndl: 3 };
function isbn13(s) {
  const v = String(s || '').replace(/[-\s]/g, '').toUpperCase();
  if (/^\d{13}$/.test(v)) return v;
  if (/^\d{9}[\dX]$/.test(v)) {
    const core = `978${v.slice(0, 9)}`;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
    return core + String((10 - (sum % 10)) % 10);
  }
  return '';
}
const firstAuthorKey = (a) => normText(String(a || '').split(/[、,/／;]/)[0]);
// 著者の「きれいさ」: 生没年や「, 」が残っていない・空でない。
const authorQuality = (a) => (!a ? 0 : /\d{4}|,/.test(a) ? 1 : 2);

function mergeInto(keep, other) {
  const better = (SOURCE_ORDER[other.source] ?? 9) < (SOURCE_ORDER[keep.source] ?? 9);
  if (!keep.cover && other.cover) keep.cover = other.cover;
  else if (other.cover && other.source === 'rakuten' && keep.source !== 'rakuten') keep.cover = other.cover;
  if (authorQuality(other.author) > authorQuality(keep.author)) keep.author = other.author;
  if (!keep.subtitle && other.subtitle) keep.subtitle = other.subtitle;
  if (!keep.publisher && other.publisher) keep.publisher = other.publisher;
  if (!keep.pubYear && other.pubYear) keep.pubYear = other.pubYear;
  if (!keep.pubdate && other.pubdate) keep.pubdate = other.pubdate;
  if (!keep.isbn && other.isbn) keep.isbn = other.isbn;
  if (!keep.titleKana && other.titleKana) keep.titleKana = other.titleKana;
  if (!keep.pages && other.pages) keep.pages = other.pages;
  if (Number.isFinite(other.salesRank) && !(keep.salesRank <= other.salesRank)) keep.salesRank = other.salesRank;
  keep.reviewCount = Math.max(Number(keep.reviewCount) || 0, Number(other.reviewCount) || 0);
  if (better) { keep.title = other.title || keep.title; keep.source = other.source; }
  keep.sources = [...new Set([...(keep.sources || [keep.source]), ...(other.sources || [other.source])])].filter(Boolean);
  return keep;
}

// ISBN が同じなら 1 冊に。書名＋先頭の著者が同じで、片方に ISBN が無いか取得元が違うときも 1 冊に
//   （同じ取得元で ISBN が違う＝単行本と文庫などの別の版は両方残す）。表紙ときれいな著者名を残す。
export function dedupeBooks(books) {
  const out = [];
  const byIsbn = new Map();
  const byTitle = new Map();
  for (const raw of books || []) {
    if (!raw || !raw.title) continue;
    const b = { ...raw, sources: raw.sources || (raw.source ? [raw.source] : []) };
    const i13 = isbn13(b.isbn);
    if (i13) b.isbn = i13;
    const tKey = `${normText(b.title)}|${normText(b.subtitle || '')}|${firstAuthorKey(b.author)}`;
    const tKeyLoose = `${normText(coreTitleOf(b.title))}|${firstAuthorKey(b.author)}`;
    let hit = i13 ? byIsbn.get(i13) : null;
    if (!hit) {
      const cand = byTitle.get(tKey) || byTitle.get(tKeyLoose);
      if (cand && (!cand.isbn || !i13 || !cand.sources.some((s) => b.sources.includes(s)))) hit = cand;
    }
    if (hit) {
      mergeInto(hit, b);
      if (hit.isbn && !byIsbn.has(hit.isbn)) byIsbn.set(hit.isbn, hit);
      continue;
    }
    out.push(b);
    if (i13) byIsbn.set(i13, b);
    if (!byTitle.has(tKey)) byTitle.set(tKey, b);
    if (!byTitle.has(tKeyLoose)) byTitle.set(tKeyLoose, b);
  }
  return out;
}
