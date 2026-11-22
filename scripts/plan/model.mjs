// 📈 中期経営計画（2027〜2029）の月ごとの計算（v2・2026-11-22・3 人の点検＝戦略・財務・成長と組織の指摘を反映）。
//
// 数字を手で置かない。前提（BASE）を変えると、月ごとの有料・売上・費用・税・現金と、年ごとのまとめが出る。
//   node scripts/plan/plan.mjs   → 3 つの見込み・関門の判定・現金・生涯の利益と回収・感度
// 計画の文書（company/mid-term-plan-2027-2029.md）の表は scripts/plan/render-md.mjs が、ダッシュボードは plan.json がここから作る。
//
// 置き方の決まり:
// - 売上は税抜で数える。消費税は預かった分をそのまま納める保守的な置き方（免税・簡易課税で手元に残る分は入れない）。
// - 関門（2027・2028 年末）を計算の中で判定し、通らなければ次の年の人・広告・制作を「止める計画」に切り替える。
// - 広告は、入った月ごとの集団で「取る費用を取り戻す月数」が 12 か月以内のときだけ増やす。それ以外は月 ¥10 万の試しだけ。
// - お金: App Store の入金は 2 か月遅れ、法人の請求は 2 か月遅れ。年額は始めた月（と更新の月）にまとめて入る。

export const MONTHS = (() => {
  const out = [];
  for (let y = 2026; y <= 2030; y += 1) for (let m = 1; m <= 12; m += 1) if ((y > 2026 || m === 12) && (y < 2030 || m <= 3)) out.push(`${y}-${String(m).padStart(2, '0')}`);
  return out; // 2026-12 〜 2030-03（2029 年の税を払う月まで）
})();
export const PLAN_LAST = '2029-12';

const yearOf = (ym) => Number(ym.slice(0, 4));
const monthOf = (ym) => Number(ym.slice(5, 7));
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const addMonths = (ym, k) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
const monthsBetween = (a, b) => (yearOf(b) * 12 + monthOf(b)) - (yearOf(a) * 12 + monthOf(a));

// 年ごとの値を、年の中で前の年の値から直線でつなぐ（1 月 → 12 月で次の値へ）
const ramp = (byYear, ym) => {
  const y = yearOf(ym); const m = monthOf(ym);
  const keys = Object.keys(byYear).map(Number);
  const cur = byYear[y] ?? byYear[Math.max(...keys)];
  const prev = byYear[y - 1] ?? cur;
  return lerp(prev, cur, (m - 1) / 11);
};

// 季節（読書・学びの山場: 1 月「今年こそ読む」・4 月 新生活・12 月「今年の読書」）
export const SEASON = { 1: 1.35, 2: 1.0, 3: 1.05, 4: 1.2, 5: 1.0, 6: 0.9, 7: 0.9, 8: 0.95, 9: 1.0, 10: 1.0, 11: 1.0, 12: 1.3 };

