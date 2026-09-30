// 📖 AI 選書の実在の判定（api/_bookVerify.js と api/cover.js の ?verify=1）のテスト。
// 本番の実例（2026-09-30）: 読む順番に出た架空の本が「何かの検索結果に引っかかった」だけで実在扱いになっていた。
//   『BtoB営業を成功させるSPIN営業術』（本物は『大型商談を成約に導く「SPIN」営業術』）
//   『営業提案書とプレゼンの科学』
//   『営業force 最強の営業組織をつくる方法』
import { describe, it, expect, vi, afterEach } from 'vitest';
import { strongTitleMatch, authorMatches, findStrongMatch } from './_bookVerify.js';
import handler from './cover.js';

const SPIN_REAL = { title: '大型商談を成約に導く「SPIN」営業術', authors: ['ラッカム, ニール', '岩木, 貴子'], isbn: '9784862761934', src: 'ndl' };

describe('strongTitleMatch', () => {
  it('頭や一部が似ているだけの架空の書名は一致にしない', () => {
    expect(strongTitleMatch('BtoB営業を成功させるSPIN営業術', '大型商談を成約に導く「SPIN」営業術')).toBe(false);
    expect(strongTitleMatch('BtoB営業を成功させるSPIN営業術', 'SPIN営業術')).toBe(false);
    expect(strongTitleMatch('営業提案書とプレゼンの科学', 'プレゼンの科学')).toBe(false);
    expect(strongTitleMatch('営業提案書とプレゼンの科学', '営業')).toBe(false);
    expect(strongTitleMatch('営業force 最強の営業組織をつくる方法', '営業')).toBe(false);
    expect(strongTitleMatch('営業force 最強の営業組織をつくる方法', '営業力')).toBe(false);
    // 「副題なしの本物＋それらしい副題」は書名だけでは見分けられない（NDL は副題を書名に入れないことがある）ので、著者の一致で絞る（findStrongMatch）。
    expect(findStrongMatch([{ title: '営業force', authors: ['だれか'] }], '営業force 最強の営業組織をつくる方法', '山田太郎')).toBe(null);
    expect(strongTitleMatch('マンガ でわかる営業術', 'マンガ 7つの習慣')).toBe(false);
  });
  it('記号・空白・副題・版の頭の違いは同じ本とみなす', () => {
    expect(strongTitleMatch('大型商談を成約に導く SPIN 営業術', '大型商談を成約に導く「SPIN」営業術')).toBe(true);
    expect(strongTitleMatch('エッセンシャル思考', 'エッセンシャル思考 最少の時間で成果を最大にする')).toBe(true);
    expect(strongTitleMatch('7つの習慣 人格主義の回復', '完訳 7つの習慣 人格主義の回復')).toBe(true);
    expect(strongTitleMatch('嫌われる勇気―自己啓発の源流「アドラー」の教え', '嫌われる勇気 自己啓発の源流「アドラー」の教え')).toBe(true);
    expect(strongTitleMatch('ＳＰＩＮ営業術', 'SPIN営業術')).toBe(true);
  });
});

describe('authorMatches', () => {
  it('「姓, 名」の並び・中黒・連名・役割の違いは同じ人', () => {
    expect(authorMatches('ニール・ラッカム', ['ラッカム, ニール', '岩木, 貴子'])).toBe(true);
    expect(authorMatches('ニール・ラッカム', ['ニール・ラッカム/岩木貴子'])).toBe(true);
    expect(authorMatches('楠木建・杉浦泰', ['楠木 建 著'])).toBe(true);
    expect(authorMatches('', ['だれか'])).toBe(true);
  });
  it('別の人は一致にしない', () => {
    expect(authorMatches('山田太郎', ['ラッカム, ニール'])).toBe(false);
    expect(authorMatches('山田太郎', [])).toBe(false);
  });
});

describe('findStrongMatch（検索結果のモック）', () => {
  const results = [
    { title: 'SPIN営業術', authors: ['だれか'], isbn: '9780000000001', src: 'rakuten' },
    SPIN_REAL,
    { title: '営業', authors: ['だれか'], isbn: '9780000000002', src: 'ndl' },
    { title: 'プレゼンの科学', authors: ['だれか'], isbn: '9780000000003', src: 'google' },
  ];
  it('架空の書名は、検索結果が何件あっても一致しない', () => {
    expect(findStrongMatch(results, 'BtoB営業を成功させるSPIN営業術', 'ニール・ラッカム')).toBe(null);
    expect(findStrongMatch(results, '営業提案書とプレゼンの科学', '')).toBe(null);
    expect(findStrongMatch(results, '営業force 最強の営業組織をつくる方法', '')).toBe(null);
  });
  it('本物は書名と著者が一致した本を返す', () => {
    expect(findStrongMatch(results, '大型商談を成約に導く「SPIN」営業術', 'ニール・ラッカム')).toBe(SPIN_REAL);
  });
  it('書名が本物でも、著者が違えば一致にしない（実在の書名＋別の著者の捏造）', () => {
    expect(findStrongMatch(results, '大型商談を成約に導く「SPIN」営業術', '山田太郎')).toBe(null);
  });
  it('検索結果に著者が無いときは、書名がまるごと同じときだけ認める', () => {
    const noAuthor = [{ title: '大型商談を成約に導く「SPIN」営業術', authors: [], isbn: '1' }];
    expect(findStrongMatch(noAuthor, '大型商談を成約に導く SPIN営業術', 'ニール・ラッカム')).toEqual(noAuthor[0]);
    expect(findStrongMatch([{ title: 'エッセンシャル思考 最少の時間で', authors: [] }], 'エッセンシャル思考', 'グレッグ・マキューン')).toBe(null);
  });
});

