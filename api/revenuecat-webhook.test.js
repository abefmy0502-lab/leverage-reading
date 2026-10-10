// api/revenuecat-webhook.js を偽の Supabase で動かす（追加トークンのイベントが契約の行を壊さないこと）。
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const UID = '11111111-1111-4111-8111-111111111111';
const ops = [];
let existingRow = { provider: 'revenuecat', status: 'active' };
let lotRows = [];

function query(table) {
  const ctx = { table, op: 'select', filters: {} };
  const q = {
    select() { return q; },
    eq(k, v) { ctx.filters[k] = v; return q; },
    in() { return q; },
    insert(row) { ops.push({ table, op: 'insert', row }); return Promise.resolve({ error: null }); },
    upsert(row) { ops.push({ table, op: 'upsert', row }); return Promise.resolve({ error: null }); },
    update(patch) { ctx.op = 'update'; ctx.patch = patch; return q; },
    delete() { ctx.op = 'delete'; return q; },
    maybeSingle() { return Promise.resolve({ data: existingRow, error: null }); },
    then(res, rej) {
      if (ctx.op === 'update' || ctx.op === 'delete') ops.push({ table, op: ctx.op, patch: ctx.patch, filters: ctx.filters });
      return Promise.resolve({ data: table === 'ai_token_lots' && ctx.op === 'select' ? lotRows : [], error: null }).then(res, rej);
    },
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t) => query(t),
    rpc: async (name, args) => { ops.push({ rpc: name, args }); return { data: args.p_tokens, error: null }; },
  }),
}));

function mockRes() {
  const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  return res;
}
const post = (event) => ({ method: 'POST', headers: { authorization: 'secret' }, body: { event } });

let handler;
beforeAll(async () => {
  process.env.REVENUECAT_WEBHOOK_AUTH = 'secret';
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  ({ default: handler } = await import('./revenuecat-webhook.js'));
});
beforeEach(() => { ops.length = 0; lotRows = []; existingRow = { provider: 'revenuecat', status: 'active' }; });

