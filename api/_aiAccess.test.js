import { describe, it, expect } from 'vitest';
import {
  decideAiAccess, decideFreeReservation, isFreePurpose,
  freeOcrPerMonth, freeOcrPeriodKey, freeOcrLimitMessage, decideFreeOcrReservation,
  tokenJpy, tokenMjpy, tokensFromMjpy, freeTokens, trialTokens, paidTokens, allowanceFor, fallbackCallsFor,
  periodKeyFor, reserveBudgetMjpy, remainingTokens, meteredCallLimit,
  jstMonthDayLabel, nextMonthFirstLabel, monthlyTokensMessage, trialTokensMessage, planRequiredMessage, limitMessageFor,
} from './_aiAccess.js';
import { monthlyBudgetJpy } from './_aiCost.js';

const ENV = {}; // 既定値で確かめる

describe('トークンの換算', () => {
  it('1 トークン ≈ ¥0.3（env で変えられる）', () => {
    expect(tokenJpy(ENV)).toBe(0.3);
    expect(tokenMjpy(ENV)).toBe(300);
    expect(tokenJpy({ AI_TOKEN_JPY: '0.5' })).toBe(0.5);
    expect(tokenJpy({ AI_TOKEN_JPY: '0' })).toBe(0.3); // 0 以下は既定に戻す
  });
  it('使った原価（mjpy）→ トークンは切り上げ', () => {
    expect(tokensFromMjpy(0, ENV)).toBe(0);
    expect(tokensFromMjpy(1, ENV)).toBe(1);
    expect(tokensFromMjpy(300, ENV)).toBe(1);
    expect(tokensFromMjpy(301, ENV)).toBe(2);
    expect(tokensFromMjpy(2760, ENV)).toBe(10); // 相談 1 回 約 ¥2.8
  });
  it('残り = 上限 − 使ったトークン（0 未満にしない）', () => {
    expect(remainingTokens(30, 0, ENV)).toBe(30);
    expect(remainingTokens(30, 2760, ENV)).toBe(20);
    expect(remainingTokens(30, 99999, ENV)).toBe(0);
  });
});

describe('プランごとのトークン', () => {
  it('既定: 無料 30・無料期間 150・有料 800', () => {
    expect(freeTokens(ENV)).toBe(30);
    expect(trialTokens(ENV)).toBe(150);
    expect(paidTokens(ENV)).toBe(800);
    expect(allowanceFor('free', ENV)).toBe(30);
    expect(allowanceFor('trial', ENV)).toBe(150);
    expect(allowanceFor('paid', ENV)).toBe(800);
    expect(allowanceFor('admin', ENV)).toBe(Infinity);
  });
  it('有料の 800 トークンは、手取り ¥900 を残せる原価の天井（約 ¥243）の内側', () => {
    expect(paidTokens(ENV) * tokenJpy(ENV)).toBeLessThanOrEqual(monthlyBudgetJpy({}));
  });
  it('円の上限（AI_MONTHLY_BUDGET_JPY / AI_TRIAL_BUDGET_JPY）を入れたら、そちらが優先', () => {
    expect(paidTokens({ AI_MONTHLY_BUDGET_JPY: '150' })).toBe(500);
    expect(paidTokens({ AI_MONTHLY_BUDGET_JPY: '150', AI_PAID_TOKENS: '900' })).toBe(500);
    expect(paidTokens({ AI_PAID_TOKENS: '900' })).toBe(900);
    expect(trialTokens({ AI_TRIAL_BUDGET_JPY: '30' })).toBe(100);
    expect(freeTokens({ AI_FREE_TOKENS: '0' })).toBe(0);
  });
  it('原価を数えられない DB での回数 = トークン ÷ 10', () => {
    expect(fallbackCallsFor('free', ENV)).toBe(3);
    expect(fallbackCallsFor('trial', ENV)).toBe(15);
  });
});

describe('どの行で数えるか', () => {
  it('無料は free-YYYY-MM・有料は YYYY-MM', () => {
    expect(periodKeyFor('free', { monthKey: '2026-09' })).toBe('free-2026-09');
    expect(periodKeyFor('paid', { monthKey: '2026-09' })).toBe('2026-09');
  });
  it('無料期間は終わる日（日本時間）ごと＝月をまたいでも増えない', () => {
    expect(periodKeyFor('trial', { monthKey: '2026-09', periodEnd: '2026-10-03T20:00:00Z' })).toBe('trial-2026-10-04');
    expect(periodKeyFor('trial', { monthKey: '2026-10', periodEnd: '2026-10-03T20:00:00Z' })).toBe('trial-2026-10-04');
    expect(periodKeyFor('trial', { monthKey: '2026-09', periodEnd: null })).toBe('trial-2026-09');
  });
});

