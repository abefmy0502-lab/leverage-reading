import { describe, it, expect } from 'vitest';
import { evidenceFromRefs } from './ai';

const now = Date.parse('2026-09-27T00:00:00Z');
const src = [
  { title: 'イシューからはじめよ', page: 25, created_at: '2026-05-20T00:00:00Z', personal: false, card: true },
  { title: '1兆ドルコーチ', page: 61, created_at: '2026-09-10T00:00:00Z', personal: false, card: true },
  { title: '', page: null, created_at: '2026-01-05T09:00:00Z', personal: true, card: true },
];

describe('evidenceFromRefs', () => {
  it('渡したメモと一致した参照だけを数え、いちばん古い日付を出す', () => {
    const line = evidenceFromRefs([
      '📚 安宅和人『イシューからはじめよ』P.25',
      '📚 エリック・シュミット『1兆ドルコーチ』P.61',
    ], src, now);
    expect(line).toBe('あなたのメモ 2 件から答えました（いちばん古いのは 4 か月前）');
  });
  it('学びは日付で一致', () => {
    expect(evidenceFromRefs(['💡 自分の学び (2026-01-05 / 仕事)'], src, now)).toContain('8 か月前');
  });
  it('渡していない本は数えない（盛らない）', () => {
    expect(evidenceFromRefs(['📚 誰か『存在しない本』P.1'], src, now)).toBeNull();
  });
  it('書名だけの一致は数えるが、日付は出さない', () => {
    expect(evidenceFromRefs(['📖 安宅和人『イシューからはじめよ』まとめメモ'], src, now)).toBe('あなたのメモ 1 件から答えました');
  });
  it('新しいメモだけなら日付は付けない', () => {
    expect(evidenceFromRefs(['📚 エリック・シュミット『1兆ドルコーチ』P.61'], src, now)).toBe('あなたのメモ 1 件から答えました（いちばん古いのは 2 週間前）');
  });
});
