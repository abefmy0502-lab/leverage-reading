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

// 有料の初回価格の書き方。regular は初回の期間のあとの価格の文字（ストアの priceString「¥12,800」）。
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
  // period: 初回価格の期間の名前（「1 年目」「最初の 3 か月」・自動更新の文で「1 年目の終わり」に使う）。
  // span: 初回価格の期間の長さ（「1 年」「3 か月」・先払いの「1 年分をまとめてお支払い」に使う）。
  const span = `${total} ${UNIT_JA[intro.unit]}`;
  return { head, period, span, afterHead, after, full: after ? `${head}（${after}）` : head, priceString: intro.priceString, upfront: intro.cycles === 1 };
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
//   有料の初回価格 → 「1 年目 ¥9,800、2 年目から年額 ¥12,800 で自動更新」
//   どちらも無し   → 「年額 ¥12,800 で自動更新」
export function billedLine(label = {}) {
  return billedLineParts(label).join('').replace(/\u00a0/g, ' ').replace(/[\u2060\u200b]/g, '');
}
// 同じ文を、折り返してよい切れ目で分けたもの（画面は塊ごとに nowrap で並べる＝「¥12,800 / で自動更新」と割れない）。
//   金額は円なら「（税込）」つき（withTax）。「で自動更新」は 1 つの塊（「で自／動更新」と割らない・2026-10-02 ui-critic）。
//   初回価格の「2 年目から 年額 ¥12,800（税込）」は 1 つの塊（2026-10-04・以前は「2 年目から」と金額を分けたので、
//   「2 年目から」だけが行末に残って金額が次の行へ割れていた）。塊の中の語の間は折り返さない空白（U+00A0）にし、
//   「（税込）」の前には結合文字（U+2060）。文字を最大にして 1 行に入らないときだけ「2 年目から／年額 ¥12,800（税込）」で割る
//   （「（税込）」だけが落ちない）。
//   「2 年目から」と「年額」の間は空白を置かず（自動更新の文と同じ「2 年目から年額 ¥12,800」）、見えない折り返しの場所（U+200B）に
//   （空白 1 つ分だけ短くなり、ふつうの文字の大きさで「で自動更新」が 2 行目に収まる＝下に固定の欄が 1 行減る・2026-10-04）。
//   末尾の空白は塊の外に出す（画面側）＝つなげたとき元の 1 文と同じ（billedLine は U+00A0・U+2060・U+200B を元に戻す）。
const keepWords = (t) => String(t || '').replace(/ /g, '\u00a0').replace(/（/g, '\u2060（');
export function billedLineParts(label = {}) {
  const short = withTax(billedShortOf(label.price));
  if (label.trial) return [`その後 ${short}`, 'で自動更新'];
  if (label.intro) return [`${withTax(label.intro.head)}、`, `${keepWords(label.intro.afterHead)}\u200b${keepWords(short)}`, 'で自動更新'];
  return [short, 'で自動更新'];
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

// 円の金額なら「（税込）」を添える（日本の App Store の価格は税込。ほかの通貨には付けない・もう付いていれば付けない）。
export function withTax(text = '') {
  const t = String(text || '').trim();
  if (!t || !/[¥￥]/.test(t) || /税込/.test(t)) return t;
  return `${t}（税込）`;
}

// 自動更新の条件の 1 文（審査 3.1.2・ボタンの下の文）。下に固定の欄（billedLineParts）と同じ値から作る
// （「同じ料金で自動更新」と書くと、初回価格のときに食い違う・2026-10-02 ui-critic）。
//   有料の初回価格 → 「1 年目の終わりの 24 時間前までに解約しない限り、2 年目から年額 ¥12,800（税込）で自動更新されます。」
//   無料期間あり   → 「無料期間が終わる 24 時間前までに解約しない限り、無料期間のあと月額 ¥1,480（税込）で自動更新されます。」
//   どちらも無し   → 「期間が終わる 24 時間前までに解約しない限り、年額 ¥12,800（税込）で自動更新されます。」
export function renewalSentence(label = {}) {
  const price = withTax(billedShortOf(label.price));
  if (label.trial) return `無料期間が終わる 24 時間前までに解約しない限り、無料期間のあと${price}で自動更新されます。`;
  if (label.intro) {
    const period = label.intro.period || '初回の期間';
    return `${period}の終わりの 24 時間前までに解約しない限り、${label.intro.afterHead}${price}で自動更新されます。`;
  }
  return `期間が終わる 24 時間前までに解約しない限り、${price}で自動更新されます。`;
}

// Web 版（価格の一覧だけ・契約は App Store）の自動更新の文。どのプランを選ぶか分からないので、プランごとの条件を並べる。
//   foundingPrice: 創業メンバー価格の期間中の年額の 1 年目（「¥9,800」）。期間外は ''。
//   labels: { monthly: { price }, annual: { price } }（billing.js の PLAN_LABELS）
export function webRenewalSentence({ labels = {}, foundingPrice = '' } = {}) {
  const monthly = withTax(billedShortOf(labels.monthly?.price));
  const annual = withTax(billedShortOf(labels.annual?.price));
  const base = `期間が終わる 24 時間前までに解約しない限り、${monthly}・${annual}の、選んだプランの料金で自動更新されます。`;
  if (!foundingPrice) return base;
  return `${base}年額プランの 1 年目を ${foundingPrice} で始めたときは、1 年目の終わりの 24 時間前までに解約しない限り、2 年目から${annual}で自動更新されます。`;
}
