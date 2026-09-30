// 📕 /api/cover のテスト（外部には出ない・fetch と楽天の https を差し替え）。
//   - ?health=1 は真偽と HTTP の番号だけ（鍵は出さない）
//   - CORS は全員に「*」（CDN のキャッシュが iOS アプリに CORS なしの応答を返さない）
//   - ISBN があれば鍵なしの取得元（openBD・NDL 書影・Amazon）で確かめ、候補を返す
//   - NDL の古い本（ISBN-10 だけ）も書名から ISBN が取れる

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

const rakutenCalls = [];
let rakutenReply = { status: 403, body: '{}' };
vi.mock('node:https', () => ({
  default: {
    request: (opts, cb) => {
      rakutenCalls.push(opts);
      const req = new EventEmitter();
      req.setTimeout = () => req;
      req.destroy = () => {};
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = rakutenReply.status;
        res.setEncoding = () => {};
        cb(res);
        res.emit('data', rakutenReply.body);
        res.emit('end');
      };
      return req;
    },
  },
}));

function jpeg(w, h, pad = 3000) {
  const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x03];
  const b = new Uint8Array(head.length + pad);
  b.set(head);
  return b;
}
const GIF_1X1 = (() => { const b = new Uint8Array(43); b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]); return b; })();

function resp({ status = 200, type = 'application/json', body = '', bytes = null }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
    text: async () => body,
    json: async () => JSON.parse(body || 'null'),
    arrayBuffer: async () => (bytes ? bytes.buffer.slice(0) : new TextEncoder().encode(body).buffer),
  };
}

// 取得元ごとの返事（URL で振り分け）。テストごとに上書きする。
let routes;
const fetched = [];
function fakeFetch(url) {
  fetched.push(String(url));
  for (const [re, make] of routes) {
    if (re.test(String(url))) return Promise.resolve(make(String(url)));
  }
  return Promise.resolve(resp({ status: 404 }));
}

