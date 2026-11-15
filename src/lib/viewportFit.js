// 💬 キーボードを開いても、画面を見えている範囲にぴったり合わせる（2026-11-15 オーナー「LINE のように滑らかにチャットしたい・
//   今だと過去の履歴を見ながら文章を入力できない」）。
//
// iOS の Safari（と、ホーム画面に置いた Web のアプリ）は、キーボードを開くと画面の大きさ（100dvh）を変えずに、
// ページ全体を上へ送って入力欄を見せる。そのため、上の行や会話の欄が画面の外（時計の下）へ押し出され、
// 会話を送って読み返そうとしても、ページごと動いてしまっていた。
// ここでは、キーボードが開いている間だけ、アプリの高さを「見えている範囲」（visualViewport の高さ）にし、
// ページの送りを 0 に戻す。会話の欄はその中で送れる（LINE と同じ: 上で会話を読み、下に入力欄・その下にキーボード）。
// iPhone のアプリ（Capacitor・キーボードで画面ごと縮む＝resize native）では何もしない。
export const VIEWPORT_FIT_CLASS = 'vv-fit';

// キーボードが開いているとみなす差（見えている高さが、画面の高さよりこれ以上小さい）。
export function keyboardShown(innerHeight, vvHeight, threshold = 100) {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(vvHeight)) return false;
  return innerHeight - vvHeight > threshold;
}

export function installViewportFit({ win = typeof window !== 'undefined' ? window : null, native = false } = {}) {
  if (!win || native) return () => {};
  const vv = win.visualViewport;
  const doc = win.document;
  if (!vv || !doc) return () => {};
  const root = doc.documentElement;
  let raf = 0;
  const apply = () => {
    raf = 0;
    const open = keyboardShown(win.innerHeight, vv.height);
    if (open) {
      root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
      root.classList.add(VIEWPORT_FIT_CLASS);
      // Safari がページを上へ送った分を戻す（アプリの高さを見えている範囲にしたので、入力欄はもう見えている）。
      if (win.scrollY || vv.offsetTop) win.scrollTo(0, 0);
    } else if (root.classList.contains(VIEWPORT_FIT_CLASS)) {
      root.classList.remove(VIEWPORT_FIT_CLASS);
      root.style.removeProperty('--vv-height');
    }
  };
  const schedule = () => { if (!raf) raf = win.requestAnimationFrame(apply); };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  win.addEventListener('scroll', schedule, { passive: true });
  apply();
  return () => {
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    win.removeEventListener('scroll', schedule);
    if (raf) win.cancelAnimationFrame(raf);
    root.classList.remove(VIEWPORT_FIT_CLASS);
    root.style.removeProperty('--vv-height');
  };
}
