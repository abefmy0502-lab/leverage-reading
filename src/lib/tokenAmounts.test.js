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
