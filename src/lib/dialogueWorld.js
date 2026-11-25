// 🌐 対話の世界（2026-11-25 オーナー「本と、著者と、これまで読んできた本たちと会話できる世界」）。
//   相談の最初の画面に、話し相手の入口（本と話す・著者と話す）と、読んできた本から話しかけてくる 1 枚
//   （再会・つながり・前の自分）を置く。ここは端末の中だけで決める（AI もトークンも使わない）。
//   答えるのは今までの相談（材料は本人のメモと読書準備・根拠を見る・本の語り口は「AI」と明示）。
import { splitAuthorNames, authorKey } from './favoriteAuthors';
import { buildLinkIndex, findLinkedMemos } from './memoLinks';
import { coreTitleOf } from '../../api/_bookRank.js';

const DAY = 86400000;
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return [...t].length > n ? `${[...t].slice(0, n - 1).join('')}…` : t;
};
// 副題を落とした短い書名（「考え方 人生・仕事の結果が変わる」→「考え方」）。
export function shortBookTitle(title, max = 24) {
  return clip(coreTitleOf(title) || String(title || ''), max);
}

const hasMemo = (b, memoBookIds) => !memoBookIds || memoBookIds.has(b.id);
const ratingOf = (b) => Number(b?.rating) || 0;
const timeOf = (b) => Date.parse(b?.doneDate || b?.done_date || b?.updated_at || b?.updatedAt || b?.created_at || '') || 0;

/**
 * 話せる本（メモのある本だけ＝答えのもとがある本）。読書中 → 評価の高い読了 → 新しい順。10 冊まで。
 */
export function talkBooks(books, memoBookIds, max = 10) {
  return (books || [])
    .filter((b) => b && b.id && b.title && hasMemo(b, memoBookIds) && (b.status === 'reading' || b.status === 'done'))
    .sort((a, b) => (b.status === 'reading') - (a.status === 'reading') || ratingOf(b) - ratingOf(a) || timeOf(b) - timeOf(a))
    .slice(0, max);
}

/**
 * 話せる著者（メモのある本の著者・最初の人・本が 2 冊以上かお気に入り）。お気に入りの著者 → 本の多い順。6 人まで（画面を静かに）。
 *   [{ name, key, bookIds }]
 */
export function talkAuthors(books, memoBookIds, favorites = [], max = 6) {
  const favKeys = new Set((favorites || []).map((f) => f.key));
  const map = new Map();
  for (const b of books || []) {
    if (!b?.id || !hasMemo(b, memoBookIds) || !(b.status === 'reading' || b.status === 'done')) continue;
    const name = splitAuthorNames(b.author)[0];
    if (!name) continue;
    const key = authorKey(name);
    if (!map.has(key)) map.set(key, { name, key, bookIds: [] });
    map.get(key).bookIds.push(b.id);
  }
  // 本が 1 冊だけの著者は「本と話す」と同じになるので出さない（お気に入りの著者だけは出す・2026-11-25 ui-critic）。
  return [...map.values()]
    .filter((a) => a.bookIds.length >= 2 || favKeys.has(a.key))
    .sort((a, b) => favKeys.has(b.key) - favKeys.has(a.key) || b.bookIds.length - a.bookIds.length)
    .slice(0, max);
}

/**
 * いまの話し相手の種類。
 *   { kind: 'all' } / { kind: 'book', book } / { kind: 'author', author, books } / { kind: 'multi', books }
 */
export function scopeKind(scopeIds, books, authorHint = null) {
  const ids = Array.isArray(scopeIds) ? scopeIds : [];
  if (!ids.length) return { kind: 'all' };
  const picked = (books || []).filter((b) => ids.includes(b.id));
  const names = picked.map((b) => splitAuthorNames(b.author)[0] || '');
  // 著者の名前から開いたときは、本が 1 冊でも著者として話す（押したものと見出しを合わせる）。
  if (authorHint && picked.length && names.every((n) => n && authorKey(n) === authorKey(authorHint))) {
    return { kind: 'author', author: names[0], books: picked };
  }
  if (picked.length === 1) return { kind: 'book', book: picked[0] };
  if (picked.length > 1 && names[0] && names.every((n) => authorKey(n) === authorKey(names[0]))) {
    return { kind: 'author', author: names[0], books: picked };
  }
  return { kind: 'multi', books: picked };
}

