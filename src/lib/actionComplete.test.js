// 🎯 行動の完了の楽観的 UI の巻き戻し（actionComplete.js・2026-10-11）。
import { describe, it, expect, vi } from 'vitest';
import { completeWithRollback } from './actionComplete';

describe('completeWithRollback', () => {
  it('保存できたら知らせを出し、見た目は戻さない', async () => {
    const onSaved = vi.fn(); const onFail = vi.fn();
    expect(await completeWithRollback({ save: async () => true, onSaved, onFail })).toBe(true);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
  });
  it('保存できなかった（false）ら見た目を戻し、成功の知らせは出さない', async () => {
    const onSaved = vi.fn(); const onFail = vi.fn();
    expect(await completeWithRollback({ save: async () => false, onSaved, onFail })).toBe(false);
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('保存が例外を投げても戻す', async () => {
    const onSaved = vi.fn(); const onFail = vi.fn();
    await completeWithRollback({ save: async () => { throw new Error('offline'); }, onSaved, onFail });
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('知らせは保存の結果が出るまで出さない', async () => {
    let resolve;
    const onSaved = vi.fn();
    const p = completeWithRollback({ save: () => new Promise((r) => { resolve = r; }), onSaved });
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();
    resolve(true);
    await p;
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
  it('何も返さない保存は、できたものとして扱う', async () => {
    const onSaved = vi.fn();
    expect(await completeWithRollback({ save: async () => undefined, onSaved })).toBe(true);
    expect(onSaved).toHaveBeenCalled();
  });
});
