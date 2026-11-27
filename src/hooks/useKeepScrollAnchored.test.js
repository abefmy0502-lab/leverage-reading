import { describe, it, expect } from 'vitest';
import { anchoredScrollTop } from './useKeepScrollAnchored';

describe('会話の欄の上端が動いても、読んでいる文を動かさない（2026-11-27）', () => {
  it('上の行が戻って欄が 117 下がったら、送る位置も 117 足す', () => {
    expect(anchoredScrollTop(154, 5, 122)).toBe(271);
  });
  it('上の行が消えて欄が上がったら引く（0 より下にはしない）', () => {
    expect(anchoredScrollTop(300, 122, 5)).toBe(183);
    expect(anchoredScrollTop(40, 122, 5)).toBe(0);
  });
  it('動いていなければ何もしない', () => {
    expect(anchoredScrollTop(100, 122, 122.4)).toBe(null);
  });
});
