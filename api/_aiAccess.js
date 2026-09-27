// 🔐 AI を使ってよいか・どれだけ使えるか（フリーミアム＋トークン・2026-09-27 オーナー裁定）。
// api/claude.js から使う純粋関数（env は引数で受け取り、テストできるようにする）。
//
// 見せ方は「トークン」: 1 トークン ≈ AI の原価 ¥0.3（AI_TOKEN_JPY）。サーバーは今までどおり円
// （1/1000 円＝mjpy）で数え（reserve_ai_cost / adjust_ai_cost・api/_aiCost.js）、使った量を
// トークン＝ceil(原価の円 ÷ AI_TOKEN_JPY) に直して見せる。
//
// プランと 1 か月に使えるトークン（env で変えられる）:
//   - 無料（契約なし）: AI は 💬 相談（purpose: 'consult'）だけ・AI_FREE_TOKENS（既定 30＝相談 約 3 回）。
//     行のキーは 'free-YYYY-MM'（日本時間の月）。数えられないときは使わせない（fail-closed）。
//     相談以外の AI 機能は 402 plan_required（アプリは有料プランの画面を重ねて開く）。
//   - 無料期間（App Store の 7 日間無料・period_type 'trial'/'intro'）: すべての AI 機能・
//     無料期間まるごとで AI_TRIAL_TOKENS（既定 150）。行のキーは 'trial-YYYY-MM-DD'（無料期間が
//     終わる日・日本時間）＝月をまたいでも増えない。終わる日が分からないときは 'trial-YYYY-MM'。
//   - 有料: すべての AI 機能・AI_PAID_TOKENS（既定 800 ≈ ¥240。手取り ¥900 を残せる上限 ¥243 の内側）。
//     行のキーは 'YYYY-MM'。
//   - 管理者: 数えない。
//   AI_MONTHLY_BUDGET_JPY / AI_TRIAL_BUDGET_JPY（円）を入れたときは、そちらが優先（円 ÷ AI_TOKEN_JPY）。
//
// 「最後の 1 回」: 使った量が上限未満なら、この 1 回の見積もりで上限を超えても始めてよい
// （「相談 3 回」と言っておいて 2 回で止めない）。超えるのは最大 1 回分。

