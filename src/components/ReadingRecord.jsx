// 📊 ReadingRecord — 振り返り「記録」サブタブ。
//
// 読書のあゆみを多面的に、しかし静かに可視化する（反ゲーミフィケーション厳守:
// バッジ / 連続日数カウンタ / 目標 / チャレンジは一切やらない。積み重ねと傾向を
// そのまま映すだけ。ヒートマップも「足あと」であって streak ではない）。
//
//   1. 読書 → メモ → 行動 : 読んだ本・残したメモ・実行した行動（累計。各数字からその一覧へ）
//   1a. やってみたこと : 完了した行動 → ふりかえり → 本（2026-10-21・lib/triedActions.js・完了した行動があるときだけ）
//   1b. 読書の時間   : 集中モードで測った時間（2026-10-10・記録があるときだけ・components/ReadingTimeCard.jsx）
//   2. 読書の足あと   : 直近16週のアクティビティ・ヒートマップ（メモ+読了+集中モードで読んだ日）
//   3. 月別の読了     : 直近 6 ヶ月の読了数のバー
//   4. 分野           : 大分類 4 つ・14 分野の全体（本のある分野は本・メモ・本がまだ無い分野は名前の 1 行＝押すと AI 選書）（2026-10-11・components/BookFields.jsx の BookFieldsRecord）。分野の付いた本があるときだけ
//   （2026-09-26 オーナー判断で 3 区画に絞った。旧: ハイライト/一番学んだ本/定着/リズム/テーマ/著者）
//
// データ:
//   - 本由来（読了/行動/収穫/タグ/著者/評価/ページ）は props.books から純粋に集計。
//   - メモ由来（件数/日別/月別/時間帯/想起/定着/本ごと）は自己完結 fetch
//     （HomeRecall と同流儀）。lean な列だけ・range ページング・schema-error
//     fallback（recall 列が無い DB では定着セクションを静かに隠す）。

import { withPhraseBreaks } from './TightBubble';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isSchemaError } from '../lib/errors';
import { useAuth } from '../hooks/useAuth';
import EmptyState from './EmptyState';
import { SkeletonBlock } from './Skeleton';
import { track, EVENTS } from '../lib/analytics';
import { BarChart3, BookOpen, ChevronRight } from 'lucide-react';
import { countSummaryMemos } from '../lib/consultHelpers';
import { applyLocalRecall } from '../lib/recall';
import { loadRecallLocal } from '../lib/recallLocal';
import { buildFieldRecord } from '../lib/bookFields';
import { BookFieldsRecord } from './BookFields';
import KnowledgeMapCard from './KnowledgeMapCard';
import ReadingTimeCard from './ReadingTimeCard';
import { useReadingSessions } from '../hooks/useReadingSessions';
import { hasReadingTime } from '../lib/readingStats';
import { appNow } from '../lib/appNow';
import { useAllActions } from '../hooks/useAllActions';
import { triedActions, TRIED_SHOWN } from '../lib/triedActions';
import { stripInlineMd } from '../lib/text';
import { btnLink } from '../styles/ui';

/* ---------- 日付ユーティリティ（ローカル基準・UTC ずれ防止） ---------- */

// 'YYYY-MM-DD' はローカル構築でパース（UTC 解釈による月バケットずれ防止）。
function parseLocalDate(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLike.trim());
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 直近 n ヶ月の空バケット（古い → 新しい）。
function lastMonths(n = 6, now = new Date()) {
  const arr = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    arr.push({ year: d.getFullYear(), month: d.getMonth(), count: 0 });
  }
  return arr;
}

function bucketize(dates, n = 6) {
  const buckets = lastMonths(n);
  const lower = new Date(buckets[0].year, buckets[0].month, 1, 0, 0, 0, 0);
  for (const dateLike of dates) {
    const d = parseLocalDate(dateLike);
    if (!d || d < lower) continue;
    const idx = buckets.findIndex((k) => k.year === d.getFullYear() && k.month === d.getMonth());
    if (idx >= 0) buckets[idx].count += 1;
  }
  return buckets;
}

/* ---------- 集計（本由来・純粋関数） ---------- */

