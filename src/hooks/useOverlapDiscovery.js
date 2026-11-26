// 💡 重なりの発見（2026-11-26・lib/overlapDiscovery.js）: メモを保存したら announce({ id, text, bookId }) を呼ぶ。
//   自分のメモの索引（useAllMemoRows・検索・つながるメモと共通）ができ次第、ほかの本のメモと強く重なっていれば、
//   その場で「『○○』と重なりました」＋「重ねて考える」（重なりのシートをその 2 つのメモで開く）の知らせを 1 回だけ。
//   10 秒たっても索引ができなければ、何も出さない（知らせのために待たせない）。AI なし・トークンなし。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMemoLinkFinder } from './useMemoLinkFinder';
import { useToast } from '../components/Toast';
import { useHaptic } from './useHaptic';
import { strongOverlap, discoveryMessage } from '../lib/overlapDiscovery';
import { openOverlap } from '../lib/overlap';
import { track } from '../lib/analytics';

const WAIT_MS = 10000;

export function useOverlapDiscovery({ books }) {
  const [pending, setPending] = useState(null);
  // 1 回使ったら索引を温めたままにする（次の保存ですぐ答えられる）
  const [warm, setWarm] = useState(false);
  const { find, ready } = useMemoLinkFinder({ books, enabled: warm || !!pending });
  const toast = useToast();
  const haptic = useHaptic();
  const shownRef = useRef(new Set());
  const timerRef = useRef(null);

  const announce = useCallback((memo) => {
    const text = String(memo?.text || '').trim();
    if (!memo?.id || !memo?.bookId || !text) return;
    setWarm(true);
    setPending({ id: memo.id, text, bookId: memo.bookId, at: Date.now() });
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    if (!ready) {
      const t = setTimeout(() => setPending((p) => (p === pending ? null : p)), Math.max(0, WAIT_MS - (Date.now() - pending.at)));
      return () => clearTimeout(t);
    }
    const p = pending;
    setPending(null);
    if (shownRef.current.has(p.id)) return undefined;
    const hit = strongOverlap(find({ text: p.text, bookId: p.bookId, memoId: p.id }));
    if (!hit) return undefined;
    shownRef.current.add(p.id);
    // 保存の手応え（✓）が消えるころに出す（重ねない）。タイマーは ref に（pending を空にした描き直しで消さない）
    timerRef.current = setTimeout(() => {
      try { haptic.light(); } catch { /* ignore */ }
      track('overlap_discovered', {});
      toast.show({
        type: 'info',
        message: discoveryMessage(hit.book),
        duration: 7000,
        action: {
          label: '重ねて考える',
          onClick: () => { track('overlap_discovered_open', {}); openOverlap({ id: p.id, text: p.text, bookId: p.bookId }, hit.hit.memoId); },
        },
      });
    }, 900);
    return undefined;
  }, [pending, ready, find, toast, haptic]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { announce };
}
