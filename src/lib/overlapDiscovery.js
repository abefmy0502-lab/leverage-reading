// 💡 重なりの発見（2026-11-26 オーナー「新しいメモを保存したとき、ほかの本と強く重なったら、その場で『○○』と重なりましたと
//   知らせる」）。知識の地図を開きに行かなくても、保存したその場で重なりに出会える。
// 似ている度合いは lib/memoLinks.js（AI も通信も使わない）。つながるメモ（0.2 以上）のうち、同じ考えを書いた組が多い
//   0.3 以上だけを「強く重なった」とする（0.23〜0.48 が同じ考えの組＝memoLinks.js の注記）。
import { shortBookTitle } from './dialogueWorld';

export const STRONG_OVERLAP = 0.3;

/** 強く重なったつながり（いちばん似ている 1 件・無ければ null）。links は useMemoLinkFinder の find の結果。 */
export function strongOverlap(links, min = STRONG_OVERLAP) {
  const list = (Array.isArray(links) ? links : []).filter((l) => l && l.book && (l.score || 0) >= min && l.hit?.memoId != null);
  if (!list.length) return null;
  return [...list].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
}

/** 知らせの文「『○○』と重なりました」（副題は落とす）。 */
export function discoveryMessage(book) {
  const t = shortBookTitle(String(book?.title || '').trim()) || String(book?.title || '').trim();
  return `『${t}』と重なりました`;
}
