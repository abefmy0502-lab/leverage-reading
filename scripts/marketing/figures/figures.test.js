import { describe, it, expect } from 'vitest';
import { FIGURES, checkFigure } from './figures.mjs';
import { html } from './render-figures.mjs';

describe('figures', () => {
  it('どの図も決まりを守る', () => {
    for (const f of FIGURES) expect(checkFigure(f), f.name).toEqual([]);
  });
  it('名前が重ならない', () => {
    const names = FIGURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('どの図にも Orime のロゴが入る', () => {
    for (const f of FIGURES) {
      const h = html(f);
      expect(h).toContain('class="brand"');
      expect(h).toContain('data:image/png;base64,');
    }
  });
  it('使わない言葉を見つける', () => {
    expect(checkFigure({ name: 'x', size: 'x', type: 'quote', text: '必ず続く' }).length).toBeGreaterThan(0);
  });
});
