// 📊 BookshelfSummary — 本棚タブ上部の月次 1 行サマリー + 静かな手応え。
//
// 表示する数:
//   - 「読了 N 冊」: 今月の done_date が今月の本のカウント
//   - 「読書中 N 冊」: status === 'reading' の現在のカウント (リアルタイム)
//   - 「読書前 N 冊」: status === 'before' の現在のカウント
//
// 月初にリセットされる感覚は「今月の done_date」を見る形で実現。アプリ
// 側で日次タイマーは持たない (純粋に props ベースで集計するだけ)。
//
// さらに控えめに「これまでの手応え」を足す (反ゲーミフィケーション厳守):
//   - 累計の読了冊数 (done の総数) を AnimatedNumber で静かにカウントアップ
//   - 直近 6 ヶ月の月別読了数を小さなバーで (数値ラベル付き)
// バッジ・連続日数・目標・チャレンジは一切やらない。あくまで自分の積み
// 重ねを静かに眺めるだけ。

import { useMemo } from 'react';
import { TrendingUp, CalendarDays } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';

function startOfThisMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

// book.doneDate は 'YYYY-MM-DD' 形式で transformBook から渡る想定。
// new Date('YYYY-MM-DD') は UTC 0 時として解釈されるため、UTC マイナス圏の
// ユーザーでは月境界がローカルで前月にずれうる。startOfThisMonth はローカル
// 基準なので、'YYYY-MM-DD' も new Date(y, m-1, d) でローカル構築して揃える。
// それ以外の形式 (タイムスタンプ等) は通常どおり Date constructor に委ねる。
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

function isThisMonth(dateLike, monthStart) {
  const d = parseLocalDate(dateLike);
  if (!d) return false;
  return d >= monthStart;
}

function buildStats(books) {
  if (!Array.isArray(books) || books.length === 0) {
    return { readingNow: 0, beforeNow: 0, doneThisMonth: 0, doneTotal: 0, actionsDone: 0, harvest: 0 };
  }
  const monthStart = startOfThisMonth();
  let readingNow = 0;
  let beforeNow = 0;
  let doneThisMonth = 0;
  let doneTotal = 0;
  // 📈 投資対効果（成果）の集計 — 本田哲学=読了数は「作業量」。本当に効いたかは
  //   「行動に変わった数」と「収穫(一番の収穫=roiSummary)の数」で測る。
  let actionsDone = 0;
  let harvest = 0;
  for (const b of books) {
    if (!b) continue;
    if (b.status === 'reading') readingNow += 1;
    else if (b.status === 'before') beforeNow += 1;
    if (b.status === 'done') {
      doneTotal += 1;
      if (isThisMonth(b.doneDate, monthStart)) doneThisMonth += 1;
    }
    if (Array.isArray(b.actions)) {
      for (const a of b.actions) { if (a && a.done) actionsDone += 1; }
    }
    if (b.roiSummary && String(b.roiSummary).trim()) harvest += 1;
  }
  return { readingNow, beforeNow, doneThisMonth, doneTotal, actionsDone, harvest };
}

// 直近 6 ヶ月の月別読了数。done_date が無い読了本は推移には含めない
// (累計には含まれる)。古い → 新しい (左 → 右) の並びで返す。
function buildTrend(books, now = new Date()) {
  const buckets = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), count: 0 });
  }
  if (!Array.isArray(books)) return buckets;
  // 一番古いバケットの月初より前は無視できるよう下限を持つ。
  const lowerBound = new Date(buckets[0].year, buckets[0].month, 1, 0, 0, 0, 0);
  for (const b of books) {
    if (!b || b.status !== 'done' || !b.doneDate) continue;
    // 'YYYY-MM-DD' はローカル構築でパース (UTC 解釈による月バケットずれ防止)。
    const d = parseLocalDate(b.doneDate);
    if (!d || d < lowerBound) continue;
    const idx = buckets.findIndex(
      (k) => k.year === d.getFullYear() && k.month === d.getMonth()
    );
    if (idx >= 0) buckets[idx].count += 1;
  }
  return buckets;
}

