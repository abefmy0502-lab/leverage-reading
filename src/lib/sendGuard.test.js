import { describe, it, expect, vi } from 'vitest';
import { createSendGuard } from './sendGuard';

describe('createSendGuard（相談の送信の二重押し）', () => {
  it('送っている途中の 2 回目は呼ばない', async () => {
    const g = createSendGuard();
    let release;
    const fn = vi.fn(() => new Promise((r) => { release = r; }));
    const first = g.run(fn);
    expect(g.busy).toBe(true);
    const second = await g.run(fn);
    expect(second).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    release('ok');
    expect(await first).toBe('ok');
    expect(g.busy).toBe(false);
  });

  it('終わったら次は送れる', async () => {
    const g = createSendGuard();
    const fn = vi.fn(async () => 1);
    await g.run(fn);
    await g.run(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('失敗しても印を外す', async () => {
    const g = createSendGuard();
    await expect(g.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(g.busy).toBe(false);
    expect(await g.run(async () => 2)).toBe(2);
  });

  it('同じ瞬間の連打（await を挟まない 2 回）でも 1 回だけ', async () => {
    const g = createSendGuard();
    const fn = vi.fn(async () => { await Promise.resolve(); return 'a'; });
    const [a, b] = await Promise.all([g.run(fn), g.run(fn)]);
    expect([a, b]).toEqual(['a', undefined]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
