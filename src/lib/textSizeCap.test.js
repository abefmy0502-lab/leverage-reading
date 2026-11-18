import { describe, it, expect } from 'vitest';
import { capFontSize, TEXT_SIZE_CAP_PX, installTextSizeCap } from './textSizeCap.js';

describe('capFontSize（文字の大きさの上限）', () => {
  it('本文の 2 倍（34px）を超えたときだけ止める', () => {
    expect(TEXT_SIZE_CAP_PX).toBe(34);
    expect(capFontSize(17)).toBeNull();
    expect(capFontSize(34)).toBeNull();
    expect(capFontSize(53)).toBe(34);
    expect(capFontSize('NaN')).toBeNull();
  });

  it('端末の大きさを測り直してから上書きする', () => {
    let computed = 53;
    const props = {};
    const style = {
      removeProperty: (k) => { delete props[k]; computed = 53; },
      setProperty: (k, v) => { props[k] = v; },
    };
    const doc = { documentElement: { style }, visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
    const win = { getComputedStyle: () => ({ fontSize: `${computed}px` }), addEventListener: () => {}, removeEventListener: () => {} };
    installTextSizeCap(doc, win);
    expect(props['font-size']).toBe('34px');
  });
});
