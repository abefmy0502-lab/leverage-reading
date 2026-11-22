// 📈 中期経営計画（2027〜2029）の月ごとの計算（v3・2026-11-22・3 人の点検＝戦略・財務・成長と組織の 2 回目の指摘を反映）。
//
// 数字を手で置かない。前提（BASE）を変えると、月ごとの有料・売上・費用・税・現金と、年ごとのまとめが出る。
//   node scripts/plan/plan.mjs   → 3 つの見込み・関門の判定・現金・生涯の利益と回収・感度・網の目の点検
// 計画の文書（company/mid-term-plan-2027-2029.md）の表は scripts/plan/render-md.mjs が、ダッシュボードは plan.json がここから作る。
//
// 置き方の決まり（v3）:
// - 流入は道ごとに下から積む（App Store の検索＝検索の数 × 上位に出る割合 × 入れる率・SNS・協業と note・利用者の共有）。
// - **お金を足す計画（pass）と止める計画（hold）で、伸び方も変わる**。外注・社員・制作は受け持つ道の流入と率に結びつく。
//   止める計画では 2028 年からの伸びが半分になる（人を足した分の伸びが無い）。
// - 関門（2027 年末・2028 年 6 月・2028 年末・2029 年 6 月）を計算の中で判定し、通らなければ止める計画に切り替える。
// - **現金の見張り**: どの月でも、手元の現金が「その月の支出の 3 か月分」を下回ったら、その年の残りは止める計画にする。
//   （現金＋決まっている 2 か月分の入金で見る）。社員を入れるのは、その月の現金が 6 か月分の決まった支出以上のときだけ。
// - 借入: 2027 年末の関門を通ったら、2028 年 1 月に日本政策金融公庫の創業融資 ¥500 万（年 2%・6 か月すえ置き・54 か月で返す）。
// - 税: 法人化（有料 400 人に届いた次の月）の前は個人の税（30%・翌年 3 月）。法人は 12 月決算・2 月に払う・前の年の税が ¥20 万を超えたら 8 月に半分を中間で払う。
//   消費税は預かった分をそのまま納める保守的な置き方。
// - 手数料: App Store 15%（前の年の App の売上が ¥1.5 億を超えたら 30%）。Web は Stripe 3.6% ＋ Apple の手数料が掛かる場合の 5%。
// - お金: App Store の入金は 2 か月遅れ、法人の請求も 2 か月遅れ。年額は始めた月（と更新の月）にまとめて入る。

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
  const keys = Object.keys(byYear).filter((k) => /^\d{4}$/.test(k)).map(Number);
  const cur = byYear[y] ?? byYear[Math.max(...keys)];
  const prev = byYear[y - 1] ?? cur;
  return lerp(prev, cur, (m - 1) / 11);
};
// 止める計画の伸び: 2027 年の値から先は、伸びを半分にする
const holdOf = (byYear) => {
  const out = { ...byYear };
  for (const y of [2028, 2029]) if (byYear[y] != null) out[y] = out[y - 1] + (byYear[y] - byYear[y - 1]) * 0.5;
  return out;
};
// 'YYYY-MM' の鍵はその月から、無ければ年の値
const monthOrYear = (table, ym) => {
  const y = yearOf(ym);
  const keys = Object.keys(table).filter((k) => k.length === 7 && k.startsWith(`${y}-`) && k <= ym).sort();
  return keys.length ? table[keys[keys.length - 1]] : (table[y] ?? 0);
};

// 季節（読書・学びの山場: 1 月「今年こそ読む」・4 月 新生活・12 月「今年の読書」）
export const SEASON = { 1: 1.35, 2: 1.0, 3: 1.05, 4: 1.2, 5: 1.0, 6: 0.9, 7: 0.9, 8: 0.95, 9: 1.0, 10: 1.0, 11: 1.0, 12: 1.3 };

