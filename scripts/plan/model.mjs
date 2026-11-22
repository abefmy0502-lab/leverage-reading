// 📈 中期経営計画（2027〜2029）の月ごとの計算（2026-11-22 オーナー「優秀なコンサルが何人読んでも納得する内容に」）。
//
// 数字を手で置かない。前提（ASSUMPTIONS）を変えると、月ごとの有料・売上・費用・利益と、年ごとのまとめが出る。
//   node scripts/plan/plan.mjs            → 3 つの見込み（控えめ・基本・強気）と、感度（どの前提が 2029 年を動かすか）
// 計画の文書（company/mid-term-plan-2027-2029.md）とダッシュボードの数字は、ここから書き写す。
//
// 前提の考え方（出典と確かめる日は文書の「前提の台帳」）:
// - 有料になるのは「入れた人」の一部。入れた月に月額か年額で始める（7 日間無料はその月の中で終わるとみなす）。
// - 月額は 1 か月目にやめる人が多い（first）・2 か月目からは毎月 steady ずつやめる。年額は 12 か月ごとに renew の割合だけ更新。
// - 法人（2028〜）はアプリの入れた人とは別に、社数 × 席数で数える（請求書か Stripe・App Store の手数料なし）。
// - 無料で使う人の AI の原価も数える（有料 1 人あたり free 人 × 1 人 ¥/月）。

export const MONTHS = (() => {
  const out = [];
  for (let y = 2026; y <= 2029; y += 1) for (let m = 1; m <= 12; m += 1) if (y > 2026 || m === 12) out.push(`${y}-${String(m).padStart(2, '0')}`);
  return out; // 2026-12 〜 2029-12（37 か月）
})();

const yearOf = (ym) => Number(ym.slice(0, 4));
const monthOf = (ym) => Number(ym.slice(5, 7));
const idx = (ym) => MONTHS.indexOf(ym);
export { idx };
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

// 年ごとの値を、年の中で前の年の値から直線でつなぐ（1 月 → 12 月で次の値へ）
const ramp = (byYear, ym) => {
  const y = yearOf(ym); const m = monthOf(ym);
  const cur = byYear[y] ?? byYear[Math.max(...Object.keys(byYear).map(Number))];
  const prev = byYear[y - 1] ?? cur;
  return lerp(prev, cur, (m - 1) / 11);
};

// 季節（App Store の読書・学びの山場: 1 月「今年こそ読む」・4 月 新生活・12 月「今年の読書」）
export const SEASON = { 1: 1.35, 2: 1.0, 3: 1.05, 4: 1.2, 5: 1.0, 6: 0.9, 7: 0.9, 8: 0.95, 9: 1.0, 10: 1.0, 11: 1.0, 12: 1.3 };

