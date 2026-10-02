// 🧪 お試しモードの本の検索（2026-10-02・開発専用）。
//
// - /api/cover?search=…（サーバーの本の検索）: 楽天の売上順を模した手元のカタログから、本番と同じ
//   並べ方（api/_bookRank.js）で返す。表紙は端末の中で作った絵（SVG の data: URL・外に出ない）。
// - NDL OpenSearch: 「考え方」のときだけ、本番の NDL と同じく **読みの順（辞書順）の先頭** を
//   NDL の書き方の著者名（「Heckel, Paul」「酒井, 邦秀, 1945-」）で返す（直す前の不具合の再現用）。
//   稲盛和夫『考え方』（カンガエカタ）は先頭 50 件より後ろなので入らない。

import { SEARCH_CATALOG } from './seed';
import { rankBooks, isRelated, formatAuthors } from '../../api/_bookRank.js';

// 表紙の絵（縦長 200×284・色の帯と書名）。本番の表紙の代わり。
const COVER_COLORS = ['#7a4b3a', '#2f4858', '#3d5a40', '#6b4f7a', '#8a6d2f', '#4a4a4a', '#9a3b3b', '#2d5d7b'];
export function demoCoverUrl(title, seed = 0) {
  const bg = COVER_COLORS[Math.abs(seed) % COVER_COLORS.length];
  const t = String(title || '').slice(0, 8).replace(/[<>&"']/g, '');
  const lines = [t.slice(0, 4), t.slice(4, 8)].filter(Boolean);
  const text = lines.map((l, i) => `<text x="100" y="${118 + i * 34}" font-size="30" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">${l}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="284" viewBox="0 0 200 284"><rect width="200" height="284" fill="${bg}"/><rect x="0" y="210" width="200" height="74" fill="rgba(255,255,255,0.14)"/>${text}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 楽天の売上順を模したカタログ（[書名, 副題, 著者, 出版社, 発売, ISBN, レビュー件数]）。
//   稲盛和夫『考え方』の ISBN は本物（大和書房 2017・9784479795735）。ほかは見本の本。
const RAKUTEN_LIKE = [
  ['考え方', '人生・仕事の結果が変わる', '稲盛和夫', '大和書房', '2017年04月', '9784479795735', 164],
  ['生き方', '人間として一番大切なこと', '稲盛和夫', 'サンマーク出版', '2004年08月', '9784763195431', 912],
  ['仕事の考え方', '一生役立つ 50 のルール', '見本 太郎', '見本書房', '2021年03月', '9784000010012', 38],
  ['考え方の教室', '', '見本 花子', '見本新書', '2015年05月', '9784000010029', 21],
  ['お金の考え方', '', '見本 次郎', '見本出版', '2022年11月', '9784000010036', 54],
  ['アートディレクターの流儀', '考え方・つくり方', '見本 三郎', '見本社', '2009年06月', '9784000010043', 2],
];

function catalog() {
  const fromRakuten = RAKUTEN_LIKE.map(([title, subtitle, author, publisher, pubdate, isbn, reviewCount], i) => ({
    title, subtitle, author, publisher, pubdate, pubYear: pubdate.slice(0, 4), isbn, reviewCount,
    cover: demoCoverUrl(title, i), salesRank: i, source: 'rakuten',
  }));
  const fromSeed = SEARCH_CATALOG.map(([title, author, isbn, publisher, year], i) => ({
    title, subtitle: '', author, publisher, pubdate: year, pubYear: year, isbn, reviewCount: 30,
    cover: demoCoverUrl(title, i + 3), salesRank: i + RAKUTEN_LIKE.length, source: 'rakuten',
  }));
  return [...fromRakuten, ...fromSeed];
}

// /api/cover?search= の答え（本番と同じ形 { results }）。
export function demoServerSearch(q) {
  const words = String(q || '').normalize('NFKC').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { results: [] };
  const hits = catalog().filter((b) => words.every((w) => isRelated(w, b)));
  const seen = new Set();
  const results = rankBooks(q, hits)
    .filter((b) => (seen.has(b.isbn) ? false : seen.add(b.isbn)))
    .map((b) => ({
      title: b.title, subtitle: b.subtitle, author: formatAuthors(b.author), publisher: b.publisher,
      pubdate: b.pubdate, pubYear: b.pubYear, isbn: b.isbn, cover: b.cover, pages: 0,
      sales: b.salesRank + 1, review: b.reviewCount, source: 'rakuten',
    }));
  return { results };
}

// NDL の「考え方」（読みの順の先頭・著者は NDL の書き方・表紙なし）。オーナーのスクリーンショット（2026-10-02）に合わせた見本。
const NDL_KANGAEKATA = [
  ['アートディレクターの流儀 : 考え方・つくり方の極意', ['見本, 三郎, 1960-'], '見本社', '2009', '9784000010043'],
  ['アートとしてのソフトウェア : 機能と表現の考え方', ['Heckel, Paul', '酒井, 邦秀, 1945-'], '日経マグロウヒル', '1986', ''],
  ['アートは女を変える : 女性の考え方', ['見本, 四郎'], '見本出版', '1994', ''],
  ['ROI経営実践法 : 投資効果の考え方', ['見本, 五郎, 1935-2010'], '見本経済社', '1981', ''],
  ['Rで学ぶマルチレベルモデル : 統計の考え方', ['見本, 六郎'], '見本書店', '2018', '9784000010050'],
  ['医療と看護の考え方', ['見本, 七子, 1950-'], '見本医学書院', '1979', ''],
  ['会計の基本的な考え方', ['見本, 八郎'], '見本大学出版会', '1990', ''],
  ['化学の考え方', ['見本, 九郎, 1922-1999'], '見本学会', '1972', ''],
];

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function demoNdlXml(url) {
  const m = String(url).match(/[?&](?:title|any)=([^&]*)/);
  const q = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  if (!q || !q.split(/\s+/).some((w) => w && '考え方'.includes(w) && w.length >= 2)) {
    return '<?xml version="1.0"?><rss><channel></channel></rss>';
  }
  const items = NDL_KANGAEKATA.map(([title, creators, publisher, year, isbn]) => [
    '<item>',
    `<title>${xmlEscape(title)}</title>`,
    '<category>図書</category>',
    ...creators.map((c) => `<dc:creator>${xmlEscape(c)}</dc:creator>`),
    `<dc:publisher>${xmlEscape(publisher)}</dc:publisher>`,
    `<dc:date>${year}</dc:date>`,
    isbn ? `<dc:identifier xsi:type="dcndl:ISBN">${isbn}</dc:identifier>` : '',
    '</item>',
  ].join('')).join('');
  return `<?xml version="1.0"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><channel>${items}</channel></rss>`;
}
