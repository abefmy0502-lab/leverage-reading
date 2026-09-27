// 📊 ReadingRecord — 振り返り「記録」サブタブ。
//
// 読書のあゆみを多面的に、しかし静かに可視化する（反ゲーミフィケーション厳守:
// バッジ / 連続日数カウンタ / 目標 / チャレンジは一切やらない。積み重ねと傾向を
// そのまま映すだけ。ヒートマップも「足あと」であって streak ではない）。
//
//   1. 読書 → メモ → 行動 : 読んだ本・残したメモ・実行した行動（累計。各数字からその一覧へ）
//   2. 読書の足あと   : 直近16週のアクティビティ・ヒートマップ（メモ+読了）
//   3. 月別の読了     : 直近 6 ヶ月の読了数のバー
//   （2026-09-26 オーナー判断で 3 区画に絞った。旧: ハイライト/一番学んだ本/定着/リズム/テーマ/著者）
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
import EmptyState from './EmptyState';
import { SkeletonBlock } from './Skeleton';
import { track, EVENTS } from '../lib/analytics';
import { BarChart3, ChevronRight } from 'lucide-react';

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
  fontFamily: 'var(--font-app)',
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
  fontSize: 'var(--text-sub)',
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

function FlowRow({ cells }) {
  const arrow = (
    <span aria-hidden="true" style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: 'var(--text-meta)', flexShrink: 0, paddingTop: 'var(--space-1)' }}>→</span>
  );
  return (
    // 3 つのラベル（「実行した行動 ›」が最長）を 1 行に収めるため、矢印との間は空けない（中身は中央寄せ）。
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 'var(--space-3)' }}>
      {cells.map((c, i) => {
        const inner = (
          <>
            <span style={{ fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
            <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.3, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', whiteSpace: 'nowrap' }}>
              {c.label}
              {c.onClick && <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
            </span>
          </>
        );
        const base = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', minWidth: 0, flex: 1 };
        return (
          <FragmentLike key={c.label} first={i === 0} arrow={arrow}>
            {c.onClick ? (
              <button
                type="button"
                onClick={c.onClick}
                aria-label={`${c.label}の一覧を見る`}
                style={{ ...base, minHeight: 44, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {inner}
              </button>
            ) : (
              <div style={base}>{inner}</div>
            )}
          </FragmentLike>
        );
      })}
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
      style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', justifyContent: 'space-between', marginTop: 'var(--space-3)' }}
      aria-label={`月別の推移: ${buckets.map((k) => `${k.month + 1}月 ${k.count}件`).join(', ')}`}
    >
      {buckets.map((k, i) => {
        const h = peak > 0 ? Math.max(BAR_MIN_H, Math.round((k.count / peak) * BAR_MAX_H)) : BAR_MIN_H;
        const active = k.count > 0;
        const isCurrent = i === lastIdx;
        return (
          <div key={`${k.year}-${k.month}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', flex: 1, minWidth: 0 }} aria-hidden="true">
            <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1, minHeight: '1em', fontVariantNumeric: 'tabular-nums' }}>
              {active ? k.count : ''}
            </span>
            <div style={{ width: '100%', maxWidth: 22, height: BAR_MAX_H, display: 'flex', alignItems: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: h,
                  borderRadius: CHART_RADIUS,
                  background: active ? activeColor : 'var(--border)',
                  transition: 'height var(--duration-base, 0.3s) var(--ease-out, ease)',
                }}
              />
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
// 記録の無い日は区切り線の色（--separator）で、いちばん薄い段（55%）と見分けやすくする。
const HEAT_COLORS = ['var(--separator)', 'color-mix(in srgb, var(--accent) 55%, var(--surface))', 'color-mix(in srgb, var(--accent) 75%, var(--surface))', 'var(--accent)'];
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
    currentWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // 月曜はじまり
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

  const CELL = 14; // マスは「形そのもの」（DESIGN §4 の例外）
  const GAP = 'var(--space-1)';
  const LABEL_H = 'var(--space-4)'; // 月ラベルの行の高さ・曜日ラベルの列幅
  return (
    <div role="img" aria-label={`直近${weeks}週間の活動。読書の記録があった日は ${activeDays} 日`}>
      {/* 左端は曜日ラベルを本文の左にそろえ、右端のマスは凡例の右端にそろえる（space-between）。 */}
      <div style={{ display: 'flex', gap: GAP, marginTop: 'var(--space-3)', justifyContent: 'space-between' }} aria-hidden="true">
        {/* 曜日ラベル列（月曜はじまり） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, paddingTop: `calc(${LABEL_H} + ${GAP})` }}>
          {['月', '', '水', '', '金', '', ''].map((l, i) => (
            <span key={i} style={{ height: CELL, fontSize: 'var(--text-meta)', lineHeight: `${CELL}px`, color: 'var(--text-3)', width: LABEL_H, textAlign: 'left' }}>{l}</span>
          ))}
        </div>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
            <span style={{ height: LABEL_H, fontSize: 'var(--text-meta)', lineHeight: LABEL_H, color: 'var(--text-3)', whiteSpace: 'nowrap', width: CELL, overflow: 'visible' }}>{col.monthLabel}</span>
            {col.days.map((d, di) => (
              <span
                key={di}
                style={{
                  width: CELL, height: CELL, borderRadius: CHART_RADIUS,
                  background: d ? heatColor(d.count) : 'transparent',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      {/* 色だけに頼らない（DESIGN §6）: 記録があった日数を文字でも。 */}
      <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>直近 {weeks} 週で記録した日 {activeDays} 日</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }} aria-hidden="true">
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>少</span>
        {HEAT_COLORS.map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: CHART_RADIUS, background: c }} />
        ))}
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>多</span>
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
  // 足あと = メモ + 読了（読書に触れた日すべて）。
  const footprints = useMemo(
    () => [...(memoStats?.createdDates || []), ...bookStats.doneDates],
    [memoStats, bookStats.doneDates],
  );
  const memoTotal = memoStats?.total || 0;
  const hasAnything = (books?.length || 0) > 0 || memoTotal > 0;

  // メモ集計がまだ返っていない間は「記録は、これから」を出さない — 本0冊で
  // メモだけあるユーザーに空状態が一瞬チラついてから統計に切り替わるのを防ぐ。
  // メモ集計が返るまでは 3 区画の形だけ出す（DESIGN §5: Skeleton。「残したメモ 0」が一瞬出るのも防ぐ）。
  if (memoStats === null) {
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
        <h3 style={cardTitle}>読書 → メモ → 行動</h3>
        <FlowRow
          cells={[
            { value: bookStats.doneTotal, label: '読んだ本', color: 'var(--text)', onClick: onShowBooks && bookStats.doneTotal > 0 ? () => onShowBooks('done') : undefined },
            // メモ統計の取得に失敗した時は 0 と偽装しない（「メモが消えた」ように見えるため）。
            { value: memoStats?.failed ? '—' : memoTotal, label: '残したメモ', color: 'var(--text)', onClick: onShowMemos && memoTotal > 0 ? onShowMemos : undefined },
            { value: bookStats.actionsDone, label: '実行した行動', color: 'var(--text)', onClick: onShowActions && bookStats.actionsDone > 0 ? onShowActions : undefined },
          ]}
        />
        {memoStats?.failed && (
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 'var(--space-3) 0 0', lineHeight: 1.5 }}>
            メモの数を読み込めませんでした。通信環境を確認して、開き直してください。
          </p>
        )}
      </section>

      <section style={card}>
        <h3 style={cardTitle}>読書の足あと</h3>
        <Heatmap dateStrings={footprints} weeks={16} />
      </section>

      <section style={card}>
        <h3 style={cardTitle}>月別の読了</h3>
        <MonthBars buckets={doneBuckets} activeColor="var(--accent)" />
      </section>
    </div>
  );

}