function buildBookStats(books, now = new Date()) {
  const thisYear = now.getFullYear();
  // 前年同期: 前年の 1/1 〜「前年の今日」まで（＝フェアなペース比較）。
  // うるう日（2/29）は前年に存在せず Date が 3/1 へ繰り上がるため、月がずれたら
  // 前月末日（date=0）に丸めて「前年 2 月末まで」に補正する。
  let lastYearSameEnd = new Date(thisYear - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (lastYearSameEnd.getMonth() !== now.getMonth()) {
    lastYearSameEnd = new Date(thisYear - 1, now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  let doneTotal = 0;
  let doneThisYear = 0;
  let doneLastYearSame = 0;
  let pagesThisYear = 0;
  let actionsDone = 0;
  let harvest = 0;
  let daysSum = 0;
  let daysN = 0;
  const doneDates = [];
  const tagCounts = new Map();
  const authorCounts = new Map();
  const bestThisYear = [];
  for (const b of Array.isArray(books) ? books : []) {
    if (!b) continue;
    if (b.status === 'done') {
      doneTotal += 1;
      const d = parseLocalDate(b.doneDate);
      if (d) {
        doneDates.push(b.doneDate);
        if (d.getFullYear() === thisYear) {
          doneThisYear += 1;
          if (Number(b.totalPages) > 0) pagesThisYear += Number(b.totalPages);
          if (Number(b.rating) >= 4) bestThisYear.push({ id: b.id, title: b.title || '', rating: Number(b.rating), doneDate: b.doneDate });
        } else if (d.getFullYear() === thisYear - 1 && d <= lastYearSameEnd) {
          doneLastYearSame += 1;
        }
        // 1冊にかけた日数（開始日と読了日が両方ある本のみ・負値は除外）。
        const s = parseLocalDate(b.startDate);
        if (s && d >= s) {
          daysSum += Math.round((d - s) / 86400000) + 1;
          daysN += 1;
        }
      }
    }
    if (Array.isArray(b.actions)) {
      for (const a of b.actions) { if (a && a.done) actionsDone += 1; }
    }
    if (b.roiSummary && String(b.roiSummary).trim()) harvest += 1;
    if (Array.isArray(b.tags)) {
      for (const t of b.tags) {
        const key = String(t || '').trim();
        if (!key) continue;
        tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
      }
    }
    const author = String(b.author || '').trim();
    if (author) authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, 6);
  const topAuthors = [...authorCounts.entries()]
    .filter(([, n]) => n >= 2) // 1冊だけの著者を羅列しない（傾向として意味が出てから）
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, 5);
  bestThisYear.sort((a, b) => b.rating - a.rating || String(b.doneDate).localeCompare(String(a.doneDate)));
  return {
    doneTotal, doneThisYear, doneLastYearSame, pagesThisYear,
    actionsDone, harvest, doneDates, topTags, topAuthors,
    avgDays: daysN >= 2 ? Math.round(daysSum / daysN) : null,
    bestThisYear: bestThisYear.slice(0, 3),
  };
}

/* ---------- 共通スタイル ---------- */

const wrap = {
  padding: 'var(--space-3) var(--space-4) var(--space-8)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)', // 役割の違う区画の間はグループ間 24（DESIGN §1）
  fontFamily: 'var(--font-ui)',
  maxWidth: 560,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
};

const card = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
};

const cardTitle = {
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  color: 'var(--text)',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};


const BAR_MAX_H = 52;
const BAR_MIN_H = 3;
// グラフの目（棒・ヒートマップのマス・凡例）の角丸。UI の角丸（--radius 12）ではなく「形そのもの」
// として 3 を使う（DESIGN §4 の例外）。tokens.css には置かず、グラフ部品のここだけで使う。
const CHART_RADIUS = 3;

/* ---------- 小さな表示部品 ---------- */

// 読んだ本・メモ・実行した行動の 3 つの数（2026-10-16 ui-critic「→ と › が並ぶ図解に見える」）:
//   矢印はやめ、縦の細い線で 3 等分した列に。数は左寄せで大きく、その下に名前と ›（押すとその一覧）。
function FlowRow({ cells }) {
  // 文字が大きいとき（ルート 22px 以上）は 3 列に収まらないので、縦に積んで上の線で区切る
  //  （「305」が隣の列に重なり、「実行し／た」と割れていた・2026-11-18 文字最大の点検）。
  const stacked = (() => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22; } catch { return false; } })();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: stacked ? '1fr' : `repeat(${cells.length}, minmax(0, 1fr))`, marginTop: 'var(--space-3)' }}>
      {cells.map((c, i) => {
        const inner = (
          <>
            <span style={{ fontSize: 'var(--text-title)', fontWeight: 700, lineHeight: 1.1, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
            {/* 文字が大きいときは文節で折り返す（隣の列にはみ出さない）。 */}
            <span style={{ display: 'block', maxWidth: '100%', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.3, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks(c.label)}
              {/* › は名前の最後の字のすぐ右（名前が折り返しても離れない）。U+2060（結合子）で前の字との間に切れ目を作らない＝
                  文字を大きくしたとき › だけが次の行に落ちていた（2026-11-09） */}
              {c.onClick && <span style={{ whiteSpace: 'nowrap' }}>{'⁠'}<ChevronRight size="1.1em" aria-hidden="true" style={{ verticalAlign: '-0.2em', color: 'var(--text-3)' }} /></span>}
            </span>
          </>
        );
        const base = stacked ? {
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)', minWidth: 0,
          padding: i === 0 ? '0 0 var(--space-3)' : 'var(--space-3) 0', borderLeft: 'none',
          boxShadow: i === 0 ? 'none' : 'inset 0 1px 0 var(--separator)', textAlign: 'left',
        } : {
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)', minWidth: 0,
          paddingLeft: i === 0 ? 0 : 'var(--space-3)', paddingRight: i === cells.length - 1 ? 0 : 'var(--space-2)',
          borderLeft: i === 0 ? 'none' : '1px solid var(--separator)', textAlign: 'left',
        };
        return c.onClick ? (
          <button
            key={c.label}
            type="button"
            onClick={c.onClick}
            aria-label={`${c.label} ${c.value}。一覧を見る`}
            style={{ ...base, minHeight: 'var(--tap-min)', background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', ...(stacked ? null : { paddingTop: 0, paddingBottom: 0 }), cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {inner}
          </button>
        ) : (
          <div key={c.label} style={base}>{inner}</div>
        );
      })}
    </div>
  );
}

// 月別バー（読了 or メモ）。unit は読み上げの数え方（読了は「冊」・2026-09-29）。
// 今月の棒はアクセント、それより前は 65% に薄めた色（足あとのいちばん薄い段・分野の棒と同じ）（いまの位置が一目で分かる）。読了の無い月は棒を出さず、下の基線だけ（2026-11-26）。
const MONTH_BAR_SOFT = 'color-mix(in srgb, var(--accent) 65%, var(--surface))';
function MonthBars({ buckets, activeColor, unit = '冊' }) {
  const peak = buckets.reduce((m, k) => Math.max(m, k.count), 0);
  const lastIdx = buckets.length - 1;
  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-end', gap: 0, justifyContent: 'space-between', marginTop: 'var(--space-4)' }}
      role="img"
      aria-label={`月別の推移: ${buckets.map((k) => `${k.month + 1}月 ${k.count} ${unit}`).join(', ')}`}
    >
      {buckets.map((k, i) => {
        const h = peak > 0 ? Math.max(BAR_MIN_H, Math.round((k.count / peak) * BAR_MAX_H)) : BAR_MIN_H;
        const active = k.count > 0;
        const isCurrent = i === lastIdx;
        return (
          <div key={`${k.year}-${k.month}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', flex: 1, minWidth: 0 }} aria-hidden="true">
            {/* 件数は棒のすぐ上（4）に乗せる。枠の高さ＝棒の最大＋件数 1 行（13）＋間 4。 */}
            {/* 列の間は 0 にして、棒の左右の余白（4）で離す＝下の基線が途切れずに 1 本につながる */}
            <div style={{ width: '100%', boxSizing: 'border-box', padding: '0 var(--space-1)', height: BAR_MAX_H + 17, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-1)', borderBottom: '1px solid var(--separator)' }}>
              {active && (
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {k.count}
                </span>
              )}
              {active && (
                <div
                  style={{
                    width: '100%',
                    maxWidth: 28,
                    height: h,
                    borderRadius: `${CHART_RADIUS}px ${CHART_RADIUS}px 0 0`,
                    background: isCurrent ? activeColor : MONTH_BAR_SOFT,
                    transition: 'height var(--duration-base, 0.3s) var(--ease-out, ease)',
                  }}
                />
              )}
            </div>
            <span style={{ fontSize: 'var(--text-meta)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontWeight: isCurrent ? 600 : 400, color: isCurrent ? 'var(--text)' : 'var(--text-3)' }}>
              {k.month + 1}月
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 🟫 読書の足あと（GitHub 風ヒートマップ・月曜はじまり＝行動の「今週（月〜日）」とそろえる・直近 weeks 週）。
// streak カウンタは出さない — 色づいた日々をただ眺める「足あと」。
// 濃さはアクセント 1 色の混ぜ具合で表す（暗い画面でも同じトークンで破綻しない）。
// 記録の無い日は区切り線の色（--separator）。いちばん薄い段（65%）でもカードの面と 3:1 以上
// （明るい画面 3.1・暗い画面 3.8）にして、記録のあった日が見落とされないようにする。
// 読まなかった日は --fill（区切り線の色だと、いちばん薄い色との差が 3:1 に届かなかった・2026-10-16 第 5 回）
const HEAT_COLORS = ['var(--fill)', 'color-mix(in srgb, var(--accent) 65%, var(--surface))', 'color-mix(in srgb, var(--accent) 82%, var(--surface))', 'var(--accent)'];
function heatColor(n) {
  if (n <= 0) return HEAT_COLORS[0];
  if (n === 1) return HEAT_COLORS[1];
  if (n <= 3) return HEAT_COLORS[2];
  return HEAT_COLORS[3];
}

function Heatmap({ dateStrings, weeks = 16, title = '' }) {
  // 押した日（その日の日付と記録の数を下の 1 行に出す・もう一度押すと戻す・2026-11-26 オーナー「直感的に」）。
  // はじめは今日を選んでおく（下の 1 行がいつもデータ＝今日の記録の数。今日の縁と文が対になり、押すと替わると伝わる）。
  const [picked, setPicked] = useState(null);
  const { cols, activeDays, todayKey } = useMemo(() => {
    const counts = new Map();
    for (const s of dateStrings) {
      const d = parseLocalDate(s);
      if (!d) continue;
      const key = dayKey(d);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // 月曜はじまり
    const out = [];
    let prevMonth = -1;
    for (let w = weeks - 1; w >= 0; w -= 1) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() - w * 7);
      const days = [];
      let firstOfMonth = null; // この列に 1 日があれば、その月
      for (let dow = 0; dow < 7; dow += 1) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + dow);
        if (d.getDate() === 1) firstOfMonth = d.getMonth();
        days.push(d > today ? null : { key: dayKey(d), count: counts.get(dayKey(d)) || 0 });
      }
      // 月の名前は、その月の 1 日がある列に出す（月曜の月で決めると、月初めの数日は今月の名前が出なかった・2026-10-04）。
      // いちばん左の列は 1 日が無くてもその月の名前を出す（すぐ右の列に 1 日があるときは、名前が重なるので出さない）。
      let m = firstOfMonth;
      if (m == null && w === weeks - 1) {
        const next = new Date(weekStart);
        next.setDate(weekStart.getDate() + 13);
        const nextHasFirst = next.getDate() <= 7;
        m = nextHasFirst ? null : weekStart.getMonth();
      }
      out.push({ days, monthLabel: m != null && m !== prevMonth ? `${m + 1}月` : '' });
      if (m != null) prevMonth = m;
    }
    // 「活動があった日数」は表示ウィンドウ内（直近 weeks 週）だけを数える。
    // counts 全体を数えると全履歴の日数になり、aria-label が見た目と食い違う。
    let act = 0;
    for (const col of out) {
      for (const d of col.days) { if (d && d.count > 0) act += 1; }
    }
    return { cols: out, activeDays: act, todayKey: dayKey(today) };
  }, [dateStrings, weeks]);
  // 古い日から今日までの並び（キーボード・読み上げで 1 日ずつ／1 週ずつ動かす）。
  const dayList = useMemo(() => cols.flatMap((c) => c.days).filter(Boolean), [cols]);
  const pickedIdx = Math.max(0, dayList.findIndex((d) => d.key === (picked || todayKey)));
  const pickedDay = dayList[pickedIdx] || null;
  // 📍 なぞって選ぶ（2026-11-26 ui-critic: マスは 14pt で押すには小さい）。並びのどこに触れても、指にいちばん近いマスを選び、
  //    押したまま横・縦に滑らせると指の下の日に替わる（iOS のヘルスケアのグラフと同じ）。縦の送りは止めない（touch-action: pan-y）。
  const gridRef = useRef(null);
  const draggingRef = useRef(false);
  const pickAt = (x, y) => {
    const g = gridRef.current;
    if (!g) return;
    let best = null; let bestD = Infinity;
    g.querySelectorAll('[data-day]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2); const dy = y - (r.top + r.height / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = el; }
    });
    if (best) setPicked(best.getAttribute('data-day'));
  };
  //    指のときは、置いただけでは選ばない（ページを縦に送るつもりで触れても日が替わらない・2026-11-26 ui-critic）:
  //    離したときに 8 以内の動きならそこを選ぶ（タップ）・横に 8 を超えて縦より大きく動いたら、なぞりを始める。
  //    縦に送り始めたら pointercancel が来るので何もしない。マウスとペンは押したときに選ぶ。
  const startRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') { startRef.current = { x: e.clientX, y: e.clientY }; draggingRef.current = false; return; }
    startRef.current = null; draggingRef.current = true; pickAt(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    const st = startRef.current;
    if (st && !draggingRef.current) {
      const dx = Math.abs(e.clientX - st.x); const dy = Math.abs(e.clientY - st.y);
      if (dx > 8 && dx > dy) draggingRef.current = true; else return;
    }
    if (draggingRef.current) pickAt(e.clientX, e.clientY);
  };
  const onPointerUp = (e) => {
    const st = startRef.current;
    if (st && !draggingRef.current && Math.hypot(e.clientX - st.x, e.clientY - st.y) <= 8) pickAt(e.clientX, e.clientY);
    startRef.current = null; draggingRef.current = false;
  };
  const endDrag = () => { startRef.current = null; draggingRef.current = false; };
  // ⌨️ ← → で 1 日・↑ ↓ で 1 週（読み上げは上下のスワイプで 1 日ずつ＝調整できる部品）。
  const onKeyDown = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -Infinity, End: Infinity }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = Math.min(dayList.length - 1, Math.max(0, Number.isFinite(step) ? pickedIdx + step : (step < 0 ? 0 : dayList.length - 1)));
    if (dayList[next]) setPicked(dayList[next].key);
  };
  const dayLabel = (key) => {
    const d = parseLocalDate(key);
    if (!d) return '';
    return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
  };
  const pickedText = pickedDay
    ? `${dayLabel(pickedDay.key)}${pickedDay.key === todayKey ? '・今日' : ''}　${pickedDay.count > 0 ? `記録 ${pickedDay.count} 件` : '記録なし'}`
    : `直近 ${weeks} 週で記録した日 ${activeDays} 日`;

  const CELL = 14; // マスの最大（「形そのもの」DESIGN §4 の例外）。狭い画面では幅に合わせて縮む
  const GAP = 'var(--space-1)';
  // 月ラベルの行の高さ・曜日ラベルの列幅。文字を大きくしても「水」がマスに重ならない幅（文字の 1.2 倍・下限 16・2026-10-10 ui-critic）。
  const LABEL_H = 'max(var(--space-4), calc(var(--text-meta) * 1.2))';
  const label = { fontSize: 'var(--text-meta)', lineHeight: 1, color: 'var(--text-3)', whiteSpace: 'nowrap', alignSelf: 'center' };
  return (
    <div>
      {title && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 'var(--space-3)' }}>
          <h3 style={cardTitle}>{title}</h3>
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{`直近 ${weeks}\u00a0週で ${activeDays}\u00a0日`}</span>
        </div>
      )}
    <div>
      {/* 列は「曜日ラベル＋週の数」の格子。マスは幅に合わせて最大 14 まで（320px でもカードからはみ出さない）。
          左端は曜日ラベルを本文の左にそろえ、右端のマスは凡例の右端にそろえる（space-between）。 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_H} repeat(${cols.length}, minmax(0, ${CELL}px))`,
          gridTemplateRows: `${LABEL_H} repeat(7, auto)`,
          gridAutoFlow: 'column',
          gap: GAP,
          justifyContent: 'space-between',
          marginTop: 'var(--space-3)',
          touchAction: 'pan-y',
          cursor: 'pointer',
          borderRadius: CHART_RADIUS,
        }}
        ref={gridRef}
        role="slider"
        tabIndex={0}
        aria-label="読書の足あとの日"
        aria-valuemin={1}
        aria-valuemax={Math.max(1, dayList.length)}
        aria-valuenow={pickedIdx + 1}
        aria-valuetext={pickedText}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {/* 曜日ラベル列（月曜はじまり） */}
        <span />
        {['月', '', '水', '', '金', '', ''].map((l, i) => (
          <span key={`dow-${i}`} style={label}>{l}</span>
        ))}
        {cols.map((col, ci) => [
          // 右の 2 列の月の名前は、列の右端で終わるように右へそろえる（カードの右の余白にはみ出さない・2026-10-04 ui-critic）。
          <span
            key={`m-${ci}`}
            style={ci >= cols.length - 2
              ? { ...label, overflow: 'visible', width: 0, justifySelf: 'end', display: 'flex', justifyContent: 'flex-end' }
              : { ...label, overflow: 'visible', width: 0 }}
          >
            {col.monthLabel}
          </span>,
          ...col.days.map((d, di) => (
            <span
              key={`d-${ci}-${di}`}
              data-day={d ? d.key : undefined}
              style={{
                width: '100%', aspectRatio: '1 / 1', alignSelf: 'center', borderRadius: CHART_RADIUS,
                background: d ? heatColor(d.count) : 'transparent',
                                // 今日は細い縁（いまどこかが分かる）・押した日は濃い縁（2026-11-26）
                boxShadow: d && d.key === (picked || todayKey) ? 'inset 0 0 0 2px var(--text)' : (d && d.key === todayKey ? 'inset 0 0 0 1.5px var(--text-2)' : 'none'),
              }}
            />
          )),
        ])}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      {/* 色だけに頼らない（DESIGN §6）: 記録があった日数を文字でも。 */}
      {/* 選んだ日（はじめは今日）の記録の数。読み上げは上の部品の aria-valuetext で伝えるので、ここは見せるだけ。 */}
      <p aria-hidden="true" style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {pickedText}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'auto' }} aria-hidden="true">
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>少</span>
        {HEAT_COLORS.map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: CHART_RADIUS, background: c }} />
        ))}
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>多</span>
      </div>
      </div>
    </div>
    </div>
  );
}