const wrap = {
  fontSize: 14,
  color: 'var(--color-text-secondary)',
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

// --- 静かな手応えパネル ---------------------------------------------------

const panel = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--space-4)',
  padding: 'var(--space-3) var(--space-3)',
  margin: '0 0 var(--space-2)',
  background: 'var(--color-accent-soft)',
  borderRadius: 'var(--radius-md)',
  flexWrap: 'wrap',
};

const totalBlock = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: '0 0 auto',
};

const totalNumber = {
  fontSize: 26,
  fontWeight: 700,
  lineHeight: 1.1,
  color: 'var(--color-accent-strong)',
  fontVariantNumeric: 'tabular-nums',
};

const totalLabel = {
  fontSize: 12,
  color: 'var(--color-text-tertiary)',
  lineHeight: 1.2,
};

const trendBlock = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--space-1)',
  flex: '1 1 auto',
  minWidth: 0,
  // 右寄せにして、累計ブロックと視覚的に分ける。
  justifyContent: 'flex-end',
};

const monthCol = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  flex: '0 1 auto',
  minWidth: 18,
};

const barTrackBase = {
  width: '100%',
  maxWidth: 14,
  minWidth: 8,
  borderRadius: 'var(--radius-xs)',
  display: 'flex',
  alignItems: 'flex-end',
  overflow: 'hidden',
};

