// ⏱📊 記録の「読書の時間」（2026-10-10 オーナー「せっかく時間を測るので、どれくらいの読書に費やしたのか記録で
// 可視化できるように」「どのような分類の本にどの本にどれくらい時間をかけたのかを客観的にみれるように」）。
//
// 上から: 今月・これまで の 2 つの数 → 週ごと（直近 12 週の棒）→ 内訳の期間（今月｜これまで）→ 分野ごと
// （本の分野・分野が複数の本は時間を分野の数で分ける＝足すと合計）→ 本ごと（多い順・5 冊のあとは畳む）。
// 反ゲーミフィケーション: 目標・連続日数・順位・%・「あと N 分」・ほかの人との比べは出さない。
// 棒は「その期間の合計に対する長さ」を見せるだけ（数字の % は書かない）。
// 数え方は lib/readingStats.js（日付・週・月をまたいだ回は時刻の割合で分ける）。

import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { MiniCover } from './BookCards';
import { withPhraseBreaks } from './TightBubble';
import { btnLink } from '../styles/ui';
import {
  STATS_WEEKS, BOOKS_COLLAPSED, NO_TAG,
  periodSeconds, defaultPeriod, weeklyTotals, bookTotals, tagTotals, bookInTag,
  fmtReadingTotal, fmtMinutes, weekName,
} from '../lib/readingStats';
import { totalSeconds, MIN_SESSION_SEC } from '../lib/readingTime';
import { useReadingSessions } from '../hooks/useReadingSessions';

// グラフの目の角丸（「形そのもの」DESIGN §4 の例外・ReadingRecord の CHART_RADIUS と同じ 3）。
const CHART_RADIUS = 3;
const WEEK_BAR_MAX = 64;
const WEEK_BAR_MIN = 3;
// 棒の色: ふだんはアクセントを面に 65% 混ぜた色（カードの面と 3:1 以上＝読書の足あとのいちばん薄い段と同じ）、今週だけアクセント。
const BAR_SOFT = 'color-mix(in srgb, var(--accent) 65%, var(--surface))';

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

const subHeading = {
  margin: 0,
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  color: 'var(--text)',
};

const metaText = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };

