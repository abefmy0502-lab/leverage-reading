import { describe, it, expect } from 'vitest';
import { renewalCandidate, yearReviewStats, renewalText, hasAnything, daysUntil, renewalKeyOf } from './renewalReview';

const at = (s) => Date.parse(s);
const DAY = 86400000;

describe('年額プランの更新の前に「この 1 年に残したもの」（2026-10-22）', () => {
  const now = at('2027-11-01T09:00:00+09:00');
  it('年額・有料・更新まで 30 日以内・その更新日をまだ閉じていないときだけ', () => {
    const periodEnd = new Date(now + 20 * DAY).toISOString();
    expect(renewalCandidate({ plan: 'paid', priceId: 'orime_annual', periodEnd, now })).toBe(true);
    expect(renewalCandidate({ plan: 'paid', priceId: 'orime_monthly', periodEnd, now })).toBe(false);
    expect(renewalCandidate({ plan: 'trial', priceId: 'orime_annual', periodEnd, now })).toBe(false);
    expect(renewalCandidate({ plan: 'free', priceId: 'orime_annual', periodEnd, now })).toBe(false);
    expect(renewalCandidate({ plan: 'paid', priceId: 'orime_annual', periodEnd: new Date(now + 40 * DAY).toISOString(), now })).toBe(false);
    expect(renewalCandidate({ plan: 'paid', priceId: 'orime_annual', periodEnd, now, doneKey: renewalKeyOf(periodEnd) })).toBe(false);
    expect(renewalCandidate({ plan: 'paid', priceId: 'orime_annual', periodEnd: null, now })).toBe(false);
    expect(daysUntil(periodEnd, now)).toBe(20);
  });
  it('この 1 年のメモ・読了・実行した行動・読書の時間を事実だけで数える', () => {
    const books = [
      { id: 'a', status: 'done', doneDate: '2027-06-01', actions: [{ done: true, completedAt: '2027-05-01T10:00:00+09:00' }, { done: false }] },
      { id: 'b', status: 'done', doneDate: '2026-01-01', actions: [{ done: true, completedAt: '2026-01-02T10:00:00+09:00' }] },
      { id: 'c', status: 'reading', actions: [{ done: true, created_at: '2027-10-01T10:00:00+09:00' }] },
    ];
    const memoTimes = [now - 10 * DAY, now - 400 * DAY, now - 100 * DAY];
    const sessions = [{ book_id: 'a', started_at: new Date(now - 5 * DAY).toISOString(), ended_at: new Date(now - 5 * DAY + 5400000).toISOString(), seconds: 5400 }];
    const s = yearReviewStats({ books, memoTimes, sessions, now });
    expect(s).toEqual({ memos: 2, finished: 1, actions: 2, hours: 1 });
    expect(hasAnything(s)).toBe(true);
    expect(hasAnything({ memos: 0, finished: 0, actions: 0, hours: 0 })).toBe(false);
  });
  it('文は 0 のものを書かず、数は事実だけ', () => {
    expect(renewalText({ days: 24, stats: { memos: 128, finished: 14, actions: 9, hours: 12 } }).lead)
      .toBe('年額プランの更新まで 24 日。この 1 年で、メモ 128 件・読了 14 冊・行動 9 つ・読書 12 時間');
    expect(renewalText({ days: 3, stats: { memos: 5, finished: 0, actions: 0, hours: 0 } }).lead).toBe('年額プランの更新まで 3 日。この 1 年で、メモ 5 件');
    expect(renewalText({ days: 0, stats: { memos: 5, finished: 0, actions: 0, hours: 0 } }).lead).toBe('年額プランの更新日です。この 1 年で、メモ 5 件');
    expect(renewalText({ days: 1, stats: { memos: 1, finished: 0, actions: 0, hours: 0 } }).action).toBe('記録を見る');
  });
});
