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

import { isClaudeErrorString } from './ai';
describe('isClaudeErrorString', () => {
  it('月の上限・お試しの終了の文言はエラー扱い（成果物として保存しない）', () => {
    expect(isClaudeErrorString('今月の AI の利用上限に達しました。10月1日からまた使えます。')).toBe(true);
    expect(isClaudeErrorString('今月の AI 利用上限に達しました。')).toBe(true);
    expect(isClaudeErrorString('お試しの相談は、ここまでです。')).toBe(true);
    expect(isClaudeErrorString('AI 機能のご利用にはプランへのご登録が必要です。')).toBe(true);
    expect(isClaudeErrorString('今月のトークンは、ここまでです。10\u2060月\u20601\u2060日に 800 トークンに戻ります。')).toBe(true);
    expect(isClaudeErrorString('無料期間のトークンは、ここまでです。無料期間が終わると、毎月 800 トークン使えます。')).toBe(true);
    expect(isClaudeErrorString('この AI 機能は、プランでご利用いただけます。')).toBe(true);
    expect(isClaudeErrorString('今週、あえて手放せそうな仕事はどれでしょう？')).toBe(false);
  });
});
