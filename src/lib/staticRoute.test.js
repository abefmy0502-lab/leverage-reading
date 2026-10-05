// `/` に来たはじめての人に、アプリ本体を読まずに LP を出すかどうか（landingAtRoot・2026-10-05）。
import { describe, it, expect } from 'vitest';
import { landingAtRoot } from './staticRoute';

function env({ path = '/', search = '', hash = '', protocol = 'https:', storage = {}, standalone = false, native = false } = {}) {
  const keys = Object.keys(storage);
  return {
    location: { pathname: path, search, hash, protocol },
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), key: (i) => keys[i] ?? null, length: keys.length },
    navigator: { standalone: false },
    matchMedia: () => ({ matches: standalone }),
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
  };
}

describe('landingAtRoot', () => {
  it('はじめての人が / を開いた（計測の ? は許す）→ LP', () => {
    expect(landingAtRoot(env())).toBe(true);
    expect(landingAtRoot(env({ search: '?utm_source=x&utm_campaign=launch&hero=photo' }))).toBe(true);
    expect(landingAtRoot(env({ hash: '#lp-flow' }))).toBe(true);
  });
  it('アプリの用事・ログインの記録・アプリの中・お試しモードはアプリ本体へ', () => {
    expect(landingAtRoot(env({ search: '?auth=signin' }))).toBe(false);
    expect(landingAtRoot(env({ search: '?tab=review&sub=action' }))).toBe(false);
    expect(landingAtRoot(env({ search: '?code=abc' }))).toBe(false);
    expect(landingAtRoot(env({ hash: '#access_token=x&type=magiclink' }))).toBe(false);
    expect(landingAtRoot(env({ storage: { 'orime-returning': 'true' } }))).toBe(false);
    expect(landingAtRoot(env({ storage: { 'sb-abcd-auth-token': '{}' } }))).toBe(false);
    expect(landingAtRoot(env({ standalone: true }))).toBe(false);
    expect(landingAtRoot(env({ native: true }))).toBe(false);
    expect(landingAtRoot(env({ protocol: 'capacitor:' }))).toBe(false);
    expect(landingAtRoot(env({ path: '/books' }))).toBe(false);
    expect(landingAtRoot(env(), { demo: true })).toBe(false);
  });
  it('読めないときはアプリ本体へ（今までどおり）', () => {
    expect(landingAtRoot(null)).toBe(false);
    expect(landingAtRoot({ location: null })).toBe(false);
  });
});
