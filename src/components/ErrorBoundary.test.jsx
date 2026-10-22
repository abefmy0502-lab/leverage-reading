import { describe, it, expect } from 'vitest';
import { isChunkLoadError, reloadOnce } from './ErrorBoundary';

describe('ErrorBoundary: あとから読む JS が取れなかったときは 1 回だけ読み直す（2026-10-22）', () => {
  it('ブラウザごとの文を見分ける', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Landing-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
  it('同じ URL では 1 回だけ・残せないときは読み直さない', () => {
    const store = new Map();
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
    expect(reloadOnce(storage, 'https://a/lp')).toBe(true);
    expect(reloadOnce(storage, 'https://a/lp')).toBe(false);
    expect(reloadOnce(storage, 'https://a/')).toBe(true);
    expect(reloadOnce(null, 'https://a/lp')).toBe(false);
    expect(reloadOnce({ getItem: () => { throw new Error('x'); }, setItem: () => {} }, 'https://a/lp')).toBe(false);
  });
});
