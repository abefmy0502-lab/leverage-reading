// ⌨️ 相談・AI 選書の入力欄の高さを、書いた量に合わせる（空は 1 行・5 行を超えたら中を送る・lib/composerView.js）。
//
// 高さは描く前（useLayoutEffect）に合わせる（送ったあとに「消えた文字の高さのまま 1 回描く → 縮む」で 2 回動かない）。
// 文字の大きさが変わったとき（iOS の「文字サイズ」・画面の幅の変化）も測り直す（2026-10-08 ui-critic: 文字を最大にすると、
// 空の入力欄の文字が下で切れていた＝高さ 44 のまま）。文字の大きさの変化は、入力欄と同じ大きさの見えない 1 文字の
// 大きさの変化（ResizeObserver）で知る（入力欄の高さは手で決めているので、入力欄そのものを見ても変わらない）。

import { useCallback, useEffect, useLayoutEffect } from 'react';
import { composerHeight } from '../lib/composerView';

export function useComposerHeight(ref, value, active = true) {
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const max = parseFloat(cs.maxHeight);
    const min = parseFloat(cs.minHeight);
    el.style.height = composerHeight({
      scrollHeight: el.scrollHeight + 2,
      min: Number.isFinite(min) && min > 0 ? min : 44,
      max: Number.isFinite(max) ? max : 146,
    }) + 'px';
  }, [ref]);

  useLayoutEffect(() => { fit(); }, [value, fit, active]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined' || !el.parentNode) return undefined;
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.textContent = 'あ';
    // 入力欄と同じ文字の大きさ（components.css の .ai-input-area textarea）。rem なので「文字サイズ」に合わせて変わる。
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;left:0;top:0;font-size:max(16px, var(--text-body));line-height:1.5;';
    el.parentNode.appendChild(probe);
    let last = '';
    const ro = new ResizeObserver(() => {
      const key = `${probe.offsetWidth}x${probe.offsetHeight}x${el.clientWidth}`;
      if (key === last) return;
      last = key;
      fit();
    });
    ro.observe(probe);
    ro.observe(el);
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      probe.remove();
    };
  }, [ref, fit, active]);
}
