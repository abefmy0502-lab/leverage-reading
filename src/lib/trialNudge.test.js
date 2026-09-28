import { describe, it, expect } from 'vitest';
import {
  TRIAL_NUDGE_MEMOS,
  shouldShowTrialNudge,
  trialNudgeCopy,
  normalizeTrialLabel,
  trialPeriodOf,
  trialFirstPhrase,
  planNameFor,
} from './trialNudge';

const base = { plan: 'free', memoCount: 10, done: false, freeUsedUp: false, empty: true };

describe('shouldShowTrialNudge', () => {
  it('無料プランで、自分のメモが 10 件以上・まだ閉じていない・まだ話していないときだけ出す', () => {
    expect(TRIAL_NUDGE_MEMOS).toBe(10);
    expect(shouldShowTrialNudge(base)).toBe(true);
    expect(shouldShowTrialNudge({ ...base, memoCount: 43 })).toBe(true);
  });

  it('メモが 10 件に届かない・数え終わっていないときは出さない', () => {
    expect(shouldShowTrialNudge({ ...base, memoCount: 9 })).toBe(false);
    expect(shouldShowTrialNudge({ ...base, memoCount: 0 })).toBe(false);
    expect(shouldShowTrialNudge({ ...base, memoCount: null })).toBe(false);
  });

  it('無料プラン以外（7 日間無料の途中・有料・管理者・判定前）には出さない', () => {
    ['trial', 'paid', 'admin', null, undefined].forEach((plan) => {
      expect(shouldShowTrialNudge({ ...base, plan })).toBe(false);
    });
  });

  it('一度閉じた・押したら二度と出さない', () => {
    expect(shouldShowTrialNudge({ ...base, done: true })).toBe(false);
  });

  it('無料のトークンを使い切った案内と重ねない・会話の途中には出さない', () => {
    expect(shouldShowTrialNudge({ ...base, freeUsedUp: true })).toBe(false);
    expect(shouldShowTrialNudge({ ...base, empty: false })).toBe(false);
  });
});

describe('trialNudgeCopy', () => {
  it('無料期間が使えると分かっているときは「7 日間無料で試す」', () => {
    const c = trialNudgeCopy({ memoCount: 12, offer: '7 日間無料' });
    expect(c.kind).toBe('trial');
    expect(c.title).toBe('相談相手が育ってきました');
    expect(c.body).toBe('メモが 12 件たまりました。7 日間無料で、AI 選書・テーマまとめなど、すべての AI を試せます。');
    expect(c.cta).toBe('7 日間無料で試す');
  });

  it('使えない・分からないときは無料期間を約束しない（「プランを見る」）', () => {
    const c = trialNudgeCopy({ memoCount: 10, offer: '' });
    expect(c.kind).toBe('plan');
    expect(c.body).not.toMatch(/無料/);
    expect(c.cta).toBe('プランを見る');
  });
});

describe('無料期間の書き方', () => {
  it('ストア・env の「7日間無料」を「7 日間無料」にそろえる', () => {
    expect(normalizeTrialLabel('7日間無料')).toBe('7 日間無料');
    expect(normalizeTrialLabel('7 日間無料')).toBe('7 日間無料');
    expect(normalizeTrialLabel('1ヶ月無料')).toBe('1 ヶ月無料');
    expect(normalizeTrialLabel('')).toBe('');
  });

  it('期間だけ・「最初の 7 日間は無料」を取り出す', () => {
    expect(trialPeriodOf('7日間無料')).toBe('7 日間');
    expect(trialFirstPhrase('7日間無料')).toBe('最初の 7 日間は無料');
    expect(trialFirstPhrase('2週間無料')).toBe('最初の 2 週間は無料');
    // 「無料」で終わらない書き方はそのまま
    expect(trialPeriodOf('お試しあり')).toBe('');
    expect(trialFirstPhrase('お試しあり')).toBe('お試しあり');
  });
});

describe('planNameFor（設定の「プラン」の行）', () => {
  it('無料プラン / 7 日間無料（◯月◯日まで）/ 月額プラン / 年額プラン のどれか 1 つ', () => {
    expect(planNameFor({ plan: 'free' })).toBe('無料プラン');
    expect(planNameFor({ plan: 'trial', trialEnd: '10月3日' })).toBe('7 日間無料（10月3日まで）');
    expect(planNameFor({ plan: 'trial' })).toBe('7 日間無料');
    expect(planNameFor({ plan: 'paid', priceId: 'orime_annual' })).toBe('年額プラン');
    expect(planNameFor({ plan: 'paid', priceId: 'orime_yearly' })).toBe('年額プラン');
    expect(planNameFor({ plan: 'paid', priceId: 'orime_monthly' })).toBe('月額プラン');
  });

  it('月額か年額か分からない契約は「利用中」', () => {
    expect(planNameFor({ plan: 'paid', priceId: 'price_1Mx2abc' })).toBe('利用中');
    expect(planNameFor({ plan: 'paid' })).toBe('利用中');
  });
});
