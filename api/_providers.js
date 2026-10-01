// 🔌 AI の会社ごとの呼び出し（Anthropic / OpenAI / Google Gemini）。api/claude.js から使う。
// 名前が _ で始まるので Vercel の関数にはならない（Hobby は関数 12 個まで）。
//
// どの会社の答えも、アプリ（src/lib/ai.js・src/lib/streamClaude.js）がそのまま読める Anthropic の形に直して返す:
//   - ストリーム: SSE の message_start → content_block_start → content_block_delta（text_delta）…
//                → content_block_stop → message_delta（stop_reason と usage）→ message_stop
//                途中で上流が失敗したら event: error を流して閉じる（message_stop は送らない＝アプリは「途中で止まりました」）。
//   - ストリームでない: { type:'message', model, content:[{type:'text',text}], stop_reason, usage }
//   - usage は Anthropic の形（input_tokens・cache_read_input_tokens・output_tokens）に直す（原価は api/_aiCost.js が数える）。
// 停止理由: 最後まで → 'end_turn'、長さの上限 → 'max_tokens'、安全のための止め → 'refusal'。
//
// OpenAI / Google が「答えを 1 文字も返す前に」失敗した（鍵が違う・429・5xx・時間切れ・安全の止めで空・ストリームが空で終わった）
// ときは ProviderError を投げる。api/claude.js はそれを見て、その用途の Claude に 1 回だけ切り替える。
// ログには会社・モデル・HTTP の番号・理由だけを書く（メモや質問の中身は書かない）。
//
// SDK は使わない（fetch だけ・新しい依存を増やさない）。鍵はサーバーの env だけ（OPENAI_API_KEY / GEMINI_API_KEY）。

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// 最初の文字が届くまでの上限（ストリーム）と、ストリームでない呼び出しの上限。過ぎたら Claude に切り替える。
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
export function providerTimeouts(env = process.env) {
  return {
    firstOutputMs: num(env.AI_PROVIDER_FIRST_OUTPUT_MS, 20000),
    totalMs: num(env.AI_PROVIDER_TIMEOUT_MS, 45000),
  };
}

export class ProviderError extends Error {
  constructor(message, { provider, model, status = 0, reason = 'error' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.reason = reason;
  }
}

// ───────────────────────── 共通: 送る中身を各社の形へ ─────────────────────────

// system（文字列 or [{type:'text',text,cache_control}]）を 1 つの文字列に。
export function systemText(system) {
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return system.map((b) => (typeof b?.text === 'string' ? b.text : '')).filter(Boolean).join('\n\n');
  return '';
}

// メッセージの中身を [{kind:'text',text}|{kind:'image',mediaType,data}] に。
function parts(content) {
  if (typeof content === 'string') return [{ kind: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (b?.type === 'text' && typeof b.text === 'string') out.push({ kind: 'text', text: b.text });
    else if (b?.type === 'image' && b.source?.type === 'base64') out.push({ kind: 'image', mediaType: b.source.media_type, data: b.source.data });
  }
  return out;
}

// OpenAI の推論の強さ。gpt-5 / gpt-5-mini / gpt-5-nano は 'minimal'、それより新しい（gpt-5.1 以降）は 'none'。
export function openAiReasoningEffort(model, env = process.env) {
  const v = String(env.AI_OPENAI_REASONING_EFFORT || '').trim();
  if (['none', 'minimal', 'low', 'medium', 'high'].includes(v)) return v;
  return /^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(model) ? 'minimal' : 'none';
}

export function toOpenAIRequest({ model, system, messages = [], max_tokens, stream }, env = process.env) {
  const msgs = [];
  const sys = systemText(system);
  // GPT-5 系では system の代わりに developer（同じ役割・こちらが推奨）。
  if (sys) msgs.push({ role: 'developer', content: sys });
  for (const m of messages) {
    const ps = parts(m.content);
    if (m.role === 'assistant') {
      const text = ps.filter((p) => p.kind === 'text').map((p) => p.text).join('\n');
      if (text) msgs.push({ role: 'assistant', content: text });
      continue;
    }
    if (ps.every((p) => p.kind === 'text')) {
      msgs.push({ role: 'user', content: ps.map((p) => p.text).join('\n') });
    } else {
      msgs.push({
        role: 'user',
        content: ps.map((p) => (p.kind === 'text'
          ? { type: 'text', text: p.text }
          : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } })),
      });
    }
  }
  const body = {
    model,
    messages: msgs,
    // 推論のトークンもこの上限に入る（'minimal' / 'none' ではほとんど使わない）。
    max_completion_tokens: max_tokens,
    reasoning_effort: openAiReasoningEffort(model, env),
    store: false, // 会話を OpenAI 側に保存しない（評価・蒸留用の保存をしない）
  };
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true }; // 最後のチャンクで usage を受け取る
  }
  return body;
}

