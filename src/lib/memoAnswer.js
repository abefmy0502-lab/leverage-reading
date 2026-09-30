// 💬 メモが答える相談（2026-10-01 オーナー要望「無料ユーザーでも本のメモを入れ続ける意味があるような仕組み」）。
//
// 無料プランで今月のトークンを使い切ったあとの相談に、AI を使わずに答える。
// 困りごとの文から探す言葉を取り出し、自分のメモ・この本のまとめ・読書準備・学びの中から
// 関係しそうな一節を、本ごとにまとめて返す。/api/claude は呼ばない（トークンを使わない・端末の中だけ）。
//
// - 探す言葉: 漢字 2 文字以上のまとまり（「上司」「報告」）・カタカナ語（「ミス」）・英数字（「1on1」）。
//   1 文字の漢字＋送りがな（「断る」「任せ」）は、その漢字で始まる動詞として探す（「断れない」→「断る」も当たる）。
//   相談の言い回し（どう・したら・いい・悩み・相談…）とひらがなだけの語は外す
// - 見つけ方は lib/librarySearch.js と同じ（正規化・送りがなを外した形・4 文字以上の言葉は 2 文字の切れ端の 6 割）
// - 並び: 多くのメモに出る言葉ほど軽く数え（IDF）、当たった言葉の重みの合計で並べる。
//   本ごとにまとめて多くて 3 冊・1 冊から 1〜2 件
import { normalizeSearch, compileTerms, matchTerm, buildSnippet, PREP_FIELDS } from './librarySearch';

export const MEMO_ANSWER_MAX_BOOKS = 3;
export const MEMO_ANSWER_PER_BOOK = 2;
const MAX_TERMS = 8;

// 相談の言い回し・どの悩みにも出る言葉（探す言葉にしない）。
const STOP_WORDS = new Set([
  '自分', '相談', '悩み', '方法', '仕方', '最近', '本当', '一番', '大事', '問題', '場合', '感じ', '毎回', '今日', '明日',
  '毎日', '何度', '必要', '簡単', '意味', '上手', '以上', '以下', '気持', '今後', '普段', '時々', '全然', '結構',
  'メモ', 'アドバイス', 'ヒント', 'コツ',
]);
// 1 文字の漢字＋送りがなのうち、相談の言い回し・どの文にも出る動詞（困る・思う・言う・悩む・教える…）。
const STOP_VERB_KANJI = new Set([...'困思言悩教知分見行来出入良何私僕俺時方事物気今本人話聞使考書読足付合']);

const KANJI = '一-鿿々〆ヶ';
const TOKEN = new RegExp(`[${KANJI}]+[ぁ-ゟ]*|[ァ-ヿー]+|[A-Za-z0-9]+|[ぁ-ゟ]+`, 'gu');
const REDUP = /^([ぁ-ゟ]{2})\1$/u; // 「もやもや」「だらだら」

// 困りごとの文 → 探す言葉 [{ term, kind: 'word'|'verb', raw }]（正規化済み・重複なし・多くて 8 つ）。
export function extractConsultTerms(question) {
  // 数と助数詞（「3回目」「2週間」）は探す言葉にしない。
  const src = String(question ?? '').normalize('NFKC').slice(0, 300).replace(new RegExp(`[0-9]+[${KANJI}]{1,2}`, 'gu'), ' ');
  const out = [];
  const seen = new Set();
  const add = (raw, kind) => {
    const term = normalizeSearch(raw);
    if (!term || seen.has(`${kind}:${term}`) || out.length >= MAX_TERMS) return;
    seen.add(`${kind}:${term}`);
    out.push({ term, kind, raw });
  };
  for (const tok of src.match(TOKEN) || []) {
    const km = tok.match(new RegExp(`^([${KANJI}]+)([ぁ-ゟ]*)$`, 'u'));
    if (km) {
      let k = km[1];
      // 頭のよくある言葉は外す（「毎日忙しい」→「忙しい」・「自分磨き」→「磨き」）
      while ([...k].length > 2 && STOP_WORDS.has(k.slice(0, 2))) k = k.slice(2);
      if ([...k].length >= 2) {
        if (!STOP_WORDS.has(k)) add(k, 'word');
      } else if (km[2] && !STOP_VERB_KANJI.has(k)) {
        add(k, 'verb');
      }
      continue;
    }
    if (/^[ァ-ヿー]+$/u.test(tok)) {
      const k = tok.replace(/^ー+/u, '');
      if ([...k].length >= 2 && !STOP_WORDS.has(k)) add(k, 'word');
      continue;
    }
    if (/^[A-Za-z0-9]+$/.test(tok)) {
      if (tok.length >= 2 && !/^[0-9]+$/.test(tok)) add(tok, 'word');
      continue;
    }
    if (REDUP.test(tok)) add(tok, 'word');
  }
  return out;
}

