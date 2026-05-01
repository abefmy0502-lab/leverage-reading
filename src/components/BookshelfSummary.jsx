// 📊 BookshelfSummary — 本棚タブ上部の月次 1 行サマリー。
//
// 表示する数:
//   - 「読了 N 冊」: 今月の done_date が今月の本のカウント
//   - 「読書中 N 冊」: status === 'reading' の現在のカウント (リアルタイム)
//   - 「読書前 N 冊」: status === 'before' の現在のカウント
//
// 月初にリセットされる感覚は「今月の done_date」を見る形で実現。アプリ
// 側で日次タイマーは持たない (純粋に props ベースで集計するだけ)。

import { useMemo } from 'react';

function startOfThisMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function isThisMonth(dateLike, monthStart) {
  if (!dateLike) return false;
  // book.doneDate は 'YYYY-MM-DD' 形式で transformBook から渡る想定。
  // Date constructor が許容する形式ならそのまま比較。
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return false;
  return d >= monthStart;
}

function buildStats(books) {
  if (!Array.isArray(books) || books.length === 0) {
    return { readingNow: 0, beforeNow: 0, doneThisMonth: 0 };
  }
  const monthStart = startOfThisMonth();
  let readingNow = 0;
  let beforeNow = 0;
  let doneThisMonth = 0;
  for (const b of books) {
    if (!b) continue;
    if (b.status === 'reading') readingNow += 1;
    else if (b.status === 'before') beforeNow += 1;
    if (b.status === 'done' && isThisMonth(b.doneDate, monthStart)) doneThisMonth += 1;
  }
  return { readingNow, beforeNow, doneThisMonth };
}

const wrap = {
  fontSize: 14,
  color: '#666',
  padding: '6px 4px',
  margin: '0 0 6px',
  lineHeight: 1.5,
  fontFamily: 'inherit',
};

const linkLike = {
  ...wrap,
  background: 'none',
  border: 'none',
  textAlign: 'left',
  width: '100%',
  cursor: 'pointer',
  display: 'block',
};

export default function BookshelfSummary({ books, onClick }) {
  const stats = useMemo(() => buildStats(books), [books]);
  const empty = stats.readingNow === 0 && stats.beforeNow === 0 && stats.doneThisMonth === 0;

  const text = empty
    ? '📚 今月の活動はまだありません。最初の 1 冊から始めましょう'
    : `📚 今月: 読了 ${stats.doneThisMonth} 冊 / 読書中 ${stats.readingNow} 冊 / 読書前 ${stats.beforeNow} 冊`;

  if (onClick) {
    return (
      <button type="button" style={linkLike} onClick={onClick} aria-label={text}>
        {text}
      </button>
    );
  }
  return <p style={wrap} aria-label={text}>{text}</p>;
}