export const BASE = {
  name: '基本',
  startingCash: 1_000_000, // 始めの手元資金（オーナーが入れる額・要確認）
  // ── 入れる人
  organicInstalls: { 2026: 1500, 2027: 6500, 2028: 12000, 2029: 20000 }, // iPhone の自然な流入（月）。いちばん弱い前提（道ごとの内訳は文書 §5-1）
  organicDelayMonths: 0, // 伸び方が遅れたとき（感度）
  androidFrom: '2028-03', androidShare: 0.5, androidRampMonths: 9, androidConvMult: 0.6, // Android: 2028-03 から 9 か月かけて iPhone の流入 × 0.5 まで。有料になる率は iPhone の 0.6 倍
  androidBuild: { from: '2027-10', months: 5, yenPerMonth: 200_000 }, // Android を作る費用（Capacitor で包む・外注 5 か月）
  androidGate: { at: '2027-09', paid: 400 }, // 2027 年 9 月に有料 400 人以上（道しるべの 7 割）なら作る。届かなければ作らない
  // ── 有料になる
  installToPaid: { 2026: 0.02, 2027: 0.024, 2028: 0.026, 2029: 0.028 }, // RevenueCat 2026: 無料プランのあるアプリの中央値 2.1%（35 日以内）
  annualShare: 0.45,
  firstMonthChurn: 0.3, steadyChurn: { 2026: 0.09, 2027: 0.09, 2028: 0.08, 2029: 0.07 }, // 1 年後に約 25% が残る（日本の月額 26%）
  renew: { 2027: 0.4, 2028: 0.45, 2029: 0.5 }, // 世界 28〜36%・日本 58%
  webShare: { 2026: 0, 2027: 0.03, 2028: 0.12, 2029: 0.2 },
  // ── 広告（App Store の検索広告）
  adFrom: '2028-01', cpi: 400, adConvMult: 1.5, adTestYen: 100_000, adScaleYen: { 2028: 600_000, 2029: 2_000_000 }, adPaybackMax: 12,
  // ── 法人（2028 年 7 月から試し 5 社・席は少なく割引から）
  b2bFrom: '2028-07', b2bCompanies: { 2028: 5, 2029: 30 }, b2bSeats: { 2028: 15, 2029: 35 }, b2bSeatYen: { 2028: 490, 2029: 980 },
  // ── 値段（税抜）と手数料
  monthlyYen: 1345, annualYen: 11636, foundingYen: 8909, foundingUntil: '2027-01',
  appleFee: 0.15, stripeFee: 0.036, refundRate: 0.015,
  // ── AI の原価
  aiPerPaidYen: 50, freePerPaid: 6, aiPerFreeYen: 10,
  // ── 費用（関門を通ったとき＝pass、通らないとき＝hold）。円・月
  ownerPay: { pass: { 2027: 0, 2028: 300_000, 2029: 500_000 }, hold: { 2027: 0, 2028: 0, 2029: 0 } },
  outsource: { pass: { 2027: 80_000, 2028: 150_000, '2028-04': 800_000, 2029: 300_000 }, hold: { 2027: 80_000, 2028: 150_000, 2029: 250_000 } },
  hires: [ // 2029 年の社員（2028 年末の関門を通ったときだけ）。1 人ずつ、3 か月あけて入れる（現金を 0 より下にしない）
    { from: '2029-01', title: '開発', salaryYen: 550_000 },
    { from: '2029-04', title: '法人営業', salaryYen: 500_000, needsB2b: true }, // 法人の試しが通ったときだけ
    { from: '2029-07', title: 'マーケ', salaryYen: 500_000 },
  ],
  socialRate: 0.15, hireFeeRate: 0.3, // 会社が払う社会保険・採用の費用（年収の 30%）
  creative: { pass: { 2027: 30_000, 2028: 200_000, 2029: 500_000 }, hold: { 2027: 20_000, 2028: 50_000, 2029: 100_000 } },
  infraBaseYen: 30_000, infraPerUserYen: 3,
  otherYen: { 2027: 20_000, 2028: 80_000, 2029: 200_000 }, incorporation: { at: '2027-10', yen: 250_000 }, accountantYen: 30_000,
  corpTaxRate: 0.3, corpTaxFixedYen: 70_000, // 法人化（2027-10）後の利益に 約 30%＋均等割。翌年 3 月に払う
  ownerMarketPayYen: 500_000, // オーナーに市場の報酬を払ったときの比べ用
  // ── 関門（計算の中で判定）
  gates: { 2027: { paid: 700, mrrYen: 750_000, cashYen: 1_500_000 }, 2028: { paid: 2800, profit3m: 0 } },
  midCheck: { at: '2028-06', paid: 1400 }, // 逆の決まり: 2028 年 6 月に有料が道しるべの 8 割に届かなければ、7 月から費用を止める
};

export const SCENARIOS = {
  low: { ...BASE, name: '控えめ', organicInstalls: { 2026: 1000, 2027: 4000, 2028: 7000, 2029: 11000 }, installToPaid: { 2026: 0.012, 2027: 0.015, 2028: 0.017, 2029: 0.018 }, firstMonthChurn: 0.35, steadyChurn: { 2026: 0.115, 2027: 0.115, 2028: 0.105, 2029: 0.1 }, renew: { 2027: 0.3, 2028: 0.32, 2029: 0.35 }, b2bCompanies: { 2028: 3, 2029: 12 }, cpi: 550, adConvMult: 1.0 },
  base: BASE,
  high: { ...BASE, name: '強気', organicInstalls: { 2026: 2000, 2027: 9000, 2028: 16000, 2029: 28000 }, installToPaid: { 2026: 0.025, 2027: 0.03, 2028: 0.034, 2029: 0.036 }, firstMonthChurn: 0.25, steadyChurn: { 2026: 0.07, 2027: 0.07, 2028: 0.06, 2029: 0.055 }, renew: { 2027: 0.5, 2028: 0.55, 2029: 0.58 }, b2bCompanies: { 2028: 8, 2029: 50 }, cpi: 320 },
};

