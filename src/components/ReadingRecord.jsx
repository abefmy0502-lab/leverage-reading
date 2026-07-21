// 📊 ReadingRecord — 振り返り「記録」サブタブ。
//
// 読書のあゆみを多面的に、しかし静かに可視化する（反ゲーミフィケーション厳守:
// バッジ / 連続日数カウンタ / 目標 / チャレンジは一切やらない。積み重ねと傾向を
// そのまま映すだけ。ヒートマップも「足あと」であって streak ではない）。
//
//   1. コアの数字     : 読了した本・残したメモ・実行した行動（累計）
//   2. 読書の足あと   : 直近16週のアクティビティ・ヒートマップ（メモ+読了）
//   3. 月別のあゆみ   : 直近 6 ヶ月の 読了 ⇄ メモ をワンタップで切替できるバー
//   4. 今年のハイライト: 今年の読了（前年同期比）・メモ・推定ページ・1冊平均日数・星付きベスト
//   5. 一番学んだ本   : メモ数/冊 Top3（どの本から一番学んだか＝このアプリ固有）
//   6. 読書 → 行動 → 収穫 : 「読みっぱなしをやめる」が実際に起きているか
//   7. 記憶への定着   : メモ → 想起した → 覚えた（間隔反復の進捗）
//   8. あなたの読書リズム : メモを書いた時間帯（朝/昼/夜/深夜）＋やさしい一言
//   9. よく読むテーマ / 10. よく読む著者 : 関心の地図
//
// データ:
//   - 本由来（読了/行動/収穫/タグ/著者/評価/ページ）は props.books から純粋に集計。
//   - メモ由来（件数/日別/月別/時間帯/想起/定着/本ごと）は自己完結 fetch
//     （HomeRecall と同流儀）。lean な列だけ・range ページング・schema-error
//     fallback（recall 列が無い DB では定着セクションを静かに隠す）。

import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isSchemaError } from '../lib/errors';
import { useAuth } from '../hooks/useAuth';
import AnimatedNumber from './AnimatedNumber';
import EmptyState from './EmptyState';
import { track, EVENTS } from '../lib/analytics';
import {
  BarChart3, BookOpenCheck, StickyNote, Target, TrendingUp, Brain, Tags,
  CalendarDays, Footprints, Clock3, PenLine, BookMarked, ChevronRight,
} from 'lucide-react';

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
  padding: '12px 16px calc(90px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  fontFamily: 'var(--font-app)',
  maxWidth: 560,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
};

const card = {
  background: 'var(--c-card)',
  border: '1px solid var(--c-hairline)',
  borderRadius: 'var(--radius-md)',
  padding: 14,
};

const cardTitle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--c-ink)',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const cardSub = {
  fontSize: 11,
  color: 'var(--c-ink-3)',
  margin: '2px 0 0',
  lineHeight: 1.5,
};

const BAR_MAX_H = 52;
const BAR_MIN_H = 3;

/* ---------- 小さな表示部品 ---------- */

