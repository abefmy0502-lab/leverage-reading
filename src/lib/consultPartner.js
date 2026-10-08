// 💬 相談相手のアイコン（2026-09-30・オーナー要望「誰と会話しているのか分かるように。LINE で相手のアイコンが出るように」）。
// 答えがどの本のメモから来たかを、LINE の相手のアイコンと名前の行のように見せるための「相手」を決める（AI を使わない・純粋な関数）。
//
//   { kind: 'book' | 'group' | 'self', books: [{ id, title, author, cover }], self: boolean, shelf: boolean, label }
//     - book  : 1 冊の本から（アイコン＝その本の表紙・名前＝「著者『書名』」・著者が無ければ「『書名』」）
//     - group : 数冊の本から（アイコン＝表紙を最大 4 つ並べた丸・名前＝「3 冊の本」／「2 冊の本と自分の学び」）
//               2026-10-05: 「安宅和人 ほか 2 人」の形をやめた（実在の著者が答えているように見えないように・オーナー判断）。
//               1 冊の本から（語り口の答えを含む）は今までどおり著者の名前。
//               shelf: true は「すべての本」に相談しているとき（名前＝「あなたの本棚」）
//     - self  : 自分の学び（本に結びつかない学びログ）だけから（アイコン＝電球・名前＝「自分の学び」）
//
// 書き終えた答えは、その答えの根拠（refs の 📚 📖 💡 の行）から決める。引用がどれもメモと一致しなかった本は外す
// （evidenceCheck.js の結果・「もとになった本」と同じ）。根拠が取れない答え（書いている途中・失敗・関係するメモが
// 無かった答え・古い答え）は、相談相手（すべての本／1 冊／選んだ数冊）から決める。
//
// 🗣 著者の語り口（2026-09-30 オーナー裁定）で書いた答え（voice）は、名前を「著者名」＋「（本の語り口で・AI）」にする
//   （著者本人ではなく AI が語り口をまねていることを、名前の行でいつも見せる）。

import { decodeQuoteRefs, QUOTE_PREFIX } from './evidenceCheck';
import { shortTitle } from './consultHelpers';

export const SHELF_LABEL = 'あなたの本棚';
export const SELF_LABEL = '自分の学び';
export const GROUP_TILES = 4;

// 画面用の目印つきの行（使ったメモ・前の相談から・引用の照合・トークン・踏まえた行動）。AI が挙げた根拠ではない。
export const VOICE_PREFIX = '🗣 ';
// 🧵 は同じ会話の目印（lib/consultThreads.js・2026-10-08）。
const META_PREFIXES = ['🌱 ', '🌿 ', QUOTE_PREFIX, '🪙 ', '🎯 ', VOICE_PREFIX, '🧵 '];
export const VOICE_SUFFIX = '（本の語り口で・AI）';
const isMeta = (r) => META_PREFIXES.some((p) => String(r || '').startsWith(p));

const pick = (b) => ({ id: b.id, title: String(b.title || ''), author: String(b.author || '').trim(), cover: b.cover || null });

// 参照の 1 行（📚 著者『書名』p.12）から本を探す（完全一致 → 部分一致）。MyBookBrain の resolveRefBookId と同じ決まり。
export function bookForRef(ref, books) {
  const tm = String(ref || '').match(/『([^』]+)』/);
  const title = tm ? tm[1].trim() : '';
  if (!title || !Array.isArray(books)) return null;
  return books.find((b) => String(b.title || '').trim() === title)
    || books.find((b) => String(b.title || '').trim() && title.includes(String(b.title).trim()))
    || null;
}

