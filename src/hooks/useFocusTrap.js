// ♿ useFocusTrap — モーダル/ダイアログ用のフォーカストラップ + 復帰フック。
//
// アクセシビリティ（WCAG 2.4.3 / 2.1.2）対応。モーダルを開いている間、
// キーボードフォーカスをモーダル内に閉じ込め、閉じたら元の要素へ戻す。
//
// 使い方:
//   const ref = useFocusTrap(active);
//   <div ref={ref} role="dialog" aria-modal="true"> … </div>
//
// 動作:
//   - active になった瞬間、開く前の document.activeElement を保持し、
//     モーダル内の最初のフォーカス可能要素（無ければコンテナ自身）へ .focus()。
//   - Tab / Shift+Tab をモーダル境界でループ（背後の要素へ抜けない）。
//   - inactive / unmount 時、保持していた元の要素へフォーカスを復帰。
//   - 要素が無い / SSR（window 無し）では安全に no-op。
//
// 既存の Esc ハンドラやクリック外閉じには一切干渉しない（keydown は Tab のみ
// preventDefault する。他キーは素通し）。

import { useCallback, useEffect, useRef } from 'react';

// フォーカス可能要素のセレクタ。disabled / hidden は除外する。
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  const nodes = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
  // 非表示要素（display:none / 折り畳み）は除外。offsetParent は position:fixed
  // 配下で null になり得るので、矩形サイズでも判定して取りこぼしを防ぐ。
  return nodes.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const rects = el.getClientRects();
    return rects && rects.length > 0;
  });
}

export function useFocusTrap(active = true) {
  const containerRef = useRef(null);
  // 開く前にフォーカスされていた要素を保持（復帰用）。
  const prevFocusRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Tab') return;
    const container = containerRef.current;
    if (!container) return;

    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      // フォーカス可能要素が無ければコンテナに留めて外へ抜けさせない。
      e.preventDefault();
      try { container.focus(); } catch { /* ignore */ }
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeEl = document.activeElement;

    // フォーカスがこのコンテナの外（例: より上位の入れ子ダイアログ）にある時は
    // 介入しない。複数トラップが同時に生きていても互いに干渉しないための要。
    if (activeEl && activeEl !== container && !container.contains(activeEl)) return;

    if (e.shiftKey) {
      // Shift+Tab で先頭（またはコンテナ自身）にいる → 末尾へループ。
      if (activeEl === first || activeEl === container) {
        e.preventDefault();
        try { last.focus(); } catch { /* ignore */ }
      }
    } else if (activeEl === last) {
      // Tab で末尾にいる → 先頭へループ。
      e.preventDefault();
      try { first.focus(); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    // 1. 開く前のフォーカスを保持。
    prevFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // 2. モーダル内の最初のフォーカス可能要素（無ければコンテナ）へ移動。
    const focusable = getFocusable(container);
    const target = focusable[0] || container;
    // コンテナ自身にフォーカスを当てる場合は tabindex を補う。
    if (target === container && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }
    try { target.focus(); } catch { /* ignore */ }

    // 3. Tab をトラップ（capture で他ハンドラより先に境界判定）。
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // 4. 元の要素へ復帰（まだ DOM にあり、focus 可能なときのみ）。
      const prev = prevFocusRef.current;
      prevFocusRef.current = null;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus(); } catch { /* ignore */ }
      }
    };
  }, [active, handleKeyDown]);

  return containerRef;
}

export default useFocusTrap;
