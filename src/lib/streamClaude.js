// Streaming client for /api/claude.
//
// callClaude() in ./ai.js still serves callers that need the whole response
// as a string (analysis, ROI summary, advisor → setup conversion, helpAi).
// This module is for chat-style surfaces (AI 選書 / マイ読書脳 / 読書計画
// シート) where TTFT — the first visible token — drives perceived speed.
//
// onChunk(fullText, delta) fires for every content_block_delta the server
// emits. onDone(finalText, meta) fires once when the stream completes —
// meta = { stopReason, aborted, refund }。refund は相談で「関係するメモが無い」と答えたとき、
// サーバーがトークンを返した知らせ（message_stop のあとの独自の枠 orime_token_refund・
// { reason: 'no_info', tokens }。無ければ null）。stopReason は Anthropic の message_delta から
// 捕捉した停止理由（'end_turn' | 'max_tokens' | 'refusal' | null）。呼び出し側は
// 'max_tokens'（出力上限で途中切れ）を検知して「保存しない/注記を出す」等の
// 判断ができる（従来は切り詰めが完全に無音だった）。onError receives any
// thrown error (network, non-OK status).
//
// Abort: pass an AbortSignal as `signal`. When the caller aborts mid-stream we
// treat it as a *normal* early finish — the partial text collected so far is
// kept, onDone(fullText) fires (NOT onError), and the resolved value is the
// partial text. This lets the UI keep whatever was generated up to the stop.
// The returned promise resolves after onDone (or onError) runs so callers can
// await the whole exchange when convenient.

import { supabase, isSupabaseConfigured } from './supabase';
import { isPaywallError, requestPaywall, paywallReasonFor, notifyAiUsed } from './freeTrial';
import { MODEL_SMART } from './models';
import { apiUrl } from './apiUrl';

const DEFAULT_MODEL = MODEL_SMART;
const DEFAULT_MAX_TOKENS = 2048;

// fetch() rejects with a DOMException named 'AbortError' when the attached
// AbortSignal fires. We also defensively check signal.aborted in case the
// rejection surfaces as a plain Error in some runtimes.
function isAbortError(e, signal) {
  if (signal && signal.aborted) return true;
  if (!e) return false;
  return e.name === 'AbortError' || e.code === 20 || e.code === 'ABORT_ERR';
}

async function getAccessToken() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