// AI が書いた書名（『』なし）に当たる本棚の本（2026-10-04・本ごとのカード・もとになった本を本棚の本に限るため）。
//   まるごと同じ → AI の書名が本棚の書名を含む（副題つき）→ 本棚の書名が AI の書名を含む（AI が副題を落とした・3 字以上）。
//   空白・記号・全角半角の違いは無視する。
const normShelf = (t) => {
  let s = String(t || '');
  try { s = s.normalize('NFKC'); } catch { /* そのまま */ }
  return s.toLowerCase().replace(/[\s　、。・:：;；「」『』（）()[\]【】〈〉《》"'“”‘’―—~〜\-_/／|｜!！?？]/g, '');
};
export function shelfBookForTitle(title, books) {
  const t = normShelf(title);
  if (!t || !Array.isArray(books)) return null;
  const list = books.filter((b) => b && normShelf(b.title));
  return list.find((b) => normShelf(b.title) === t)
    || list.find((b) => t.includes(normShelf(b.title)))
    || (t.length >= 3 ? list.find((b) => normShelf(b.title).includes(t)) : null)
    || null;
}

// 本 1 冊の名前の行「著者『書名』」（書名は副題を外して短く）。
export function bookPartnerLabel(book) {
  const t = shortTitle(book?.title || '') || String(book?.title || '');
  const a = String(book?.author || '').trim().split(/[,、，]/)[0].trim();
  return a ? `${a}『${t}』` : `『${t}』`;
}

// 語り口の答えの名前（著者名・著者が無ければ『書名』）。後ろに VOICE_SUFFIX を添えて見せる。
export function voiceLabel(book) {
  const a = String(book?.author || '').trim().split(/[,、，]/)[0].trim();
  return a || `『${shortTitle(book?.title || '') || String(book?.title || '')}』`;
}

// 本 1 冊の相手を、語り口の答えの名前にする。
export function withVoice(partner) {
  if (!partner || partner.kind !== 'book') return partner;
  return { ...partner, voice: true, label: voiceLabel(partner.books[0]), suffix: VOICE_SUFFIX };
}

// refs に残した語り口の印（VOICE_PREFIX＋JSON: まとめて＝{ t: 書名, a: 著者 }／本ごとに＝{ p: 1 }）。無ければ null。
export function decodeVoice(refs) {
  const r = (Array.isArray(refs) ? refs : []).find((x) => String(x || '').startsWith(VOICE_PREFIX));
  if (!r) return null;
  try {
    const o = JSON.parse(String(r).slice(VOICE_PREFIX.length));
    if (o && o.p) return { perbook: true };
    if (o && typeof o.t === 'string' && o.t.trim()) return { title: o.t.trim(), author: typeof o.a === 'string' ? o.a.trim() : '' };
  } catch { /* 読めない印は無いものとして扱う */ }
  return null;
}
export function encodeVoice(voice) {
  if (!voice) return null;
  if (voice.perbook) return `${VOICE_PREFIX}${JSON.stringify({ p: 1 })}`;
  if (!voice.title) return null;
  return `${VOICE_PREFIX}${JSON.stringify({ t: String(voice.title).slice(0, 80), a: String(voice.author || '').slice(0, 60) })}`;
}

function groupLabel(books, self) {
  if (self) return books.length === 1 ? `${bookPartnerLabel(books[0])}と${SELF_LABEL}` : `${books.length} 冊の本と${SELF_LABEL}`;
  return `${books.length} 冊の本`;
}

function make(books, self, { shelf = false } = {}) {
  if (books.length === 0 && self) return { kind: 'self', books: [], self: true, shelf: false, label: SELF_LABEL };
  if (books.length === 1 && !self && !shelf) return { kind: 'book', books, self: false, shelf: false, label: bookPartnerLabel(books[0]) };
  return { kind: 'group', books, self: !!self, shelf, label: shelf ? SHELF_LABEL : groupLabel(books, self) };
}

// 答えの根拠（refs）から。根拠の本も学びも取れなければ null（→ 相談相手から決める）。
export function partnerFromRefs(refs, books) {
  const list = Array.isArray(refs) ? refs : [];
  // 引用がどれもメモと一致しなかった本（作った引用の本）は、相手として見せない。
  const byTitle = new Map();
  decodeQuoteRefs(list).forEach((c) => {
    const t = String(c.t || '').trim();
    if (!t) return;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(c.s);
  });
  // 'x'＝渡したメモに無い本の参照（evidenceCheck.js・2026-10-04）も相手にしない
  const failed = [...byTitle].filter(([, ss]) => ss.every((s) => s === 'ng' || s === 'x')).map(([t]) => t);
  const found = [];
  let self = false;
  list.forEach((r) => {
    if (isMeta(r)) return;
    const s = String(r).trim();
    if (s.startsWith('💡') || /^[^『]*自分の学び/.test(s)) { self = true; return; }
    const b = bookForRef(s, books);
    if (!b || found.some((x) => x.id === b.id)) return;
    const t = String(b.title || '').trim();
    if (failed.some((f) => f === t || f.includes(t) || t.includes(f))) return;
    found.push(pick(b));
  });
  if (found.length === 0 && !self) return null;
  return make(found, self);
}

// 「すべての本」のときに並べる表紙: メモのある本（memoBookIds・無ければ全部）を、表紙のある本 → 新しい順で最大 4 冊。
//   メモのある本が 1〜3 冊しか無いときは、本棚のほかの本で 4 つまで埋める（名前は「あなたの本棚」なのに表紙 1 枚の
//   アイコン＝その本 1 冊に見える、を避ける・2026-10-04 ui-critic）。メモのある本が 0 冊なら表紙なし（今までどおり）。
export function shelfBooks(books, memoBookIds = null, max = GROUP_TILES) {
  const ids = memoBookIds instanceof Set ? memoBookIds : Array.isArray(memoBookIds) ? new Set(memoBookIds) : null;
  const all = (Array.isArray(books) ? books : []).filter((b) => b && b.id && String(b.title || '').trim());
  const when = (b) => String(b.updated_at || b.created_at || '');
  const order = (list) => [...list].sort((a, b) => (Number(!!b.cover) - Number(!!a.cover)) || when(b).localeCompare(when(a)));
  const withMemo = order(all.filter((b) => !ids || ids.has(b.id)));
  const fill = ids && withMemo.length > 0 && withMemo.length < max ? order(all.filter((b) => !ids.has(b.id))) : [];
  return [...withMemo, ...fill].slice(0, max).map(pick);
}

// 相談相手（scopeIds: [] = すべての本 / [id] = 1 冊 / [id, …] = 選んだ数冊）から。
export function partnerFromScope({ scopeIds = [], books = [], memoBookIds = null } = {}) {
  const ids = Array.isArray(scopeIds) ? scopeIds.filter(Boolean) : [];
  if (ids.length === 0) return make(shelfBooks(books, memoBookIds), false, { shelf: true });
  const chosen = ids.map((id) => (books || []).find((b) => b.id === id)).filter(Boolean).map(pick);
  if (chosen.length === 0) return make([], false, { shelf: true });
  return make(chosen, false);
}

// 本ごとにの結論のカード（2026-09-30 ui-critic）: 数冊を並べてくらべた答えなので、ひとりの著者の名前にしない。
// 数冊なら「N 冊の本」（表紙を並べた丸のまま）。1 冊・自分の学び・あなたの本棚はそのまま。
export function perbookSummaryPartner(partner) {
  if (!partner || partner.kind !== 'group' || partner.shelf || partner.books.length === 0) return partner;
  const n = partner.books.length;
  return { ...partner, label: partner.self ? `${n} 冊の本と${SELF_LABEL}` : `${n} 冊の本` };
}

// 答え 1 つの相手。書き終えていて根拠が取れれば根拠から、そうでなければ相談相手から。
//   useScope: 書いている途中・失敗・案内・関係するメモが無かった答え（特定の本を見せない）
//   voice: 語り口の答え（{ title, author }）なら、その本（本棚に無ければ書名と著者だけ）を「著者名（本の語り口で・AI）」で。
export function consultPartner({ refs = [], scopeIds = [], books = [], memoBookIds = null, useScope = false, voice = null } = {}) {
  if (voice && voice.title) {
    const b = bookForRef(`『${voice.title}』`, books);
    return withVoice(make([b ? pick(b) : { id: null, title: voice.title, author: voice.author || '', cover: null }], false));
  }
  if (!useScope) {
    const p = partnerFromRefs(refs, books);
    if (p) return p;
  }
  return partnerFromScope({ scopeIds, books, memoBookIds });
}
