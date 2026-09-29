import { describe, it, expect } from 'vitest';
import { monthlyBudgetJpy, costFromUsage, estimateCost, createUsageSniffer } from './_aiCost.js';

describe('monthlyBudgetJpy', () => {
  it('¥1,480・手数料 15%・消費税 10%・手取り ¥900 → 約 ¥243', () => {
    expect(monthlyBudgetJpy({})).toBe(243);
  });
  it('env で直接指定・式の値を上書きできる', () => {
    expect(monthlyBudgetJpy({ AI_MONTHLY_BUDGET_JPY: '200' })).toBe(200);
    expect(monthlyBudgetJpy({ AI_PLAN_PRICE_JPY: '1980' })).toBe(629);
    expect(monthlyBudgetJpy({ AI_PLAN_PRICE_JPY: '1000' })).toBe(0); // 手取りが足りないときは 0（AI を使わせない）
  });
});

describe('costFromUsage', () => {
  it('Sonnet 5: 入力 30,000・出力 1,200 トークン ≈ ¥12.7', () => {
    const mjpy = costFromUsage('claude-sonnet-5', { input_tokens: 30000, output_tokens: 1200 });
    // (30000*2 + 1200*10)/1e6 = $0.072 → ×160×1.1 = ¥12.67
    expect(Math.round(mjpy / 100) / 10).toBeCloseTo(12.7, 1);
  });
  it('キャッシュ読み出しは 1/10', () => {
    const a = costFromUsage('claude-sonnet-5', { input_tokens: 10000 });
    const b = costFromUsage('claude-sonnet-5', { cache_read_input_tokens: 10000 });
    expect(b).toBeLessThan(a / 9);
  });
  it('表に無いモデルは高い単価で数える', () => {
    expect(costFromUsage('x', { input_tokens: 1000 })).toBeGreaterThan(costFromUsage('claude-sonnet-5', { input_tokens: 1000 }));
  });
});

describe('estimateCost', () => {
  it('見積もりは実額より上振れ', () => {
    const est = estimateCost('claude-sonnet-5', { textChars: 20000, maxTokens: 2048 });
    const actual = costFromUsage('claude-sonnet-5', { input_tokens: 24000, output_tokens: 1500 });
    expect(est.total).toBeGreaterThan(actual);
  });
});

describe('createUsageSniffer', () => {
  it('分割されたチャンクから usage を拾う', () => {
    const s = createUsageSniffer();
    const sse = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":120,"cache_read_input_tokens":30,"output_tokens":1}}}\n\n'
      + 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"こんにちは"}}\n\n'
      + 'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":42}}\n\n';
    const bytes = new TextEncoder().encode(sse);
    for (let i = 0; i < bytes.length; i += 7) s.push(bytes.slice(i, i + 7));
    expect(s.usage.seenStart).toBe(true);
    expect(s.usage.seenDelta).toBe(true);
    expect(s.usage.input_tokens).toBe(120);
    expect(s.usage.cache_read_input_tokens).toBe(30);
    expect(s.usage.output_tokens).toBe(42);
  });
});

describe('createUsageSniffer の answer（相談の払い戻しの判定用）', () => {
  it('text_delta を集め、停止理由と message_stop を拾う', () => {
    const s = createUsageSniffer();
    const ev = (o) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
    s.push(ev({ type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1 } } }));
    s.push(ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: '【結論】\n情報が' } }));
    s.push(ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'まだありません' } }));
    s.push(ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } }));
    s.push(ev({ type: 'message_stop' }));
    expect(s.answer.text).toBe('【結論】\n情報がまだありません');
    expect(s.answer.stopReason).toBe('end_turn');
    expect(s.answer.stopped).toBe(true);
    expect(s.answer.truncated).toBe(false);
    expect(s.usage.output_tokens).toBe(20);
  });
});
