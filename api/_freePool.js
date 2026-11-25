// 🧯 無料プランの AI の全体の予算（2026-11-25 オーナー「無料会員の割合がめっちゃ増えたら無料 AI 枠で赤字になる可能性もあるので、
//   いい形で調整したい」・supabase_ai_free_pool.sql）。
//
// 1 人ずつの上限（毎月 30 トークンなど）に加えて、無料プランの全員の AI の原価を月ごとに 1 か所で数える。
// 予算は有料会員の数に合わせて伸びる＝会員がいくら増えても、無料の AI の原価が有料の手取りを食いつぶさない:
//   予算（円）＝ 基本 AI_FREE_POOL_BASE_JPY（既定 ¥10,000）＋ 有料会員 × AI_FREE_POOL_PER_PAID_JPY（既定 ¥300）
//   有料 1 人の手取りは 約 ¥1,144（AI_PLAN_PRICE_JPY ¥1,480 ÷1.1 ×0.85）で、有料の本人の AI の上限は ¥240。
//   無料の分に ¥300 を回しても、1 人あたり 約 ¥600 が残る（固定費の前）。基本の ¥10,000 は公開したばかりの頃の「広告費」。
//   上限 AI_FREE_POOL_MAX_JPY（既定 ¥300,000）で頭を打つ。AI_FREE_POOL=off で数えない（1 人ずつの上限だけ）。
// 尽きたら、その月の残りは無料の AI を止める（402 free_limit_reached・free_pool: true）。相談はアプリが AI を使わずに
//   自分のメモから答える（MemoAnswer）。翌月 1 日に戻る。
// 予算の 70%・90% を超えたときは、ログに 1 行（運営ダッシュボードにも出る）。

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function freePoolOn(env = process.env) {
  return String(env.AI_FREE_POOL || '').toLowerCase() !== 'off';
}

/** その月の無料の AI の予算（mjpy＝1/1000 円）。paidCount が分からなければ基本だけ。 */
export function freePoolBudgetMjpy({ paidCount = null, env = process.env } = {}) {
  const base = num(env.AI_FREE_POOL_BASE_JPY, 10000);
  const per = num(env.AI_FREE_POOL_PER_PAID_JPY, 300);
  const max = num(env.AI_FREE_POOL_MAX_JPY, 300000);
  const paid = Number.isFinite(Number(paidCount)) && Number(paidCount) > 0 ? Math.floor(Number(paidCount)) : 0;
  return Math.round(Math.min(max, base + per * paid) * 1000);
}

/** 使った割合の段（ログと運営ダッシュボード用）。'ok' | 'warn'（70% 以上）| 'high'（90% 以上）| 'out'（尽きた）。 */
export function freePoolLevel(usedMjpy, budgetMjpy) {
  const b = Number(budgetMjpy) || 0;
  if (b <= 0) return 'out';
  const r = (Number(usedMjpy) || 0) / b;
  if (r >= 1) return 'out';
  if (r >= 0.9) return 'high';
  if (r >= 0.7) return 'warn';
  return 'ok';
}

// 有料会員の数（10 分覚える・同じインスタンスの中だけ）。読めなければ null（＝基本の予算だけ）。
let paidCache = { at: 0, value: null };
const PAID_TTL_MS = 10 * 60 * 1000;
export async function paidMemberCount(supabase, now = Date.now()) {
  if (paidCache.value != null && now - paidCache.at < PAID_TTL_MS) return paidCache.value;
  if (!supabase) return null;
  try {
    // 有料＝status 'active' で、無料期間（period_type 'trial'）ではない人。列が無い DB は status だけで数える。
    let res = await supabase.from('subscriptions').select('user_id', { count: 'exact', head: true }).eq('status', 'active').or('period_type.is.null,period_type.neq.trial');
    if (res.error) res = await supabase.from('subscriptions').select('user_id', { count: 'exact', head: true }).eq('status', 'active');
    if (res.error) return paidCache.value;
    const v = Number(res.count) || 0;
    paidCache = { at: now, value: v };
    return v;
  } catch {
    return paidCache.value;
  }
}
export function _resetPaidCacheForTest() { paidCache = { at: 0, value: null }; }

/**
 * 予約する。戻り値 { metered, allowed, total }:
 *   metered=false … 表・RPC が無い・障害（1 人ずつの上限だけで守る・止めない）
 *   allowed=false … 予算を超える（呼ばない）
 */
export async function reserveFreePool(supabase, { periodMonth, amountMjpy, budgetMjpy }) {
  if (!supabase) return { metered: false, allowed: true, total: null };
  try {
    const { data, error } = await supabase.rpc('reserve_ai_free_pool', {
      p_period_month: periodMonth, p_amount: Math.max(0, Math.round(amountMjpy)), p_budget: Math.floor(budgetMjpy),
    });
    if (error) {
      console.warn('[ai-free-pool] reserve failed (per-user limits only):', error.message);
      return { metered: false, allowed: true, total: null };
    }
    const v = typeof data === 'number' ? data : Number(Array.isArray(data) ? data[0] : data);
    if (!Number.isFinite(v)) return { metered: false, allowed: true, total: null };
    return { metered: true, allowed: v !== -1, total: v !== -1 ? v : null };
  } catch (e) {
    console.warn('[ai-free-pool] reserve threw (per-user limits only):', e?.message);
    return { metered: false, allowed: true, total: null };
  }
}

export async function adjustFreePool(supabase, { periodMonth, deltaMjpy }) {
  const d = Math.round(Number(deltaMjpy) || 0);
  if (!supabase || !d) return;
  try {
    const { error } = await supabase.rpc('adjust_ai_free_pool', { p_period_month: periodMonth, p_delta: d });
    if (error) console.warn('[ai-free-pool] adjust failed:', error.message);
  } catch (e) {
    console.warn('[ai-free-pool] adjust threw:', e?.message);
  }
}

/** 運営ダッシュボード用: その月の使った額と予算（円）。表が無ければ null。 */
export async function readFreePool(supabase, { periodMonth, env = process.env } = {}) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('ai_free_pool').select('cost_mjpy, calls').eq('period_month', periodMonth).maybeSingle();
    if (error) return null;
    const paid = await paidMemberCount(supabase);
    const budget = freePoolBudgetMjpy({ paidCount: paid, env });
    const used = Number(data?.cost_mjpy) || 0;
    return { period_month: periodMonth, used_jpy: Math.round(used / 1000), budget_jpy: Math.round(budget / 1000), calls: Number(data?.calls) || 0, paid_members: paid, level: freePoolLevel(used, budget), on: freePoolOn(env) };
  } catch {
    return null;
  }
}