// プロンプトキャッシュ用の content-block ラップ。src/lib/ai.js の cachedSystem
// と同じ形（api/claude.js の sanitizeCachedSystemBlocks が受理する形）。
// 完全に固定文言のシステムプロンプトにだけ使う — ここでは import で ai.js に
// 依存させたくない（streamClaude.js は ai.js から呼ばれる側）ため同じ形をローカルに複製。
function cachedSystemBlock(text) {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

function buildPayload({ system, messages, model, max_tokens, temperature, cacheSystem, purpose }) {
  const payload = {
    model: model || DEFAULT_MODEL,
    max_tokens: max_tokens || DEFAULT_MAX_TOKENS,
    messages: messages || [],
    stream: true,
  };
  // 用途（'consult' など）。サーバーが用途ごとのモデルを env で差し替えるための目印
  // （AI_CONSULT_MODEL。アプリを出し直さずに安いモデルへ切り替えられる）。
  if (purpose) payload.purpose = purpose;
  if (system) payload.system = cacheSystem ? cachedSystemBlock(system) : system;
  // ⚠️ temperature は payload に含めない。sonnet-5 / haiku-4-5 世代は sampling
  // params を受け付けず 400（「deprecated for this model」）になる。引数は後方
  // 互換で受けるが無視する（呼び出し側の分割代入シグネチャは変更しない）。
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
  cacheSystem,
  purpose,
  signal,
  onChunk,
  onDone,
  onError,
} = {}) {
  let fullText = '';
  let stopReason = null;
  let sawStop = false; // message_stop が届いたか（届かずに切れた＝通信が途中で切れた）
  let refund = null; // サーバーがトークンを返した知らせ（orime_token_refund・相談で関係するメモが無かったとき）
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('AI機能を使うにはログインが必要です。');
    }

    const res = await fetch(apiUrl('/api/claude'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(buildPayload({ system, messages, model, max_tokens, temperature, cacheSystem, purpose })),
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
      if (isPaywallError(res.status, errorCode)) {
        requestPaywall(paywallReasonFor(errorCode));
        const err = new Error(detail || 'この AI 機能は、プランでご利用いただけます。');
        err.paywall = true; // 呼び出し側はエラーの案内を重ねて出さない
        err.code = errorCode; // 'free_limit_reached'（今月の無料のトークン）/ 'plan_required'
        throw err;
      }
      if (res.status === 429) {
        // 月次上限超過（回数・原価）はサーバーの具体文言を優先。それ以外の 429 は汎用文言。
        if ((errorCode === 'monthly_limit_exceeded' || errorCode === 'monthly_budget_exceeded') && detail) {
          const err = new Error(detail);
          err.monthlyLimit = true; // 呼び出し側は「エラー」ではなく案内として見せる（トークンの上限）
          throw err;
        }
        const err = new Error('リクエストが多すぎます。少し時間をおいて、やり直してください。');
        err.notCharged = true;
        throw err;
      }
      // 中継が答えを始める前に失敗を返した（上流の失敗・通信の失敗）: サーバーは予約した回数と原価を
      // 戻している（api/claude.js の releaseMonthlyUsage / settleCost(null)）。画面で「トークンは使っていません」と言える印。
      const err = new Error(detail ? `エラー: ${detail}` : `エラー (${res.status})`);
      err.notCharged = true;
      throw err;
    }

    if (!res.body) {
      throw new Error('ストリーミング応答を取得できませんでした。');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      // Aborting cancels reader.read() (it rejects with AbortError, handled in
      // the outer catch). Checking signal.aborted here gives us a clean,
      // synchronous early exit between reads as a belt-and-braces guard.
      if (signal?.aborted) break;
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        let event = null;
        try {
          event = JSON.parse(data);
        } catch {
          // 行分割は `lines.pop()` の再バッファで完結行しかここに来ないため、
          // parse 失敗 = relay が混ぜた異常行。再バッファすると以後の全 read で
          // 同じ行の parse 失敗が無限に繰り返される（過去実装の罠）ので、警告して捨てる。
          // eslint-disable-next-line no-console
          console.warn('[streamClaude] unparsable SSE line (skipped)');
          continue;
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const delta = event.delta.text || '';
          if (!delta) continue;
          fullText += delta;
          try { onChunk?.(fullText, delta); } catch { /* swallow render errors */ }
        } else if (event.type === 'message_stop') {
          sawStop = true;
        } else if (event.type === 'orime_token_refund') {
          // message_stop のあとに届く。答えは変えず、知らせだけを onDone に渡す。
          refund = { reason: String(event.reason || ''), tokens: Number(event.tokens) || 0 };
        } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
          // 停止理由（end_turn / max_tokens / refusal 等）を捕捉して onDone で通知。
          stopReason = event.delta.stop_reason;
        } else if (event.type === 'error' && event.error) {
          // 上流の英語のエラー（Overloaded など）はそのまま見せない。
          throw new Error(event.error.type === 'overloaded_error'
            ? 'AI サービスが混み合っています。少し時間をおいて、もう一度お試しください。'
            : 'AI の答えが途中で止まりました。もう一度お試しください。');
        }
      }
    }

    // 終わりの合図（message_stop / 停止理由）が届かずに切れた＝通信が途中で切れた。
    // 途中までの答えを「完成」として保存しないよう、エラーとして扱う（2026-09-27）。
    if (!sawStop && !stopReason && !signal?.aborted) {
      throw new Error('AI の答えが途中で途切れました。通信の状態を確かめて、もう一度お試しください。');
    }
    // 安全機構で答えを控えた（refusal）ときは、空や途中の答えを保存しないようエラーにする。
    if (stopReason === 'refusal') {
      throw new Error('AI が今回の内容への回答を控えました。表現を変えて再度お試しください。');
    }
    notifyAiUsed();
    onDone?.(fullText, { stopReason, aborted: false, refund });
    return fullText;
  } catch (e) {
    // User-initiated abort: not an error. Keep the partial text, fire onDone
    // (so the same completion path runs), and resolve with what we have.
    if (isAbortError(e, signal)) {
      try { onDone?.(fullText, { stopReason, aborted: true, refund }); } catch { /* swallow */ }
      return fullText;
    }
    if (onError) {
      try { onError(e); } catch { /* swallow */ }
    } else if (!e?.monthlyLimit && !e?.paywall) {
      // Surface in console so silent stalls don't go unnoticed in dev.
      // 月の上限・プラン案内は想定内の結果なのでエラーとして出さない。
      // eslint-disable-next-line no-console
      console.error('[streamClaude] error:', e);
    }
    throw e;
  }
}

export default streamClaude;