const keepMonthly = (A) => A.monthlyYen * (1 - A.appleFee) - A.aiPerPaidYen;
const keepAnnual = (A) => A.annualYen * (1 - A.appleFee) - A.aiPerPaidYen * 12;

// 1 人の生涯の利益（月額・年額）＝ 1 人が残すお金の合計（割り引かない・手数料と AI の原価を引いたあと）
export function lifetimeValue(A = BASE, year = 2028) {
  const steady = A.steadyChurn[year] ?? 0.08; const renew = A.renew[year] ?? 0.4;
  const monthlyMonths = 1 + (1 - A.firstMonthChurn) / steady;
  const ltvMonthly = keepMonthly(A) * monthlyMonths;
  const ltvAnnual = keepAnnual(A) / (1 - renew);
  return { monthlyMonths, ltvMonthly, ltvAnnual, blended: ltvMonthly * (1 - A.annualShare) + ltvAnnual * A.annualShare };
}

// 広告で有料 1 人を取る費用と、入った月ごとの集団で「取り戻す月数」（解約と年額の前払い・更新を入れる）
export function paidAcquisition(A = BASE, year = 2028) {
  const conv = (A.installToPaid[year] ?? 0.025) * A.adConvMult;
  const cac = A.cpi / conv;
  const ltv = lifetimeValue(A, year).blended;
  const steady = A.steadyChurn[year] ?? 0.08; const renew = A.renew[year] ?? 0.4;
  let cum = 0; let payback = null; let aliveM = 1; let aliveA = 1;
  for (let mo = 0; mo < 60; mo += 1) {
    if (mo === 1) aliveM *= 1 - A.firstMonthChurn; else if (mo > 1) aliveM *= 1 - steady;
    if (mo > 0 && mo % 12 === 0) aliveA *= renew;
    cum += (1 - A.annualShare) * aliveM * keepMonthly(A) + (mo % 12 === 0 ? A.annualShare * aliveA * keepAnnual(A) : 0);
    if (payback == null && cum >= cac) payback = mo + 1;
  }
  return { cac, ltv, ratio: ltv / cac, paybackMonths: payback ?? 61 };
}

// 法人の試しが通ったか（2028 年 12 月に続けて使う会社が 3 社以上＝ここでは社数で見る）
const b2bPilotOk = (rows) => { const r = rows.find((x) => x.ym === '2028-12'); return !!r && r.companies >= 3; };