export const BASE = {
  name: '基本',
  // 入れる人（iPhone の自然な流入・月）。年末の値に向けて年の中で伸びる
  organicInstalls: { 2026: 1500, 2027: 6500, 2028: 12000, 2029: 20000 },
  androidFrom: '2028-07', androidShare: 0.5, // Android を出したら iPhone の自然な流入 × 0.5 を足す（日本の iPhone は使う人の 48%＝MMD 2025。払う人は iPhone に寄るので控えめに）
  // 広告（円・月）。2027 年は 0（率が立つまで出さない）。2028 年からは「1 人の獲得費を 12 か月以内に回収できる」範囲だけ（paidAcquisition）
  adBudget: { 2026: 0, 2027: 0, 2028: 600_000, 2029: 2_000_000 },
  adFrom: '2028-01', cpi: 400, adConvMult: 1.5, // CPI は世界の中央値 $1.8（約 ¥280）より高めに置く // 1 インストールの広告費（円）・広告で入れた人の有料になりやすさ
  // 入れた人 → 有料（月額＋年額）。RevenueCat 2026 の無料プランのあるアプリの中央値 2.1%（35 日以内）から、改善で少しずつ上げる
  installToPaid: { 2026: 0.02, 2027: 0.024, 2028: 0.026, 2029: 0.028 },
  annualShare: 0.45, // 有料のうち年額で始める割合
  // 月額: 1 か月目に 30% がやめ、そのあと毎月 9%（2027）→ 1 年後に残るのは約 25%（RevenueCat 2024 の日本の月額 26% と合う）
  firstMonthChurn: 0.3,
  steadyChurn: { 2026: 0.09, 2027: 0.09, 2028: 0.08, 2029: 0.07 },
  renew: { 2027: 0.4, 2028: 0.45, 2029: 0.5 }, // 年額の更新（世界 28〜36%・日本 58%＝RevenueCat 2024〜2026 の間）
  webShare: { 2026: 0, 2027: 0.03, 2028: 0.12, 2029: 0.2 }, // 新しい有料のうち Web（Stripe・手数料 3.6%）で申し込む割合
  // 法人（席）: 社数（年末）と 1 社の席数・席の値段（税抜・月）
  b2bCompanies: { 2027: 0, 2028: 8, 2029: 35 }, b2bSeats: 40, b2bSeatYen: 980, b2bFrom: '2028-01',
  // 値段（税抜）
  monthlyYen: 1345, annualYen: 11636, foundingYen: 8909, foundingUntil: '2027-01',
  appleFee: 0.15, stripeFee: 0.036,
  aiPerPaidYen: 50, freePerPaid: 6, aiPerFreeYen: 4,
  // 費用（円・月）
  ownerPay: { 2026: 0, 2027: 0, 2028: 300_000, 2029: 500_000 },
  staff: { 2026: 0, 2027: 80_000, 2028: 600_000, 2029: 2_800_000 }, // 外注・社員（オーナーの分は別）
  creativeYen: { 2026: 0, 2027: 30_000, 2028: 200_000, 2029: 500_000 }, // 動画・記事の制作
  infraBaseYen: 30_000, infraPerUserYen: 3, // サーバー（土台 ＋ 使う人 1 人あたり）
  otherYen: { 2026: 2_000, 2027: 20_000, 2028: 80_000, 2029: 200_000 }, // Apple Developer・税理士・道具・法人の費用
};

export const SCENARIOS = {
  low: { ...BASE, name: '控えめ', organicInstalls: { 2026: 1000, 2027: 4000, 2028: 7000, 2029: 11000 }, installToPaid: { 2026: 0.012, 2027: 0.015, 2028: 0.017, 2029: 0.018 }, firstMonthChurn: 0.35, steadyChurn: { 2026: 0.115, 2027: 0.115, 2028: 0.105, 2029: 0.1 }, renew: { 2027: 0.3, 2028: 0.32, 2029: 0.35 }, b2bCompanies: { 2027: 0, 2028: 4, 2029: 15 }, cpi: 550, adConvMult: 1.0, adBudget: { 2026: 0, 2027: 0, 2028: 0, 2029: 0 },
    // 関門を通らないので、人もお金も足さない（オーナーは兼業のまま・外注は少し）
    ownerPay: { 2026: 0, 2027: 0, 2028: 0, 2029: 0 }, staff: { 2026: 0, 2027: 50_000, 2028: 150_000, 2029: 400_000 }, creativeYen: { 2026: 0, 2027: 20_000, 2028: 50_000, 2029: 100_000 } },
  base: BASE,
  high: { ...BASE, name: '強気', organicInstalls: { 2026: 2000, 2027: 9000, 2028: 16000, 2029: 28000 }, installToPaid: { 2026: 0.025, 2027: 0.03, 2028: 0.034, 2029: 0.036 }, firstMonthChurn: 0.25, steadyChurn: { 2026: 0.07, 2027: 0.07, 2028: 0.06, 2029: 0.055 }, renew: { 2027: 0.5, 2028: 0.55, 2029: 0.58 }, b2bCompanies: { 2027: 0, 2028: 12, 2029: 60 }, cpi: 320 },
};