const monthLabelStyle = {
  fontSize: 10,
  color: 'var(--color-text-tertiary)',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

const countLabelStyle = {
  fontSize: 10,
  color: 'var(--color-text-secondary)',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  minHeight: 11,
};

// バーの最大高さ (px)。読了数に応じてこの範囲内でスケールする。
const BAR_MAX_H = 36;
const BAR_MIN_H = 3;

const trendCaptionStyle = {
  fontSize: 10,
  color: 'var(--color-text-tertiary)',
  lineHeight: 1.2,
  alignSelf: 'flex-end',
  whiteSpace: 'nowrap',
};

// 📈 読書が成果につながった度合いを「読んだ本 → 実行した行動 → 残した学び」の
// 流れで示す。初見でも意味が分かるよう、見出しの下に平易な一文を添える。
function RoiFunnel({ doneTotal, actionsDone, harvest }) {
  const noOutcome = actionsDone === 0 && harvest === 0;
  const cell = (n, label, color) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', letterSpacing: '.01em', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
    </div>
  );
  const arrow = <span aria-hidden="true" style={{ color: '#c3b9a4', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>→</span>;
  return (
    <div style={{ background: 'var(--color-accent-soft)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-ink)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={15} aria-hidden="true" style={{ color: 'var(--color-accent)' }} /> 読書が成果に変わった記録
      </div>
      <p style={{ fontSize: 11, color: 'var(--c-ink-3)', margin: '0 0 10px', lineHeight: 1.45 }}>
        読んだ本が、行動の実行、そして学びの収穫へつながった数です。
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
        {cell(doneTotal, '読んだ本', 'var(--color-text-secondary)')}
        {arrow}
        {cell(actionsDone, '実行した行動', actionsDone > 0 ? 'var(--c-positive)' : 'var(--color-text-tertiary)')}
        {arrow}
        {cell(harvest, '残した収穫', harvest > 0 ? '#a06a30' : 'var(--color-text-tertiary)')}
      </div>
      {noOutcome && doneTotal > 0 && (
        // 「まだ成果に変わっていません」は開くたびに失敗を宣告する響きだった。
        // 次の一手が分かる前向きな一文に（判定ではなく案内）。
        <p style={{ fontSize: 11, color: '#9a8c74', margin: '8px 0 0', lineHeight: 1.5, textAlign: 'center' }}>
          メモの「行動にする」から、最初の行動を 1 つ決めてみましょう。
        </p>
      )}
    </div>
  );
}

function QuietProgress({ doneTotal, trend, actionsDone, harvest }) {
  const peak = trend.reduce((m, k) => Math.max(m, k.count), 0);
  const lastIdx = trend.length - 1; // 一番右 = 今月
  return (
   <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 var(--space-2)' }}>
    <RoiFunnel doneTotal={doneTotal} actionsDone={actionsDone} harvest={harvest} />
    <div style={{ ...panel, margin: 0 }}>
      <div style={totalBlock}>
        <AnimatedNumber value={doneTotal} duration={700} style={totalNumber} />
        <span style={totalLabel}>累計の読了</span>
      </div>
      {/* 棒グラフ = 月ごとの読了数。何のグラフか一目で分かるよう見出しを添える。 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: '1 1 auto', minWidth: 0 }}>
        <span style={{ ...trendCaptionStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarDays size={12} aria-hidden="true" /> 月別の読了（直近6ヶ月）</span>
        <div
          style={trendBlock}
          aria-label={`直近 6 ヶ月の読了推移: ${trend
            .map((k) => `${k.month + 1}月 ${k.count}冊`)
            .join(', ')}`}
        >
          {trend.map((k, i) => {
            // peak が 0 のときは全て最小高さ (静かに「まだこれから」)。
            const h =
              peak > 0
                ? Math.max(BAR_MIN_H, Math.round((k.count / peak) * BAR_MAX_H))
                : BAR_MIN_H;
            const active = k.count > 0;
            const isCurrent = i === lastIdx; // 今月を少しだけ強調
            return (
              <div key={`${k.year}-${k.month}`} style={monthCol} aria-hidden="true">
                <span style={countLabelStyle}>{active ? k.count : ''}</span>
                <div
                  style={{
                    ...barTrackBase,
                    height: BAR_MAX_H,
                    background: 'transparent',
                    alignItems: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: h,
                      borderRadius: 'var(--radius-xs)',
                      background: active
                        ? 'var(--color-accent)'
                        : 'var(--color-border)',
                      transition: 'height var(--duration-base, 0.3s) var(--ease-spring, ease)',
                    }}
                  />
                </div>
                {/* 「5」だけだと数字の意味が不明 → 「5月」と単位を付ける。今月は太字。 */}
                <span style={{ ...monthLabelStyle, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? 'var(--color-accent-strong)' : 'var(--color-text-tertiary)' }}>
                  {k.month + 1}月
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
   </div>
  );
}

export default function BookshelfSummary({ books, onClick }) {
  const stats = useMemo(() => buildStats(books), [books]);
  const trend = useMemo(() => buildTrend(books), [books]);
  const empty = stats.readingNow === 0 && stats.beforeNow === 0 && stats.doneThisMonth === 0;

  const text = empty
    ? '今月の活動はまだありません。最初の 1 冊から始めましょう'
    : `今月: 読了 ${stats.doneThisMonth} 冊 / 読書中 ${stats.readingNow} 冊 / 積読 ${stats.beforeNow} 冊`;

  // 累計読了が 1 冊以上あるときだけ、静かな手応えパネルを出す。
  // 0 冊 (= まだ何も読了していない) のときは従来どおり一行のみ。
  const showProgress = stats.doneTotal > 0;

  const line = onClick ? (
    <button type="button" style={linkLike} onClick={onClick} aria-label={text}>
      {text}
    </button>
  ) : (
    <p style={wrap} aria-label={text}>{text}</p>
  );

  // 累計パネルを出すときは「今月: 読了X/読書中Y/積読Z」の重複行を出さない。
  // 読了の推移はパネルの月別グラフに、読書中/積読の数はステータスのフィルタ
  // ピル（読書中(3)/積読(1)…）に既に出ているため、二重表示はノイズになる。
  if (showProgress) {
    return <QuietProgress doneTotal={stats.doneTotal} trend={trend} actionsDone={stats.actionsDone} harvest={stats.harvest} />;
  }
  return line;
}
