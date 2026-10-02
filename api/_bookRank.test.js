// 📚 本の検索の並べ方・著者名の整え方・重なりの除き方（api/_bookRank.js・2026-10-02）。
import { describe, it, expect } from 'vitest';
import {
  formatPersonName, formatAuthors, coreTitleOf, splitSubtitle, rankBooks, scoreBook, scoreParts, dedupeBooks, isRelated, yearOf, normText,
} from './_bookRank.js';

describe('formatPersonName / formatAuthors（著者名）', () => {
  it('NDL の「姓, 名, 生没年」を本の表記に', () => {
    expect(formatPersonName('稲盛, 和夫, 1932-2022')).toBe('稲盛和夫');
    expect(formatPersonName('酒井, 邦秀, 1945-')).toBe('酒井邦秀');
    expect(formatPersonName('外山, 滋比古, 1923-2020')).toBe('外山滋比古');
  });
  it('英語の名前は「名 姓」', () => {
    expect(formatPersonName('Heckel, Paul')).toBe('Paul Heckel');
    expect(formatPersonName('Drucker, Peter F. (Peter Ferdinand), 1909-2005')).toBe('Peter F. Drucker');
  });
  it('カタカナの名前は「名・姓」', () => {
    expect(formatPersonName('コヴィー, スティーブン・R.')).toBe('スティーブン・R.・コヴィー');
    expect(formatPersonName('ドラッカー, P.F.')).toBe('P.F.ドラッカー');
  });
  it('役割（著）・漢字の間の空白を落とす', () => {
    expect(formatPersonName('稲盛和夫 著')).toBe('稲盛和夫');
    expect(formatPersonName('稲盛 和夫')).toBe('稲盛和夫');
    expect(formatPersonName('稲盛和夫 [著]')).toBe('稲盛和夫');
    expect(formatPersonName('ハンス・ロスリング')).toBe('ハンス・ロスリング');
  });
  it('「, 」でつないだだけの NDL の並び（スクリーンショットの「Heckel, Paul, 酒井, 邦秀, 1945-」）を 1 人ずつ', () => {
    expect(formatAuthors('Heckel, Paul, 酒井, 邦秀, 1945-')).toBe('Paul Heckel、酒井邦秀');
    expect(formatAuthors('稲盛, 和夫, 1932-2022')).toBe('稲盛和夫');
  });
  it('配列・楽天の「/」区切り・同じ人は 1 回', () => {
    expect(formatAuthors(['稲盛, 和夫, 1932-2022', '稲盛和夫 著'])).toBe('稲盛和夫');
    expect(formatAuthors('楠木建/杉浦泰')).toBe('楠木建、杉浦泰');
    expect(formatAuthors('Paul Heckel, Kunihide Sakai')).toBe('Paul Heckel、Kunihide Sakai');
    expect(formatAuthors('')).toBe('');
  });
});

describe('splitSubtitle', () => {
  it('「：」「 : 」「 — 」で書名と副題に分ける', () => {
    expect(splitSubtitle('考え方 : 人生・仕事の結果が変わる')).toEqual({ title: '考え方', subtitle: '人生・仕事の結果が変わる' });
    expect(splitSubtitle('アートディレクターの流儀：考え方・つくり方')).toEqual({ title: 'アートディレクターの流儀', subtitle: '考え方・つくり方' });
    expect(splitSubtitle('Orime — 読書のメモ')).toEqual({ title: 'Orime', subtitle: '読書のメモ' });
  });
  it('区切りが無い・片方が空なら分けない', () => {
    expect(splitSubtitle('考え方')).toEqual({ title: '考え方', subtitle: '' });
    expect(splitSubtitle('：考え方')).toEqual({ title: '：考え方', subtitle: '' });
    expect(splitSubtitle('Re:Zero')).toEqual({ title: 'Re:Zero', subtitle: '' });
  });
});

