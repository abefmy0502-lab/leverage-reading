import { describe, it, expect, vi, beforeAll } from 'vitest';

// jsdom なしで確かめる（document の代わりに EventTarget・キーの事件は key を足した Event）
const doc = new EventTarget();
const esc = () => { const e = new Event('keydown', { cancelable: true }); e.key = 'Escape'; return e; };
let pushEscape; let escapeDepth;
beforeAll(async () => {
  globalThis.document = doc;
  ({ pushEscape, escapeDepth } = await import('./escapeStack'));
});

describe('Escape はいちばん上の層だけ（2026-11-26）', () => {
  it('上の層だけが受け、外すと下の層へ・層が無ければ下の受け手へ', () => {
    const a = vi.fn(); const b = vi.fn(); const below = vi.fn();
    const offA = pushEscape(a);
    const offB = pushEscape(b);
    doc.addEventListener('keydown', below); // あとから足した受け手（同じ段の capture の後）
    doc.dispatchEvent(esc());
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(below).not.toHaveBeenCalled();
    offB();
    doc.dispatchEvent(esc());
    expect(a).toHaveBeenCalledTimes(1);
    offA();
    expect(escapeDepth()).toBe(0);
    doc.dispatchEvent(esc());
    expect(below).toHaveBeenCalledTimes(1);
  });
});