describe('最後の 1 回ルール（reserveBudgetMjpy）', () => {
  // reserve_ai_cost は「使った量 + この 1 回 ≤ 上限」のときだけ予約する（SQL と同じ判定をまねる）
  const rpcAllows = (used, est, allowance) => used + est <= reserveBudgetMjpy(allowance, est, ENV);
  it('使ったトークンが上限未満なら、見積もりが大きくても始められる', () => {
    expect(rpcAllows(8280, 5000, 30)).toBe(true); // 28 トークン使用・この 1 回の見積もり 17 トークン
    expect(rpcAllows(8700, 5000, 30)).toBe(true); // 29 トークン（切り上げ）
  });
  it('使ったトークン（切り上げ）が上限に達したら始められない＝表示の「残り 0」と同じ境目', () => {
    expect(rpcAllows(8701, 5000, 30)).toBe(false); // 30 トークン（切り上げ）
    expect(rpcAllows(9000, 1, 30)).toBe(false);
    expect(remainingTokens(30, 8701, ENV)).toBe(0);
    expect(remainingTokens(30, 8700, ENV)).toBe(1);
  });
  it('はみ出すのは最大 1 回分', () => {
    const used = 8700;
    const est = 5000;
    expect(used + est - 30 * 300).toBeLessThanOrEqual(est);
  });
  it('トークン 0 は常に拒否', () => {
    expect(rpcAllows(0, 1, 0)).toBe(false);
  });
});

describe('decideAiAccess（フリーミアム）', () => {
  it('管理者はいつでも通す', () => {
    expect(decideAiAccess({ entitlement: { admin: true }, env: ENV })).toEqual({ allow: true, tier: 'admin' });
  });
  it('有料はすべての AI 機能', () => {
    expect(decideAiAccess({ entitlement: { allowed: true }, env: ENV })).toEqual({ allow: true, tier: 'paid' });
  });
  it('無料期間（trial）もすべての AI 機能', () => {
    expect(decideAiAccess({ entitlement: { allowed: true, trial: true }, env: ENV })).toEqual({ allow: true, tier: 'trial' });
  });
  it('契約なし: 相談は無料のトークンで通す（本ごとの答え方も purpose は consult）', () => {
    expect(decideAiAccess({ entitlement: { allowed: false }, purpose: 'consult', freeAllowance: 30, env: ENV })).toEqual({ allow: true, tier: 'free' });
  });
  it('契約なし: 相談以外（purpose なし・別の用途）は plan_required', () => {
    for (const purpose of [undefined, null, '', 'advisor', 'theme', 'CONSULT', 1]) {
      expect(decideAiAccess({ entitlement: { allowed: false }, purpose, freeAllowance: 30, env: ENV }))
        .toEqual({ allow: false, status: 402, errorCode: 'plan_required' });
    }
  });
  it('契約なし: 今月のトークンを使い切ったら free_limit_reached', () => {
    expect(decideAiAccess({ entitlement: {}, purpose: 'consult', freeAllowance: 30, freeUsedMjpy: 9000, env: ENV }).errorCode).toBe('free_limit_reached');
    expect(decideAiAccess({ entitlement: {}, purpose: 'consult', freeAllowance: 30, freeUsedMjpy: 8700, env: ENV }).allow).toBe(true);
  });
  it('無料のトークンが 0（AI_FREE_TOKENS=0）なら相談も plan_required', () => {
    expect(decideAiAccess({ entitlement: {}, purpose: 'consult', freeAllowance: 0, env: ENV }).errorCode).toBe('plan_required');
  });
  it('isFreePurpose は consult と book_brief（この本で学べること・2026-10-08）だけ', () => {
    expect(isFreePurpose('consult')).toBe(true);
    expect(isFreePurpose('book_brief')).toBe(true);
    expect(isFreePurpose('advisor')).toBe(false);
    expect(isFreePurpose('setup_sheet')).toBe(false);
  });
  it('契約なし: この本で学べることは相談と同じ無料のトークンで通す・使い切ったら free_limit_reached', () => {
    expect(decideAiAccess({ entitlement: {}, purpose: 'book_brief', freeAllowance: 30, env: ENV })).toEqual({ allow: true, tier: 'free' });
    expect(decideAiAccess({ entitlement: {}, purpose: 'book_brief', freeAllowance: 30, freeUsedMjpy: 9000, env: ENV }).errorCode).toBe('free_limit_reached');
    expect(decideAiAccess({ entitlement: {}, purpose: 'book_brief', freeAllowance: 0, env: ENV }).errorCode).toBe('plan_required');
  });
});

