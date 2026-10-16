// ヒーローの表示方式: 2026-10-16 から既定は全員 写真（VITE_LP_ILLUST=on のときだけ イラスト ↔ 写真 の A/B）。
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
  it('既定は全員 photo', async () => {
    for (let i = 0; i < 5; i += 1) expect((await load()).lpVariant()).toBe('photo');
  });
  it('VITE_LP_ILLUST=on は illust か photo のどちらか（A/B）', async () => {
    expect(['illust', 'photo']).toContain((await load({ illust: 'on' })).lpVariant());
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
  it('?hero=illust / ?hero=photo で固定できる（on のとき）', async () => {
    expect((await load({ illust: 'on', search: '?hero=illust' })).lpVariant()).toBe('illust');
    expect((await load({ illust: 'on', search: '?hero=photo' })).lpVariant()).toBe('photo');
  });
});
