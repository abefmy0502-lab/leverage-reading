// 🔐 AI を使ってよいか・どれだけ使えるか（フリーミアム＋トークン・2026-09-27 オーナー裁定）。
// api/claude.js から使う純粋関数（env は引数で受け取り、テストできるようにする）。
//
// 見せ方は「トークン」: 1 トークン ≈ AI の原価 ¥0.3（AI_TOKEN_JPY）。サーバーは今までどおり円
// （1/1000 円＝mjpy）で数え（reserve_ai_cost / adjust_ai_cost・api/_aiCost.js）、使った量を
// トークン＝ceil(原価の円 ÷ AI_TOKEN_JPY) に直して見せる。
//
// プランと 1 か月に使えるトークン（env で変えられる）:
//   - 無料（契約なし）: AI は 💬 相談（purpose: 'consult'）と 📖 この本で学べること（'book_brief'）だけ・AI_FREE_TOKENS（既定 30＝AI の答え 約 3 回）。
//     🌱 はじめの月（アカウントを作った日本時間の月・2026-10-09）だけは AI_FREE_FIRST_MONTH_TOKENS（既定 60＝AI の答え 約 6 回）。
//     相談 1 つは聞き返しを含めて 2〜3 回の答え（1 回 約 10 トークン）。はじめての相談を最後までしても、2 つ目の相談ができる量。
//     行のキーは 'free-YYYY-MM'（日本時間の月・はじめの月も同じ行）。数えられないときは使わせない（fail-closed）。
//     📷 写真から書き起こし（purpose: 'ocr'）だけは別枠で 1 か月 AI_FREE_OCR_PER_MONTH 回（既定 10・行は
//     'freeocr-YYYY-MM'・2026-10-02）。相談のトークンは使わない。下の「写真から書き起こし」の節。
//     ほかの AI 機能は 402 plan_required（アプリは有料プランの画面を重ねて開く）。
//   - 無料期間（App Store の 7 日間無料・period_type 'trial'。'intro'＝有料の初回価格は有料・2026-10-02）: すべての AI 機能・
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
// 📖 この本で学べること（'book_brief'・2026-10-08）も、相談と同じ無料のトークンから（1 回 約 1〜2 トークン・Flash-Lite）。
export const FREE_PURPOSES = new Set(['consult', 'book_brief']);
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
// 🌱 無料プランのはじめの月のトークン（2026-10-09 オーナー裁定「中期的な売り上げ最大化で考えて」）。
// はじめての相談（2〜3 回の答え）を最後までして、2 つ目の相談の途中で 7 日間無料に出会う量。
export function freeFirstMonthTokens(env = process.env) {
  return Math.max(0, Math.floor(num(env.AI_FREE_FIRST_MONTH_TOKENS, 60)));
}
// はじめの月＝アカウントを作った日本時間の月（作ってから翌月 1 日 0 時まで）。
// createdAt は auth.users.created_at（サーバーが auth.getUser で確かめたもの・アプリの申告は使わない）。
// 読めないときは false（はじめの月として扱わない＝fail-closed）。
export function isFreeFirstMonth(createdAt, monthKey) {
  const t = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt || '');
  if (!Number.isFinite(t) || typeof monthKey !== 'string' || !monthKey) return false;
  return jstParts(t).month === monthKey;
}
// この人のこの月の無料のトークン。AI_FREE_TOKENS=0（無料の AI をやめる）のときは、はじめの月も 0。
// はじめの月の量が毎月の量より少なく設定されたときは、毎月の量（減らさない）。
export function freeTokensFor({ createdAt, monthKey, env = process.env } = {}) {
  const base = freeTokens(env);
  if (!(base > 0)) return 0;
  return isFreeFirstMonth(createdAt, monthKey) ? Math.max(base, freeFirstMonthTokens(env)) : base;
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
// opts: { createdAt, monthKey }（無料のはじめの月を見るとき。無ければ毎月の量）。
export function allowanceFor(tier, env = process.env, opts = null) {
  if (tier === 'free') return opts ? freeTokensFor({ ...opts, env }) : freeTokens(env);
  if (tier === 'trial') return trialTokens(env);
  if (tier === 'paid') return paidTokens(env);
  return Infinity; // admin
}
// 原価の見積もりが出せない DB（supabase_ai_cost.sql 未適用）での回数の目安＝トークン ÷ 10（相談 1 回 約 10）。
// 無料のはじめの月は 60 ÷ 10 ＝ 6 回（opts は allowanceFor と同じ）。
export function fallbackCallsFor(tier, env = process.env, opts = null) {
  return Math.max(0, Math.floor(allowanceFor(tier, env, opts) / 10));
}

// 原価（トークン）で守れているときの回数の上限（reserve_ai_usage に渡す・暴走止めだけ）。
// 使えるトークン（その月の分＋追加分）より先に回数が尽きないよう、1 回 ≥ 1 トークンとみなして
// 「トークンの数」まで広げる（凝縮など 1 トークン前後の軽い機能を多く使う人・追加トークンを買った人を
// 「今月のトークンは、ここまで」と誤って止めない）。分間のレート制限は別にある。
export function meteredCallLimit(baseLimit, allowanceTokens) {
  const base = Number.isFinite(baseLimit) && baseLimit > 0 ? Math.floor(baseLimit) : 120;
  const tokens = Number.isFinite(allowanceTokens) && allowanceTokens > 0 ? Math.ceil(allowanceTokens) : 0;
  return Math.max(base, tokens);
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

// ───────────────────────────────────────────────────────────────────
// 📷 写真から書き起こし（purpose: 'ocr'）は、無料プランでも 1 か月に AI_FREE_OCR_PER_MONTH 回
// （既定 10・0 でやめる・日本時間の月）（2026-10-02 オーナー裁定「写真から書き起こしを無料プランで月 10 回」）。
// メモを早くためてもらい、相談が役に立つところまで育てるため。1 回 約 ¥0.15（Gemini Flash-Lite）。
//   - 数えるのは ai_usage の period_month='freeocr-YYYY-MM' 行の calls（reserve_ai_usage を流用・新しい SQL 不要）
//   - 無料の相談のトークン（'free-YYYY-MM'）は使わない（別の行・原価の予約もしない）
//   - 数えられない（RPC が無い・障害）ときは使わせない（fail-closed・無料の相談と同じ）
//   - 使い切ったら 402 free_ocr_limit_reached（アプリは有料プランの画面を重ねて開く）
//   - 有料・7 日間無料はいつもどおりトークンで、管理者は数えない
// ───────────────────────────────────────────────────────────────────
export const FREE_OCR_PURPOSE = 'ocr';
export function freeOcrPerMonth(env = process.env) {
  return Math.max(0, Math.floor(num(env.AI_FREE_OCR_PER_MONTH, 10)));
}
export function freeOcrPeriodKey(monthKey) {
  return `freeocr-${monthKey}`;
}
// 使い切ったときの案内（有料プランの画面の吹き出しにも使う）。
export function freeOcrLimitMessage(limit, now = Date.now()) {
  return `今月の写真から書き起こしは、ここまでです。${nextMonthFirstLabel(now, true)}に ${limit} 回に戻ります。`;
}
// 無料の書き起こしの予約（reserve_ai_usage）の結果から、通すかを決める（fail-closed）。
//   usage: reserveMonthlyUsage の結果 { reserved, allowed }
export function decideFreeOcrReservation({ usage = {} } = {}) {
  if (!usage.reserved) return { allow: false, status: 402, errorCode: 'plan_required' };
  if (!usage.allowed) return { allow: false, status: 402, errorCode: 'free_ocr_limit_reached' };
  return { allow: true };
}

// 契約の状態と用途から、この 1 回を通すかを決める。
//   entitlement: { allowed, admin, trial }（checkEntitlement の結果）
//   purpose: body.purpose
//   freeAllowance: 無料のトークン（0 なら無料の AI は無し）
//   freeUsedMjpy: （分かっていれば）今月使った無料の原価。予約の前は undefined でよい
//   freeOcrLimit: 無料の写真から書き起こしの 1 か月の回数（0 ならプランだけ）
//   freeOcrUsed: （分かっていれば）今月の無料の書き起こしの回数。予約の前は undefined でよい
// 戻り値: { allow: true, tier: 'admin'|'paid'|'trial'|'free'|'free_ocr' }
//        | { allow: false, status: 402, errorCode: 'plan_required'|'free_limit_reached'|'free_ocr_limit_reached' }
export function decideAiAccess({
  entitlement = {}, purpose, freeAllowance = 30, freeUsedMjpy, freeOcrLimit, freeOcrUsed, env = process.env,
} = {}) {
  if (entitlement.admin) return { allow: true, tier: 'admin' };
  if (entitlement.allowed) return { allow: true, tier: entitlement.trial ? 'trial' : 'paid' };
  if (purpose === FREE_OCR_PURPOSE) {
    const limit = freeOcrLimit === undefined ? freeOcrPerMonth(env) : Math.max(0, Math.floor(num(freeOcrLimit, 0)));
    if (!(limit > 0)) return { allow: false, status: 402, errorCode: 'plan_required' };
    if (freeOcrUsed !== undefined && Math.max(0, num(freeOcrUsed, 0)) >= limit) {
      return { allow: false, status: 402, errorCode: 'free_ocr_limit_reached' };
    }
    return { allow: true, tier: 'free_ocr' };
  }
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
// 月のトークンを使い切った（無料・有料）。allowanceTokens は来月の量（無料のはじめの月の人も、来月は毎月の量）。
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
  // 来月は、はじめの月の人も毎月の量（allowanceFor の opts を渡さない）。
  return monthlyTokensMessage(allowanceFor(tier, env), now);
}

// ───────────────────────────────────────────────────────────────────
// 🙏 関係するメモが無かった相談は、トークンを返す（2026-09-29 オーナー裁定）。
//
// 相談の指示文（src/lib/ai.js の BRAIN_SYSTEM）は、関係するメモが無いとき
// 「あなたの読書記録には、このトピックに関する情報がまだありません」と答え、読むとよい本へ橋渡しする。
// この答えは「あなたのメモから答える」という約束を果たしていないので、使ったトークンを返す
// （無料・7 日間無料・有料のどれも。管理者はもともと数えない）。
//
// 悪用されないための決まり（どれか 1 つでも外れたら返さない）:
//   - purpose が 'consult'（相談・本ごとの答え方も）で、答えが最後まで届いた（stop_reason='end_turn'）
//   - 決まり文句が【結論】の中（【結論】が無ければ答えの先頭 200 字）にある
//   - 答え（REFS を除く）が 900 字以下で、かつ「400 字未満」か「メモを根拠に挙げていない」
//     （REFS に項目が無い・『書名』より／根拠：／◆『書名』の行が無い）
//   - この 1 回の原価が AI_NO_INFO_REFUND_MAX_TOKENS（既定 30 トークン≈¥9・ふつうの相談は約 10）以下
//     （改ざんしたアプリが自前の指示文と大きな材料で「決まり文句つきの答え」を作らせても、返す額に上限がある）
//   - 返すのは 1 人・1 か月（日本時間）に AI_NO_INFO_REFUND_LIMIT 回まで（既定 10・0 でやめる）。
//     数えるのは ai_usage の period_month='refund-YYYY-MM' 行（reserve_ai_usage を流用・新しい SQL 不要）。
//     数えられない（RPC が無い・障害）ときは返さない（fail-closed＝払い戻しの青天井を作らない）。
// ───────────────────────────────────────────────────────────────────

// 決まり文句（まとめて: 「情報がまだありません」／本ごとに・共通ルール: 「該当するメモがない」）。
export const NO_INFO_RE = /情報[がは]\s*まだ\s*(?:ありません|ない)|該当するメモ[がは]\s*(?:ありません|ない|見つかりません)/;
export const NO_INFO_HEAD_CHARS = 200;
export const NO_INFO_SHORT_CHARS = 400;
export const NO_INFO_MAX_CHARS = 900;

// REFS_START…REFS_END を除いた本文。
export function consultAnswerBody(text) {
  if (typeof text !== 'string') return '';
  const i = text.indexOf('REFS_START');
  return (i >= 0 ? text.slice(0, i) : text).trim();
}

// REFS の項目の数（「- なし」などの空の項目は数えない）。
function refsEntryCount(text) {
  const m = typeof text === 'string' ? text.match(/REFS_START([\s\S]*?)(?:REFS_END|$)/) : null;
  if (!m) return 0;
  return m[1].split('\n').filter((l) => /^\s*[-・*]\s*\S/.test(l)
    && !/^\s*[-・*]\s*[（(]?\s*(?:なし|ありません|該当(?:する)?(?:メモは?)?(?:なし|ありません))/.test(l)).length;
}

// 答えがメモを根拠に挙げているか（REFS の項目・『書名』より の行・本ごとの ◆ と 根拠：）。
function citesMemos(body, text) {
  if (refsEntryCount(text) > 0) return true;
  if (/^\s*根拠\s*[：:]/m.test(body)) return true;
  if (/^\s*◆\s*『/m.test(body)) return true;
  if (/^\s*[-・*]\s*『[^』\n]+』[^\n]*より/m.test(body)) return true;
  return false;
}

// 相談の答えが「関係するメモが無い」答えそのものか。
export function isNoInfoConsultAnswer(text) {
  const body = consultAnswerBody(text);
  if (!body || body.length > NO_INFO_MAX_CHARS) return false;
  const concl = body.match(/【結論】\s*([\s\S]*?)(?=【|$)/);
  const head = (concl ? concl[1] : body).slice(0, NO_INFO_HEAD_CHARS);
  if (!NO_INFO_RE.test(head)) return false;
  if (body.length < NO_INFO_SHORT_CHARS) return true;
  return !citesMemos(body, text);
}

// 1 か月に返す回数の上限（0 で払い戻しをやめる）。
export function noInfoRefundLimit(env = process.env) {
  return Math.max(0, Math.floor(num(env.AI_NO_INFO_REFUND_LIMIT, 10)));
}
// 1 回で返すトークンの上限（これを超える原価の答えは返さない）。
export function noInfoRefundMaxTokens(env = process.env) {
  return Math.max(0, Math.floor(num(env.AI_NO_INFO_REFUND_MAX_TOKENS, 30)));
}
// 払い戻しの回数を数える行（日本時間の月）。
export function refundPeriodKey(monthKey) {
  return `refund-${monthKey}`;
}

// この 1 回が払い戻しの対象か（回数の上限は別に DB で数える）。
//   complete: 答えが最後まで届いた（stop_reason='end_turn'）
//   actualMjpy: この 1 回の実際の原価（usage から）。分からなければ返さない
export function noInfoRefundEligible({ tier, purpose, text, complete, actualMjpy, env = process.env } = {}) {
  if (tier === 'admin' || purpose !== 'consult' || !complete) return false;
  if (!(noInfoRefundLimit(env) > 0)) return false;
  if (actualMjpy == null || !Number.isFinite(Number(actualMjpy))) return false;
  if (tokensFromMjpy(actualMjpy, env) > noInfoRefundMaxTokens(env)) return false;
  return isNoInfoConsultAnswer(text);
}
