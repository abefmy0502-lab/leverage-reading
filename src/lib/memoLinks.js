// 🔗 本と本がつながる（2026-10-01 オーナー要望「無料ユーザーでも本のメモを入れ続ける意味があるような仕組み」）。
//
// メモを保存した・開いたときに、ほかの本で似たことを書いたメモを 1〜2 件見つける。
// AI も通信も使わない（端末の中だけ・トークンを使わない）純粋な関数だけを置く。
//
// 似ているかの決め方（SPEC §2「つながるメモ」）:
//   - メモの文を NFKC・小文字にそろえ（カタカナはひらがなにしない＝カタカナ語を助詞と見分ける）、
//     記号で区切った塊ごとに 2 文字ずつの切れ端（bigram）にする
//   - ひらがなだけの切れ端（「から」「ている」）は軽く（× KANA_WEIGHT）、数字だけ・よくある言葉（自分・場合…）は数えない
//   - 自分のメモ全体で TF-IDF（多くのメモに出る切れ端ほど軽い）→ 長さをそろえたベクトルの内積（コサイン）
//   - 出すのは、似ている度合いが LINK_MIN_SCORE 以上で、ひらがなだけでない切れ端を LINK_MIN_SHARED 個以上
//     共有するときだけ（違うものを「つながる」と見せると信頼を失うので、見逃すほうを選ぶ）
//   - 同じ本のメモは出さない。1 冊から 1 件だけ（違う本を並べる）・多くて 2 件
//
// 1,000 件を超えるメモでも速いように、索引（切れ端 → そのメモの重み）は一度だけ作って覚える（WeakMap）。

// ---- 決まり（テストで確かめる） ---------------------------------------------

// コサインの下限。デモのメモ（30 件）では、別々の話のいちばん近い組が 0.18（「チーム」が同じだけ＝下の言葉のまとまりの
// 決まりで外れる）・その次が 0.14、同じ考えを書いた組が 0.23〜0.48 だったので 0.2 にした（見逃す側に寄せる・下の決まりと合わせて使う）。
export const LINK_MIN_SCORE = 0.2;
export const LINK_MIN_SHARED = 3; // ひらがなだけでない、共有する切れ端の数の下限
// 共有する言葉のまとまり（続けて共有する切れ端の並び）が 2 つ以上あるか、6 文字以上続けて同じか。
// 「チーム」「マネージャー」のような 1 つの長い言葉だけで似ていると見なさない。
export const LINK_MIN_RUNS = 2;
export const LINK_LONG_RUN = 6;
export const LINK_MAX = 2; // 出すのは多くて 2 件
export const KANA_WEIGHT = 0.35; // ひらがなだけの切れ端の重み
export const MIN_LINK_CHARS = 8; // これより短いメモは比べない（「なるほど」など）

// どの本にも出てくる言葉（漢字 2 文字）。助詞と同じく数えない。
const STOP_BIGRAMS = new Set([
  '自分', '場合', '必要', '本当', '一番', '大事', '最近', '今日', '明日', '毎日', '以上', '以下',
  '一度', '何度', '何か', '感じ', '最初', '全部', '部分', '意味', '今回', '前回', '次回', '一つ',
]);

// ---- 切れ端 ---------------------------------------------------------------

