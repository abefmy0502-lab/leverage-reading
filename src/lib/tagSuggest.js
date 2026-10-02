// 🏷 保存したメモに、自分のタグから合いそうなものを 1〜3 個すすめる（タグの提案・2026-10-02・SPEC §2）。
//
// すすめるだけで、勝手には付けない（押したら付く・もう一度押したら外す）。すすめるのは「自分がもう使っているタグ」だけ
// （新しいタグは作らない）。「@」で始まるもの（学びの分類）はすすめない。
//
// 決め方:
//   1. 端末の中の決め方（AI なし・トークンを使わない・誰でも）: suggestTagsLocal
//      - そのタグの言葉がメモの文にそのまま出ている（「マネジメント」）→ いちばん強い。ただし 2 文字のタグ（「時間」「習慣」）は
//        ふつうの言葉としても出る（「同じ時間に」）ので、文に出ているだけではすすめず、似たメモの裏付けと合わせる
//      - 似たことを書いた自分のメモ（2 文字ずつの切れ端の TF-IDF・lib/memoLinks.js と同じ切り方）の近い 10 件に
//        付いているタグを、似ている度合いで重みをつけて数える（近いメモの多くに付いているタグ）。
//        近いメモが 1 件だけ・どれも遠いときに 1 件のタグが 100% にならないよう、似ている度合いの合計が
//        KNN_SUPPORT に届かないぶんは割り引く（「夕飯はカレー」が「カレンダー」のメモの「時間」に寄らない）
//      - その本に付けたタグ（本のタグ）は少しだけ足す
//      見逃すほうを選ぶ（違うタグをすすめると、押す手間より信頼を失う）: 点が LOCAL_MIN 以上だけ
//   2. Jev（TypeSafe AI）で決め直す道（jevTagCandidates / tagsFromJev）は評価（scripts/jev-eval.mjs）だけで使う。アプリでは使わない
//      （2026-10-02・決める窓 320ms に往復が間に合わないことが多い＝docs/jev-plan.md §3-3）。

import { bigramCounts, isKanaBigram, normalizeLinkText } from './memoLinks';

export const TAG_SUGGEST_MAX = 3;
export const LOCAL_MIN = 0.34; // 近いメモの重みのうち、そのタグが占める割合の下限（文に出ているタグは 1）
export const KNN = 10; // 近いメモの数
export const KNN_MIN_SIM = 0.06; // これより遠いメモは数えない
export const KNN_MIN_SHARED = 2; // ひらがなだけでない切れ端をこれだけ共有するメモだけを近いメモに数える（「カレー」と「カレンダー」の 1 つだけ、は数えない）
export const BOOK_TAG_PRIOR = 0.12; // 本のタグに足す点
export const KNN_SUPPORT = 0.25; // そのタグの付いた近いメモの、似ている度合いの合計がこれに届かなければ割り引く
export const SHORT_TAG_TEXT = 0.3; // 2 文字以下のタグが文に出ているときに足す点（それだけでは LOCAL_MIN に届かない）
export const JEV_MIN = 0.6;
export const JEV_MAX_CANDIDATES = 16;
export const MIN_TEXT_CHARS = 8;

const cleanTag = (t) => String(t || '').trim();
const usable = (t) => !!t && !t.startsWith('@');

// 自分のタグ（メモのタグ＋本のタグ）と、メモに付けた回数。
export function tagUniverse(rows = [], bookTags = []) {
  const count = new Map();
  for (const m of rows || []) {
    for (const t of Array.isArray(m?.tags) ? m.tags : []) {
      const tag = cleanTag(t);
      if (usable(tag)) count.set(tag, (count.get(tag) || 0) + 1);
    }
  }
  for (const t of bookTags || []) {
    const tag = cleanTag(t);
    if (usable(tag) && !count.has(tag)) count.set(tag, 0);
  }
  return count;
}

