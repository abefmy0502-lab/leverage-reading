// 🗺 知識の地図（2026-11-26 オーナー「知識のマップみたいのってつくらないの？」→「作って」）。
//
// 点＝本（表紙）、線＝つながる本どうし。つながりは 2 つ（どちらも本人のメモから・AI も通信も使わない・トークンを使わない）:
//   ① 似たことを書いたメモ（「本と本がつながる」と同じ lib/memoLinks.js＝文字の 2 字組の珍しさで重みをつけた類似度）
//   ② 同じメモのタグ（本人が付けた言葉＝「マネジメント」など。文字の類似は言い換えを拾えないので、本人の分け方で補う）
//   どちらの線にも、重ねて考える 2 つのメモが付く（タグの線は、そのタグの付いた新しいメモどうし）。
// 前に作って外した「知識マップ」（2026-05）・「視点の地図」（2026-10）は抽象的で、見て何をすればいいか分からなかった。
// この地図は線を押すとその 2 つのメモが並び、「重ねて考える」へ進める（見たあとの一歩が決まっている）。
// 数・%・順位は出さない（線の太さだけ）。
import { linkIndexFor, findLinkedMemos } from './memoLinks';
import { isAiWritten } from './recall';

export const MAP_MIN_BOOKS = 3;   // 線でつながる本がこれより少なければ地図を出さない
export const MAP_MAX_BOOKS = 10;  // 円の上に並べる本の数の上限（スマホの幅で表紙が重ならない）
export const MAP_MAX_EDGES = 16;  // 線の数の上限（多すぎると読めない）
export const MAP_MAX_MEMOS = 800; // 比べるメモの数の上限（新しい順・メモが何千件あっても手間を一定に）
const PER_MEMO_LINKS = 3;          // 1 件のメモから探すほかの本の数
const TAG_MAX_BOOKS = 6;           // これより多くの本に付いたタグは線にしない（どの本にもある言葉は地図を塗りつぶす）
const TAG_WEIGHT = 0.6;            // 同じタグ 1 つの重み（似たメモ 1 組は似ている度合い＝0.2〜1）

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function edgeFor(edgeMap, x, y) {
  const key = pairKey(x, y);
  let e = edgeMap.get(key);
  if (!e) { e = { a: x < y ? x : y, b: x < y ? y : x, pairs: new Map(), tags: new Set(), tagPair: null }; edgeMap.set(key, e); }
  return e;
}
const memoOf = (m) => ({ id: m.id, text: String(m.text || ''), bookId: m.book_id ?? m.bookId ?? null, page: Number.isFinite(m.page_number ?? m.pageNumber) ? (m.page_number ?? m.pageNumber) : null });

/**
 * rows: 自分のメモ（useAllMemoRows の行）・books: 本棚の本。
 * 返り値: { nodes: [{ book, weight }], edges: [{ a, b, count＝似たメモの組, tags＝同じタグ, weight, best: { from, to } }] }（つながりが少なければ nodes は空）
 */
