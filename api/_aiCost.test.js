import { describe, it, expect } from 'vitest';
import { monthlyBudgetJpy, costFromUsage, estimateCost, createUsageSniffer, priceFor, hasPrice, PRICES } from './_aiCost.js';

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

describe('会社ごとの単価（2026-10-01・docs/ai-routing.md）', () => {
  // 円 = USD × 160 × 1.1（AI_USD_JPY・AI_API_TAX_RATE の既定）
  const yen = (mjpy) => mjpy / 1000;
  it('gpt-5-mini: 入力 3,500・出力 1,300 ≈ ¥0.61（Haiku 4.5 の約 1/3）', () => {
    const g = costFromUsage('gpt-5-mini', { input_tokens: 3500, output_tokens: 1300 });
    // (3500*0.25 + 1300*2)/1e6 = $0.003475 → ¥0.6116
    expect(yen(g)).toBeCloseTo(0.612, 2);
    const h = costFromUsage('claude-haiku-4-5', { input_tokens: 3500, output_tokens: 1300 });
    expect(g / h).toBeLessThan(0.4);
  });
  it('gemini-3.1-flash-lite: 入力 2,000・出力 350 ≈ ¥0.18', () => {
    // (2000*0.25 + 350*1.5)/1e6 = $0.001025 → ¥0.1804
    expect(yen(costFromUsage('gemini-3.1-flash-lite', { input_tokens: 2000, output_tokens: 350 }))).toBeCloseTo(0.18, 2);
  });
  it('キャッシュ読み出しは 1/10（OpenAI・Google）', () => {
    expect(costFromUsage('gpt-5-mini', { cache_read_input_tokens: 100000 })).toBe(costFromUsage('gpt-5-mini', { input_tokens: 10000 }));
    expect(costFromUsage('gemini-3.1-flash-lite', { cache_read_input_tokens: 100000 })).toBe(costFromUsage('gemini-3.1-flash-lite', { input_tokens: 10000 }));
  });
  it('Sonnet 5.5 は Sonnet 5 と同じ単価', () => {
    expect(PRICES['claude-sonnet-5-5']).toEqual(PRICES['claude-sonnet-5']);
  });
  it('日付つきの版の名前でも数える・いちばん長く一致する名前', () => {
    expect(priceFor('gpt-5-mini-2025-08-07')).toBe(PRICES['gpt-5-mini']);
    expect(priceFor('gpt-5.4-mini-2026-03-17')).toBe(PRICES['gpt-5.4-mini']);
    expect(priceFor('claude-haiku-4-5-20251001')).toBe(PRICES['claude-haiku-4-5']);
    expect(priceFor('claude-sonnet-5-5-20260901')).toBe(PRICES['claude-sonnet-5-5']);
    expect(priceFor('gemini-3.1-flash-lite-preview-06-17')).toBe(PRICES['gemini-3.1-flash-lite']);
    expect(hasPrice('gpt-5-minimal')).toBe(false);
  });
  it('分からない名前は表でいちばん高い単価（別名が高いモデルに変わっても少なく数えない）', () => {
    const p = priceFor('gpt-5.5-mini');
    expect(p.in).toBe(Math.max(...Object.values(PRICES).map((x) => x.in)));
    expect(p.out).toBe(Math.max(...Object.values(PRICES).map((x) => x.out)));
  });
  it('見積もりは会社ごとの単価で、実額より上振れ', () => {
    const est = estimateCost('gpt-5-mini', { textChars: 2500, maxTokens: 1600 });
    const actual = costFromUsage('gpt-5-mini', { input_tokens: 3500, output_tokens: 1300 });
    expect(est.total).toBeGreaterThan(actual);
    expect(est.total).toBeLessThan(estimateCost('claude-haiku-4-5', { textChars: 2500, maxTokens: 1600 }).total);
  });
});

describe('createUsageSniffer: message_delta の入力の数（OpenAI / Google を直した答え）とモデル名', () => {
  it('message_start の見積もりを、最後の message_delta の実際の数で上書きする', () => {
    const s = createUsageSniffer();
    const ev = (o) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
    s.push(ev({ type: 'message_start', message: { model: 'gpt-5-mini-2025-08-07', usage: { input_tokens: 9999, output_tokens: 0 } } }));
    s.push(ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 3000, cache_read_input_tokens: 500, output_tokens: 700 } }));
    expect(s.meta.model).toBe('gpt-5-mini-2025-08-07');
    expect(s.usage).toMatchObject({ input_tokens: 3000, cache_read_input_tokens: 500, output_tokens: 700 });
  });
  it('Anthropic の message_delta（output_tokens だけ）では入力の数を変えない', () => {
    const s = createUsageSniffer();
    const ev = (o) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
    s.push(ev({ type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 1 } } }));
    s.push(ev({ type: 'message_delta', usage: { output_tokens: 42 } }));
    expect(s.usage).toMatchObject({ input_tokens: 120, output_tokens: 42 });
    expect(s.meta.model).toBe(null);
  });
});