describe('追加トークン（消耗型）のイベント', () => {
  it('購入 → ロットを足す。subscriptions は触らない', async () => {
    const res = mockRes();
    await handler(post({ id: 'e1', type: 'NON_RENEWING_PURCHASE', product_id: 'orime_tokens_300', app_user_id: UID, transaction_id: 'tx1', purchased_at_ms: Date.now() }), res);
    expect(res.body.credited).toBe(300);
    expect(ops.some((o) => o.table === 'subscriptions')).toBe(false);
  });
  it('返金（CANCELLATION・期限なし）→ 契約中の人の subscriptions を canceled にしない。ロットの残りを 0 に', async () => {
    const res = mockRes();
    await handler(post({ id: 'e2', type: 'CANCELLATION', product_id: 'orime_tokens_1000', app_user_id: UID, transaction_id: 'tx2', expiration_at_ms: null, cancel_reason: 'CUSTOMER_SUPPORT' }), res);
    expect(res.statusCode).toBe(200);
    expect(ops.some((o) => o.table === 'subscriptions' && (o.op === 'upsert' || o.op === 'update'))).toBe(false);
    const revoke = ops.find((o) => o.table === 'ai_token_lots' && o.op === 'update');
    expect(revoke.patch).toEqual({ tokens_left: 0 });
    expect(revoke.filters).toEqual({ user_id: UID, transaction_id: 'tx2' });
  });
  it('匿名 ID で届いた購入も、aliases の user.id に足す（取りこぼさない）', async () => {
    const res = mockRes();
    await handler(post({ id: 'e3', type: 'NON_RENEWING_PURCHASE', product_id: 'orime_tokens_300', app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', UID], transaction_id: 'tx3', purchased_at_ms: Date.now() }), res);
    expect(res.body.credited).toBe(300);
    expect(ops.find((o) => o.rpc === 'credit_token_lot').args.p_user_id).toBe(UID);
  });
});

describe('契約のイベントは今までどおり', () => {
  it('月額の CANCELLATION（期限切れ）→ canceled に', async () => {
    const res = mockRes();
    await handler(post({ id: 'e4', type: 'EXPIRATION', product_id: 'orime_monthly', app_user_id: UID, expiration_at_ms: Date.now() - 1000 }), res);
    const up = ops.find((o) => o.table === 'subscriptions' && o.op === 'upsert');
    expect(up.row.status).toBe('canceled');
  });
});

describe('契約の履歴（subscription_events）', () => {
  it('無料期間 → 有料の RENEWAL を 1 件残す（subscriptions も今までどおり）', async () => {
    const res = mockRes();
    await handler(post({ id: 'e5', type: 'RENEWAL', period_type: 'NORMAL', is_trial_conversion: true, product_id: 'orime_monthly', app_user_id: UID, expiration_at_ms: Date.now() + 86400000 }), res);
    expect(res.statusCode).toBe(200);
    const ev = ops.find((o) => o.table === 'subscription_events' && o.op === 'insert');
    expect(ev.row).toMatchObject({ user_id: UID, provider: 'revenuecat', source_event_id: 'e5', period_type: 'normal', status: 'active', is_trial_conversion: true });
    expect(ops.some((o) => o.table === 'subscriptions' && o.op === 'upsert')).toBe(true);
  });
  it('追加トークンのイベントは履歴に入れない', async () => {
    const res = mockRes();
    await handler(post({ id: 'e6', type: 'NON_RENEWING_PURCHASE', product_id: 'orime_tokens_300', app_user_id: UID, transaction_id: 'tx6', purchased_at_ms: Date.now() }), res);
    expect(ops.some((o) => o.table === 'subscription_events')).toBe(false);
  });
});

describe('順番の入れ替わり（2026-10-10 監査）', () => {
  const DAY = 86400 * 1000;
  it('保存済みの期限より古い期限のイベントでは状態を下げない', async () => {
    existingRow = { provider: 'revenuecat', status: 'active', current_period_end: new Date(Date.now() + 20 * DAY).toISOString() };
    const res = mockRes();
    await handler(post({ id: 's1', type: 'EXPIRATION', product_id: 'orime_monthly', app_user_id: UID, expiration_at_ms: Date.now() - DAY }), res);
    expect(res.body.skipped).toBe('stale_event');
    expect(ops.some((o) => o.table === 'subscriptions' && o.op === 'upsert')).toBe(false);
  });
  it('古い期限で状態が下がらないイベントは、期限を古い方へ戻さない', async () => {
    const keep = new Date(Date.now() + 20 * DAY).toISOString();
    existingRow = { provider: 'revenuecat', status: 'active', current_period_end: keep };
    const res = mockRes();
    await handler(post({ id: 's2', type: 'RENEWAL', product_id: 'orime_monthly', app_user_id: UID, expiration_at_ms: Date.now() + 5 * DAY }), res);
    const up = ops.find((o) => o.table === 'subscriptions' && o.op === 'upsert');
    expect(up.row).toMatchObject({ status: 'active', current_period_end: keep });
  });
  it('新しい期限・返金（CUSTOMER_SUPPORT）はそのまま下げる', async () => {
    existingRow = { provider: 'revenuecat', status: 'active', current_period_end: new Date(Date.now() - 2 * DAY).toISOString() };
    const r1 = mockRes();
    await handler(post({ id: 's3', type: 'EXPIRATION', product_id: 'orime_monthly', app_user_id: UID, expiration_at_ms: Date.now() - 1000 }), r1);
    expect(ops.find((o) => o.table === 'subscriptions' && o.op === 'upsert').row.status).toBe('canceled');
    ops.length = 0;
    existingRow = { provider: 'revenuecat', status: 'active', current_period_end: new Date(Date.now() + 20 * DAY).toISOString() };
    const r2 = mockRes();
    await handler(post({ id: 's4', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', product_id: 'orime_monthly', app_user_id: UID, expiration_at_ms: Date.now() - 1000 }), r2);
    expect(ops.find((o) => o.table === 'subscriptions' && o.op === 'upsert').row.status).toBe('canceled');
  });
});

describe('サンドボックスの追加トークン（2026-10-10 監査）', () => {
  const future = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
  it('記録は続ける（上限まで）', async () => {
    lotRows = [{ tokens_total: 1000, expires_at: future, transaction_id: 'a' }];
    const res = mockRes();
    await handler(post({ id: 'sb1', type: 'NON_RENEWING_PURCHASE', environment: 'SANDBOX', product_id: 'orime_tokens_1000', app_user_id: UID, transaction_id: 'sbtx1', purchased_at_ms: Date.now() }), res);
    expect(res.body.credited).toBe(1000);
    expect(ops.find((o) => o.rpc === 'credit_token_lot').args.p_environment).toBe('sandbox');
  });
  it('1 人の期限内の合計が 2000 を超えるなら足さない', async () => {
    lotRows = [{ tokens_total: 1000, expires_at: future, transaction_id: 'a' }, { tokens_total: 1000, expires_at: future, transaction_id: 'b' }];
    const res = mockRes();
    await handler(post({ id: 'sb2', type: 'NON_RENEWING_PURCHASE', environment: 'SANDBOX', product_id: 'orime_tokens_300', app_user_id: UID, transaction_id: 'sbtx2', purchased_at_ms: Date.now() }), res);
    expect(res.body.skipped).toBe('sandbox_cap');
    expect(ops.some((o) => o.rpc === 'credit_token_lot')).toBe(false);
  });
  it('本番の購入は上限なし・期限切れのサンドボックスの分は数えない', async () => {
    const { sandboxCreditAllowed } = await import('./_tokenLots.js');
    const past = new Date(Date.now() - 1000).toISOString();
    expect(sandboxCreditAllowed([{ tokens_total: 2000, expires_at: past }], 1000)).toBe(true);
    expect(sandboxCreditAllowed([{ tokens_total: 1000, expires_at: future }], 1000)).toBe(true);
    expect(sandboxCreditAllowed([{ tokens_total: 1001, expires_at: future }], 1000)).toBe(false);
    lotRows = [{ tokens_total: 5000, expires_at: future, transaction_id: 'x' }];
    const res = mockRes();
    await handler(post({ id: 'pr1', type: 'NON_RENEWING_PURCHASE', product_id: 'orime_tokens_300', app_user_id: UID, transaction_id: 'prtx', purchased_at_ms: Date.now() }), res);
    expect(res.body.credited).toBe(300);
  });
});
