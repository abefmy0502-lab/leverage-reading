// 💰 今月の売上と推定の粗利（運営ダッシュボード・2026-10-22）。純粋な計算（テストつき）。
//
// 材料は supabase_admin_profit.sql の admin_profit()（人数・追加トークンの購入・AI の実原価）。
// 価格の真実はストア（月額 ¥1,480・年額 ¥12,800・創業メンバー価格 1 年目 ¥9,800・追加トークン ¥300／¥800・いずれも税込）。
// 年額・創業メンバーは前払いなので、売上は「月あたりに均した額」（年額 ÷ 12）で出す＝毎月の見込みの売上（MRR）。
// 手取り＝税抜（÷1.1）× (1 − App Store の手数料 15%＝小規模事業者)。AI の原価は ai_usage の実額（＋分野の AI 1 冊 ¥0.13）。
// 推定の粗利＝手取り − AI の原価 − 固定費（手入力・端末に保存）。人件費は含めない。
import { FOUNDING_PRICE_YEN } from './foundingOffer';

export const PRICE_MONTHLY_YEN = 1480;
export const PRICE_ANNUAL_YEN = 12800;
export const PRICE_FOUNDING_YEN = FOUNDING_PRICE_YEN;
export const PACK_PRICE_YEN = { orime_tokens_300: 300, orime_tokens_1000: 800 };
export const TAX_RATE = 0.1;
export const STORE_FEE_RATE = 0.15;
export const FIELDS_AI_YEN_PER_BOOK = 0.13;
// 固定費の既定（円／月）: Apple Developer Program 年 ¥12,980 ÷ 12。Supabase・Vercel は無料プランのあいだ 0（Pro にしたら入れる）。
export const DEFAULT_FIXED = { apple: Math.round(12980 / 12), supabase: 0, vercel: 0, other: 0 };
export const FIXED_KEY = 'orime-ops-fixed-costs';

export function loadFixed(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  try {
    const raw = storage?.getItem(FIXED_KEY);
    const p = raw ? JSON.parse(raw) : null;
    const out = { ...DEFAULT_FIXED };
    for (const k of Object.keys(DEFAULT_FIXED)) {
      const v = Number(p?.[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = Math.round(v);
    }
    return out;
  } catch { return { ...DEFAULT_FIXED }; }
}
export function saveFixed(fixed, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  try { storage?.setItem(FIXED_KEY, JSON.stringify(fixed)); } catch { /* 端末に残せなくても動く */ }
}

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// data: admin_profit() の返り値。fixed: { apple, supabase, vercel, other }（円／月）。
export function estimateProfit(data, fixed = DEFAULT_FIXED) {
  const paid = data?.paid || {};
  const monthly = n0(paid.monthly);
  const annual = n0(paid.annual);
  const founding = n0(paid.founding);
  const trial = n0(paid.trial);
  const packs = data?.packs && typeof data.packs === 'object' ? data.packs : {};
  let packsYen = 0;
  let packsCount = 0;
  for (const [id, cnt] of Object.entries(packs)) {
    const c = n0(cnt);
    packsCount += c;
    packsYen += c * (PACK_PRICE_YEN[id] || 0);
  }
  const subsYen = monthly * PRICE_MONTHLY_YEN + (annual * PRICE_ANNUAL_YEN) / 12 + (founding * PRICE_FOUNDING_YEN) / 12;
  const revenueYen = subsYen + packsYen;
  const exTaxYen = revenueYen / (1 + TAX_RATE);
  const storeFeeYen = exTaxYen * STORE_FEE_RATE;
  const netYen = exTaxYen - storeFeeYen;
  const aiYen = n0(data?.ai_cost_mjpy) / 1000 + n0(data?.fields_ai_calls) * FIELDS_AI_YEN_PER_BOOK;
  const fixedYen = Object.values(fixed || {}).reduce((s, v) => s + n0(v), 0);
  const grossYen = netYen - aiYen - fixedYen;
  const paidCount = monthly + annual + founding;
  const perPaidYen = paidCount > 0 ? (netYen - aiYen) / paidCount : 0;
  const r = (v) => Math.round(v);
  return {
    month: data?.month || '',
    paid: { monthly, annual, founding, trial, total: paidCount },
    packs: { count: packsCount, yen: r(packsYen) },
    revenueYen: r(revenueYen), subsYen: r(subsYen), exTaxYen: r(exTaxYen), storeFeeYen: r(storeFeeYen), netYen: r(netYen),
    aiYen: r(aiYen), fixedYen: r(fixedYen), grossYen: r(grossYen), perPaidYen: r(perPaidYen),
    // 手取りに対する粗利の割合（固定費を引く前・0〜1・売上 0 なら null）。%は運営の画面だけ（利用者には出さない）。
    marginBeforeFixed: netYen > 0 ? (netYen - aiYen) / netYen : null,
  };
}

export const yen = (v) => `¥${Math.round(Number(v) || 0).toLocaleString('ja-JP')}`;
// 「2026-11」→「11 月」。
export function monthLabel(m) {
  const mm = /^\d{4}-(\d{2})$/.exec(String(m || ''));
  return mm ? `${Number(mm[1])} 月` : '今月';
}

// ── 進化（2026-10-22 オーナー「めっちゃいいものにガンガン進化させて」）────────────────────────────

// 月ごとの推移（admin_profit_series の行 × 固定費）。各月の 売上・手取り・AI・粗利・有料の人数・解約。
export function estimateSeries(rows, fixed = DEFAULT_FIXED) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const p = estimateProfit(r, fixed);
    return { month: r?.month || '', ...p, churned: n0(r?.churned), unknown: !!r?.paid?.unknown };
  });
}

