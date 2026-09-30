// 🔎 検索の一致の印（DESIGN §5「検索の一致の印」）: アクセントを面に 22% 混ぜた面＋太さ 600（色だけに頼らない）。
// --accent-soft は暗い画面でカードの面とほぼ同じで見えなかった（2026-09-30 ui-critic）。
// すべての本の検索のメモの一節（LibrarySearchHit）と、書名・著者・タグ（BookCards の SwipeableBookCard）で同じ印。
export const searchMarkStyle = {
  background: 'color-mix(in srgb, var(--accent) 22%, var(--surface))',
  color: 'var(--text)',
  fontWeight: 600,
  padding: 0,
  borderRadius: 0,
};
