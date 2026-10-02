// 💳 プランの価格と初回特典の書き方（純粋関数だけ・iap.js / Paywall / テストが使う）。
//
// App Store の初回特典（Introductory Offer）は、1 つのサブスク商品・1 つの国に 1 つだけ。
//   - 無料期間（7 日間無料）            … introPrice.price が 0
//   - 先払い・期間まとめて（1 年 ¥9,800）… introPrice.price > 0・cycles 1（創業メンバー価格・2026-10-02）
//   - 期間ごとの割引（3 か月 ¥980/月）   … introPrice.price > 0・cycles > 1
// 創業メンバー価格のあいだ、年額プランの初回特典は「1 年目 ¥9,800」になり、7 日間無料は付かない。
// 月額プランは 7 日間無料のまま。価格の真実はストア（ここは表示の文字を作るだけ）。

// 「月額プランより N% お得」。どちらも同じストア（同じ通貨）の実数から計算するので、
// 価格を変えても表示がずれない。差が小さい（5% 未満）ときは出さない。
export function savingsLabel(monthlyPrice, annualPrice) {
  const m = Number(monthlyPrice);
  const a = Number(annualPrice);
  if (!(m > 0) || !(a > 0)) return '';
  const pct = Math.floor((1 - a / (m * 12)) * 100);
  return pct >= 5 ? `月額プランより ${pct}% お得` : '';
}

const UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'];

// RevenueCat の product.introPrice を読む。
//   null                                   … 初回特典なし（読めない形も含む）
//   { kind: 'free', unit, units, cycles }  … 無料期間
//   { kind: 'paid', unit, units, cycles, price, priceString } … 有料の初回価格
// 価格が読めない（price が無い）ときは従来どおり無料期間として扱う（App Store の無料期間は price 0）。
export function introOfferOf(product) {
  const ip = product?.introPrice;
  if (!ip) return null;
  const units = Number(ip.periodNumberOfUnits) || 0;
  const unit = String(ip.periodUnit || '').toUpperCase();
  if (!units || !UNITS.includes(unit)) return null;
  const cycles = Math.max(1, Math.floor(Number(ip.cycles) || 1));
  const price = Number(ip.price);
  if (Number.isFinite(price) && price > 0) {
    const priceString = String(ip.priceString || '').trim();
    if (!priceString) return null; // 金額の文字が無いと正しく書けない → 特典を出さない
    return { kind: 'paid', unit, units, cycles, price, priceString };
  }
  return { kind: 'free', unit, units, cycles };
}

// 無料期間の名前（「7 日間無料」）。無料期間でなければ ''。
export function freeTrialLabel(intro) {
  if (!intro || intro.kind !== 'free') return '';
  const n = intro.units * intro.cycles;
  // 数字と単位の間に空きを入れる（「7 日間無料」・アプリのほかの数字の書き方とそろえる）。
  const label = intro.unit === 'DAY' ? `${n} 日間`
    : intro.unit === 'WEEK' ? `${n} 週間`
      : intro.unit === 'MONTH' ? `${n} ヶ月`
        : intro.unit === 'YEAR' ? `${n} 年間` : '';
  return label ? `${label}無料` : '';
}

// RevenueCat の product から無料期間の名前（互換のため残す）。
export function formatFreeTrial(product) {
  return freeTrialLabel(introOfferOf(product));
}

const UNIT_JA = { DAY: '日', WEEK: '週間', MONTH: 'か月', YEAR: '年' };
const PER_JA = { DAY: '日', WEEK: '週', MONTH: '月', YEAR: '年' };

// 有料の初回価格の書き方。regular はその後の通常価格の文字（ストアの priceString「¥12,800」）。
//   1 年・先払い   → { head: '1 年目 ¥9,800', afterHead: '2 年目から', after: '2 年目から ¥12,800',
//                      full: '1 年目 ¥9,800（2 年目から ¥12,800）' }
//   3 か月・月ごと → { head: '最初の 3 か月 ¥980/月', afterHead: 'その後', after: 'その後 ¥1,480', … }
// 有料の初回価格でなければ null。
export function introPriceLabel(intro, regular = '') {
  if (!intro || intro.kind !== 'paid') return null;
  const total = intro.units * intro.cycles;
  let period;
  let afterHead;
  if (intro.unit === 'YEAR' && total === 1) {
    period = '1 年目';
    afterHead = '2 年目から';
  } else if (intro.unit === 'YEAR') {
    period = `最初の ${total} 年間`;
    afterHead = `${total + 1} 年目から`;
  } else {
    period = `最初の ${total} ${UNIT_JA[intro.unit]}`;
    afterHead = 'その後';
  }
  // 期間ごとに払う形（cycles > 1）は「/月」「/年」を添える（まとめて払う額と取り違えないように）。
  const per = intro.cycles > 1
    ? `/${intro.units === 1 ? PER_JA[intro.unit] : `${intro.units} ${UNIT_JA[intro.unit]}`}`
    : '';
  const head = `${period} ${intro.priceString}${per}`;
  const reg = String(regular || '').trim();
  const after = reg ? `${afterHead} ${reg}` : '';
  // upfront: 期間の分をはじめに 1 回で払う形（cycles 1）。
  return { head, afterHead, after, full: after ? `${head}（${after}）` : head, priceString: intro.priceString, upfront: intro.cycles === 1 };
}