export const BASE = {
  name: '基本',
  startingCash: 1_000_000, // 始めの手元資金（オーナーが入れる額・要確認）
  // ── iPhone の自然な流入（月・季節の山を除く）を、道ごとに下から積む（文書 §5-2）。いちばん弱い前提なので 2027-01 から実測で置き直す
  search: { searches: { 2026: 60_000, 2027: 63_000, 2028: 66_000, 2029: 70_000 }, visibility: { 2026: 0.08, 2027: 0.33, 2028: 0.45, 2029: 0.55 }, installRate: 0.12 },
  // ↑ App Store の検索: 主な言葉（読書記録・読書管理・読書メモ・読書ノート・積読・本棚 など）の月の検索（仮定・2027-01 に Apple の検索広告の人気度で確かめる）× 上位に出る割合 × 出たときに入れる率
  snsInstalls: { 2026: 200, 2027: 1100, 2028: 2400, 2029: 3800 }, // SNS（月の見られた数 × 0.1% の目安・2027 年末で月 110 万回）
  collabInstalls: { 2026: 200, 2027: 600, 2028: 1000, 2029: 1500 }, // 協業・note・プレス（協業 1 件 約 100 人・note 月 4 本）
  shareInstallsPerActive: 0.02, // 利用者の共有（使っている人 1 人あたり月 0.02 人＝共有 4% × 1 枚 0.5 人）
  organicMult: 1, organicDelayMonths: 0, // 見込み・感度で動かす
  marketerLift: 0.15, // 2029 年のマーケの社員: 入った月から 6 か月かけて、検索と協業の流入を +15%
  // ── Android（2027 年 9 月に有料 400 人以上なら作る）
  androidFrom: '2028-03', androidShare: 0.5, androidRampMonths: 9, androidConvMult: 0.6,
  androidBuild: { from: '2027-10', months: 5, yenPerMonth: 200_000 }, androidGate: { at: '2027-09', paid: 300 },
  // ── 有料になる
  installToPaid: { 2026: 0.02, 2027: 0.024, 2028: 0.026, 2029: 0.028 }, // RevenueCat 2026: 無料プランのあるアプリの中央値 2.1%（35 日以内）
  convShock: null, // { from: 'YYYY-MM', mult } 汎用 AI など（感度）
  devLift: 0.08, // 2029 年の開発の社員: 入った月から 6 か月かけて、有料になる率を +8%
  annualShare: 0.45,
  firstMonthChurn: 0.3, steadyChurn: { 2026: 0.09, 2027: 0.09, 2028: 0.08, 2029: 0.07 }, // 1 年後に約 25% が残る（日本の月額 26%）
  renew: { 2027: 0.4, 2028: 0.45, 2029: 0.5 }, // 世界 28〜36%・日本 58%
  webShare: { 2026: 0, 2027: 0.03, 2028: 0.12, 2029: 0.2 },
  // ── 広告（App Store の検索広告）。取り戻す月数が 12 か月以内の年だけ増やす。それ以外は月 ¥10 万の試し
  adFrom: '2028-01', cpi: 400, adConvMult: 1.5, adTestYen: 100_000, adScaleYen: { 2028: 600_000, 2029: 2_000_000 }, adPaybackMax: 12,
  // ── 法人: 2028 年 7〜12 月に 5 社の試し（席 15・割引 ¥490）。2029 年 1 月に更新（率は前提）。通れば法人営業を入れて 30 社へ
  b2bFrom: '2028-07', b2bPilot: 5, b2bRenewRate: 0.6, b2bPilotPassRate: 0.6, b2bCompaniesWithSales: 30, b2bCompaniesWithoutSales: 8,
  b2bSeats: { 2028: 15, 2029: 35 }, b2bSeatYen: { 2028: 490, 2029: 980 },
  // ── 値段（税抜）と手数料
  monthlyYen: 1345, annualYen: 11636, foundingYen: 8909, foundingUntil: '2027-01',
  appleFee: 0.15, appleFeeLarge: 0.3, appleLargeYen: 150_000_000, stripeFee: 0.036, webAppleFee: 0.05, refundRate: 0.015,
  // ── AI の原価
  aiPerPaidYen: 50, freePerPaid: 6, aiPerFreeYen: 10,
  // ── 費用（pass＝お金を足す計画・hold＝止める計画）。円・月。'YYYY-MM' はその月から
  ownerPay: { pass: { 2027: 0, 2028: 0, '2028-04': 250_000, 2029: 250_000 }, hold: { 2027: 0, 2028: 0, 2029: 0 } },
  supportFromInstalls: 3300, supportYen: 60_000, // サポートと通報の外注は、月の入れた人が 3,300 人（問い合わせ 約 50 件）を超えた月から
  outsource: { pass: { 2027: 0, 2028: 0, '2028-05': 300_000, '2028-06': 460_000, 2029: 460_000 }, hold: { 2027: 0, 2028: 0, 2029: 0 } },
  // ↑ 2028 年 5 月 開発（月 ¥30 万）・6 月 SNS と動画（月 ¥16 万）。30 日前に知らせれば解約できる契約
  hires: [ // 2029 年の社員（2028 年末の関門・その月の現金が 6 か月分以上のときだけ。候補は 2028-Q3 から条件つきの内定で探す）
    { from: '2029-04', title: '開発', salaryYen: 550_000, lift: 'dev' },
    { from: '2029-07', title: '法人営業', salaryYen: 500_000, needsB2b: true, lift: 'b2b' }, // 法人の試しが通ったときだけ
    { from: '2029-10', title: 'マーケ', salaryYen: 500_000, lift: 'mkt' },
  ],
  socialRate: 0.15, hireFeeRate: 0.3, // 会社が払う社会保険・採用の費用（年収の 30%）
  creative: { pass: { 2027: 30_000, 2028: 150_000, 2029: 50_000 }, hold: { 2027: 30_000, 2028: 30_000, 2029: 50_000 } },
  infraBaseYen: 30_000, infraPerUserYen: 3,
  otherYen: { 2027: 20_000, 2028: 60_000, 2029: 150_000 }, incorporationYen: 250_000, accountantYen: 30_000, incorporateAtPaid: 400,
  personalTaxRate: 0.3, corpTaxRate: 0.3, corpTaxFixedYen: 70_000,
  loan: { yen: 5_000_000, at: '2028-01', rate: 0.02, graceMonths: 6, termMonths: 54 }, // 2027 年末の関門を通ったときだけ
  ownerMarketPayYen: 500_000, // オーナーに市場の報酬（社会保険込みで比べる）を払ったときの比べ用
  cashGuardMonths: 3, hireCashMonths: 6,
  // ── 関門（計算の中で判定）。数は基本の見込みの 8 割前後
  gates: { 2027: { paid: 450, mrrYen: 500_000, cashYen: 1_000_000 }, 2028: { paid: 1600, profit3m: 0 } },
  midChecks: [{ at: '2028-06', paid: 900 }, { at: '2029-06', paid: 2600 }], // 逆の決まり: 2028 年 6 月は外注と広告を止め（オーナーの報酬は残す）、2029 年 6 月は社員を足さない
};

