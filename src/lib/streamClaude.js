// Streaming client for /api/claude.
//
// callClaude() in ./ai.js still serves callers that need the whole response
// as a string (analysis, ROI summary, advisor → setup conversion, helpAi).
// This module is for chat-style surfaces (AI 選書 / マイ読書脳 / 読書計画
// シート) where TTFT — the first visible token — drives perceived speed.
//
// onChunk(fullText, delta) fires for every content_block_delta the server
// emits. onDone(finalText) fires once when the stream completes. onError
// receives any thrown error (network, non-OK status, abort). The returned
// promise resolves after onDone (or onError) runs so callers can await the
// whole exchange when convenient.

import { supabase, isSupabaseConfigured } from './supabase';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 2048;

async function getAccessToken() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

function buildPayload({ system, messages, model, max_tokens, temperature }) {
  const payload = {
    model: model || DEFAULT_MODEL,
    max_tokens: max_tokens || DEFAULT_MAX_TOKENS,
    messages: messages || [],
    stream: true,
  };
  if (system) payload.system = system;
  if (typeof temperature === 'number') payload.temperature = temperature;
  return payload;
}

// Anthropic SSE frames look like:
//   event: content_block_delta
//   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
//
// We only care about text_delta events for incremental display. message_stop
// is the natural terminator; the relay closes the stream right after it.
export async function streamClaude({
  system,
  messages,
  model,
  max_tokens,
  temperature,
  signal,
  onChunk,
  onDone,
  onError,
} = {}) {
  let fullText = '';
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('AI機能を使うにはログインが必要です。');
    }

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(buildPayload({ system, messages, model, max_tokens, temperature })),
      signal,
    });

    if (!res.ok) {
      // Error path: relay returns plain JSON, not SSE.
      let detail = '';
      let errorCode = '';
      try {
        const j = await res.json();
        detail = j?.error?.message || j?.error || '';
        errorCode = j?.error_code || '';
      } catch { /* fallthrough */ }
      if (res.status === 401) throw new Error('AI機能を使うにはログインが必要です。');
      if (res.status === 429) {
        // 月次上限超過はサーバーの具体文言を優先。それ以外の 429 は汎用文言。
        if (errorCode === 'monthly_limit_exceeded' && detail) throw new Error(detail);
        throw new Error('リクエストが多すぎます。少し時間をおいて再試行してください。');
      }
      throw new Error(detail ? `エラー: ${detail}` : `エラー (${res.status})`);
    }

    if (!res.body) {
      throw new Error('ストリーミング応答を取得できませんでした。');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const delta = event.delta.text || '';
            if (!delta) continue;
            fullText += delta;
            try { onChunk?.(fullText, delta); } catch { /* swallow render errors */ }
          } else if (event.type === 'error' && event.error?.message) {
            throw new Error(`エラー: ${event.error.message}`);
          }
        } catch (parseErr) {
          // A chunk boundary can split a JSON event in half. Re-buffer the
          // partial line and continue — the rest will arrive next read.
          if (parseErr instanceof SyntaxError) {
            buffer = `${line}\n${buffer}`;
            continue;
          }
          throw parseErr;
        }
      }
    }

    onDone?.(fullText);
    return fullText;
  } catch (e) {
    if (onError) {
      try { onError(e); } catch { /* swallow */ }
    } else {
      // Surface in console so silent stalls don't go unnoticed in dev.
      // eslint-disable-next-line no-console
      console.error('[streamClaude] error:', e);
    }
    throw e;
  }
}

export default streamClaude;
