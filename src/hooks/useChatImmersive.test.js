import { describe, it, expect } from 'vitest';
import { nextScrollDown } from './useChatImmersive';

describe('会話を広く使う（下のタブを隠すか）', () => {
  it('下へ読み進めると隠し、上へ戻すと出す', () => {
    expect(nextScrollDown(100, 160, false)).toBe(true);
    expect(nextScrollDown(300, 260, true)).toBe(false);
  });
  it('小さな揺れでは変えない・先頭近くでは必ず出す', () => {
    expect(nextScrollDown(200, 204, true)).toBe(true);
    expect(nextScrollDown(200, 196, false)).toBe(false);
    expect(nextScrollDown(10, 40, true)).toBe(false);
  });
});

describe('いちばん下で震えない（2026-11-17）', () => {
  it('隠したまま、いちばん下で位置が押し戻されても出さない', () => {
    expect(nextScrollDown(900, 800, true, { atBottom: true })).toBe(true);
    expect(nextScrollDown(900, 800, true, { atBottom: false })).toBe(false);
  });
  it('先頭近くは、いちばん下でも出す', () => {
    expect(nextScrollDown(60, 20, true, { atBottom: true })).toBe(false);
  });
});

describe('本人が動かしたときだけ畳む（2026-11-27）', () => {
  it('指が触れている間・慣性の間は数え、アプリが送っただけのときは数えない', async () => {
    const { isUserScroll } = await import('./useChatImmersive');
    expect(isUserScroll({ touching: true, now: 5000, until: 0 })).toBe(true);
    expect(isUserScroll({ touching: false, now: 5000, until: 5200 })).toBe(true);
    expect(isUserScroll({ touching: false, now: 5000, until: 4000 })).toBe(false);
  });
});
