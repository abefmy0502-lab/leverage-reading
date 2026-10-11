import { describe, it, expect } from 'vitest';
import { usageBreakdown, isLowTokens, remainingRatio, usageSheetAction, isMissingPurposeColumn, USAGE_GROUPS } from './tokenUsage';
import { tokensFromMjpy } from './tokens';
import { USAGE_PURPOSES } from '../../api/_aiAccess.js';

describe('使い道の内訳（usageBreakdown）', () => {
  it('画面の名前にまとめ、足すと使ったトークンと同じ（最大剰余で丸める）・多い順', () => {
    const p = { consult: 10000, book_advisor: 4000, advisor_interview: 1000, setup_sheet: 1500, setup_sheet_edit: 500, book_brief: 400, ocr: 900 };
    const cost = Object.values(p).reduce((a, b) => a + b, 0);
    const rows = usageBreakdown(p, cost);
    expect(rows.map((r) => r.label)).toEqual(['相談', 'AI 選書', '読書計画シート', '写真から書き起こし', 'この本で学べること']);
    expect(rows.reduce((n, r) => n + r.tokens, 0)).toBe(tokensFromMjpy(cost));
    expect(rows.find((r) => r.key === 'advisor').tokens).toBe(17); // 5000 / 300 = 16.7
  });
  it('1 回ごとの切り上げを足さない（0.4 トークンの 3 回は 2 トークン＝使ったトークンと同じ）', () => {
    const rows = usageBreakdown({ book_brief: 360 }, 360);
    expect(rows).toEqual([{ key: 'brief', label: 'この本で学べること', tokens: 2 }]);
  });
  it('内訳を数える前に使った分は「内訳を数える前の分」としていちばん下に', () => {
    const rows = usageBreakdown({ consult: 6000 }, 9000);
    expect(rows).toEqual([
      { key: 'consult', label: '相談', tokens: 20 },
      { key: 'before', label: '内訳を数える前の分', tokens: 10 },
    ]);
  });
  it('知らない用途・ops_advise は「そのほか」・0 トークンの行は出さない', () => {
    const rows = usageBreakdown({ consult: 3000, ops_advise: 300, mystery: 300, condense: 0 }, 3600);
    expect(rows.map((r) => [r.label, r.tokens])).toEqual([['相談', 10], ['そのほか', 2]]);
  });
  it('何も記録が無い・読めないときは []（段を出さない）', () => {
    expect(usageBreakdown({}, 9000)).toEqual([]);
    expect(usageBreakdown(null, 9000)).toEqual([]);
    expect(usageBreakdown({ consult: 0 }, 0)).toEqual([]);
  });
  it('サーバーが数える用途はどれも画面のどこかの名前に入る（そのほか以外）', () => {
    const named = new Set(USAGE_GROUPS.filter((g) => g.key !== 'other').flatMap((g) => g.purposes));
    for (const p of USAGE_PURPOSES) if (p !== 'ops_advise') expect(named.has(p)).toBe(true);
  });
});

describe('残りが少ない（isLowTokens）・棒（remainingRatio）', () => {
  it('その月の分＋追加分が枠の 20% 以下で true・0 と不明は false', () => {
    expect(isLowTokens(160, 800)).toBe(true);
    expect(isLowTokens(161, 800)).toBe(false);
    expect(isLowTokens(100, 800, 300)).toBe(false); // 追加分があれば少なくない
    expect(isLowTokens(0, 800)).toBe(false); // 使い切った案内は別に出る
    expect(isLowTokens(6, 30)).toBe(true);
    expect(isLowTokens(null, 800)).toBe(false);
    expect(isLowTokens(10, null)).toBe(false);
  });
  it('残りの割合（0〜1・残りで埋める・使い切ったら空）', () => {
    expect(remainingRatio(200, 800)).toBe(0.25);
    expect(remainingRatio(900, 800)).toBe(1);
    expect(remainingRatio(0, 800)).toBe(0);
    expect(remainingRatio(800, 800)).toBe(1);
    expect(remainingRatio(null, 800)).toBe(null);
  });
});

describe('シートの下のボタン（追加課金の動線・usageSheetAction）', () => {
  it('プランの人（有料・7 日間無料）は「トークンを追加」。余裕があるときは枠線（strong=false）', () => {
    expect(usageSheetAction({ plan: 'paid', remaining: 500 })).toEqual({ kind: 'add', label: 'トークンを追加', strong: false });
    // 月の分は 0 でも追加分が十分あれば枠線
    expect(usageSheetAction({ plan: 'paid', remaining: 0, purchased: 1120 }).strong).toBe(false);
  });
  it('塗りは 残りが少ない・使い切った（追加分も 0）ときだけ', () => {
    expect(usageSheetAction({ plan: 'paid', remaining: 140, low: true }).strong).toBe(true);
    expect(usageSheetAction({ plan: 'trial', remaining: 0 })).toEqual({ kind: 'add', label: 'トークンを追加', strong: true });
  });
  it('無料プランは買えない: まだ残りがあれば「プランを見る」（7 日間無料をすすめない・枠線）', () => {
    expect(usageSheetAction({ plan: 'free', remaining: 12, trialOffer: '7 日間無料' })).toEqual({ kind: 'plans', label: 'プランを見る', reason: null, strong: false });
    // 少ないだけでは塗らない（使い切るまで枠線）
    expect(usageSheetAction({ plan: 'free', remaining: 6, low: true }).strong).toBe(false);
  });
  it('無料のトークンを使い切った（すすめてよい ①）＋使える人だけ「7 日間無料で試す」（塗り）', () => {
    expect(usageSheetAction({ plan: 'free', remaining: 0, trialOffer: '7 日間無料' })).toEqual({ kind: 'trial', label: '7 日間無料で試す', reason: 'free_used', strong: true });
    // 前にプランを契約した・使えない・分からない人は「プランを見る」
    expect(usageSheetAction({ plan: 'free', remaining: 0, trialOffer: '7 日間無料', hadPlan: true })).toEqual({ kind: 'plans', label: 'プランを見る', reason: 'free_used', strong: true });
    expect(usageSheetAction({ plan: 'free', remaining: 0, trialOffer: '' })).toEqual({ kind: 'plans', label: 'プランを見る', reason: 'free_used', strong: true });
  });
  it('残りが分からないときは使い切ったことにしない・管理者は出さない', () => {
    expect(usageSheetAction({ plan: 'free', remaining: null, trialOffer: '7 日間無料' })).toMatchObject({ kind: 'plans', strong: false });
    expect(usageSheetAction({ plan: 'admin', remaining: null })).toBe(null);
  });
});

describe('列が無いエラーだけ読み直す（isMissingPurposeColumn）', () => {
  it('42703・PGRST204・列名入りは列が無い、ほかの失敗は違う', () => {
    expect(isMissingPurposeColumn({ code: '42703', message: 'column does not exist' })).toBe(true);
    expect(isMissingPurposeColumn({ code: 'PGRST204', message: '' })).toBe(true);
    expect(isMissingPurposeColumn({ message: 'column ai_usage.purpose_mjpy does not exist' })).toBe(true);
    expect(isMissingPurposeColumn({ code: 'demo', message: 'network error' })).toBe(false);
    expect(isMissingPurposeColumn(null)).toBe(false);
  });
});