describe('coreTitleOf / yearOf / normText', () => {
  it('副題・版の括弧を落とす', () => {
    expect(coreTitleOf('考え方 人生・仕事の結果が変わる')).toBe('考え方');
    expect(coreTitleOf('アートとしてのソフトウェア：機能と表現の考え方')).toBe('アートとしてのソフトウェア');
    expect(coreTitleOf('考え方（単行本）')).toBe('考え方');
    expect(coreTitleOf('The Lean Startup: How Today')).toBe('The Lean Startup');
  });
  it('年', () => {
    expect(yearOf('2017年04月')).toBe('2017');
    expect(yearOf('1986-10')).toBe('1986');
    expect(yearOf('')).toBe('');
  });
  it('ひらがなとカタカナをそろえる', () => {
    expect(normText('かんがえかた')).toBe(normText('カンガエカタ'));
  });
});

// オーナーのスクリーンショット（2026-10-02）の上位 5 冊＋目当ての本。
const SCREENSHOT = [
  { title: 'アートディレクターの流儀：考え方・つくり方の極意', author: 'Heckel, Paul, 酒井, 邦秀, 1945-', publisher: '誠文堂新光社', pubYear: '2009', isbn: '', source: 'ndl' },
  { title: 'アートとしてのソフトウェア：機能と表現の考え方', author: 'Paul Heckel、酒井邦秀', publisher: '日経BP', pubYear: '1986', isbn: '', source: 'ndl' },
  { title: 'アートは女を変える', author: '某', pubYear: '1994', isbn: '', source: 'ndl' },
  { title: 'ROI経営実践法', author: '某', pubYear: '1981', isbn: '', source: 'ndl' },
  { title: 'Rで学ぶマルチレベルモデル', author: '某', publisher: '朝倉書店', pubYear: '2018', isbn: '9784254128713', source: 'ndl' },
];
const INAMORI = {
  title: '考え方', subtitle: '人生・仕事の結果が変わる', author: '稲盛和夫', publisher: '大和書房', pubYear: '2017',
  isbn: '9784479795735', cover: 'https://thumbnail.image.rakuten.co.jp/x.jpg?_ex=420x420', salesRank: 6, reviewCount: 120, source: 'rakuten',
};

