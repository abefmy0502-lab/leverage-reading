import { describe, it, expect } from 'vitest';
import {
  AI_TOKEN_JPY, FREE_TOKENS, TRIAL_TOKENS, PAID_TOKENS, TOKEN_COSTS,
  tokensFromMjpy, remainingTokens, allowanceFor, periodKeyFor, monthDayLabelJa,
} from './tokens';
import * as server from '../../api/_aiAccess.js';
import { costFromUsage } from '../../api/_aiCost.js';

describe('画面の写し（src/lib/tokens.js）はサーバーの既定と同じ', () => {
  it('換算とプランごとの量', () => {
    expect(AI_TOKEN_JPY).toBe(server.tokenJpy({}));
    expect(FREE_TOKENS).toBe(server.freeTokens({}));
    expect(TRIAL_TOKENS).toBe(server.trialTokens({}));
    expect(PAID_TOKENS).toBe(server.paidTokens({}));
  });
  it('使ったトークン・残り・行のキーもサーバーと同じ', () => {
    for (const m of [0, 1, 299, 300, 301, 2760, 9000, 240000]) {
      expect(tokensFromMjpy(m)).toBe(server.tokensFromMjpy(m, {}));
      expect(remainingTokens(30, m)).toBe(server.remainingTokens(30, m, {}));
    }
    const now = Date.parse('2026-09-30T16:00:00Z'); // 日本時間 10/1
    expect(periodKeyFor('free', { now })).toBe(server.periodKeyFor('free', { monthKey: server.jstMonthKey(now) }));
    expect(periodKeyFor('free', { now })).toBe('free-2026-10');
    expect(periodKeyFor('paid', { now })).toBe('2026-10');
    expect(periodKeyFor('trial', { now, periodEnd: '2026-10-03T20:00:00Z' })).toBe('trial-2026-10-04');
  });
});

describe('プランと残り', () => {
  it('allowanceFor', () => {
    expect(allowanceFor('free')).toBe(30);
    expect(allowanceFor('trial')).toBe(150);
    expect(allowanceFor('paid')).toBe(800);
    expect(allowanceFor('admin')).toBe(null);
    expect(remainingTokens(null, 100)).toBe(null);
  });
  it('monthDayLabelJa', () => {
    expect(monthDayLabelJa('2026-10-03T20:00:00Z')).toBe('10月4日');
    expect(monthDayLabelJa('')).toBe('');
  });
});

describe('1 回の目安（TOKEN_COSTS）は、ふつうの大きさの実際の原価と大きくずれない', () => {
  // 目安 ÷ 実際 が 0.6〜1.6 倍に収まる（表示用の丸めの範囲）。
  const toTokens = (mjpy) => mjpy / 1000 / AI_TOKEN_JPY;
  const H = 'claude-haiku-4-5';
  const S = 'claude-sonnet-5';
  const cases = [
    ['consult', H, { input_tokens: 11500, cache_read_input_tokens: 1800, output_tokens: 800 }],
    ['consultPerBook', H, { input_tokens: 12500, cache_read_input_tokens: 2200, output_tokens: 1300 }],
    // 2026-10-02: 本の紹介と目次（最大 約 1,400 トークン）を足した大きさ。
    ['setupSheet', H, { input_tokens: 4900, output_tokens: 1300 }],
    ['photoToText', H, { input_tokens: 2000, cache_read_input_tokens: 300, output_tokens: 350 }],
    ['cardsToSummary', H, { input_tokens: 2500, cache_read_input_tokens: 300, output_tokens: 500 }],
  ];
  for (const [key, model, usage] of cases) {
    it(key, () => {
      const ratio = TOKEN_COSTS[key] / toTokens(costFromUsage(model, usage));
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(1.6);
    });
  }
  it('advisor（聞き返し 2 回＋おすすめ）', () => {
    const t = toTokens(costFromUsage(S, { input_tokens: 5000, cache_read_input_tokens: 2000, output_tokens: 2200 }))
      + 2 * toTokens(costFromUsage(H, { input_tokens: 2500, cache_read_input_tokens: 1200, output_tokens: 400 }));
    const ratio = TOKEN_COSTS.advisor / t;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.6);
  });
});

