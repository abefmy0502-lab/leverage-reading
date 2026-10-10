// 📊 計測の区分と app_open の 1 日 1 回（2026-10-10）。
import { describe, it, expect } from 'vitest';
import { memoCountBucket, minutesBucket, shouldTrackAppOpen } from './analytics';
import { withPushKind } from './nativePush';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('memoCountBucket（メモの件数の区分）', () => {
  it('数そのものは送らず、まとまりで', () => {
    expect(memoCountBucket(null)).toBe('unknown');
    expect(memoCountBucket(-1)).toBe('unknown');
    expect(memoCountBucket(0)).toBe('0');
    expect(memoCountBucket(2)).toBe('1-2');
    expect(memoCountBucket(9)).toBe('3-9');
    expect(memoCountBucket(10)).toBe('10-29');
    expect(memoCountBucket(120)).toBe('30+');
  });
});

describe('minutesBucket（読んだ時間の区分）', () => {
  it('秒から分の区分へ', () => {
    expect(minutesBucket(60)).toBe('<5');
    expect(minutesBucket(10 * 60)).toBe('5-14');
    expect(minutesBucket(15 * 60)).toBe('15-29');
    expect(minutesBucket(45 * 60)).toBe('30-59');
    expect(minutesBucket(90 * 60)).toBe('60+');
    expect(minutesBucket('x')).toBe('unknown');
  });
});

describe('shouldTrackAppOpen（起動は毎回・前面に戻ったときは 1 日 1 回）', () => {
  const day1 = new Date(2026, 9, 10, 9).getTime();
  const day1Later = new Date(2026, 9, 10, 20).getTime();
  const day2 = new Date(2026, 9, 11, 8).getTime();
  it('起動のあと同じ日に前面に戻っても送らない・次の日は送る', () => {
    const storage = memStore();
    expect(shouldTrackAppOpen('launch', { now: day1, storage })).toBe(true);
    expect(shouldTrackAppOpen('foreground', { now: day1Later, storage })).toBe(false);
    expect(shouldTrackAppOpen('foreground', { now: day2, storage })).toBe(true);
    expect(shouldTrackAppOpen('foreground', { now: day2, storage })).toBe(false);
    expect(shouldTrackAppOpen('launch', { now: day2, storage })).toBe(true);
  });
  it('覚えておけない端末でも、起動では送る', () => {
    expect(shouldTrackAppOpen('launch', { now: day1, storage: null })).toBe(true);
  });
});

describe('withPushKind（通知から開いた印）', () => {
  it('前の版の通知にも種類を足す・もう付いていればそのまま', () => {
    expect(withPushKind('/?recall=m1', { recall: 'm1' })).toBe('/?recall=m1&push=recall');
    expect(withPushKind('/?tab=review&sub=action', { kind: 'action_deadline' })).toBe('/?tab=review&sub=action&push=action_deadline');
    expect(withPushKind('/?book=b&memo=m&push=recall', { kind: 'recall' })).toBe('/?book=b&memo=m&push=recall');
    expect(withPushKind('/', {})).toBe('/');
  });
});
