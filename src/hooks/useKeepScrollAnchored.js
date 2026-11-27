import { useEffect } from 'react';
import { userScrollingNow } from './useChatImmersive';

// 📌 会話の欄の上の行（上の行・サブタブ）が出たり消えたりしても、読んでいる文を動かさない（2026-11-27 オーナー
//   「チャットを続けると画面がガクガクする・LINE のトークくらいストレスなく」）。
//   キーボードを閉じると上の行が戻り、欄の上端が 117 ほど下がって会話が一気に下へずれていた（開くときは逆に上へ）。
//   欄の上端が動いた分だけ送る位置を足して、見えている文をその場に留める（描く前の ResizeObserver で合わせるので、
//   ずれた絵は出ない）。本人が指で動かしている途中は触らない（慣性の送りを止めない）。
//   これより後に作った ResizeObserver（相談の keepAnswerEnd など）は、合わせたあとの位置から動く（観察の順）。
export function anchoredScrollTop(scrollTop, prevTop, nextTop) {
  const d = nextTop - prevTop;
  if (!Number.isFinite(d) || Math.abs(d) < 1) return null;
  return Math.max(0, scrollTop + d);
}

export function useKeepScrollAnchored(ref, enabled = true, deps = []) {
  useEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return undefined;
    const el = ref.current;
    if (!el) return undefined;
    let lastTop = el.getBoundingClientRect().top;
    const ro = new ResizeObserver(() => {
      const top = el.getBoundingClientRect().top;
      const next = anchoredScrollTop(el.scrollTop, lastTop, top);
      lastTop = top;
      if (next == null || userScrollingNow()) return;
      el.scrollTop = next;
    });
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled, ...deps]);
}
