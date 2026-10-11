// api/_clientIp.js: IP の取り方（x-real-ip を先に）とハッシュ。
import { describe, it, expect } from 'vitest';
import { clientIp, ipHash } from './_clientIp.js';

describe('clientIp', () => {
  it('x-real-ip を x-forwarded-for より先に使う（先頭は送り手が偽れるため）', () => {
    expect(clientIp({ headers: { 'x-real-ip': ' 9.9.9.9 ', 'x-forwarded-for': '1.1.1.1, 9.9.9.9' } })).toBe('9.9.9.9');
  });
  it('x-real-ip が無ければ x-forwarded-for の先頭・それも無ければ接続元', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } })).toBe('1.1.1.1');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '3.3.3.3' } })).toBe('3.3.3.3');
    expect(clientIp({})).toBe('unknown');
  });
});

describe('ipHash', () => {
  it('同じ日・同じ IP は同じ値、日か鍵が違えば別の値・IP は入らない', () => {
    const a = ipHash('9.9.9.9', '2026-10-11', 'k');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(ipHash('9.9.9.9', '2026-10-11', 'k')).toBe(a);
    expect(ipHash('9.9.9.9', '2026-10-12', 'k')).not.toBe(a);
    expect(ipHash('9.9.9.9', '2026-10-11', 'k2')).not.toBe(a);
    expect(a).not.toContain('9.9.9.9');
  });
  it('鍵が無ければ null（数えない）', () => {
    expect(ipHash('9.9.9.9', '2026-10-11', '')).toBeNull();
  });
});
