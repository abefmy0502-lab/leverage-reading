import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { splitAuthorNames, authorKey, newBooksFor, releaseLabel, isRecentBook, authorsToCheck, homeNewBook } from './favoriteAuthors';

const now = new Date('2026-11-25T09:00:00+09:00');
const fav = { key: authorKey('稲盛和夫'), name: '稲盛和夫', createdAt: '2026-10-01T00:00:00Z', dismissed: [] };
const b = (isbn, release, extra = {}) => ({ title: `本${isbn.slice(-2)}`, isbn, release, pubdate: release.replace(/-(\d+)-(\d+)$/, '年$1月$2日').replace(/^(\d+)/, '$1'), ...extra });

describe('お気に入りの著者（2026-11-25）', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.window = {
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
      dispatchEvent: () => true,
    };
  });
  afterEach(() => { delete globalThis.window; });

  it('著者の欄から人の名前だけ', () => {
    expect(splitAuthorNames('稲盛和夫')).toEqual(['稲盛和夫']);
    expect(splitAuthorNames('楠木建、杉浦泰')).toEqual(['楠木建', '杉浦泰']);
    expect(splitAuthorNames('スティーブン・R・コヴィー 著 / フランクリン・コヴィー・ジャパン 訳')).toEqual(['スティーブン・R・コヴィー', 'フランクリン・コヴィー・ジャパン']);
    expect(splitAuthorNames('岸見一郎 ほか')).toEqual(['岸見一郎']);
    expect(splitAuthorNames('')).toEqual([]);
  });
  it('お気に入りに入れた日より後の本だけ・前の版がある作品と閉じた本と本棚の本は除く', () => {
    const books = [
      b('9784000000001', '2026-12-18'),
      b('9784000000002', '2026-11-10'),
      b('9784000000003', '2026-09-01'),
      b('9784000000004', '2026-11-12', { reissue: true }),
      b('9784000000005', '2026-11-20'),
      b('9784000000006', '2026-11-15'),
    ];
    const list = newBooksFor({ ...fav, dismissed: ['9784000000005'] }, books, { now, isOwned: (x) => x.isbn === '9784000000006' });
    expect(list.map((x) => x.isbn)).toEqual(['9784000000001', '9784000000002']);
  });
  it('発売前は「発売予定」', () => {
    expect(releaseLabel({ release: '2026-12-20', pubdate: '2026年12月中旬頃' }, now)).toBe('2026年12月中旬 発売予定');
    expect(releaseLabel({ release: '2026-11-18', pubdate: '2026年11月18日' }, now)).toBe('2026年11月18日 発売');
    expect(releaseLabel({ release: '2022-03-05', pubdate: '2022年03月05日' }, now)).toBe('2022年3月5日 発売');
    expect(isRecentBook({ release: '2026-10-01' }, now)).toBe(true);
    expect(isRecentBook({ release: '2025-01-01' }, now)).toBe(false);
  });
  it('書店に聞き直すのは、覚えてから 1 日たった著者だけ', () => {
    window.localStorage.setItem('orime.authorBooks.v1', JSON.stringify({ [fav.key]: { at: Date.now(), books: [b('9784000000001', '2026-12-18')] } }));
    const other = { key: authorKey('岸見一郎'), name: '岸見一郎' };
    expect(authorsToCheck([fav, other]).map((f) => f.name)).toEqual(['岸見一郎']);
    const home = homeNewBook([fav, other], { now });
    expect(home.fav.name).toBe('稲盛和夫');
    expect(home.book.isbn).toBe('9784000000001');
    expect(home.more).toBe(0);
  });
});
