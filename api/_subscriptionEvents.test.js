// api/_subscriptionEvents.js: 契約の履歴の 1 行の作り方と、書けないときに Webhook を止めないこと。
import { describe, it, expect, vi } from 'vitest';
import { rcSubscriptionEventRow, stripeSubscriptionEventRow, recordSubscriptionEvent } from './_subscriptionEvents.js';

const UID = '11111111-1111-4111-8111-111111111111';

describe('rcSubscriptionEventRow', () => {
  it('無料期間の始まり（INITIAL_PURCHASE・TRIAL）', () => {
    const row = rcSubscriptionEventRow(
      { id: 'e1', type: 'INITIAL_PURCHASE', period_type: 'TRIAL', product_id: 'orime_monthly', environment: 'PRODUCTION', event_timestamp_ms: Date.UTC(2026, 10, 3) },
      { user_id: UID, status: 'active', period_type: 'trial', store: 'app_store', price_id: 'orime_monthly' },
    );
    expect(row).toMatchObject({
      user_id: UID, provider: 'revenuecat', source_event_id: 'e1', event_type: 'INITIAL_PURCHASE',
      status: 'active', period_type: 'trial', product_id: 'orime_monthly', store: 'app_store',
      environment: 'production', is_trial_conversion: null, event_at: '2026-11-03T00:00:00.000Z',
    });
  });
  it('有料への切り替わり（RENEWAL・is_trial_conversion）', () => {
    const row = rcSubscriptionEventRow(
      { id: 'e2', type: 'RENEWAL', period_type: 'NORMAL', is_trial_conversion: true },
      { user_id: UID, status: 'active' },
    );
    expect(row.period_type).toBe('normal');
    expect(row.is_trial_conversion).toBe(true);
    expect(typeof row.event_at).toBe('string');
  });
  it('知らない period_type は null・user が無ければ作らない', () => {
    expect(rcSubscriptionEventRow({ id: 'e3', type: 'RENEWAL', period_type: 'PREPAID' }, { user_id: UID }).period_type).toBe(null);
    expect(rcSubscriptionEventRow({ id: 'e4' }, {})).toBe(null);
  });
});

describe('stripeSubscriptionEventRow', () => {
  it('trialing は trial・時刻は event.created（秒）', () => {
    const row = stripeSubscriptionEventRow(
      { id: 'evt_1', type: 'customer.subscription.updated', created: 1793750400, livemode: true },
      UID, { status: 'trialing', period_type: 'trial', price_id: 'price_m' },
    );
    expect(row).toMatchObject({ provider: 'stripe', status: 'trialing', period_type: 'trial', product_id: 'price_m', environment: 'production' });
    expect(row.event_at).toBe(new Date(1793750400 * 1000).toISOString());
  });
  it('テストモードは sandbox', () => {
    expect(stripeSubscriptionEventRow({ id: 'evt_2', livemode: false }, UID, { status: 'active' }).environment).toBe('sandbox');
  });
});

describe('recordSubscriptionEvent', () => {
  const client = (result) => ({ from: () => ({ insert: async () => result }) });
  it('書けたら ok・再送（23505）は dup', async () => {
    expect(await recordSubscriptionEvent(client({ error: null }), { user_id: UID })).toBe('ok');
    expect(await recordSubscriptionEvent(client({ error: { code: '23505', message: 'duplicate' } }), { user_id: UID })).toBe('dup');
  });
  it('表が無くても投げない（missing）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await recordSubscriptionEvent(client({ error: { code: '42P01', message: 'relation "public.subscription_events" does not exist' } }), { user_id: UID })).toBe('missing');
    expect(await recordSubscriptionEvent(client({ error: { code: 'PGRST205', message: "Could not find the table 'public.subscription_events' in the schema cache" } }), { user_id: UID })).toBe('missing');
    warn.mockRestore();
  });
  it('例外も飲み込む・行が無ければ何もしない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom = { from: () => ({ insert: async () => { throw new Error('network'); } }) };
    expect(await recordSubscriptionEvent(boom, { user_id: UID })).toBe('error');
    expect(await recordSubscriptionEvent(boom, null)).toBe('skip');
    warn.mockRestore();
  });
});
