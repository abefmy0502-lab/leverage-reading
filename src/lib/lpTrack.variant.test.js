// ヒーローの表示方式（2026-10-11）: 本番の絵が届くまで、イラストの A/B は VITE_LP_ILLUST=on のビルドだけ。
import { describe, it, expect, vi, afterEach } from 'vitest';

const load = async ({ illust = '', search = '', dev = false } = {}) => {
  vi.resetModules();
  vi.stubEnv('VITE_LP_ILLUST', illust);
  vi.stubEnv('DEV', dev);
  const store = new Map();
  vi.stubGlobal('window', { location: { search } });
  vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
  return import('./lpTrack.js');
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('lpVariant', () => {
  it('既定（VITE_LP_ILLUST なし）は全員 photo', async () => {
    for (let i = 0; i < 5; i += 1) expect((await load()).lpVariant()).toBe('photo');
  });
  it('既定の本番では ?hero=illust でもイラストを見せない（記録と見せた形がずれない）', async () => {
    expect((await load({ search: '?hero=illust' })).lpVariant()).toBe('photo');
  });
  it('開発中は ?hero=illust で見られる', async () => {
    expect((await load({ search: '?hero=illust', dev: true })).lpVariant()).toBe('illust');
  });
  it('VITE_LP_ILLUST=on なら illust か photo のどちらか', async () => {
    expect(['illust', 'photo']).toContain((await load({ illust: 'on' })).lpVariant());
  });
});
