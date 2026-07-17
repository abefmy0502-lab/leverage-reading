// 📊 ReadingRecord — 振り返り「記録」サブタブ。
//
// 読書のあゆみを 5 つの視点で静かに可視化する（反ゲーミフィケーション厳守:
// バッジ / 連続日数 / 目標 / チャレンジは一切やらない。積み重ねをそのまま映すだけ）。
//   1. コアの数字   : 読了した本・残したメモ・実行した行動（累計）
//   2. 月別のあゆみ : 直近 6 ヶ月の 読了 ⇄ メモ をワンタップで切替できるバー
//   3. 読書 → 行動 → 収穫 : 「読みっぱなしをやめる」が実際に起きているかのつながり
//   4. 記憶への定着 : メモ → 想起した → 覚えた（間隔反復の進捗＝このアプリ固有の指標）
//   5. よく読むテーマ : 本のタグ Top6（自分の関心の地図）
//
// データ:
//   - 本由来（読了/行動/収穫/タグ）は props.books から純粋に集計。
//   - メモ由来（件数/月別/想起/定着）は自己完結 fetch（HomeRecall と同流儀）。
//     lean な列だけ・range ページング・schema-error fallback（recall 列が無い DB
//     では定着セクションを静かに隠す）で、未適用環境でも壊れない。

import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import AnimatedNumber from './AnimatedNumber';
import EmptyState from './EmptyState';
import { track, EVENTS } from '../lib/analytics';
import {
  BarChart3, BookOpenCheck, StickyNote, Target, TrendingUp, Brain, Tags,
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

function buildBookStats(books) {
  let doneTotal = 0;
  let actionsDone = 0;
  let harvest = 0;
  const doneDates = [];
  const tagCounts = new Map();
  for (const b of Array.isArray(books) ? books : []) {
    if (!b) continue;
    if (b.status === 'done') {
      doneTotal += 1;
      if (b.doneDate) doneDates.push(b.doneDate);
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
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, 6);
  return { doneTotal, actionsDone, harvest, doneDates, topTags };
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

function StatTile({ icon: Icon, value, label }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 6px' }}>
      <Icon size={16} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
      <AnimatedNumber
        value={value}
        duration={700}
        style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: 'var(--c-ink)', fontVariantNumeric: 'tabular-nums' }}
      />
      <span style={{ fontSize: 10, color: 'var(--c-ink-2)', lineHeight: 1.3, textAlign: 'center' }}>{label}</span>
    </div>
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

/* ---------- 本体 ---------- */

export default function ReadingRecord({ books }) {
  const { user } = useAuth();

  // メモ統計（自己完結 fetch）。null = 取得中/未取得。
  const [memoStats, setMemoStats] = useState(null);

  useEffect(() => {
    track(EVENTS.RECORD_OPENED);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) { setMemoStats({ total: 0, createdDates: [], recalled: 0, mastered: 0, recallSupported: false }); return; }
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
      let { rows } = await fetchPages('id, created_at, recall_count, last_recalled_at');
      if (!rows) {
        recallSupported = false;
        ({ rows } = await fetchPages('id, created_at'));
      }
      if (!active) return;
      if (!rows) { setMemoStats({ total: 0, createdDates: [], recalled: 0, mastered: 0, recallSupported: false }); return; }
      let recalled = 0;
      let mastered = 0;
      const createdDates = [];
      for (const r of rows) {
        if (r.created_at) createdDates.push(r.created_at);
        if (r.last_recalled_at) recalled += 1;
        if ((r.recall_count || 0) > 0) mastered += 1;
      }
      setMemoStats({ total: rows.length, createdDates, recalled, mastered, recallSupported });
    })();
    return () => { active = false; };
  }, [user?.id]);

  const bookStats = useMemo(() => buildBookStats(books), [books]);
  const doneBuckets = useMemo(() => bucketize(bookStats.doneDates), [bookStats.doneDates]);
  const memoBuckets = useMemo(() => bucketize(memoStats?.createdDates || []), [memoStats]);

  // 月別のあゆみ: 読了 ⇄ メモ 切替。
  const [trendMode, setTrendMode] = useState('done');

  const memoTotal = memoStats?.total || 0;
  const hasAnything = (books?.length || 0) > 0 || memoTotal > 0;

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
          minHeight: 32, padding: '5px 14px', borderRadius: 999,
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

  return (
    <div style={wrap}>
      {/* 1. コアの数字 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <StatTile icon={BookOpenCheck} value={bookStats.doneTotal} label="読了した本" />
        <StatTile icon={StickyNote} value={memoTotal} label="残したメモ" />
        <StatTile icon={Target} value={bookStats.actionsDone} label="実行した行動" />
      </div>

      {/* 2. 月別のあゆみ（読了 ⇄ メモ） */}
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

      {/* 3. 読書 → 行動 → 収穫 */}
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
          <p style={{ fontSize: 11, color: '#9a8c74', margin: '10px 0 0', lineHeight: 1.5, textAlign: 'center' }}>
            メモの「行動にする」から、最初の行動を 1 つ決めてみましょう。
          </p>
        )}
      </section>

      {/* 4. 記憶への定着（間隔反復の進捗） */}
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

      {/* 5. よく読むテーマ（タグ Top6） */}
      {bookStats.topTags.length > 0 && (
        <section style={card}>
          <h3 style={cardTitle}>
            <Tags size={14} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
            よく読むテーマ
          </h3>
          <p style={cardSub}>本につけたタグから見た、あなたの関心の地図です。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {bookStats.topTags.map(([tag, n]) => (
              <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--c-ink)', width: 88, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--c-soft)', overflow: 'hidden' }}>
                  <div style={{ width: `${maxTag > 0 ? Math.max(8, Math.round((n / maxTag) * 100)) : 0}%`, height: '100%', borderRadius: 999, background: 'var(--c-brand)', transition: 'width var(--duration-base, 0.3s) var(--ease-out, ease)' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--c-ink-2)', width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{n} 冊</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