// ── 似ているメモ（TF-IDF・メモの全体で 1 回だけ作って覚える） ─────────────
const KANA_WEIGHT = 0.35;
const indexCache = new WeakMap();
function indexFor(rows) {
  let idx = indexCache.get(rows);
  if (idx) return idx;
  const docs = [];
  for (const m of rows || []) {
    const text = String(m?.text || '');
    if ([...text.replace(/\s+/gu, '')].length < MIN_TEXT_CHARS) continue;
    docs.push({ memo: m, counts: bigramCounts(text) });
  }
  const df = new Map();
  for (const d of docs) for (const g of d.counts.keys()) df.set(g, (df.get(g) || 0) + 1);
  const n = Math.max(1, docs.length);
  const idf = (g) => Math.log(1 + n / Math.max(1, df.get(g) || 0));
  for (const d of docs) d.vec = weigh(d.counts, idf);
  idx = { docs, idf };
  indexCache.set(rows, idx);
  return idx;
}
function weigh(counts, idf) {
  const vec = new Map();
  let sq = 0;
  for (const [g, c] of counts) {
    const w = (1 + Math.log(c)) * idf(g) * (isKanaBigram(g) ? KANA_WEIGHT : 1);
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

// 端末の中の決め方。戻り値: [{ tag, score, why: 'text' | 'similar' }]（点の高い順・TAG_SUGGEST_MAX まで）
//   text: 保存したメモの文 / memoId: そのメモ（近いメモから外す）/ rows: 自分のメモ全部（tags 付き）
//   bookTags: その本のタグ / current: もう付いているタグ（すすめない）
//   all=true なら点の下限で切らず、全部のタグの点を返す（Jev の候補選び・評価用）
export function scoreTagsLocal({ text, memoId = null, rows = [], bookTags = [], current = [] } = {}) {
  const src = String(text || '');
  const universe = tagUniverse(rows, bookTags);
  const skip = new Set((current || []).map(cleanTag));
  const tags = [...universe.keys()].filter((t) => !skip.has(t));
  if (!tags.length || [...src.replace(/\s+/gu, '')].length < MIN_TEXT_CHARS) return [];
  const norm = normalizeLinkText(src);
  const { docs, idf } = indexFor(rows);
  const q = weigh(bigramCounts(src), idf);
  const near = [];
  for (const d of docs) {
    if (memoId != null && String(d.memo?.id) === String(memoId)) continue;
    if (d.memo?.text === src) continue; // 保存したばかりで id が分からないとき（同じ文は自分）
    const s = cosine(q, d.vec);
    if (s < KNN_MIN_SIM) continue;
    let shared = 0;
    for (const g of q.keys()) if (!isKanaBigram(g) && d.vec.has(g)) shared += 1;
    if (shared >= KNN_MIN_SHARED) near.push({ d, s });
  }
  near.sort((a, b) => b.s - a.s);
  const top = near.slice(0, KNN);
  const total = top.reduce((n, x) => n + x.s, 0);
  const vote = new Map();
  for (const { d, s } of top) {
    for (const t of Array.isArray(d.memo?.tags) ? d.memo.tags : []) {
      const tag = cleanTag(t);
      if (usable(tag)) vote.set(tag, (vote.get(tag) || 0) + s);
    }
  }
  const bookSet = new Set((bookTags || []).map(cleanTag));
  return tags.map((tag) => {
    const inText = norm.includes(normalizeLinkText(tag));
    const longTag = [...tag].length >= 3;
    const support = vote.get(tag) || 0;
    const knn = total > 0 ? (support / total) * Math.min(1, support / KNN_SUPPORT) : 0;
    const similar = knn + (bookSet.has(tag) ? BOOK_TAG_PRIOR : 0);
    const score = inText && longTag ? 1 : Math.min(0.99, similar + (inText ? SHORT_TAG_TEXT : 0));
    return { tag, score: Math.round(score * 1000) / 1000, why: inText && longTag ? 'text' : 'similar', uses: universe.get(tag) || 0 };
  }).sort((a, b) => b.score - a.score || b.uses - a.uses);
}

export function suggestTagsLocal(args = {}) {
  return scoreTagsLocal(args).filter((x) => x.score >= LOCAL_MIN).slice(0, TAG_SUGGEST_MAX);
}

// Jev に送る候補（端末の点の高い順 → よく使う順で JEV_MAX_CANDIDATES 個まで）。
export function jevTagCandidates(scored = [], max = JEV_MAX_CANDIDATES) {
  const byScore = [...scored].sort((a, b) => b.score - a.score || b.uses - a.uses);
  const out = [];
  for (const x of byScore.filter((y) => y.score > 0)) if (out.length < max) out.push(x.tag);
  for (const x of [...scored].sort((a, b) => b.uses - a.uses)) {
    if (out.length >= max) break;
    if (!out.includes(x.tag)) out.push(x.tag);
  }
  return out;
}

// Jev の答え（送った順の確率）→ すすめるタグ。読めなければ null（端末の決め方へ）。
export function tagsFromJev(candidates = [], probs = null, { min = JEV_MIN, max = TAG_SUGGEST_MAX } = {}) {
  if (!Array.isArray(probs) || probs.length !== candidates.length) return null;
  return candidates
    .map((tag, i) => ({ tag, score: Number(probs[i]), i }))
    .filter((x) => Number.isFinite(x.score) && x.score >= min)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map(({ tag, score }) => ({ tag, score, why: 'jev' }));
}
