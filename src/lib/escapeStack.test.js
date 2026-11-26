// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { pushEscape, escapeDepth } from './escapeStack';

describe('Escape はいちばん上の層だけ（2026-11-26）', () => {
  it('上の層だけが受け、外すと下の層へ', () => {
    const a = vi.fn(); const b = vi.fn(); const win = vi.fn();
    window.addEventListener('keydown', win);
    const offA = pushEscape(a);
    const offB = pushEscape(b);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(win).not.toHaveBeenCalled();
    offB();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(a).toHaveBeenCalledTimes(1);
    offA();
    expect(escapeDepth()).toBe(0);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(win).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', win);
  });
});
