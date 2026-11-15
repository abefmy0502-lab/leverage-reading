import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from './useSubscription';

describe('課金の確認の打ち切り', () => {
  it('返らない約束は上限の秒数で打ち切る', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 5000, () => false);
    vi.advanceTimersByTime(5000);
    await expect(p).resolves.toBe(false);
    vi.useRealTimers();
  });
  it('間に合えばその値・失敗はそのまま', async () => {
    await expect(withTimeout(Promise.resolve(true), 5000, () => false)).resolves.toBe(true);
    await expect(withTimeout(Promise.reject(new Error('x')), 5000, () => false)).rejects.toThrow('x');
  });
  it('打ち切りで投げると失敗になる', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 10, () => { throw new Error('timeout'); });
    vi.advanceTimersByTime(10);
    await expect(p).rejects.toThrow('timeout');
    vi.useRealTimers();
  });
});
