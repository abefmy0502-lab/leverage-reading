import { describe, it, expect } from 'vitest';
import { REELS, reelTexts, reelDuration } from './reels.mjs';
import { ART } from './art.mjs';
import { checkCopy } from '../weekly-drafts.mjs';

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
        expect(it.x + it.w).toBeLessThanOrEqual(960);
      }
      if (it.y != null) {
        expect(it.y).toBeGreaterThanOrEqual(240);
        expect(it.y).toBeLessThan(1400);
      }
    }
  });
});