export const SCENARIOS = {
  low: { ...BASE, name: '控えめ', organicMult: 0.65, shareInstallsPerActive: 0.012, installToPaid: { 2026: 0.012, 2027: 0.015, 2028: 0.017, 2029: 0.018 }, firstMonthChurn: 0.35, steadyChurn: { 2026: 0.115, 2027: 0.115, 2028: 0.105, 2029: 0.1 }, renew: { 2027: 0.3, 2028: 0.32, 2029: 0.35 }, b2bRenewRate: 0.4, cpi: 550, adConvMult: 1.0 },
  base: BASE,
  high: { ...BASE, name: '強気', organicMult: 1.35, shareInstallsPerActive: 0.03, installToPaid: { 2026: 0.025, 2027: 0.03, 2028: 0.034, 2029: 0.036 }, firstMonthChurn: 0.25, steadyChurn: { 2026: 0.07, 2027: 0.07, 2028: 0.06, 2029: 0.055 }, renew: { 2027: 0.5, 2028: 0.55, 2029: 0.58 }, b2bRenewRate: 0.8, b2bCompaniesWithSales: 50, cpi: 320 },
};

const webFee = (A) => A.stripeFee + A.webAppleFee;
const keepMonthly = (A) => A.monthlyYen * (1 - A.appleFee) - A.aiPerPaidYen;
const keepAnnual = (A) => A.annualYen * (1 - A.appleFee) - A.aiPerPaidYen * 12;
// きびしめ: 返金・無料の人の AI（有料 1 人あたり）・サーバーも引く
const keepMonthlyStrict = (A) => keepMonthly(A) - A.monthlyYen * A.refundRate - A.freePerPaid * A.aiPerFreeYen - A.infraPerUserYen * (1 + A.freePerPaid);
const keepAnnualStrict = (A) => keepAnnual(A) - A.annualYen * A.refundRate - 12 * (A.freePerPaid * A.aiPerFreeYen + A.infraPerUserYen * (1 + A.freePerPaid));

// 1 人の生涯の利益（月額・年額）。strict＝きびしめ（返金・無料の人の AI・サーバーを引き、年 10% で割り引く）
export function lifetimeValue(A = BASE, year = 2028, { strict = false, fromMonth = 0 } = {}) {
  const steady = A.steadyChurn[year] ?? 0.08; const renew = A.renew[year] ?? 0.4;
  const monthlyMonths = 1 + (1 - A.firstMonthChurn) / steady;
  if (!strict) {
    const ltvMonthly = keepMonthly(A) * monthlyMonths; const ltvAnnual = keepAnnual(A) / (1 - renew);
    return { monthlyMonths, ltvMonthly, ltvAnnual, blended: ltvMonthly * (1 - A.annualShare) + ltvAnnual * A.annualShare };
  }
  const d = (1.1) ** (1 / 12); let ltvMonthly = 0; let ltvAnnual = 0; let aliveM = 1; let aliveA = 1;
  for (let mo = 0; mo < 120; mo += 1) {
    if (mo === 1) aliveM *= 1 - A.firstMonthChurn; else if (mo > 1) aliveM *= 1 - steady;
    if (mo > 0 && mo % 12 === 0) aliveA *= renew;
    if (mo < fromMonth) continue; // fromMonth: 入ってから何か月目より先の分だけ（その年の売上に入った分を除く）
    ltvMonthly += (aliveM * keepMonthlyStrict(A)) / d ** mo;
    if (mo % 12 === 0) ltvAnnual += (aliveA * keepAnnualStrict(A)) / d ** mo;
  }
  return { monthlyMonths, ltvMonthly, ltvAnnual, blended: ltvMonthly * (1 - A.annualShare) + ltvAnnual * A.annualShare };
}

