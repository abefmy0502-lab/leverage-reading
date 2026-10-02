// 🔎 サーバーの本の検索（api/_bookSearch.js・/api/cover?search=・2026-10-02）。外部には出ない。
import { describe, it, expect, vi } from 'vitest';
import {
  parseRakutenSearch, parseNdlSearch, rakutenPlan, searchBooksServer, fromGoogleVolume,
} from './_bookSearch.js';

// 楽天ブックス BooksBook/Search（title=考え方・sort=sales）の応答の見本（形は本物と同じ・抜粋）。
export const RAKUTEN_KANGAEKATA = {
  count: 2140,
  page: 1,
  hits: 4,
  Items: [
    { Item: {
      title: '人は話し方が9割', subTitle: '', titleKana: 'ヒトハハナシカタガキュウワリ', author: '永松茂久',
      publisherName: 'すばる舎', isbn: '9784799108642', salesDate: '2019年09月',
      largeImageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/8642/9784799108642.jpg?_ex=200x200',
      reviewCount: 800, size: '単行本',
    } },
    { Item: {
      title: '考え方', subTitle: '人生・仕事の結果が変わる', titleKana: 'カンガエカタ', author: '稲盛和夫', authorKana: 'イナモリ,カズオ',
      publisherName: '大和書房', isbn: '9784479795735', salesDate: '2017年04月',
      largeImageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/5735/9784479795735.jpg?_ex=200x200',
      mediumImageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/5735/9784479795735.jpg?_ex=120x120',
      reviewCount: 160, size: '単行本',
    } },
    { Item: {
      title: '頭のいい人が話す前に考えていること', titleKana: 'アタマノイイヒト', author: '安達裕哉',
      publisherName: 'ダイヤモンド社', isbn: '9784478117460', salesDate: '2023年04月',
      largeImageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/noimage_01.gif?_ex=200x200',
      reviewCount: 300,
    } },
    { Item: {
      title: 'アートディレクターの流儀', subTitle: '考え方・つくり方の極意', author: '某/ほか', publisherName: '誠文堂新光社',
      isbn: '9784416000000', salesDate: '2009年', largeImageUrl: '', reviewCount: 0,
    } },
  ],
};

const NDL_XML = `<?xml version="1.0"?><rss><channel>
<item><title>アートとしてのソフトウェア : 機能と表現の考え方</title><category>図書</category>
<dc:creator>Heckel, Paul</dc:creator><dc:creator>酒井, 邦秀, 1945-</dc:creator>
<dc:publisher>日経BP</dc:publisher><dc:date>1986</dc:date></item>
<item><title>考え方 : 人生・仕事の結果が変わる</title><category>図書</category>
<dc:creator>稲盛, 和夫, 1932-2022</dc:creator><dc:publisher>大和書房</dc:publisher><dc:date>2017.4</dc:date>
<dc:identifier xsi:type="dcndl:ISBN">978-4-479-79573-5</dc:identifier></item>
<item><title>考え方の記事</title><category>記事</category></item>
</channel></rss>`;

function resp(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  };
}
const ENV = { RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'pk_x', RAKUTEN_APP_URL: 'https://orime.vercel.app' };

describe('parseRakutenSearch（楽天の応答を読む）', () => {
  it('書名・副題・著者・出版社・発売日・ISBN・表紙（大きく）・売上順・レビュー', () => {
    const books = parseRakutenSearch(JSON.stringify(RAKUTEN_KANGAEKATA));
    const b = books.find((x) => x.isbn === '9784479795735');
    expect(b).toMatchObject({
      title: '考え方', subtitle: '人生・仕事の結果が変わる', author: '稲盛和夫', publisher: '大和書房',
      pubdate: '2017年04月', pubYear: '2017', salesRank: 1, reviewCount: 160, source: 'rakuten',
    });
    expect(b.cover).toBe('https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/5735/9784479795735.jpg?_ex=420x420');
  });
  it('noimage は表紙なし・連名は「、」', () => {
    const books = parseRakutenSearch(RAKUTEN_KANGAEKATA);
    expect(books.find((x) => x.isbn === '9784478117460').cover).toBe('');
    expect(books.find((x) => x.isbn === '9784416000000').author).toBe('某');
  });
  it('壊れた応答は空', () => {
    expect(parseRakutenSearch('not json')).toEqual([]);
    expect(parseRakutenSearch('{}')).toEqual([]);
  });
});

describe('parseNdlSearch（NDL の RSS を読む）', () => {
  it('記事を除き、著者を本の表記に・ISBN を 13 桁に', () => {
    const books = parseNdlSearch(NDL_XML);
    expect(books).toHaveLength(2);
    expect(books[0].author).toBe('Paul Heckel、酒井邦秀');
    expect(books[1]).toMatchObject({ title: '考え方', subtitle: '人生・仕事の結果が変わる', author: '稲盛和夫', isbn: '9784479795735', pubYear: '2017', source: 'ndl' });
  });
});

