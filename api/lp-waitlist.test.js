// api/lp-waitlist.js: 公開のお知らせの登録（メールの形・同じメールは 1 行・回数制限・保存できないとき）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const upserts = [];
const rpcs = [];
let failWith = null;
let rpcResult = { data: true, error: null };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (name, args) => { rpcs.push({ name, args }); return rpcResult; },
    from: (table) => ({
      upsert: async (row, opts) => {
        if (failWith) return { error: failWith };
        upserts.push({ table, row, opts });
        return { error: null };
      },
    }),
  }),
}));

const { default: handler, normalizeEmail, resetRateLimit } = await import('./lp-waitlist.js');

function mockRes() {
  const res = {
    statusCode: 200, body: null, headers: {},
    status(c) { res.statusCode = c; return res; },
    json(b) { res.body = b; return res; },
    end() { return res; },
    setHeader(k, v) { res.headers[k] = v; },
  };
  return res;
}
const post = (body, ip = '1.2.3.4') => ({ method: 'POST', headers: { 'x-forwarded-for': ip }, body });

beforeEach(() => {
  upserts.length = 0;
  rpcs.length = 0;
  rpcResult = { data: true, error: null };
  failWith = null;
  resetRateLimit();
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('normalizeEmail（メールの形）', () => {
  it('前後の空白を外し、小文字にそろえる', () => {
    expect(normalizeEmail('  Taro.Yamada@Example.co.jp ')).toBe('taro.yamada@example.co.jp');
  });
  it('形の違うものは null', () => {
    ['', 'abc', 'a@b', 'a b@example.com', 'a@@example.com', '.a@example.com', 'a..b@example.com',
      'a@-example.com', 'a@example.c', `${'a'.repeat(65)}@example.com`, `a@${'b'.repeat(250)}.com`, null, 42]
      .forEach((v) => expect(normalizeEmail(v)).toBeNull());
  });
});

describe('handler', () => {
  it('受け付けて 1 行入れる（同じメールは 1 行＝onConflict email・2 回目は何もしない）', async () => {
    const res = mockRes();
    await handler(post({ email: 'Hanako@example.com', variant: 'photo', utm_source: 'x', utm_campaign: 'launch' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('lp_waitlist');
    expect(upserts[0].row).toEqual({ email: 'hanako@example.com', variant: 'photo', utm_source: 'x', utm_medium: null, utm_campaign: 'launch' });
    expect(upserts[0].opts).toEqual({ onConflict: 'email', ignoreDuplicates: true });
  });
  it('IP は保存しない・知らない値は落とす', async () => {
    const res = mockRes();
    await handler(post({ email: 'a@example.com', variant: 'evil', utm_source: 'x'.repeat(65), ip: '9.9.9.9' }), res);
    expect(upserts[0].row).toEqual({ email: 'a@example.com', variant: null, utm_source: null, utm_medium: null, utm_campaign: null });
  });
  it('文字列の本文（sendBeacon 等）も読む', async () => {
    const res = mockRes();
    await handler(post(JSON.stringify({ email: 'b@example.com' })), res);
    expect(res.statusCode).toBe(200);
    expect(upserts).toHaveLength(1);
  });
  it('メールの形が違えば 400・保存しない', async () => {
    const res = mockRes();
    await handler(post({ email: 'not-an-email' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_email');
    expect(upserts).toHaveLength(0);
  });
  it('見えない欄（website）に入っていたら、保存せずに受け付けたと返す', async () => {
    const res = mockRes();
    await handler(post({ email: 'bot@example.com', website: 'http://spam' }), res);
    expect(res.statusCode).toBe(200);
    expect(upserts).toHaveLength(0);
  });
  it('同じ IP から 1 分に 6 回目は 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = mockRes();
      await handler(post({ email: `u${i}@example.com` }, '5.5.5.5'), r);
      expect(r.statusCode).toBe(200);
    }
    const res = mockRes();
    await handler(post({ email: 'u6@example.com' }, '5.5.5.5'), res);
    expect(res.statusCode).toBe(429);
    // ほかの IP は通る
    const other = mockRes();
    await handler(post({ email: 'u7@example.com' }, '6.6.6.6'), other);
    expect(other.statusCode).toBe(200);
  });
  it('保存先の設定が無い・表が無いときは 503（受け付けたふりをしない）', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r1 = mockRes();
    await handler(post({ email: 'c@example.com' }), r1);
    expect(r1.statusCode).toBe(503);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    failWith = { code: '42P01', message: 'relation "public.lp_waitlist" does not exist' };
    const r2 = mockRes();
    await handler(post({ email: 'c@example.com' }), r2);
    expect(r2.statusCode).toBe(503);
    expect(r2.body).toEqual({ ok: false, error: 'unavailable' });
  });
  it('POST 以外は 405', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('1 日の回数（DB で数える・2026-10-11）', () => {
  it('IP そのものは渡さず、日付つきのハッシュと 1 日 5 回の上限を渡す', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }, body: { email: 'a@example.com' } }, res);
    expect(res.statusCode).toBe(200);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].name).toBe('take_lp_waitlist_slot');
    expect(rpcs[0].args.p_limit).toBe(5);
    expect(rpcs[0].args.p_ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(rpcs[0].args)).not.toContain('9.9.9.9');
    expect(rpcs[0].args.p_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('上限に届いていたら 429 で、保存しない', async () => {
    rpcResult = { data: false, error: null };
    const res = mockRes();
    await handler(post({ email: 'b@example.com' }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ ok: false, error: 'rate_limited' });
    expect(upserts).toHaveLength(0);
  });
  it('数える表が無いときは数えずに受け付ける', async () => {
    rpcResult = { data: null, error: { code: '42883', message: 'function does not exist' } };
    const res = mockRes();
    await handler(post({ email: 'c@example.com' }), res);
    expect(res.statusCode).toBe(200);
    expect(upserts).toHaveLength(1);
  });
});