// 月ごとに計算する（関門と広告の決まりも、この中で判定する）
export function simulate(A = BASE, opts = {}) {
  const { noGates = false } = opts; // noGates: 関門で止めない（費用を pass のまま）＝感度の「費用を動かさない」比べ用
  const rows = [];
  const mCoh = []; const aCoh = [];
  const pass = { 2027: true, 2028: true, 2029: true }; // その年の費用の計画（前の年末の関門で決まる）
  const gateResult = {};
  const cashIn = {}; const addCash = (ym, v) => { cashIn[ym] = (cashIn[ym] || 0) + v; };
  let cash = A.startingCash; let minCash = cash; let minCashYm = MONTHS[0];
  const yearProfit = {}; const taxDue = {};
  let androidOn = null; // 2027 年 9 月に決める
  for (const ym of MONTHS) {
    const y = yearOf(ym); const season = SEASON[monthOf(ym)];
    const inPlan = ym <= PLAN_LAST;
    const plan = (pass[y] ?? true) ? 'pass' : 'hold';
    // ── 入れる人
    const organicYm = addMonths(ym, -A.organicDelayMonths);
    const organic = inPlan ? Math.round(ramp(A.organicInstalls, organicYm < '2026-12' ? '2026-12' : organicYm) * season * (A.organicDelayMonths && organicYm < '2026-12' ? 0.5 : 1)) : 0;
    const andAge = androidOn === false ? -1 : monthsBetween(A.androidFrom, ym);
    const android = inPlan && andAge >= 0 ? Math.round(organic * A.androidShare * Math.min(1, (andAge + 1) / A.androidRampMonths)) : 0;
    const scaleOk = paidAcquisition(A, y).paybackMonths <= A.adPaybackMax;
    const adSpend = inPlan && ym >= A.adFrom && (pass[y] ?? true) ? (scaleOk ? ramp(A.adScaleYen, ym) : A.adTestYen) : 0;
    const paidInstalls = Math.round(adSpend / A.cpi);
    const installs = organic + android + paidInstalls;
    const conv = ramp(A.installToPaid, ym);
    const newPaid = inPlan ? organic * conv + android * conv * A.androidConvMult + paidInstalls * conv * A.adConvMult : 0;
    const web = ramp(A.webShare, ym);
    mCoh.push({ start: ym, size: newPaid * (1 - A.annualShare), web });
    aCoh.push({ start: ym, size: newPaid * A.annualShare, web, founding: ym <= A.foundingUntil });
    // ── 月額
    let monthlyActive = 0; let webM = 0;
    for (const c of mCoh) {
      const age = monthsBetween(c.start, ym);
      if (age === 0) c.alive = c.size; else if (age === 1) c.alive = c.size * (1 - A.firstMonthChurn); else c.alive *= 1 - (A.steadyChurn[y] ?? 0.08);
      monthlyActive += c.alive; webM += c.alive * c.web;
    }
    // ── 年額（売上は月割り・お金は始めた月と更新の月）
    let annualActive = 0; let annualRevenue = 0; let annualCash = 0; let webA = 0;
    for (const c of aCoh) {
      const age = monthsBetween(c.start, ym);
      if (age === 0) c.alive = c.size; else if (age % 12 === 0) c.alive *= A.renew[y] ?? 0.4;
      const price = c.founding && age < 12 ? A.foundingYen : A.annualYen;
      annualActive += c.alive; annualRevenue += (c.alive * price) / 12; webA += c.alive * c.web;
      if (age % 12 === 0) annualCash += c.alive * price;
    }
    const consumerPaid = monthlyActive + annualActive;
    // ── 法人
    const b2bAge = monthsBetween(A.b2bFrom, ym);
    const companies = inPlan && b2bAge >= 0 ? Math.round(ramp({ [y - 1]: A.b2bCompanies[y - 1] ?? 0, ...A.b2bCompanies }, ym) * (y === yearOf(A.b2bFrom) ? Math.min(1, (b2bAge + 1) / 6) : 1)) : 0;
    const seats = Math.round(companies * (A.b2bSeats[y] ?? A.b2bSeats[2029]));
    const seatYen = A.b2bSeatYen[y] ?? A.b2bSeatYen[2029];
    const paid = consumerPaid + seats;
    // ── 売上・手数料
    const monthlyRevenue = monthlyActive * A.monthlyYen;
    const b2bRevenue = seats * seatYen;
    const appRevenue = monthlyRevenue + annualRevenue;
    const webPart = consumerPaid > 0 ? (webM + webA) / consumerPaid : 0;
    const fee = appRevenue * ((1 - webPart) * A.appleFee + webPart * A.stripeFee) + b2bRevenue * A.stripeFee;
    const refunds = appRevenue * A.refundRate;
    const revenue = appRevenue + b2bRevenue;
    // ── 費用
    const freeActive = consumerPaid * A.freePerPaid + installs * 0.15;
    const ai = paid * A.aiPerPaidYen + freeActive * A.aiPerFreeYen;
    const outsourceTable = A.outsource[plan];
    const outsource = ym >= `${y}-04` && outsourceTable[`${y}-04`] != null ? outsourceTable[`${y}-04`] : (outsourceTable[y] ?? 0);
    const androidBuild = androidOn && monthsBetween(A.androidBuild.from, ym) >= 0 && monthsBetween(A.androidBuild.from, ym) < A.androidBuild.months ? A.androidBuild.yenPerMonth : 0;
    const b2bOk = b2bPilotOk(rows);
    const activeHires = plan === 'pass' && y >= 2029 ? A.hires.filter((h) => ym >= h.from && (!h.needsB2b || b2bOk)) : [];
    const salaries = activeHires.reduce((s, h) => s + h.salaryYen * (1 + A.socialRate), 0);
    const hireFees = plan === 'pass' ? A.hires.filter((h) => h.from === ym && (!h.needsB2b || b2bOk)).reduce((s, h) => s + h.salaryYen * 12 * A.hireFeeRate, 0) : 0;
    const ownerPay = (A.ownerPay[plan][y] ?? 0) * (1 + (y >= 2028 ? A.socialRate : 0));
    const people = inPlan ? ownerPay + outsource + androidBuild + salaries + hireFees : 0;
    const marketing = inPlan ? adSpend + (A.creative[plan][y] ?? 0) : 0;
    const infra = inPlan ? A.infraBaseYen + (paid + freeActive) * A.infraPerUserYen : 0;
    const other = inPlan ? (A.otherYen[y] ?? 0) + (ym >= A.incorporation.at ? A.accountantYen : 0) + (ym === A.incorporation.at ? A.incorporation.yen : 0) : 0;
    const profit = revenue - fee - refunds - ai - people - marketing - infra - other;
    if (inPlan) yearProfit[y] = (yearProfit[y] || 0) + profit * (ym >= A.incorporation.at ? 1 : 0);
    // ── 税（法人化の後の利益に。翌年 3 月に払う）
    let corpTax = 0;
    if (monthOf(ym) === 3 && taxDue[y - 1] != null) corpTax = taxDue[y - 1];
    if (monthOf(ym) === 12 && inPlan) taxDue[y] = Math.max(0, yearProfit[y] || 0) * A.corpTaxRate + (ym >= A.incorporation.at ? A.corpTaxFixedYen : 0);
    // ── お金（入金の遅れ）
    if (inPlan) {
      addCash(addMonths(ym, 2), (monthlyRevenue) * (1 - ((1 - webPart) * A.appleFee + webPart * A.stripeFee)) - monthlyRevenue * A.refundRate + annualCash * (1 - ((1 - webPart) * A.appleFee + webPart * A.stripeFee)) - annualCash * A.refundRate);
      addCash(addMonths(ym, 2), b2bRevenue * (1 - A.stripeFee));
    }
    const out = ai + people + marketing + infra + other + corpTax;
    cash += (cashIn[ym] || 0) - out;
    if (cash < minCash) { minCash = cash; minCashYm = ym; }
    rows.push({ ym, inPlan, plan, installs, organic, android, paidInstalls, conv, newPaid, monthlyActive, annualActive, consumerPaid, seats, companies, paid, revenue, b2bRevenue, fee, refunds, ai, people, marketing, adSpend, infra, other, profit, corpTax, cash });
    if (ym === A.androidGate.at) androidOn = paid >= A.androidGate.paid;
    if (!noGates && A.midCheck && ym === A.midCheck.at && (pass[y] ?? true) && paid < A.midCheck.paid) { pass[y] = false; gateResult.mid = { ok: false, paid: Math.round(paid) }; } else if (!noGates && A.midCheck && ym === A.midCheck.at) gateResult.mid = { ok: paid >= A.midCheck.paid, paid: Math.round(paid) };
    // ── 年末の関門の判定（次の年の費用の計画を決める）
    if (!noGates && monthOf(ym) === 12 && A.gates[y]) {
      const g = A.gates[y];
      const last3 = rows.slice(-3);
      const ok = y === 2027 ? paid >= g.paid && revenue >= g.mrrYen && cash >= (g.cashYen ?? 0) : paid >= g.paid && last3.reduce((s, r) => s + r.profit, 0) / 3 >= g.profit3m;
      gateResult[y] = { ok, paid: Math.round(paid), revenue: Math.round(revenue) };
      pass[y + 1] = ok && (pass[y] ?? true);
    }
  }
  rows.gates = gateResult; rows.minCash = minCash; rows.minCashYm = minCashYm; rows.androidOn = androidOn;
  return rows;
}