// 区切り（記号・空白）。「ー」は語の中にあるので区切らない。
const SPLIT = /[\s、。，．,.・!?！？「」『』()（）【】[\]{}<>〈〉《》"'“”‘’:;：；/\\|…‥〜~=＝+＋*＊#＃@＠→←↑↓]+/u;
const HIRA = /^[ぁ-ゟ]+$/u;
const DIGITS = /^[0-9０-９]+$/u;

export function normalizeLinkText(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase();
}

// 1 つの文の切れ端と、その回数。Map<切れ端, 回数>
export function bigramCounts(text) {
  const out = new Map();
  for (const seg of normalizeLinkText(text).split(SPLIT)) {
    const chars = [...seg];
    for (let i = 0; i < chars.length - 1; i += 1) {
      const g = chars[i] + chars[i + 1];
      if (DIGITS.test(g) || STOP_BIGRAMS.has(g)) continue;
      out.set(g, (out.get(g) || 0) + 1);
    }
  }
  return out;
}

export const isKanaBigram = (g) => HIRA.test(g);
const kindWeight = (g) => (isKanaBigram(g) ? KANA_WEIGHT : 1);

// ---- 索引 -----------------------------------------------------------------

// memos: [{ id, book_id|bookId, text, page_number|pageNumber, created_at|createdAt }]（本に結びつかないメモ＝学びは外す）
// 返り値: { docs: [{ memo, bookId, counts, vec }], df: Map<切れ端, 件数>, postings: Map<切れ端, [[docIdx, 重み]]>, n }
export function buildLinkIndex(memos = []) {
  const docs = [];
  for (const m of memos || []) {
    const bookId = m?.book_id ?? m?.bookId ?? null;
    const text = String(m?.text || '');
    if (bookId == null || [...text.replace(/\s+/gu, '')].length < MIN_LINK_CHARS) continue;
    docs.push({ memo: m, bookId, counts: bigramCounts(text) });
  }
  const n = docs.length;
  const df = new Map();
  for (const d of docs) for (const g of d.counts.keys()) df.set(g, (df.get(g) || 0) + 1);
  const idf = idfOf(df, n, null);
  const postings = new Map();
  docs.forEach((d, i) => {
    d.vec = weigh(d.counts, idf);
    for (const [g, w] of d.vec) {
      if (!postings.has(g)) postings.set(g, []);
      postings.get(g).push([i, w]);
    }
  });
  return { docs, df, postings, n };
}

// idf（多くのメモに出る切れ端ほど軽い）。self: そのメモ自身を索引から除いたものとして数える（保存した・開いたメモは
// 索引に入っているので、自分の言葉を「2 件に出る言葉」と数えて軽くしない）。まだ誰も書いていない切れ端は 1 件だけと同じ。
function idfOf(df, n, self) {
  const nn = self ? Math.max(1, n - 1) : n;
  return (g) => {
    const c = Math.max(1, (df.get(g) || 0) - (self && self.counts.has(g) ? 1 : 0));
    return Math.log(1 + nn / c);
  };
}

// 回数 → 重み（(1 + log 回数) × idf × 種類の重み）→ 長さ 1 にそろえる。
function weigh(counts, idf) {
  const vec = new Map();
  let sq = 0;
  for (const [g, c] of counts) {
    const w = (1 + Math.log(c)) * idf(g) * kindWeight(g);
    vec.set(g, w);
    sq += w * w;
  }
  const norm = Math.sqrt(sq) || 1;
  for (const [g, w] of vec) vec.set(g, w / norm);
  return vec;
}

function cosine(a, b) {
  let s = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [g, w] of small) { const v = big.get(g); if (v) s += w * v; }
  return s;
}

// 同じ memos の配列から作った索引は覚えておく（開くたび・保存するたびに作り直さない）。
const indexCache = new WeakMap();
export function linkIndexFor(memos) {
  if (!Array.isArray(memos)) return buildLinkIndex([]);
  let idx = indexCache.get(memos);
  if (!idx) { idx = buildLinkIndex(memos); indexCache.set(memos, idx); }
  return idx;
}

// ---- 探す -----------------------------------------------------------------

