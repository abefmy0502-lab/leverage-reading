// 📖 「この本について」（api/_bookInfo.js）のテスト。外には出ない（fetch と楽天の呼び出しを差し替え）。
//   - openBD の ONIX から内容紹介（TextType 03 → 02）と目次（04）を取り出す
//   - 楽天の商品説明（「BOOK」データベースの形）を内容と目次に分け、著者情報は落とす
//   - Google の description の HTML を落とす（紹介文がほかに無いときだけ引く）
//   - 書名の違う本（誤った ISBN）の紹介は使わない・何も無ければ空

import { describe, it, expect, beforeEach } from 'vitest';
import {
  cleanText, clampDescription, parseToc, parseOpenbdRecord, parseRakutenCaption, parseGoogleVolume,
  sameBookTitle, fetchBookInfo, getBookInfoCached, bookInfoCacheKey, bookInfoResponse, _resetBookInfoCache,
  INFO_DESCRIPTION_MAX,
} from './_bookInfo.js';

// ─── 取得元の返事の見本（実際の形を短くしたもの）────────────────────────
const OPENBD_LIFESHIFT = [{
  onix: {
    RecordReference: '9784492533871',
    DescriptiveDetail: {
      Extent: [{ ExtentType: '11', ExtentValue: '400', ExtentUnit: '03' }],
    },
    CollateralDetail: {
      TextContent: [
        { TextType: '02', ContentAudience: '00', Text: '人生100年時代の生き方を考える。' },
        { TextType: '03', ContentAudience: '00', Text: '長寿化が進むと、<b>教育・仕事・引退</b>の3ステージの人生は成り立たなくなる。<br>お金だけでなく、スキルや健康、人間関係といった&quot;見えない資産&quot;をどう育てるか。&amp;新しい働き方を提案する。' },
        { TextType: '04', ContentAudience: '00', Text: '序章　100年ライフ\n第1章　長い生涯――長寿という贈り物\n第2章　過去の資金計画――教育・仕事・引退モデルの崩壊\n\n第3章　雇用の未来\n第3章　雇用の未来\n終章　変革への課題' },
      ],
    },
  },
  summary: { isbn: '9784492533871', title: 'LIFE SHIFT', author: 'リンダ・グラットン', pubdate: '20161021', cover: '' },
}];

const OPENBD_INLINE_TOC = [{
  onix: {
    CollateralDetail: {
      TextContent: [
        { TextType: '04', Text: 'はじめに 第1章 イシューからはじめる／第2章 仮説ドリブン／第3章 ストーリーラインを組み立てる／第4章 ストーリーを絵コンテにする／おわりに' },
      ],
    },
  },
  summary: { title: 'イシューからはじめよ', pubdate: '2010-11' },
}];

const RAKUTEN_CAPTION = '【内容情報】（「BOOK」データベースより）変化の時代を生き抜くための、シンプルな寓話。<br>二匹のネズミと二人の小人が、消えたチーズを探す。【目次】迷路の中で／チーズが消えた／新しいチーズを探す【著者情報】（「BOOK」データベースより）ジョンソン，スペンサー（Johnson, Spencer）医学博士。';

function resp({ status = 200, body = '' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body || 'null'),
    text: async () => body,
  };
}
function makeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    for (const [re, make] of routes) if (re.test(String(url))) return make(String(url));
    return resp({ status: 404 });
  };
  fn.calls = calls;
  return fn;
}
function makeRakuten(items, status = 200) {
  const calls = [];
  const fn = async (url, referer) => {
    calls.push({ url, referer });
    return { status, body: JSON.stringify({ Items: items.map((Item) => ({ Item })) }) };
  };
  fn.calls = calls;
  return fn;
}
const RK_ENV = { RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'pk_x', RAKUTEN_APP_URL: 'https://orime.vercel.app' };

beforeEach(() => _resetBookInfoCache());

