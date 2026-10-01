// api/_providers.js — 各社の答えを Anthropic の形に直すところを、偽の fetch で確かめる（本物の API は呼ばない）。
import { describe, it, expect, vi } from 'vitest';
import {
  openRoute, ProviderError, toOpenAIRequest, toGeminiRequest, anthropicBody, openAiReasoningEffort,
  usageFromOpenAI, usageFromGemini, systemText,
} from './_providers.js';
import { createUsageSniffer, costFromUsage } from './_aiCost.js';

const ENV = { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'g-test', ANTHROPIC_API_KEY: 'a-test', AI_PROVIDER_FIRST_OUTPUT_MS: '200', AI_PROVIDER_TIMEOUT_MS: '200' };
const BASE = { max_tokens: 500, system: [{ type: 'text', text: 'あなたは職人です。', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'メモを凝縮して' }] };

// 文字列を小さな塊に割って流す（塊の境目で日本語や行が割れても正しく読めるか）。
function chunkedStream(text, size = 7) {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) { c.close(); return; }
      c.enqueue(bytes.slice(i, i + size));
      i += size;
    },
  });
}
const sseResponse = (frames) => new Response(chunkedStream(frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('')), {
  status: 200, headers: { 'content-type': 'text/event-stream' },
});
async function readAll(response) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let out = '';
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}
// アプリ（src/lib/streamClaude.js）と同じ読み方で、文字・停止理由・message_stop を拾う。
function clientParse(sseText) {
  let text = '';
  let stop = null;
  let sawStop = false;
  let error = null;
  for (const line of sseText.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const ev = JSON.parse(line.slice(5).trim());
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text;
    else if (ev.type === 'message_stop') sawStop = true;
    else if (ev.type === 'message_delta' && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
    else if (ev.type === 'error') error = ev.error;
  }
  return { text, stop, sawStop, error };
}

describe('送る中身の形', () => {
  it('OpenAI: system は developer・画像は data URL・推論は最小・保存しない・usage を受け取る', () => {
    const body = toOpenAIRequest({
      model: 'gpt-5-mini',
      ...BASE,
      stream: true,
      messages: [
        { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: '書き起こして' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'はい' }] },
        { role: 'user', content: 'つづき' },
      ],
    }, {});
    expect(body.messages[0]).toEqual({ role: 'developer', content: 'あなたは職人です。' });
    expect(body.messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
    expect(body.messages[2]).toEqual({ role: 'assistant', content: 'はい' });
    expect(body.messages[3]).toEqual({ role: 'user', content: 'つづき' });
    expect(body).toMatchObject({ max_completion_tokens: 500, reasoning_effort: 'minimal', store: false, stream: true, stream_options: { include_usage: true } });
    expect(body.temperature).toBeUndefined();
  });
  it('OpenAI の推論の強さ: gpt-5-mini は minimal・gpt-5.4-mini は none・env で上書き', () => {
    expect(openAiReasoningEffort('gpt-5-mini', {})).toBe('minimal');
    expect(openAiReasoningEffort('gpt-5-mini-2025-08-07', {})).toBe('minimal');
    expect(openAiReasoningEffort('gpt-5.4-mini', {})).toBe('none');
    expect(openAiReasoningEffort('gpt-5-mini', { AI_OPENAI_REASONING_EFFORT: 'low' })).toBe('low');
    expect(openAiReasoningEffort('gpt-5-mini', { AI_OPENAI_REASONING_EFFORT: 'bogus' })).toBe('minimal');
  });
  it('Gemini: systemInstruction・画像は inlineData・同じ役が続けば 1 つに・安全設定は送らない', () => {
    const body = toGeminiRequest({
      ...BASE,
      messages: [
        { role: 'user', content: 'これまでの読書' },
        { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } }, { type: 'text', text: '書き起こして' }] },
        { role: 'assistant', content: 'はい' },
      ],
    });
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'あなたは職人です。' }] });
    expect(body.contents).toHaveLength(2);
    expect(body.contents[0].parts).toEqual([{ text: 'これまでの読書' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }, { text: '書き起こして' }]);
    expect(body.contents[1]).toEqual({ role: 'model', parts: [{ text: 'はい' }] });
    expect(body.generationConfig).toEqual({ maxOutputTokens: 500 });
    expect(body.safetySettings).toBeUndefined();
  });
  it('systemText は文字列でもブロックでも', () => {
    expect(systemText('a')).toBe('a');
    expect(systemText([{ text: 'a' }, { text: 'b' }])).toBe('a\n\nb');
    expect(systemText(undefined)).toBe('');
  });
  it('Anthropic: Sonnet 5 は disabled・Sonnet 5.5 は between_tools・Haiku は thinking なし', () => {
    expect(anthropicBody('claude-sonnet-5', { max_tokens: 1 }).thinking).toEqual({ type: 'disabled' });
    expect(anthropicBody('claude-sonnet-5-5', { max_tokens: 1 }).thinking).toEqual({ type: 'between_tools' });
    expect(anthropicBody('claude-haiku-4-5', { max_tokens: 1, thinking: { type: 'enabled' } }).thinking).toBeUndefined();
  });
});