/** 話し相手の見出し（「『考え方』と話す」「稲盛和夫さんの本と話す」「選んだ 2 冊と話す」）。全部の本のときは null。 */
export function scopeHeading(sk) {
  if (sk.kind === 'book') return `『${shortBookTitle(sk.book.title)}』と話す`;
  if (sk.kind === 'author') return `${sk.author}さんの本と話す`;
  if (sk.kind === 'multi') return `選んだ ${sk.books.length} 冊と話す`;
  return null;
}

/** 話し相手の下の 1 行（AI の解釈であること）。 */
export function scopeNote(sk) {
  // 答えのもと（メモ N 件）は上の行が言うので、ここは AI の解釈であることだけ（2026-11-25 ui-critic）。
  if (sk.kind === 'book') return 'AI が本の語り口をまねて答えます。著者本人の言葉ではありません。';
  if (sk.kind === 'author') return 'AI が著者の語り口をまねて答えます。著者本人の言葉ではありません。';
  if (sk.kind === 'multi') return '本ごとの見方を並べ、ぶつかるところも見せます。AI の解釈で、著者本人の言葉ではありません。';
  return '';
}

/**
 * 話し相手ごとの問いかけ（押すとそのまま送る・mode 'perbook' は本ごとに答える）。3〜4 個。
 *   [{ text, label, kind, mode? }]  label＝画面に見せる文（見出しにある書名・著者名をくり返さない）・text＝送る文
 */
export function scopeQuestions(sk) {
  if (sk.kind === 'book') {
    const t = shortBookTitle(sk.book.title);
    return [
      { text: `『${t}』でいちばん大事な考えは？ 私のメモから教えて`, label: 'いちばん大事な考えは？ 私のメモから教えて', kind: 'book' },
      { text: `『${t}』を読んだとき、私は何を感じていた？`, label: '読んだとき、私は何を感じていた？', kind: 'book' },
      { text: `いまの私の悩みに、『${t}』はどんな見方をくれる？`, label: 'いまの私の悩みに、どんな見方をくれる？', kind: 'book' },
      { text: `『${t}』の考えを、仕事や毎日でどう試せる？`, label: 'この本の考えを、仕事や毎日でどう試せる？', kind: 'book' },
    ];
  }
  if (sk.kind === 'author') {
    const a = sk.author;
    return [
      { text: `${a}さんの本に共通する考えは？ 私のメモから教えて`, label: sk.books?.length > 1 ? '本に共通する考えは？ 私のメモから教えて' : 'いちばん大事な考えは？ 私のメモから教えて', kind: 'author' },
      { text: `${a}さんの考えなら、いまの私の悩みをどう見る？`, label: 'この考え方なら、いまの私の悩みをどう見る？', kind: 'author' },
      { text: `${a}さんの考えに、あえて反論するとしたら？`, label: 'あえて反論するとしたら？', kind: 'author' },
    ];
  }
  if (sk.kind === 'multi') {
    return [
      { text: '選んだ本の考えを、ぶつけてみて。どこが同じで、どこで対立する？', kind: 'clash', mode: 'perbook' },
      { text: '選んだ本は、どんな同じ問いに向き合っている？', kind: 'multi' },
      { text: 'いまの私には、どの本の考えがいちばん効く？', kind: 'multi', mode: 'perbook' },
    ];
  }
  return [];
}

