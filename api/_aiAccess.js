// 🔐 AI を使ってよいか（フリーミアム・2026-09-27 オーナー裁定）。api/claude.js から使う純粋関数。
//
// プラン:
//   - 無料（契約なし）: AI は 💬 相談（purpose: 'consult'）だけ、1 か月に AI_FREE_CALL_LIMIT 回（既定 3）。
//     数えるのは ai_usage の period_month='free-YYYY-MM'（日本時間の月）の行。数えられないときは使わせない（fail-closed）。
//     モデルはいちばん安いもの・1 回の大きさも小さく（api/claude.js の FREE_*）。
//   - 無料期間（App Store の 7 日間無料・subscriptions.period_type 'trial'/'intro'）: すべての AI 機能。
//     原価の上限は AI_TRIAL_BUDGET_JPY（既定 ¥50）。
//   - 有料: すべての AI 機能。原価の上限は AI_MONTHLY_BUDGET_JPY（既定 ¥243）。
//   - 管理者: 上限なし。
// 相談以外（AI 選書・テーマまとめ・読書計画シート・写真から書き起こす・凝縮・まとめを作る など）は、
// 無料の人には 402 plan_required を返す（アプリは有料プランの画面を重ねて開く）。

// 無料で使える用途（purpose）。相談の本ごとの答え方も purpose は 'consult'。
export const FREE_PURPOSES = new Set(['consult']);

export function isFreePurpose(purpose) {
  return typeof purpose === 'string' && FREE_PURPOSES.has(purpose);
}

// 無料の相談を数える行のキー（'free-YYYY-MM'）。monthKey は 'YYYY-MM'（日本時間の月）。
export function freePeriodKey(monthKey) {
  return `free-${monthKey}`;
}

// 契約の状態と用途から、この 1 回を通すかを決める。
//   entitlement: { allowed, admin, trial }（checkEntitlement の結果）
//   purpose: body.purpose
//   freeLimit: 無料の相談の月の回数（0 なら無料の AI は無し）
//   freeUsed: （分かっていれば）今月使った無料の相談の回数。予約の前は undefined でよい
// 戻り値: { allow: true, tier: 'admin'|'paid'|'trial'|'free' }
//        | { allow: false, status: 402, errorCode: 'plan_required'|'free_limit_reached' }
export function decideAiAccess({ entitlement = {}, purpose, freeLimit = 3, freeUsed } = {}) {
  if (entitlement.admin) return { allow: true, tier: 'admin' };
  if (entitlement.allowed) return { allow: true, tier: entitlement.trial ? 'trial' : 'paid' };
  if (!isFreePurpose(purpose) || !(freeLimit > 0)) {
    return { allow: false, status: 402, errorCode: 'plan_required' };
  }
  if (Number.isFinite(freeUsed) && freeUsed >= freeLimit) {
    return { allow: false, status: 402, errorCode: 'free_limit_reached' };
  }
  return { allow: true, tier: 'free' };
}

// 無料の相談の予約（reserve_ai_usage）の結果から、通すかを決める（fail-closed）。
//   usage: { allowed, reserved }（reserveMonthlyUsage の結果）
//   reserved=false … 数えられなかった（RPC 未適用・障害）→ 通さない
export function decideFreeReservation(usage = {}) {
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

// 402 の案内文（アプリは有料プランの画面を開き、この文は吹き出しの案内に使う）。
export function planRequiredMessage() {
  return 'この AI 機能は、プランでご利用いただけます。';
}
export function freeLimitMessage(freeLimit = 3, now = Date.now()) {
  return `今月の無料相談は、ここまでです。${nextMonthFirstLabel(now, true)}にまた ${freeLimit} 回使えます。`;
}

// 無料期間中に原価（または回数）の上限に達したときの案内。期間の終わりが分かれば日付を添える。
export function trialLimitMessage(periodEnd) {
  const label = jstMonthDayLabel(periodEnd, true);
  return label
    ? `無料期間中に使える AI の分は、ここまでです。無料期間が終わる${label}から、すべて使えます。`
    : '無料期間中に使える AI の分は、ここまでです。無料期間が終わると、すべて使えます。';
}