// ── api/cover.js の ?verify=1（NDL・Google の応答をモック。楽天は鍵が無いので呼ばれない）──────────
const ndlItem = (title, creators, isbn) => `<item><title>${title}</title>${creators.map((c) => `<dc:creator>${c}</dc:creator>`).join('')}<dc:identifier xsi:type="dcndl:ISBN">${isbn}</dc:identifier></item>`;
const ndlXml = (items) => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;

let ipSeq = 0;
async function callCover(query, { ndl = 'ok', ndlItems = [], google = 429 } = {}) {
  // 楽天は鍵が無いときは呼ばれない（Node の https を直接使うので、ここでは鍵を外して外へ出ないようにする）。
  vi.stubEnv('RAKUTEN_APPLICATION_ID', '');
  vi.stubEnv('RAKUTEN_ACCESS_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('ndlsearch.ndl.go.jp/api/opensearch')) {
      if (ndl !== 'ok') return new Response('', { status: 503 });
      return new Response(ndlXml(ndlItems), { status: 200, headers: { 'content-type': 'application/xml' } });
    }
    if (u.includes('googleapis.com/books')) return new Response('{}', { status: google });
    return new Response('', { status: 404 });
  }));
  ipSeq += 1;
  const req = { method: 'GET', query, headers: { 'x-real-ip': `10.0.0.${ipSeq}` } };
  const out = { status: 0, body: null, headers: {} };
  const res = {
    setHeader(k, v) { out.headers[k] = v; },
    status(c) { out.status = c; return res; },
    json(b) { out.body = b; return res; },
    end() { return res; },
  };
  await handler(req, res);
  return out;
}

describe('api/cover.js ?verify=1', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const noise = [
    ndlItem('SPIN営業術', ['だれか'], '978-4-00-000000-1'),
    ndlItem('大型商談を成約に導く「SPIN」営業術', ['ラッカム, ニール', '岩木, 貴子'], '978-4-86276-193-4'),
    ndlItem('営業', ['だれか'], '978-4-00-000000-2'),
    ndlItem('プレゼンの科学', ['だれか'], '978-4-00-000000-3'),
  ];

  it('ゆるい照合で ISBN が取れる架空の書名でも verified=false（ISBN・表紙は返さない）', async () => {
    for (const [title, author] of [
      ['BtoB営業を成功させるSPIN営業術', 'ニール・ラッカム'],
      ['営業提案書とプレゼンの科学', '山田太郎'],
      ['営業force 最強の営業組織をつくる方法', ''],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const loose = await callCover({ title, author }, { ndlItems: noise });
      expect(loose.body.isbn).not.toBe(''); // 表紙探し（verify なし）は従来どおりゆるい＝ここが実在扱いの穴だった
      expect(loose.body).not.toHaveProperty('verified');
      // eslint-disable-next-line no-await-in-loop
      const v = await callCover({ title, author, verify: '1' }, { ndlItems: noise });
      expect(v.body.verified).toBe(false);
      expect(v.body.isbn).toBe('');
      expect(v.body.candidates).toEqual([]);
    }
  });

  it('本物は verified=true で、一致した本の ISBN を返す', async () => {
    const v = await callCover({ title: '大型商談を成約に導く「SPIN」営業術', author: 'ニール・ラッカム', verify: '1' }, { ndlItems: noise });
    expect(v.body.verified).toBe(true);
    expect(v.body.isbn).toBe('9784862761934');
    expect(v.body.match).toEqual({ title: '大型商談を成約に導く「SPIN」営業術', src: 'ndl' });
  });

  it('AI が付けた ISBN は、その ISBN の本の書名が一致しなければ信用しない', async () => {
    const v = await callCover({ title: 'BtoB営業を成功させるSPIN営業術', author: 'ニール・ラッカム', isbn: '9784862761934', verify: '1' }, { ndlItems: noise });
    expect(v.body.verified).toBe(false);
    expect(v.body.isbn).toBe('');
  });

  it('検索元がどれも答えなかったら verified=null（確かめられなかった・覚えない）', async () => {
    const v = await callCover({ title: 'BtoB営業を成功させるSPIN営業術', author: 'ニール・ラッカム', verify: '1' }, { ndl: 'down', google: 429 });
    expect(v.body.verified).toBe(null);
    expect(v.headers['Cache-Control']).toBe('no-store');
  });

  it('検索元が 0 件と答えたら verified=false', async () => {
    const v = await callCover({ title: '営業提案書とプレゼンの科学', verify: '1' }, { ndlItems: [] });
    expect(v.body.verified).toBe(false);
  });
});
