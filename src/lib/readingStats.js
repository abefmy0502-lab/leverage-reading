// ⏱📊 記録の「読書の時間」の数え方（2026-10-10 オーナー「せっかく時間を測るので、どれくらいの読書に費やしたのか
// 記録で可視化できるように」「どのような分類の本にどの本にどれくらい時間をかけたのかを客観的にみれるように」）。
//
// 2026-06-26「作業量の可視化はしない」の例外（2026-10-09 に読書の時間だけ認めたもの）を、記録へ広げたもの。
// 見せるのは積み重ねそのもの（今月・これまで・週ごと・分野ごと・本ごと）だけ。目標・連続日数・順位・%・
// 「あと N 分」・ほかの人との比べは作らない（反ゲーミフィケーション）。
//
// 日付をまたいだ回・週をまたいだ回は、lib/readingTime.js の secondsWithin で時刻の割合に分ける。
// 期間は端末の暦（ローカル時刻）。週は月曜はじまり（記録の「読書の足あと」・行動の「今週」とそろえる）。

import { secondsWithin, fmtDuration, MIN_SESSION_SEC } from './readingTime';
import { isBookField } from './bookFields';

export const STATS_WEEKS = 12;
export const TAG_TOP = 6;
export const BOOKS_COLLAPSED = 5;
export const NO_TAG = '分野なし';
export const OTHER_TAGS = 'ほか';

// その週の月曜 0 時（端末の暦・ms）。
export function weekStartOf(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

// その月の 1 日 0 時と次の月の 1 日 0 時（ms）。
export function monthRange(now = Date.now()) {
  const d = new Date(now);
  return {
    from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
  };
}

// 本棚にある本の行だけ（消した本の、端末に残った控えは数えない＝本ごとの合計と合計が食い違わない）。
function rowsOfShelf(rows, books) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.book_id && Number(r.seconds) > 0) : [];
  if (!Array.isArray(books)) return list;
  const ids = new Set(books.filter(Boolean).map((b) => b.id));
  return list.filter((r) => ids.has(r.book_id));
}

// 1 行のうち期間に入る秒。period: 'month'（今月）／'all'（これまで）。
function rowSeconds(r, period, now) {
  if (period === 'month') {
    const { from, to } = monthRange(now);
    return secondsWithin(r, from, to);
  }
  return Math.max(0, Number(r.seconds) || 0);
}

// 期間の合計秒（本ごとの合計の和＝本ごと・分類ごとと食い違わない）。
export function periodSeconds(rows, books, period = 'all', now = Date.now()) {
  return bookTotals(rows, books, period, now).reduce((sum, x) => sum + x.seconds, 0);
}

// [from, to) に入る秒の合計（本棚の本だけ・期間をまたいだ回は時刻の割合で分ける）。写真で共有の今月・今年に使う（2026-10-11）。
export function rangeSeconds(rows, books, from, to) {
  return rowsOfShelf(rows, books).reduce((sum, r) => sum + secondsWithin(r, from, to), 0);
}

// その年の 1 月 1 日 0 時と次の年の 1 月 1 日 0 時（ms）。
export function yearRange(now = Date.now()) {
  const d = new Date(now);
  return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: new Date(d.getFullYear() + 1, 0, 1).getTime() };
}

// 読書の時間がひとつでもあるか（記録の区画を出すか）。
export function hasReadingTime(rows, books) {
  return periodSeconds(rows, books, 'all') >= MIN_SESSION_SEC;
}

// はじめに見せる期間: 今月に記録があれば今月、無ければこれまで。
export function defaultPeriod(rows, books, now = Date.now()) {
  return periodSeconds(rows, books, 'month', now) >= MIN_SESSION_SEC ? 'month' : 'all';
}