describe('usage を Anthropic の形に', () => {
  it('OpenAI: キャッシュ分を入力から分ける・推論は出力に入っている', () => {
    expect(usageFromOpenAI({ prompt_tokens: 3000, completion_tokens: 900, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens_details: { reasoning_tokens: 40 } }))
      .toEqual({ input_tokens: 2000, cache_read_input_tokens: 1000, output_tokens: 900 });
  });
  it('Gemini: 考えた分も出力に足す', () => {
    expect(usageFromGemini({ promptTokenCount: 2500, candidatesTokenCount: 300, thoughtsTokenCount: 50, cachedContentTokenCount: 500 }))
      .toEqual({ input_tokens: 2000, cache_read_input_tokens: 500, output_tokens: 350 });
  });
});

describe('OpenAI のストリームを Anthropic の SSE に直す', () => {
  const frames = [
    { id: 'c1', model: 'gpt-5-mini-2025-08-07', choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
    { id: 'c1', model: 'gpt-5-mini-2025-08-07', choices: [{ index: 0, delta: { content: '## 🎯 読み方' } }] },
    { id: 'c1', model: 'gpt-5-mini-2025-08-07', choices: [{ index: 0, delta: { content: 'の戦略\n- 一つ目' } }] },
    { id: 'c1', model: 'gpt-5-mini-2025-08-07', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    { id: 'c1', model: 'gpt-5-mini-2025-08-07', choices: [], usage: { prompt_tokens: 3500, completion_tokens: 1300, prompt_tokens_details: { cached_tokens: 0 } } },
    '[DONE]',
  ];
  it('文字・停止理由・usage・message_stop がアプリと中継の両方で読める', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(frames));
    const r = await openRoute({ provider: 'openai', model: 'gpt-5-mini', base: { ...BASE, stream: true }, env: ENV, estimatedInputTokens: 1234, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('gpt-5-mini-2025-08-07');
    expect(r.response.headers.get('content-type')).toContain('text/event-stream');
    const text = await readAll(r.response);
    expect(clientParse(text)).toEqual({ text: '## 🎯 読み方の戦略\n- 一つ目', stop: 'end_turn', sawStop: true, error: null });
    // 中継の精算（createUsageSniffer）は、最後の message_delta の入力の数で見積もりを上書きする
    const s = createUsageSniffer();
    s.push(new TextEncoder().encode(text));
    expect(s.meta.model).toBe('gpt-5-mini-2025-08-07');
    expect(s.usage).toMatchObject({ seenStart: true, seenDelta: true, input_tokens: 3500, output_tokens: 1300 });
    expect(s.answer).toMatchObject({ stopped: true, stopReason: 'end_turn' });
    expect(costFromUsage(s.meta.model, s.usage)).toBe(costFromUsage('gpt-5-mini', { input_tokens: 3500, output_tokens: 1300 }));
  });
  it('長さの上限 → max_tokens', async () => {
    const f = [frames[1], { choices: [{ delta: {}, finish_reason: 'length' }] }, '[DONE]'];
    const r = await openRoute({ provider: 'openai', model: 'gpt-5-mini', base: { ...BASE, stream: true }, env: ENV, fetchImpl: async () => sseResponse(f) });
    expect(clientParse(await readAll(r.response)).stop).toBe('max_tokens');
  });
  it('書き始めたあとに切れた → event: error（message_stop なし＝アプリは途中で止まったと見る）', async () => {
    const enc = new TextEncoder();
    let n = 0;
    const body = new ReadableStream({
      pull(c) {
        n += 1;
        if (n === 1) c.enqueue(enc.encode(`data: ${JSON.stringify(frames[1])}\n\n`));
        else c.error(new Error('socket hang up'));
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await openRoute({ provider: 'openai', model: 'gpt-5-mini', base: { ...BASE, stream: true }, env: ENV, fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }) });
    const parsed = clientParse(await readAll(r.response));
    expect(parsed.text).toBe('## 🎯 読み方');
    expect(parsed.sawStop).toBe(false);
    expect(parsed.error).toMatchObject({ type: 'api_error' });
    warn.mockRestore();
  });
  it('終わりの合図が無いまま閉じた → message_stop を送らない', async () => {
    const r = await openRoute({ provider: 'openai', model: 'gpt-5-mini', base: { ...BASE, stream: true }, env: ENV, fetchImpl: async () => sseResponse([frames[1]]) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(clientParse(await readAll(r.response))).toMatchObject({ sawStop: false, stop: null });
    warn.mockRestore();
  });
});

describe('Gemini のストリームを Anthropic の SSE に直す', () => {
  it('文字・停止理由・usage（考えた分は出力に）', async () => {
    const f = [
      { candidates: [{ content: { role: 'model', parts: [{ text: '本質だけ' }] } }], usageMetadata: { promptTokenCount: 900 }, modelVersion: 'gemini-3.1-flash-lite' },
      { candidates: [{ content: { role: 'model', parts: [{ text: '考えています', thought: true }, { text: 'を残す。' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, thoughtsTokenCount: 10 }, modelVersion: 'gemini-3.1-flash-lite' },
    ];
    const fetchImpl = vi.fn(async () => sseResponse(f));
    const r = await openRoute({ provider: 'gemini', model: 'gemini-3.1-flash-lite', base: { ...BASE, stream: true }, env: ENV, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse');
    expect(init.headers['x-goog-api-key']).toBe('g-test');
    const text = await readAll(r.response);
    expect(clientParse(text)).toEqual({ text: '本質だけを残す。', stop: 'end_turn', sawStop: true, error: null });
    const s = createUsageSniffer();
    s.push(text);
    expect(s.usage).toMatchObject({ input_tokens: 900, output_tokens: 50 });
  });
});

describe('答える前の失敗は ProviderError（中継が Claude に切り替える）', () => {
  const run = (provider, fetchImpl, stream = true) => openRoute({ provider, model: provider === 'openai' ? 'gpt-5-mini' : 'gemini-3.1-flash-lite', base: { ...BASE, stream }, env: ENV, fetchImpl });
  it('HTTP の失敗（429 / 500 / 401）', async () => {
    for (const status of [429, 500, 401]) {
      const err = await run('openai', async () => new Response('{"error":{}}', { status })).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err).toMatchObject({ status, reason: 'status', provider: 'openai' });
    }
  });
  it('鍵が無い', async () => {
    const err = await openRoute({ provider: 'gemini', model: 'gemini-3.1-flash-lite', base: BASE, env: {}, fetchImpl: vi.fn() }).catch((e) => e);
    expect(err).toMatchObject({ reason: 'no_key' });
  });
  it('つながらない', async () => {
    const err = await run('gemini', async () => { throw new TypeError('fetch failed'); }).catch((e) => e);
    expect(err).toMatchObject({ reason: 'network' });
  });
  it('Gemini が安全の止めで 1 文字も返さない（ストリーム・ストリームでない）', async () => {
    const blocked = { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } };
    const e1 = await run('gemini', async () => sseResponse([blocked])).catch((e) => e);
    expect(e1).toMatchObject({ reason: 'blocked' });
    const e2 = await run('gemini', async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }), { status: 200 }), false).catch((e) => e);
    expect(e2).toMatchObject({ reason: 'blocked' });
  });
  it('OpenAI が断った（refusal）', async () => {
    const e = await run('openai', async () => sseResponse([{ choices: [{ delta: { refusal: 'I can’t help' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }])).catch((x) => x);
    expect(e).toMatchObject({ reason: 'blocked' });
  });
  it('空のまま終わった', async () => {
    const e = await run('openai', async () => sseResponse(['[DONE]'])).catch((x) => x);
    expect(e).toMatchObject({ reason: 'empty' });
  });
  it('最初の文字が時間内に来ない', async () => {
    const fetchImpl = (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason || new Error('aborted')));
    });
    const e = await run('openai', fetchImpl).catch((x) => x);
    expect(e).toMatchObject({ reason: 'timeout' });
  });
  it('アプリが切ったときは ProviderError ではなく、そのまま中断（Claude に切り替えない）', async () => {
    const ac = new AbortController();
    const fetchImpl = (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
      setTimeout(() => ac.abort(), 10);
    });
    const e = await openRoute({ provider: 'openai', model: 'gpt-5-mini', base: { ...BASE, stream: true }, env: ENV, signal: ac.signal, fetchImpl }).catch((x) => x);
    expect(e).not.toBeInstanceOf(ProviderError);
    expect(e.name).toBe('AbortError');
  });
  it('読めない写真の空の書き起こし（正常な終わり）は、空の答えとして返す', async () => {
    const r = await run('gemini', async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }], usageMetadata: { promptTokenCount: 1300, candidatesTokenCount: 0 } }), { status: 200 }), false);
    const data = await r.response.json();
    expect(data).toMatchObject({ type: 'message', content: [{ type: 'text', text: '' }], stop_reason: 'end_turn', usage: { input_tokens: 1300, output_tokens: 0 } });
  });
});

