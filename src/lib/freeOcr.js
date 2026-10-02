// 📷 無料プランの写真から書き起こし（月 FREE_OCR_PER_MONTH 回・2026-10-02 オーナー裁定）。
//
// メモを早くためてもらい、相談が役に立つところまで育てるため、無料プランでも写真から書き起こしを
// 1 か月に 10 回使える（相談のトークンは使わない・別枠）。数えて止めるのはサーバー
// （api/claude.js・api/_aiAccess.js の AI_FREE_OCR_PER_MONTH）。ここは「今月 あと N 回」を出すための写し。
// 真実は ai_usage の period_month='freeocr-YYYY-MM' 行の calls（本人の行だけ読める・RLS）。
// サーバーの回数を env で変えたら、FREE_OCR_PER_MONTH（tokenAmounts.js）も揃える（tokens.test.js が既定を確かめる）。

import { supabase, isSupabaseConfigured } from './supabase';
import { FREE_OCR_PER_MONTH } from './tokenAmounts';
import { nextResetLabelJa } from './freeTrial';

export { FREE_OCR_PER_MONTH };

// どの行を読むか（サーバーの freeOcrPeriodKey と同じ・日本時間の月）。
export function freeOcrPeriodKey(now = Date.now()) {
  return `freeocr-${new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 7)}`;
}

// 残りの回数。使った回数が分からないときは null（出さない）。
export function freeOcrRemaining(limit, usedCalls) {
  if (usedCalls == null || !Number.isFinite(Number(usedCalls))) return null;
  const l = Math.max(0, Math.floor(Number(limit) || 0));
  return Math.max(0, l - Math.max(0, Math.floor(Number(usedCalls))));
}

// ボタンのそばに出す 1 行（無料プランの人だけ）。折り返してよいのは「・」の後だけ（parts を nowrap で並べる）。
//   残りあり: ['今月 あと 8 回']
//   0 回:     ['今月 あと 0 回・', '11月1日に戻ります']
//   分からない・無料プランでない: null（出さない）
export function freeOcrHintParts({ freeMode, remaining, now = new Date() }) {
  if (!freeMode || remaining == null) return null;
  if (remaining > 0) return [`今月 あと ${remaining} 回`];
  return ['今月 あと 0 回・', `${nextResetLabelJa(now)}に戻ります`];
}

// 押したときにどうするか。'pick'（写真を選ぶ）| 'paywall'（今月の分を使い切った＝有料プランの画面）。
// 残りが分からないときは選ばせる（止めるのはサーバー。使い切っていれば 402 で画面が開く）。
export function freeOcrTapAction({ freeMode, remaining }) {
  if (freeMode && remaining === 0) return 'paywall';
  return 'pick';
}

// 今月使った回数（本人の行だけ読める）。行が無ければ 0、読めなければ null。
export async function fetchFreeOcrUsed(userId, periodKey = freeOcrPeriodKey()) {
  if (!isSupabaseConfigured || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('calls')
      .eq('user_id', userId)
      .eq('period_month', periodKey)
      .maybeSingle();
    if (error) return null;
    return data ? Math.max(0, Math.floor(Number(data.calls) || 0)) : 0;
  } catch {
    return null;
  }
}