// 月ごとに計算する
export function simulate(A = BASE) {
  const rows = [];
  const monthlyCohorts = []; // { start, size, web }
  const annualCohorts = []; // { start, size, web, renewals }
  const val = (byYear, ym) => byYear[yearOf(ym)] ?? 0;
  for (const ym of MONTHS) {
    const i = idx(ym); const y = yearOf(ym); const season = SEASON[monthOf(ym)];
    const organic = Math.round(ramp(A.organicInstalls, ym) * season);
    const android = ym >= A.androidFrom ? Math.round(organic * A.androidShare) : 0;
    const adSpend = ym >= A.adFrom ? ramp(A.adBudget, ym) : 0;
    const paidInstalls = Math.round(adSpend / A.cpi);
    const installs = organic + android + paidInstalls;
    const conv = ramp(A.installToPaid, ym);
    // 広告（App Store の検索広告）で入れた人は、探して入れた人なので有料になりやすい（adConvMult 倍）
    const newPaid = (organic + android) * conv + paidInstalls * conv * A.adConvMult;
    const web = ramp(A.webShare, ym);
    monthlyCohorts.push({ start: i, size: newPaid * (1 - A.annualShare), web });
    annualCohorts.push({ start: i, size: newPaid * A.annualShare, web, founding: ym <= A.foundingUntil });
    // 月額: 1 か月目に firstMonthChurn、そのあと毎月 steadyChurn
    let monthlyActive = 0;
    for (const c of monthlyCohorts) {
      const age = i - c.start;
      let alive = c.size;
      if (age >= 1) alive *= 1 - A.firstMonthChurn;
      for (let k = 2; k <= age; k += 1) alive *= 1 - (A.steadyChurn[yearOf(MONTHS[c.start + k])] ?? 0.08);
      c.alive = alive; monthlyActive += alive;
    }
    // 年額: 12 か月ごとに renew の割合だけ残る
    let annualActive = 0; let annualRevenue = 0; let annualCash = 0;
    for (const c of annualCohorts) {
      const age = i - c.start;
      const renewalsPassed = Math.floor(age / 12);
      let alive = c.size;
      for (let k = 1; k <= renewalsPassed; k += 1) alive *= A.renew[yearOf(MONTHS[c.start + 12 * k])] ?? 0.4;
      annualActive += alive;
      const price = c.founding && renewalsPassed === 0 ? A.foundingYen : A.annualYen;
      annualRevenue += (alive * price) / 12; // 売上は月割り
      if (age % 12 === 0) annualCash += alive * price; // お金はその月に入る
    }
    // 法人の席
    const b2bOn = ym >= A.b2bFrom;
    const companies = b2bOn ? Math.round(ramp({ ...A.b2bCompanies, [y - 1]: A.b2bCompanies[y - 1] ?? 0 }, ym)) : 0;
    const seats = companies * A.b2bSeats;
    const paid = monthlyActive + annualActive + seats;
    // 売上（税抜）と手数料
    const monthlyRevenue = monthlyActive * A.monthlyYen;
    const b2bRevenue = seats * A.b2bSeatYen;
    const appRevenue = monthlyRevenue + annualRevenue;
    const webPart = (monthlyCohorts.reduce((s, c) => s + c.alive * c.web, 0) / Math.max(1e-9, monthlyActive)) || 0;
    const fee = appRevenue * ((1 - webPart) * A.appleFee + webPart * A.stripeFee) + b2bRevenue * A.stripeFee;
    const revenue = appRevenue + b2bRevenue;
    const consumerPaid = monthlyActive + annualActive;
    const freeActive = consumerPaid * A.freePerPaid + (installs * 0.15);
    const ai = paid * A.aiPerPaidYen + freeActive * A.aiPerFreeYen;
    const people = (A.ownerPay[y] ?? 0) + (A.staff[y] ?? 0);
    const marketing = adSpend + (A.creativeYen[y] ?? 0);
    const infra = A.infraBaseYen + (paid + freeActive) * A.infraPerUserYen;
    const other = A.otherYen[y] ?? 0;
    const profit = revenue - fee - ai - people - marketing - infra - other;
    rows.push({ ym, installs, organic, android, paidInstalls, conv, newPaid, monthlyActive, annualActive, seats, companies, paid, revenue, b2bRevenue, fee, ai, people, marketing, adSpend, infra, other, profit, annualCash });
  }
  return rows;
}

