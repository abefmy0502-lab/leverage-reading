// 🎯 やってみたこと（2026-10-21 オーナー「費用・粗利を想定して売上を最大化」・点検「やった結果が残らない」）。
//   振り返り › 記録で、完了した行動を「行動 → ふりかえり → 本」の形で新しい順に並べる（AI なし・数字・%・連続日数は出さない）。
//   ふりかえりを書いた行動を先に（同じなら完了の新しい順）。

const tsOf = (a) => {
  const t = Date.parse(a?.completedAt || a?.completed_at || '');
  return Number.isFinite(t) ? t : 0;
};

export const TRIED_SHOWN = 5;

export function triedActions(allActions = []) {
  return (Array.isArray(allActions) ? allActions : [])
    .filter((a) => a && a.done && String(a.text || '').trim())
    .map((a) => ({ ...a, reflection: String(a.reflection || '').trim(), at: tsOf(a) }))
    .sort((x, y) => (y.reflection ? 1 : 0) - (x.reflection ? 1 : 0) || y.at - x.at);
}
