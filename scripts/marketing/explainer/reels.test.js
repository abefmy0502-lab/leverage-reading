import { describe, it, expect } from 'vitest';
import { REELS, reelTexts, reelDuration } from './reels.mjs';
import { ART } from './art.mjs';
import { checkCopy } from '../weekly-drafts.mjs';
import { SAFE, glueSpaces } from '../safeZone.mjs';
import { SCENARIOS, openingTitle } from '../scenarios.mjs';

describe('動くイラストの動画の台本', () => {
  it('使わない言い方が無い', () => {
    for (const r of REELS) expect(checkCopy(reelTexts(r).join('\n'))).toEqual([]);
  });
  it('長さは 15〜40 秒・最後は終わりのカード', () => {
    for (const r of REELS) {
      expect(reelDuration(r)).toBeGreaterThanOrEqual(15);
      expect(reelDuration(r)).toBeLessThanOrEqual(40);
      expect(r.scenes.at(-1).items[0].type).toBe('end');
    }
  });
  it('絵はある物だけ・大事なものは Instagram の画面の字に重ならない所に', () => {
    for (const r of REELS) for (const s of r.scenes) for (const it of s.items) {
      if (it.type === 'art') {
        expect(ART[it.name]).toBeTruthy();
        expect(it.x).toBeGreaterThanOrEqual(SAFE.left);
        expect(it.x + it.w).toBeLessThanOrEqual(SAFE.right);
        const [, , vw, vh] = ART[it.name].viewBox.split(' ').map(Number);
        expect(it.y + (it.w * vh) / vw).toBeLessThanOrEqual(SAFE.bottom); // 絵の下の端も安全な範囲に
      }
      if (it.y != null) {
        expect(it.y).toBeGreaterThanOrEqual(SAFE.top);
        expect(it.y).toBeLessThan(SAFE.bottom);
      }
    }
  });
});

describe('冒頭の困っていることと改行', () => {
  it('概念の動画は 1 つめの場面に困っていることの大きな絵', () => {
    for (const r of REELS.filter((x) => x.name.startsWith('concept-'))) {
      const art = r.scenes[0].items.find((it) => it.type === 'art');
      expect(art?.name).toMatch(/^problem/);
      expect(art.w).toBeGreaterThanOrEqual(600);
    }
  });
  it('画面の動画の困っていることの絵はある物だけ・冒頭の題は「↓」より前', () => {
    for (const s of SCENARIOS.filter((x) => x.problem)) {
      expect(ART[s.problem]).toBeTruthy();
      expect(openingTitle(s)).not.toContain('↓');
      expect(s.steps.filter((st) => st.intro).every((st) => !st.tap && !st.type && !st.upload)).toBe(true);
    }
  });
  it('数と単位の間の半角の空きでは割らない', () => {
    expect(glueSpaces('1 日 15 分')).toBe('1\u00a0日\u00a015\u00a0分');
  });
});