// 年ごとのまとめ
export function yearly(rows) {
  const out = {};
  for (const r of rows) {
    const y = yearOf(r.ym); if (y < 2027) continue;
    const o = (out[y] ||= { year: y, installs: 0, newPaid: 0, revenue: 0, fee: 0, ai: 0, people: 0, marketing: 0, adSpend: 0, infra: 0, other: 0, profit: 0, paidSum: 0, months: 0 });
    for (const k of ['installs', 'newPaid', 'revenue', 'fee', 'ai', 'people', 'marketing', 'adSpend', 'infra', 'other', 'profit']) o[k] += r[k];
    o.paidSum += r.paid; o.months += 1;
    o.paidEnd = r.paid; o.seatsEnd = r.seats; o.companiesEnd = r.companies; o.mrrEnd = r.revenue; o.annualActiveEnd = r.annualActive; o.monthlyActiveEnd = r.monthlyActive;
  }
  for (const o of Object.values(out)) o.paidAvg = o.paidSum / o.months;
  return Object.values(out);
}

// 1 人の生涯の利益（月額・年額）＝ 1 人が残すお金の合計（期待値）
export function lifetimeValue(A = BASE, year = 2028) {
  const steady = A.steadyChurn[year]; const renew = A.renew[year] ?? 0.4;
  const keepMonthly = (A.monthlyYen * (1 - A.appleFee) - A.aiPerPaidYen);
  // 月額: 1 か月目は必ず払う → 2 か月目に (1 - first) が残り、そこから平均 1/steady か月
  const monthlyMonths = 1 + (1 - A.firstMonthChurn) * (1 / steady);
  const ltvMonthly = keepMonthly * monthlyMonths;
  // 年額: 1 年目 ＋ 更新の等比（renew + renew² + …）
  const keepAnnual = A.annualYen * (1 - A.appleFee) - A.aiPerPaidYen * 12;
  const annualYears = 1 / (1 - renew);
  const ltvAnnual = keepAnnual * annualYears;
  const blended = ltvMonthly * (1 - A.annualShare) + ltvAnnual * A.annualShare;
  return { monthlyMonths, ltvMonthly, annualYears, ltvAnnual, blended };
}

// 広告で 1 人の有料を取るのにかかる額（CPI ÷ 有料になる率）と、生涯の利益との比
export function paidAcquisition(A = BASE, year = 2028) {
  const conv = A.installToPaid[year] * A.adConvMult;
  const cac = A.cpi / conv;
  const ltv = lifetimeValue(A, year).blended;
  return { cac, ltv, ratio: ltv / cac, paybackMonths: cac / ((A.monthlyYen * (1 - A.appleFee) - A.aiPerPaidYen) * (1 - A.annualShare) + (A.annualYen * (1 - A.appleFee) / 12 - A.aiPerPaidYen) * A.annualShare) };
}

// 感度: 1 つの前提だけを動かしたときの 2029 年末の有料と 2029 年の利益
export function sensitivity(A = BASE) {
  const base = yearly(simulate(A)).find((o) => o.year === 2029);
  const scale = (obj, f) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v * f]));
  const cases = [
    ['入れる人（自然な流入）−30%', { organicInstalls: scale(A.organicInstalls, 0.7) }],
    ['入れた人 → 有料 −30%', { installToPaid: scale(A.installToPaid, 0.7) }],
    ['月額の解約 ＋2 ポイント', { steadyChurn: Object.fromEntries(Object.entries(A.steadyChurn).map(([k, v]) => [k, v + 0.02])) }],
    ['年額の更新 −15 ポイント', { renew: Object.fromEntries(Object.entries(A.renew).map(([k, v]) => [k, v - 0.15])) }],
    ['法人の社数 半分', { b2bCompanies: scale(A.b2bCompanies, 0.5) }],
    ['広告の 1 インストール ＋50%', { cpi: A.cpi * 1.5 }],
    ['Android を出さない', { androidFrom: '2099-01' }],
    ['年額で始める割合 −15 ポイント', { annualShare: A.annualShare - 0.15 }],
  ];
  return cases.map(([label, patch]) => {
    const o = yearly(simulate({ ...A, ...patch })).find((x) => x.year === 2029);
    return { label, paidEnd: o.paidEnd, profit: o.profit, dPaid: o.paidEnd - base.paidEnd, dProfit: o.profit - base.profit };
  }).sort((a, b) => Math.abs(b.dPaid) - Math.abs(a.dPaid));
}
