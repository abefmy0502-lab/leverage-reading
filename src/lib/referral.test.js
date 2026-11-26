import { describe, it, expect } from 'vitest';
import { referralMessage, shareReferral, inviteMessage } from './referral';

describe('友だちに紹介する（2026-10-22）', () => {
  it('コードが無ければ文は空・あればコードと使い方とサイトの URL', () => {
    expect(referralMessage('')).toBe('');
    const m = referralMessage('ORIME2027', 'https://orime.vercel.app');
    expect(m).toContain('コード ORIME2027');
    expect(m).toContain('「コードを使う」');
    expect(m.endsWith('https://orime.vercel.app')).toBe(true);
    expect(m).not.toMatch(/無料/);
  });
  it('共有シートが無ければ false', async () => {
    expect(await shareReferral('')).toBe(false);
    expect(await shareReferral('x')).toBe(false);
  });
});

describe('orime を友だちに教える（2026-11-26）', () => {
  it('何ができるかと URL・コードの話はしない', () => {
    const m = inviteMessage('https://apps.apple.com/jp/app/orime/id1');
    expect(m).toContain('orime');
    expect(m).toContain('相談相手');
    expect(m.endsWith('https://apps.apple.com/jp/app/orime/id1')).toBe(true);
    expect(m).not.toMatch(/コード/);
    expect(m).not.toMatch(/Orime|ORIME/);
  });
});
