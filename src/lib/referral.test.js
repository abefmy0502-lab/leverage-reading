import { describe, it, expect } from 'vitest';
import { referralMessage, shareReferral } from './referral';

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
