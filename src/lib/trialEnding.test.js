import { describe, it, expect } from 'vitest';
import { shouldShowTrialEnding, trialEndingCopy } from './trialNudge';

const end = '2026-11-08T03:00:00Z'; // 終わる日時（日本時間 11 月 8 日 12 時）
const cancelBy = Date.parse(end) - 24 * 3600 * 1000;

describe('7 日間無料が終わる前の知らせ', () => {
  it('解約の期限の 36 時間前から期限までだけ出す', () => {
    expect(shouldShowTrialEnding({ plan: 'trial', periodEnd: end, now: cancelBy - 37 * 3600 * 1000 })).toBe(false);
    expect(shouldShowTrialEnding({ plan: 'trial', periodEnd: end, now: cancelBy - 10 * 3600 * 1000 })).toBe(true);
    expect(shouldShowTrialEnding({ plan: 'trial', periodEnd: end, now: cancelBy + 1000 })).toBe(false);
  });
  it('無料期間でない・閉じた・日時が分からないときは出さない', () => {
    const now = cancelBy - 3600 * 1000;
    expect(shouldShowTrialEnding({ plan: 'paid', periodEnd: end, now })).toBe(false);
    expect(shouldShowTrialEnding({ plan: 'trial', periodEnd: end, now, dismissedFor: end })).toBe(false);
    expect(shouldShowTrialEnding({ plan: 'trial', periodEnd: null, now })).toBe(false);
  });
  it('日付だけ（「あと N 日」を書かない）・解約の期限とメモが残ることを書く', () => {
    const c = trialEndingCopy({ periodEnd: end, memoCount: 12 });
    expect(c.title).toBe('7 日間無料は 11月8日まで');
    expect(c.body).toContain('11月7日までに App Store で解約');
    expect(c.body).toContain('メモ 12 件');
    expect(c.body).toContain('メモはそのまま残ります');
    expect(`${c.title}${c.body}`).not.toMatch(/あと\s*\d+\s*日/);
  });
});