// ---- 読んできた本から（話しかけてくる 1 枚） ---------------------------------------------
const bookMemos = (rows) => (rows || []).filter((r) => r && r.book_id && r.text && (!r.source_type || r.source_type === 'book') && [...String(r.text)].length >= 12);
const ageDays = (r, now) => Math.floor((now - (Date.parse(r.created_at || r.createdAt || '') || now)) / DAY);
// 日ごとに決まる選び方（開くたびに入れ替わらない・日が変われば別の 1 枚）。
const daySeed = (now) => Math.floor(now / DAY);
const pick = (list, seed) => (list.length ? list[seed % list.length] : null);

/** 何か月前か（「半年前」「1 年前」）。 */
export function agoLabel(days) {
  if (days >= 330) return `${Math.max(1, Math.round(days / 365))} 年前`;
  if (days >= 160 && days < 220) return '半年前';
  return `${Math.max(1, Math.round(days / 30))} か月前`;
}

/**
 * 読んできた本から話しかけてくる 1 枚（無ければ null）。
 *   reunion … 3 か月以上前に書いたメモとの再会（評価の高い本から）→ 相談の下書き「…と書いていました。今の私にどう効く？」
 *   link    … 2 冊の本に、同じことを書いたメモがある → 重ねて考える（AI なし）
 *   past    … 前のあなた（3 か月以上前）と今のあなた（30 日以内）が同じことを考えている → 重ねて考える
 * 日ごとに 1 つ（kinds の順で、出せるもののうち日で回す）。
 */
export function rediscoverCard({ rows, books, now = Date.now() }) {
  const memos = bookMemos(rows);
  if (memos.length < 3) return null;
  const byId = new Map((books || []).map((b) => [String(b.id), b]));
  const seed = daySeed(now);
  const cards = [];

  // reunion
  const old = memos
    .filter((m) => ageDays(m, now) >= 90 && byId.get(String(m.book_id)))
    .sort((a, b) => ratingOf(byId.get(String(b.book_id))) - ratingOf(byId.get(String(a.book_id))) || ageDays(b, now) - ageDays(a, now))
    .slice(0, 12);
  const r = pick(old, seed);
  if (r) {
    const book = byId.get(String(r.book_id));
    const ago = agoLabel(ageDays(r, now));
    const quote = clip(r.text, 60);
    cards.push({
      kind: 'reunion', book, memo: r,
      lead: `${ago}、『${shortBookTitle(book.title, 20)}』でこう書いていました`,
      quote,
      action: 'いまの私にどう効く？',
      question: `${ago}に『${shortBookTitle(book.title, 20)}』で「${clip(r.text, 40).replace(/「/g, '『').replace(/」/g, '』')}」と書いていました。いまの私に、この考えはどう効く？`,
      bookIds: [book.id],
    });
  }

  // link / past（似ている度合い・端末の中）
  const recent = memos.filter((m) => ageDays(m, now) <= 30).slice(0, 30);
  const index = buildLinkIndex(memos);
  let linkCard = null;
  let pastCard = null;
  for (const m of recent) {
    const hits = findLinkedMemos(index, { text: m.text, bookId: m.book_id, memoId: m.id, k: 2 });
    for (const h of hits) {
      const a = byId.get(String(m.book_id));
      const b = byId.get(String(h.bookId));
      if (!a || !b) continue;
      if (!pastCard && ageDays(h.memo, now) >= 90) {
        pastCard = {
          kind: 'past', memo: m, other: h.memo, book: a, otherBook: b,
          lead: `${agoLabel(ageDays(h.memo, now))}のあなたも、近いことを考えていました`,
          quote: clip(h.memo.text, 60),
          action: 'いまの考えと重ねる',
        };
      } else if (!linkCard) {
        linkCard = {
          kind: 'link', memo: m, other: h.memo, book: a, otherBook: b,
          lead: `『${shortBookTitle(a.title, 14)}』と『${shortBookTitle(b.title, 14)}』は、同じことに向き合っています`,
          quote: clip(h.memo.text, 60),
          action: '2 冊を重ねて考える',
        };
      }
    }
    if (linkCard && pastCard) break;
  }
  if (pastCard) cards.push(pastCard);
  if (linkCard) cards.push(linkCard);
  return pick(cards, seed);
}
