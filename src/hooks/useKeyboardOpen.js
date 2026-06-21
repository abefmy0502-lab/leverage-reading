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
// どちらか一方でも true なら open とみなす。

import { useEffect, useState } from 'react';

export function useKeyboardOpen(threshold = 100) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const vvSupported = !!window.visualViewport;

    let vvOpen = false;
    let focusOpen = false;
    const apply = () => {
      const next = vvOpen || focusOpen;
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
      if (!isFormField(e.target)) return;
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
    };
  }, [threshold]);

  return open;
}