describe('runCostLine（AI 選書・読書計画シートのボタンのそば）', () => {
  it('1 回の目安と残りを 1 行で', async () => {
    const { runCostLine } = await import('./tokens.js');
    expect(runCostLine({ plan: 'paid', remaining: 742, cost: 25 })).toBe('1 回 約 25 トークン・今月の残り 742 トークン');
    expect(runCostLine({ plan: 'trial', remaining: 1200, purchased: 300, cost: 6 })).toBe('1 回 約 6 トークン・無料期間の残り 1,200 ＋追加 300 トークン');
  });
  it('残りが分からなければ出さない', async () => {
    const { runCostLine } = await import('./tokens.js');
    expect(runCostLine({ plan: 'paid', remaining: null, cost: 25 })).toBe('');
  });
});

describe('🌱 無料プランのはじめの月（画面の写しはサーバーと同じ）', () => {
  it('既定の量（60）はサーバーの AI_FREE_FIRST_MONTH_TOKENS の既定と同じ', async () => {
    const { FREE_FIRST_MONTH_TOKENS } = await import('./tokens.js');
    expect(FREE_FIRST_MONTH_TOKENS).toBe(server.freeFirstMonthTokens({}));
    expect(FREE_FIRST_MONTH_TOKENS).toBe(60);
  });
  it('はじめの月の判定と量は、サーバーと同じ（日本時間の月・月をまたぐ・読めない）', async () => {
    const { isFreeFirstMonth, freeTokensFor } = await import('./tokens.js');
    const nowList = ['2026-10-09T03:00:00Z', '2026-10-31T14:59:59Z', '2026-10-31T15:00:00Z', '2027-01-01T00:00:00Z'].map(Date.parse);
    const created = ['2026-10-01T00:00:00Z', '2026-09-30T14:59:59Z', '2026-09-30T15:00:00Z', '2026-10-31T15:00:00Z', '2026-12-31T16:00:00Z', null, '', 'きのう'];
    for (const now of nowList) {
      for (const c of created) {
        const monthKey = server.jstMonthKey(now);
        expect(isFreeFirstMonth(c, now), `${c} @ ${new Date(now).toISOString()}`).toBe(server.isFreeFirstMonth(c, monthKey));
        expect(freeTokensFor(c, now)).toBe(server.freeTokensFor({ createdAt: c, monthKey, env: {} }));
        expect(allowanceFor('free', { createdAt: c, now })).toBe(server.allowanceFor('free', {}, { createdAt: c, monthKey }));
      }
    }
  });
  it('来月に戻る量は、はじめの月の人も毎月の量（サーバーの使い切った案内と同じ 30）', async () => {
    const { nextMonthAllowanceFor } = await import('./tokens.js');
    expect(nextMonthAllowanceFor('free')).toBe(30);
    expect(server.limitMessageFor('free', { env: {}, now: Date.parse('2026-10-09T03:00:00Z') })).toContain(`${nextMonthAllowanceFor('free')} トークン`);
    expect(nextMonthAllowanceFor('paid')).toBe(800);
  });
});

describe('相談の量の目安（相談 1 つ＝約 3 往復＝約 30 トークン）', () => {
  it('量の目安: 無料 約 1 つ・はじめの月 約 2 つ・7 日間無料 約 5 つ・プラン 約 27 件', async () => {
    const { consultCountLabel, CONSULT_THREAD_TOKENS, FREE_FIRST_MONTH_TOKENS } = await import('./tokens.js');
    expect(CONSULT_THREAD_TOKENS).toBe(3 * TOKEN_COSTS.consult);
    expect(consultCountLabel(FREE_TOKENS)).toBe('約 1 つ');
    expect(consultCountLabel(FREE_FIRST_MONTH_TOKENS)).toBe('約 2 つ');
    expect(consultCountLabel(TRIAL_TOKENS)).toBe('約 5 つ');
    expect(consultCountLabel(PAID_TOKENS)).toBe('約 27 件');
  });
  it('残りの目安は切り捨て（言い過ぎない）・残りがあれば 1', async () => {
    const { remainingConsultsLabel } = await import('./tokens.js');
    expect(remainingConsultsLabel(60)).toBe('約 2 つ');
    expect(remainingConsultsLabel(50)).toBe('約 1 つ');
    expect(remainingConsultsLabel(5)).toBe('約 1 つ');
    expect(remainingConsultsLabel(0)).toBe('約 0 つ');
    expect(remainingConsultsLabel(800)).toBe('約 26 件');
  });
});
