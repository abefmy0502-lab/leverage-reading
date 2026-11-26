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
//   メモが無く読み始めていない人には、ホームの一覧に出ていない積読・読みたいの本を 1 冊（読み始める）。
//
// ⚠️ 純関数だけ（I/O なし）。端末に覚えるのは hooks/useReturnMoment.js。

import { pickRecallMemo, pickFallbackMemo, recallFraming, memoExcerpt, isAiWritten } from './recall';

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

// メモがまだ無い人の「はじめて N」で見せる本（アーカイブは除く）。
//   - 読書中・読了の本があれば、ホームの「相談相手をつくる」（はじめの一歩）が一文のメモをもう誘っているので出さない（2 度言わない）。
//   - ホームの一覧（積読があれば積読、無ければ読みたいの、新しく触った順の上から 3 冊・HomeScreen の ReadingNow と同じ並び）に
//     出る本は選ばない（同じ本に 2 つの入口を並べない・2026-11-26 ui-critic）。残りから、いちばん長く待っている本（触ったのが古い順）。
//     残りが無ければ出さない（すぐ下の一覧がもう同じ一歩）。
const byUpdatedDesc = (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
function fallbackBook(books) {
  const list = (Array.isArray(books) ? books : []).filter((b) => b && b.id && b.title && !b.archivedAt);
  if (list.some((b) => b.status === 'reading' || b.status === 'done')) return null;
  const before = list.filter((b) => b.status === 'before').sort(byUpdatedDesc);
  const want = list.filter((b) => b.status === 'want').sort(byUpdatedDesc);
  const onHome = new Set((before.length ? before : want).slice(0, 3).map((b) => b.id));
  const rest = [...before, ...want].filter((b) => !onHome.has(b.id));
  if (!rest.length) return null;
  return rest.sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')))[0];
}

// 今日出す 1 行を決める。出さないなら null。
//   戻り値: { kind: 'anniv'|'back', key, lead, quote, memo?, book?, action: 'read'|'compare'|'start', actionLabel, question? }
//   memos: [{ id, bookId, text, createdAt, lastRecalledAt?, recallCount?, sourceType? }]
//   prevDay: 前に開いた日（'YYYY-MM-DD'・はじめてなら null）
//   done: もう出した印の集まり（Set）。'anniv:90'・'back:2026-11-26' など
export function pickReturnMoment({ now, createdAt = null, prevDay = null, memos = [], bookIds = null, books = null, done = new Set() } = {}) {
  const today = jstDay(now);
  const own = ownBookMemos(memos, bookIds);
  const ann = anniversaryOf(createdAt, now);
  if (ann && !done.has(ann.key)) {
    if (own.length) {
      const first = [...own].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)))[0];
      // 3 か月からは「いまの考えと比べる」＝最初のメモを入れた相談の下書き（送らない・答えのもとは自分のメモ）。
      //   長く使うほど深まる（戦略の判断基準 8）。1 か月はまだ近いので読み返すだけ。
      if (ann.days >= COMPARE_FROM_DAYS) {
        const excerpt = memoExcerpt(first.text || '', 60).replace(/「/g, '『').replace(/」/g, '』');
        return {
          kind: 'anniv', key: ann.key, label: ann.label, memo: first, action: 'compare', actionLabel: 'いまの考えと比べる',
          lead: `orime をはじめて ${ann.label}。最初に書いたメモ`, quote: momentQuote(first),
          question: `${ann.label}前に「${excerpt}」とメモしました。いまの私の考えは、そこからどう変わっていますか？`,
        };
      }
      return { kind: 'anniv', key: ann.key, label: ann.label, memo: first, action: 'read', actionLabel: '読み返す', lead: `orime をはじめて ${ann.label}。最初に書いたメモ`, quote: momentQuote(first) };
    }
    // メモがまだ無く、まだ読み始めていない人（読書の習慣がない人に多い）: ホームの一覧に出ていない積読・読みたいの本を 1 冊 → 読み始める。
    const b = fallbackBook(books);
    if (b) {
      return {
        kind: 'anniv', key: ann.key, label: ann.label, book: b, action: 'start', actionLabel: '読み始める',
        lead: `orime をはじめて ${ann.label}。本棚で待っている本`, quote: `『${b.title}』`,
      };
    }
    return null;
  }
  if (!own.length) return null;
  const gap = dayDiff(prevDay, today);
  const backKey = `back:${today}`;
  if (gap != null && gap >= BACK_AFTER_DAYS && !done.has(backKey)) {
    const seed = Number(today.replace(/-/g, '')) || 0;
    // 思い出しカードと同じ選び方。まだ若いメモしか無い人（はじめて数日）は、1 日以上前のメモから。
    const memo = pickRecallMemo(own, { now, minAgeDays: 2, seed }) || pickFallbackMemo(own, { now, minAgeDays: 1, seed });
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