describe('📷 無料プランの写真から書き起こし（月 10 回・2026-10-02）', () => {
  const free = { allowed: false };
  it('既定は月 10 回・AI_FREE_OCR_PER_MONTH で変えられる（0 でやめる・数字でなければ既定）', () => {
    expect(freeOcrPerMonth(ENV)).toBe(10);
    expect(freeOcrPerMonth({ AI_FREE_OCR_PER_MONTH: '5' })).toBe(5);
    expect(freeOcrPerMonth({ AI_FREE_OCR_PER_MONTH: '0' })).toBe(0);
    expect(freeOcrPerMonth({ AI_FREE_OCR_PER_MONTH: 'x' })).toBe(10);
    expect(freeOcrPerMonth({ AI_FREE_OCR_PER_MONTH: '-3' })).toBe(0);
  });
  it('契約なしでも ocr は通す（相談のトークンとは別の free_ocr）', () => {
    expect(decideAiAccess({ entitlement: free, purpose: 'ocr', env: ENV })).toEqual({ allow: true, tier: 'free_ocr' });
    expect(decideAiAccess({ entitlement: free, purpose: 'ocr', freeOcrLimit: 10, freeOcrUsed: 9, env: ENV })).toEqual({ allow: true, tier: 'free_ocr' });
  });
  it('相談のトークンを使い切っていても、書き起こしは別枠で通す', () => {
    expect(decideAiAccess({ entitlement: free, purpose: 'ocr', freeAllowance: 30, freeUsedMjpy: 9000, env: ENV }).allow).toBe(true);
  });
  it('今月の回数を使い切ったら free_ocr_limit_reached', () => {
    expect(decideAiAccess({ entitlement: free, purpose: 'ocr', freeOcrLimit: 10, freeOcrUsed: 10, env: ENV }))
      .toEqual({ allow: false, status: 402, errorCode: 'free_ocr_limit_reached' });
  });
  it('AI_FREE_OCR_PER_MONTH=0 なら今までどおり plan_required', () => {
    expect(decideAiAccess({ entitlement: free, purpose: 'ocr', freeOcrLimit: 0, env: ENV }).errorCode).toBe('plan_required');
    expect(decideAiAccess({ entitlement: free, purpose: 'ocr', env: { AI_FREE_OCR_PER_MONTH: '0' } }).errorCode).toBe('plan_required');
  });
  it('ほかの用途（相談以外）は今までどおり plan_required', () => {
    for (const purpose of ['condense', 'cards_to_summary', 'setup_sheet', 'book_advisor', 'advisor_interview', 'OCR', undefined]) {
      expect(decideAiAccess({ entitlement: free, purpose, freeOcrLimit: 10, env: ENV }).errorCode).toBe('plan_required');
    }
  });
  it('有料・無料期間・管理者は変わらない（トークン／数えない）', () => {
    expect(decideAiAccess({ entitlement: { allowed: true }, purpose: 'ocr', freeOcrUsed: 99, env: ENV })).toEqual({ allow: true, tier: 'paid' });
    expect(decideAiAccess({ entitlement: { allowed: true, trial: true }, purpose: 'ocr', env: ENV })).toEqual({ allow: true, tier: 'trial' });
    expect(decideAiAccess({ entitlement: { admin: true }, purpose: 'ocr', env: ENV })).toEqual({ allow: true, tier: 'admin' });
  });
  it('数えられない（RPC 未適用・障害）ときは通さない（fail-closed）', () => {
    expect(decideFreeOcrReservation({ usage: { reserved: false, allowed: true } })).toEqual({ allow: false, status: 402, errorCode: 'plan_required' });
    expect(decideFreeOcrReservation(undefined).allow).toBe(false);
    expect(decideFreeOcrReservation({ usage: { reserved: true, allowed: false } })).toEqual({ allow: false, status: 402, errorCode: 'free_ocr_limit_reached' });
    expect(decideFreeOcrReservation({ usage: { reserved: true, allowed: true } })).toEqual({ allow: true });
  });
  it('行は freeocr-YYYY-MM（日本時間の月・相談の free- とは別）', () => {
    expect(freeOcrPeriodKey('2026-10')).toBe('freeocr-2026-10');
  });
  it('使い切りの案内（来月 1 日・途中で改行しない）', () => {
    const now = Date.parse('2026-10-02T03:00:00Z');
    expect(freeOcrLimitMessage(10, now)).toBe('今月の写真から書き起こしは、ここまでです。11\u2060月\u20601\u2060日に 10 回に戻ります。');
  });
});