describe('文を整える', () => {
  it('HTML を落とし、文字参照を戻し、空白をそろえる', () => {
    expect(cleanText('<p>一行目<br/>二行目&nbsp;&amp;</p>  <p>三　　行目</p>')).toBe('一行目\n二行目 &\n三 行目');
    expect(cleanText('&#12354;&#x3044;')).toBe('あい');
    expect(cleanText(null)).toBe('');
  });
  it('長い紹介文は文の終わりで切って … を付ける', () => {
    const long = `${'あ'.repeat(700)}。${'い'.repeat(300)}`;
    const c = clampDescription(long);
    expect(c.endsWith('。…')).toBe(true);
    expect([...c].length).toBeLessThanOrEqual(INFO_DESCRIPTION_MAX + 1);
    expect(clampDescription('短い。')).toBe('短い。');
  });
});

describe('目次（parseToc）', () => {
  it('改行で分け、空行・同じ行・行頭の記号を落とす', () => {
    expect(parseToc('目次\n・はじめに\n第1章 A\n第1章 A\n\n第2章 B')).toEqual(['はじめに', '第1章 A', '第2章 B']);
  });
  it('1 行に詰まった目次は「／」と「第N章」の前で割る', () => {
    const toc = parseToc(OPENBD_INLINE_TOC[0].onix.CollateralDetail.TextContent[0].Text);
    expect(toc).toEqual(['はじめに', '第1章 イシューからはじめる', '第2章 仮説ドリブン', '第3章 ストーリーラインを組み立てる', '第4章 ストーリーを絵コンテにする', 'おわりに']);
  });
  it('区切りの無い長い 1 行は目次とみなさない', () => {
    expect(parseToc('これは紹介文が間違って目次の欄に入っている例で、章の見出しのような区切りがまったくないまま長く続いていく文章です。とても長い。')).toEqual([]);
  });
  it('多すぎる行は 40 行まで・長い行は 80 字で切る', () => {
    const many = Array.from({ length: 60 }, (_, i) => `第${i + 1}章 項目`).join('\n');
    expect(parseToc(many)).toHaveLength(40);
    expect([...parseToc(`第1章 ${'長'.repeat(120)}\n第2章 短い`)[0]].length).toBe(80);
  });
});

describe('openBD の ONIX', () => {
  it('内容紹介（03）・目次（04）・ページ数・発売日', () => {
    const r = parseOpenbdRecord(OPENBD_LIFESHIFT[0]);
    expect(r.title).toBe('LIFE SHIFT');
    expect(r.description).toBe('長寿化が進むと、教育・仕事・引退の3ステージの人生は成り立たなくなる。\nお金だけでなく、スキルや健康、人間関係といった"見えない資産"をどう育てるか。&新しい働き方を提案する。');
    expect(r.toc).toEqual(['序章 100年ライフ', '第1章 長い生涯――長寿という贈り物', '第2章 過去の資金計画――教育・仕事・引退モデルの崩壊', '第3章 雇用の未来', '終章 変革への課題']);
    expect(r.pages).toBe(400);
    expect(r.pubdate).toBe('2016-10-21');
  });
  it('03 が無ければ 02（短い説明）・何も無い本は空', () => {
    const rec = { onix: { CollateralDetail: { TextContent: [{ TextType: '02', Text: '短い説明です。' }] } }, summary: { title: 'X' } };
    expect(parseOpenbdRecord(rec).description).toBe('短い説明です。');
    expect(parseOpenbdRecord(null)).toMatchObject({ description: '', toc: [] });
    expect(parseOpenbdRecord({ summary: { title: 'Y' } })).toMatchObject({ description: '', toc: [], pages: 0 });
  });
});

describe('楽天の商品説明', () => {
  it('【内容情報】と【目次】に分け、【著者情報】は落とす', () => {
    const r = parseRakutenCaption(RAKUTEN_CAPTION);
    expect(r.description).toBe('変化の時代を生き抜くための、シンプルな寓話。\n二匹のネズミと二人の小人が、消えたチーズを探す。');
    expect(r.toc).toEqual(['迷路の中で', 'チーズが消えた', '新しいチーズを探す']);
    expect(r.description).not.toContain('医学博士');
  });
  it('見出しの無い説明はそのまま紹介文に', () => {
    expect(parseRakutenCaption('ふつうの説明文です。')).toEqual({ description: 'ふつうの説明文です。', toc: [] });
    expect(parseRakutenCaption('')).toEqual({ description: '', toc: [] });
  });
});