// 次の月々の更新の入金の見込み（admin_renewals の行）。年額は 2 年目から ¥12,800（創業メンバーも）。税込・ストアの請求額。
export function renewalsYen(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const monthly = n0(r?.monthly) * PRICE_MONTHLY_YEN;
    const annual = (n0(r?.annual) + n0(r?.founding)) * PRICE_ANNUAL_YEN;
    return { month: r?.month || '', monthlyYen: Math.round(monthly), annualYen: Math.round(annual), totalYen: Math.round(monthly + annual), annualCount: n0(r?.annual) + n0(r?.founding) };
  });
}

// 有料 N 人のときの推定の粗利（今の 1 人あたりの手残り × N − 固定費）。道しるべ（50/200/400/650/1,000）に使う。
// perPaidYen が無い（有料 0 人）ときは、月額と年額が半々・AI は 1 人 ¥79（docs/ai-routing.md の見込み）で置く。
export const DEFAULT_AI_YEN_PER_PAID = 79;
export function perPaidDefaultYen() {
  const rev = (PRICE_MONTHLY_YEN + PRICE_ANNUAL_YEN / 12) / 2;
  return Math.round((rev / (1 + TAX_RATE)) * (1 - STORE_FEE_RATE) - DEFAULT_AI_YEN_PER_PAID);
}
export function projectAt(n, p, fixed = DEFAULT_FIXED) {
  const per = p && p.paid?.total > 0 ? p.perPaidYen : perPaidDefaultYen();
  const fixedYen = Object.values(fixed || {}).reduce((s, v) => s + n0(v), 0);
  return Math.round(per * n0(n) - fixedYen);
}

// AI の用途ごとの原価（purpose_mjpy）→ 画面の名前でまとめて多い順（lib/tokenUsage.js の分け方と同じ）。
export const PURPOSE_GROUPS = [
  ['相談', ['consult']], ['AI 選書', ['book_advisor', 'advisor_interview']], ['読書計画シート', ['setup_sheet', 'setup_sheet_edit']],
  ['この本で学べること', ['book_brief']], ['写真から書き起こし', ['ocr']], ['凝縮', ['condense']], ['この本のまとめ', ['cards_to_summary']],
  ['そのほか', ['ops_advise', 'other']],
];
export function purposeBreakdown(purposeMjpy) {
  const src = purposeMjpy && typeof purposeMjpy === 'object' ? purposeMjpy : {};
  const rest = { ...src };
  const out = PURPOSE_GROUPS.map(([label, keys]) => {
    let m = 0;
    for (const k of keys) { m += n0(rest[k]); delete rest[k]; }
    return { label, yen: m / 1000 };
  });
  const other = out.find((x) => x.label === 'そのほか');
  for (const v of Object.values(rest)) other.yen += n0(v) / 1000;
  const total = out.reduce((s, x) => s + x.yen, 0);
  return out.filter((x) => x.yen > 0).map((x) => ({ ...x, yen: Math.round(x.yen), share: total > 0 ? x.yen / total : 0 })).sort((a, b) => b.yen - a.yen);
}

// 「2026-11」→「11月」（棒の下の短い名前）。
export const monthShort = (m) => { const mm = /^\d{4}-(\d{2})$/.exec(String(m || '')); return mm ? `${Number(mm[1])}月` : ''; };
