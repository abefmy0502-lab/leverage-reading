// api/stripe-webhook.js: Web（Stripe）で払っている人の行に、前の App Store の無料期間（period_type='trial'）を残さない。
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const UID = '11111111-1111-4111-8111-111111111111';
const upserts = [];
let failOn = null; // この列名を含む upsert を「列が無い」で失敗させる
let nextEvent = null;
const inserts = [];
let missingEvents = false; // subscription_events が無い DB
const sub = {
  id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { user_id: UID },
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, items: { data: [{ price: { id: 'price_m' } }] },
};

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.webhooks = { constructEvent: () => nextEvent };
      this.subscriptions = { retrieve: async () => sub };
    }
  },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select() { return q; }, eq() { return q; },
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async (row) => {
          if (table === 'subscription_events' && missingEvents) {
            return { error: { code: '42P01', message: 'relation "public.subscription_events" does not exist' } };
          }
          inserts.push({ table, row });
          return { error: null };
        },
        delete() { return q; },
        upsert: async (row) => {
          if (failOn && failOn in row) return { error: { message: `column "${failOn}" of relation "subscriptions" does not exist` } };
          upserts.push(row);
          return { error: null };
        },
      };
      return q;
    },
  }),
}));

function req() {
  const r = new EventEmitter();
  r.method = 'POST';
  r.headers = { 'stripe-signature': 's' };
  setTimeout(() => { r.emit('data', Buffer.from('{}')); r.emit('end'); }, 0);
  return r;
}
function mockRes() {
  const res = { statusCode: 200, status(c) { res.statusCode = c; return res; }, json() { return res; } };
  return res;
}

let handler;
beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk';
  process.env.STRIPE_WEBHOOK_SECRET = 'wh';
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  ({ default: handler } = await import('./stripe-webhook.js'));
});
beforeEach(() => { upserts.length = 0; inserts.length = 0; missingEvents = false; failOn = null;nextEvent = { id: `evt_${Math.random()}`, type: 'customer.subscription.updated', data: { object: sub } }; });

describe('Stripe の購読 → period_type', () => {
  it('active は有料（normal）として書く（前の無料期間の trial を上書きする）', async () => {
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(upserts[0].period_type).toBe('normal');
    expect(upserts[0].status).toBe('active');
  });
  it('period_type 列が無い DB でも止まらない（列を抜いて書き直す）', async () => {
    failOn = 'period_type';
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(upserts).toHaveLength(1);
    expect('period_type' in upserts[0]).toBe(false);
  });
});

describe('契約の履歴（subscription_events）', () => {
  it('trialing → active の出来事を 1 件ずつ残す', async () => {
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    const ev = inserts.find((o) => o.table === 'subscription_events');
    expect(ev.row).toMatchObject({ user_id: UID, provider: 'stripe', status: 'active', period_type: 'normal', product_id: 'price_m' });
  });
  it('表が無くても subscriptions は書けて 200', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    missingEvents = true;
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(upserts[0].status).toBe('active');
    warn.mockRestore();
  });
});
