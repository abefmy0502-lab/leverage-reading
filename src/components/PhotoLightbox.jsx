// 🖼 メモの写真を大きく見る（2026-10-18 オーナー「写真を添付したものをワンクリック押したら大きく表示されるように」）。
//
// 本の詳細のメモのカードにあった拡大表示（BookMemoCard）を 1 つの部品にして、振り返りのメモ・メモの編集画面でも使う。
// 画面いっぱいの暗い地（--photo-backdrop）に、写真を端まで使って置く（角丸なし）。写真を押すと 2 倍（押した所を中心に・もう一度で戻す）・
// ピンチでも拡大できる（touch-action: pinch-zoom）。閉じるのは写真の外の地・Esc・右上の ×。読み込めなければ一言。
// 下の画面のカードに押す・長押し・スワイプが届かないよう、portal の中で止める（React のツリーを辿って届くため）。
// 重なり: シート（700）・全画面のメモの編集の上にも出る（--z-popover）。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ensureHttps } from '../lib/url';

const stop = (e) => e.stopPropagation();

export default function PhotoLightbox({ src, alt = 'メモの写真', onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const [zoomed, setZoomed] = useState(null); // null | { x, y }（% の中心）
  const [failed, setFailed] = useState(false);
  if (!src) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="写真の拡大表示。写真の外を押すと閉じる"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
      onMouseDown={stop}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-popover)',
        background: 'var(--photo-backdrop)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', cursor: 'zoom-out',
      }}
    >
      {failed ? (
        <p role="alert" style={{ margin: 0, padding: 'var(--space-4)', color: 'var(--on-cover)', fontSize: 'var(--text-sub)' }}>写真を読み込めませんでした。</p>
      ) : (
        <img
          src={ensureHttps(src)}
          alt={`${alt}（拡大表示）`}
          onError={() => setFailed(true)}
          onClick={(e) => {
            e.stopPropagation();
            if (zoomed) { setZoomed(null); return; }
            const r = e.currentTarget.getBoundingClientRect();
            setZoomed({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          style={{
            display: 'block', maxWidth: '100vw', maxHeight: '100dvh', objectFit: 'contain',
            cursor: zoomed ? 'zoom-out' : 'zoom-in', touchAction: 'pinch-zoom',
            transform: zoomed ? 'scale(2)' : 'none',
            transformOrigin: zoomed ? `${zoomed.x}% ${zoomed.y}%` : 'center',
            transition: 'transform var(--duration-fast) var(--ease-out)',
          }}
        />
      )}
      {/* ♿ aria-modal のダイアログの中にフォーカスできる物を 1 つ（開いたらここへ） */}
      <button
        type="button"
        autoFocus
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="拡大表示を閉じる"
        style={{
          position: 'absolute', top: 'max(env(safe-area-inset-top, 0px), var(--space-3))', right: 'var(--space-3)',
          width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: 999, border: 'none', cursor: 'pointer',
          // 写真の上は明暗どちらでも暗いので、白（--on-cover）を薄く混ぜた丸ボタン。
          background: 'color-mix(in srgb, var(--on-cover) 16%, transparent)', color: 'var(--on-cover)', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
