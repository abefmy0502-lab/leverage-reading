// ⏱ 集中モードの色（tokens.css・2026-10-09 ui-critic）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');

const declsOf = (body) => Object.fromEntries(
  [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

function hex(c) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
function lum(rgb) {
  const [r, g, b] = rgb.map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('集中モードの色', () => {
  const root = declsOf(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')));

  it('メモを書くシートを包む .focus-dark-scope は、暗い画面の値と同じ', () => {
    const dark = declsOf(/:root\[data-dark-ready\]\s*\{([^}]*)\}/.exec(css)[1]);
    const scope = declsOf(/\.focus-dark-scope\s*\{([^}]*)\}/.exec(css)[1]);
    expect(Object.keys(dark).length).toBeGreaterThan(10);
    expect(scope).toEqual(dark);
  });

  it('押せる物の枠 --focus-line-strong は、地と終わったときの地の両方で 3:1 以上', () => {
    const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(root['--focus-line-strong']);
    const [fr, fg, fb, a] = m.slice(1).map(Number);
    for (const bg of ['--focus-bg', '--focus-bg-done']) {
      const b = hex(root[bg]);
      const mixed = [fr, fg, fb].map((v, i) => v * a + b[i] * (1 - a));
      expect(ratio(mixed, b), bg).toBeGreaterThanOrEqual(3);
    }
  });

  it('文字は地の上で本文 4.5:1 以上（終わったときの明るい地でも）', () => {
    for (const bg of ['--focus-bg', '--focus-bg-done']) {
      for (const ink of ['--focus-ink', '--focus-ink-2', '--focus-ink-3']) {
        expect(ratio(hex(root[ink]), hex(root[bg])), `${ink} / ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(ratio(hex(root['--focus-accent-ink']), hex(root['--focus-accent']))).toBeGreaterThanOrEqual(4.5);
  });
});
