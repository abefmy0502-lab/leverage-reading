import { describe, it, expect } from 'vitest';
import { frequentMemoTags } from './memoTags';

describe('frequentMemoTags', () => {
  it('その本のメモのタグを多い順・本のタグで埋める・@ は出さない・重複なし', () => {
    const memos = [{ tags: ['習慣', '@会話'] }, { tags: ['習慣', '集中'] }, { tags: [] }];
    expect(frequentMemoTags(memos, ['集中', '仕事', '@x'], 3)).toEqual(['習慣', '集中', '仕事']);
    expect(frequentMemoTags(undefined, undefined)).toEqual([]);
  });
});
