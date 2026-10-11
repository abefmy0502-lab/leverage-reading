// ヒーローの表示方式（2026-10-11）: 本番の絵が届いたので既定で イラスト ↔ 写真 の A/B。VITE_LP_ILLUST=off で全員 写真。
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
  it('既定は illust か photo のどちらか（A/B）', async () => {
    expect(['illust', 'photo']).toContain((await load()).lpVariant());
  });
  it('VITE_LP_ILLUST=off は全員 photo', async () => {
    for (let i = 0; i < 5; i += 1) expect((await load({ illust: 'off' })).lpVariant()).toBe('photo');
  });
  it('off の本番では ?hero=illust でもイラストを見せない（記録と見せた形がずれない）', async () => {
    expect((await load({ illust: 'off', search: '?hero=illust' })).lpVariant()).toBe('photo');
  });
  it('off でも開発中は ?hero=illust で見られる', async () => {
    expect((await load({ illust: 'off', search: '?hero=illust', dev: true })).lpVariant()).toBe('illust');
  });
  it('?hero=illust / ?hero=photo で固定できる', async () => {
    expect((await load({ search: '?hero=illust' })).lpVariant()).toBe('illust');
    expect((await load({ search: '?hero=photo' })).lpVariant()).toBe('photo');
  });
});
