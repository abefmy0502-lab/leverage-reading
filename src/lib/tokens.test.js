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
    ['themeReport', H, { input_tokens: 7000, cache_read_input_tokens: 800, output_tokens: 600 }],
    ['setupSheet', H, { input_tokens: 3500, output_tokens: 1300 }],
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

describe('runCostLine（AI 選書・テーマまとめのボタンのそば）', () => {
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
