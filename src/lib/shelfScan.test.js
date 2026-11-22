import { describe, it, expect } from 'vitest';
import { parseShelfScan, matchShelfGuess, verifyShelfGuesses, defaultChecked, shelfImportBooks, SHELF_SCAN_MAX_BOOKS } from './shelfScan';

describe('本棚の写真の読み取り（2026-11-22）', () => {
  it('「書名 ／ 著者」を 1 冊ずつ・番号や記号を外す・同じ本は 1 回・「なし」は 0 冊', () => {
    const out = parseShelfScan('1. イシューからはじめよ ／ 安宅和人\n・『考え方』/ 稲盛和夫\n- 嫌われる勇気 ／\nイシューからはじめよ ／ 安宅和人\nx\n');
    expect(out).toEqual([
      { title: 'イシューからはじめよ', author: '安宅和人' },
      { title: '考え方', author: '稲盛和夫' },
      { title: '嫌われる勇気', author: '' },
    ]);
    expect(parseShelfScan('なし')).toEqual([]);
    expect(parseShelfScan(Array.from({ length: 60 }, (_, i) => `本の書名${i} ／ 著者`).join('\n'))).toHaveLength(SHELF_SCAN_MAX_BOOKS);
  });
  it('書名がはっきり一致すれば found（表紙・ISBN）・一部だけなら maybe・無ければ missing', () => {
    const results = [{ title: 'イシューからはじめよ 改訂版', author: '安宅和人', isbn: '9784862763290', cover: 'https://thumbnail.image.rakuten.co.jp/a.jpg' }];
    const f = matchShelfGuess({ title: 'イシューからはじめよ', author: '安宅和人' }, results);
    expect(f.status).toBe('found');
    expect(f.book.isbn).toBe('9784862763290');
    expect(matchShelfGuess({ title: 'イシューからはじめよ', author: '別の人' }, results).status).toBe('maybe');
    const m = matchShelfGuess({ title: '存在しない本の名前', author: '' }, results);
    expect(m.status).toBe('missing');
    expect(m.book.title).toBe('存在しない本の名前');
  });
  it('確かめる: 本棚にある本は owned・選んでおくのは見つかった新しい本だけ', async () => {
    const search = async (q) => ({ ok: true, results: q.startsWith('考え方') ? [{ title: '考え方', author: '稲盛和夫', isbn: '9784837927525' }] : [] });
    const items = await verifyShelfGuesses([{ title: '考え方', author: '稲盛和夫' }, { title: '謎の本', author: '' }], {
      search, isOwned: (b) => b.title === '考え方',
    });
    expect(items.map((x) => [x.status, x.owned])).toEqual([['found', true], ['missing', false]]);
    expect(items.map(defaultChecked)).toEqual([false, false]);
    const books = shelfImportBooks(items, new Set(['s0', 's1']), 'before');
    expect(books).toEqual([{ title: '謎の本', author: '', isbn: '', cover: '', pages: 0, status: 'before', memos: [] }]);
  });
});

describe('数字で始まる書名', () => {
  it('「7つの習慣」の 7 を番号として外さない', () => {
    expect(parseShelfScan('7つの習慣 ／ スティーブン・R・コヴィー\n2. 考え方 ／ 稲盛和夫')).toEqual([
      { title: '7つの習慣', author: 'スティーブン・R・コヴィー' },
      { title: '考え方', author: '稲盛和夫' },
    ]);
  });
});
