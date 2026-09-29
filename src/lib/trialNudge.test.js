import { describe, it, expect } from 'vitest';
import {
  TRIAL_NUDGE_MEMOS,
  shouldShowTrialNudge,
  trialNudgeCopy,
  normalizeTrialLabel,
  trialPeriodOf,
  trialFirstPhrase,
  planNameFor,
  planPeriodOf,
  trialRenewalLine,
  shortPriceLabel,
  trialCancelNote,
  trialCancelByTime,
  trialCancelShortLine,
} from './trialNudge';

describe('trialCancelShortLine（7 日間無料のトークンを使い切ったときの解約の 1 行）', () => {
  it('終わる 24 時間前の日付（日本時間）だけを出す', () => {
    // 10月4日 10:00 JST に終わる → 10月3日 10:00 JST までに解約
    expect(trialCancelShortLine('2026-10-04T01:00:00Z')).toBe('続けないときは 10月3日までに解約（無料プランに戻ります）');
    // 10月4日 08:00 JST に終わる → 10月3日 08:00 JST（UTC では 10月2日 23:00）
    expect(trialCancelShortLine('2026-10-03T23:00:00Z')).toBe('続けないときは 10月3日までに解約（無料プランに戻ります）');
  });
  it('終わる日が分からなければ空', () => {
    expect(trialCancelShortLine('')).toBe('');
    expect(trialCancelShortLine(null)).toBe('');
  });
});

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
    expect(c.body).toBe('メモがたまってきました。7 日間無料で、AI 選書・テーマまとめなど、すべての AI を試せます。');
    // 件数は入れない（相談の上部の「メモ・学びなど N 件」と食い違わないように）
    expect(c.body).not.toMatch(/件/);
    expect(c.cta).toBe('7 日間無料で試す');
  });

  it('使えない・分からないときは無料期間を約束しない（「プランを見る」）', () => {
    const c = trialNudgeCopy({ memoCount: 10, offer: '' });
    expect(c.kind).toBe('plan');
    expect(c.body).not.toMatch(/無料/);
    expect(c.body).toBe('メモがたまってきました。AI 選書・テーマまとめなど、すべての AI を使えるプランがあります。');
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

describe('trialRenewalLine（無料期間のあと・設定の「プラン」の行の下）', () => {
  it('product id から期間を読んで「その後 年額 ¥12,800（税込）で自動更新」（日付はプランの行にある）', () => {
    expect(planPeriodOf('orime_annual')).toBe('annual');
    expect(planPeriodOf('orime_monthly')).toBe('monthly');
    expect(planPeriodOf('price_1Mx2abc')).toBe('');
    expect(trialRenewalLine({ priceId: 'orime_annual', trialEnd: '10月4日' })).toBe('その後 年額 ¥12,800（税込）で自動更新');
    expect(trialRenewalLine({ priceId: 'orime_monthly', trialEnd: '10月4日' })).toBe('その後 月額 ¥1,480（税込）で自動更新');
  });

  it('期間が分からなければ金額を出さず「プラン」・日付が分からなければ「無料期間のあと」', () => {
    expect(trialRenewalLine({ priceId: '', trialEnd: '10月4日' })).toBe('その後 プラン（自動更新）');
    expect(trialRenewalLine({ priceId: 'orime_annual' })).toBe('無料期間のあと 年額 ¥12,800（税込）で自動更新');
  });

  it('表示ラベルを差し替えても「月あたり…」を外して使う', () => {
    const labels = { annual: { price: '年額 ¥9,800（税込・月あたり約¥816）' }, monthly: { price: '月額 ¥980' } };
    expect(trialRenewalLine({ priceId: 'orime_annual', trialEnd: '10月4日', labels })).toBe('その後 年額 ¥9,800（税込）で自動更新');
    expect(trialRenewalLine({ priceId: 'orime_monthly', trialEnd: '10月4日', labels })).toBe('その後 月額 ¥980で自動更新');
    expect(shortPriceLabel('月額 ¥1,480（税込）')).toBe('月額 ¥1,480（税込）');
  });
});

describe('trialCancelNote（無料期間のうちに解約すれば料金はかからない）', () => {
  it('終わる 24 時間前の日付で書く', () => {
    expect(trialCancelNote('10月3日')).toBe('10月3日（終わる 24 時間前）までに解約すれば、料金はかかりません');
    expect(trialCancelNote('')).toBe('無料期間が終わる 24 時間前までに解約すれば、料金はかかりません');
  });
  it('解約の期限は終わる時刻の 24 時間前', () => {
    const end = Date.parse('2026-10-04T01:00:00Z');
    expect(trialCancelByTime('2026-10-04T01:00:00Z')).toBe(end - 24 * 3600 * 1000);
    expect(trialCancelByTime('')).toBe(null);
  });
});