describe('decideFreeReservation（無料の枠は fail-closed）', () => {
  it('原価で数えられたら、その結果に従う', () => {
    expect(decideFreeReservation({ cost: { metered: true, allowed: true } })).toEqual({ allow: true });
    expect(decideFreeReservation({ cost: { metered: true, allowed: false } }).errorCode).toBe('free_limit_reached');
  });
  it('原価を数えられないときは回数で（トークン ÷ 10 回）', () => {
    expect(decideFreeReservation({ cost: { metered: false }, usage: { reserved: true, allowed: true } })).toEqual({ allow: true });
    expect(decideFreeReservation({ cost: { metered: false }, usage: { reserved: true, allowed: false } }).errorCode).toBe('free_limit_reached');
  });
  it('どちらでも数えられない（RPC 未適用・障害）ときは通さない', () => {
    expect(decideFreeReservation({ cost: { metered: false }, usage: { reserved: false, allowed: true } }))
      .toEqual({ allow: false, status: 402, errorCode: 'plan_required' });
    expect(decideFreeReservation(undefined).allow).toBe(false);
  });
});

describe('案内の文', () => {
  it('日付は日本時間・途中で改行しない', () => {
    expect(jstMonthDayLabel('2026-10-03T20:00:00Z')).toBe('10月4日');
    expect(jstMonthDayLabel('2026-10-03T20:00:00Z', true)).toBe('10⁠月⁠4⁠日');
    expect(jstMonthDayLabel('x')).toBe('');
  });
  it('来月 1 日（日本時間・12 月は 1 月へ）', () => {
    expect(nextMonthFirstLabel(Date.parse('2026-09-30T16:00:00Z'))).toBe('11月1日'); // 日本時間 10/1
    expect(nextMonthFirstLabel(Date.parse('2026-12-10T00:00:00Z'))).toBe('1月1日');
  });
  it('月のトークン・無料期間・プラン', () => {
    const now = Date.parse('2026-09-27T00:00:00Z');
    expect(monthlyTokensMessage(30, now)).toBe('今月のトークンは、ここまでです。10⁠月⁠1⁠日に 30 トークンに戻ります。');
    expect(limitMessageFor('paid', { env: ENV, now })).toBe('今月のトークンは、ここまでです。10⁠月⁠1⁠日に 800 トークンに戻ります。');
    expect(trialTokensMessage('2026-10-03T20:00:00Z', 800)).toBe('無料期間のトークンは、ここまでです。無料期間が終わる10⁠月⁠4⁠日から、毎月 800 トークン使えます。');
    expect(limitMessageFor('trial', { env: ENV, periodEnd: null })).toBe('無料期間のトークンは、ここまでです。無料期間が終わると、毎月 800 トークン使えます。');
    expect(planRequiredMessage()).toBe('この AI 機能は、プランでご利用いただけます。');
  });
});

describe('原価で守れているときの回数の上限（meteredCallLimit）', () => {
  it('使えるトークンより先に回数（既定 120）で止めない', () => {
    // 有料 800 トークン: 凝縮（約 1 トークン）を多く使う人が 120 回で「今月のトークンは、ここまで」にならない
    expect(meteredCallLimit(120, 800)).toBe(800);
    // 追加トークンを買った人（800 + 1,000）
    expect(meteredCallLimit(120, 1800)).toBe(1800);
  });
  it('無料（30）・無料期間（150）でも、少なくとも既定の回数', () => {
    expect(meteredCallLimit(120, 30)).toBe(120);
    expect(meteredCallLimit(120, 150)).toBe(150);
    expect(meteredCallLimit(undefined, 0)).toBe(120);
  });
});

// 🙏 関係するメモが無かった相談の払い戻し（2026-09-29）
import {
  isNoInfoConsultAnswer, noInfoRefundEligible, noInfoRefundLimit, noInfoRefundMaxTokens, refundPeriodKey, consultAnswerBody,
} from './_aiAccess.js';

const NO_INFO = `【結論】
あなたの読書記録には、このトピックに関する情報がまだありません。

【明日からできる 1 つの行動】
今週末に書店で、資産運用の入門書を 1 冊手に取って目次を読む。

REFS_START
REFS_END`;

const REAL = `【結論】
部下の話を最後まで聞いてから、自分の考えを伝えるのが近道です。

【参照した本のメモ】
- 『人を動かす』(p.45) より: 相手の関心に目を向ける
- 『嫌われる勇気』(p.120) より: 課題の分離

【あなたの状況に合わせた解釈】
2 冊のメモを合わせると、まず相手の課題を尊重することが出発点です。

【明日からできる 1 つの行動】
明日の 1on1 の最初の 5 分で、部下に近況を聞く。

REFS_START
- 📚 カーネギー『人を動かす』p.45
- 📚 岸見一郎『嫌われる勇気』p.120
REFS_END`;