// 広告で有料 1 人を取る費用と、入った月ごとの集団で「取り戻す月数」（解約と年額の前払い・更新を入れる）
// strict＝きびしめ（広告で入れた人が有料になりやすい 1.5 倍を使わず、返金・無料の人の AI・サーバーも引く）
export function paidAcquisition(A = BASE, year = 2028, { strict = false } = {}) {
  const conv = (A.installToPaid[year] ?? 0.025) * (strict ? 1 : A.adConvMult);
  const cac = A.cpi / conv;
  const ltv = lifetimeValue(A, year, { strict }).blended;
  const steady = A.steadyChurn[year] ?? 0.08; const renew = A.renew[year] ?? 0.4;
  const km = strict ? keepMonthlyStrict(A) : keepMonthly(A); const ka = strict ? keepAnnualStrict(A) : keepAnnual(A);
  let cum = 0; let payback = null; let aliveM = 1; let aliveA = 1;
  for (let mo = 0; mo < 60; mo += 1) {
    if (mo === 1) aliveM *= 1 - A.firstMonthChurn; else if (mo > 1) aliveM *= 1 - steady;
    if (mo > 0 && mo % 12 === 0) aliveA *= renew;
    cum += (1 - A.annualShare) * aliveM * km + (mo % 12 === 0 ? A.annualShare * aliveA * ka : 0);
    if (payback == null && cum >= cac) payback = mo + 1;
  }
  return { cac, ltv, ratio: ltv / cac, paybackMonths: payback ?? 61 };
}