// ストアの 2 つの商品（月額・年額）から、有料プランの画面の文字を作る。
//   base: 既定のラベル（iap.js の APP_PLAN_LABELS）
//   eligible(product): この人が初回特典を使えるか（使えないと分かった・分からないときは false）
// 返す形: { ok: true, monthly: {…, trial, intro}, annual: {…, trial, intro, save} }
//   trial … 無料期間の名前（「7 日間無料」）か ''
//   intro … 有料の初回価格（introPriceLabel の形）か null
// 有料の初回価格があるプランには無料期間を付けない（App Store の決まりで、どちらか 1 つ）。
// 年額に初回価格があるときは「月額プランより N% お得」を出さない（1 年目だけの話と取り違えないように）。
export function buildStoreLabels({ base, monthly, annual, eligible = () => false }) {
  const offerOf = (p) => (p && eligible(p) ? introOfferOf(p) : null);
  const mOffer = offerOf(monthly);
  const aOffer = offerOf(annual);
  const aIntro = introPriceLabel(aOffer, annual.priceString);
  return {
    ok: true,
    monthly: {
      ...base.monthly,
      price: `月額 ${monthly.priceString}`,
      trial: freeTrialLabel(mOffer),
      intro: introPriceLabel(mOffer, monthly.priceString),
    },
    annual: {
      ...base.annual,
      // 月あたりの額もストアの値から（「年額 ¥12,800（月あたり ¥1,066）」）。
      price: annual.pricePerMonthString
        ? `年額 ${annual.priceString}（月あたり ${annual.pricePerMonthString}）`
        : `年額 ${annual.priceString}`,
      save: aIntro ? '' : savingsLabel(monthly.price, annual.price),
      trial: freeTrialLabel(aOffer),
      intro: aIntro,
    },
  };
}

// 価格のラベルの頭だけ（「年額 ¥12,800（月あたり ¥1,066）」→「年額 ¥12,800」）。
export function billedShortOf(price = '') {
  return String(price || '').split(/[（(]/)[0].trim();
}

// 下に固定の欄の請求額の 1 行（審査 3.1.2: 実際に請求される金額と自動更新）。
//   無料期間あり   → 「その後 年額 ¥12,800 で自動更新」
//   有料の初回価格 → 「1 年目 ¥9,800、2 年目から 年額 ¥12,800 で自動更新」
//   どちらも無し   → 「年額 ¥12,800 で自動更新」
export function billedLine(label = {}) {
  return billedLineParts(label).join('');
}
// 同じ文を、折り返してよい切れ目で分けたもの（画面は塊ごとに nowrap で並べる＝「¥12,800 / で自動更新」と割れない）。
export function billedLineParts(label = {}) {
  const short = billedShortOf(label.price);
  if (label.trial) return [`その後 ${short} で自動更新`];
  if (label.intro) return [`${label.intro.head}、`, `${label.intro.afterHead} ${short} で自動更新`];
  return [`${short} で自動更新`];
}

// 主ボタンの文言。無料期間があれば「7 日間無料で試す」、無ければ「年額プランで始める」。
export function planCtaLabel(label = {}) {
  return label.trial ? `${label.trial}で試す` : `${label.name || 'プラン'}で始める`;
}

// 無料期間（7 日間無料）がどのプランにあるか: 'both' | 'annual' | 'monthly' | ''。
// 創業メンバー価格のあいだは 'monthly'（年額は 1 年目 ¥9,800・無料期間なし）。
export function trialPlanOf(labels = {}) {
  const a = !!labels.annual?.trial;
  const m = !!labels.monthly?.trial;
  if (a && m) return 'both';
  if (a) return 'annual';
  if (m) return 'monthly';
  return '';
}
