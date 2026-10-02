// 📖 /api/cover?info=1（この本について）のテスト。外には出ない（fetch と楽天の https を差し替え）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

let rakutenReply = { status: 403, body: '{}' };
const rakutenCalls = [];
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

function resp({ status = 200, body = '' }) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => JSON.parse(body || 'null'), text: async () => body };
}
let routes = [];
function fakeFetch(url) {
  for (const [re, make] of routes) if (re.test(String(url))) return Promise.resolve(make(String(url)));
  return Promise.resolve(resp({ status: 404 }));
}
function mockRes() {
  const headers = {};
  return {
    statusCode: 0, body: null, headers,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    removeHeader: (k) => { delete headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}
let ip = 0;
const req = (query) => { ip += 1; return { method: 'GET', query, headers: { 'x-real-ip': `10.9.0.${ip}` } }; };
async function loadHandler() {
  vi.resetModules();
  return (await import('./cover.js')).default;
}

beforeEach(() => {
  routes = [];
  rakutenCalls.length = 0;
  rakutenReply = { status: 403, body: '{}' };
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubEnv('RAKUTEN_APPLICATION_ID', '');
  vi.stubEnv('RAKUTEN_ACCESS_KEY', '');
  vi.stubEnv('RAKUTEN_APP_URL', '');
  vi.stubEnv('GOOGLE_BOOKS_API_KEY', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('/api/cover?info=1', () => {
  it('openBD の紹介と目次を返す（表紙は探さない）・見つかれば長く覚える', async () => {
    routes = [[/api\.openbd\.jp/, () => resp({ body: JSON.stringify([{ onix: { CollateralDetail: { TextContent: [{ TextType: '03', Text: '紹介文です。' }, { TextType: '04', Text: '第1章 A\n第2章 B' }] } }, summary: { title: 'LIFE SHIFT', pubdate: '20161021' } }]) })]];
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ info: '1', isbn: '9784492533871', title: 'LIFE SHIFT' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ description: '紹介文です。', toc: ['第1章 A', '第2章 B'], source: 'openbd', tocSource: 'openbd', pages: 0, pubdate: '2016-10-21', isbn: '9784492533871' });
    expect(res.headers['cache-control']).toContain('s-maxage=604800');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.body).not.toHaveProperty('cover');
  });

  it('楽天は鍵と Referer つきの https で（api/cover.js の rakutenGet を使う）', async () => {
    vi.stubEnv('RAKUTEN_APPLICATION_ID', 'app');
    vi.stubEnv('RAKUTEN_ACCESS_KEY', 'pk_x');
    vi.stubEnv('RAKUTEN_APP_URL', 'https://orime.vercel.app');
    rakutenReply = { status: 200, body: JSON.stringify({ Items: [{ Item: { title: 'チーズはどこへ消えた?', isbn: '9784594025551', itemCaption: '【内容情報】寓話です。【目次】迷路／チーズ' } }] }) };
    routes = [[/api\.openbd\.jp/, () => resp({ body: '[null]' })]];
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ info: '1', isbn: '9784594025551', title: 'チーズはどこへ消えた？' }), res);
    expect(res.body).toMatchObject({ description: '寓話です。', toc: ['迷路', 'チーズ'], source: 'rakuten' });
    expect(rakutenCalls[0].headers.Referer).toBe('https://orime.vercel.app');
    expect(rakutenCalls[0].path).toContain('BooksBook/Search');
  });

  it('何も見つからなければ空（短く覚える）・どこも答えなければ覚えない', async () => {
    routes = [[/api\.openbd\.jp/, () => resp({ body: '[null]' })], [/googleapis/, () => resp({ body: '{}' })]];
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ info: '1', isbn: '9784000000001', title: '無い本' }), res);
    expect(res.body).toMatchObject({ description: '', toc: [], source: '' });
    expect(res.headers['cache-control']).toContain('s-maxage=600');

    routes = [];
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))));
    const res2 = mockRes();
    await handler(req({ info: '1', isbn: '9784000000002', title: '通信できない本' }), res2);
    expect(res2.body).toMatchObject({ description: '', toc: [] });
    expect(res2.headers['cache-control']).toBe('no-store');
  });

  it('書名も ISBN も無ければ 400', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(req({ info: '1' }), res);
    expect(res.statusCode).toBe(400);
  });
});
