import { describe, it, expect } from 'vitest';
import {
  savingsLabel, introOfferOf, freeTrialLabel, formatFreeTrial, introPriceLabel,
  buildStoreLabels, billedLine, billedLineParts, billedShortOf, planCtaLabel, trialPlanOf,
  renewalSentence, webRenewalSentence, withTax,
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
    expect(l.span).toBe('1 年');
    expect(l.upfront).toBe(true);
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
    expect(billedLine(l.annual)).toBe('1 年目 ¥9,800（税込）、2 年目から 年額 ¥12,800（税込）で自動更新');
    // 「2 年目から 年額 ¥12,800（税込）」は 1 つの塊（中の語の間は折り返さない空白・2026-10-04）
    expect(billedLineParts(l.annual)).toEqual(['1 年目 ¥9,800（税込）、', '2\u00a0年目から 年額\u00a0¥12,800\u2060（税込）', 'で自動更新']);
    expect(billedLine(l.annual)).toBe('1 年目 ¥9,800（税込）、2 年目から 年額 ¥12,800（税込）で自動更新');
    expect(planCtaLabel(l.annual)).toBe('年額プランで始める');
    expect(billedLine(l.monthly)).toBe('その後 月額 ¥1,480（税込）で自動更新');
    expect(planCtaLabel(l.monthly)).toBe('7 日間無料で試す');
  });

  it('初回特典を使えない人（月額の 7 日間無料を使った人など）は初回特典の無い価格', () => {
    const l = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(foundingYear), eligible: () => false });
    expect(l.annual.intro).toBeNull();
    expect(l.annual.trial).toBe('');
    expect(l.monthly.trial).toBe('');
    expect(l.annual.save).toBe('月額プランより 27% お得');
    expect(billedLine(l.annual)).toBe('年額 ¥12,800（税込）で自動更新');
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

describe('renewalSentence（自動更新の条件の 1 文・下に固定の欄と同じ値から）', () => {
  const founding = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(foundingYear), eligible: all });
  const normal = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(freeWeek), eligible: all });
  const none = buildStoreLabels({ base, monthly: monthly(freeWeek), annual: annual(foundingYear), eligible: () => false });

  it('年額・初回価格（創業メンバー価格）: 1 年目の終わり → 2 年目から年額 ¥12,800（税込）', () => {
    expect(renewalSentence(founding.annual)).toBe('1 年目の終わりの 24 時間前までに解約しない限り、2 年目から年額 ¥12,800（税込）で自動更新されます。');
    expect(renewalSentence(founding.annual)).not.toMatch(/同じ料金/);
  });
  it('月額・7 日間無料: 無料期間のあと月額 ¥1,480（税込）', () => {
    expect(renewalSentence(founding.monthly)).toBe('無料期間が終わる 24 時間前までに解約しない限り、無料期間のあと月額 ¥1,480（税込）で自動更新されます。');
  });
  it('年額・7 日間無料（期間外）: 無料期間のあと年額 ¥12,800（税込）', () => {
    expect(renewalSentence(normal.annual)).toBe('無料期間が終わる 24 時間前までに解約しない限り、無料期間のあと年額 ¥12,800（税込）で自動更新されます。');
  });
  it('初回特典なし: 年額・月額とも、その料金（税込）で', () => {
    expect(renewalSentence(none.annual)).toBe('期間が終わる 24 時間前までに解約しない限り、年額 ¥12,800（税込）で自動更新されます。');
    expect(renewalSentence(none.monthly)).toBe('期間が終わる 24 時間前までに解約しない限り、月額 ¥1,480（税込）で自動更新されます。');
  });
  it('期間ごとの割引（最初の 3 か月）: その期間の終わり → その後の料金', () => {
    const intro = introPriceLabel({ kind: 'paid', unit: 'MONTH', units: 1, cycles: 3, priceString: '¥980' }, '¥1,480');
    expect(renewalSentence({ price: '月額 ¥1,480', intro })).toBe('最初の 3 か月の終わりの 24 時間前までに解約しない限り、その後月額 ¥1,480（税込）で自動更新されます。');
  });
  it('既定のラベル（「（税込）」つき）でも二重にしない・円以外には付けない', () => {
    expect(renewalSentence({ price: '年額 ¥12,800（税込・月あたり約¥1,066）' })).toBe('期間が終わる 24 時間前までに解約しない限り、年額 ¥12,800（税込）で自動更新されます。');
    expect(renewalSentence({ price: '年額 $79.99' })).toBe('期間が終わる 24 時間前までに解約しない限り、年額 $79.99で自動更新されます。');
    expect(withTax('1 年目 ¥9,800')).toBe('1 年目 ¥9,800（税込）');
    expect(withTax('月額 ¥1,480（税込）')).toBe('月額 ¥1,480（税込）');
  });
  it('下に固定の欄と同じ金額を使う（食い違わない）', () => {
    for (const l of [founding.annual, founding.monthly, normal.annual, none.annual]) {
      const price = billedShortOf(l.price);
      expect(billedLine(l)).toContain(price); // 画面の塊は語の間が U+00A0（billedLine は普通の空白に戻す）
      expect(renewalSentence(l)).toContain(price);
    }
  });
});

describe('webRenewalSentence（Web 版の価格の一覧の下）', () => {
  const labels = { monthly: { price: '月額 ¥1,480（税込）' }, annual: { price: '年額 ¥12,800（税込・月あたり約¥1,066）' } };
  it('期間外: どちらのプランも、その料金で', () => {
    const s = webRenewalSentence({ labels });
    expect(s).toBe('期間が終わる 24 時間前までに解約しない限り、月額 ¥1,480（税込）・年額 ¥12,800（税込）の、選んだプランの料金で自動更新されます。');
    expect(s).not.toMatch(/同じ料金/);
  });
  it('創業メンバー価格の期間中: 1 年目の終わり → 2 年目から年額 ¥12,800（税込）も添える', () => {
    expect(webRenewalSentence({ labels, foundingPrice: '¥9,800' })).toMatch(/年額プランの 1 年目を ¥9,800 で始めたときは、1 年目の終わりの 24 時間前までに解約しない限り、2 年目から年額 ¥12,800（税込）で自動更新されます。$/);
  });
});
