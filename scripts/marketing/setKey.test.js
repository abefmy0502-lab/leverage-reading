import { describe, it, expect } from 'vitest';
import { cleanKey, keyShapeProblem } from './set-key.mjs';

describe('動画の声の鍵を入れる前の確かめ', () => {
  const k = `sk-proj-${'a'.repeat(60)}`;
  it('空白・改行・貼り付けの見えない印を取り除く', () => {
    expect(cleanKey(` \u001b[200~${k}\u001b[201~\n`)).toBe(k);
  });
  it('形が違うときは理由を返す', () => {
    expect(keyShapeProblem(k)).toBeNull();
    expect(keyShapeProblem('')).toMatch('何も');
    expect(keyShapeProblem('abc'.repeat(20))).toMatch('sk-');
    expect(keyShapeProblem('sk-short')).toMatch('短すぎ');
  });
});
