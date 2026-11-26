// 🌙 また開いたときの 1 行（2026-11-26 オーナー「無料ユーザーが 1・3・5・7・30・90・180・365 日目に使い続ける仕組みに」）。
//
// 点検で分かったこと: 何日か空けて戻ってきた人にも、1 か月・半年・1 年たった人にも、ホームは毎回同じだった
//   （iPhone のアプリは通知も既定で出ない）。読むほど育つアプリなのに、育ったことに出会う瞬間が無かった。
//
// 出すもの（ホームの題の下・1 行・× で閉じる・AI なし・通知は送らない）:
//   - はじめて 1 か月・3 か月・半年・1 年（その日から 14 日のうちに開いたとき・1 回だけ）
//       「orime をはじめて 3 か月。最初に書いたメモ「…」」→「読み返す」＝そのメモを開く
//   - 2 日以上あけて開いたとき（その日 1 回だけ・7 日以上あけたときだけ頭に「おかえりなさい。」）
//       「2 週間前に書いたメモ「…」」→「読み返す」
//     選ぶメモは思い出しカードと同じ（忘れかけたものから・自分の言葉だけ・AI のまとめは出さない）。
//
// 出さないもの: 連続日数・「N 日ぶり」の数・目標・バッジ・責める言葉（「しばらく開いていません」など）。
//   空けた日数は数字にしない。はじめて N は、3 か月からは「いまの考えと比べる」（相談の下書き）。
//   メモが無い人には、読みかけの本（続きを 15 分）か本棚で待っている本（15 分だけ読む）・読みたいの本は本の詳細へ（本を見る）。
//
// ⚠️ 純関数だけ（I/O なし）。端末に覚えるのは hooks/useReturnMoment.js。

import { pickRecallMemo, pickFallbackMemo, recallFraming, memoExcerpt, isAiWritten } from './recall';
import { daysUntilDeadline } from './homeActions';
import { fmtDuration } from './readingTime';

const DAY_MS = 86400000;

// 「はじめて N」の区切り（アカウントを作ってからの日数）。1 年からは 1 年ごと。
export const ANNIVERSARIES = Object.freeze([
  { days: 30, label: '1 か月' },
  { days: 90, label: '3 か月' },
  { days: 180, label: '半年' },
  { days: 365, label: '1 年' },
]);
export const ANNIVERSARY_WINDOW_DAYS = 14;
// 何日あけたら出すか（2026-11-26 2 回目: 1 日目のあと 3 日目に開く人＝あけたのは 2 日、にも出す）。
//   毎日開く人には出さない。「おかえりなさい。」を頭に付けるのは 7 日以上あけたときだけ（数日おきの人に毎回は重い）。
export const BACK_AFTER_DAYS = 2;
export const WELCOME_AFTER_DAYS = 7;
// 前の自分と比べる相談を出すのは、はじめて 3 か月から（最初のメモが十分に古くなってから）。
export const COMPARE_FROM_DAYS = 90;

// 日本時間の日付（'YYYY-MM-DD'）。端末の時刻に頼らない（ほかの月の決まりと同じ）。
export function jstDay(ms) {
  const d = new Date(Number(ms) + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}
export function dayDiff(fromDay, toDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDay || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(toDay || ''))) return null;
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

// 今日が「はじめて N」の 14 日のうちなら { days, label, key }。作った日が読めなければ null。
export function anniversaryOf(createdAt, now) {
  const t = new Date(createdAt || '').getTime();
  if (!Number.isFinite(t)) return null;
  // 「N 日目」で数える（はじめた日が 1 日目・オーナーの「1 日目・30 日・365 日」と同じ数え方）。
  const diff = dayDiff(jstDay(t), jstDay(now));
  const age = diff == null ? null : diff + 1;
  if (age == null || age < ANNIVERSARIES[0].days) return null;
  const marks = [...ANNIVERSARIES];
  for (let y = 2; y <= 20; y += 1) marks.push({ days: 365 * y, label: `${y} 年` });
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const m = marks[i];
    if (age >= m.days) return age < m.days + ANNIVERSARY_WINDOW_DAYS ? { ...m, key: `anniv:${m.days}` } : null;
  }
  return null;
}

