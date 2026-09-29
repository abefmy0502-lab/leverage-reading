// Wraps a card to add iOS-style "swipe left to delete" with a red action
// drawer on the right and spring-back when not crossed the threshold.
//
// The wrapper purposely stays minimal — it just gates the touch handling and
// applies a transform. The visual style of the inner card is the caller's
// responsibility (we don't paint a background here so we don't double up).

import { useEffect, useRef, useState } from 'react';
import { useSwipeToDelete } from '../hooks/useSwipeToDelete';
import { useHaptic } from '../hooks/useHaptic';
import { Trash2 } from 'lucide-react';

const ACTION_WIDTH = 200;

const reducedMotion = () => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; }
};
const fastMs = () => {
  if (reducedMotion()) return 0;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--duration-fast').trim();
    const n = parseFloat(v);
    if (Number.isFinite(n)) return /ms$/.test(v) ? n : n * 1000;
  } catch { /* ignore */ }
  return 200;
};

// 一覧の 1 項目（兄弟が複数いる一番近い祖先の子）を探す。カードが li や div に包まれていても、
// その包みごと畳む（包みの高さ・余白が残って、次のカードが後から跳ねないように）。
function findListItem(el) {
  let node = el;
  while (node?.parentElement && node.parentElement.childElementCount === 1 && node.parentElement !== document.body) {
    node = node.parentElement;
  }
  return node;
}

// 削除する項目の高さを 0 まで畳む（次のカードが一気に 159px 跳ね上がらないように・2026-09-29）。
// 親が flex/grid の縦並びなら、間（gap）の分も負の余白で打ち消す。戻すときの関数を返す。
function collapseItem(item) {
  if (!item || typeof window === 'undefined') return { done: Promise.resolve(), restore: () => {} };
  const prev = {
    height: item.style.height, overflow: item.style.overflow, opacity: item.style.opacity,
    marginTop: item.style.marginTop, marginBottom: item.style.marginBottom, transition: item.style.transition,
  };
  const parent = item.parentElement;
  let gap = 0;
  try {
    const pcs = parent ? getComputedStyle(parent) : null;
    if (pcs && /flex|grid/.test(pcs.display)) gap = parseFloat(pcs.rowGap) || 0;
  } catch { /* ignore */ }
  const isFirst = parent?.firstElementChild === item;
  const only = parent?.childElementCount === 1;
  const dur = fastMs();
  item.style.height = `${item.offsetHeight}px`;
  item.style.overflow = 'hidden';
  // eslint-disable-next-line no-unused-expressions
  item.offsetHeight; // 今の高さを確定させてから畳む
  const ease = 'var(--duration-fast) var(--ease-out)';
  item.style.transition = `height ${ease}, margin ${ease}, opacity ${ease}`;
  item.style.height = '0px';
  item.style.opacity = '0';
  if (gap > 0 && !only) {
    if (isFirst) item.style.marginBottom = `${-gap}px`;
    else item.style.marginTop = `${-gap}px`;
  }
  const done = new Promise((r) => { window.setTimeout(r, dur + 20); });
  // 項目が消えずに別の中身で使い回されたとき（並びの key が同じ等）は、動かさずにすぐ戻す。
  const reset = () => { if (item.isConnected) Object.assign(item.style, prev); };
  const restore = () => {
    if (!item.isConnected) return;
    item.style.height = `${item.scrollHeight}px`;
    item.style.opacity = '';
    item.style.marginTop = prev.marginTop;
    item.style.marginBottom = prev.marginBottom;
    window.setTimeout(() => {
      if (!item.isConnected) return;
      Object.assign(item.style, prev);
    }, dur + 20);
  };
  return { done, restore, reset };
}

export default function SwipeableCard({
  children,
  onDelete,
  threshold = 80,
  disabled = false,
  actionLabel,
}) {
  // Default label uses a Lucide icon; callers can override with a string or JSX.
  const resolvedLabel = actionLabel ?? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
      削除
    </span>
  );
  const haptic = useHaptic();
  const rootRef = useRef(null);
  // 畳んでいる間は赤い引き出しの高さを固定する（中央の「削除」の文字が上へ流れて見えないように）。
  const [drawerH, setDrawerH] = useState(null);
  const { offset, armed, isDeleting, bind } = useSwipeToDelete({
    threshold,
    maxSwipe: ACTION_WIDTH,
    onDelete: async () => {
      haptic.medium();
      // 先に項目の高さを畳んでから消す（消えた瞬間に下のカードが跳ねない）。
      const card = rootRef.current;
      if (card) setDrawerH(card.offsetHeight);
      const item = findListItem(card);
      const { done, restore, reset } = collapseItem(item);
      await done;
      try { await onDelete?.(); } catch { /* ignore */ }
      requestAnimationFrame(() => { if (item?.isConnected && !(card?.isConnected && item.contains(card))) reset(); });
      // 取り消し（確認で「キャンセル」）・失敗でまだ画面に残っていれば、高さを戻す。
      window.setTimeout(() => {
        if (card?.isConnected) setDrawerH(null);
        if (!item?.isConnected) return;
        if (card?.isConnected && item.contains(card)) restore();
        else reset();
      }, 400);
    },
  });

  // Buzz once when crossing the arm threshold (gives the user the "click"
  // moment before they release).
  useEffect(() => {
    if (armed) haptic.light();
  }, [armed, haptic]);

  if (disabled) return children;

  const transformValue = offset > 0 ? `translate3d(${-offset}px, 0, 0)` : 'none';
  const useTransition = offset === 0 || isDeleting;

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        // 切り抜きはスワイプ中だけ（静止中も hidden だと、端数の高さのカードで下端の枠線と
        // 角が 1px 欠けて描かれていた）。静止中は赤い引き出しも visibility:hidden。
        overflow: offset > 0 || isDeleting ? 'hidden' : 'visible',
        borderRadius: 'var(--radius)',
        // Background sits behind the foreground card; the action drawer paints
        // its own colour above it.
      }}
    >
      {/* Action drawer (red) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          ...(drawerH != null ? { height: drawerH } : { bottom: 0 }),
          width: ACTION_WIDTH,
          background: 'var(--error)',
          // 🩹 静止中は赤を描かない。カードの角丸（直書きの 14/16 等）と外枠の角丸が
          // 違うと、角のすき間から赤がにじんで見えていた（SPEC の違和感 1）。
          // スワイプが始まった時だけ出す。
          visibility: offset > 0 || isDeleting ? 'visible' : 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: 'var(--space-6)',
          color: 'var(--accent-ink)',
          fontWeight: 600,
          fontSize: 'var(--text-sub)',
          letterSpacing: 1,
          // The drawer pulses a bit when the swipe crosses the arm threshold
          // so the user sees their gesture is "loaded".
          transform: armed ? 'scale(1.04)' : 'scale(1)',
          transformOrigin: 'left center',
          transition: 'transform var(--duration-fast) var(--ease-spring)',
        }}
      >
        {resolvedLabel}
      </div>

      {/* Foreground content */}
      <div
        {...bind}
        style={{
          transform: transformValue,
          transition: useTransition
            ? 'transform var(--duration-base) var(--ease-spring)'
            : 'none',
          // 静止中は合成レイヤーにしない（overflow:hidden＋角丸の親の中で常時レイヤー化すると、
          // 端数の高さのカードで下端の枠線と角が 1px 欠けて描かれることがあった）。
          willChange: offset > 0 ? 'transform' : 'auto',
          // Inherit so the card's own background continues to cover the drawer
          // when at rest.
          background: 'transparent',
        }}
      >
        {children}
      </div>
    </div>
  );
}
