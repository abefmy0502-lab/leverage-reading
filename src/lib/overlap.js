// 🔗 重なり（2026-11-25 オーナー「知識が重なり、答えが生まれる」・設計は company/orime-core-2026-11-25.md）。
//   2 つの記録（本のメモ・本以外の学び）を並べ、共通していること・違うところ・考えてみたい問いを見て、
//   本人が「自分の答え」を自分の言葉で残す（学びとして保存＝相談の材料になる）。
//   重ねる相手の候補は端末の中で決める（lib/memoLinks.js の似ている度合い・AI もトークンも使わない）。
//   本以外の学びも候補に入れる（本のメモ × 経験が重なるのが一番の狙い）。自分で選んで重ねることもできる。
import { buildLinkIndex, findLinkedMemos } from './memoLinks';

export const OVERLAP_ANSWER_MAX = 1000;
export const OVERLAP_TAG = '@重なり';
// 自分の答えの頭に残す 1 行（どの 2 つを重ねたか＝あとで読み返す・相談の材料で取り違えない）。
export const OVERLAP_PREFIX = '重なり：';
const PERSONAL = '__p:';

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return [...t].length > n ? `${[...t].slice(0, n - 1).join('')}…` : t;
};

/** 記録が本以外の学びか（本に結びつかないメモ）。 */
export const isPersonal = (row) => !row?.book_id && !row?.bookId;

/** 記録の出どころの名前（「『考え方』のメモ」「あなたの学び」）。 */
export function whereOf(row, bookById) {
  if (isPersonal(row)) return 'あなたの学び';
  const b = bookById?.get?.(String(row.book_id ?? row.bookId));
  return b?.title ? `『${clip(b.title, 30)}』のメモ` : '本のメモ';
}

/**
 * 重ねる相手の候補（似ている順・多くて k 件）。本のメモは 1 冊 1 件、学びは 1 件ずつ別に数える。
 *   source: { id, text, bookId }（いま書いた・開いたメモ）
 *   rows:   自分のメモ全部（useAllMemoRows の rows＝学びも入る）
 *   重なりで残した答え（@重なり）と、AI のまとめなど本人の言葉でない記録は候補にしない。
 */
export function overlapCandidates({ source, rows, k = 3 }) {
  if (!source?.text || !Array.isArray(rows)) return [];
  const memos = rows
    .filter((r) => r && r.id !== source.id && r.text)
    .filter((r) => !r.source_type || r.source_type === 'book' || r.source_type === 'personal')
    .filter((r) => !(Array.isArray(r.tags) && r.tags.includes(OVERLAP_TAG)))
    .map((r) => ({ ...r, book_id: r.book_id ?? `${PERSONAL}${r.id}` }));
  const index = buildLinkIndex(memos);
  // 本のメモと学びは言葉づかいが違うので、つながるメモより少し低い所から拾う。
  return findLinkedMemos(index, {
    text: source.text,
    bookId: source.bookId ?? `${PERSONAL}${source.id}`,
    memoId: source.id,
    k,
    minScore: 0.14,
    minShared: 2,
  }).map((l) => ({ ...l, memo: { ...l.memo, book_id: String(l.memo.book_id).startsWith(PERSONAL) ? null : l.memo.book_id } }));
}

/** 自分で選ぶときの一覧（言葉で絞る・新しい順・同じメモと重なりの答えは除く・30 件まで）。 */
export function searchOverlapRows({ rows, query, excludeId, bookById, limit = 30 }) {
  const q = String(query || '').normalize('NFKC').toLowerCase().trim();
  return (rows || [])
    .filter((r) => r && r.id !== excludeId && r.text)
    .filter((r) => !r.source_type || r.source_type === 'book' || r.source_type === 'personal')
    .filter((r) => !(Array.isArray(r.tags) && r.tags.includes(OVERLAP_TAG)))
    .filter((r) => {
      if (!q) return true;
      const title = isPersonal(r) ? '' : String(bookById?.get?.(String(r.book_id))?.title || '');
      return `${r.text} ${title}`.normalize('NFKC').toLowerCase().includes(q);
    })
    .slice(0, limit);
}

/**
 * AI の答え（「共通: …」「違い: …」「問い: …」の 3 行）→ { common, diff, question }。読めなければ null。
 * 行の頭の記号・太字は外す。問いは「？」で終える。
 */
export function parseOverlap(text) {
  const out = { common: '', diff: '', question: '' };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^[\s*・\-#>]+/, '').replace(/\*\*/g, '').trim();
    const m = line.match(/^(共通|違い|問い)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const v = clip(m[2], 90);
    if (m[1] === '共通' && !out.common) out.common = v;
    else if (m[1] === '違い' && !out.diff) out.diff = /見つかりませんでした/.test(v) ? '' : v;
    else if (m[1] === '問い' && !out.question) out.question = /[？?]$/.test(v) ? v.replace(/\?$/, '？') : `${v.replace(/[。.]$/, '')}？`;
  }
  return out.common || out.question ? out : null;
}

/** AI を使わないときに出す問い（2 つの記録に共通する問い方・決まった 3 つ）。 */
export const OVERLAP_FIXED_QUESTIONS = [
  '2 つに共通していることは？',
  '2 つを合わせると、何が言えそう？',
  '明日の仕事や生活で、どう試せる？',
];

/** 保存する学びの文（頭に「重なり：〈A〉 × 〈B〉」の 1 行）。 */
export function overlapMemoText({ answer, aWhere, bWhere, max = 5000 }) {
  const body = String(answer || '').trim();
  if (!body) return '';
  const head = `${OVERLAP_PREFIX}${clip(aWhere, 40)} × ${clip(bWhere, 40)}\n`;
  return (head + body).slice(0, max);
}

// ---- 重ねた 2 つ（同じ 2 つを何度もすすめない・端末に覚える） -----------------------------
const DONE_KEY = 'orime.overlaps.v1';
const pairKey = (a, b) => [String(a), String(b)].sort().join('|');
export function readOverlapDone(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage?.getItem(DONE_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
}
export function markOverlapDone(a, b, storage = globalThis.localStorage) {
  const s = readOverlapDone(storage);
  s.add(pairKey(a, b));
  try { storage?.setItem(DONE_KEY, JSON.stringify([...s].slice(-500))); } catch { /* その場だけ */ }
}
export function isOverlapDone(a, b, storage = globalThis.localStorage) {
  return readOverlapDone(storage).has(pairKey(a, b));
}

// ---- 開く（どの画面からでも・App.jsx が受けて OverlapSheet を出す） ----------------------------
export const OVERLAP_OPEN_EVENT = 'orime:open-overlap';
/** source: { id, text, bookId } / targetId: はじめに重ねる相手（無ければ似ている記録から）。 */
export function openOverlap(source, targetId = null) {
  if (!source?.id || !String(source.text || '').trim()) return;
  try { window.dispatchEvent(new CustomEvent(OVERLAP_OPEN_EVENT, { detail: { source: { id: source.id, text: String(source.text), bookId: source.bookId ?? null }, targetId } })); } catch { /* ignore */ }
}