// onClick を渡すとタイル全体がボタンになり、その一覧へ移動できる
// （読了した本→本棚の読了絞り込み / メモ→ノート / 行動→行動タブ）。
// 「数字を見る→中身を確かめる」の自然な動線を 1 タップで閉じる。
function StatTile({ icon: Icon, value, label, onClick }) {
  const inner = (
    <>
      <Icon size={16} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
      <AnimatedNumber
        value={value}
        duration={700}
        style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: 'var(--c-ink)', fontVariantNumeric: 'tabular-nums' }}
      />
      <span style={{ fontSize: 10, color: 'var(--c-ink-2)', lineHeight: 1.3, textAlign: 'center', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        {label}
        {onClick && <ChevronRight size={11} aria-hidden="true" style={{ color: 'var(--c-ink-3)', flexShrink: 0 }} />}
      </span>
    </>
  );
  const base = { ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 6px' };
  if (!onClick) return <div style={base}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}の一覧を見る`}
      style={{ ...base, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}
    >
      {inner}
    </button>
  );
}

// N → M → K の「つながり」表示（読書→行動→収穫 / メモ→想起→覚えた の共通形）。
function FlowRow({ cells }) {
  const arrow = (
    <span aria-hidden="true" style={{ color: '#c3b9a4', fontWeight: 700, fontSize: 13, flexShrink: 0, paddingTop: 4 }}>→</span>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginTop: 12 }}>
      {cells.map((c, i) => (
        <FragmentLike key={c.label} first={i === 0} arrow={arrow}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
            <span style={{ fontSize: 10, color: 'var(--c-ink-2)', textAlign: 'center', lineHeight: 1.3 }}>{c.label}</span>
          </div>
        </FragmentLike>
      ))}
    </div>
  );
}

// map 内で「先頭以外は矢印を前置」するための小さなヘルパ。
function FragmentLike({ first, arrow, children }) {
  return first ? children : (<>{arrow}{children}</>);
}

// 月別バー（読了 or メモ）。
function MonthBars({ buckets, activeColor }) {
  const peak = buckets.reduce((m, k) => Math.max(m, k.count), 0);
  const lastIdx = buckets.length - 1;
  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-end', gap: 6, justifyContent: 'space-between', marginTop: 10 }}
      aria-label={`月別の推移: ${buckets.map((k) => `${k.month + 1}月 ${k.count}件`).join(', ')}`}
    >
      {buckets.map((k, i) => {
        const h = peak > 0 ? Math.max(BAR_MIN_H, Math.round((k.count / peak) * BAR_MAX_H)) : BAR_MIN_H;
        const active = k.count > 0;
        const isCurrent = i === lastIdx;
        return (
          <div key={`${k.year}-${k.month}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }} aria-hidden="true">
            <span style={{ fontSize: 10, color: 'var(--c-ink-2)', lineHeight: 1, minHeight: 11, fontVariantNumeric: 'tabular-nums' }}>
              {active ? k.count : ''}
            </span>
            <div style={{ width: '100%', maxWidth: 22, height: BAR_MAX_H, display: 'flex', alignItems: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: h,
                  borderRadius: 'var(--radius-xs)',
                  background: active ? activeColor : 'var(--c-hairline-strong)',
                  transition: 'height var(--duration-base, 0.3s) var(--ease-out, ease)',
                }}
              />
            </div>
            <span style={{ fontSize: 10, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? 'var(--c-ink)' : 'var(--c-ink-3)' }}>
              {k.month + 1}月
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 🟫 読書の足あと（GitHub 風ヒートマップ・日曜はじまり・直近 weeks 週）。
// streak カウンタは出さない — 色づいた日々をただ眺める「足あと」。
const HEAT_COLORS = ['var(--c-soft)', '#dccfb2', '#b5a17e', 'var(--c-brand)'];
function heatColor(n) {
  if (n <= 0) return HEAT_COLORS[0];
  if (n === 1) return HEAT_COLORS[1];
  if (n <= 3) return HEAT_COLORS[2];
  return HEAT_COLORS[3];
}