// text: いま保存した・開いたメモの文 / bookId: その本（同じ本のメモは出さない）/ memoId: そのメモ（自分自身は出さない）
// 返り値: [{ memo, bookId, score, shared: [切れ端…] }]（似ている順・1 冊 1 件・多くて k 件）
// 速さ: 索引（切れ端 → メモ）で当たりのあるメモだけを粗く数え、候補だけを「そのメモを除いた索引」の重みで数え直す。
export function findLinkedMemos(index, { text, bookId = null, memoId = null, k = LINK_MAX, minScore = LINK_MIN_SCORE, minShared = LINK_MIN_SHARED } = {}) {
  if (!index || !index.n || [...String(text || '').replace(/\s+/gu, '')].length < MIN_LINK_CHARS) return [];
  const self = memoId != null ? index.docs.find((d) => String(d.memo?.id) === String(memoId)) || null : null;
  const idf = idfOf(index.df, index.n, self);
  const q = weigh(bigramCounts(text), idf);
  const coarse = new Float64Array(index.n);
  const strong = new Uint16Array(index.n);
  for (const [g, wq] of q) {
    const list = index.postings.get(g);
    if (!list) continue;
    const kana = isKanaBigram(g);
    for (const [i, wd] of list) {
      coarse[i] += wq * wd;
      if (!kana) strong[i] += 1;
    }
  }
  const cands = [];
  for (let i = 0; i < index.n; i += 1) {
    // 粗い数え方は自分を含む索引の重みなので、少し広めに拾ってから数え直す
    if (coarse[i] < minScore * 0.6 || strong[i] < minShared) continue;
    const d = index.docs[i];
    if (d === self) continue;
    if (bookId != null && String(d.bookId) === String(bookId)) continue;
    if (memoId != null && String(d.memo?.id) === String(memoId)) continue;
    const vec = self ? weigh(d.counts, idf) : d.vec;
    const score = self ? cosine(q, vec) : coarse[i];
    if (score >= minScore) cands.push({ d, vec, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = [];
  const seenBooks = new Set();
  const qSegs = segmentsOf(text);
  for (const c of cands) {
    const key = String(c.d.bookId);
    if (seenBooks.has(key)) continue;
    const { runs, phrase } = sharedRuns(qSegs, c.vec);
    if (runs < LINK_MIN_RUNS && phrase < LINK_LONG_RUN) continue;
    seenBooks.add(key);
    const shared = [...q.keys()].filter((g) => c.vec.has(g));
    out.push({ memo: c.d.memo, bookId: c.d.bookId, score: Math.round(c.score * 1000) / 1000, shared });
    if (out.length >= k) break;
  }
  return out;
}

function segmentsOf(text) {
  return normalizeLinkText(text).split(SPLIT).map((s) => [...s]).filter((cs) => cs.length >= 2);
}

// 問いの文の中で、相手と共有する切れ端が続く並び（まとまり）の数と、いちばん長い「言い回し」の文字数。
//   runs:   ひらがなだけでない並びの数（「ている」だけの並びは数えない）
//   phrase: ひらがなと、ひらがな以外の両方を含む並び（「どうすればうまくいくと思う」）のいちばん長い文字数。
//           1 つの言葉だけの並び（「マネージャー」「目標管理制度」）は言い回しに数えない。
export function sharedRuns(qSegs, vec) {
  let runs = 0;
  let phrase = 0;
  for (const chars of qSegs) {
    let len = 0; // いまの並びの切れ端の数
    let strong = false;
    let kana = false;
    const close = () => {
      if (len > 0 && strong) runs += 1;
      if (len > 0 && strong && kana) phrase = Math.max(phrase, len + 1);
      len = 0; strong = false; kana = false;
    };
    for (let i = 0; i < chars.length - 1; i += 1) {
      const g = chars[i] + chars[i + 1];
      if (vec.has(g)) {
        len += 1;
        if (isKanaBigram(g)) kana = true; else strong = true;
      } else close();
    }
    close();
  }
  return { runs, phrase };
}

// 2 つの文の似ている度合い（テスト・調整用）。index が無ければ 2 つだけで数える。
export function linkSimilarity(a, b, index = null) {
  const idx = index || buildLinkIndex([{ id: 'a', book_id: 'x', text: a }, { id: 'b', book_id: 'y', text: b }]);
  const idf = idfOf(idx.df, idx.n, null);
  return cosine(weigh(bigramCounts(a), idf), weigh(bigramCounts(b), idf));
}
