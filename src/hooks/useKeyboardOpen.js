// 📱 useKeyboardOpen — visualViewport で iOS / Android の仮想キーボード
// 表示状態を検出する。`viewport-fit=cover + interactive-widget=resizes-content`
// だけだと、AI タブで textarea にフォーカス → BottomNav と入力欄が重なる
// 現象が完全には消えないため、保険として「キーボード開いてる時は
// BottomNav を消す」を実現するためのフック。
//
// 三重検知:
//   1) visualViewport.resize/scroll で window.innerHeight - vv.height > threshold
//      (Apple 公式パターン)。ただし入力欄にカーソルが無いときの縮み（ブラウザのバー・回転・ズーム）は
//      キーボードではないので数えない（2026-11-08）。
//   2) document focusin/focusout で textarea/input が focus されたかどうか
//      (visualViewport が動かない or 反応が遅い端末用のフォールバック)。
//      入力欄がカーソルを持ったまま画面から消えると（メモのシートを閉じる・画面を切り替える）focusout が来ず、
//      下のタブが消えたままになっていた（2026-11-08 オーナー「下のホームなどを選択するところが非表示になりやすい」）
//      → 0.5 秒ごと・指で触ったとき・画面に戻ったときに「本当にまだカーソルがあるか」を確かめて戻す。
//   3) iOS のアプリ（Capacitor）では、キーボードの開く／閉じるの知らせ（lib/native.js の NATIVE_KEYBOARD_EVENT）。
//      一度でも知らせが来たら、それだけを信じる（カーソルだけでは開いたとみなさない）。
// 判定の芯は attachKeyboardWatch（テストは偽の document で）。

import { useEffect, useState } from 'react';

// lib/native.js の NATIVE_KEYBOARD_EVENT と同じ名前（native.js は Capacitor を読み込むので、ここでは文字で持つ）。
const NATIVE_KEYBOARD_EVENT = 'orime:native-keyboard';
export const RECHECK_MS = 500;

const isFormField = (el) => {
  if (!el || !el.tagName) return false;
  const t = el.tagName;
  return t === 'TEXTAREA' || t === 'INPUT' || el.isContentEditable;
};

// onChange(open) を呼ぶ。戻り値は外す関数。doc / win は差し替えられる（テスト）。
export function attachKeyboardWatch(onChange, { doc = document, win = window, threshold = 100, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, setTimeoutImpl = setTimeout } = {}) {
  let vvOpen = false;
  let focusOpen = false;
  let nativeOpen = false;
  let nativeSeen = false;
  let last = null;
  const apply = () => {
    const next = vvOpen || focusOpen || nativeOpen;
    if (next !== last) { last = next; onChange(next); }
  };

  // カーソルが本当に入力欄に残っているか（消えた入力欄＝isConnected が false は「外れた」）。
  const fieldStillFocused = () => {
    const ae = doc.activeElement;
    return isFormField(ae) && ae.isConnected !== false;
  };

  const computeVv = () => {
    const vv = win.visualViewport;
    if (!vv) return;
    const heightDiff = win.innerHeight - vv.height;
    const shrunk = heightDiff > threshold || vv.height < win.innerHeight * 0.85;
    const next = shrunk && (nativeSeen ? nativeOpen : fieldStillFocused());
    if (next !== vvOpen) { vvOpen = next; apply(); }
  };

  let watch = null;
  const stopWatch = () => { if (watch) { clearIntervalImpl(watch); watch = null; } };
  const recheck = () => {
    if (focusOpen && !fieldStillFocused()) { focusOpen = false; apply(); }
    // iOS のアプリで「閉じた」知らせが来なくても、入力欄にカーソルが無ければキーボードは出ていない。
    if (nativeOpen && !fieldStillFocused()) { nativeOpen = false; apply(); }
    if (vvOpen) computeVv();
    if (!focusOpen && !nativeOpen) stopWatch();
  };
  const startWatch = () => { if (!watch) watch = setIntervalImpl(recheck, RECHECK_MS); };

  const onFocusIn = (e) => {
    if (!isFormField(e.target) || nativeSeen) return;
    if (!focusOpen) { focusOpen = true; apply(); }
    startWatch();
  };
  const onFocusOut = (e) => {
    if (!isFormField(e.target)) return;
    // 別の form field へ focus 連鎖する場合があるので少し遅らせる
    setTimeoutImpl(recheck, 80);
  };
  const onNative = (e) => {
    nativeSeen = true;
    nativeOpen = !!e?.detail?.open;
    focusOpen = false;
    if (nativeOpen) startWatch(); else stopWatch();
    apply();
  };

  win.addEventListener(NATIVE_KEYBOARD_EVENT, onNative);
  const vv = win.visualViewport;
  if (vv) { vv.addEventListener('resize', computeVv); vv.addEventListener('scroll', computeVv); computeVv(); }
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  doc.addEventListener('pointerdown', recheck, true);
  doc.addEventListener('visibilitychange', recheck);

  return () => {
    stopWatch();
    if (vv) { vv.removeEventListener('resize', computeVv); vv.removeEventListener('scroll', computeVv); }
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', onFocusOut);
    doc.removeEventListener('pointerdown', recheck, true);
    doc.removeEventListener('visibilitychange', recheck);
    win.removeEventListener(NATIVE_KEYBOARD_EVENT, onNative);
  };
}

export function useKeyboardOpen(threshold = 100) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    return attachKeyboardWatch(setOpen, { threshold });
  }, [threshold]);
  return open;
}
