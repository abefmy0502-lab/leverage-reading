import { describe, it, expect } from 'vitest';
import { annualSeasonKey, annualNudgeCandidate, annualAmounts, annualNudgeText } from './annualNudge';

const at = (s) => Date.parse(s);

describe('12 月・1 月の年額プランの 1 行（2026-10-22）', () => {
  it('12 月と 1 月だけ・同じ冬は 1 つの印', () => {
    expect(annualSeasonKey(at('2026-12-01T00:30:00+09:00'))).toBe('2027');
    expect(annualSeasonKey(at('2027-01-31T23:00:00+09:00'))).toBe('2027');
    expect(annualSeasonKey(at('2027-02-01T00:00:00+09:00'))).toBeNull();
    expect(annualSeasonKey(at('2026-11-30T23:59:00+09:00'))).toBeNull();
  });
  it('月額の有料の人だけ・押すか閉じたらその冬は出さない', () => {
    const now = at('2026-12-05T09:00:00+09:00');
    expect(annualNudgeCandidate({ plan: 'paid', priceId: 'orime_monthly', now })).toBe(true);
    expect(annualNudgeCandidate({ plan: 'paid', priceId: 'orime_annual', now })).toBe(false);
    expect(annualNudgeCandidate({ plan: 'trial', priceId: 'orime_monthly', now })).toBe(false);
    expect(annualNudgeCandidate({ plan: 'free', priceId: '', now })).toBe(false);
    expect(annualNudgeCandidate({ plan: 'paid', priceId: 'orime_monthly', now, doneSeason: '2027' })).toBe(false);
    expect(annualNudgeCandidate({ plan: 'paid', priceId: 'orime_monthly', now: at('2026-10-22T09:00:00+09:00') })).toBe(false);
  });
  it('金額は表示ラベルから読み、12 月と 1 月で頭の言葉が変わる', () => {
    expect(annualAmounts('年額 ¥12,800（税込・月あたり約¥1,066）')).toEqual({ yearly: '¥12,800', monthly: '約\u00a0¥1,066' });
    expect(annualAmounts('年額 ¥12,800')).toBeNull();
    expect(annualNudgeText(at('2026-12-05T09:00:00+09:00'), '年額 ¥12,800（税込・月あたり約¥1,066）').lead)
      .toBe('来年も読むなら、年額プランは 月あたり\u00a0約\u00a0¥1,066（年額\u00a0¥12,800）。');
    expect(annualNudgeText(at('2027-01-05T09:00:00+09:00'), '年額 ¥12,800（税込・月あたり約¥1,066）').lead)
      .toBe('今年こそ読むなら、年額プランは 月あたり\u00a0約\u00a0¥1,066（年額\u00a0¥12,800）。');
    expect(annualNudgeText(at('2027-01-05T09:00:00+09:00'), '年額 ¥12,800').lead).toBe('今年こそ読むなら、年額プランもあります。');
    expect(annualNudgeText(at('2027-01-05T09:00:00+09:00')).action).toBe('年額プランを見る');
  });
});