// 年ごとのまとめ（2027〜2029）
export function yearly(rows) {
  const out = {};
  for (const r of rows) {
    const y = yearOf(r.ym); if (y < 2027 || !r.inPlan) continue;
    const o = (out[y] ||= { year: y, installs: 0, newPaid: 0, revenue: 0, fee: 0, refunds: 0, ai: 0, people: 0, marketing: 0, adSpend: 0, infra: 0, other: 0, profit: 0, months: 0 });
    for (const k of ['installs', 'newPaid', 'revenue', 'fee', 'refunds', 'ai', 'people', 'marketing', 'adSpend', 'infra', 'other', 'profit']) o[k] += r[k];
    o.months += 1;
    Object.assign(o, { paidEnd: r.paid, consumerEnd: r.consumerPaid, seatsEnd: r.seats, companiesEnd: r.companies, mrrEnd: r.revenue, cashEnd: r.cash, plan: r.plan });
  }
  for (const o of Object.values(out)) {
    const taxRow = rows.find((r) => r.ym === `${o.year + 1}-03`);
    o.corpTax = taxRow ? taxRow.corpTax : 0; // その年の利益にかかる税（翌年 3 月に払う額）
    o.profitAfterTax = o.profit - o.corpTax;
    o.ownerMarketAdj = -(BASE.ownerMarketPayYen * 12) + (o.year >= 2028 ? 0 : 0);
  }
  return Object.values(out);
}