function mockRes() {
  const headers = {};
  const res = {
    statusCode: 0,
    body: null,
    headers,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    removeHeader: (k) => { delete headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  return res;
}
let ipSeq = 0;
function req(query, headers = {}) {
  ipSeq += 1;
  return { method: 'GET', query, headers: { 'x-real-ip': `10.0.0.${ipSeq}`, ...headers } };
}

const NDL_ITEM = (title, ident) => `<item><title>${title}</title><dc:creator>安宅, 和人</dc:creator>${ident}</item>`;

async function loadHandler() {
  vi.resetModules();
  return (await import('./cover.js')).default;
}

beforeEach(() => {
  fetched.length = 0;
  rakutenCalls.length = 0;
  rakutenReply = { status: 403, body: '{}' };
  routes = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubEnv('RAKUTEN_APPLICATION_ID', '');
  vi.stubEnv('RAKUTEN_ACCESS_KEY', '');
  vi.stubEnv('RAKUTEN_APP_URL', '');
  vi.stubEnv('GOOGLE_BOOKS_API_KEY', '');
  vi.stubEnv('ALLOW_COVER_DEBUG', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('/api/cover?health=1', () => {
  it('設定は真偽・取得元は HTTP の番号と見つかったかだけ（鍵は出さない）', async () => {
    vi.stubEnv('RAKUTEN_APPLICATION_ID', 'SECRET-APP-ID-123');
    vi.stubEnv('RAKUTEN_ACCESS_KEY', 'pk_SECRETACCESSKEY');
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'AIzaSECRETGOOGLE');
    rakutenReply = { status: 403, body: '{"error":"forbidden"}' }; // RAKUTEN_APP_URL が無い → 403
    routes = [
      [/opensearch\?isbn=/, () => resp({ type: 'application/xml', body: `<rss>${NDL_ITEM('イシューからはじめよ 知的生産の「シンプルな本質」', '<dc:identifier xsi:type="dcndl:ISBN">978-4-86276-085-2</dc:identifier>')}</rss>` })],
      [/opensearch\?title=/, () => resp({ type: 'application/xml', body: `<rss>${NDL_ITEM('イシューからはじめよ', '<dc:identifier xsi:type="dcndl:ISBN">9784862760852</dc:identifier>')}</rss>` })],
      [/api\.openbd\.jp/, () => resp({ body: JSON.stringify([{ summary: { cover: 'https://cover.openbd.jp/9784862760852.jpg' } }]) })],
      [/googleapis\.com/, () => resp({ status: 429, body: '{}' })],
      [/ndlsearch\.ndl\.go\.jp\/thumbnail/, () => resp({ type: 'image/jpeg', bytes: jpeg(200, 290) })],
      [/cover\.openbd\.jp/, () => resp({ type: 'image/jpeg', bytes: jpeg(300, 430) })],
      [/images-na\.ssl-images-amazon/, () => resp({ type: 'image/gif', bytes: GIF_1X1 })],
      [/m\.media-amazon/, () => resp({ status: 403 })],
    ];
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ health: '1' }), res);
    expect(res.statusCode).toBe(200);
    const b = res.body;
    expect(b).toMatchObject({ rakutenConfigured: true, rakutenRefererSet: false, googleKeySet: true, isbn: '9784862760852' });
    expect(b.sources.rakuten).toEqual({ skipped: false, status: 403, found: false });
    expect(b.sources.ndlSearch).toEqual({ status: 200, found: true });
    expect(b.sources.ndlTitleToIsbn).toEqual({ status: 200, found: true });
    expect(b.sources.openbd).toEqual({ status: 200, found: true });
    expect(b.sources.google).toMatchObject({ status: 429, found: false });
    expect(b.sources.ndlThumb).toEqual({ status: 200, found: true });
    expect(b.sources.amazon).toEqual({ status: 200, found: false }); // 1×1 GIF
    expect(b.sources.amazonMedia).toEqual({ status: 403, found: false });
    const text = JSON.stringify(b);
    for (const secret of ['SECRET-APP-ID-123', 'pk_SECRETACCESSKEY', 'AIzaSECRETGOOGLE']) expect(text).not.toContain(secret);
    // 設定の値は真偽だけ
    for (const k of ['rakutenConfigured', 'rakutenRefererSet', 'googleKeySet']) expect(typeof b[k]).toBe('boolean');
    expect(res.headers['cache-control']).toContain('s-maxage=300');
  });

  it('楽天の鍵が無ければ skipped・結果は 5 分覚える（外部へ出直さない）', async () => {
    const handler = await loadHandler();
    const r1 = mockRes();
    await handler(req({ health: '1' }), r1);
    expect(r1.body.rakutenConfigured).toBe(false);
    expect(r1.body.sources.rakuten).toEqual({ skipped: true, status: 0, found: false });
    const n = fetched.length;
    const r2 = mockRes();
    await handler(req({ health: '1' }), r2);
    expect(fetched.length).toBe(n);
    expect(rakutenCalls).toHaveLength(0);
  });

  it('同じ IP からの連打はほかと同じく 429', async () => {
    const handler = await loadHandler();
    let last;
    for (let i = 0; i < 31; i += 1) {
      last = mockRes();
      // eslint-disable-next-line no-await-in-loop
      await handler({ method: 'GET', query: { health: '1' }, headers: { 'x-real-ip': '10.9.9.9' } }, last);
    }
    expect(last.statusCode).toBe(429);
  });
});

describe('/api/cover の CORS', () => {
  it('iOS アプリ（capacitor://localhost）にも Web にも「*」を返す（Vary: Origin で分けない）', async () => {
    routes = [[/api\.openbd\.jp/, () => resp({ body: '[null]' })]];
    const handler = await loadHandler();
    const native = mockRes();
    await handler(req({ isbn: '9784862760852' }, { origin: 'capacitor://localhost' }), native);
    expect(native.headers['access-control-allow-origin']).toBe('*');
    expect(native.headers.vary).toBeUndefined();
    const web = mockRes();
    await handler(req({ isbn: '9784862760852' }), web);
    expect(web.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('/api/cover の解決', () => {
  it('ISBN があれば openBD の API と鍵なしの画像で確かめ、候補の先頭に openBD を置く', async () => {
    routes = [
      [/api\.openbd\.jp/, () => resp({ body: JSON.stringify([{ summary: { cover: 'https://cover.openbd.jp/9784862760852.jpg' } }]) })],
      [/ndlsearch\.ndl\.go\.jp\/thumbnail/, () => resp({ status: 403 })], // データセンターの IP は弾かれる
      [/cover\.openbd\.jp/, () => resp({ type: 'image/jpeg', bytes: jpeg(300, 430) })],
    ];
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ isbn: '4862760856' }), res);
    expect(res.body.cover).toBe('https://cover.openbd.jp/9784862760852.jpg');
    expect(res.body.isbn).toBe('9784862760852'); // 13 桁にそろえる
    expect(res.body.candidates[0]).toBe('https://cover.openbd.jp/9784862760852.jpg');
    expect(res.body.candidates).toContain('https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg');
    expect(res.body.candidates).toContain('https://images-na.ssl-images-amazon.com/images/P/4862760856.09.LZZZZZZZ.jpg');
  });

  it('サーバーからは画像を確かめられなくても、ISBN と候補は返す（端末が確かめる）', async () => {
    routes = [[/api\.openbd\.jp/, () => resp({ status: 503 })]]; // ほかは全部 404
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ isbn: '9784862760852' }), res);
    expect(res.body.cover).toBe('');
    expect(res.body.isbn).toBe('9784862760852');
    expect(res.body.candidates.length).toBeGreaterThanOrEqual(5);
    expect(res.headers['cache-control']).toContain('s-maxage=604800');
  });

  it('書名だけ: NDL の古い本（ISBN-10 だけ）も 13 桁の ISBN と候補を返す', async () => {
    routes = [
      [/opensearch\?title=/, () => resp({ type: 'application/xml', body: `<rss>${NDL_ITEM('レバレッジ・リーディング', '<dc:identifier xsi:type="dcndl:ISBN">4-492-04269-5</dc:identifier>')}</rss>` })],
      [/googleapis\.com/, () => resp({ status: 429, body: '{}' })],
    ];
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ title: 'レバレッジ・リーディング', author: '本田直之' }), res);
    expect(res.body.isbn).toBe('9784492042694');
    expect(res.body.candidates[0]).toBe('https://ndlsearch.ndl.go.jp/thumbnail/9784492042694.jpg');
  });

  it('Google が 429 を返したら、その回の残りのクエリは投げない', async () => {
    routes = [[/googleapis\.com/, () => resp({ status: 429, body: '{}' })]];
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ title: '存在しない本の書名', author: '誰か' }), res);
    expect(res.body).toMatchObject({ cover: '', isbn: '', candidates: [] });
    expect(fetched.filter((u) => u.includes('googleapis.com'))).toHaveLength(1);
    expect(res.headers['cache-control']).toContain('s-maxage=60'); // 見つからない応答は長く残さない
  });
});