const num = (v, d) => {
  if (v === undefined || v === null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// 無料で使える用途（purpose）。相談の本ごとの答え方も purpose は 'consult'。
export const FREE_PURPOSES = new Set(['consult']);
export function isFreePurpose(purpose) {
  return typeof purpose === 'string' && FREE_PURPOSES.has(purpose);
}

// 1 トークンの円（既定 ¥0.3）。0 以下は既定に戻す。
export function tokenJpy(env = process.env) {
  const v = num(env.AI_TOKEN_JPY, 0.3);
  return v > 0 ? v : 0.3;
}
// 1 トークン＝何 mjpy（1/1000 円）か。
export function tokenMjpy(env = process.env) {
  return Math.round(tokenJpy(env) * 1000);
}

// 使った原価（mjpy）→ トークン（切り上げ）。
export function tokensFromMjpy(mjpy, env = process.env) {
  const m = Math.max(0, num(mjpy, 0));
  if (m === 0) return 0;
  return Math.ceil(m / tokenMjpy(env) - 1e-9);
}

// プランごとの 1 か月（無料期間はまるごと）のトークン。
export function freeTokens(env = process.env) {
  return Math.max(0, Math.floor(num(env.AI_FREE_TOKENS, 30)));
}
export function trialTokens(env = process.env) {
  const yen = num(env.AI_TRIAL_BUDGET_JPY, NaN);
  if (Number.isFinite(yen) && yen >= 0) return Math.floor(yen / tokenJpy(env));
  return Math.max(0, Math.floor(num(env.AI_TRIAL_TOKENS, 150)));
}
export function paidTokens(env = process.env) {
  const yen = num(env.AI_MONTHLY_BUDGET_JPY, NaN);
  if (Number.isFinite(yen) && yen >= 0) return Math.floor(yen / tokenJpy(env));
  return Math.max(0, Math.floor(num(env.AI_PAID_TOKENS, 800)));
}
export function allowanceFor(tier, env = process.env) {
  if (tier === 'free') return freeTokens(env);
  if (tier === 'trial') return trialTokens(env);
  if (tier === 'paid') return paidTokens(env);
  return Infinity; // admin
}
// 原価の見積もりが出せない DB（supabase_ai_cost.sql 未適用）での回数の目安＝トークン ÷ 10（相談 1 回 約 10）。
export function fallbackCallsFor(tier, env = process.env) {
  return Math.max(0, Math.floor(allowanceFor(tier, env) / 10));
}

// 日本時間の 'YYYY-MM' / 'YYYY-MM-DD'。
function jstParts(t) {
  const iso = new Date(t + 9 * 3600 * 1000).toISOString();
  return { month: iso.slice(0, 7), day: iso.slice(0, 10) };
}
export function jstMonthKey(now = Date.now()) {
  return jstParts(now).month;
}

// どの行で数えるか。monthKey は 'YYYY-MM'（日本時間の月・この 1 回の間は固定）。
export function periodKeyFor(tier, { monthKey, periodEnd } = {}) {
  if (tier === 'free') return `free-${monthKey}`;
  if (tier === 'trial') {
    const t = Date.parse(periodEnd || '');
    return Number.isFinite(t) ? `trial-${jstParts(t).day}` : `trial-${monthKey}`;
  }
  return monthKey;
}

// reserve_ai_cost に渡す上限（mjpy）。RPC は「使った量 + この 1 回 ≤ 上限」のときだけ予約するので、
// 上限を「(トークン − 1) 分 + この 1 回」にすると「使ったトークン（切り上げ）< 上限のトークン」の
// あいだは始められる（最後の 1 回ルール・表示の「残り N トークン」と同じ境目）。
export function reserveBudgetMjpy(allowanceTokens, estimateMjpy, env = process.env) {
  if (!(allowanceTokens > 0)) return -1; // 0 トークン＝使えない（RPC は負の上限を常に拒否する）
  return Math.max(0, (allowanceTokens - 1) * tokenMjpy(env)) + Math.max(0, Math.ceil(num(estimateMjpy, 0)));
}

// 残りのトークン（表示用・始められるか）。
export function remainingTokens(allowanceTokens, usedMjpy, env = process.env) {
  return Math.max(0, allowanceTokens - tokensFromMjpy(usedMjpy, env));
}

// 契約の状態と用途から、この 1 回を通すかを決める。
//   entitlement: { allowed, admin, trial }（checkEntitlement の結果）
//   purpose: body.purpose
//   freeAllowance: 無料のトークン（0 なら無料の AI は無し）
//   freeUsedMjpy: （分かっていれば）今月使った無料の原価。予約の前は undefined でよい
// 戻り値: { allow: true, tier: 'admin'|'paid'|'trial'|'free' }
//        | { allow: false, status: 402, errorCode: 'plan_required'|'free_limit_reached' }
export function decideAiAccess({ entitlement = {}, purpose, freeAllowance = 30, freeUsedMjpy, env = process.env } = {}) {
  if (entitlement.admin) return { allow: true, tier: 'admin' };
  if (entitlement.allowed) return { allow: true, tier: entitlement.trial ? 'trial' : 'paid' };
  if (!isFreePurpose(purpose) || !(freeAllowance > 0)) {
    return { allow: false, status: 402, errorCode: 'plan_required' };
  }
  if (freeUsedMjpy !== undefined && remainingTokens(freeAllowance, freeUsedMjpy, env) <= 0) {
    return { allow: false, status: 402, errorCode: 'free_limit_reached' };
  }
  return { allow: true, tier: 'free' };
}

// 無料の相談の予約の結果から、通すかを決める（fail-closed）。
//   cost:  reserveCost の結果 { metered, allowed }
//   usage: reserveMonthlyUsage の結果 { reserved, allowed }（cost が数えられないときの代わり）
export function decideFreeReservation({ cost = {}, usage = {} } = {}) {
  if (cost.metered) {
    return cost.allowed ? { allow: true } : { allow: false, status: 402, errorCode: 'free_limit_reached' };
  }
  if (!usage.reserved) return { allow: false, status: 402, errorCode: 'plan_required' };
  if (!usage.allowed) return { allow: false, status: 402, errorCode: 'free_limit_reached' };
  return { allow: true };
}

// 日本時間の「M月D日」。noBreak=true で見えない結合文字（U+2060）を挟み、途中で改行させない。
export function jstMonthDayLabel(time, noBreak = false) {
  const t = typeof time === 'number' ? time : Date.parse(time || '');
  if (!Number.isFinite(t)) return '';
  const jst = new Date(t + 9 * 3600 * 1000);
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return noBreak ? `${m}⁠月⁠${d}⁠日` : `${m}月${d}日`;
}

// 「来月 1 日」（日本時間）。
export function nextMonthFirstLabel(now = Date.now(), noBreak = false) {
  const jst = new Date(now + 9 * 3600 * 1000);
  const m = jst.getUTCMonth() + 2;
  const month = m > 12 ? 1 : m;
  return noBreak ? `${month}⁠月⁠1⁠日` : `${month}月1日`;
}

// 案内文（アプリは 402 で有料プランの画面を開き、文は吹き出しの案内に使う）。
export function planRequiredMessage() {
  return 'この AI 機能は、プランでご利用いただけます。';
}
// 月のトークンを使い切った（無料・有料）。
export function monthlyTokensMessage(allowanceTokens, now = Date.now()) {
  return `今月のトークンは、ここまでです。${nextMonthFirstLabel(now, true)}に ${allowanceTokens} トークンに戻ります。`;
}
// 無料期間のトークンを使い切った。期間の終わりが分かれば日付を添える。
export function trialTokensMessage(periodEnd, paidAllowance = 800) {
  const label = jstMonthDayLabel(periodEnd, true);
  return label
    ? `無料期間のトークンは、ここまでです。無料期間が終わる${label}から、毎月 ${paidAllowance} トークン使えます。`
    : `無料期間のトークンは、ここまでです。無料期間が終わると、毎月 ${paidAllowance} トークン使えます。`;
}
export function limitMessageFor(tier, { periodEnd, env = process.env, now = Date.now() } = {}) {
  if (tier === 'trial') return trialTokensMessage(periodEnd, paidTokens(env));
  return monthlyTokensMessage(allowanceFor(tier, env), now);
}