describe('fromGoogleVolume', () => {
  it('著者の配列・ISBN-13・https の表紙', () => {
    const b = fromGoogleVolume({
      title: '考え方', authors: ['稲盛和夫'], publishedDate: '2017-04-01',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9784479795735' }],
      imageLinks: { thumbnail: 'http://books.google.com/x' },
    }, 0);
    expect(b).toMatchObject({ author: '稲盛和夫', isbn: '9784479795735', cover: 'https://books.google.com/x', pubYear: '2017' });
  });
});

describe('rakutenPlan（楽天の引き方）', () => {
  it('語が 1 つ: 書名検索（売上順・30 件）→ キーワード検索', () => {
    const p = rakutenPlan('考え方');
    expect(p[0]).toMatchObject({ api: 'BooksBook/Search', params: { title: '考え方', sort: 'sales', hits: '30' } });
    expect(p[1]).toMatchObject({ api: 'BooksTotal/Search', params: { keyword: '考え方', booksGenreId: '001', sort: 'sales' } });
  });
  it('語が 2 つ以上: キーワード（AND）→ 少なければ長い語で書名検索', () => {
    const p = rakutenPlan('考え方 稲盛');
    expect(p[0]).toMatchObject({ api: 'BooksTotal/Search', params: { keyword: '考え方 稲盛' } });
    expect(p[1]).toMatchObject({ api: 'BooksBook/Search', params: { title: '考え方' }, onlyIfFew: true });
  });
});

describe('searchBooksServer', () => {
  it('楽天で関係する本が 5 冊以上あれば NDL は引かない', async () => {
    const many = { Items: Array.from({ length: 6 }, (_, i) => ({ Item: { title: `考え方の本${i}`, author: `著者${i}`, isbn: `978400000000${i}` } })) };
    const rakutenGetImpl = vi.fn(async () => ({ status: 200, body: JSON.stringify(many) }));
    const fetchImpl = vi.fn(async () => resp(200, '<rss></rss>'));
    const r = await searchBooksServer('考え方', { env: ENV, rakutenGetImpl, fetchImpl });
    expect(r.sources.ndl).toBe('skip');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.results).toHaveLength(6);
  });

  it('楽天があれば楽天（売上順）で探し、稲盛和夫『考え方』を 1 位に', async () => {
    const urls = [];
    const rakutenGetImpl = vi.fn(async (url, referer) => {
      urls.push(url);
      expect(referer).toBe('https://orime.vercel.app');
      return { status: 200, body: JSON.stringify(RAKUTEN_KANGAEKATA) };
    });
    const fetchImpl = vi.fn(async () => resp(200, '<rss></rss>'));
    const r = await searchBooksServer('考え方', { env: ENV, rakutenGetImpl, fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.results[0]).toMatchObject({ title: '考え方', author: '稲盛和夫', isbn: '9784479795735', sales: 2, review: 160 });
    expect(r.results[0].cover).toMatch(/^https:\/\/thumbnail\.image\.rakuten\.co\.jp\//);
    expect(urls[0]).toContain('BooksBook/Search');
    expect(urls[0]).toContain('sort=sales');
    expect(urls[0]).toContain('applicationId=app');
    // Google は鍵が無いので引かない。関係する本が 5 冊未満なので NDL は引く（見本は 2 冊）。
    expect(fetchImpl.mock.calls.map((c) => c[0]).some((u) => u.includes('googleapis'))).toBe(false);
    expect(fetchImpl.mock.calls.map((c) => c[0]).some((u) => u.includes('ndlsearch'))).toBe(true);
    // 2 回引いても同じ本は 1 冊
    expect(r.results.filter((b) => b.isbn === '9784479795735')).toHaveLength(1);
  });

  it('楽天の鍵が無ければ NDL（＋openBD の表紙）で探し、並べ替える', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('ndlsearch')) return resp(200, NDL_XML);
      if (url.includes('openbd')) return resp(200, [{ summary: { cover: 'https://cover.openbd.jp/9784479795735.jpg' } }]);
      return resp(404, '');
    });
    const r = await searchBooksServer('考え方', { env: {}, fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.sources).toEqual({ rakuten: 'off', google: 'off', ndl: 'ok' });
    expect(r.results[0]).toMatchObject({ author: '稲盛和夫', cover: 'https://cover.openbd.jp/9784479795735.jpg' });
  });

  it('すべて失敗したら ok: false（0 件と言い切らない）', async () => {
    const rakutenGetImpl = vi.fn(async () => ({ status: 429, body: '' }));
    const fetchImpl = vi.fn(async () => resp(503, ''));
    const r = await searchBooksServer('考え方', { env: { ...ENV, GOOGLE_BOOKS_API_KEY: 'k' }, rakutenGetImpl, fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.results).toEqual([]);
  });

  it('Google は鍵があるときだけ', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('googleapis')) {
        expect(url).toContain('key=k');
        return resp(200, { items: [{ volumeInfo: { title: '考え方', authors: ['稲盛和夫'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9784479795735' }] } }] });
      }
      return resp(200, '<rss></rss>');
    });
    const r = await searchBooksServer('考え方', { env: { GOOGLE_BOOKS_API_KEY: 'k' }, fetchImpl });
    expect(r.sources.google).toBe('ok');
    expect(r.results[0].title).toBe('考え方');
  });
});
