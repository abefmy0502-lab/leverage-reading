// 🪙📊 トークンの使い方（2026-10-11 オーナー「現在のトークン利用料の可視化をしたい。そこから追加課金の動線も作りたい」）。
//
// 設定の「プラン・お支払い」の残りの行と、相談の上の行の残りの数から開くシート（TokenUsageSheet.jsx）の中身を決める純粋関数。
//   - 今の枠（無料プラン 30／はじめの月 60・7 日間無料 150・プラン 800）のうち残り・次に戻る日
//   - 追加分（買い足し）の残りと買った日（買った順・期限なし）
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

// 残りの棒（0〜1・残り／その枠）。見出しの「残り」と合わせて、残りで埋める（使い切ったら空・2026-10-11 ui-critic）。
//   表示だけ（数字の % は出さない）。
export function remainingRatio(remaining, allowance) {
  if (remaining == null || allowance == null) return null;
  const r = Number(remaining);
  const a = Number(allowance);
  if (!Number.isFinite(r) || !Number.isFinite(a) || a <= 0) return null;
  return Math.min(1, Math.max(0, r / a));
}

// シートの下のボタン（追加課金の動線）。
//   plan: 'paid' | 'trial' → 「トークンを追加」（App 内課金のシート）
//   plan: 'free' → 無料プランはトークンを買えない（2026-09-27 裁定）。
//     今月の無料のトークンを使い切った（① ＝すすめてよい）かつ 7 日間無料を使える（trialOffer＝「7 日間無料」・前にプランを
//     契約していない）なら「7 日間無料で試す」（有料プランの画面・reason 'free_used'）。
//     それ以外は「プランを見る」（使い切ったときは reason 'free_used'・まだ残っているときは null＝一般の見出し）。
//   'admin' や不明は null（出さない）。
// strong（主ボタンの塗り）: 残りが少ない（low＝その月の分＋追加分が枠の 20% 以下）・使い切った（その月の分も追加分も 0）・
//   「7 日間無料で試す」のときだけ。余裕があるときは枠線（お金を払っている人ほど強く買わせない・2026-10-11 ui-critic）。
//   無料プランの「プランを見る」は使い切るまで枠線（少ないだけでは塗らない）。
export function usageSheetAction({ plan, remaining, purchased = 0, trialOffer = '', hadPlan = false, low = false } = {}) {
  const known = remaining != null && Number.isFinite(Number(remaining));
  const usedUp = known && Number(remaining) <= 0;
  const outAll = usedUp && !(Number(purchased) > 0);
  const strong = !!low || outAll;
  if (plan === 'paid' || plan === 'trial') return { kind: 'add', label: 'トークンを追加', strong };
  if (plan !== 'free') return null;
  if (usedUp && trialOffer && !hadPlan) return { kind: 'trial', label: `${trialOffer}で試す`, reason: 'free_used', strong: true };
  return { kind: 'plans', label: 'プランを見る', reason: usedUp ? 'free_used' : null, strong: usedUp };
}

// 列が無いエラー（Postgres 42703・PostgREST の schema cache）か。
export function isMissingPurposeColumn(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  return error.code === '42703' || error.code === 'PGRST204' || /purpose_mjpy/.test(msg);
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
      // 列が無い DB（supabase_ai_usage_purpose.sql 未適用）だけ cost_mjpy で読み直す。ほかの失敗は null（＝読めなかった）。
      if (!isMissingPurposeColumn(error)) return null;
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

// 追加分（残りのあるロット）を買った順に（期限なし・2026-10-11）。表が無い・読めないときは null。
export async function fetchTokenLots(userId) {
  if (!isSupabaseConfigured || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('ai_token_lots')
      .select('id, tokens_left, tokens_total, purchased_at')
      .eq('user_id', userId)
      .gt('tokens_left', 0)
      .order('purchased_at', { ascending: true });
    if (error) return null;
    return (Array.isArray(data) ? data : []).map((r) => ({
      id: r.id,
      left: Math.max(0, Math.floor(Number(r.tokens_left) || 0)),
      total: Math.max(0, Math.floor(Number(r.tokens_total) || 0)),
      purchasedAt: r.purchased_at || null,
    })).filter((r) => r.left > 0);
  } catch {
    return null;
  }
}

// 🌿 この期間に相談から得たもの（2026-10-20 オーナー「課金している人の満足度」）: 送った相談の数と、完了した行動の数。
//   数だけ（%・順位・連続日数は出さない）。since は期間のはじめ（ISO）。読めなければ null・両方 0 なら { consults: 0, done: 0 }。
export async function fetchPeriodValue(userId, since) {
  if (!isSupabaseConfigured || !userId || !since) return null;
  try {
    const [c, a] = await Promise.all([
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user').gte('created_at', since),
      supabase.from('actions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('done', true).gte('completed_at', since),
    ]);
    if (c.error) return null;
    return { consults: c.count || 0, done: a.error ? null : (a.count || 0) };
  } catch {
    return null;
  }
}

// 期間のはじめ（日本時間の今月 1 日 0 時・7 日間無料は終わる日の 7 日前）。
export function periodValueSince({ trial = false, trialEndsAt = null, now = Date.now() } = {}) {
  if (trial && trialEndsAt && Number.isFinite(Date.parse(trialEndsAt))) {
    return new Date(Date.parse(trialEndsAt) - 7 * 86400000).toISOString();
  }
  const jst = new Date(now + 9 * 3600 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 3600 * 1000).toISOString();
}
