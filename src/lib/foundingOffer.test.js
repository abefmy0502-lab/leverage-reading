import { describe, it, expect } from 'vitest';
import { foundingOfferState, foundingEndTime, FOUNDING_DEFAULT_PRICE_LABEL } from './foundingOffer';

const at = (iso) => Date.parse(iso);

describe('foundingOfferState（創業メンバー価格を LP に出すか）', () => {
  it('on・終わる日の前は出す（既定の値段「1 年目 ¥9,800」）', () => {
    const s = foundingOfferState({ flag: 'on', end: '2026-12-15', now: at('2026-11-20T00:00:00Z') });
    expect(s.active).toBe(true);
    expect(s.endLabel).toBe('12月15日');
    expect(s.priceLabel).toBe(FOUNDING_DEFAULT_PRICE_LABEL);
    expect(s.priceLabel).toBe('1 年目 ¥9,800');
  });

  it('終わる日は日本時間の 23:59 まで（翌日 0:00 JST で自動で消える）', () => {
    // 12月15日 23:59 JST = 12月15日 14:59 UTC
    expect(foundingOfferState({ flag: 'on', end: '2026-12-15', now: at('2026-12-15T14:59:00Z') }).active).toBe(true);
    // 12月16日 0:00 JST = 12月15日 15:00 UTC
    expect(foundingOfferState({ flag: 'on', end: '2026-12-15', now: at('2026-12-15T15:00:00Z') }).active).toBe(false);
    expect(foundingEndTime('2026-12-15')).toBe(at('2026-12-15T15:00:00Z'));
  });

  it('off・未設定は出さない', () => {
    expect(foundingOfferState({ flag: 'off', end: '2026-12-15', now: at('2026-11-20T00:00:00Z') }).active).toBe(false);
    expect(foundingOfferState({ end: '2026-12-15', now: at('2026-11-20T00:00:00Z') }).active).toBe(false);
    expect(foundingOfferState({ flag: 'ON', end: '2026-12-15', now: at('2026-11-20T00:00:00Z') }).active).toBe(true);
  });

  it('終わる日が無い・読めないときは出さない（期限のない「期間限定」を作らない）', () => {
    expect(foundingOfferState({ flag: 'on', now: at('2026-11-20T00:00:00Z') }).active).toBe(false);
    expect(foundingOfferState({ flag: 'on', end: '12/15', now: at('2026-11-20T00:00:00Z') }).active).toBe(false);
    expect(foundingOfferState({ flag: 'on', end: '2026-02-31', now: at('2026-01-20T00:00:00Z') }).active).toBe(false);
    expect(foundingOfferState({ flag: 'on', end: '2026-12-XX', now: at('2026-11-20T00:00:00Z') }).endLabel).toBe('');
  });

  it('値段の書き方は env で変えられる', () => {
    expect(foundingOfferState({ flag: 'on', end: '2026-12-15', priceLabel: '初年度 ¥9,800', now: at('2026-11-20T00:00:00Z') }).priceLabel).toBe('初年度 ¥9,800');
    expect(foundingOfferState({ flag: 'on', end: '2026-12-15', priceLabel: '  ', now: at('2026-11-20T00:00:00Z') }).priceLabel).toBe('1 年目 ¥9,800');
  });
});