// 直近 weeks 週（古い → 新しい）の週ごとの秒。
//   monthLabel: その週に月の 1 日があれば「10月」（いちばん左の週は、すぐ右に 1 日が無ければその月）。
export function weeklyTotals(rows, books, { weeks = STATS_WEEKS, now = Date.now() } = {}) {
  const list = rowsOfShelf(rows, books);
  const current = weekStartOf(now);
  const out = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const s = new Date(current);
    const from = new Date(s.getFullYear(), s.getMonth(), s.getDate() - w * 7).getTime();
    const fromD = new Date(from);
    const to = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate() + 7).getTime();
    let firstOfMonth = null;
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate() + i);
      if (d.getDate() === 1) firstOfMonth = d.getMonth();
    }
    // いちばん左の週は 1 日が無くてもその月の名前（すぐ右の週に 1 日があるときは、名前が重なるので出さない＝読書の足あとと同じ）。
    let month = firstOfMonth;
    if (month == null && w === weeks - 1) {
      const nextHasFirst = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate() + 13).getDate() <= 7;
      month = nextHasFirst ? null : fromD.getMonth();
    }
    out.push({
      from,
      to,
      seconds: list.reduce((sum, r) => sum + secondsWithin(r, from, to), 0),
      isCurrent: w === 0,
      monthLabel: month == null ? '' : `${month + 1}月`,
    });
  }
  return out;
}

// 本ごとの秒（多い順・同じなら書名順）。期間に読んでいない本は入れない。
export function bookTotals(rows, books, period = 'all', now = Date.now()) {
  const byId = new Map();
  for (const r of rowsOfShelf(rows, books)) {
    const sec = rowSeconds(r, period, now);
    if (sec > 0) byId.set(r.book_id, (byId.get(r.book_id) || 0) + sec);
  }
  const bookById = new Map((books || []).filter(Boolean).map((b) => [b.id, b]));
  return [...byId.entries()]
    .filter(([id, sec]) => bookById.has(id) && sec >= MIN_SESSION_SEC)
    .map(([id, seconds]) => ({ book: bookById.get(id), seconds }))
    .sort((a, b) => b.seconds - a.seconds || String(a.book.title || '').localeCompare(String(b.book.title || ''), 'ja'));
}

// 本の分野（2026-10-11・lib/bookFields.js）。分野でない前の版のタグは数えない。
function tagsOf(book) {
  const seen = new Set();
  for (const t of Array.isArray(book?.tags) ? book.tags : []) {
    const k = String(t || '').trim();
    if (k && isBookField(k)) seen.add(k);
  }
  return [...seen];
}

// 本がその分野に入るか（tag が NO_TAG なら、分野の無い本）。
export function bookInTag(book, tag) {
  if (!tag) return true;
  const tags = tagsOf(book);
  return tag === NO_TAG ? tags.length === 0 : tags.includes(tag);
}

// 分野ごとの秒と、最大剰余で配った分（足すと期間の合計の分とちょうど同じ）。
//   記録の「分野」の行と、読書の時間の「分野ごと」は、この同じ分を出す（2026-10-11 ui-critic・1 分ずれていた）。
// 戻り値: { byTag: Map<分野, { tag, seconds, minutes, books }>, untagged, totalSeconds, totalMinutes }
export function allottedFieldMinutes(rows, books, period = 'all', now = Date.now()) {
  const perBook = bookTotals(rows, books, period, now);
  const byTag = new Map();
  let untagged = null;
  let totalSeconds = 0;
  for (const { book, seconds } of perBook) {
    totalSeconds += seconds;
    const tags = tagsOf(book);
    if (tags.length === 0) {
      untagged = untagged || { tag: NO_TAG, seconds: 0, books: 0 };
      untagged.seconds += seconds;
      untagged.books += 1;
      continue;
    }
    const share = seconds / tags.length;
    for (const t of tags) {
      const cur = byTag.get(t) || { tag: t, seconds: 0, books: 0 };
      cur.seconds += share;
      cur.books += 1;
      byTag.set(t, cur);
    }
  }
  const totalMinutes = displayMinutesOf(totalSeconds);
  const all = [...byTag.values(), ...(untagged ? [untagged] : [])];
  allotMinutes(all, totalMinutes);
  return { byTag, untagged, totalSeconds, totalMinutes };
}

