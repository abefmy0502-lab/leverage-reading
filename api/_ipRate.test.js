import { describe, it, expect, beforeEach } from 'vitest';
import { takeIpSlot, _resetIpRateForTests } from './_ipRate.js';

const req = (ip) => ({ headers: { 'x-real-ip': ip } });
describe('認証の前の IP の回数制限', () => {
  beforeEach(() => _resetIpRateForTests());
  it('max を超えると 429 相当・別の IP と別の bucket は別に数える', () => {
    for (let i = 0; i < 3; i += 1) expect(takeIpSlot(req('1.1.1.1'), { max: 3, bucket: 'a' }).ok).toBe(true);
    const r = takeIpSlot(req('1.1.1.1'), { max: 3, bucket: 'a' });
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(takeIpSlot(req('2.2.2.2'), { max: 3, bucket: 'a' }).ok).toBe(true);
    expect(takeIpSlot(req('1.1.1.1'), { max: 3, bucket: 'b' }).ok).toBe(true);
  });
});
