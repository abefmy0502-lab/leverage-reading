import { describe, it, expect } from 'vitest';
import {
  TOKEN_LOT_DAYS, tokenPacks, packForProduct, activeLots, lotBalance, planLotConsumption,
  effectiveAllowance, overflowToCharge, tokenCreditFromEvent, isTokenPackEvent,
  shouldSettleOverflow, resolveEventUserId, isTokenPackProductEvent, tokenRefundFromEvent,
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

describe('最後の 1 回のはみ出しの精算（追加分が無くても払ったことにする）', () => {
  const base = { lotOk: true, balance: 0, charged: 0, reservedMjpy: 12000, allowanceTokens: 800, tokenMjpy: 300 };
  it('追加分があれば必ず精算する', () => {
    expect(shouldSettleOverflow({ ...base, balance: 300, totalAfterReserveMjpy: 1000, actualMjpy: 500 })).toBe(true);
    expect(shouldSettleOverflow({ ...base, charged: 5, totalAfterReserveMjpy: 1000, actualMjpy: 500 })).toBe(true);
  });
  it('追加分が無くても、精算後に月の分（800）を超えたら精算する（あとで買った分から取られないように）', () => {
    // 使った 790 トークン（237,000 mjpy）+ 予約 12,000 → 実額 7,500（25 トークン）→ 815 トークン
    expect(shouldSettleOverflow({ ...base, totalAfterReserveMjpy: 237000 + 12000, actualMjpy: 7500 })).toBe(true);
  });
  it('月の分の内側なら呼ばない（ふだんの 1 回で余計な往復を増やさない）', () => {
    expect(shouldSettleOverflow({ ...base, totalAfterReserveMjpy: 100000 + 12000, actualMjpy: 3000 })).toBe(false);
    // 予約の最大額では超えるが、実額では超えない
    expect(shouldSettleOverflow({ ...base, totalAfterReserveMjpy: 235000 + 12000, actualMjpy: 3000 })).toBe(false);
  });
  it('AI が答えていない・表が無い・合計が分からないときは呼ばない', () => {
    expect(shouldSettleOverflow({ ...base, balance: 300, totalAfterReserveMjpy: 1, actualMjpy: null })).toBe(false);
    expect(shouldSettleOverflow({ ...base, lotOk: false, balance: 300, totalAfterReserveMjpy: 1, actualMjpy: 1 })).toBe(false);
    expect(shouldSettleOverflow({ ...base, totalAfterReserveMjpy: null, actualMjpy: 999999 })).toBe(false);
  });
  it('はみ出しを払ったことにすると、あとで買った 300 トークンはまるごと使える（SQL と同じ式）', () => {
    // 790 → 最後の 1 回で 815。精算で charged=15（追加分は 0 なので差し引けない）
    const charged = overflowToCharge({ usedTokens: 815, allowance: 800, charged: 0 });
    expect(charged).toBe(15);
    // 300 買ったあと: 使える合計 = 800 + 15 + 300、使った 815 → 残り 300
    expect(effectiveAllowance(800, { charged, balance: 300 }) - 815).toBe(300);
    // 次の 10 トークンは、追加分から 10 だけ（前のはみ出し 15 は取らない）
    expect(overflowToCharge({ usedTokens: 825, allowance: 800, charged })).toBe(10);
  });
});

describe('ユーザーの解決（匿名 ID のときも同じ顧客の user.id を使う）', () => {
  const UID = '11111111-1111-4111-8111-111111111111';
  const isUserId = (u) => /^[0-9a-f-]{36}$/.test(u);
  it('app_user_id が匿名でも aliases / original_app_user_id から user.id を拾う', () => {
    expect(resolveEventUserId({ app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', UID] }, isUserId)).toBe(UID);
    expect(resolveEventUserId({ app_user_id: '$RCAnonymousID:abc', original_app_user_id: UID }, isUserId)).toBe(UID);
    expect(resolveEventUserId({ app_user_id: '$RCAnonymousID:abc' }, isUserId)).toBe(null);
  });
  it('消耗型の購入も同じ（取りこぼすと買ったトークンが永久に届かない）', () => {
    const ev = {
      type: 'NON_RENEWING_PURCHASE', product_id: 'orime_tokens_300', app_user_id: '$RCAnonymousID:abc',
      aliases: [UID], transaction_id: 'tx_9', purchased_at_ms: NOW,
    };
    expect(tokenCreditFromEvent(ev, { env: {}, isUserId }).credit.userId).toBe(UID);
  });
});

describe('追加トークンの返金（CANCELLATION）', () => {
  const UID = '11111111-1111-4111-8111-111111111111';
  const refund = { type: 'CANCELLATION', product_id: 'orime_tokens_1000', app_user_id: UID, transaction_id: 'tx_5', expiration_at_ms: null };
  it('追加トークンの商品のイベントは種類を問わず見分ける（契約の処理に流さない）', () => {
    expect(isTokenPackProductEvent(refund, {})).toBe(true);
    expect(isTokenPackEvent(refund, {})).toBe(false);
    expect(isTokenPackProductEvent({ ...refund, product_id: 'orime_monthly' }, {})).toBe(false);
  });
  it('返金はそのロットの残りを取り消す', () => {
    expect(tokenRefundFromEvent(refund, { env: {} })).toEqual({ revoke: { userId: UID, transactionId: 'tx_5' } });
    expect(tokenRefundFromEvent({ ...refund, type: 'EXPIRATION' }, { env: {} })).toEqual({ skip: 'not_refund' });
    expect(tokenRefundFromEvent({ ...refund, transaction_id: '' }, { env: {} })).toEqual({ skip: 'no_transaction_id' });
  });
});
