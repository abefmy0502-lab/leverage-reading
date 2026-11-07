// api/mcp.js の入口を偽の Supabase で動かして、認証・回数・応答の形を確かめる。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256Hex, TOKEN_PREFIX } from './_mcp.js';

const TOKEN = `${TOKEN_PREFIX}abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG`;
const ME = '11111111-1111-4111-8111-111111111111';
const rows = { mcp_tokens: [{ id: 't1', user_id: ME, token_hash: sha256Hex(TOKEN), revoked_at: null, last_used_at: null }], books: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const f = [];
      const q = {
        select() { return q; }, eq(c, v) { f.push((r) => String(r[c]) === String(v)); return q; }, or() { return q; }, order() { return q; }, limit() { return q; },
        update() { return q; },
        then(res, rej) { return Promise.resolve({ data: (rows[table] || []).filter((r) => f.every((fn) => fn(r))), error: null }).then(res, rej); },
      };
      return q;
    },
  }),
}));

function makeRes() {
  const res = { headers: {}, statusCode: 200, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return res;
}
const req = (over = {}) => ({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.9' }, query: {}, body: { jsonrpc: '2.0', id: 1, method: 'ping' }, ...over });

let handler;
beforeEach(async () => {
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  const mod = await import('./mcp.js');
  handler = mod.default;
  const rate = await import('./_ipRate.js');
  rate._resetIpRateForTests();
});

describe('api/mcp', () => {
  it('Bearer のキーで ping が返る・no-store', async () => {
    const res = makeRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('URL のキー（?key=）でも通る', async () => {
    const res = makeRes();
    await handler(req({ headers: { 'x-forwarded-for': '203.0.113.9' }, query: { key: TOKEN } }), res);
    expect(res.statusCode).toBe(200);
  });
  it('キーが無い・形が違う・取り消し → 401 と WWW-Authenticate', async () => {
    for (const h of [{}, { authorization: 'Bearer nope' }]) {
      const res = makeRes();
      await handler(req({ headers: { ...h, 'x-forwarded-for': '203.0.113.9' } }), res);
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Bearer');
    }
    rows.mcp_tokens[0].revoked_at = '2026-11-01T00:00:00Z';
    const res = makeRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(401);
    rows.mcp_tokens[0].revoked_at = null;
  });
  it('GET は 405・DELETE は 204・通知だけは 202・壊れた body は 400', async () => {
    let res = makeRes(); await handler(req({ method: 'GET' }), res); expect(res.statusCode).toBe(405);
    res = makeRes(); await handler(req({ method: 'DELETE' }), res); expect(res.statusCode).toBe(204);
    res = makeRes(); await handler(req({ body: { jsonrpc: '2.0', method: 'notifications/initialized' } }), res); expect(res.statusCode).toBe(202);
    res = makeRes(); await handler(req({ body: '{oops' }), res); expect(res.statusCode).toBe(400);
  });
  it('配列は配列で返る', async () => {
    const res = makeRes();
    await handler(req({ body: [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }] }), res);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[1].result.tools.length).toBeGreaterThan(0);
  });
});
