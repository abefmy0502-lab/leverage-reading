// 🪙📊 トークンの使い方（2026-10-11 オーナー「現在のトークン利用料の可視化をしたい。そこから追加課金の動線も作りたい」）。
//
// 設定の「プラン・お支払い」の残りの行と、相談の上の行の残りの数から開くシート（TokenUsageSheet.jsx）の中身を決める純粋関数。
//   - 今の枠（無料プラン 30／はじめの月 60・7 日間無料 150・プラン 800）のうち残り・次に戻る日
//   - 追加分（買い足し）の残りと期限（期限の近い順）
//   - 今月（7 日間無料はその期間）の使い道の内訳（ai_usage.purpose_mjpy＝supabase_ai_usage_purpose.sql）
//   - シートの下のボタン（追加課金の動線）: プランの人は「トークンを追加」、無料プランは「プランを見る」
//     （7 日間無料をすすめてよいのは ① 無料のトークンを使い切ったとき＝lib/trialNudge.js の決まり）
// %・順位・バッジは出さない（細い 1 本の棒だけ・使った／残り）。

import { supabase, isSupabaseConfigured } from './supabase';
import { tokensFromMjpy } from './tokens';

// 画面の名前（GLOSSARY）と、まとめる用途（api/_aiAccess.js の USAGE_PURPOSES）。並びは同じ量のときの順。
export const USAGE_GROUPS = [
  { key: 'consult', label: '相談', purposes: ['consult'] },
  { key: 'advisor', label: 'AI 選書', purposes: ['book_advisor', 'advisor_interview'] },
  { key: 'setup', label: '読書計画シート', purposes: ['setup_sheet', 'setup_sheet_edit'] },
  { key: 'brief', label: 'この本で学べること', purposes: ['book_brief'] },
  { key: 'ocr', label: '写真から書き起こし', purposes: ['ocr'] },
  { key: 'condense', label: '凝縮', purposes: ['condense'] },
  { key: 'summary', label: 'この本のまとめ', purposes: ['cards_to_summary'] },
  { key: 'other', label: 'そのほか', purposes: ['ops_advise', 'other'] },
];
// 内訳を数えはじめる前（supabase_ai_usage_purpose.sql を流す前）に使った分。
export const BEFORE_GROUP = { key: 'before', label: '内訳を数える前の分' };

const groupOf = (purpose) => USAGE_GROUPS.find((g) => g.purposes.includes(purpose)) || USAGE_GROUPS[USAGE_GROUPS.length - 1];