// 自分の言葉の、本のメモだけ（本を開いて見せられるもの）。
function ownBookMemos(memos, bookIds) {
  return (Array.isArray(memos) ? memos : []).filter((m) => m && m.bookId && (!bookIds || bookIds.has(m.bookId))
    && String(m.text || '').trim() && !isAiWritten(m) && Number.isFinite(new Date(m.createdAt).getTime()));
}

// メモがまだ無い人に見せる本（アーカイブは除く）。{ book, mode: 'reading'|'waiting'|'want' } か null。
//   - 読書中の本があれば、いちばん新しく触った読書中の本＝「続きを 15 分」（1 日目に読み始めて、戻ってきても何も出ていなかった・
//     2026-11-26 体験した人の声 2 回目）。同じ本を続けて出してよい（読みかけの本は 1 冊を読み切るのが一歩）。
//   - 読了だけの人（読書中も積読・読みたいも無い）は出さない（ホームの「相談相手をつくる」が一文のメモを誘う）。
//   - 積読を先に（手元にある本）。読みたいの本はまだ手元に無いかもしれないので「本を見る」＝本の詳細（書店・積読に積む）。
//   - ホームの一覧（新しく触った順の上から 3 冊）に出ていない本があれば、いちばん長く待っている本。無ければ一覧の 1 冊目。
//   - 前の 1 行で見せた本（done の 'b:<id>'）は、ほかに候補があれば選ばない。全部見せていたら seenAll（はじめて N で 1 冊探す）。
const byUpdatedDesc = (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
const byUpdatedAsc = (a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''));
function fallbackBook(books, done = new Set()) {
  const list = (Array.isArray(books) ? books : []).filter((b) => b && b.id && b.title && !b.archivedAt);
  const reading = list.filter((b) => b.status === 'reading').sort(byUpdatedDesc);
  if (reading.length) return { book: reading[0], mode: 'reading' };
  const pickFrom = (group) => {
    if (!group.length) return null;
    const sorted = [...group].sort(byUpdatedDesc);
    const onHome = new Set(sorted.slice(0, 3).map((b) => b.id));
    const order = [...sorted.filter((b) => !onHome.has(b.id)).sort(byUpdatedAsc), ...sorted.filter((b) => onHome.has(b.id))];
    return order.find((b) => !done.has(`b:${b.id}`)) || null;
  };
  const before = list.filter((b) => b.status === 'before');
  const want = list.filter((b) => b.status === 'want');
  const b = pickFrom(before);
  if (b) return { book: b, mode: 'waiting' };
  const w = pickFrom(want);
  if (w) return { book: w, mode: 'want' };
  if (before.length || want.length) return { book: null, mode: 'seenAll', first: [...before, ...want].sort(byUpdatedDesc)[0] };
  return null;
}
// 本の 1 行。readLine は「これまで 45 分 読みました」（はじめて N で、読んだ時間があるときだけ）。
function bookMoment({ kind, key, label = null, prefix = '', pick, readLine = '' }) {
  const { book, mode } = pick;
  const name = mode === 'reading' ? '読みかけの本' : mode === 'want' ? '読みたい本' : '本棚で待っている本';
  // 読んだ時間と本の種類は分けて書く（その本を 15 時間読んだように見えない・2026-11-26 体験した人の声 3 回目）
  const lead = readLine ? `${prefix}${readLine}。${name}` : `${prefix}${name}`;
  if (mode === 'want') return { kind, key, label, book, action: 'open', actionLabel: '本を見る', lead, quote: `『${book.title}』` };
  return { kind, key, label, book, action: 'focus', actionLabel: mode === 'reading' ? '続きを 15 分' : '15 分だけ読む', lead, quote: `『${book.title}』` };
}

