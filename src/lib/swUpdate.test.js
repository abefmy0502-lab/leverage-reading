import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// swUpdate.js はモジュール内に状態を持つので、テストごとに読み込み直す。
function setupEnv({ controller }) {
  const listeners = {};
  const reg = {
    waiting: null,
    installing: null,
    active: null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(),
  };
  const sw = {
    controller,
    register: vi.fn(() => Promise.resolve(reg)),
    getRegistration: vi.fn(() => Promise.resolve(reg)),
    addEventListener: (type, fn) => {
      (listeners[type] ||= []).push(fn);
    },
  };
  const reload = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: sw });
  vi.stubGlobal('window', { location: { reload } });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    activeElement: null,
  });
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn());
  return { reg, sw, reload, fire };
}

describe('swUpdate の controllerchange', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('初回訪問（まだ制御されていない）の clients.claim では再読込しない', async () => {
    const env = setupEnv({ controller: null });
    const mod = await import('./swUpdate.js');
    mod.initServiceWorker({});
    env.fire('controllerchange');
    vi.advanceTimersByTime(100);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('初回訪問でも、更新を頼んだあとなら再読込する', async () => {
    const env = setupEnv({ controller: null });
    const mod = await import('./swUpdate.js');
    mod.initServiceWorker({});
    await Promise.resolve();
    await Promise.resolve();
    env.reg.waiting = { postMessage: vi.fn() };
    mod.applyUpdate();
    expect(env.reg.waiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    env.fire('controllerchange');
    vi.advanceTimersByTime(100);
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('すでに制御されていたページは、新しい版に切り替わったら再読込する', async () => {
    const env = setupEnv({ controller: {} });
    const mod = await import('./swUpdate.js');
    mod.initServiceWorker({});
    env.fire('controllerchange');
    vi.advanceTimersByTime(100);
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('初回の claim のあとに別タブが更新したときは再読込する（版をそろえる）', async () => {
    const env = setupEnv({ controller: null });
    const mod = await import('./swUpdate.js');
    mod.initServiceWorker({});
    env.fire('controllerchange'); // 初回の claim
    vi.advanceTimersByTime(100);
    expect(env.reload).not.toHaveBeenCalled();
    env.fire('controllerchange'); // 別タブの更新で新しい版へ
    vi.advanceTimersByTime(100);
    expect(env.reload).toHaveBeenCalledTimes(1);
  });
});