// 使い道の内訳: 用途ごとの原価（1/1000 円）を画面の名前にまとめ、使ったトークン（cost_mjpy から・切り上げ）を
//   その割合で分ける（最大剰余で丸める＝足すと使ったトークンと同じ）。0 トークンの行は出さない・多い順。
//   内訳が 1 つも記録されていなければ []（＝内訳の段を出さない）。
export function usageBreakdown(purposeMjpy, costMjpy) {
  if (!purposeMjpy || typeof purposeMjpy !== 'object') return [];
  const sums = new Map();
  let recorded = 0;
  for (const [purpose, raw] of Object.entries(purposeMjpy)) {
    const v = Math.max(0, Number(raw) || 0);
    if (!v) continue;
    const g = groupOf(purpose);
    sums.set(g.key, (sums.get(g.key) || 0) + v);
    recorded += v;
  }
  if (recorded <= 0) return [];
  const total = Math.max(recorded, Math.max(0, Number(costMjpy) || 0));
  if (total > recorded) sums.set(BEFORE_GROUP.key, total - recorded);
  const used = tokensFromMjpy(total);
  const parts = [...sums.entries()].map(([key, v]) => {
    const exact = (v / total) * used;
    return { key, mjpy: v, tokens: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = used - parts.reduce((n, p) => n + p.tokens, 0);
  [...parts].sort((a, b) => b.rest - a.rest || b.mjpy - a.mjpy).forEach((p) => {
    if (left > 0) { p.tokens += 1; left -= 1; }
  });
  const order = (key) => (key === BEFORE_GROUP.key ? 99 : USAGE_GROUPS.findIndex((g) => g.key === key));
  return parts
    .filter((p) => p.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || order(a.key) - order(b.key))
    .map(({ key, tokens }) => ({
      key,
      label: key === BEFORE_GROUP.key ? BEFORE_GROUP.label : USAGE_GROUPS.find((g) => g.key === key).label,
      tokens,
    }));
}

// 残りが少ない（その月の分＋追加分が、その月の枠の 20% 以下）。相談の上の行の残りの数を --warning にする。
//   残りが 0（使い切った）ときは別の案内が出るので false。分からないときも false。
export const LOW_TOKENS_RATIO = 0.2;
export function isLowTokens(remaining, allowance, purchased = 0) {
  if (remaining == null || allowance == null) return false;
  const r = Number(remaining);
  const a = Number(allowance);
  if (!Number.isFinite(r) || !Number.isFinite(a) || a <= 0) return false;
  const available = Math.max(0, r) + Math.max(0, Number(purchased) || 0);
  return available > 0 && available <= a * LOW_TOKENS_RATIO;
}

// 使った量の棒（0〜1・使った／その枠）。表示だけ（数字の % は出さない）。
export function usedRatio(remaining, allowance) {
  if (remaining == null || allowance == null) return null;
  const r = Number(remaining);
  const a = Number(allowance);
  if (!Number.isFinite(r) || !Number.isFinite(a) || a <= 0) return null;
  return Math.min(1, Math.max(0, (a - Math.max(0, r)) / a));
}

// シートの下のボタン（追加課金の動線）。
//   plan: 'paid' | 'trial' → 「トークンを追加」（App 内課金のシート）
//   plan: 'free' → 無料プランはトークンを買えない（2026-09-27 裁定）。
//     今月の無料のトークンを使い切った（① ＝すすめてよい）かつ 7 日間無料を使える（trialOffer＝「7 日間無料」・前にプランを
//     契約していない）なら「7 日間無料で試す」（有料プランの画面・reason 'free_used'）。
//     それ以外は「プランを見る」（使い切ったときは reason 'free_used'・まだ残っているときは null＝一般の見出し）。
//   'admin' や不明は null（出さない）。
export function usageSheetAction({ plan, remaining, trialOffer = '', hadPlan = false } = {}) {
  if (plan === 'paid' || plan === 'trial') return { kind: 'add', label: 'トークンを追加' };
  if (plan !== 'free') return null;
  const usedUp = Number.isFinite(Number(remaining)) && remaining != null && Number(remaining) <= 0;
  if (usedUp && trialOffer && !hadPlan) return { kind: 'trial', label: `${trialOffer}で試す`, reason: 'free_used' };
  return { kind: 'plans', label: 'プランを見る', reason: usedUp ? 'free_used' : null };
}

// 期間の使った量（1/1000 円）と用途ごとの原価・追加分から払った量（本人の行だけ読める）。
//   行が無ければ 0・内訳 {}。purpose_mjpy の列が無い DB（未適用）は cost_mjpy だけ読み、内訳は null（＝内訳の段を出さない）。
//   読めなければ null。
export async function fetchUsageDetail(userId, periodKey) {
  if (!isSupabaseConfigured || !userId || !periodKey) return null;
  const read = (cols) => supabase.from('ai_usage').select(cols).eq('user_id', userId).eq('period_month', periodKey).maybeSingle();
  try {
    let { data, error } = await read('cost_mjpy, purpose_mjpy');
    let hasPurpose = true;
    if (error) {
      hasPurpose = false;
      ({ data, error } = await read('cost_mjpy'));
      if (error) return null;
    }
    return {
      costMjpy: data ? Math.max(0, Number(data.cost_mjpy) || 0) : 0,
      purposeMjpy: hasPurpose ? (data?.purpose_mjpy && typeof data.purpose_mjpy === 'object' ? data.purpose_mjpy : {}) : null,
    };
  } catch {
    return null;
  }
}

// 追加分（期限内で残りのあるロット）を期限の近い順に。表が無い・読めないときは null。
export async function fetchTokenLots(userId, now = Date.now()) {
  if (!isSupabaseConfigured || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('ai_token_lots')
      .select('id, tokens_left, tokens_total, expires_at')
      .eq('user_id', userId)
      .gt('tokens_left', 0)
      .gt('expires_at', new Date(now).toISOString())
      .order('expires_at', { ascending: true });
    if (error) return null;
    return (Array.isArray(data) ? data : []).map((r) => ({
      id: r.id,
      left: Math.max(0, Math.floor(Number(r.tokens_left) || 0)),
      total: Math.max(0, Math.floor(Number(r.tokens_total) || 0)),
      expiresAt: r.expires_at,
    })).filter((r) => r.left > 0);
  } catch {
    return null;
  }
}