// 今日出す 1 行を決める。出さないなら null。
//   戻り値: { kind: 'anniv'|'back'|'action', key, lead, quote, memo?, book?, action: 'read'|'compare'|'focus'|'open'|'advisor'|'actions', actionLabel, question? }
//   readSeconds: これまで読んだ時間の合計（集中モード・秒）
//   memos: [{ id, bookId, text, createdAt, lastRecalledAt?, recallCount?, sourceType? }]
//   prevDay: 前に開いた日（'YYYY-MM-DD'・はじめてなら null）
//   done: もう出した印の集まり（Set）。'anniv:90'・'back:2026-11-26' など
// 期限が今日か、過ぎて 3 日までの、まだの行動（相談で決めた一歩を、翌日以降に思い出せるように・2026-11-26 体験した人の声＝
//   「初日に行動に追加しても、翌日以降どこにも出てこない」）。ホームの常設の行ではなく、この 1 行の中だけ・1 日 1 回・閉じられる。
//   それより古い期限は振り返り › 行動 にある（ここで毎日責めない）。
export function dueActionOf(books, now) {
  const list = [];
  for (const b of Array.isArray(books) ? books : []) {
    if (!b || b.archivedAt) continue;
    for (const a of Array.isArray(b.actions) ? b.actions : []) {
      if (!a || a.done || !String(a.text || '').trim()) continue;
      const n = daysUntilDeadline(a.deadline, new Date(now));
      if (n != null && n <= 0 && n >= -3) list.push({ ...a, bookId: b.id, _n: n });
    }
  }
  list.sort((x, y) => y._n - x._n || String(x.text).localeCompare(String(y.text)));
  return list[0] || null;
}

