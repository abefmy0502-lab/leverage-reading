// Reusable skeleton placeholders with shimmer animation. Designed to mirror
// the rough layout of the real content so the swap-in feels seamless.

const KEYFRAMES_ID = '__leverage-skeleton-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
@keyframes leverage-shimmer {
  0% { background-position: -300px 0; }
  100% { background-position: 300px 0; }
}
.leverage-skeleton {
  background: linear-gradient(90deg, #ece5d6 0%, #f5efe2 50%, #ece5d6 100%);
  background-size: 600px 100%;
  animation: leverage-shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}
@media (prefers-reduced-motion: reduce) {
  .leverage-skeleton { animation: none; }
}
`;
  document.head.appendChild(style);
}

export function SkeletonBlock({ width = '100%', height = 14, radius = 6, style }) {
  ensureKeyframes();
  return (
    <span
      className="leverage-skeleton"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
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
        background: '#faf6f0',
        borderRadius: 12,
        padding: '10px 12px',
        border: '1px solid #e4ddd0',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <SkeletonBlock width={34} height={48} radius={4} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBlock width="70%" height={12} />
        <SkeletonBlock width="40%" height={10} />
        <SkeletonBlock width={60} height={14} radius={8} />
      </div>
    </div>
  );
}

export function BookListSkeleton({ rows = 4 }) {
  ensureKeyframes();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        background: '#faf6f0',
        border: '1px solid #e4ddd0',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <SkeletonBlock width={48} height={16} radius={8} />
      <SkeletonBlock width="100%" height={10} />
      <SkeletonBlock width="92%" height={10} />
      <SkeletonBlock width="60%" height={10} />
    </div>
  );
}

export function MemoListSkeleton({ rows = 3 }) {
  ensureKeyframes();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <MemoCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default SkeletonBlock;