export function toGeminiRequest({ system, messages = [], max_tokens }) {
  const contents = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const ps = parts(m.content).map((p) => (p.kind === 'text'
      ? { text: p.text }
      : { inlineData: { mimeType: p.mediaType, data: p.data } }));
    if (!ps.length) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...ps); // 同じ役が続くときは 1 つにまとめる
    else contents.push({ role, parts: ps });
  }
  const body = { contents, generationConfig: { maxOutputTokens: max_tokens } };
  const sys = systemText(system);
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  // thinkingConfig は送らない: gemini-3.1-flash-lite の考える強さの既定は MINIMAL（いちばん少ない）。
  // safetySettings も送らない: Gemini 2.5 / 3 の既定は OFF（本の文章をふつうに扱える）。
  //   外せない止め（PROHIBITED_CONTENT など）で答えが空なら ProviderError → Claude へ。
  return body;
}

// ───────────────────────── 共通: 各社の答えを Anthropic の形へ ─────────────────────────

const STOP_OPENAI = { stop: 'end_turn', length: 'max_tokens', content_filter: 'refusal' };
function stopFromGemini(reason) {
  if (!reason) return null;
  if (reason === 'STOP') return 'end_turn';
  if (reason === 'MAX_TOKENS') return 'max_tokens';
  return 'refusal'; // SAFETY / RECITATION / BLOCKLIST / PROHIBITED_CONTENT / SPII / OTHER など
}

const fin = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

export function usageFromOpenAI(u) {
  if (!u || typeof u !== 'object') return null;
  const cached = fin(u.prompt_tokens_details?.cached_tokens);
  return {
    input_tokens: Math.max(0, fin(u.prompt_tokens) - cached),
    cache_read_input_tokens: cached,
    output_tokens: fin(u.completion_tokens), // 推論のトークンを含む
  };
}

export function usageFromGemini(u) {
  if (!u || typeof u !== 'object') return null;
  const cached = fin(u.cachedContentTokenCount);
  return {
    input_tokens: Math.max(0, fin(u.promptTokenCount) - cached),
    cache_read_input_tokens: cached,
    output_tokens: fin(u.candidatesTokenCount) + fin(u.thoughtsTokenCount), // 考える分も出力の単価
  };
}

// 1 チャンク（JSON）を { text, stop, usage, model, blocked } に。
export function parseOpenAIChunk(j) {
  const c = Array.isArray(j?.choices) ? j.choices[0] : null;
  const delta = c?.delta || c?.message || {};
  return {
    text: typeof delta.content === 'string' ? delta.content : '',
    refusal: typeof delta.refusal === 'string' && delta.refusal ? delta.refusal : '',
    stop: c?.finish_reason ? (STOP_OPENAI[c.finish_reason] || 'end_turn') : null,
    usage: j?.usage ? usageFromOpenAI(j.usage) : null,
    model: typeof j?.model === 'string' ? j.model : null,
  };
}

export function parseGeminiChunk(j) {
  const c = Array.isArray(j?.candidates) ? j.candidates[0] : null;
  const text = Array.isArray(c?.content?.parts)
    ? c.content.parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('')
    : '';
  const blocked = j?.promptFeedback?.blockReason ? String(j.promptFeedback.blockReason) : '';
  return {
    text,
    refusal: blocked,
    stop: blocked ? 'refusal' : stopFromGemini(c?.finishReason),
    usage: j?.usageMetadata ? usageFromGemini(j.usageMetadata) : null,
    model: typeof j?.modelVersion === 'string' ? j.modelVersion : null,
  };
}

const sse = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