describe('Google Books', () => {
  it('description の HTML を落とし、ページ数と発行日', () => {
    const r = parseGoogleVolume({ volumeInfo: { title: '本', subtitle: '副題', description: '<p>説明の<b>文</b>です。</p>', pageCount: 240, publishedDate: '2019-03' } });
    expect(r).toEqual({ title: '本 副題', description: '説明の文です。', pages: 240, pubdate: '2019-03' });
  });
});

describe('同じ本か（sameBookTitle）', () => {
  it('副題の有無・表記の揺れは同じ本、別の書名は別の本', () => {
    expect(sameBookTitle('LIFE SHIFT', 'LIFE SHIFT 100年時代の人生戦略')).toBe(true);
    expect(sameBookTitle('イシューからはじめよ', 'イシューからはじめよ 知的生産の「シンプルな本質」')).toBe(true);
    expect(sameBookTitle('チーズはどこへ消えた？', 'チーズはどこへ消えた?')).toBe(true);
    expect(sameBookTitle('イシューからはじめよ', 'バイエル ピアノ教則本')).toBe(false);
    expect(sameBookTitle('', 'なんでも')).toBe(true);
  });
});

describe('fetchBookInfo（取得元をまとめる）', () => {
  it('ISBN: openBD の紹介と目次を先に。紹介があれば Google は引かない', async () => {
    const fetchImpl = makeFetch([[/api\.openbd\.jp/, () => resp({ body: JSON.stringify(OPENBD_LIFESHIFT) })]]);
    const rakutenGet = makeRakuten([{ title: 'LIFE SHIFT', author: 'リンダ・グラットン', isbn: '9784492533871', itemCaption: '楽天の説明。', salesDate: '2016年10月21日' }]);
    const r = await fetchBookInfo({ isbn: '978-4-492-53387-1', title: 'LIFE SHIFT', author: 'リンダ・グラットン' }, { fetchImpl, rakutenGet, env: RK_ENV });
    expect(r.source).toBe('openbd');
    expect(r.tocSource).toBe('openbd');
    expect(r.description).toContain('見えない資産');
    expect(r.toc[0]).toBe('序章 100年ライフ');
    expect(r).toMatchObject({ pages: 400, pubdate: '2016-10-21', isbn: '9784492533871', answered: true });
    expect(fetchImpl.calls.some((u) => u.includes('googleapis'))).toBe(false);
    // 楽天は ISBN で引き、Referer を付ける
    expect(rakutenGet.calls[0].url).toContain('isbn=9784492533871');
    expect(rakutenGet.calls[0].referer).toBe('https://orime.vercel.app');
  });

  it('openBD に紹介が無ければ楽天の説明（目次も楽天から）', async () => {
    const fetchImpl = makeFetch([[/api\.openbd\.jp/, () => resp({ body: '[null]' })]]);
    const rakutenGet = makeRakuten([{ title: 'チーズはどこへ消えた?', author: 'スペンサー・ジョンソン', isbn: '9784594025551', itemCaption: RAKUTEN_CAPTION, salesDate: '2000年11月' }]);
    const r = await fetchBookInfo({ isbn: '9784594025551', title: 'チーズはどこへ消えた？' }, { fetchImpl, rakutenGet, env: RK_ENV });
    expect(r.source).toBe('rakuten');
    expect(r.tocSource).toBe('rakuten');
    expect(r.toc).toHaveLength(3);
    expect(r.pubdate).toBe('2000-11');
  });

  it('openBD にも楽天にも紹介が無ければ Google の description', async () => {
    const fetchImpl = makeFetch([
      [/api\.openbd\.jp/, () => resp({ body: '[null]' })],
      [/googleapis\.com/, () => resp({ body: JSON.stringify({ items: [{ volumeInfo: { title: 'Deep Work', description: '<p>Focus.</p>', pageCount: 300 } }] }) })],
    ]);
    const r = await fetchBookInfo({ isbn: '9781455586691', title: 'Deep Work' }, { fetchImpl, env: {} });
    expect(r).toMatchObject({ source: 'google', description: 'Focus.', pages: 300 });
  });

  it('書名の違う本（誤った ISBN）の紹介・目次は使わない＝何も出さない', async () => {
    const fetchImpl = makeFetch([
      [/api\.openbd\.jp/, () => resp({ body: JSON.stringify([{ ...OPENBD_LIFESHIFT[0], summary: { title: 'バイエル ピアノ教則本' } }]) })],
      [/googleapis\.com/, () => resp({ body: JSON.stringify({ items: [{ volumeInfo: { title: 'バイエル ピアノ教則本', description: 'ピアノの本' } }] }) })],
    ]);
    const r = await fetchBookInfo({ isbn: '9784492533871', title: '営業の教科書' }, { fetchImpl, env: {} });
    expect(r.description).toBe('');
    expect(r.toc).toEqual([]);
    expect(r.answered).toBe(true);
  });

  it('ISBN が無い本は楽天の書名検索で「書名がはっきり一致し著者も一致する本」だけ', async () => {
    const fetchImpl = makeFetch([[/api\.openbd\.jp/, () => resp({ body: JSON.stringify(OPENBD_LIFESHIFT) })]]);
    const rakutenGet = makeRakuten([
      { title: 'LIFE SHIFT2', author: '別の人', isbn: '9784000000001', itemCaption: '違う本。' },
      { title: 'LIFE SHIFT', subTitle: '100年時代の人生戦略', author: 'リンダ・グラットン/アンドリュー・スコット', isbn: '9784492533871', itemCaption: '楽天の説明。' },
    ]);
    const r = await fetchBookInfo({ title: 'LIFE SHIFT', author: 'リンダ・グラットン' }, { fetchImpl, rakutenGet, env: RK_ENV });
    expect(rakutenGet.calls[0].url).toContain('title=LIFE');
    expect(r.isbn).toBe('9784492533871');
    expect(r.source).toBe('openbd');
  });

  it('ISBN が無く、楽天に一致する本も無ければ空（作らない）', async () => {
    const fetchImpl = makeFetch([]);
    const rakutenGet = makeRakuten([{ title: '似ているけど別の本', author: 'だれか', isbn: '9784000000001', itemCaption: '説明' }]);
    const r = await fetchBookInfo({ title: '存在しない本', author: '架空の人' }, { fetchImpl, rakutenGet, env: RK_ENV });
    expect(r).toMatchObject({ description: '', toc: [], isbn: '' });
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('どこも答えない（通信の失敗）ときは answered: false＝控えに残さない', async () => {
    const fetchImpl = async () => { throw new Error('network'); };
    const r = await getBookInfoCached({ isbn: '9784492533871', title: 'LIFE SHIFT' }, { fetchImpl, env: {} });
    expect(r.answered).toBe(false);
    let n = 0;
    const ok = makeFetch([[/api\.openbd\.jp/, () => { n += 1; return resp({ body: JSON.stringify(OPENBD_LIFESHIFT) }); }]]);
    const r2 = await getBookInfoCached({ isbn: '9784492533871', title: 'LIFE SHIFT' }, { fetchImpl: ok, env: {} });
    expect(r2.source).toBe('openbd');
    await getBookInfoCached({ isbn: '9784492533871', title: 'LIFE SHIFT' }, { fetchImpl: ok, env: {} });
    expect(n).toBe(1); // 2 回目は控えから
  });

  it('紹介文が目次の文そのものなら紹介文は出さない', async () => {
    const rec = { onix: { CollateralDetail: { TextContent: [{ TextType: '03', Text: '第1章 A' }, { TextType: '04', Text: '第1章 A\n第2章 B' }] } }, summary: { title: 'X' } };
    const fetchImpl = makeFetch([[/api\.openbd\.jp/, () => resp({ body: JSON.stringify([rec]) })], [/googleapis/, () => resp({ body: '{}' })]]);
    const r = await fetchBookInfo({ isbn: '9784492533871', title: 'X' }, { fetchImpl, env: {} });
    expect(r.description).toBe('');
    expect(r.toc).toEqual(['第1章 A', '第2章 B']);
  });

  it('応答の形と控えの鍵', () => {
    expect(bookInfoResponse({ description: 'd', toc: ['a'], source: 'openbd', answered: true })).toEqual({ description: 'd', toc: ['a'], source: 'openbd', tocSource: '', pages: 0, pubdate: '', isbn: '' });
    expect(bookInfoCacheKey({ isbn: '4492533877', title: 'LIFE SHIFT' })).toBe(bookInfoCacheKey({ isbn: '9784492533871', title: 'LIFE SHIFT' }));
  });
});