// 月ごとに計算する（関門・現金の見張り・広告の決まりも、この中で判定する）
export function simulate(A = BASE, opts = {}) {
  const { noGates = false } = opts; // noGates: 関門と現金の見張りで止めない＝感度の比べ用
  const rows = [];
  const mCoh = []; const aCoh = [];
  // 費用の計画: pass＝足す・hold＝止める（兼業に戻す・外注なし）・freeze＝今の契約（オーナーの報酬・外注・社員）は残し、新しく足さない・guard＝現金の見張り（オーナーと社員は残し、外注と新しい費用を止める）
  const mode = { 2027: 'pass', 2028: 'pass', 2029: 'pass' };
  const frozen = { owner: 0, outsource: 0 };
  const gateResult = {}; const events = [];
  const cashIn = {}; const addCash = (ym, v) => { cashIn[ym] = (cashIn[ym] || 0) + v; };
  let cash = A.startingCash; let minCash = cash; let minCashYm = MONTHS[0];
  let androidOn = null; let incorporatedAt = null; let loanOut = 0; let loanTaken = false;
  const corpProfit = {}; const personalProfit = {}; const taxDue = {}; const interimPaid = {};
  const hired = []; let b2bPilotOk = null; let prevYearAppRevenue = 0; let curYearAppRevenue = 0;
  // 止める計画の伸び: 切り替えた月の水準から先だけ、伸びを半分にする（切り替えた月に段差を作らない）。
  // freeze は外注（開発・SNS と動画）を残すので、SNS と有料になる率の伸びは続く。hold と guard は外注を止めるので全部半分。
  let slowFrom = null; let slowMode = null;
  const SLOW = { hold: ['sns', 'collab', 'vis', 'conv'], guard: ['sns', 'collab', 'vis', 'conv'], freeze: [] }; // freeze は 2029 年の pass と同じ費用（社員だけが違う）
  const slow = (key, table, at) => {
    const v = ramp(table, at);
    if (!slowFrom || at < slowFrom || !SLOW[slowMode].includes(key)) return v;
    const v0 = ramp(table, slowFrom); return v0 + (v - v0) * 0.5;
  };
  let lastSpend = 0; let lastFixed = 0;
  for (const ym of MONTHS) {
    const y = yearOf(ym); const mo = monthOf(ym); const season = SEASON[mo];
    const inPlan = ym <= PLAN_LAST;
    if (mo === 1) { prevYearAppRevenue = curYearAppRevenue; curYearAppRevenue = 0; }
    const plan = noGates ? 'pass' : (mode[y] ?? 'pass');
    const isPass = plan === 'pass';
    if (!isPass && !noGates && (!slowFrom || slowMode !== plan)) { if (!slowFrom) slowFrom = ym; slowMode = plan === 'hold' || slowMode === 'hold' ? 'hold' : plan === 'guard' || slowMode === 'guard' ? 'guard' : 'freeze'; }
    // ── 社員の効き目（入った月から 6 か月かけて）
    const liftOf = (kind, amount) => { const h = hired.find((x) => x.lift === kind); return h ? amount * Math.min(1, (monthsBetween(h.from, ym) + 1) / 6) : 0; };
    // ── 入れる人（道ごと）
    const oy = addMonths(ym, -A.organicDelayMonths); const oym = oy < '2026-12' ? '2026-12' : oy;
    const early = A.organicDelayMonths && oy < '2026-12' ? 0.5 : 1;
    const mk = 1 + liftOf('mkt', A.marketerLift);
    const ch = {
      search: ramp(A.search.searches, oym) * slow('vis', A.search.visibility, oym) * A.search.installRate * mk,
      sns: slow('sns', A.snsInstalls, oym),
      collab: slow('collab', A.collabInstalls, oym) * mk,
      share: rows.length ? (rows[rows.length - 1].paid + rows[rows.length - 1].freeActive) * A.shareInstallsPerActive : 0,
    };
    for (const k of ['search', 'sns', 'collab']) ch[k] *= A.organicMult * early;
    for (const k of Object.keys(ch)) ch[k] = inPlan ? Math.round(ch[k] * season) : 0;
    const organic = ch.search + ch.sns + ch.collab + ch.share;
    const andAge = androidOn ? monthsBetween(A.androidFrom, ym) : -1;
    const android = inPlan && andAge >= 0 ? Math.round(organic * A.androidShare * Math.min(1, (andAge + 1) / A.androidRampMonths)) : 0;
    const scaleOk = paidAcquisition(A, y).paybackMonths <= A.adPaybackMax;
    const adSpend = inPlan && ym >= A.adFrom && isPass ? (scaleOk ? ramp(A.adScaleYen, ym) : y === yearOf(A.adFrom) ? A.adTestYen : 0) : 0; // 試しは 2028 年の 1 年だけ
    const paidInstalls = Math.round(adSpend / A.cpi);
    const installs = organic + android + paidInstalls;
    let conv = slow('conv', A.installToPaid, ym) * (1 + liftOf('dev', A.devLift));
    if (A.convShock && ym >= A.convShock.from) conv *= A.convShock.mult;
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
    let companies = 0;
    if (inPlan && ym >= A.b2bFrom) {
      if (y === yearOf(A.b2bFrom)) companies = Math.round(A.b2bPilot * Math.min(1, (monthsBetween(A.b2bFrom, ym) + 1) / 6));
      else {
        if (b2bPilotOk == null) b2bPilotOk = A.b2bRenewRate >= A.b2bPilotPassRate;
        const renewed = Math.round(A.b2bPilot * A.b2bRenewRate);
        const sales = hired.find((h) => h.lift === 'b2b');
        const goal = !b2bPilotOk ? renewed : sales ? A.b2bCompaniesWithSales : A.b2bCompaniesWithoutSales;
        // 研修会社経由: 1 月から 12 か月かけて。法人営業: 入れてから 2 か月は商談だけ、そのあと 12 か月かけて（法人の売り方は時間がかかる）
        const progress = sales ? (monthsBetween(sales.from, ym) - 2) / 12 : (monthsBetween(`${y}-01`, ym) + 1) / 12;
        const base0 = sales ? Math.max(renewed, Math.round(renewed + (A.b2bCompaniesWithoutSales - renewed) * (monthsBetween(`${y}-01`, sales.from) + 1) / 12)) : renewed;
        companies = Math.round(base0 + (goal - base0) * Math.min(1, Math.max(0, progress)));
      }
    }
    const seats = Math.round(companies * ramp(A.b2bSeats, ym));
    const seatYen = A.b2bSeatYen[y] ?? A.b2bSeatYen[2029];
    const paid = consumerPaid + seats;
    // ── 売上・手数料
    const monthlyRevenue = monthlyActive * A.monthlyYen;
    const b2bRevenue = seats * seatYen;
    const appRevenue = monthlyRevenue + annualRevenue;
    curYearAppRevenue += appRevenue;
    const apple = prevYearAppRevenue > A.appleLargeYen ? A.appleFeeLarge : A.appleFee;
    const webPart = consumerPaid > 0 ? (webM + webA) / consumerPaid : 0;
    const feeRate = (1 - webPart) * apple + webPart * webFee(A);
    const fee = appRevenue * feeRate + b2bRevenue * A.stripeFee;
    const refunds = appRevenue * A.refundRate;
    const revenue = appRevenue + b2bRevenue;
    // ── 費用
    const freeActive = consumerPaid * A.freePerPaid + installs * 0.15;
    const ai = paid * A.aiPerPaidYen + freeActive * A.aiPerFreeYen;
    const prevInstalls = rows.length ? rows[rows.length - 1].installs : 0;
    const support = inPlan && prevInstalls >= A.supportFromInstalls ? A.supportYen : 0;
    const outsourceBase = plan === 'pass' ? monthOrYear(A.outsource.pass, ym) : plan === 'freeze' ? frozen.outsource : monthOrYear(A.outsource.hold, ym);
    const outsource = outsourceBase + support;
    const androidBuild = androidOn && monthsBetween(A.androidBuild.from, ym) >= 0 && monthsBetween(A.androidBuild.from, ym) < A.androidBuild.months ? A.androidBuild.yenPerMonth : 0;
    // 社員: 関門（pass）・その月の現金が 6 か月分以上・法人営業は試しが通ったときだけ
    let hireFees = 0;
    if (inPlan && isPass && !noGates) {
      for (const h of A.hires) {
        if (h.from !== ym || hired.includes(h)) continue;
        if (h.needsB2b && !(A.b2bRenewRate >= A.b2bPilotPassRate)) { events.push({ ym, what: `${h.title}の社員: 法人の試しが通らないので入れない` }); continue; }
        if (cash < A.hireCashMonths * (lastFixed + h.salaryYen * (1 + A.socialRate)) + h.salaryYen * 12 * A.hireFeeRate) { events.push({ ym, what: `${h.title}の社員: 現金が 6 か月分に届かないので入れない` }); continue; }
        hired.push(h); hireFees += h.salaryYen * 12 * A.hireFeeRate; events.push({ ym, what: `${h.title}の社員を入れる` });
      } } else if (inPlan && noGates) {
      for (const h of A.hires) if (h.from === ym && !hired.includes(h) && (!h.needsB2b || A.b2bRenewRate >= A.b2bPilotPassRate)) { hired.push(h); hireFees += h.salaryYen * 12 * A.hireFeeRate; }
    }
    const salaries = hired.filter((h) => ym >= h.from).reduce((s, h) => s + h.salaryYen * (1 + A.socialRate), 0);
    const ownerBase = plan === 'pass' ? monthOrYear(A.ownerPay.pass, ym) : plan === 'hold' ? monthOrYear(A.ownerPay.hold, ym) : frozen.owner;
    if (plan !== 'freeze') { frozen.owner = ownerBase; frozen.outsource = outsourceBase; } // 今の契約を控える（guard で止めた外注は 0 のまま）
    const ownerPay = ownerBase * (1 + (incorporatedAt && ym >= incorporatedAt ? A.socialRate : 0));
    const people = inPlan ? ownerPay + outsource + androidBuild + salaries + hireFees : 0;
    const marketing = inPlan ? adSpend + ((isPass ? A.creative.pass : A.creative.hold)[y] ?? 0) : 0;
    const infra = inPlan ? A.infraBaseYen + (paid + freeActive) * A.infraPerUserYen : 0;
    // 法人化: 有料 400 人に届いた次の月（2027 年 10 月より前にはしない）
    let incorporation = 0;
    if (!incorporatedAt && inPlan && paid >= A.incorporateAtPaid && ym >= '2027-09') { incorporatedAt = addMonths(ym, 1); }
    if (incorporatedAt === ym) incorporation = A.incorporationYen;
    const interest = loanOut * (A.loan.rate / 12);
    const other = inPlan ? (A.otherYen[y] ?? 0) + (incorporatedAt && ym >= incorporatedAt ? A.accountantYen : 0) + incorporation + interest : interest;
    const profit = revenue - fee - refunds - ai - people - marketing - infra - other;
    if (inPlan) {
      if (incorporatedAt && ym >= incorporatedAt) corpProfit[y] = (corpProfit[y] || 0) + profit;
      else personalProfit[y] = (personalProfit[y] || 0) + profit;
    }
    // ── 税（個人: 翌年 3 月。法人: 12 月決算・2 月に払う・前の年が ¥20 万超なら 8 月に半分を中間で）
    let tax = 0;
    if (mo === 3 && personalProfit[y - 1] != null) tax += Math.max(0, personalProfit[y - 1]) * A.personalTaxRate;
    if (mo === 2 && taxDue[y - 1] != null) tax += Math.max(0, taxDue[y - 1] - (interimPaid[y - 1] || 0));
    if (mo === 8 && taxDue[y - 1] != null && taxDue[y - 1] > 200_000 && inPlan) { interimPaid[y] = taxDue[y - 1] / 2; tax += interimPaid[y]; }
    if (mo === 12 && inPlan && incorporatedAt && ym >= incorporatedAt) taxDue[y] = Math.max(0, corpProfit[y] || 0) * A.corpTaxRate + A.corpTaxFixedYen;
    // ── 借入
    let loanFlow = 0;
    if (!loanTaken && ym === A.loan.at && gateResult[2027]?.ok && !noGates) { loanTaken = true; loanOut = A.loan.yen; loanFlow += A.loan.yen; events.push({ ym, what: `借入 ¥${A.loan.yen / 10000} 万` }); }
    else if (noGates && ym === A.loan.at) { loanTaken = true; loanOut = A.loan.yen; loanFlow += A.loan.yen; }
    if (loanTaken && loanOut > 0 && monthsBetween(A.loan.at, ym) >= A.loan.graceMonths) { const pay = Math.min(loanOut, A.loan.yen / A.loan.termMonths); loanOut -= pay; loanFlow -= pay; }
    // ── お金（入金の遅れ）
    if (inPlan) {
      addCash(addMonths(ym, 2), (monthlyRevenue + annualCash) * (1 - feeRate - A.refundRate));
      addCash(addMonths(ym, 2), b2bRevenue * (1 - A.stripeFee));
    }
    const spend = ai + people + marketing + infra + other;
    cash += (cashIn[ym] || 0) - spend - tax + loanFlow;
    lastSpend = spend; lastFixed = people + infra + other + (marketing - adSpend);
    if (cash < minCash) { minCash = cash; minCashYm = ym; }
    const row = { ym, inPlan, plan, installs, organic, ch, freeActive, android, paidInstalls, conv, newPaid, monthlyActive, annualActive, consumerPaid, seats, companies, paid, revenue, b2bRevenue, fee, refunds, ai, people, ownerPay, marketing, adSpend, infra, other, profit, tax, loanFlow, loanOut, cash, spend };
    rows.push(row);
    if (!inPlan) continue;
    if (ym === A.androidGate.at) { androidOn = paid >= A.androidGate.paid; gateResult.android = { ok: androidOn, paid: Math.round(paid) }; }
    if (noGates) continue;
    // ── 現金の見張り: その月の支出の 3 か月分を下回ったら、その年の残りは止める
    const receivable = (cashIn[addMonths(ym, 1)] || 0) + (cashIn[addMonths(ym, 2)] || 0); // 決まっている入金（App Store・法人の 2 か月分）
    if (mode[y] === 'pass' && cash + receivable < A.cashGuardMonths * (spend - hireFees - incorporation) && y >= 2028) { mode[y] = 'guard'; frozen.outsource = 0; events.push({ ym, what: '現金の見張り: 3 か月分を下回ったので、年の残りは外注と新しい費用を止める' }); gateResult.guard = gateResult.guard || ym; }
    // ── 逆の決まり
    for (const c of A.midChecks) if (ym === c.at) { const ok = paid >= c.paid; gateResult[`mid${y}`] = { ok, paid: Math.round(paid) }; if (!ok && mode[y] === 'pass') { mode[y] = y <= 2028 ? 'guard' : 'freeze'; if (y <= 2028) frozen.outsource = 0; events.push({ ym, what: `${ym} の逆の決まり: 有料 ${Math.round(paid)} 人 ＜ ${c.paid} 人なので${y <= 2028 ? '外注と広告の試しを止める（オーナーの報酬は残す）' : '社員を足さない'}` }); } }
    // ── 年末の関門（次の年の費用の計画を決める）
    if (mo === 12 && A.gates[y]) {
      const g = A.gates[y];
      const last3 = rows.slice(-3);
      const ok = y === 2027 ? paid >= g.paid && revenue >= g.mrrYen && cash >= (g.cashYen ?? 0) : paid >= g.paid && last3.reduce((s, r) => s + r.profit, 0) / 3 >= g.profit3m;
      gateResult[y] = { ok, paid: Math.round(paid), revenue: Math.round(revenue), cash: Math.round(cash) };
      mode[y + 1] = mode[y] === 'hold' ? 'hold' : !ok ? (frozen.owner > 0 ? 'freeze' : 'hold') : mode[y] === 'pass' ? 'pass' : 'freeze';
    }
  }
  rows.gates = gateResult; rows.events = events; rows.minCash = minCash; rows.minCashYm = minCashYm; rows.androidOn = androidOn; rows.incorporatedAt = incorporatedAt;
  rows.hired = hired.map((h) => h.title); rows.b2bPilotOk = b2bPilotOk; rows.taxDue = taxDue; rows.personalProfit = personalProfit; rows.mode = mode; rows.interimPaid = interimPaid;
  return rows;
}

