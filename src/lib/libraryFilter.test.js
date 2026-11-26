import { describe, it, expect } from 'vitest';
import { filterLibraryBooks, folderCounts, sortLibraryBooks, statusMatches, matchesLibraryFilters, STATUS_ACTIVE, STATUS_ARCHIVED } from './libraryFilter';

const books = [
  { id: 'a', title: 'A', status: 'done', rating: 3, tags: ['考える力'], collections: ['課題図書'], updated_at: '2026-10-01' },
  { id: 'b', title: 'B', status: 'done', rating: 5, tags: ['考える力', '段取り・効率'], collections: [], updated_at: '2026-09-01' },
  { id: 'c', title: 'C', status: 'reading', rating: 0, tags: ['考える力'], collections: ['課題図書'], updated_at: '2026-10-05' },
  { id: 'd', title: 'D', status: 'done', rating: 4, tags: ['歴史'], collections: ['課題図書', '読み返す'], updated_at: '2026-08-01' },
  { id: 'e', title: 'E', status: 'done', rating: 1, tags: ['考える力'], collections: ['読み返す'], updated_at: '2026-10-09' },
];
const ids = (list) => list.map((b) => b.id);

describe('すべての本の絞り込みと並び', () => {
  it('分野で絞ったまま評価順（未評価は最後）', () => {
    expect(ids(filterLibraryBooks(books, { tagFilter: ['考える力'], sortBy: 'rating' }))).toEqual(['b', 'a', 'e', 'c']);
  });
  it('フォルダで絞ったまま評価順', () => {
    expect(ids(filterLibraryBooks(books, { folderFilter: '課題図書', sortBy: 'rating' }))).toEqual(['d', 'a', 'c']);
    expect(ids(filterLibraryBooks(books, { folderFilter: '読み返す', sortBy: 'rating' }))).toEqual(['d', 'e']);
  });
  it('分野とフォルダと状態を重ねて絞れる', () => {
    expect(ids(filterLibraryBooks(books, { tagFilter: ['考える力'], folderFilter: '課題図書', statusFilter: 'done', sortBy: 'rating' }))).toEqual(['a']);
  });
  it('同じ評価は更新の新しい順・既定は更新順', () => {
    const same = [{ id: 'x', rating: 4, updated_at: '2026-01-01' }, { id: 'y', rating: 4, updated_at: '2026-05-01' }];
    expect(ids(sortLibraryBooks(same, 'rating'))).toEqual(['y', 'x']);
    expect(ids(filterLibraryBooks(books))).toEqual(['e', 'c', 'a', 'b', 'd']);
  });
  it('検索中は見つかった順', () => {
    const hits = new Map([['d', { rank: 0 }], ['b', { rank: 1 }]]);
    expect(ids(filterLibraryBooks(books, { hits, sortBy: 'rating' }))).toEqual(['d', 'b']);
  });
  it('フォルダの冊数（名前順）', () => {
    expect(folderCounts(books)).toEqual([{ name: '課題図書', count: 3 }, { name: '読み返す', count: 2 }]);
  });
  it('積読・読書中（STATUS_ACTIVE）は 2 つの状態をまとめて絞る（記録の分野から・2026-11-26）', () => {
    expect(['want', 'before', 'reading', 'done'].filter((st) => statusMatches(st, STATUS_ACTIVE))).toEqual(['before', 'reading']);
    expect(statusMatches('done', 'done')).toBe(true);
    expect(statusMatches('want', 'all')).toBe(true);
    expect(matchesLibraryFilters({ status: 'reading', tags: ['考える力'] }, { statusFilter: STATUS_ACTIVE, tagFilter: ['考える力'] })).toBe(true);
    expect(matchesLibraryFilters({ status: 'done', tags: ['考える力'] }, { statusFilter: STATUS_ACTIVE, tagFilter: ['考える力'] })).toBe(false);
  });
  it('アーカイブした本はふだんの一覧に出さず、アーカイブのときだけ（2026-11-26）', () => {
    const b = { status: 'reading', archivedAt: '2026-11-26T00:00:00Z' };
    expect(matchesLibraryFilters(b, { statusFilter: 'all' })).toBe(false);
    expect(matchesLibraryFilters(b, { statusFilter: 'reading' })).toBe(false);
    expect(matchesLibraryFilters(b, { statusFilter: STATUS_ARCHIVED })).toBe(true);
    expect(matchesLibraryFilters({ status: 'reading' }, { statusFilter: STATUS_ARCHIVED })).toBe(false);
  });
});
