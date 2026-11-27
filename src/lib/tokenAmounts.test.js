import { describe, it, expect } from 'vitest';

describe('本を探せる残り（2026-11-26）', () => {
  it('3 トークンより少ないと 0 回・始めない', async () => {
    const { remainingAdvisorLabel, canStartAdvisor } = await import('./tokenAmounts');
    expect(remainingAdvisorLabel(2)).toBe('約 0 回');
    expect(remainingAdvisorLabel(5)).toBe('約 1 回');
    expect(canStartAdvisor(2)).toBe(false);
    expect(canStartAdvisor(3)).toBe(true);
    expect(canStartAdvisor(null)).toBe(true);
  });
});

describe('advisorConsultImpact（2026-11-26・本を探す前に相談の減りを見せる）', () => {
  it('探す前と後の相談の答えの回数', async () => {
    const { advisorConsultImpact } = await import('./tokenAmounts');
    expect(advisorConsultImpact(30)).toEqual({ before: '約 10 回', after: '約 3 回' });
    expect(advisorConsultImpact(15)).toEqual({ before: '約 5 回', after: '約 0 回' });
    expect(advisorConsultImpact(0)).toBe(null);
    expect(advisorConsultImpact(null)).toBe(null);
  });
});
