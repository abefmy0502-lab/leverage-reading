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
import { fieldsOf } from './bookFields';

export const MAP_MAX_BOOKS = 12;  // 円の上に並べる本の数の上限（スマホの幅で表紙が重ならない）
export const MAP_MAX_EDGES = 16;  // 線の数の上限（多すぎると読めない）
export const MAP_MAX_MEMOS = 800; // 比べるメモの数の上限（新しい順・メモが何千件あっても手間を一定に）
export const MAP_MAX_HUBS = 6;   // 内側に置く分野の点の数の上限
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
const timeOf = (b) => Date.parse(b?.doneDate || b?.done_date || b?.startDate || b?.start_date || b?.updated_at || b?.created_at || '') || 0;
const onMap = (b) => !b?.archivedAt && (b?.status === 'reading' || b?.status === 'done'); // アーカイブした本は点にしない（2026-11-26）

/**
 * rows: 自分のメモ（useAllMemoRows の行）・books: 本棚の本。
 * 点は読書中・読了の本（12 冊まで）。つながりが無くても出す（2026-11-26 オーナー「繋がるものがなくても何らか見えて感動するものにしたい」）:
 *   本どうしの線＝似たメモ・同じメモのタグ（edges）。内側の点＝分野（hubs・2 冊以上の分野）から、その分野の本へ細い線。
 *   同じ分野の本を隣に並べるので、分野ごとに星座のようなまとまりになる。メモのある本・つながる本を先に選ぶ。
 * 返り値: { nodes: [{ book, weight, memoCount, latest, fields }], edges: [{ a, b, count, tags, weight, best: { from, to } }], hubs: [{ name, bookIds }] }
 */
export function buildKnowledgeMap({ rows = [], books = [], maxMemos = MAP_MAX_MEMOS, maxBooks = MAP_MAX_BOOKS, maxEdges = MAP_MAX_EDGES } = {}) {
  const bookById = new Map((books || []).map((b) => [String(b.id), b]));
  const memos = [];
  const memoCount = new Map();
  const latest = new Map(); // 本 → いちばん新しい自分のメモ（rows は新しい順）
  for (const m of rows || []) {
    const bid = m?.book_id ?? m?.bookId;
    if (bid == null || !bookById.has(String(bid))) continue;
    if (isAiWritten({ sourceType: m.source_type, kind: m.kind })) continue; // 自分の言葉だけ
    if (!String(m.text || '').trim()) continue;
    const k = String(bid);
    memoCount.set(k, (memoCount.get(k) || 0) + 1);
    if (!latest.has(k)) latest.set(k, m);
    if (memos.length < maxMemos) memos.push(m);
  }
  const index = linkIndexFor(memos);
  const edgeMap = new Map();
  for (const d of index.docs) {
    const links = findLinkedMemos(index, { text: d.memo.text, bookId: d.bookId, memoId: d.memo.id, k: PER_MEMO_LINKS });
    for (const l of links) {
      const a = String(d.bookId);
      const b = String(l.bookId);
      if (a === b) continue;
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
  const linkWeight = new Map();
  for (const e of edges) {
    linkWeight.set(e.a, (linkWeight.get(e.a) || 0) + e.weight);
    linkWeight.set(e.b, (linkWeight.get(e.b) || 0) + e.weight);
  }
  // 点にする本: 読書中・読了の本と、メモでつながる本。つながりの重み → メモの数 → 新しい順で 12 冊まで。
  const candidates = [...bookById.values()].filter((b) => onMap(b) || linkWeight.has(String(b.id)));
  candidates.sort((x, y) => {
    const ix = String(x.id); const iy = String(y.id);
    return (linkWeight.get(iy) || 0) - (linkWeight.get(ix) || 0)
      || (memoCount.get(iy) || 0) - (memoCount.get(ix) || 0)
      || timeOf(y) - timeOf(x)
      || ix.localeCompare(iy);
  });
  const keepIds = candidates.slice(0, maxBooks).map((b) => String(b.id));
  const keep = new Set(keepIds);
  edges = edges.filter((e) => keep.has(e.a) && keep.has(e.b)).sort((x, y) => y.weight - x.weight).slice(0, maxEdges);
  if (!keepIds.length) return { nodes: [], edges: [], hubs: [] };
  const ordered = orderByField(keepIds, edges, (id) => fieldsOf(bookById.get(id)));
  const nodes = ordered.map((id) => ({
    book: bookById.get(id),
    weight: edges.filter((e) => e.a === id || e.b === id).reduce((s, e) => s + e.weight, 0),
    memoCount: memoCount.get(id) || 0,
    latest: latest.has(id) ? memoOf(latest.get(id)) : null,
    fields: fieldsOf(bookById.get(id)),
  }));
  // 分野の集まり（地図の内側の点＝分野・そこから本へ細い線）。2 冊以上の本がある分野だけ・多い順に 6 つまで。
  const byField = new Map();
  for (const n of nodes) for (const f of n.fields) { if (!byField.has(f)) byField.set(f, []); byField.get(f).push(String(n.book.id)); }
  const hubs = [...byField.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]))
    .slice(0, MAP_MAX_HUBS)
    .map(([name, bookIds]) => ({ name, bookIds }));
  return { nodes, edges, hubs };
}

/** 分野の点の位置: その分野の本の方向の平均を、内側の輪（半径 radius）に置く。nodePos は本の id → { x, y }。 */
export function hubPositions(hubs, nodePos, { radius = 0.17, cx = 0.5, cy = 0.5 } = {}) {
  return hubs.map((h) => {
    let vx = 0; let vy = 0;
    for (const id of h.bookIds) { const p = nodePos.get(id); if (p) { vx += p.x - cx; vy += p.y - cy; } }
    const len = Math.hypot(vx, vy);
    if (len < 1e-6) return { x: cx, y: cy };
    return { x: cx + (vx / len) * radius, y: cy + (vy / len) * radius };
  });
}

/** 分野ごとのまとまりに並べる（いちばん多い分野から・本の最初の分野で分ける・中はつながりの強い順）。分野の無い本は最後。 */
export function orderByField(ids, edges, fieldsFor) {
  const groups = new Map();
  for (const id of ids) {
    const f = (fieldsFor(id) || [])[0] || '';
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push(id);
  }
  const keys = [...groups.keys()].sort((x, y) => (x === '') - (y === '') || groups.get(y).length - groups.get(x).length || x.localeCompare(y));
  return keys.flatMap((k) => orderAroundRing(groups.get(k), edges));
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
  if (n === 1) return [{ x: cx, y: cy }];
  if (n === 2) return [{ x: cx - radius * 0.7, y: cy }, { x: cx + radius * 0.7, y: cy }];
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return { x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) };
  });
}

/** 線の太さ（px）: 似たメモの組と同じタグの数で 1.5〜4。 */
export const edgeWidth = (count, tags = 0) => Math.min(4, 1.5 + 0.6 * Math.max(0, (count || 0) + (tags || 0) - 1));