export function pickReturnMoment({ now, createdAt = null, prevDay = null, memos = [], bookIds = null, books = null, done = new Set(), readSeconds = 0 } = {}) {
  const today = jstDay(now);
  const own = ownBookMemos(memos, bookIds);
  const ann = anniversaryOf(createdAt, now);
  // 期限が来た行動（いちばん先・1 日 1 回）。はじめて N より先（節目の日に期限を過ぎた行動が隠れていた・2026-11-26 体験した人の声 3 回目）。
  //   はじめて N は印を付けずに残すので、14 日のうちの次に開いた日に出る。
  const actKey = `act:${today}`;
  const due = done.has(actKey) ? null : dueActionOf(books, now);
  if (due) {
    return {
      kind: 'action', key: actKey, action: 'actions', actionLabel: '行動を開く', bookId: due.bookId,
      lead: due._n === 0 ? '今日が期限の行動' : '期限が来ている行動', quote: `「${memoExcerpt(due.text, 40)}」`,
    };
  }
  // 前に 1 行で見せたメモ（done の 'm:<id>'）は、ほかに候補があれば選ばない（3 日目と 7 日目に同じメモを出さない・2026-11-26 体験した人の声）。
  const seen = (m) => done.has(`m:${m.id}`);
  if (ann && !done.has(ann.key)) {
    if (own.length) {
      const sorted = [...own].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)));
      // いちばん古いメモ。もう見せていたら、まだ見せていないいちばん古いメモ（半年・1 年で同じ最初のメモを繰り返さない）。
      const firstUnseen = sorted.find((m) => !seen(m));
      const first = firstUnseen || sorted[0];
      const isFirst = first.id === sorted[0].id;
      const memoLabel = isFirst ? '最初に書いたメモ' : (recallFraming(first.createdAt, now) || '前に書いたメモ');
      // 3 か月からは「いまの考えと比べる」＝最初のメモを入れた相談の下書き（送らない・答えのもとは自分のメモ）。
      //   長く使うほど深まる（戦略の判断基準 8）。1 か月はまだ近いので読み返すだけ。
      // 1 年からは、この間に積み重ねたもの（読了の冊数・自分のメモの件数）を 1 行に（365 日目に「1 年で何が変わったか」が
      //   無かった・2026-11-26 体験した人の声 3 回目）。数だけ・順位・目標・%・前年比はしない（記録の画面と同じ数え方）。
      const doneCount = (Array.isArray(books) ? books : []).filter((b) => b && b.status === 'done' && !b.archivedAt).length;
      const yearLine = ann.days >= 365 ? `${[doneCount ? `読了 ${doneCount} 冊` : '', `メモ ${own.length} 件`].filter(Boolean).join('・')}。` : '';
      if (ann.days >= COMPARE_FROM_DAYS) {
        const excerpt = memoExcerpt(first.text || '', 60).replace(/「/g, '『').replace(/」/g, '』');
        return {
          kind: 'anniv', key: ann.key, label: ann.label, memo: first, action: 'compare', actionLabel: 'いまの考えと比べる',
          lead: `orime をはじめて ${ann.label}。${yearLine}${memoLabel}`, quote: momentQuote(first),
          question: `${isFirst ? `${ann.label}前` : (recallFraming(first.createdAt, now) || '前').replace(/に書いたメモ$/, '')}に「${excerpt}」とメモしました。いまの私の考えは、そこからどう変わっていますか？`,
        };
      }
      return { kind: 'anniv', key: ann.key, label: ann.label, memo: first, action: 'read', actionLabel: '読み返す', lead: `orime をはじめて ${ann.label}。${memoLabel}`, quote: momentQuote(first) };
    }
    // メモがまだ無い人（読書の習慣がない人に多い）: 読みかけの本の続き・本棚で待っている本。
    //   読んだ時間があれば「これまで 45 分 読みました」（節目ごとに同じ文にしない・2026-11-26 体験した人の声 2 回目）。
    //   待っている本をもう全部見せていたら（同じ本を何度もすすめない）、いまの悩みで 1 冊探し直す＝AI 選書。
    const pick = fallbackBook(books, done);
    if (!pick) return null;
    const prefix = `orime をはじめて ${ann.label}。`;
    const readLine = readSeconds >= 60 ? `これまで ${fmtDuration(readSeconds)} 読みました` : '';
    // 前の節目でも同じ読みかけの本を出していたら（done の 'r:<id>'）、続きを迫らず、ほかの本に替えてもよいと伝えて 1 冊探す。
    if (pick.mode === 'reading' && done.has(`r:${pick.book.id}`)) {
      return { kind: 'anniv', key: ann.key, label: ann.label, book: pick.book, action: 'advisor', actionLabel: '1 冊探す', lead: `${prefix}${readLine ? `${readLine}。` : ''}合う本に替えてもかまいません`, quote: `『${pick.book.title}』` };
    }
    if (pick.mode === 'seenAll') {
      return { kind: 'anniv', key: ann.key, label: ann.label, action: 'advisor', actionLabel: '1 冊探す', lead: `${prefix}${readLine || 'いまの悩みに合う本'}`, quote: '' };
    }
    return bookMoment({ kind: 'anniv', key: ann.key, label: ann.label, prefix, pick, readLine });
  }
  const gap = dayDiff(prevDay, today);
  const backKey = `back:${today}`;
  if (!own.length) {
    // メモが無く読み始めていない人が 2 日以上あけて開いた日も、本棚で待っている本を 1 冊（3〜7 日目に何も無かった）。
    if (gap == null || gap < BACK_AFTER_DAYS || done.has(backKey)) return null;
    // 3〜7 日目は全部見せていても、いちばん上の本（同じ週のうちは同じ 1 冊でよい・読み始めるきっかけ）。
    let pick = fallbackBook(books, done);
    if (pick?.mode === 'seenAll') pick = { book: pick.first, mode: pick.first.status === 'want' ? 'want' : 'waiting' };
    return pick ? bookMoment({ kind: 'back', key: backKey, prefix: gap >= WELCOME_AFTER_DAYS ? 'おかえりなさい。' : '', pick }) : null;
  }
  if (gap != null && gap >= BACK_AFTER_DAYS && !done.has(backKey)) {
    const seed = Number(today.replace(/-/g, '')) || 0;
    // 思い出しカードと同じ選び方。まだ若いメモしか無い人（はじめて数日）は、1 日以上前のメモから。
    const fresh = own.filter((m) => !seen(m));
    const pool = fresh.length ? fresh : own;
    const memo = pickRecallMemo(pool, { now, minAgeDays: 2, seed }) || pickFallbackMemo(pool, { now, minAgeDays: 1, seed });
    if (!memo) return null;
    const framing = recallFraming(memo.createdAt, now) || '前に書いたメモ';
    return { kind: 'back', key: backKey, memo, action: 'read', actionLabel: '読み返す', quote: momentQuote(memo), lead: gap >= WELCOME_AFTER_DAYS ? `おかえりなさい。${framing}` : framing };
  }
  return null;
}

// 画面に出す引用（「」で包む・1 行に収まる長さで…）。
export function momentQuote(memo, max = 40) {
  // 中の「」は『』に（「」の入れ子で読みにくくしない）。
  const t = memoExcerpt(memo?.text || '', max).replace(/「/g, '『').replace(/」/g, '』');
  return t ? `「${t}」` : '';
}
