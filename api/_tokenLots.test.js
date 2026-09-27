import { describe, it, expect } from 'vitest';
import {
  TOKEN_LOT_DAYS, tokenPacks, packForProduct, activeLots, lotBalance, planLotConsumption,
  effectiveAllowance, overflowToCharge, tokenCreditFromEvent, isTokenPackEvent,
} from './_tokenLots.js';
import { TOKEN_PACKS, TOKEN_LOT_DAYS as CLIENT_DAYS } from '../src/lib/tokens.js';

const NOW = Date.parse('2026-09-27T00:00:00Z');
const day = (n) => new Date(NOW + n * 86400000).toISOString();

describe('商品（packs）', () => {
  it('既定は 300 / 1,000 トークン（画面の写しと同じ）', () => {
    expect(tokenPacks({})).toEqual([{ id: 'orime_tokens_300', tokens: 300 }, { id: 'orime_tokens_1000', tokens: 1000 }]);
    expect(TOKEN_PACKS.map((p) => [p.id, p.tokens])).toEqual(tokenPacks({}).map((p) => [p.id, p.tokens]));
    expect(TOKEN_PACKS.map((p) => p.consults)).toEqual(['約 30 回分', '約 100 回分']);
  });
  it('env AI_TOKEN_PACKS で上書き（壊れた指定は既定）', () => {
    expect(tokenPacks({ AI_TOKEN_PACKS: 'a:100, b:250' })).toEqual([{ id: 'a', tokens: 100 }, { id: 'b', tokens: 250 }]);
    expect(tokenPacks({ AI_TOKEN_PACKS: 'x:abc' })).toEqual(tokenPacks({}));
    expect(packForProduct('orime_tokens_1000', {}).tokens).toBe(1000);
    expect(packForProduct('orime_monthly', {})).toBe(null);
  });
  it('期限は 180 日（資金決済法の 6 か月以内）', () => {
    expect(TOKEN_LOT_DAYS).toBe(180);
    expect(CLIENT_DAYS).toBe(180);
  });
});

describe('ロット（期限と FIFO）', () => {
  const lots = [
    { id: 'c', tokens_left: 300, expires_at: day(170), purchased_at: day(-10) },
    { id: 'a', tokens_left: 50, expires_at: day(20), purchased_at: day(-160) },
    { id: 'x', tokens_left: 999, expires_at: day(-1), purchased_at: day(-181) }, // 期限切れ
    { id: 'z', tokens_left: 0, expires_at: day(90), purchased_at: day(-90) }, // 使い切り
    { id: 'b', tokens_left: 100, expires_at: day(60), purchased_at: day(-120) },
  ];
  it('期限切れ・使い切りを除き、期限の近い順', () => {
    expect(activeLots(lots, NOW).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
  it('残りといちばん近い期限', () => {
    expect(lotBalance(lots, NOW)).toEqual({ balance: 450, nextExpiry: day(20) });
    expect(lotBalance([], NOW)).toEqual({ balance: 0, nextExpiry: null });
  });
  it('期限の近いロットから差し引く', () => {
    expect(planLotConsumption(lots, 120, NOW)).toEqual({ takes: [{ id: 'a', take: 50 }, { id: 'b', take: 70 }], consumed: 120, short: 0 });
  });
  it('足りないときは差し引けた分だけ（負にしない）', () => {
    expect(planLotConsumption(lots, 1000, NOW)).toEqual({
      takes: [{ id: 'a', take: 50 }, { id: 'b', take: 100 }, { id: 'c', take: 300 }], consumed: 450, short: 550,
    });
    expect(planLotConsumption(lots, -5, NOW).consumed).toBe(0);
  });
});

describe('使える量と精算', () => {
  it('その月の分＋もう追加分から払った分＋追加分の残り', () => {
    expect(effectiveAllowance(800, { charged: 0, balance: 0 })).toBe(800);
    expect(effectiveAllowance(800, { charged: 120, balance: 180 })).toBe(1100);
  });
  it('使う順は その月 → 追加分（月の分の内側なら追加分は減らない）', () => {
    expect(overflowToCharge({ usedTokens: 700, allowance: 800, charged: 0 })).toBe(0);
    expect(overflowToCharge({ usedTokens: 810, allowance: 800, charged: 0 })).toBe(10);
    expect(overflowToCharge({ usedTokens: 830, allowance: 800, charged: 10 })).toBe(20);
    expect(overflowToCharge({ usedTokens: 820, allowance: 800, charged: 30 })).toBe(0); // 払い過ぎは戻さない
  });
});

describe('webhook のイベント → 追加の記録', () => {
  const base = {
    id: 'evt_1', type: 'NON_RENEWING_PURCHASE', product_id: 'orime_tokens_300', environment: 'PRODUCTION',
    app_user_id: '11111111-1111-4111-8111-111111111111', transaction_id: 'tx_123', purchased_at_ms: NOW,
  };
  it('消耗型の購入 → 取引 ID を鍵に 300 トークン', () => {
    expect(tokenCreditFromEvent(base, { env: {} })).toEqual({
      credit: {
        userId: base.app_user_id, transactionId: 'tx_123', productId: 'orime_tokens_300', tokens: 300,
        purchasedAt: new Date(NOW).toISOString(), environment: 'production',
      },
    });
    expect(isTokenPackEvent(base, {})).toBe(true);
  });
  it('同じ取引は同じ鍵（再送されても二重に足さない＝transaction_id UNIQUE）', () => {
    const a = tokenCreditFromEvent(base, { env: {} }).credit.transactionId;
    const b = tokenCreditFromEvent({ ...base, id: 'evt_resent' }, { env: {} }).credit.transactionId;
    expect(a).toBe(b);
  });
  it('サンドボックス（TestFlight・審査）も足す。RC_SANDBOX_TOKENS=false で止める', () => {
    expect(tokenCreditFromEvent({ ...base, environment: 'SANDBOX' }, { env: {} }).credit.environment).toBe('sandbox');
    expect(tokenCreditFromEvent({ ...base, environment: 'SANDBOX' }, { env: { RC_SANDBOX_TOKENS: 'false' } })).toEqual({ skip: 'sandbox' });
  });
  it('関係ないイベント・商品・ユーザーは足さない', () => {
    expect(tokenCreditFromEvent({ ...base, type: 'INITIAL_PURCHASE' }, { env: {} })).toEqual({ skip: 'not_consumable' });
    expect(tokenCreditFromEvent({ ...base, product_id: 'other' }, { env: {} })).toEqual({ skip: 'not_token_pack' });
    expect(tokenCreditFromEvent({ ...base, app_user_id: '$RCAnonymousID:x' }, { env: {}, isUserId: (u) => !u.startsWith('$') })).toEqual({ skip: 'unresolvable_app_user_id' });
    expect(tokenCreditFromEvent({ ...base, transaction_id: '', original_transaction_id: '', id: '' }, { env: {} })).toEqual({ skip: 'no_transaction_id' });
    expect(isTokenPackEvent({ ...base, type: 'RENEWAL' }, {})).toBe(false);
  });
});