function Heatmap({ dateStrings, weeks = 16 }) {
  const { cols, activeDays } = useMemo(() => {
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
    currentWeekStart.setDate(today.getDate() - today.getDay()); // 日曜はじまり
    const out = [];
    let prevMonth = -1;
    for (let w = weeks - 1; w >= 0; w -= 1) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() - w * 7);
      const days = [];
      for (let dow = 0; dow < 7; dow += 1) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + dow);
        days.push(d > today ? null : { key: dayKey(d), count: counts.get(dayKey(d)) || 0 });
      }
      const m = weekStart.getMonth();
      out.push({ days, monthLabel: m !== prevMonth ? `${m + 1}月` : '' });
      prevMonth = m;
    }
    // 「活動があった日数」は表示ウィンドウ内（直近 weeks 週）だけを数える。
    // counts 全体を数えると全履歴の日数になり、aria-label が見た目と食い違う。
    let act = 0;
    for (const col of out) {
      for (const d of col.days) { if (d && d.count > 0) act += 1; }
    }
    return { cols: out, activeDays: act };
  }, [dateStrings, weeks]);

  const CELL = 11;
  const GAP = 3;
  return (
    <div aria-label={`直近${weeks}週間の活動。読書の記録があった日は ${activeDays} 日`}>
      <div style={{ display: 'flex', gap: GAP, marginTop: 10, justifyContent: 'center' }} aria-hidden="true">
        {/* 曜日ラベル列 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, paddingTop: 13 }}>
          {['', '月', '', '水', '', '金', ''].map((l, i) => (
            <span key={i} style={{ height: CELL, fontSize: 8, lineHeight: `${CELL}px`, color: 'var(--c-ink-3)', width: 14, textAlign: 'right', paddingRight: 2 }}>{l}</span>
          ))}
        </div>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
            <span style={{ height: 10, fontSize: 8, lineHeight: '10px', color: 'var(--c-ink-3)', whiteSpace: 'nowrap' }}>{col.monthLabel}</span>
            {col.days.map((d, di) => (
              <span
                key={di}
                style={{
                  width: CELL, height: CELL, borderRadius: 3,
                  background: d ? heatColor(d.count) : 'transparent',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8 }} aria-hidden="true">
        <span style={{ fontSize: 9, color: 'var(--c-ink-3)' }}>少</span>
        {HEAT_COLORS.map((c) => (
          <span key={c} style={{ width: 9, height: 9, borderRadius: 2, background: c }} />
        ))}
        <span style={{ fontSize: 9, color: 'var(--c-ink-3)' }}>多</span>
      </div>
    </div>
  );
}

// 横バー行（テーマ / 著者 / 一番学んだ本 で共通の見た目）。
// onClick を渡すと行全体がボタンになり、末尾に › が付く（本を開く / 絞り込みへ）。
function BarRow({ label, count, max, unit, labelWidth = 88, onClick, ariaLabel }) {
  const inner = (
    <>
      <span style={{ fontSize: 11, color: 'var(--c-ink)', width: labelWidth, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--c-soft)', overflow: 'hidden' }}>
        <div style={{ width: `${max > 0 ? Math.max(8, Math.round((count / max) * 100)) : 0}%`, height: '100%', borderRadius: 999, background: 'var(--c-brand)', transition: 'width var(--duration-base, 0.3s) var(--ease-out, ease)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--c-ink-2)', width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{count} {unit}</span>
    </>
  );
  if (!onClick) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || `${label}を開く`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44,
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      {inner}
      <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--c-ink-3)', flexShrink: 0, marginLeft: -2 }} />
    </button>
  );
}

// 🕰 読書リズム（メモを書いた時間帯）。やさしい一言つき — 判定ではなく発見。
const RHYTHMS = [
  { key: 'morning', label: '朝', range: '5-11時', from: 5, to: 10, persona: '朝、気づきが生まれるタイプのようです。' },
  { key: 'day', label: '昼', range: '11-17時', from: 11, to: 16, persona: '昼の時間に、本と向き合うタイプのようです。' },
  { key: 'evening', label: '夜', range: '17-23時', from: 17, to: 22, persona: '一日の終わりに、気づきをまとめるタイプのようです。' },
  { key: 'night', label: '深夜', range: '23-5時', from: 23, to: 4, persona: '深夜にひらめきが訪れるタイプのようです。' },
];
function buildRhythm(createdDates) {
  const counts = { morning: 0, day: 0, evening: 0, night: 0 };
  for (const s of createdDates) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) continue;
    const h = d.getHours();
    if (h >= 5 && h <= 10) counts.morning += 1;
    else if (h >= 11 && h <= 16) counts.day += 1;
    else if (h >= 17 && h <= 22) counts.evening += 1;
    else counts.night += 1;
  }
  let top = null;
  for (const r of RHYTHMS) {
    if (!top || counts[r.key] > counts[top.key]) top = r;
  }
  return { counts, top };
}

/* ---------- 本体 ---------- */

// ナビゲーション props（すべて任意 — 渡された時だけ該当要素がタップ可能になる）:
//   onShowBooks(status) … 本棚をそのステータスで絞り込んで開く（読了タイル）
//   onShowMemos()       … 振り返り「ノート」サブタブへ（メモタイル）
//   onShowActions()     … 振り返り「行動」サブタブへ（行動タイル）
//   onOpenBook(book)    … 本詳細を開く（一番学んだ本 / 今年の星付き）
//   onFilterTag(tag)    … 本棚をそのタグで絞り込んで開く（よく読むテーマ）
//   onSearchAuthor(a)   … 本棚をその著者名で検索して開く（よく読む著者）
export default function ReadingRecord({
  books,
  onShowBooks,
  onShowMemos,
  onShowActions,
  onOpenBook,
  onFilterTag,
  onSearchAuthor,
}) {
  const { user } = useAuth();
  // 行タップ → 本詳細（一番学んだ本 / 星付き）用のルックアップ。
  const bookById = useMemo(
    () => new Map((Array.isArray(books) ? books : []).map((b) => [b.id, b])),
    [books],
  );

  // メモ統計（自己完結 fetch）。null = 取得中/未取得。
  const [memoStats, setMemoStats] = useState(null);

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
      let { rows, error } = await fetchPages('id, created_at, book_id, recall_count, last_recalled_at');
      if (!rows) {
        // schema エラー（recall 列未適用）のときだけ「定着セクション非対応」として
        // 基本列で再取得。ネットワーク等の一時エラーを schema 未適用と混同しない。
        if (isSchemaError(error)) {
          recallSupported = false;
          ({ rows, error } = await fetchPages('id, created_at, book_id'));
        }
      }
      if (!active) return;
      if (!rows) {
        // 取得失敗（通信断など）。0 件と偽装すると「メモが消えた」ように見えるため、
        // failed を立ててメモ由来のセクションは出さず、控えめな注記だけ出す。
        setMemoStats({ total: 0, createdDates: [], recalled: 0, mastered: 0, byBook: {}, recallSupported: false, failed: true });
        return;
      }
      let recalled = 0;
      let mastered = 0;
      const createdDates = [];
      const byBook = {};
      for (const r of rows) {
        if (r.created_at) createdDates.push(r.created_at);
        if (r.last_recalled_at) recalled += 1;
        if ((r.recall_count || 0) > 0) mastered += 1;
        if (r.book_id) byBook[r.book_id] = (byBook[r.book_id] || 0) + 1;
      }
      setMemoStats({ total: rows.length, createdDates, recalled, mastered, byBook, recallSupported });
    })();
    return () => { active = false; };
  }, [user?.id]);

  const bookStats = useMemo(() => buildBookStats(books), [books]);
  const doneBuckets = useMemo(() => bucketize(bookStats.doneDates), [bookStats.doneDates]);
  const memoBuckets = useMemo(() => bucketize(memoStats?.createdDates || []), [memoStats]);
  // 足あと = メモ + 読了（読書に触れた日すべて）。
  const footprints = useMemo(
    () => [...(memoStats?.createdDates || []), ...bookStats.doneDates],
    [memoStats, bookStats.doneDates],
  );
  const rhythm = useMemo(() => buildRhythm(memoStats?.createdDates || []), [memoStats]);
  // 一番学んだ本 Top3（メモ数/冊）。
  const topMemoBooks = useMemo(() => {
    const byBook = memoStats?.byBook || {};
    const byId = new Map((Array.isArray(books) ? books : []).map((b) => [b.id, b]));
    return Object.entries(byBook)
      .map(([id, n]) => ({ id, title: byId.get(id)?.title || '', count: n }))
      .filter((x) => x.title)
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ja'))
      .slice(0, 3);
  }, [memoStats, books]);
  // 今年のメモ件数（ハイライト用）。
  const memosThisYear = useMemo(() => {
    const y = new Date().getFullYear();
    let n = 0;
    for (const s of memoStats?.createdDates || []) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === y) n += 1;
    }
    return n;
  }, [memoStats]);

  // 月別のあゆみ: 読了 ⇄ メモ 切替。
  const [trendMode, setTrendMode] = useState('done');

  const memoTotal = memoStats?.total || 0;
  const hasAnything = (books?.length || 0) > 0 || memoTotal > 0;

  // メモ集計がまだ返っていない間は「記録は、これから」を出さない — 本0冊で
  // メモだけあるユーザーに空状態が一瞬チラついてから統計に切り替わるのを防ぐ。
  if (!hasAnything && memoStats === null) {
    return <div style={wrap} aria-busy="true" />;
  }

  if (!hasAnything) {
    return (
      <div style={wrap}>
        <EmptyState
          icon={<BarChart3 size={34} aria-hidden="true" />}
          title="記録は、これから"
          description={(
            <>
              本を読み、一行メモを残すと、<br />
              ここにあなたのあゆみが静かに積み上がります。
            </>
          )}
        />
      </div>
    );
  }

  const noOutcome = bookStats.actionsDone === 0 && bookStats.harvest === 0;
  const trendChip = (mode, label) => {
    const active = trendMode === mode;
    return (
      <button
        type="button"
        onClick={() => setTrendMode(mode)}
        aria-pressed={active}
        style={{
          minHeight: 44, padding: '7px 14px', borderRadius: 999,
          border: active ? '1px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
          background: active ? 'var(--c-brand)' : 'transparent',
          color: active ? 'var(--c-brand-ink)' : 'var(--c-ink-2)',
          fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  };

  const maxTag = bookStats.topTags.reduce((m, [, n]) => Math.max(m, n), 0);
  const maxAuthor = bookStats.topAuthors.reduce((m, [, n]) => Math.max(m, n), 0);
  const maxMemoBook = topMemoBooks.reduce((m, x) => Math.max(m, x.count), 0);
  const rhythmMax = Math.max(...RHYTHMS.map((r) => rhythm.counts[r.key]), 0);
  const thisYear = new Date().getFullYear();
  const yearDelta = bookStats.doneThisYear - bookStats.doneLastYearSame;
  const showHighlight = bookStats.doneThisYear > 0 || memosThisYear > 0;

  // ハイライトのミニ統計（値が無いものは行ごと出さない＝空の 0 を並べない）。
  const highlightItems = [
    {
      label: `${thisYear}年の読了`,
      value: `${bookStats.doneThisYear} 冊`,
      // 前年比は「前年の実績がある人」にだけ意味がある。初年度ユーザーに
      // 「前年同期より +1 冊」（前年 0 冊との比較）を見せるのはノイズ。
      sub: bookStats.doneLastYearSame > 0
        ? (yearDelta === 0 ? '前年同期と同じペース' : `前年同期より ${yearDelta > 0 ? '+' : ''}${yearDelta} 冊`)
        : '',
      show: true,
    },
    { label: `${thisYear}年のメモ`, value: `${memosThisYear} 件`, sub: '', show: memosThisYear > 0 },
    { label: '読んだページ（概算）', value: `約 ${bookStats.pagesThisYear.toLocaleString()} ページ`, sub: 'ページ数が分かる本のみ', show: bookStats.pagesThisYear > 0 },
    { label: '1冊にかける日数', value: `平均 ${bookStats.avgDays} 日`, sub: '開始日と読了日がある本から', show: bookStats.avgDays != null },
  ].filter((x) => x.show);

  return (
    <div style={wrap}>
      {/* 1. コアの数字 — メモ統計の取得に失敗した時はメモのタイルを隠す
          （0 と偽装すると「メモが消えた」ように見えるため）。 */}
      <div style={{ display: 'grid', gridTemplateColumns: memoStats?.failed ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
        {/* 件数が 1 以上のタイルだけタップ可能にする（0 件で空の一覧へ飛ばすと
            「押したのに何もない」体験になるため）。 */}
        <StatTile
          icon={BookOpenCheck}
          value={bookStats.doneTotal}
          label="読了した本"
          onClick={onShowBooks && bookStats.doneTotal > 0 ? () => onShowBooks('done') : undefined}
        />
        {!memoStats?.failed && (
          <StatTile
            icon={StickyNote}
            value={memoTotal}
            label="残したメモ"
            onClick={onShowMemos && memoTotal > 0 ? onShowMemos : undefined}
          />
        )}
        <StatTile
          icon={Target}
          value={bookStats.actionsDone}
          label="実行した行動"
          onClick={onShowActions && bookStats.actionsDone > 0 ? onShowActions : undefined}
        />
      </div>
      {memoStats?.failed && (
        <p style={{ fontSize: 11, color: 'var(--c-ink-3)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
          メモの統計を読み込めませんでした。通信環境を確認して、開き直してください。
        </p>
      )}

      {/* 2. 読書の足あと（ヒートマップ） */}
      <section style={card}>
        <h3 style={cardTitle}>
          <Footprints size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
          読書の足あと
        </h3>
        <p style={cardSub}>メモや読了があった日が、静かに色づきます。</p>
        <Heatmap dateStrings={footprints} weeks={16} />
      </section>

      {/* 3. 月別のあゆみ（読了 ⇄ メモ） */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <h3 style={cardTitle}>
              <TrendingUp size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
              月別のあゆみ
            </h3>
            <p style={cardSub}>直近 6 ヶ月の{trendMode === 'done' ? '読了' : 'メモ'}の数</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {trendChip('done', '読了')}
            {trendChip('memo', 'メモ')}
          </div>
        </div>
        <MonthBars
          buckets={trendMode === 'done' ? doneBuckets : memoBuckets}
          activeColor="var(--c-brand)"
        />
      </section>

      {/* 4. 今年のハイライト */}
      {showHighlight && (
        <section style={card}>
          <h3 style={cardTitle}>
            <CalendarDays size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
            {thisYear}年のハイライト
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 12 }}>
            {highlightItems.map((x) => (
              <div key={x.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--c-ink-3)', lineHeight: 1.3 }}>{x.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-ink)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{x.value}</span>
                {x.sub && <span style={{ fontSize: 10, color: 'var(--c-ink-3)', lineHeight: 1.3 }}>{x.sub}</span>}
              </div>
            ))}
          </div>
          {bookStats.bestThisYear.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--c-hairline)' }}>
              <p style={{ fontSize: 10, color: 'var(--c-ink-3)', margin: '0 0 6px' }}>今年の星付き</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {bookStats.bestThisYear.map((b, i) => {
                  const book = bookById.get(b.id);
                  const clickable = !!(onOpenBook && book);
                  const row = (
                    <>
                      <span style={{ fontSize: 10, color: '#b8963f', flexShrink: 0, letterSpacing: 1 }}>{'★'.repeat(b.rating)}</span>
                      <span style={{ fontSize: 12, color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>{b.title}</span>
                      {clickable && <ChevronRight size={13} aria-hidden="true" style={{ color: 'var(--c-ink-3)', flexShrink: 0 }} />}
                    </>
                  );
                  return clickable ? (
                    <button
                      key={`${b.title}-${i}`}
                      type="button"
                      onClick={() => onOpenBook(book)}
                      aria-label={`『${b.title}』を開く`}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, minHeight: 36, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {row}
                    </button>
                  ) : (
                    <div key={`${b.title}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>{row}</div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 5. 一番学んだ本（メモ数/冊 Top3） */}
      {topMemoBooks.length > 0 && (
        <section style={card}>
          <h3 style={cardTitle}>
            <BookMarked size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
            一番学んだ本
          </h3>
          <p style={cardSub}>メモの数から見た、あなたに一番多くの気づきをくれた本です。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {topMemoBooks.map((b) => {
              const book = bookById.get(b.id);
              return (
                <BarRow
                  key={b.id}
                  label={b.title}
                  count={b.count}
                  max={maxMemoBook}
                  unit="件"
                  labelWidth={128}
                  onClick={onOpenBook && book ? () => onOpenBook(book) : undefined}
                  ariaLabel={`『${b.title}』を開く`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 6. 読書 → 行動 → 収穫 */}
      <section style={card}>
        <h3 style={cardTitle}>
          <Target size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
          読書 → 行動 → 収穫
        </h3>
        <p style={cardSub}>読んだ本が、行動の実行、そして学びの収穫へつながった数です。</p>
        <FlowRow
          cells={[
            { value: bookStats.doneTotal, label: '読んだ本', color: 'var(--c-ink-2)' },
            { value: bookStats.actionsDone, label: '実行した行動', color: bookStats.actionsDone > 0 ? 'var(--c-positive)' : 'var(--c-ink-3)' },
            { value: bookStats.harvest, label: '残した収穫', color: bookStats.harvest > 0 ? '#a06a30' : 'var(--c-ink-3)' },
          ]}
        />
        {noOutcome && bookStats.doneTotal > 0 && (
          <p style={{ fontSize: 11, color: 'var(--c-ink-3)', margin: '10px 0 0', lineHeight: 1.5, textAlign: 'center' }}>
            メモの「行動にする」から、最初の行動を 1 つ決めてみましょう。
          </p>
        )}
      </section>

      {/* 7. 記憶への定着（間隔反復の進捗） */}
      {memoStats?.recallSupported && memoTotal > 0 && (
        <section style={card}>
          <h3 style={cardTitle}>
            <Brain size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
            記憶への定着
          </h3>
          <p style={cardSub}>戻ってきたメモを想起し、「覚えた」で記憶に残っていきます。</p>
          <FlowRow
            cells={[
              { value: memoTotal, label: '残したメモ', color: 'var(--c-ink-2)' },
              { value: memoStats.recalled, label: '想起した', color: memoStats.recalled > 0 ? 'var(--c-brand)' : 'var(--c-ink-3)' },
              { value: memoStats.mastered, label: '覚えた', color: memoStats.mastered > 0 ? 'var(--c-positive)' : 'var(--c-ink-3)' },
            ]}
          />
        </section>
      )}

      {/* 8. あなたの読書リズム（メモを書いた時間帯） */}
      {memoTotal >= 5 && rhythmMax > 0 && (
        <section style={card}>
          <h3 style={cardTitle}>
            <Clock3 size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
            あなたの読書リズム
          </h3>
          <p style={cardSub}>メモを書いた時間帯から。{rhythm.top ? rhythm.top.persona : ''}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {RHYTHMS.map((r) => (
              <BarRow
                key={r.key}
                label={`${r.label}（${r.range}）`}
                count={rhythm.counts[r.key]}
                max={rhythmMax}
                unit="件"
                labelWidth={92}
              />
            ))}
          </div>
        </section>
      )}

      {/* 9. よく読むテーマ（タグ Top6） */}
      {bookStats.topTags.length > 0 && (
        <section style={card}>
          <h3 style={cardTitle}>
            <Tags size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
            よく読むテーマ
          </h3>
          <p style={cardSub}>本につけたタグから見た、あなたの関心の地図です。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {bookStats.topTags.map(([tag, n]) => (
              <BarRow
                key={tag}
                label={tag}
                count={n}
                max={maxTag}
                unit="冊"
                onClick={onFilterTag ? () => onFilterTag(tag) : undefined}
                ariaLabel={`タグ「${tag}」で本棚を絞り込む`}
              />
            ))}
          </div>
        </section>
      )}

      {/* 10. よく読む著者（2冊以上・Top5） */}
      {bookStats.topAuthors.length > 0 && (
        <section style={card}>
          <h3 style={cardTitle}>
            <PenLine size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
            よく読む著者
          </h3>
          <p style={cardSub}>2 冊以上読んでいる著者です。相性のいい書き手かもしれません。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {bookStats.topAuthors.map(([author, n]) => (
              <BarRow
                key={author}
                label={author}
                count={n}
                max={maxAuthor}
                unit="冊"
                labelWidth={110}
                onClick={onSearchAuthor ? () => onSearchAuthor(author) : undefined}
                ariaLabel={`著者「${author}」の本を本棚で見る`}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