/* ---------- 本体 ---------- */

// ナビゲーション props（すべて任意 — 渡された時だけ該当要素がタップ可能になる）:
//   onShowBooks(status) … 本棚をそのステータスで絞り込んで開く（読了タイル）
//   onShowMemos()       … 振り返り「メモ」サブタブへ
//   onShowActions()     … 振り返り「行動」サブタブへ
//   （onOpenBook / onFilterTag / onSearchAuthor は旧区画用。呼び出し側の互換のため受け取るだけ）
// 🎯 やってみたこと（lib/triedActions.js）。ふりかえりは明朝で（自分の言葉＝読む文章）。数字・%・連続日数は出さない。
// onConsult(action): その結果を相談する（下書きを入れて相談を開く・送らない）。積み重ね → 相談 の輪を記録からも回す（2026-10-21 ui-critic）。
function TriedCard({ books, onOpenBook, onShowActions, onConsult = null }) {
  const { allActions } = useAllActions(books);
  const list = useMemo(() => triedActions(allActions), [allActions]);
  if (list.length === 0) return null;
  const shown = list.slice(0, TRIED_SHOWN);
  const day = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  return (
    <section style={card} aria-label="やってみたこと">
      <h3 style={cardTitle}>やってみたこと</h3>
      <ul style={{ listStyle: 'none', margin: 'var(--space-2) 0 0', padding: 0 }}>
        {shown.map((a, i) => {
          const open = onOpenBook && a.bookId ? () => onOpenBook(a.bookId) : null;
          const meta = [a.bookTitle ? `『${a.bookTitle}』` : '', a.at ? `完了 ${day(a.at)}` : ''].filter(Boolean).join(' · ');
          const body = (
            <>
              <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(stripInlineMd(a.text))}</span>
              {a.reflection && (
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden', marginTop: 'var(--space-1)', fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', color: 'var(--text)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>{a.reflection}</span>
              )}
              {meta && <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(meta)}</span>}
            </>
          );
          const rowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', minHeight: 'var(--tap-min)', padding: 'var(--space-3) 0', background: 'none', border: 'none', borderTop: i ? '1px solid var(--separator)' : 'none', textAlign: 'left', fontFamily: 'inherit', cursor: open ? 'pointer' : 'default' };
          return (
            <li key={a.id || `${a.bookId}-${a.actionIdx}`}>
              {open ? (
                <button type="button" onClick={open} style={rowStyle}><span style={{ flex: 1, minWidth: 0 }}>{body}</span><ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} /></button>
              ) : <div style={rowStyle}><span style={{ flex: 1, minWidth: 0 }}>{body}</span></div>}
              {onConsult && i === 0 && (
                // いちばん新しい 1 件の下にだけ、結果を相談する文字ボタン（栗色・押せる範囲 44・2026-11-18 ui-critic
                //   「日付の行と同じに見えてボタンと分からない」→「4 回並んで数字のカードより目立つ」）。前の行動の相談は行動の一覧から。
                //   行の下の空き（12）だけ重ね、行の文字には重ねない。
                <button type="button" onClick={() => onConsult(a)} style={{ ...btnLink, margin: `calc(-1 * var(--space-3)) 0 var(--space-1) calc(-1 * var(--space-1))` }}>
                  この結果を相談する
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > TRIED_SHOWN && onShowActions && (
        <button type="button" onClick={onShowActions} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 'var(--tap-min)', padding: '0 var(--space-1)', margin: 'var(--space-1) 0 0 calc(-1 * var(--space-1))', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
          完了した行動をすべて見る（{list.length}）
        </button>
      )}
    </section>
  );
}

// 開いている間のメモの数の控え（ログイン中の人ごと）。
let recordStatsCache = { userId: null, stats: null };

export default function ReadingRecord({
  books,
  onConsultAction = null,
  onShowBooks,
  onShowMemos,
  onShowActions,
  onOpenBook,
  onFilterTag,
  onSearchAuthor,
  onGoToShelf,
  onFindBooksForTag,
  // メモが 0 件のときの次の一歩（2026-11-23 点検「0 メモが押せず、次にすることが無い」）。
  //   onWriteMemo: 読書中・読了の本にメモを書く（振り返り › メモの「メモを書く」と同じシート）。
  //   onQuickstart: メモできる本がまだ無いとき（読んだ本の一文をメモする＝初日クイックスタート）。
  onWriteMemo = null,
  // onWriteBookMemo(book): その本でメモを書くシート（知識の地図のメモの無い本）
  onWriteBookMemo = null,
  // onConsultBooks(question, bookIds): 知識の地図の「この 2 冊に相談する」（下書きを入れて相談を開く・送らない）
  onConsultBooks = null,
  onQuickstart = null,
}) {
  const { user } = useAuth();

  // メモ統計（自己完結 fetch）。null = 取得中/未取得。
  // ⚡ 前に開いたときの数で先に描き、裏で数え直す（記録を開くたびに骨組みで待たせない・2026-11-20）。
  const [memoStats, setMemoStats] = useState(() => (user?.id && recordStatsCache.userId === user.id ? recordStatsCache.stats : null));
  // ⏱ 読書の時間（集中モード・2026-10-10）。数える「いま」は開いたときに 1 回だけ決める（&today= の差し替えも効く）。
  const sessions = useReadingSessions();
  const [nowMs] = useState(() => appNow().getTime());
  const showReadingTime = useMemo(() => hasReadingTime(sessions.rows, books), [sessions.rows, books]);

  useEffect(() => {
    track(EVENTS.RECORD_OPENED);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) { setMemoStats({ total: 0, createdDates: [], recalled: 0, mastered: 0, byBook: {}, recallSupported: false }); return; }
    let active = true;
    (async () => {
      // lean な列だけをページングで取得。recall 列が無い DB（マイグレーション未適用）
      // では基本列だけで再取得し、定着セクションは隠す。
      const PAGE = 1000;
      const fetchPages = async (cols) => {
        let rows = [];
        for (let page = 0; page < 10; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const { data, error } = await supabase
            .from('book_memos')
            .select(cols)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(page * PAGE, page * PAGE + PAGE - 1);
          if (error) return { rows: null, error };
          rows = rows.concat(data || []);
          if (!data || data.length < PAGE) break;
        }
        return { rows, error: null };
      };
      let recallSupported = true;
      let { rows, error } = await fetchPages('id, created_at, book_id, tags, recall_count, last_recalled_at');
      if (!rows) {
        // schema エラー（recall 列未適用）のときだけ「定着セクション非対応」として
        // 基本列で再取得。ネットワーク等の一時エラーを schema 未適用と混同しない。
        if (isSchemaError(error)) {
          recallSupported = false;
          ({ rows, error } = await fetchPages('id, created_at, book_id, tags'));
        }
      }
      if (!active) return;
      if (!rows) {
        // 取得失敗（通信断など）。0 件と偽装すると「メモが消えた」ように見えるため、
        // failed を立ててメモ由来のセクションは出さず、控えめな注記だけ出す。
        // 前に数えた結果で描けているなら、それを残す（読み直しの失敗で記録を消さない）。
        setMemoStats((cur) => (cur && !cur.failed ? cur : { total: 0, createdDates: [], recalled: 0, mastered: 0, byBook: {}, recallSupported: false, failed: true }));
        return;
      }
      let recalled = 0;
      let mastered = 0;
      const createdDates = [];
      const byBook = {};
      // 思い出しカードの記録のうち DB に書けなかった分（端末に残したもの・lib/recallLocal.js）も数える。
      const localRecall = loadRecallLocal();
      for (const r of rows) {
        if (r.created_at) createdDates.push(r.created_at);
        const rec = applyLocalRecall({ lastRecalledAt: r.last_recalled_at ?? null, recallCount: r.recall_count || 0 }, localRecall[r.id]);
        if (rec.lastRecalledAt) recalled += 1;
        if ((rec.recallCount || 0) > 0) mastered += 1;
        if (r.book_id) byBook[r.book_id] = (byBook[r.book_id] || 0) + 1;
      }
      const stats = { total: rows.length, createdDates, recalled, mastered, byBook, recallSupported };
      recordStatsCache = { userId: user.id, stats };
      setMemoStats(stats);
    })();
    return () => { active = false; };
  }, [user?.id]);

  const bookStats = useMemo(() => buildBookStats(books), [books]);
  const doneBuckets = useMemo(() => bucketize(bookStats.doneDates), [bookStats.doneDates]);
  // 足あと = メモ + 読了 + 集中モードで読んだ日（読書に触れた日すべて・読んだ日は 2026-10-10 に足した＝始めた日・30 秒未満の回は数えない）。
  const footprints = useMemo(
    () => [
      ...(memoStats?.createdDates || []),
      ...bookStats.doneDates,
      ...(sessions.rows || []).filter((r) => r && r.started_at && (Number(r.seconds) || 0) >= 30).map((r) => r.started_at),
    ],
    [memoStats, bookStats.doneDates, sessions.rows],
  );
  // 「メモ」＝カード式＋学び（book_memos の全件）＋「この本のまとめ」の入っている本（1 冊 1 件）。
  const summaryMemos = useMemo(() => countSummaryMemos(books), [books]);
  const memoTotal = (memoStats?.total || 0) + summaryMemos;
  // 年ごとの読了とメモ（新しい年から・記録のある年だけ）。
  const yearRows = useMemo(() => {
    const m = new Map();
    const add = (y, k) => { if (!y) return; const r = m.get(y) || { year: y, done: 0, memos: 0 }; r[k] += 1; m.set(y, r); };
    (bookStats.doneDates || []).forEach((d) => add(Number(String(d).slice(0, 4)) || null, 'done'));
    (memoStats?.failed ? [] : (memoStats?.createdDates || [])).forEach((d) => { const t = new Date(d); add(Number.isFinite(t.getTime()) ? t.getFullYear() : null, 'memos'); });
    return [...m.values()].sort((a, b) => b.year - a.year);
  }, [bookStats.doneDates, memoStats]);
  const hasAnything = (books?.length || 0) > 0 || memoTotal > 0;
  // メモを書ける本（読書中・読了）があるか（振り返り › メモの空の案内と同じ分け方）。
  const memoable = (books || []).some((b) => b.status === 'reading' || b.status === 'done');
  // 🏷 分野（2026-10-11）: 本の分野ごとの本・メモ。メモを読めなかったときはメモの数を 0 と偽装しない（数えない）。
  //   分野ごとの読書の時間は「読書の時間」カードの「分野ごと」に一本化した（同じ数を 2 か所に出さない・2026-10-11 オーナー裁定）。
  //   読了・積読・読書中ごとにも作る（題の下の切り替え・2026-11-26 オーナー「読了、積読・読書中で分けて見れるようにしたい」）。
  const fieldRecords = useMemo(() => {
    const opts = { memoCountByBook: memoStats?.failed ? {} : (memoStats?.byBook || {}) };
    const list = books || [];
    return {
      all: buildFieldRecord(list, opts),
      done: buildFieldRecord(list.filter((b) => b.status === 'done'), opts),
      active: buildFieldRecord(list.filter((b) => !b.archivedAt && (b.status === 'before' || b.status === 'reading')), opts), // アーカイブした本は外す（2026-11-26）
    };
  }, [books, memoStats]);
  const fieldRecord = fieldRecords.all;

  // メモ集計がまだ返っていない間は「記録は、これから」を出さない — 本0冊で
  // メモだけあるユーザーに空状態が一瞬チラついてから統計に切り替わるのを防ぐ。
  // メモ集計が返るまでは 3 区画の形だけ出す（DESIGN §5: Skeleton。「残したメモ 0」が一瞬出るのも防ぐ）。
  // 読書の時間の読み込みも待つ（あとから区画が差し込まれて、下の足あとを押し下げない）。
  if (memoStats === null || !sessions.loaded) {
    return (
      <div style={wrap} aria-busy="true" aria-label="記録を読み込み中">
        <SkeletonBlock height={120} radius="var(--radius)" />
        <SkeletonBlock height={200} radius="var(--radius)" />
        <SkeletonBlock height={120} radius="var(--radius)" />
      </div>
    );
  }

  if (!hasAnything) {
    return (
      <div style={wrap}>
        <EmptyState
          icon={<BarChart3 size={34} aria-hidden="true" />}
          title={<>{/* 句の途中で折り返さない */}<span style={{ display: 'inline-block' }}>本を読み、メモを残すと、</span><span style={{ display: 'inline-block' }}>ここに積み上がります</span></>}
          actions={onGoToShelf ? [{ label: 'すべての本へ', icon: <BookOpen size={18} aria-hidden="true" />, onClick: onGoToShelf, variant: 'secondary' }] : []}
        />
      </div>
    );
  }

  // 記録は 3 区画だけ（2026-09-26 オーナー判断・SPEC §0「情報が多くて目が迷う」）:
  //   1. 読書 → メモ → 行動（積み重ね＝相談の質・行動の柱。各数字からその一覧へ）
  //   2. 読書の足あと（ヒートマップ）
  //   3. 月別の読了
  // 旧: 統計タイル／今年のハイライト／一番学んだ本／記憶への定着／読書リズム／テーマ／著者 は撤去。
  return (
    <div style={wrap}>
      <section style={card}>
        <h3 style={cardTitle}>読書・メモ・行動</h3>
        <FlowRow
          cells={[
            { value: bookStats.doneTotal, label: '読んだ本', color: 'var(--text)', onClick: onShowBooks && bookStats.doneTotal > 0 ? () => onShowBooks('done') : undefined },
            // メモ統計の取得に失敗した時は 0 と偽装しない（「メモが消えた」ように見えるため）。
            // 「メモ」＝自分のメモ（カード式＋学び＋この本のまとめ）。ホーム・相談・初日クイックスタートの「メモ N 件」と同じ数・同じ言葉（2026-09-29）。
            //   0 件でも押せる（振り返り › メモの空の案内に「メモを書く」がある＝行き止まりにしない・2026-11-23）。
            { value: memoStats?.failed ? '—' : memoTotal, label: 'メモ', color: 'var(--text)', onClick: onShowMemos && !memoStats?.failed ? onShowMemos : undefined },
            { value: bookStats.actionsDone, label: '実行した行動', color: 'var(--text)', onClick: onShowActions && bookStats.actionsDone > 0 ? onShowActions : undefined },
          ]}
        />
        {memoStats?.failed && (
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 'var(--space-3) 0 0', lineHeight: 1.5 }}>
            メモの数を読み込めませんでした。通信状況を確認して、開き直してください。
          </p>
        )}
        {/* メモが 0 件なら、ここから書ける（積み重ね＝相談の質の最初の 1 件・2026-11-23）。 */}
        {!memoStats?.failed && memoTotal === 0 && (memoable ? onWriteMemo : onQuickstart) && (
          <button type="button" onClick={memoable ? onWriteMemo : onQuickstart} style={{ ...btnLink, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-3))' }}>
            {memoable ? 'メモを書く' : '読んだ本の一文をメモする'}
          </button>
        )}
      </section>

      {/* 🎯 やってみたこと（2026-10-21・完了した行動があるときだけ）: 行動 → ふりかえり → 本。押すとその本。 */}
      <TriedCard books={books} onOpenBook={onOpenBook} onShowActions={onShowActions} onConsult={onConsultAction} />

      {/* ⏱ 読書の時間（2026-10-10・記録が 1 回も無ければ出さない＝データの無い区画は出さない）。 */}
      {showReadingTime && (
        <ReadingTimeCard rows={sessions.rows} books={books} onOpenBook={onOpenBook} now={nowMs} />
      )}

      {/* データが無い区画は出さない（SPEC §5-5・2026-10-04: 読了が直近 6 か月に 1 冊も無いのに 0 の棒だけの区画が出ていた）。 */}
      {footprints.length > 0 && (
      <section style={card} data-record-foot="">
        <Heatmap dateStrings={footprints} weeks={16} title="読書の足あと" />
      </section>
      )}

      {doneBuckets.some((b) => b.count > 0) && (
      <section style={card}>
        {/* 直近 6 か月だけなので、見出しで範囲を言う（それより前の読了は数に入らない・2026-09-29）。 */}
        {/* 見出しは「月別の読了」だけ、範囲は下の小さな 1 行に（文字を大きくすると「（直近」が割れていた・2026-10-10 ui-critic）。 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 'var(--space-3)' }}>
          <h3 style={cardTitle}>月別の読了</h3>
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{`直近 6\u00a0か月で ${doneBuckets.reduce((n, b) => n + b.count, 0)}\u00a0冊`}</span>
        </div>
        <MonthBars buckets={doneBuckets} activeColor="var(--accent)" />
      </section>
      )}

      {/* 📅 年ごとの記録（2026-11-17・使い続けたときの確認＝去年と比べる手段が無かった）。2 年以上の記録があるときだけ。
          読了とメモの数を並べるだけ（%・順位・増減の矢印は出さない）。 */}
      {yearRows.length >= 2 && (
      <section style={card}>
        <h3 style={cardTitle}>年ごとの記録</h3>
        <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}>
          {yearRows.map((r, i) => (
            <li key={r.year} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderTop: i ? '1px solid var(--separator)' : 'none' }}>
              <span style={{ fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{`${r.year} 年`}</span>
              <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{`読了 ${r.done.toLocaleString()} 冊 · メモ ${r.memos.toLocaleString()} 件`}</span>
            </li>
          ))}
        </ul>
      </section>
      )}

      {/* 🗺 知識の地図（2026-11-26・読書中・読了の本があればいつも・つながりが無くても分野の星座・components/KnowledgeMapCard.jsx）。 */}
      <KnowledgeMapCard books={books} onWriteMemo={onWriteBookMemo} onOpenBook={onOpenBook} onConsultBooks={onConsultBooks} likely={(books || []).some((b) => !b.archivedAt && (b.status === 'reading' || b.status === 'done'))} />

      {/* 🏷 分野（分野の付いた本があるときだけ・押すと、すべての本をその分野で絞る）。 */}
      {fieldRecord.any && (
        <BookFieldsRecord record={fieldRecord} records={fieldRecords} onOpenField={onFilterTag} onFindBooks={onFindBooksForTag} />
      )}
    </div>
  );

}
