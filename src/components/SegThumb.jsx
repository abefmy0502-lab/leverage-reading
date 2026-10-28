// 切り替え（セグメント）の「選んだ面」を、押した所へ滑らせる（2026-10-28・motion-prompt #057 タブ／#060 セグメントの数字:
// 0.2〜0.25 秒・easeInOutCubic で面が横に移る）。
//
// 使い方: 溝（position: relative の入れ物）のいちばん最初の子に置き、activeKey に「いま選んでいるもの」を渡す。
//   <div className="sub-tabs__seg"><SegThumb activeKey={sub} /><button className="sub-tab active">…</button>…</div>
// 選んでいるボタンを activeSelector（既定 .sub-tab.active）で探し、その位置と大きさに面（.seg-thumb）を合わせる。
// 面は押せない飾り（aria-hidden・pointer-events: none）で、ボタン自身の面は CSS が透明にする（二重に描かない）。
// 最初の 1 回は動かさずに置く（画面を開いた瞬間に面が端から滑ってこない）。文字の大きさや幅が変わったら測り直す。
// 動きを減らす設定では index.css の全体の決まりで止まる（transition が 0.01ms）。JS を使えない所では何も出ない。
//
// variant: 'face'（溝の中の面・既定）／'underline'（文字の下の 2 の線・読書の時間の「今月｜これまで」）／
//          'face-strong'（面に 1 の内側の縁・写真で共有の「投稿｜ストーリー」）
import { useLayoutEffect, useRef, useState } from 'react';

// 選んでいるボタン（offsetLeft/Top/Width/Height）→ 面の位置と大きさ（純粋な計算・テストはここ）。
export function thumbBox(on, variant = 'face') {
  if (variant === 'underline') {
    // 文字の下の 2 の線（ボタンの下端に合わせる）
    return { x: on.offsetLeft, y: on.offsetTop + on.offsetHeight - 2, width: on.offsetWidth, height: 2 };
  }
  return { x: on.offsetLeft, y: on.offsetTop, width: on.offsetWidth, height: on.offsetHeight };
}

export default function SegThumb({ activeKey, activeSelector = '.sub-tab.active', variant = 'face' }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const seg = el?.parentElement;
    if (!el || !seg) return undefined;
    const place = () => {
      const on = seg.querySelector(activeSelector);
      if (!on) { el.style.opacity = '0'; return; }
      el.style.opacity = '';
      const bx = thumbBox(on, variant);
      el.style.transform = `translate(${bx.x}px, ${bx.y}px)`;
      el.style.width = `${bx.width}px`;
      el.style.height = `${bx.height}px`;
    };
    place();
    // 置いたあとの次のフレームから動かす（初回は瞬時に置く）。
    const raf = requestAnimationFrame(() => setReady(true));
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(place);
      ro.observe(seg);
      seg.querySelectorAll(':scope > *').forEach((c) => { if (c !== el) ro.observe(c); });
    }
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [activeKey, activeSelector, variant]);

  return <span ref={ref} aria-hidden="true" className={`seg-thumb seg-thumb--${variant}`} data-ready={ready ? '1' : '0'} />;
}