describe('ストリームでない答えは Anthropic の JSON に', () => {
  it('OpenAI', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      model: 'gpt-5-mini-2025-08-07',
      choices: [{ message: { role: 'assistant', content: '{"done":false,"questions":[]}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2500, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 1200 } },
    }), { status: 200 });
    const r = await openRoute({ provider: 'openai', model: 'gpt-5-mini', base: BASE, env: ENV, fetchImpl });
    const data = await r.response.json();
    expect(data).toMatchObject({
      type: 'message', role: 'assistant', model: 'gpt-5-mini-2025-08-07', stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"done":false,"questions":[]}' }],
      usage: { input_tokens: 1300, cache_read_input_tokens: 1200, output_tokens: 400 },
    });
  });
});

describe('Anthropic は素通し・404 なら 1 回だけ別のモデル', () => {
  it('claude-sonnet-5-5 が無ければ claude-sonnet-5（thinking は disabled に）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bodies = [];
    const fetchImpl = vi.fn(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1 ? new Response('{}', { status: 404 }) : new Response('{"content":[]}', { status: 200 });
    });
    const r = await openRoute({ provider: 'anthropic', model: 'claude-sonnet-5-5', base: BASE, env: ENV, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(bodies[0]).toMatchObject({ model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' } });
    expect(bodies[1]).toMatchObject({ model: 'claude-sonnet-5', thinking: { type: 'disabled' } });
    expect(r.model).toBe('claude-sonnet-5');
    warn.mockRestore();
  });
});
