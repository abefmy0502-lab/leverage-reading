import { describe, it, expect, beforeEach } from 'vitest';
import { isNotifyOptInDone, markNotifyOptInDone, PUSH_OPTIN_KEY, OPTIN_DISMISS_DAYS } from './notifyOptIn';

const DAY = 86400000;
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
}
describe('通知の案内を出してよいか（2026-10-21・閉じたら 14 日後にもう一度だけ）', () => {
  beforeEach(() => { localStorage.removeItem(PUSH_OPTIN_KEY); });
  it('まだなら出す・受け取る／断るはずっと出さない', () => {
    expect(isNotifyOptInDone()).toBe(false);
    markNotifyOptInDone('enabled');
    expect(isNotifyOptInDone(Date.now() + 365 * DAY)).toBe(true);
    localStorage.removeItem(PUSH_OPTIN_KEY);
    markNotifyOptInDone('denied');
    expect(isNotifyOptInDone(Date.now() + 365 * DAY)).toBe(true);
  });
  it('× で閉じたら 14 日は出さず、過ぎたらもう一度・2 回目の × でずっと出さない', () => {
    const t0 = Date.parse('2026-10-21T00:00:00+09:00');
    markNotifyOptInDone('dismiss', t0);
    expect(isNotifyOptInDone(t0 + (OPTIN_DISMISS_DAYS - 1) * DAY)).toBe(true);
    expect(isNotifyOptInDone(t0 + (OPTIN_DISMISS_DAYS + 1) * DAY)).toBe(false);
    markNotifyOptInDone('dismiss', t0 + 15 * DAY);
    expect(isNotifyOptInDone(t0 + 400 * DAY)).toBe(true);
  });
  it('前の版の印（1）はそのまま「出さない」', () => {
    localStorage.setItem(PUSH_OPTIN_KEY, '1');
    expect(isNotifyOptInDone()).toBe(true);
  });
});
