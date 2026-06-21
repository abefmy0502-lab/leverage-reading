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

function BookRowSkeleton() {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-3) var(--space-3)',
        border: '1px solid var(--color-separator)',
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'center',
      }}
    >
      <span className="skeleton skeleton-cover" aria-hidden="true" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <SkeletonBlock width="70%" height={14} radius="var(--radius-full)" />
        <SkeletonBlock width="40%" height={10} radius="var(--radius-full)" />
        <span className="skeleton skeleton-pill" aria-hidden="true" />
      </div>
    </div>
  );
}

export function BookListSkeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {Array.from({ length: rows }, (_, i) => (
        <BookRowSkeleton key={i} />
      ))}
    </div>
  );
}

function MemoCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-separator)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-3) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <SkeletonBlock width={48} height={16} radius="var(--radius-full)" />
      <SkeletonBlock width="100%" height={10} radius="var(--radius-full)" />
      <SkeletonBlock width="92%" height={10} radius="var(--radius-full)" />
      <SkeletonBlock width="60%" height={10} radius="var(--radius-full)" />
    </div>
  );
}

export function MemoListSkeleton({ rows = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {Array.from({ length: rows }, (_, i) => (
        <MemoCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Mirrors a single .book-cover-card: 2:3 cover block + title/author lines.
// Geometry is kept in sync with components.css's .book-cover-* so the swap-in
// from skeleton → real grid feels seamless.
function BookCoverSkeleton() {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column' }}
      aria-hidden="true"
    >
      <span
        className="skeleton"
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '2 / 3',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 'var(--space-2)',
        }}
      />
      <SkeletonBlock width="90%" height={12} radius="var(--radius-full)" />
      <SkeletonBlock
        width="55%"
        height={10}
        radius="var(--radius-full)"
        style={{ marginTop: 4 }}
      />
    </div>
  );
}

// Grid skeleton for the bookshelf cover view (📚 本棚 → 表紙グリッド).
// Wrap in .bookshelf-grid so the columns/gap match the real layout exactly.
export function BookGridSkeleton({ count = 6 }) {
  return (
    <div className="bookshelf-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <BookCoverSkeleton key={i} />
      ))}
    </div>
  );
}

export default SkeletonBlock;
