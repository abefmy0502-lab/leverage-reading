// 🔎 端末の本の検索（src/lib/bookSearch.js・BookSearchModal の searchBooksByQuery・2026-10-02）。
//   - 書名・著者はまずサーバーの検索（/api/cover?search=）
//   - サーバーが失敗したときだけ端末の検索（NDL → Google）に切り替え、同じ並べ方で並べ・著者名を整える
//   - 通信の失敗は端末に覚えない（7 日の「0 件」にしない）
//   - ISBN はサーバーの検索を通らず、その本だけ
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchBooks, searchBooksOnServer, rankLocalResults, clearBookSearchCache } from './bookSearch';
import { searchBooksByQuery, narrowHintFor } from '../components/BookSearchModal';

function resp(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const SERVER_RESULTS = [
  { title: '考え方', subtitle: '人生・仕事の結果が変わる', author: '稲盛和夫', publisher: '大和書房', pubYear: '2017', isbn: '9784479795735', cover: 'https://thumbnail.image.rakuten.co.jp/x.jpg?_ex=420x420', sales: 7, review: 160, source: 'rakuten' },
  { title: '仕事の考え方', author: '見本太郎', isbn: '9784000010012', cover: 'javascript:alert(1)', source: 'rakuten' },
];

let routes;
const calls = [];
function fakeFetch(url) {
  calls.push(String(url));
  for (const [re, make] of routes) if (re.test(String(url))) return Promise.resolve(make(String(url)));
  return Promise.reject(new TypeError('Failed to fetch'));
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

beforeEach(() => {
  calls.length = 0;
  routes = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('localStorage', memoryStorage());
  clearBookSearchCache();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('searchBooksOnServer', () => {
  it('/api/cover?search= の結果を受け取り、https でない表紙は捨てる', async () => {
    routes = [[/\/api\/cover\?search=/, () => resp(200, { results: SERVER_RESULTS })]];
    const r = await searchBooksOnServer('考え方');
    expect(r.ok).toBe(true);
    expect(calls[0]).toBe(`/api/cover?search=${encodeURIComponent('考え方')}`);
    expect(r.results[0]).toMatchObject({ title: '考え方', subtitle: '人生・仕事の結果が変わる', author: '稲盛和夫', isbn: '9784479795735' });
    expect(r.results[1].cover).toBe('');
  });
  it('502・通信の失敗は ok: false（例外にしない）', async () => {
    routes = [[/\/api\/cover/, () => resp(502, { error: 'unavailable' })]];
    expect((await searchBooksOnServer('考え方')).ok).toBe(false);
    routes = [];
    expect((await searchBooksOnServer('考え方')).ok).toBe(false);
  });
});

describe('searchBooks（初日クイックスタート・AI 選書の追加など）', () => {
  it('サーバーが答えたら端末の NDL・Google は引かない', async () => {
    routes = [[/\/api\/cover\?search=/, () => resp(200, { results: SERVER_RESULTS })]];
    const r = await searchBooks('考え方');
    expect(r.ok).toBe(true);
    expect(r.results[0].author).toBe('稲盛和夫');
    expect(calls.some((u) => u.includes('ndlsearch') || u.includes('googleapis'))).toBe(false);
  });

  it('サーバーが失敗したら端末の検索に切り替え、同じ並べ方・著者名を整える', async () => {
    routes = [
      [/\/api\/cover/, () => resp(502, {})],
      [/ndlsearch/, () => resp(503, '')],
      [/googleapis/, () => resp(200, { items: [
        { volumeInfo: { title: 'アートとしてのソフトウェア', subtitle: '機能と表現の考え方', authors: ['Heckel, Paul'], publishedDate: '1986' } },
        { volumeInfo: { title: '考え方', authors: ['稲盛, 和夫, 1932-2022'], publishedDate: '2017-04', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9784479795735' }], imageLinks: { thumbnail: 'http://books.google.com/x' } } },
      ] })],
    ];
    const r = await searchBooks('考え方');
    expect(r.ok).toBe(true);
    expect(r.results[0]).toMatchObject({ title: '考え方', author: '稲盛和夫', cover: 'https://books.google.com/x' });
    expect(r.results[1].author).toBe('Paul Heckel');
  });

  it('通信の失敗は覚えない（直ったらすぐ見つかる）', async () => {
    routes = [[/\/api\/cover/, () => resp(502, {})], [/ndlsearch/, () => resp(503, '')], [/googleapis/, () => resp(503, {})]];
    const bad = await searchBooks('考え方');
    expect(bad.ok).toBe(false);
    expect([...localStorage._map.keys()].filter((k) => k.startsWith('bookSearchCache'))).toHaveLength(0);
    routes = [[/\/api\/cover\?search=/, () => resp(200, { results: SERVER_RESULTS })]];
    const good = await searchBooks('考え方');
    expect(good.results[0].title).toBe('考え方');
  });
});

describe('searchBooksByQuery（本を追加の検索欄）', () => {
  it('書名・著者はサーバーの検索（「考え方 稲盛」「稲盛和夫 考え方」も 1 回で）', async () => {
    routes = [[/\/api\/cover\?search=/, () => resp(200, { results: SERVER_RESULTS.slice(0, 1) })]];
    for (const q of ['考え方', '考え方 稲盛', '稲盛和夫　考え方']) {
      calls.length = 0;
      // eslint-disable-next-line no-await-in-loop
      const r = await searchBooksByQuery(q);
      expect(r.results[0].title).toBe('考え方');
      expect(calls).toHaveLength(1);
    }
    expect(calls[0]).toContain(encodeURIComponent('稲盛和夫 考え方')); // 全角の空白も半角 1 つに
  });
  it('ISBN はサーバーの検索を通らず、その本だけ（openBD）', async () => {
    routes = [[/api\.openbd\.jp/, () => resp(200, [{ summary: { title: '考え方', author: '稲盛和夫／著', publisher: '大和書房', cover: '' } }])]];
    const r = await searchBooksByQuery('978-4-479-79573-5');
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ title: '考え方', author: '稲盛和夫', isbn: '9784479795735' });
    expect(calls.some((u) => u.includes('/api/cover'))).toBe(false);
  });
  it('サーバーが失敗したら端末の検索（Google）に切り替えて並べ直す', async () => {
    routes = [
      [/\/api\/cover/, () => resp(502, {})],
      [/googleapis/, () => resp(200, { items: [
        { volumeInfo: { title: 'ROI経営実践法', authors: ['某'], publishedDate: '1981' } },
        { volumeInfo: { title: '仕事の考え方', authors: ['A'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9784000010012' }] } },
        { volumeInfo: { title: '考え方', authors: ['稲盛和夫'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9784479795735' }] } },
      ] })],
    ];
    const r = await searchBooksByQuery('考え方');
    expect(r.ok).toBe(true);
    expect(r.results[0].title).toBe('考え方');
  });
});

describe('rankLocalResults / narrowHintFor', () => {
  it('NDL の著者名を整えて並べる', () => {
    const r = rankLocalResults('考え方', [
      { title: 'アートディレクターの流儀 : 考え方・つくり方の極意', author: 'Heckel, Paul, 酒井, 邦秀, 1945-', source: 'ndl' },
      { title: '考え方 : 人生・仕事の結果が変わる', author: '稲盛, 和夫, 1932-2022', isbn: '9784479795735', source: 'ndl' },
    ]);
    expect(r[0].author).toBe('稲盛和夫');
    expect(r[1].author).toBe('Paul Heckel、酒井邦秀');
  });
  it('語が 1 つで 10 冊以上のときだけ「著者名も入れると絞り込めます」', () => {
    expect(narrowHintFor('考え方', 30)).toBe('著者名も入れると絞り込めます');
    expect(narrowHintFor('考え方', 5)).toBe('');
    expect(narrowHintFor('考え方 稲盛', 30)).toBe('');
    expect(narrowHintFor('9784479795735', 30)).toBe('');
  });
});