// 1 文字の漢字の動詞: 前が漢字でない所で、その漢字のすぐ後ろにひらがな（「断る」「断った」は当たる・「判断する」は当たらない）。
const verbRe = new Map();
function matchVerb(hay, kanji) {
  if (!hay) return false;
  let re = verbRe.get(kanji);
  if (!re) { re = new RegExp(`(?:^|[^${KANJI}])${kanji}[ぁ-ゟ]`, 'u'); verbRe.set(kanji, re); }
  return re.test(hay);
}

// 本・メモ → 探す文の一覧。
//   memo:     カード式のメモ（本に結びつく）
//   learning: 学び（本に結びつかないメモ）
//   summary:  この本のまとめ / prep: 読書準備（得たいこと・現在の課題・仮説・選書理由・一番の収穫）
// scopeIds: 相談相手を本に絞っているときはその本だけ（学びは入れない）。
export function buildMemoAnswerCorpus({ books = [], memos = [], scopeIds = [] } = {}) {
  const scope = Array.isArray(scopeIds) && scopeIds.length ? new Set(scopeIds.map(String)) : null;
  const bookById = new Map((books || []).map((b) => [String(b.id), b]));
  const out = [];
  for (const m of memos || []) {
    const text = String(m?.text || '');
    if (!text.trim()) continue;
    const bookId = m?.book_id ?? m?.bookId ?? null;
    if (bookId != null && !bookById.has(String(bookId))) continue; // 消した本のメモなど
    if (scope && (bookId == null || !scope.has(String(bookId)))) continue;
    const tags = (m.tags || []).filter((t) => typeof t === 'string' && t && !t.startsWith('@'));
    out.push({
      kind: bookId == null ? 'learning' : 'memo',
      bookId,
      memoId: m.id ?? null,
      page: Number.isFinite(m.page_number ?? m.pageNumber) ? (m.page_number ?? m.pageNumber) : null,
      createdAt: m.created_at || m.createdAt || null,
      text,
      norm: normalizeSearch(text),
      tagNorm: tags.length ? normalizeSearch(tags.join(' ')) : '',
    });
  }
  for (const b of books || []) {
    if (scope && !scope.has(String(b.id))) continue;
    const summary = String(b.leverageMemo || '');
    if (summary.trim()) out.push({ kind: 'summary', bookId: b.id, label: 'この本のまとめ', text: summary, norm: normalizeSearch(summary), tagNorm: '' });
    for (const [key, label] of PREP_FIELDS) {
      const v = String(b[key] || '');
      if (v.trim()) out.push({ kind: 'prep', bookId: b.id, label, text: v, norm: normalizeSearch(v), tagNorm: '' });
    }
  }
  return out;
}

// 「メモ N 件から探しました」の N（相談の上部と同じ数え方＝カード式＋学び＋この本のまとめ）。
export function countSearchedMemos(corpus) {
  return (corpus || []).filter((e) => e.kind === 'memo' || e.kind === 'learning' || e.kind === 'summary').length;
}

const KIND_WEIGHT = { memo: 1, learning: 1, summary: 0.85, prep: 0.7 };
const TAG_WEIGHT = 0.6;
// 半分を超える文に出る言葉だけで当たった文は出さない（「仕事」だけで全部のメモが並ばないように）。
// 探す文が少ない（本に絞った相談など）ときは、この決まりを使わない。
const COMMON_SHARE = 0.5;
const COMMON_MIN_CORPUS = 8;

