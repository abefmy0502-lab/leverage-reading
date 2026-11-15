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
