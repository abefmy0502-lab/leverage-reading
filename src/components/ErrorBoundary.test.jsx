import { describe, it, expect } from 'vitest';
import { isChunkLoadError, reloadOnce, nextChunkRetry, CHUNK_RETRY_DELAYS_MS } from './ErrorBoundary';

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

describe('nextChunkRetry', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
  it('間をあけて 4 回まで読み直し、尽きたら null', () => {
    const st = mem();
    const got = [0, 1, 2, 3, 4].map(() => nextChunkRetry(st, 'https://a/', 1000));
    expect(got).toEqual([...CHUNK_RETRY_DELAYS_MS, null]);
  });
  it('5 分たったら数え直す・URL が違えば別に数える', () => {
    const st = mem();
    for (let i = 0; i < 4; i += 1) nextChunkRetry(st, 'https://a/', 1000);
    expect(nextChunkRetry(st, 'https://a/', 1000 + 5 * 60 * 1000)).toBe(CHUNK_RETRY_DELAYS_MS[0]);
    expect(nextChunkRetry(st, 'https://b/', 1000 + 5 * 60 * 1000)).toBe(CHUNK_RETRY_DELAYS_MS[0]);
  });
  it('端末に残せなければ読み直さない', () => {
    expect(nextChunkRetry(null, 'https://a/', 0)).toBe(null);
  });
});