// 2 つの数（今月・これまで）。
function TotalCell({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
      <span style={metaText}>{label}</span>
      <span style={{ fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.2, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all' }}>
        {withPhraseBreaks(value)}
      </span>
    </div>
  );
}

// 週ごとの棒（直近 12 週・月曜はじまり）。目盛りの数字は出さない（今週の時間だけ下の 1 行に）。
function WeekBars({ weeks }) {
  const peak = weeks.reduce((m, w) => Math.max(m, w.seconds), 0);
  const last = weeks.length - 1;
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-1)', height: WEEK_BAR_MAX }}>
        {weeks.map((w) => {
          const has = w.seconds >= 30;
          const h = has && peak > 0 ? Math.max(WEEK_BAR_MIN, Math.round((w.seconds / peak) * WEEK_BAR_MAX)) : 2;
          return (
            <div key={w.from} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: '100%', maxWidth: 20, height: h, borderRadius: CHART_RADIUS,
                  background: !has ? 'var(--border)' : w.isCurrent ? 'var(--accent)' : BAR_SOFT,
                }}
              />
            </div>
          );
        })}
      </div>
      {/* 月の名前は、その月の 1 日がある週の下（読書の足あとと同じ決まり）。右の 2 本は列の右端にそろえる。 */}
      <div aria-hidden="true" style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-1)', height: 'max(var(--space-4), calc(var(--text-meta) * 1.3))' }}>
        {weeks.map((w, i) => (
          <div key={w.from} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            {w.monthLabel && (
              <span
                style={{
                  position: 'absolute', top: 0, whiteSpace: 'nowrap', lineHeight: 1.3,
                  fontSize: 'var(--text-meta)', color: 'var(--text-3)',
                  ...(i >= last - 1 ? { right: 0 } : { left: 0 }),
                }}
              >
                {w.monthLabel}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 割合の細い棒（その期間の合計に対する長さ）。
function ShareBar({ ratio }) {
  const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
  return (
    <div aria-hidden="true" style={{ height: 6, borderRadius: CHART_RADIUS, background: 'var(--fill)', overflow: 'hidden', marginTop: 'var(--space-1)' }}>
      <div style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, height: '100%', borderRadius: CHART_RADIUS, background: BAR_SOFT }} />
    </div>
  );
}

// 名前と時間の 1 行。名前は文節で折り返して 2 行まで（… で途中を切らない）、時間はいつも右（縮めない）。
//   文字を大きくしても、どの行も「名前（左・1〜2 行）＋時間（右）」の同じ形（2026-10-10 ui-critic）。
function NameTime({ name, time, strong, muted }) {
  return (
    // 名前は少なくとも 9 字ぶんの幅を取る（コミュニケーションが 1 字ずつ割れない）。収まらないときだけ時間を次の行の右へ。
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--space-3)' }}>
      <span style={{ flex: '1 1 auto', minWidth: 'min(100%, 9em)', fontSize: 'var(--text-sub)', lineHeight: 1.35, fontWeight: strong ? 600 : 400, color: muted ? 'var(--text-2)' : 'var(--text)', whiteSpace: 'normal', wordBreak: 'keep-all', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {withPhraseBreaks(name, { scriptBreaks: true })}
      </span>
      <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {time}
      </span>
    </span>
  );
}

const rowBtn = (on) => ({
  display: 'block',
  width: 'calc(100% + 2 * var(--space-2))',
  margin: '0 calc(-1 * var(--space-2))',
  padding: 'var(--space-2)',
  minHeight: 'var(--tap-min)',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: on ? 'var(--accent-soft)' : 'transparent',
  textAlign: 'left',
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxSizing: 'border-box',
});

// 期間の切り替え（iOS のセグメント・写真で共有の「投稿｜ストーリー」と同じ見た目・DESIGN §5）。
const segTrack = { display: 'inline-flex', gap: 'var(--space-1)', padding: 'var(--space-1)', background: 'var(--fill)', borderRadius: 'var(--radius)' };
const segBtn = (on) => ({
  minHeight: 'var(--tap-min)',
  padding: '0 var(--space-4)',
  border: 'none',
  borderRadius: 'calc(var(--radius) - var(--space-1))',
  background: on ? 'var(--seg-on)' : 'transparent',
  // 選んだ方は溝より明るい --seg-on の面＋細い縁（暗い設定でも溝と見分けられる・2026-10-10 ui-critic）。
  boxShadow: on ? 'inset 0 0 0 1px var(--border)' : 'none',
  color: on ? 'var(--text)' : 'var(--text-2)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const PERIODS = [{ v: 'month', label: '今月' }, { v: 'all', label: 'これまで' }];

export default function ReadingTimeCard({ rows, books, onOpenBook, now = Date.now() }) {
  const monthSec = useMemo(() => periodSeconds(rows, books, 'month', now), [rows, books, now]);
  const allSec = useMemo(() => periodSeconds(rows, books, 'all', now), [rows, books, now]);
  const weeks = useMemo(() => weeklyTotals(rows, books, { weeks: STATS_WEEKS, now }), [rows, books, now]);
  const [period, setPeriod] = useState(() => defaultPeriod(rows, books, now));
  const [tagFilter, setTagFilter] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const tags = useMemo(() => tagTotals(rows, books, period, now), [rows, books, period, now]);
  const perBook = useMemo(() => bookTotals(rows, books, period, now), [rows, books, period, now]);
  const periodTotal = period === 'month' ? monthSec : allSec;
  // 選んだ分野がこの期間に無ければ、絞り込みはしない。
  const tagNames = new Set([...tags.items.map((x) => x.tag), ...(tags.untagged ? [NO_TAG] : [])]);
  const activeTag = tagFilter && tagNames.has(tagFilter) ? tagFilter : null;
  const shownBooks = activeTag ? perBook.filter((x) => bookInTag(x.book, activeTag)) : perBook;
  const visibleBooks = expanded ? shownBooks : shownBooks.slice(0, BOOKS_COLLAPSED);
  const thisWeek = weeks[weeks.length - 1];
  const tagRows = [...tags.items, ...(tags.other ? [tags.other] : []), ...(tags.untagged ? [tags.untagged] : [])];

  const choosePeriod = (v) => { setPeriod(v); setExpanded(false); };
  const chooseTag = (t) => { setTagFilter((cur) => (cur === t ? null : t)); setExpanded(false); };

  return (
    <section
      data-reading-time=""
      aria-labelledby="reading-time-title"
      style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' }}
    >
      <h3 id="reading-time-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>読書の時間</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-8)', rowGap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <TotalCell label="今月" value={fmtReadingTotal(monthSec)} />
        <TotalCell label="これまで" value={fmtReadingTotal(allSec)} />
      </div>

      {/* 週ごと */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <h4 style={subHeading}>週ごと</h4>
        <p style={{ ...metaText, margin: 'var(--space-1) 0 0' }}>
          {`直近 ${STATS_WEEKS} 週`}{thisWeek && thisWeek.seconds >= 30 ? <span style={{ whiteSpace: 'nowrap', marginLeft: 'var(--space-3)' }}>今週 {fmtReadingTotal(thisWeek.seconds)}</span> : null}
        </p>
        <WeekBars weeks={weeks} />
        <table style={visuallyHidden}>
          <caption>{`週ごとの読書の時間（直近 ${STATS_WEEKS} 週）`}</caption>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.from}><th scope="row">{weekName(w.from)}</th><td>{w.seconds >= 30 ? fmtReadingTotal(w.seconds) : '記録なし'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 内訳（分野ごと・本ごと）の期間 */}
      <div style={{ borderTop: '1px solid var(--separator)', marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)' }}>
        <div role="group" aria-label="内訳の期間" style={segTrack}>
          {PERIODS.map((p) => (
            <button key={p.v} type="button" aria-pressed={period === p.v} onClick={() => choosePeriod(p.v)} style={segBtn(period === p.v)}>
              {p.label}
            </button>
          ))}
        </div>

        {periodTotal < 30 && period === 'month' ? (
          <p style={{ ...metaText, margin: 'var(--space-4) 0 0', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('今月の読書の時間は、まだありません。')}</p>
        ) : (
          <>
            {/* 分野ごと（本の分野）。押すと下の本ごとをその分野の本に絞る。 */}
            <div data-reading-time-tags="" style={{ marginTop: 'var(--space-4)' }}>
              <h4 style={subHeading} id="reading-time-tags-title">分野ごと</h4>
              <ul
                aria-labelledby="reading-time-tags-title"
                aria-describedby="reading-time-tags-total"
                style={{ listStyle: 'none', margin: 'var(--space-2) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
              >
                {tagRows.map((t) => {
                  const time = fmtMinutes(t.minutes);
                  const ratio = tags.totalMinutes > 0 ? t.minutes / tags.totalMinutes : 0;
                  const isOther = !!t.tags; // 「ほか」は押せない（いくつかの分野のまとめ）
                  const on = activeTag === t.tag;
                  return (
                    <li key={t.tag}>
                      {isOther ? (
                        <div style={{ padding: 'var(--space-2) 0', minHeight: 'var(--tap-min)', boxSizing: 'border-box' }}>
                          <NameTime name={`${t.tag}（${t.tags} 分野）`} time={time} muted />
                          <ShareBar ratio={ratio} />
                        </div>
                      ) : (
                        <button type="button" aria-pressed={on} aria-label={`${t.tag} ${time}`} onClick={() => chooseTag(t.tag)} style={rowBtn(on)}>
                          <NameTime name={t.tag} time={time} strong={on} />
                          <ShareBar ratio={ratio} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p id="reading-time-tags-total" style={visuallyHidden}>{`合計 ${fmtMinutes(tags.totalMinutes)}`}</p>
            </div>

            {/* 本ごと（多い順・5 冊のあとは畳む）。押すとその本の詳細。 */}
            <div data-reading-time-books="" style={{ marginTop: 'var(--space-6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', minHeight: activeTag ? 'var(--tap-min)' : undefined }}>
                <h4 style={subHeading} id="reading-time-books-title">本ごと</h4>
                {activeTag && (
                  <button
                    type="button"
                    onClick={() => chooseTag(activeTag)}
                    aria-label={`「${activeTag}」の絞り込みをやめる`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 'var(--tap-min)', padding: '0 var(--space-3)', border: 'none', borderRadius: 'var(--radius)', background: 'var(--accent-soft)', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 'var(--text-meta)', fontWeight: 600, cursor: 'pointer', maxWidth: '100%' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTag}</span>
                    <X size="1.1em" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                  </button>
                )}
              </div>
              <ul aria-labelledby="reading-time-books-title" style={{ listStyle: 'none', margin: 'var(--space-1) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {visibleBooks.map(({ book, seconds }) => {
                  const time = fmtReadingTotal(seconds);
                  const inner = (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <MiniCover book={book} width={28} radius={3} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <NameTime name={book.title || '（書名なし）'} time={time} />
                        <ShareBar ratio={periodTotal > 0 ? seconds / periodTotal : 0} />
                      </span>
                    </span>
                  );
                  return (
                    <li key={book.id}>
                      {onOpenBook ? (
                        <button type="button" aria-label={`『${book.title || ''}』 ${time}`} onClick={() => onOpenBook(book)} style={rowBtn(false)}>{inner}</button>
                      ) : (
                        <div style={{ padding: 'var(--space-2) 0' }}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!expanded && shownBooks.length > BOOKS_COLLAPSED && (
                <button type="button" onClick={() => setExpanded(true)} aria-expanded="false" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
                  {`すべての本（${shownBooks.length} 冊）`}
                  <ChevronDown size="1.1em" strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// 本の詳細の 1 行「読書の時間 2 時間 5 分」（読書中・読了・この本で 30 秒以上あるときだけ・2026-10-10）。
export function BookReadingTime({ bookId, style }) {
  const { rows } = useReadingSessions();
  const sec = totalSeconds(rows, bookId);
  if (!bookId || sec < MIN_SESSION_SEC) return null;
  return (
    <p data-book-reading-time="" style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 'var(--space-1) 0 0', ...style }}>
      読書の時間 <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtReadingTotal(sec)}</span>
    </p>
  );
}
