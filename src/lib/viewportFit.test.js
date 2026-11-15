import { describe, it, expect } from 'vitest';
import { keyboardShown, installViewportFit, VIEWPORT_FIT_CLASS } from './viewportFit';

function fakeWin({ inner = 844, vvH = 844 } = {}) {
  const listeners = {};
  const classes = new Set();
  const props = {};
  const win = {
    innerHeight: inner, scrollY: 120,
    visualViewport: { height: vvH, offsetTop: 0, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: () => {} },
    document: { documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) }, style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } } } },
    addEventListener: () => {}, removeEventListener: () => {},
    requestAnimationFrame: (f) => { f(); return 1; }, cancelAnimationFrame: () => {},
    scrollTo: () => { win.scrollY = 0; },
  };
  return { win, listeners, classes, props };
}

describe('キーボードを開いても画面を見えている範囲に合わせる', () => {
  it('差が 100 を超えたら開いているとみなす', () => {
    expect(keyboardShown(844, 500)).toBe(true);
    expect(keyboardShown(844, 800)).toBe(false);
  });
  it('開いたら高さを合わせてページの送りを 0 に・閉じたら戻す', () => {
    const f = fakeWin({ vvH: 480 });
    const off = installViewportFit({ win: f.win });
    expect(f.classes.has(VIEWPORT_FIT_CLASS)).toBe(true);
    expect(f.props['--vv-height']).toBe('480px');
    expect(f.win.scrollY).toBe(0);
    f.win.visualViewport.height = 844;
    f.listeners.resize();
    expect(f.classes.has(VIEWPORT_FIT_CLASS)).toBe(false);
    off();
  });
  it('iPhone のアプリでは何もしない', () => {
    const f = fakeWin({ vvH: 480 });
    installViewportFit({ win: f.win, native: true });
    expect(f.classes.has(VIEWPORT_FIT_CLASS)).toBe(false);
  });
});