export function buildKnowledgeMap({ rows = [], books = [], maxMemos = MAP_MAX_MEMOS, maxBooks = MAP_MAX_BOOKS, maxEdges = MAP_MAX_EDGES, minBooks = MAP_MIN_BOOKS } = {}) {
  const bookById = new Map((books || []).map((b) => [String(b.id), b]));
  const memos = [];
  for (const m of rows || []) {
    const bid = m?.book_id ?? m?.bookId;
    if (bid == null || !bookById.has(String(bid))) continue;
    if (isAiWritten({ sourceType: m.source_type, kind: m.kind })) continue; // 自分の言葉だけ
    memos.push(m);
    if (memos.length >= maxMemos) break;
  }
  const index = linkIndexFor(memos);
  const edgeMap = new Map();
  for (const d of index.docs) {
    const links = findLinkedMemos(index, { text: d.memo.text, bookId: d.bookId, memoId: d.memo.id, k: PER_MEMO_LINKS });
    for (const l of links) {
      const a = String(d.bookId);
      const b = String(l.bookId);
      if (a === b) continue;
      const key = pairKey(a, b);
      const e = edgeFor(edgeMap, a, b);
      const pk = pairKey(String(d.memo.id), String(l.memo.id));
      const prev = e.pairs.get(pk);
      if (!prev || prev.score < l.score) e.pairs.set(pk, { score: l.score, from: d.memo, to: l.memo });
    }
  }
  // ② 同じメモのタグ（@ で始まる仕組みの印＝@重なり・@対話 は数えない）
  const byTag = new Map(); // タグ → 本 → いちばん新しいメモ
  for (const m of memos) {
    for (const raw of Array.isArray(m.tags) ? m.tags : []) {
      const t = String(raw || '').trim();
      if (!t || t.startsWith('@')) continue;
      if (!byTag.has(t)) byTag.set(t, new Map());
      const per = byTag.get(t);
      const bid = String(m.book_id ?? m.bookId);
      if (!per.has(bid)) per.set(bid, m); // memos は新しい順
    }
  }
  for (const [t, per] of byTag) {
    if (per.size < 2 || per.size > TAG_MAX_BOOKS) continue;
    const ids = [...per.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const e = edgeFor(edgeMap, ids[i], ids[j]);
        e.tags.add(t);
        if (!e.tagPair) e.tagPair = { from: per.get(e.a), to: per.get(e.b) };
      }
    }
  }
  let edges = [...edgeMap.values()].map((e) => {
    const pairs = [...e.pairs.values()].sort((x, y) => y.score - x.score);
    const tags = [...e.tags];
    const weight = pairs.reduce((s, p) => s + p.score, 0) + TAG_WEIGHT * tags.length;
    let from; let to;
    if (pairs.length) {
      const top = pairs[0];
      // 線の端の向きをそろえる（from は a の本のメモ）
      from = String(top.from.book_id ?? top.from.bookId) === e.a ? top.from : top.to;
      to = from === top.from ? top.to : top.from;
    } else {
      ({ from, to } = e.tagPair);
    }
    return { a: e.a, b: e.b, count: pairs.length, tags, weight, best: { from: memoOf(from), to: memoOf(to) } };
  });
  // 本の重み＝線の重みの合計。上位の本だけを残し、その中の線だけを使う。
  const nodeWeight = new Map();
  for (const e of edges) {
    nodeWeight.set(e.a, (nodeWeight.get(e.a) || 0) + e.weight);
    nodeWeight.set(e.b, (nodeWeight.get(e.b) || 0) + e.weight);
  }
  const keep = new Set([...nodeWeight.entries()].sort((x, y) => y[1] - x[1]).slice(0, maxBooks).map(([id]) => id));
  edges = edges.filter((e) => keep.has(e.a) && keep.has(e.b)).sort((x, y) => y.weight - x.weight).slice(0, maxEdges);
  const used = new Set(edges.flatMap((e) => [e.a, e.b]));
  if (used.size < minBooks) return { nodes: [], edges: [] };
  const nodes = orderAroundRing([...used], edges).map((id) => ({ book: bookById.get(id), weight: edges.filter((e) => e.a === id || e.b === id).reduce((s, e) => s + e.weight, 0) }));
  return { nodes, edges };
}

/** 円の上の並び: いちばん重い本から始め、直前の本といちばん強くつながる本を隣に置く（線が交差しにくい）。 */
export function orderAroundRing(ids, edges) {
  const w = (x, y) => edges.reduce((s, e) => s + ((e.a === x && e.b === y) || (e.a === y && e.b === x) ? e.weight : 0), 0);
  const total = (x) => edges.reduce((s, e) => s + (e.a === x || e.b === x ? e.weight : 0), 0);
  const left = [...ids].sort((x, y) => total(y) - total(x) || String(x).localeCompare(String(y)));
  const out = [];
  let cur = left.shift();
  while (cur != null) {
    out.push(cur);
    if (!left.length) break;
    let bi = 0;
    for (let i = 1; i < left.length; i += 1) if (w(cur, left[i]) > w(cur, left[bi])) bi = i;
    cur = left.splice(bi, 1)[0];
  }
  return out;
}

/** 円の上の位置（0〜1 の割合・上から時計回り）。 */
export function ringPositions(n, { radius = 0.38, cx = 0.5, cy = 0.5 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return { x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) };
  });
}

/** 線の太さ（px）: 似たメモの組と同じタグの数で 1.5〜4。 */
export const edgeWidth = (count, tags = 0) => Math.min(4, 1.5 + 0.6 * Math.max(0, (count || 0) + (tags || 0) - 1));
