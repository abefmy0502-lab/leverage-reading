import { describe, it, expect } from 'vitest';
import {
  savingsLabel, introOfferOf, freeTrialLabel, formatFreeTrial, introPriceLabel,
  buildStoreLabels, billedLine, billedShortOf, planCtaLabel, trialPlanOf,
} from './planOffers';

// RevenueCat の StoreProduct に似せた形。
const base = {
  monthly: { id: 'monthly', name: '月額プラン', price: '月額 ¥1,480（税込）' },
  annual: { id: 'annual', name: '年額プラン', price: '年額 ¥12,800（税込・月あたり約¥1,066）', save: 'x' },
};
const freeWeek = { price: 0, priceString: '¥0', periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 };
const foundingYear = { price: 9800, priceString: '¥9,800', periodUnit: 'YEAR', periodNumberOfUnits: 1, cycles: 1 };
const monthly = (introPrice = null) => ({ identifier: 'orime_monthly', price: 1480, priceString: '¥1,480', introPrice });
const annual = (introPrice = null) => ({ identifier: 'orime_annual', price: 12800, priceString: '¥12,800', pricePerMonthString: '¥1,066', introPrice });
const all = () => true;

describe('introOfferOf（ストアの初回特典を読む）', () => {
  it('無料期間（price 0）', () => {
    expect(introOfferOf(monthly(freeWeek))).toMatchObject({ kind: 'free', unit: 'DAY', units: 7 });
    expect(formatFreeTrial(monthly(freeWeek))).toBe('7 日間無料');
  });
  it('先払いの 1 年（創業メンバー価格）は無料期間ではない', () => {
    expect(introOfferOf(annual(foundingYear))).toMatchObject({ kind: 'paid', unit: 'YEAR', units: 1, cycles: 1, priceString: '¥9,800' });
    expect(formatFreeTrial(annual(foundingYear))).toBe('');
  });
  it('初回特典なし・読めない形は null', () => {
    expect(introOfferOf(annual())).toBeNull();
    expect(introOfferOf({ introPrice: { price: 0, periodUnit: 'FORTNIGHT', periodNumberOfUnits: 1 } })).toBeNull();
    expect(introOfferOf({ introPrice: { price: 9800, priceString: '', periodUnit: 'YEAR', periodNumberOfUnits: 1 } })).toBeNull();
  });
  it('無料期間の名前（週・月）', () => {
    expect(freeTrialLabel({ kind: 'free', unit: 'WEEK', units: 1, cycles: 1 })).toBe('1 週間無料');
    expect(freeTrialLabel({ kind: 'free', unit: 'MONTH', units: 1, cycles: 1 })).toBe('1 ヶ月無料');
    expect(freeTrialLabel({ kind: 'paid', unit: 'YEAR', units: 1, cycles: 1 })).toBe('');
  });
});

describe('introPriceLabel（有料の初回価格の書き方）', () => {
  it('1 年・先払い →「1 年目 ¥9,800（2 年目から ¥12,800）」', () => {
    const l = introPriceLabel(introOfferOf(annual(foundingYear)), '¥12,800');
    expect(l.head).toBe('1 年目 ¥9,800');
    expect(l.after).toBe('2 年目から ¥12,800');
    expect(l.full).toBe('1 年目 ¥9,800（2 年目から ¥12,800）');
  });
  it('期間ごとの割引は「/月」を添える', () => {
    const l = introPriceLabel({ kind: 'paid', unit: 'MONTH', units: 1, cycles: 3, priceString: '¥980' }, '¥1,480');
    expect(l.full).toBe('最初の 3 か月 ¥980/月（その後 ¥1,480）');
  });
  it('2 年分の先払いは「3 年目から」', () => {
    const l = introPriceLabel({ kind: 'paid', unit: 'YEAR', units: 2, cycles: 1, priceString: '¥18,000' }, '¥12,800');
    expect(l.full).toBe('最初の 2 年間 ¥18,000（3 年目から ¥12,800）');
  });
  it('無料期間・なしは null', () => {
    expect(introPriceLabel(null, '¥1')).toBeNull();
    expect(introPriceLabel({ kind: 'free', unit: 'DAY', units: 7, cycles: 1 }, '¥1')).toBeNull();
  });
});

describe('buildStoreLabels（有料プランの画面の価格）', () => {
  it('ふだん: 月額・年額とも 7 日間無料・年額は「お得」つき', () => {
    const l = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(freeWeek), eligible: all });
    expect(l.monthly.trial).toBe('7 日間無料');
    expect(l.annual.trial).toBe('7 日間無料');
    expect(l.annual.intro).toBeNull();
    expect(l.annual.price).toBe('年額 ¥12,800（月あたり ¥1,066）');
    expect(l.annual.save).toBe('月額プランより 27% お得');
    expect(trialPlanOf(l)).toBe('both');
  });

  it('創業メンバー価格のあいだ: 年額は「1 年目 ¥9,800」で 7 日間無料なし・月額は 7 日間無料', () => {
    const l = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(foundingYear), eligible: all });
    expect(l.annual.trial).toBe('');
    expect(l.annual.intro.full).toBe('1 年目 ¥9,800（2 年目から ¥12,800）');
    expect(l.annual.save).toBe(''); // 1 年目だけの割引と取り違えない
    expect(l.monthly.trial).toBe('7 日間無料');
    expect(l.monthly.intro).toBeNull();
    expect(trialPlanOf(l)).toBe('monthly');
    // 年額のどの文字にも 7 日間無料が出ない
    expect(JSON.stringify(l.annual)).not.toMatch(/無料/);
    expect(billedLine(l.annual)).toBe('1 年目 ¥9,800、2 年目から 年額 ¥12,800 で自動更新');
    expect(planCtaLabel(l.annual)).toBe('年額プランで始める');
    expect(billedLine(l.monthly)).toBe('その後 月額 ¥1,480 で自動更新');
    expect(planCtaLabel(l.monthly)).toBe('7 日間無料で試す');
  });

  it('初回特典を使えない人（月額の 7 日間無料を使った人など）は通常の価格', () => {
    const l = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(foundingYear), eligible: () => false });
    expect(l.annual.intro).toBeNull();
    expect(l.annual.trial).toBe('');
    expect(l.monthly.trial).toBe('');
    expect(l.annual.save).toBe('月額プランより 27% お得');
    expect(billedLine(l.annual)).toBe('年額 ¥12,800 で自動更新');
    expect(trialPlanOf(l)).toBe('');
  });

  it('年額だけ使える（片方だけ eligible）', () => {
    const l = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(foundingYear), eligible: (p) => p.identifier === 'orime_annual' });
    expect(l.annual.intro.head).toBe('1 年目 ¥9,800');
    expect(l.monthly.trial).toBe('');
  });

  it('月あたりの額が無いときは年額だけ', () => {
    const a = { ...annual(), pricePerMonthString: undefined };
    const l = buildStoreLabels({ base, monthly: monthly(), annual: a });
    expect(l.annual.price).toBe('年額 ¥12,800');
  });
});

describe('billedShortOf / savingsLabel', () => {
  it('かっこの前だけ', () => {
    expect(billedShortOf('年額 ¥12,800（月あたり ¥1,066）')).toBe('年額 ¥12,800');
    expect(billedShortOf('月額 ¥1,480')).toBe('月額 ¥1,480');
  });
  it('お得の割合（5% 未満は出さない）', () => {
    expect(savingsLabel(1480, 12800)).toBe('月額プランより 27% お得');
    expect(savingsLabel(1000, 11800)).toBe('');
    expect(savingsLabel(0, 1)).toBe('');
  });
});
