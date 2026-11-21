// revealInScroller: 近い箱の中だけを最小限送る（2026-11-21）。DOM の代わりに小さな作り物で確かめる。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { revealInScroller, scrollParentOf } from './motion';

function rect(top, bottom) { return { top, bottom }; }

function makeTree({ boxTop = 0, boxBottom = 600, elTop, elBottom, overflow = 'auto', scrollable = true }) {
  const body = { parentElement: null };
  const box = {
    parentElement: body,
    _overflow: overflow,
    scrollHeight: scrollable ? 2000 : 600,
    clientHeight: 600,
    scrollTop: 100,
    calls: [],
    getBoundingClientRect: () => rect(boxTop, boxBottom),
    scrollTo(o) { this.calls.push(o); },
  };
  const el = {
    parentElement: box,
    _overflow: 'visible',
    getBoundingClientRect: () => rect(elTop, elBottom),
    scrollIntoView() { el.intoView = true; },
  };
  return { body, box, el };
}

let saved;
beforeEach(() => {
  saved = { window: globalThis.window, document: globalThis.document };
});
afterEach(() => {
  globalThis.window = saved.window;
  globalThis.document = saved.document;
});

function install(body, { vvHeight = null } = {}) {
  globalThis.document = { body, documentElement: {} };
  globalThis.window = {
    innerHeight: 800,
    visualViewport: vvHeight == null ? null : { offsetTop: 0, height: vvHeight },
    getComputedStyle: (n) => ({ overflowY: n._overflow || 'visible' }),
    matchMedia: () => ({ matches: true }),
  };
}

describe('revealInScroller', () => {
  it('見えていれば動かさない', () => {
    const t = makeTree({ elTop: 100, elBottom: 200 });
    install(t.body);
    revealInScroller(t.el);
    expect(t.box.calls).toEqual([]);
  });

  it('下に隠れていたら、箱の中だけを最小限送る', () => {
    const t = makeTree({ elTop: 560, elBottom: 640 });
    install(t.body);
    revealInScroller(t.el);
    expect(t.box.calls).toEqual([{ top: 100 + 56, behavior: 'auto' }]);
    expect(t.el.intoView).toBeUndefined();
  });

  it('キーボードで隠れた所も見えていないと数える', () => {
    const t = makeTree({ elTop: 300, elBottom: 380 });
    install(t.body, { vvHeight: 350 });
    revealInScroller(t.el);
    expect(t.box.calls).toEqual([{ top: 100 + 46, behavior: 'auto' }]);
  });

  it('箱より高いときは上端を見せる', () => {
    const t = makeTree({ elTop: 200, elBottom: 1200 });
    install(t.body);
    revealInScroller(t.el);
    expect(t.box.calls).toEqual([{ top: 100 + 184, behavior: 'auto' }]);
  });

  it('送れる箱が無ければ scrollIntoView に任せる', () => {
    const t = makeTree({ elTop: 560, elBottom: 640, scrollable: false });
    install(t.body);
    expect(scrollParentOf(t.el)).toBe(null);
    revealInScroller(t.el);
    expect(t.el.intoView).toBe(true);
  });
});
