// Reusable skeleton placeholders with shimmer animation.
//
// Phase 2: shimmer keyframes + colour palette now live in
// styles/components.css (.skeleton). This component just composes the
// class with the right dimensions so the layout matches the real card
// and the swap-in feels seamless.

export function SkeletonBlock({ width = '100%', height = 14, radius, style, className }) {
  return (
    <span
      className={`skeleton ${className || ''}`.trim()}
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius != null ? radius : 'var(--radius-xs)',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

// 本の一覧（BookCards.jsx の SwipeableBookCard）の行と同じ形: 余白 12/16・表紙 44×62（角丸 4）・
// 題名 1 行＋状態/著者 1 行。読み込み後に行の高さや位置がずれないようにそろえる。
function BookRowSkeleton() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-3) var(--space-4)',
        border: '1px solid var(--separator)',
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'center',
      }}
    >
      <SkeletonBlock width={44} height={62} radius={4} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <SkeletonBlock width="70%" height={16} radius="var(--radius-full)" />
        <SkeletonBlock width="50%" height={13} radius="var(--radius-full)" />
      </div>
    </div>
  );
}

export function BookListSkeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {Array.from({ length: rows }, (_, i) => (
        <BookRowSkeleton key={i} />
      ))}
    </div>
  );
}

// 本の詳細のメモカード（BookMemoCard.jsx）と同じ形: 枠 1・余白 16・行の間 8・
// 「p.33 · 9/20」の行（20）→ 本文（明朝 --text-read・行間 1.6）→ タグの行（--text-meta・行間 1.5）。
// 以前は 1 枚 96 ほどで、本物（約 120〜176）に替わると下の「行動」の見出しが大きく下がっていた（2026-09-29）。
// 本物のメモは長さがまちまちなので、3 行＋タグ → 2 行＋タグ → 2 行 の順にくり返す（3 枚で本物の平均に近い高さ）。
const MEMO_SKELETON_SHAPES = [
  { lines: ['100%', '92%', '60%'], tag: true },
  { lines: ['100%', '72%'], tag: true },
  { lines: ['96%', '48%'], tag: false },
];
function MemoCardSkeleton({ shape = MEMO_SKELETON_SHAPES[0] }) {
  const readLine = { display: 'flex', alignItems: 'center', height: 'calc(var(--text-read) * 1.6)' };
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--separator)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
        <SkeletonBlock width={64} height={12} radius="var(--radius-full)" />
      </div>
      <div>
        {shape.lines.map((w) => (
          <div key={w} style={readLine}>
            <SkeletonBlock width={w} height={14} radius="var(--radius-full)" />
          </div>
        ))}
      </div>
      {shape.tag && (
        <div style={{ display: 'flex', alignItems: 'center', height: 'calc(var(--text-meta) * 1.5)' }}>
          <SkeletonBlock width={72} height={12} radius="var(--radius-full)" />
        </div>
      )}
    </div>
  );
}

export function MemoListSkeleton({ rows = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {Array.from({ length: rows }, (_, i) => (
        <MemoCardSkeleton key={i} shape={MEMO_SKELETON_SHAPES[i % MEMO_SKELETON_SHAPES.length]} />
      ))}
    </div>
  );
}

// 本の詳細のメモ一覧（BookMemoList）を読み込んでいる間の形（lazyParts の待ち表示）。
// 読み込み後の「件数・並び順」の行（44・上下 -8）→ メモ 3 枚 → 一覧の下の要素（見えないまま）→
// 「この本のまとめ」の見出し（50）と同じ場所を取る（読み込み後に下の「行動」が跳ねないように・2026-09-29）。
export function BookMemoListFallback({ afterList = null, withSummary = false }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ height: 44, margin: 'calc(-1 * var(--space-2)) 0' }} />
        <MemoListSkeleton rows={3} />
      </div>
      {afterList && <div style={{ visibility: 'hidden' }}>{afterList}</div>}
      {withSummary && <div style={{ minHeight: 48, boxSizing: 'content-box', border: '1px solid transparent', borderRadius: 'var(--radius)' }} />}
    </div>
  );
}

// Grid skeleton for the bookshelf cover view (📚 本棚 → 表紙グリッド).
// Wrap in .bookshelf-grid so the columns/gap match the real layout exactly.
// 2026-11-23 から表紙の一覧は本棚の形（BookCards.jsx の BookShelfCase）: 見出し 1 行 → 棚（--fill の面）に表紙 4 冊 × 段・段ごとに棚板。
export function BookGridSkeleton({ count = 8 }) {
  const perRow = 4;
  const rows = Math.max(1, Math.ceil(count / perRow));
  return (
    <div aria-hidden="true" style={{ marginTop: 'var(--space-3)' }}>
      <div style={{ height: 'calc(1.5 * var(--text-body))', display: 'flex', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <SkeletonBlock width="6em" height="var(--text-body)" radius="var(--radius-full)" />
      </div>
      <div style={{ paddingTop: 'var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {Array.from({ length: rows }, (_, ri) => (
          <div key={ri} style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', margin: ri === 0 ? 0 : 'var(--space-4) 0 0', padding: '0 var(--space-3)', borderBottom: 'var(--space-2) solid var(--shelf-plank)' }}>
            {Array.from({ length: perRow }, (_, i) => (
              <span key={i} className="skeleton" style={{ display: 'block', flex: `0 0 calc((100% - ${perRow - 1} * var(--space-2)) / ${perRow})`, aspectRatio: '2 / 3', borderRadius: 'var(--radius-cover)', boxShadow: 'inset 0 0 0 1px var(--separator)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SkeletonBlock;
