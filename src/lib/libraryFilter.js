// 📚 すべての本の絞り込みと並び（App.jsx の filtered・2026-10-11 にここへ出した＝テストで確かめる）。
//   状態・フォルダ・評価（★いくつ以上）・分野（tagFilter＝どれか 1 つ）・検索で絞り、sortBy で並べる。
//   分野やフォルダで絞ったまま「評価順」に並べられる（分野ごと・フォルダごとの評価の見方・2026-10-11 オーナー）。
//   hits: 検索で見つかった本（Map<id, { rank }>）。あるときは見つかった順（並び替えより言葉が合う本を先に）。

export function matchesLibraryFilters(b, { statusFilter = 'all', folderFilter = null, minRating = 0, tagFilter = [], hits = null } = {}) {
  if (statusFilter !== 'all' && b.status !== statusFilter) return false;
  if (folderFilter && !((b.collections || []).includes(folderFilter))) return false;
  if (minRating > 0 && (b.rating || 0) < minRating) return false;
  if (tagFilter.length > 0) {
    const bt = (b.tags || []).map((t) => (t || '').toLowerCase());
    if (!tagFilter.some((t) => bt.includes(String(t).toLowerCase()))) return false;
  }
  return !hits || hits.has(b.id);
}

export function sortLibraryBooks(list, sortBy = 'updated') {
  const titleKey = (b) => (b.title || '').toLowerCase();
  const created = (b) => b.created_at || b.startDate || '';
  const updated = (b) => b.updated_at || b.startDate || b.doneDate || '';
  const sorted = [...list];
  if (sortBy === 'title') {
    sorted.sort((a, b) => titleKey(a).localeCompare(titleKey(b), 'ja'));
  } else if (sortBy === 'rating') {
    // 評価の高い順（未評価＝0 は最後）・同じ評価は更新の新しい順
    sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || updated(b).localeCompare(updated(a)));
  } else if (sortBy === 'created') {
    sorted.sort((a, b) => created(b).localeCompare(created(a)));
  } else {
    sorted.sort((a, b) => updated(b).localeCompare(updated(a)));
  }
  return sorted;
}

export function filterLibraryBooks(books, { sortBy = 'updated', ...filters } = {}) {
  const list = (Array.isArray(books) ? books : []).filter((b) => matchesLibraryFilters(b, filters));
  if (filters.hits) return list.sort((a, b) => filters.hits.get(a.id).rank - filters.hits.get(b.id).rank);
  return sortLibraryBooks(list, sortBy);
}

// フォルダごとの冊数（名前順）。フォルダのチップの行・フォルダに入れるシートで使う。
export function folderCounts(books) {
  const counts = new Map();
  (Array.isArray(books) ? books : []).forEach((b) => (b.collections || []).forEach((c) => {
    const n = (c || '').trim();
    if (n) counts.set(n, (counts.get(n) || 0) + 1);
  }));
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja')).map(([name, count]) => ({ name, count }));
}
