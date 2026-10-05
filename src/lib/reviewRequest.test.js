// ⭐️ レビュー依頼（2026-10-04・App Store 審査ガイドライン 5.6.1）:
// iOS（ネイティブ）は Apple の仕組み（プラグイン 'InAppReview' の requestReview）だけ。プラグインが無いビルドでは
// 何も出さない（独自のトーストで App Store に送らない）。Web は実 URL があるときだけトースト。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cap = vi.hoisted(() => ({ native: false, available: false, requestReview: vi.fn(() => Promise.resolve()) }));
const store = vi.hoisted(() => ({ live: true }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => cap.native,
    isPluginAvailable: (name) => cap.available && name === 'InAppReview',
  },
  registerPlugin: () => ({ requestReview: cap.requestReview }),
}));
vi.mock('./appStore', () => ({
  APP_STORE_URL: 'https://apps.apple.com/jp/app/id123',
  get isAppStoreLive() { return store.live; },
}));

import { shouldAskForReview, markReviewAsked, askForReview, canUseNativeReview } from './reviewRequest';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  cap.native = false;
  cap.available = false;
  cap.requestReview.mockClear();
  store.live = true;
});
afterEach(() => vi.unstubAllGlobals());

describe('iOS（ネイティブ）', () => {
  it('Apple の仕組みが使えないビルドでは、頼まない・トーストも出さない', () => {
    cap.native = true;
    expect(canUseNativeReview()).toBe(false);
    expect(shouldAskForReview()).toBe(false);
    const toast = { show: vi.fn() };
    expect(askForReview(toast)).toBe(null);
    expect(toast.show).not.toHaveBeenCalled();
    expect(cap.requestReview).not.toHaveBeenCalled();
  });

  it('プラグインがあれば Apple の requestReview を呼び、独自のトーストは出さない', () => {
    cap.native = true;
    cap.available = true;
    store.live = false; // ネイティブは App Store の URL が無くても Apple の仕組みで頼める
    expect(shouldAskForReview()).toBe(true);
    const toast = { show: vi.fn() };
    expect(askForReview(toast)).toBe('native');
    expect(cap.requestReview).toHaveBeenCalledTimes(1);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('一度頼んだら二度目は頼まない', () => {
    cap.native = true;
    cap.available = true;
    markReviewAsked();
    expect(shouldAskForReview()).toBe(false);
  });

  it('requestReview が失敗しても投げない', async () => {
    cap.native = true;
    cap.available = true;
    cap.requestReview.mockImplementationOnce(() => Promise.reject(new Error('not implemented')));
    expect(() => askForReview()).not.toThrow();
    await Promise.resolve();
  });
});

describe('Web', () => {
  it('実 URL があるときだけトーストで頼む', () => {
    expect(shouldAskForReview()).toBe(true);
    const toast = { show: vi.fn() };
    expect(askForReview(toast)).toBe('toast');
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(cap.requestReview).not.toHaveBeenCalled();
  });

  it('実 URL が無いときは頼まない', () => {
    store.live = false;
    expect(shouldAskForReview()).toBe(false);
  });
});
