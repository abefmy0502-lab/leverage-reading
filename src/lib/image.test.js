import { describe, it, expect } from 'vitest';
import { chooseTileCount, verticalStrips, visionScale } from './image';

describe('本棚の写真を縦に分ける（2026-11-25）', () => {
  it('横向きの写真は 3 つ・縦向きは 2 つ・小さい写真は分けない', () => {
    expect(chooseTileCount(4032, 3024)).toBe(3);
    expect(chooseTileCount(3024, 4032)).toBe(2);
    expect(chooseTileCount(1200, 900)).toBe(1);
  });
  it('分けると 1 冊あたりの画素が増える', () => {
    const whole = visionScale(4032, 3024);
    const s = Math.min(...verticalStrips(4032, 3).map((r) => visionScale(r.w, 3024)));
    expect(s).toBeGreaterThan(whole * 1.4);
  });
  it('左から順に重なりつきで、端から端まで覆う', () => {
    const r = verticalStrips(1000, 2);
    expect(r[0].x).toBe(0);
    expect(r[0].x + r[0].w).toBeGreaterThan(r[1].x);
    expect(r[1].x + r[1].w).toBe(1000);
  });
});