describe('isNoInfoConsultAnswer（関係するメモが無い答えそのものか）', () => {
  it('決まり文句が【結論】にある短い答え → true', () => {
    expect(isNoInfoConsultAnswer(NO_INFO)).toBe(true);
  });
  it('【結論】の見出しが無くても、先頭 200 字に決まり文句があれば → true', () => {
    expect(isNoInfoConsultAnswer('あなたの読書記録には、このトピックに関する情報がまだありません。投資の本を読むと役立つかもしれません。')).toBe(true);
  });
  it('本ごとの答え方・共通ルールの「該当するメモがない」も拾う', () => {
    expect(isNoInfoConsultAnswer('【結論】\n今回の悩みに該当するメモはありません。\n\n【明日からできる 1 つの行動】\n関係する本を 1 冊選ぶ。')).toBe(true);
  });
  it('ふつうの答え（メモを根拠にしている）→ false', () => {
    expect(isNoInfoConsultAnswer(REAL)).toBe(false);
  });
  it('決まり文句が【結論】の外（根拠の途中）にあるだけ → false', () => {
    const t = REAL.replace('2 冊のメモを合わせると', 'お金の話は情報がまだありませんが、2 冊のメモを合わせると');
    expect(isNoInfoConsultAnswer(t)).toBe(false);
  });
  it('結論に決まり文句があっても、400 字以上でメモを根拠に挙げている（部分的な答え）→ false', () => {
    const t = REAL.replace('部下の話を最後まで聞いてから、自分の考えを伝えるのが近道です。', '評価面談についての情報はまだありませんが、次のメモが参考になります。')
      .replace('【あなたの状況に合わせた解釈】', `【あなたの状況に合わせた解釈】\n${'補足の説明です。'.repeat(30)}`);
    expect(consultAnswerBody(t).length).toBeGreaterThanOrEqual(400);
    expect(isNoInfoConsultAnswer(t)).toBe(false);
  });
  it('決まり文句つきでも 900 字を超える長い答え → false（中身のある答えを無料にしない）', () => {
    const t = `【結論】\nこのトピックに関する情報がまだありません。\n\n${'一般的な説明が続きます。'.repeat(80)}`;
    expect(isNoInfoConsultAnswer(t)).toBe(false);
  });
  it('空・文字列でない → false', () => {
    expect(isNoInfoConsultAnswer('')).toBe(false);
    expect(isNoInfoConsultAnswer(null)).toBe(false);
  });
});

describe('noInfoRefundEligible（払い戻しの対象か）', () => {
  const base = { tier: 'paid', purpose: 'consult', text: NO_INFO, complete: true, actualMjpy: 3000, env: ENV };
  it('有料・無料期間・無料の相談で、最後まで届いた決まり文句の答え → true', () => {
    expect(noInfoRefundEligible(base)).toBe(true);
    expect(noInfoRefundEligible({ ...base, tier: 'trial' })).toBe(true);
    expect(noInfoRefundEligible({ ...base, tier: 'free' })).toBe(true);
  });
  it('管理者・相談以外・途中で切れた・原価が分からない → false', () => {
    expect(noInfoRefundEligible({ ...base, tier: 'admin' })).toBe(false);
    expect(noInfoRefundEligible({ ...base, purpose: undefined })).toBe(false);
    expect(noInfoRefundEligible({ ...base, purpose: 'theme' })).toBe(false);
    expect(noInfoRefundEligible({ ...base, complete: false })).toBe(false);
    expect(noInfoRefundEligible({ ...base, actualMjpy: null })).toBe(false);
  });
  it('1 回の原価が上限（既定 30 トークン）を超える → false', () => {
    expect(noInfoRefundMaxTokens(ENV)).toBe(30);
    expect(noInfoRefundEligible({ ...base, actualMjpy: 30 * 300 })).toBe(true);
    expect(noInfoRefundEligible({ ...base, actualMjpy: 30 * 300 + 1 })).toBe(false);
  });
  it('AI_NO_INFO_REFUND_LIMIT=0 で払い戻しをやめる', () => {
    expect(noInfoRefundLimit(ENV)).toBe(10);
    expect(noInfoRefundEligible({ ...base, env: { AI_NO_INFO_REFUND_LIMIT: '0' } })).toBe(false);
  });
  it('回数は日本時間の月ごとの refund- 行で数える', () => {
    expect(refundPeriodKey('2026-09')).toBe('refund-2026-09');
  });
});