// 年ごとのまとめ（2027〜2029）
export function yearly(rows, A = BASE) {
  const out = {};
  for (const r of rows) {
    const y = yearOf(r.ym); if (y < 2027 || !r.inPlan) continue;
    const o = (out[y] ||= { year: y, installs: 0, newPaid: 0, revenue: 0, fee: 0, refunds: 0, ai: 0, people: 0, ownerPay: 0, marketing: 0, adSpend: 0, infra: 0, other: 0, profit: 0, taxPaid: 0, months: 0, ch: { search: 0, sns: 0, collab: 0, share: 0 }, android: 0, paidInstalls: 0 });
    for (const k of ['installs', 'newPaid', 'revenue', 'fee', 'refunds', 'ai', 'people', 'ownerPay', 'marketing', 'adSpend', 'infra', 'other', 'profit', 'android', 'paidInstalls']) o[k] += r[k];
    o.taxPaid += r.tax;
    for (const k of Object.keys(o.ch)) o.ch[k] += r.ch[k];
    o.months += 1;
    Object.assign(o, { paidEnd: r.paid, consumerEnd: r.consumerPaid, seatsEnd: r.seats, companiesEnd: r.companies, mrrEnd: r.revenue, cashEnd: r.cash, loanEnd: r.loanOut, plan: r.plan });
  }
  for (const o of Object.values(out)) {
    o.taxForYear = ((rows.taxDue && rows.taxDue[o.year]) || 0) + Math.max(0, (rows.personalProfit && rows.personalProfit[o.year]) || 0) * A.personalTaxRate; // その年の利益にかかる税（法人は翌年 2 月・個人は翌年 3 月に払う）
    o.profitAfterTax = o.profit - o.taxForYear;
    o.profitMarketOwner = o.profit - (A.ownerMarketPayYen * 12 - o.ownerPay); // オーナーに市場の報酬を払っていたら
    o.cashAfterTaxDue = o.cashEnd - (o.taxForYear - ((rows.interimPaid && rows.interimPaid[o.year]) || 0)); // 年末の現金から、翌年に払う税（中間で払った分を除く）を引いた額
  }
  return Object.values(out);
}

