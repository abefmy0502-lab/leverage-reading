import { describe, it, expect } from 'vitest';
import { reaskCandidate, pickReask, reaskText, REASK_MIN_MEMOS } from './reaskNudge';

const DAY = 86400000;
const at = (s) => Date.parse(s);

describe('先月の相談を、いまのメモでもう一度（ホームの 1 行・2026-10-21）', () => {
  it('月のはじめの 7 日間だけ・その月に押すか閉じたら出さない', () => {
    expect(reaskCandidate({ now: at('2026-11-03T09:00:00+09:00') })).toBe(true);
    expect(reaskCandidate({ now: at('2026-11-08T09:00:00+09:00') })).toBe(false);
    expect(reaskCandidate({ now: at('2026-11-03T09:00:00+09:00'), doneMonth: '2026-11' })).toBe(false);
    expect(reaskCandidate({ now: at('2026-11-03T09:00:00+09:00'), doneMonth: '2026-10' })).toBe(true);
  });
  it('先月以前のいちばん新しい相談を選び、そのあとに増えたメモが 3 件以上のときだけ', () => {
    const now = at('2026-11-02T09:00:00+09:00');
    const consults = [
      { content: '部下に任せられない', created_at: '2026-10-20T10:00:00+09:00' },
      { content: '古い相談', created_at: '2026-09-01T10:00:00+09:00' },
      { content: '今月の相談', created_at: '2026-11-01T10:00:00+09:00' },
    ];
    const memos = [at('2026-10-21T00:00:00+09:00'), at('2026-10-25T00:00:00+09:00'), at('2026-11-01T00:00:00+09:00')];
    expect(pickReask({ consults, memoTimes: memos, now })).toEqual({ question: '部下に任せられない', memos: 3 });
    expect(pickReask({ consults, memoTimes: memos.slice(0, REASK_MIN_MEMOS - 1), now })).toBeNull();
    expect(pickReask({ consults: [consults[2]], memoTimes: memos, now })).toBeNull();
  });
  it('文は『』の中を 18 字で切り、数は事実だけ', () => {
    const t = reaskText({ question: 'とても長い相談の文章で十八文字を超えるものです', memos: 5 });
    expect(t.lead).toBe('先月の相談『とても長い相談の文章で十八文字を超え…』のあと、メモが 5 件増えました。');
    expect(t.action).toBe('もう一度相談する');
    expect(reaskText({ question: '短い', memos: 3 }).lead).toContain('『短い』');
    expect(DAY).toBe(86400000);
  });
});
