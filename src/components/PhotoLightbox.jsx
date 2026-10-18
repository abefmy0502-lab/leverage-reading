// 🖼 メモの写真を大きく見る（2026-10-18 オーナー「写真を添付したものをワンクリック押したら大きく表示されるように」）。
//
// 本の詳細のメモのカードにあった拡大表示（BookMemoCard）を 1 つの部品にして、振り返りのメモ・メモの編集画面でも使う。
// 画面いっぱいの暗い地（--photo-backdrop）に写真を収めて置く。どこを押しても・Esc・右上の × で閉じる。
// 下の画面のカードに押す・長押し・スワイプが届かないよう、portal の中で止める（React のツリーを辿って届くため）。
// 重なり: シート（700）・全画面のメモの編集の上にも出る（--z-popover）。
import { useEffect } from 'react';
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
  if (!src) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="写真の拡大表示。タップで閉じる"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
      onMouseDown={stop}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-popover)',
        background: 'var(--photo-backdrop)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)', cursor: 'zoom-out',
      }}
    >
      <img src={ensureHttps(src)} alt={`${alt}（拡大表示）`} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 'var(--radius)' }} />
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