// 黒字になる月（その月の利益が 0 以上になり、そのあと 3 か月続いた最初の月）
export function breakEvenMonth(rows) {
  for (let i = 0; i + 3 < rows.length; i += 1) if (rows[i].inPlan && [0, 1, 2, 3].every((k) => rows[i + k].profit >= 0)) return rows[i].ym;
  return null;
}

// 感度: 1 つの前提だけを悪くしたとき（関門で止める／止めない の 2 通り）
export function sensitivity(A = BASE) {
  const at2029 = (B, noGates) => yearly(simulate(B, { noGates })).find((o) => o.year === 2029);
  const base = at2029(A, false);
  const scale = (obj, f) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v * f]));
  const cases = [
    ['入れた人 → 有料 −30%', { installToPaid: scale(A.installToPaid, 0.7) }],
    ['自然な流入 −30%', { organicInstalls: scale(A.organicInstalls, 0.7) }],
    ['自然な流入の伸びが 6 か月遅れる', { organicDelayMonths: 6 }],
    ['汎用 AI が同じことを無料に（2028 年から有料になる率 −20%）', { installToPaid: { ...A.installToPaid, 2028: A.installToPaid[2028] * 0.8, 2029: A.installToPaid[2029] * 0.8 } }],
    ['Android を出さない', { androidFrom: '2099-01', androidBuild: { ...A.androidBuild, months: 0 } }],
    ['1 か月目の解約 ＋10 ポイント', { firstMonthChurn: A.firstMonthChurn + 0.1 }],
    ['月額の解約 ＋2 ポイント', { steadyChurn: Object.fromEntries(Object.entries(A.steadyChurn).map(([k, v]) => [k, v + 0.02])) }],
    ['年額の更新 −15 ポイント', { renew: Object.fromEntries(Object.entries(A.renew).map(([k, v]) => [k, v - 0.15])) }],
    ['年額で始める割合 −15 ポイント', { annualShare: A.annualShare - 0.15 }],
    ['値段を 10% 下げる（ほかは同じ）', { monthlyYen: A.monthlyYen * 0.9, annualYen: A.annualYen * 0.9 }],
    ['法人の社数 半分', { b2bCompanies: scale(A.b2bCompanies, 0.5) }],
    ['無料の人の AI の原価 ×3', { aiPerFreeYen: A.aiPerFreeYen * 3 }],
    ['広告で入れた人が有料になりやすい（1.5 倍）が無い', { adConvMult: 1.0 }],
    ['まとめて悪い（有料になる率 −30% と流入 −30%）', { installToPaid: scale(A.installToPaid, 0.7), organicInstalls: scale(A.organicInstalls, 0.7) }],
  ];
  return cases.map(([label, patch]) => {
    const B = { ...A, ...patch };
    const g = at2029(B, false); const f = at2029(B, true);
    return { label, paidEnd: g.paidEnd, dPaid: g.paidEnd - base.paidEnd, profit: g.profit, dProfit: g.profit - base.profit, profitNoGates: f.profit };
  });
}