// 分野ごとの時間（2026-10-10 オーナー裁定「重ねて数えない」・2026-10-11 に本のタグから分野へ）。
//   分野が 2 つ以上の本は、その本の時間を分野の数で等しく分ける（3 つなら 1/3 ずつ）。分野の無い本は「分野なし」。
//   計算は秒のまま、見せる分（minutes）は最大剰余で丸める＝分類ごとの分を足すと、期間の合計の分とちょうど同じ。
//   多い順に top 個まで。残りのタグは「ほか」にまとめる（残りが 1 つだけならそのまま出す）。「タグなし」はいつも最後。
// 戻り値: { items: [{ tag, seconds, minutes, books }], other: { tag, seconds, minutes, tags } | null,
//          untagged: { tag, seconds, minutes, books } | null, totalSeconds, totalMinutes }
export function tagTotals(rows, books, period = 'all', now = Date.now(), { top = TAG_TOP } = {}) {
  const { byTag, untagged, totalSeconds, totalMinutes } = allottedFieldMinutes(rows, books, period, now);
  // 並びは見せる分で（丸めたあとの数と並びが食い違わない）・同じなら秒・名前。
  const sorted = [...byTag.values()].sort((x, y) => y.minutes - x.minutes || y.seconds - x.seconds || x.tag.localeCompare(y.tag, 'ja'));
  // 上位のあとに残る分類が 1 つだけなら「ほか（1 分類）」にまとめず、そのまま 7 行目に出す（2026-10-10 ui-critic）。
  const cut = sorted.length === top + 1 ? top + 1 : top;
  const items = sorted.slice(0, cut).filter((x) => x.minutes > 0);
  const rest = [...sorted.slice(cut), ...sorted.slice(0, cut).filter((x) => x.minutes <= 0)];
  const otherMinutes = rest.reduce((m, x) => m + x.minutes, 0);
  const other = rest.length > 0 && otherMinutes > 0
    ? { tag: OTHER_TAGS, seconds: rest.reduce((m, x) => m + x.seconds, 0), minutes: otherMinutes, tags: rest.length }
    : null;
  return {
    items,
    other,
    untagged: untagged && untagged.minutes > 0 ? untagged : null,
    totalSeconds,
    totalMinutes,
  };
}

// 合計の秒を、画面と同じ丸め方で分に（fmtDuration と同じ＝30 秒以上 1 分未満は 1 分）。
function displayMinutesOf(sec) {
  if (!(sec > 0)) return 0;
  return Math.max(1, Math.round(sec / 60));
}

// 最大剰余で分を配る（足すと total ちょうど）。entries に minutes を書き込む。
function allotMinutes(entries, total) {
  const sum = entries.reduce((m, e) => m + e.seconds, 0);
  if (!(sum > 0) || total <= 0) { entries.forEach((e) => { e.minutes = 0; }); return; }
  const exact = entries.map((e) => (e.seconds / sum) * total);
  entries.forEach((e, i) => { e.minutes = Math.floor(exact[i]); });
  let left = total - entries.reduce((m, e) => m + e.minutes, 0);
  const order = entries.map((e, i) => i).sort((i, j) => (exact[j] - Math.floor(exact[j])) - (exact[i] - Math.floor(exact[i])) || entries[j].seconds - entries[i].seconds);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length) {
    entries[order[k]].minutes += 1;
    left -= 1;
  }
}

// 分を「2 時間 5 分」「45 分」に（分類ごとの丸めた分を見せるとき）。
export function fmtMinutes(min) {
  return fmtDuration(Math.max(0, Number(min) || 0) * 60);
}

// 記録の数字の書き方（「2 時間 5 分」「45 分」）。集中モードの小さな行と同じ（lib/readingTime.js の fmtDuration）。
export function fmtReadingTotal(sec) {
  return fmtDuration(sec);
}

// 週の名前（読み上げ・見えない表）: 「10月6日の週」。
export function weekName(fromMs) {
  const d = new Date(fromMs);
  return `${d.getMonth() + 1}月${d.getDate()}日の週`;
}
