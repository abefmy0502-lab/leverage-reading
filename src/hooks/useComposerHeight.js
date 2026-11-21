// ⌨️ 相談・AI 選書の入力欄の高さを、書いた量に合わせる（空は 1 行・5 行を超えたら中を送る・lib/composerView.js）。
//
// 高さは描く前（useLayoutEffect）に合わせる（送ったあとに「消えた文字の高さのまま 1 回描く → 縮む」で 2 回動かない）。
// 文字の大きさが変わったとき（iOS の「文字サイズ」・画面の幅の変化）も測り直す（2026-10-08 ui-critic: 文字を最大にすると、
// 空の入力欄の文字が下で切れていた＝高さ 44 のまま）。文字の大きさの変化は、入力欄と同じ大きさの見えない 1 文字の
// 大きさの変化（ResizeObserver）で知る（入力欄の高さは手で決めているので、入力欄そのものを見ても変わらない）。

import { useCallback, useEffect, useLayoutEffect } from 'react';
import { composerHeight } from '../lib/composerView';

// ⚡ 測るのは見えない写し（mirror）で（2026-11-20 オーナー「相談で文字を入力する際に画面がガクガクする」）。
//   前は 1 文字ごとに本物の入力欄の高さを一度 auto に縮めて測っていた。iPhone（Safari の仕組み）は、縮んだ瞬間に
//   会話の欄の送り位置を詰め、戻しても元に戻さないので、打つたびに会話が上下にずれていた。
//   写しは入力欄と同じ幅・文字・余白で、画面の外に置く（本物の高さは、変わるときだけ書く）。
const MIRROR_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderBottomStyle',
  'boxSizing', 'whiteSpace', 'wordBreak', 'overflowWrap', 'lineBreak', 'tabSize', 'fontFeatureSettings',
];
export function measureWithMirror(el) {
  if (typeof document === 'undefined') return null;
  let m = el.__orimeMirror;
  if (!m || !m.isConnected) {
    m = document.createElement('textarea');
    m.setAttribute('aria-hidden', 'true');
    m.setAttribute('tabindex', '-1');
    m.readOnly = true;
    document.body.appendChild(m);
    el.__orimeMirror = m;
  }
  const cs = getComputedStyle(el);
  MIRROR_PROPS.forEach((k) => { m.style[k] = cs[k]; });
  m.style.position = 'absolute';
  m.style.visibility = 'hidden';
  m.style.pointerEvents = 'none';
  m.style.left = '-10000px';
  m.style.top = '0';
  m.style.overflow = 'hidden';
  m.style.minHeight = '0';
  m.style.maxHeight = 'none';
  m.style.height = 'auto';
  m.style.width = `${el.getBoundingClientRect().width}px`;
  m.rows = el.rows || 2;
  m.placeholder = el.placeholder || '';
  m.value = el.value;
  return { scrollHeight: m.scrollHeight, min: parseFloat(cs.minHeight), max: parseFloat(cs.maxHeight) };
}

// 中身に合わせて伸びる入力欄（目標の答え・ロードマップを直す欄・仮説の欄など）の高さを合わせる。
//   本物の欄を縮めずに写しで測り、変わるときだけ書く（iPhone で打つたびに画面がずれない・2026-11-20）。
export function autoGrowTextarea(el) {
  if (!el) return;
  const r = measureWithMirror(el);
  if (!r) return;
  const next = `${r.scrollHeight + 2}px`;
  if (el.style.height !== next) el.style.height = next;
}

// 会話の欄がいちばん下まで送ってあったか（入力欄が伸びても、いちばん下の答えを入力欄の下に隠さない）。
const atBottom = (box) => !!box && box.scrollHeight - box.scrollTop - box.clientHeight < 4;

// placeholder: 入力欄の案内（空のときの高さは案内の文で決まるので、案内が変わったら測り直す・2026-10-10）。
// opts.scrollRef: 入力欄の上の会話の欄。いちばん下にいたら、入力欄の高さが変わってもいちばん下のままにする。
export function useComposerHeight(ref, value, active = true, placeholder = '', opts = {}) {
  const scrollRef = opts.scrollRef || null;
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = measureWithMirror(el);
    if (!r) return;
    const next = composerHeight({
      scrollHeight: r.scrollHeight + 2,
      min: Number.isFinite(r.min) && r.min > 0 ? r.min : 44,
      max: Number.isFinite(r.max) ? r.max : 146,
    }) + 'px';
    if (el.style.height === next) return; // 変わらないときは触らない（打つたびに画面を組み直さない）
    const box = scrollRef?.current || null;
    const pin = atBottom(box);
    el.style.height = next;
    if (pin && box) box.scrollTop = box.scrollHeight;
  }, [ref, scrollRef]);

  useLayoutEffect(() => { fit(); }, [value, fit, active, placeholder]);

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
      try { el.__orimeMirror?.remove(); el.__orimeMirror = null; } catch { /* ignore */ }
    };
  }, [ref, fit, active]);
}