// 黒字になる月（その月の利益が 0 以上になり、そのあと 3 か月続いた最初の月）
export function breakEvenMonth(rows) {
  for (let i = 0; i + 3 < rows.length; i += 1) if (rows[i].inPlan && [0, 1, 2, 3].every((k) => rows[i + k].profit >= 0)) return rows[i].ym;
  return null;
}

// 感度: 1 つの前提だけを悪くしたとき（関門で止める＝計画の動き方／止めない＝比べ用）
export function sensitivity(A = BASE) {
  const at2029 = (B, noGates) => yearly(simulate(B, { noGates }), B).find((o) => o.year === 2029);
  const base = at2029(A, false);
  const scale = (obj, f) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v * f]));
  const cases = [
    ['入れた人 → 有料 −30%', { installToPaid: scale(A.installToPaid, 0.7) }],
    ['自然な流入 −30%', { organicMult: A.organicMult * 0.7 }],
    ['自然な流入の伸びが 6 か月遅れる', { organicDelayMonths: 6 }],
    ['汎用 AI が同じことを無料に（2027 年 7 月から有料になる率 −30%）', { convShock: { from: '2027-07', mult: 0.7 } }],
    ['AI と連携を有料にしない（汎用 AI の中で使われ、2028 年から有料になる率 −15%）', { convShock: { from: '2028-01', mult: 0.85 } }],
    ['Android を出さない', { androidGate: { ...A.androidGate, paid: 1e9 } }],
    ['1 か月目の解約 ＋10 ポイント', { firstMonthChurn: A.firstMonthChurn + 0.1 }],
    ['月額の解約 ＋2 ポイント', { steadyChurn: Object.fromEntries(Object.entries(A.steadyChurn).map(([k, v]) => [k, v + 0.02])) }],
    ['年額の更新 −15 ポイント', { renew: Object.fromEntries(Object.entries(A.renew).map(([k, v]) => [k, v - 0.15])) }],
    ['年額で始める割合 −15 ポイント', { annualShare: A.annualShare - 0.15 }],
    ['値段を 10% 下げる（ほかは同じ）', { monthlyYen: A.monthlyYen * 0.9, annualYen: A.annualYen * 0.9 }],
    ['法人の試しが通らない（更新 2 社）', { b2bRenewRate: 0.4 }],
    ['無料の人の AI の原価 ×3', { aiPerFreeYen: A.aiPerFreeYen * 3 }],
    ['（上振れ）フォローとフィードが Strava のように効く（共有からの流入 ×2・月額の解約 −1 ポイント・2028 年から）', { shareInstallsPerActive: A.shareInstallsPerActive * 2, steadyChurn: { ...A.steadyChurn, 2028: A.steadyChurn[2028] - 0.01, 2029: A.steadyChurn[2029] - 0.01 } }],
    ['まとめて悪い（有料になる率 −30% と流入 −30%）', { installToPaid: scale(A.installToPaid, 0.7), organicMult: A.organicMult * 0.7 }],
  ];
  return cases.map(([label, patch]) => {
    const B = { ...A, ...patch };
    const g = at2029(B, false); const f = at2029(B, true); const r = simulate(B);
    return { label, paidEnd: g.paidEnd, dPaid: g.paidEnd - base.paidEnd, profit: g.profit, dProfit: g.profit - base.profit, profitNoGates: f.profit, minCash: r.minCash, profitMarketOwner: g.profitMarketOwner };
  });
}

// 網の目の点検: 有料になる率と流入を 0.5〜1.3 倍で組み合わせ、無料の人の AI の原価 ×1・×3 でも、現金が 0 を下回らないか
export function stressGrid(A = BASE) {
  const fs = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];
  const out = [];
  for (const cv of fs) for (const og of fs) for (const ai of [1, 3]) {
    const B = { ...A, installToPaid: Object.fromEntries(Object.entries(A.installToPaid).map(([k, v]) => [k, v * cv])), organicMult: A.organicMult * og, aiPerFreeYen: A.aiPerFreeYen * ai };
    const r = simulate(B); out.push({ cv, og, ai, minCash: r.minCash, minCashYm: r.minCashYm, paid2029: r.find((x) => x.ym === '2029-12').paid });
  }
  return out;
}