function anthropicMessage({ model, text, stop, usage }) {
  return {
    id: `msg_${Math.random().toString(36).slice(2, 14)}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: stop || 'end_turn',
    stop_sequence: null,
    usage: usage || { input_tokens: 0, output_tokens: 0 },
  };
}

// ───────────────────────── 呼び出し ─────────────────────────

function linkedController(parent, ms) {
  const own = new AbortController();
  const timer = ms ? setTimeout(() => own.abort(new Error('timeout')), ms) : null;
  const signal = parent ? AbortSignal.any([parent, own.signal]) : own.signal;
  return { own, signal, clear: () => { if (timer) clearTimeout(timer); } };
}

const isAbort = (e, parent) => !!parent?.aborted || e?.name === 'AbortError';

function endpointFor(provider, model, stream) {
  if (provider === 'openai') return OPENAI_URL;
  const m = encodeURIComponent(model);
  return stream ? `${GEMINI_BASE}/${m}:streamGenerateContent?alt=sse` : `${GEMINI_BASE}/${m}:generateContent`;
}

function headersFor(provider, key) {
  if (provider === 'openai') return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  return { 'Content-Type': 'application/json', 'x-goog-api-key': key };
}

// SSE の本文から data: の JSON を 1 つずつ取り出す。
async function* sseJson(reader) {
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]' || raw[0] !== '{') continue;
      try { yield JSON.parse(raw); } catch { /* 壊れた行は読み飛ばす */ }
    }
    if (buf.length > 1_000_000) buf = '';
  }
}

// OpenAI / Gemini をストリームで呼び、Anthropic の SSE に直した Response を返す。
// 最初の文字が届くまで待ってから返すので、それまでの失敗は ProviderError（＝Claude へ切り替えられる）。
// estimatedInputTokens: message_start に入れておく入力の見積もり（途中で切れたときの精算用。最後に実際の数で上書き）。
async function openStream({ provider, model, key, body, signal, timeouts, estimatedInputTokens, fetchImpl }) {
  const parse = provider === 'openai' ? parseOpenAIChunk : parseGeminiChunk;
  const ctl = linkedController(signal, timeouts.firstOutputMs);
  let res;
  try {
    res = await fetchImpl(endpointFor(provider, model, true), {
      method: 'POST', headers: headersFor(provider, key), body: JSON.stringify(body), signal: ctl.signal,
    });
  } catch (e) {
    ctl.clear();
    if (isAbort(e, signal)) throw e;
    throw new ProviderError('fetch failed', { provider, model, reason: ctl.own.signal.aborted ? 'timeout' : 'network' });
  }
  if (!res.ok || !res.body) {
    ctl.clear();
    try { await res.body?.cancel(); } catch { /* no-op */ }
    throw new ProviderError('upstream status', { provider, model, status: res.status, reason: 'status' });
  }

  const reader = res.body.getReader();
  const it = sseJson(reader);
  let servedModel = model;
  let stop = null;
  let usage = null;
  let refusal = '';
  let first = '';
  try {
    // 最初の文字（または終わり）まで読む。
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await it.next();
      if (done) break;
      const c = parse(value);
      if (c.model) servedModel = c.model;
      if (c.usage) usage = c.usage;
      if (c.refusal) refusal = c.refusal;
      if (c.stop) stop = c.stop;
      if (c.text) { first = c.text; break; }
    }
  } catch (e) {
    ctl.clear();
    try { reader.cancel(); } catch { /* no-op */ }
    if (isAbort(e, signal)) throw e;
    throw new ProviderError('stream failed before output', { provider, model, reason: ctl.own.signal.aborted ? 'timeout' : 'stream' });
  }
  ctl.clear(); // 最初の文字が届いた（または終わった）。ここから先は時間で切らない（アプリの切断は signal で届く）
  if (!first) {
    // 1 文字も無いまま終わった。正常な終わり（読めない写真＝空の書き起こし など）だけは、そのまま空の答えとして返す。
    if (refusal || stop === 'refusal' || !stop) {
      throw new ProviderError('empty or blocked', { provider, model, reason: refusal || stop === 'refusal' ? 'blocked' : 'empty' });
    }
  }

  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      const push = (s) => controller.enqueue(enc.encode(s));
      push(sse('message_start', {
        message: {
          id: `msg_${Math.random().toString(36).slice(2, 14)}`,
          type: 'message', role: 'assistant', model: servedModel, content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: Math.max(0, Math.floor(estimatedInputTokens || 0)), output_tokens: 0 },
        },
      }));
      push(sse('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }));
      if (first) push(sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text: first } }));
      try {
        // 止まる理由が届いたあとも最後まで読む（OpenAI は usage が最後の別のチャンクで来る）。
        for await (const value of it) {
          const c = parse(value);
          if (c.usage) usage = c.usage;
          if (c.text) push(sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text: c.text } }));
          if (c.stop) stop = c.stop;
        }
      } catch (e) {
        if (isAbort(e, signal)) { controller.error(e); return; }
        console.warn(`[ai-provider] ${provider}:${model} stream broke after output`);
        push(sse('error', { error: { type: 'api_error', message: 'upstream stream error' } }));
        controller.close();
        return;
      }
      if (!stop) {
        // 終わりの合図が無いまま切れた。Anthropic の途中切れと同じく message_stop を送らない（アプリは途中切れとして扱う）。
        console.warn(`[ai-provider] ${provider}:${model} stream ended without finish reason`);
        controller.close();
        return;
      }
      push(sse('content_block_stop', { index: 0 }));
      push(sse('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, ...(usage ? { usage } : {}) }));
      push(sse('message_stop', {}));
      controller.close();
    },
    cancel() {
      try { reader.cancel(); } catch { /* no-op */ }
    },
  });
  return {
    response: new Response(out, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } }),
    model: servedModel,
  };
}

async function openJson({ provider, model, key, body, signal, timeouts, fetchImpl }) {
  const parse = provider === 'openai' ? parseOpenAIChunk : parseGeminiChunk;
  const ctl = linkedController(signal, timeouts.totalMs);
  let data;
  try {
    const res = await fetchImpl(endpointFor(provider, model, false), {
      method: 'POST', headers: headersFor(provider, key), body: JSON.stringify(body), signal: ctl.signal,
    });
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* no-op */ }
      throw new ProviderError('upstream status', { provider, model, status: res.status, reason: 'status' });
    }
    data = await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (isAbort(e, signal)) throw e;
    throw new ProviderError('request failed', { provider, model, reason: ctl.own.signal.aborted ? 'timeout' : 'network' });
  } finally {
    ctl.clear();
  }
  const c = parse(data);
  if (!c.text && (c.refusal || c.stop === 'refusal' || !c.stop)) {
    throw new ProviderError('empty or blocked', { provider, model, reason: c.refusal || c.stop === 'refusal' ? 'blocked' : 'empty' });
  }
  const msg = anthropicMessage({ model: c.model || model, text: c.text, stop: c.stop, usage: c.usage });
  return {
    response: new Response(JSON.stringify(msg), { status: 200, headers: { 'content-type': 'application/json' } }),
    model: c.model || model,
  };
}

// Anthropic: 本文はそのまま（中継は今までどおり素通し）。
//   claude-sonnet-5 は thinking を省くと考える（adaptive）のが既定なので { type: 'disabled' } を明示する。
//   claude-sonnet-5-5 は 'disabled' が 400 になるので、いちばん少ない { type: 'between_tools' }
//   （道具を使わない本アプリでは「考えない」と同じ。effort は既定の high のまま＝この設定で使える範囲）。
//   haiku-4-5 / sonnet-4-6 は省くと考えない。
// 指定のモデルが 404（このアカウントで使えない）のときは、実績のあるモデルで 1 回だけやり直す
// （claude-sonnet-5-5 → claude-sonnet-5、ほか → claude-sonnet-4-6）。
export const ANTHROPIC_404_FALLBACK = { 'claude-sonnet-5-5': 'claude-sonnet-5' };
const ANTHROPIC_LAST_RESORT = 'claude-sonnet-4-6';

export function anthropicBody(model, base) {
  const body = { ...base, model };
  delete body.thinking;
  if (model === 'claude-sonnet-5') body.thinking = { type: 'disabled' };
  if (model === 'claude-sonnet-5-5') body.thinking = { type: 'between_tools' };
  return body;
}

async function openAnthropic({ model, base, apiKey, signal, fetchImpl }) {
  const call = (m) => fetchImpl(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(anthropicBody(m, base)),
    signal,
  });
  let served = model;
  let response = await call(served);
  if (response && response.status === 404 && served !== ANTHROPIC_LAST_RESORT) {
    const next = ANTHROPIC_404_FALLBACK[served] || ANTHROPIC_LAST_RESORT;
    console.warn('[claude] model not found, falling back:', served, '→', next);
    try { await response.body?.cancel(); } catch { /* no-op */ }
    served = next;
    response = await call(served);
  }
  return { response, model: served };
}

// 行き先（provider / model）で呼ぶ。base は中継が整えた { max_tokens, system, messages, stream? }（Anthropic の形）。
// 戻り値 { response, model, provider }。response は Anthropic の形（OpenAI / Gemini は直したもの）。
export async function openRoute({ provider, model, base, signal, env = process.env, estimatedInputTokens = 0, fetchImpl = fetch } = {}) {
  if (provider === 'anthropic') {
    const r = await openAnthropic({ model, base, apiKey: env.ANTHROPIC_API_KEY, signal, fetchImpl });
    return { ...r, provider };
  }
  const key = provider === 'openai' ? env.OPENAI_API_KEY : provider === 'gemini' ? env.GEMINI_API_KEY : null;
  if (!key) throw new ProviderError('missing key', { provider, model, reason: 'no_key' });
  const req = { model, ...base };
  const body = provider === 'openai' ? toOpenAIRequest(req, env) : toGeminiRequest(req);
  const timeouts = providerTimeouts(env);
  const r = base.stream
    ? await openStream({ provider, model, key, body, signal, timeouts, estimatedInputTokens, fetchImpl })
    : await openJson({ provider, model, key, body, signal, timeouts, fetchImpl });
  return { ...r, provider };
}
