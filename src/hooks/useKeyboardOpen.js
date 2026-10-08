// 📱 useKeyboardOpen — visualViewport で iOS / Android の仮想キーボード
// 表示状態を検出する。`viewport-fit=cover + interactive-widget=resizes-content`
// だけだと、AI タブで textarea にフォーカス → BottomNav と入力欄が重なる
// 現象が完全には消えないため、保険として「キーボード開いてる時は
// BottomNav を消す」を実現するためのフック。
//
// 二重検知:
//   1) visualViewport.resize/scroll で window.innerHeight - vv.height > threshold
//      (Apple 公式パターン — 一番正確)
//   2) document focusin/focusout で textarea/input が focus されたかどうか
//      (visualViewport が動かない or 反応が遅い端末用のフォールバック。
//       実際にキーボードが上がっていなくても焦点だけで true になり得る
//       弱点はあるが、UI を畳む方向には間違いなく安全)
//   3) iOS のアプリ（Capacitor）では、キーボードの開く／閉じるの知らせ（lib/native.js の NATIVE_KEYBOARD_EVENT）。
//      ネイティブのリサイズでは window と visualViewport が一緒に縮むので 1) では分からないため（2026-10-08）。
//      閉じたと知らされたら、入力欄にカーソルが残っていても閉じたとみなす（ハードウェアキーボードなど）。
// どれか 1 つでも true なら open とみなす。

import { useEffect, useState } from 'react';

// lib/native.js の NATIVE_KEYBOARD_EVENT と同じ名前（native.js は Capacitor を読み込むので、ここでは文字で持つ）。
const NATIVE_KEYBOARD_EVENT = 'orime:native-keyboard';

export function useKeyboardOpen(threshold = 100) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const vvSupported = !!window.visualViewport;

    let vvOpen = false;
    let focusOpen = false;
    let nativeOpen = false;
    const apply = () => {
      const next = vvOpen || focusOpen || nativeOpen;
      setOpen(next);
    };

    const computeVv = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const heightDiff = window.innerHeight - vv.height;
      // 90% 未満になったらキーボード開とみなす条件も並行採用
      // (iPad で diff が小さく出るケース対策)。
      const next = heightDiff > threshold || vv.height < window.innerHeight * 0.85;
      if (next !== vvOpen) {
        vvOpen = next;
        apply();
      }
    };

    const isFormField = (el) => {
      if (!el || !el.tagName) return false;
      const t = el.tagName;
      return t === 'TEXTAREA' || t === 'INPUT' || el.isContentEditable;
    };
    const onFocusIn = (e) => {
      if (!isFormField(e.target) || nativeSeen) return;
      if (!focusOpen) {
        focusOpen = true;
        apply();
      }
    };
    const onFocusOut = (e) => {
      if (!isFormField(e.target)) return;
      // 別の form field へ focus 連鎖する場合があるので少し遅らせる
      setTimeout(() => {
        const ae = document.activeElement;
        if (isFormField(ae)) return;
        if (focusOpen) {
          focusOpen = false;
          apply();
        }
      }, 80);
    };

    // 一度でもネイティブの知らせが来たら、カーソルだけでは開いたとみなさない（カーソルを置いてもキーボードが出ない
    // ＝画面を開いたときに置いたカーソルで、下のタブが消えたままにならないように）。
    let nativeSeen = false;
    const onNative = (e) => {
      const open = !!e?.detail?.open;
      nativeSeen = true;
      nativeOpen = open;
      focusOpen = false;
      apply();
    };
    window.addEventListener(NATIVE_KEYBOARD_EVENT, onNative);

    if (vvSupported) {
      window.visualViewport.addEventListener('resize', computeVv);
      window.visualViewport.addEventListener('scroll', computeVv);
      computeVv();
    }
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      if (vvSupported) {
        window.visualViewport.removeEventListener('resize', computeVv);
        window.visualViewport.removeEventListener('scroll', computeVv);
      }
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener(NATIVE_KEYBOARD_EVENT, onNative);
    };
  }, [threshold]);

  return open;
}
