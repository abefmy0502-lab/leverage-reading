// 📱 useKeyboardOpen — visualViewport で iOS / Android の仮想キーボード
// 表示状態を検出する。`viewport-fit=cover + interactive-widget=resizes-content`
// だけだと、AI タブで textarea にフォーカス → BottomNav と入力欄が重なる
// 現象が完全には消えないため、保険として「キーボード開いてる時は
// BottomNav を消す」を実現するためのフック。
//
// 判定: window.innerHeight - visualViewport.height がしきい値 (default 100px)
// より大きければキーボード開と判定。これは Apple 公式の推奨パターン。

import { useEffect, useState } from 'react';

export function useKeyboardOpen(threshold = 100) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const compute = () => {
      const heightDiff = window.innerHeight - vv.height;
      setOpen(heightDiff > threshold);
    };

    compute();
    vv.addEventListener('resize', compute);
    vv.addEventListener('scroll', compute);
    return () => {
      vv.removeEventListener('resize', compute);
      vv.removeEventListener('scroll', compute);
    };
  }, [threshold]);

  return open;
}