describe('rankBooks（並べ方）', () => {
  it('「考え方」で稲盛和夫『考え方』が 1 位（「アートディレクターの流儀：考え方…」より上）', () => {
    const r = rankBooks('考え方', [...SCREENSHOT, INAMORI]);
    expect(r[0].title).toBe('考え方');
    expect(r[0].author).toBe('稲盛和夫');
    expect(scoreBook('考え方', INAMORI)).toBeGreaterThan(scoreBook('考え方', SCREENSHOT[0]));
  });
  it('書名に語が無い本（ROI経営実践法）は、関係する本が 3 冊以上あれば外す', () => {
    const extra = [
      { title: '考え方の整理', author: 'A', isbn: '9784000000001', source: 'rakuten', salesRank: 1 },
      { title: '経営の考え方', author: 'B', isbn: '9784000000002', source: 'rakuten', salesRank: 2 },
    ];
    const r = rankBooks('考え方', [...SCREENSHOT, INAMORI, ...extra]);
    expect(r.map((b) => b.title)).not.toContain('ROI経営実践法');
    expect(r.map((b) => b.title)).not.toContain('アートは女を変える');
  });
  it('同じ書名なら売れている本・表紙のある本が上', () => {
    const other = { title: '考え方', author: '別の人', pubYear: '1965', isbn: '', source: 'ndl' };
    const r = rankBooks('考え方', [other, INAMORI]);
    expect(r[0]).toBe(INAMORI);
  });
  it('書名の頭が一致 > 途中にある > 副題だけ', () => {
    const prefix = { title: '考え方の教室', author: 'X', isbn: '9784000000003', source: 'rakuten' };
    const mid = { title: '仕事の考え方', author: 'Y', isbn: '9784000000004', source: 'rakuten' };
    const sub = { title: '流儀', subtitle: '考え方とつくり方', author: 'Z', isbn: '9784000000005', source: 'rakuten' };
    const r = rankBooks('考え方', [sub, mid, prefix]);
    expect(r.map((b) => b.title)).toEqual(['考え方の教室', '仕事の考え方', '流儀']);
  });
  it('「考え方 稲盛」「稲盛和夫 考え方」でも稲盛和夫『考え方』が 1 位', () => {
    const noise = [
      { title: '考え方', author: '別の人', isbn: '9784000000006', source: 'rakuten', salesRank: 0 },
      { title: '生き方', author: '稲盛和夫', isbn: '9784763195431', source: 'rakuten', salesRank: 1, reviewCount: 900 },
    ];
    expect(rankBooks('考え方 稲盛', [...noise, INAMORI])[0]).toBe(INAMORI);
    expect(rankBooks('稲盛和夫 考え方', [...noise, INAMORI])[0]).toBe(INAMORI);
  });
  it('著者名だけでもその人の本が上', () => {
    const r = rankBooks('稲盛和夫', [{ title: '何か', author: '別の人', isbn: '9784000000007', source: 'rakuten', salesRank: 0 }, INAMORI]);
    expect(r[0]).toBe(INAMORI);
  });
  it('一致の段は人気・ISBN・新しさで入れ替わらない（書名に語がある古い本 ＞ 副題だけの新しい本）', () => {
    const kaikei = { title: '会計の基本的な考え方', author: '見本八郎', publisher: '見本大学出版会', pubYear: '1990', isbn: '', source: 'ndl' };
    const rstat = { title: 'Rで学ぶマルチレベルモデル', subtitle: '統計の考え方', author: '見本六郎', publisher: '見本書店', pubYear: '2018', isbn: '9784000010050', cover: 'https://x/y.jpg', source: 'ndl' };
    const r = rankBooks('考え方', [rstat, kaikei]);
    expect(r.map((b) => b.title)).toEqual(['会計の基本的な考え方', 'Rで学ぶマルチレベルモデル']);
    expect(scoreParts('考え方', kaikei).match).toBeGreaterThan(scoreParts('考え方', rstat).match);
    // よく売れている本でも、書名の途中の一致は「まるごと同じ」書名より上に来ない
    const popular = { title: '仕事の考え方', author: 'A', isbn: '9784000000009', cover: 'https://x/z.jpg', salesRank: 0, reviewCount: 5000, pubYear: '2024', source: 'rakuten' };
    const plain = { title: '考え方', author: 'B', pubYear: '1965', isbn: '', source: 'ndl' };
    expect(rankBooks('考え方', [popular, plain])[0]).toBe(plain);
  });
  it('読み（カナ）でも当たる', () => {
    expect(isRelated('かんがえかた', { ...INAMORI, titleKana: 'カンガエカタ' })).toBe(true);
  });
});

describe('dedupeBooks（重なりを除く）', () => {
  it('ISBN が同じなら 1 冊（ISBN-10 も）。表紙ときれいな著者名を残す', () => {
    const ndl = { title: '考え方 : 人生・仕事の結果が変わる', author: '稲盛, 和夫, 1932-2022', isbn: '4479795731', source: 'ndl' };
    const out = dedupeBooks([ndl, INAMORI]);
    expect(out).toHaveLength(1);
    expect(out[0].cover).toBe(INAMORI.cover);
    expect(out[0].author).toBe('稲盛和夫');
    expect(out[0].isbn).toBe('9784479795735');
    expect(out[0].sources.sort()).toEqual(['ndl', 'rakuten']);
  });
  it('書名＋著者が同じで、片方に ISBN が無い／取得元が違うなら 1 冊', () => {
    const g = { title: '考え方', author: '稲盛和夫', isbn: '', source: 'google', cover: 'https://books.google.com/x' };
    const out = dedupeBooks([INAMORI, g]);
    expect(out).toHaveLength(1);
    expect(out[0].cover).toBe(INAMORI.cover); // 楽天の表紙を残す
  });
  it('同じ取得元で ISBN が違う（単行本と文庫）は両方残す', () => {
    const bunko = { ...INAMORI, isbn: '9784479000000', salesRank: 10 };
    expect(dedupeBooks([INAMORI, bunko])).toHaveLength(2);
  });
});