// 本文で当たったか（{ w, inText }）。メモのタグだけで当たったときは軽く数える（本文に言葉が無いと、一節を読んでも理由が分からないので、
// タグだけで当たった文は出さない＝下の answerFromMemos）。
function matchEntry(entry, t) {
  if (t.kind === 'verb') {
    if (matchVerb(entry.norm, t.term)) return { w: 0.8, inText: true };
    return entry.tagNorm && entry.tagNorm.includes(t.term) ? { w: TAG_WEIGHT * 0.8, inText: false } : null;
  }
  const m = matchTerm(entry.norm, t.ct);
  if (m) return { w: m.weight, inText: true };
  const tm = entry.tagNorm && matchTerm(entry.tagNorm, t.ct);
  return tm && tm.kind !== 'partial' ? { w: TAG_WEIGHT * tm.weight, inText: false } : null;
}

// 困りごと → 関係しそうな一節（本ごと）。
// 返り値: { terms: [言葉…], searched: 探したメモの数,
//          groups: [{ bookId|null, book|null, hits: [{ kind, memoId, page, createdAt, label, text, segments, score }] }] }
//   book が null のまとまりは学び（本に結びつかないメモ）。
export function answerFromMemos({ question, books = [], memos = [], scopeIds = [], maxBooks = MEMO_ANSWER_MAX_BOOKS, perBook = MEMO_ANSWER_PER_BOOK } = {}) {
  const corpus = buildMemoAnswerCorpus({ books, memos, scopeIds });
  const searched = countSearchedMemos(corpus);
  const extracted = extractConsultTerms(question);
  const terms = extracted.map((t) => ({ ...t, ct: t.kind === 'word' ? compileTerms([t.term])[0] : null }));
  if (!terms.length || !corpus.length) return { terms: extracted.map((t) => t.raw), searched, groups: [] };
  const n = corpus.length;
  // 言葉ごとに、当たる文の数（多い言葉ほど軽く）
  const df = terms.map((t) => corpus.reduce((c, e) => c + (matchEntry(e, t) ? 1 : 0), 0));
  const idf = df.map((d) => Math.log(1 + n / Math.max(1, d)));
  const scored = [];
  for (const e of corpus) {
    let score = 0;
    let rare = false;
    let inText = false;
    const hitTerms = [];
    terms.forEach((t, i) => {
      const m = matchEntry(e, t);
      if (!m) return;
      score += m.w * idf[i];
      if (m.inText) { hitTerms.push(t); inText = true; }
      if (n < COMMON_MIN_CORPUS || df[i] / n <= COMMON_SHARE) rare = true;
    });
    if (!score || !rare || !inText) continue;
    scored.push({ e, score: score * KIND_WEIGHT[e.kind], hitTerms });
  }
  scored.sort((a, b) => b.score - a.score || String(b.e.createdAt || '').localeCompare(String(a.e.createdAt || '')));
  const bookById = new Map((books || []).map((b) => [String(b.id), b]));
  const groups = new Map();
  for (const s of scored) {
    const key = s.e.bookId == null ? '__self' : String(s.e.bookId);
    if (!groups.has(key)) groups.set(key, { bookId: s.e.bookId, book: s.e.bookId == null ? null : bookById.get(key) || null, items: [] });
    groups.get(key).items.push(s);
  }
  const ranked = [...groups.values()].map((g) => ({ ...g, score: g.items[0].score + 0.25 * (g.items[1]?.score || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxBooks);
  return {
    terms: extracted.map((t) => t.raw),
    searched,
    groups: ranked.map((g) => {
      const top = g.items[0].score;
      // 2 件目は 1 件目の 6 割以上のときだけ（弱い一節で水増ししない）
      const items = g.items.slice(0, perBook).filter((s, i) => i === 0 || s.score >= top * 0.6);
      return {
        bookId: g.bookId,
        book: g.book,
        hits: items.map((s) => ({
          kind: s.e.kind,
          memoId: s.e.kind === 'memo' || s.e.kind === 'learning' ? s.e.memoId : null,
          page: s.e.page ?? null,
          createdAt: s.e.createdAt ?? null,
          label: s.e.label || null,
          text: s.e.text,
          score: Math.round(s.score * 100) / 100,
          segments: buildSnippet(s.e.text, snippetTerms(s.hitTerms)),
        })),
      };
    }),
  };
}

// 一節の印に使う言葉（動詞は漢字 1 文字＝その字に印）。
function snippetTerms(hitTerms) {
  return hitTerms.map((t) => (t.kind === 'verb' ? { term: t.term, stem: null, bigrams: [] } : t.ct));
}
