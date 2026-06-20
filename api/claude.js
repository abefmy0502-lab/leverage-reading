import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const MAX_TOKENS_DEFAULT = 4096;
const MAX_TOKENS_HARD_CAP = 8192;

// 🛡️ 中継の濫用対策。クライアントから来た body をそのまま Anthropic へ
// 流すと、認証済みユーザーが任意の高価なモデルや巨大ペイロードを送って
// ANTHROPIC_API_KEY のコストを増幅できてしまう。サーバー側で payload を
// 「許可されたモデル + 上限付きの messages/system」だけで再構築する。
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-20250514',
]);
const MAX_MESSAGES = 50;
const MAX_TOTAL_CONTENT_CHARS = 200000;
const MAX_SYSTEM_CHARS = 20000;

// messages[].content は文字列、または Anthropic の content-block 配列
// ({ type:'text', text }) の両方を許容する。合計文字数を概算する。
function contentLength(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce(
      (n, block) => n + (block && typeof block.text === 'string' ? block.text.length : 0),
      0,
    );
  }
  return 0;
}

// In-memory rate limit (per serverless instance — sufficient for low volume).
const rateLimitStore = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const arr = rateLimitStore.get(userId) || [];
  const recent = arr.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000)
    );
    return { ok: false, retryAfter };
  }
  recent.push(now);
  rateLimitStore.set(userId, recent);
  return { ok: true };
}

let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  supabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase server credentials not configured' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  const userId = userData.user.id;

  const rl = checkRateLimit(userId);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too Many Requests', retry_after: rl.retryAfter });
  }

  try {
    const body = req.body || {};
    const requestedTokens = Number.isFinite(body.max_tokens)
      ? Math.max(1, Math.floor(body.max_tokens))
      : MAX_TOKENS_DEFAULT;
    const maxTokens = Math.min(requestedTokens, MAX_TOKENS_HARD_CAP);
    const wantsStream = body.stream === true;

    // --- payload をサーバー側で厳格に再構築 (クライアントの任意フィールドを
    //     そのまま Anthropic へ転送しない) ---
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return res.status(400).json({ error: 'messages is required' });
    }
    if (messages.length > MAX_MESSAGES) {
      return res.status(413).json({ error: 'Too many messages' });
    }
    const totalChars = messages.reduce((n, m) => n + contentLength(m?.content), 0);
    if (totalChars > MAX_TOTAL_CONTENT_CHARS) {
      return res.status(413).json({ error: 'Request payload too large' });
    }

    // 許可モデル以外はデフォルトに矯正 (拒否ではなく矯正 = アプリを壊さず濫用だけ防ぐ)
    const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

    const payload = { model, max_tokens: maxTokens, messages };
    if (typeof body.system === 'string' && body.system.trim()) {
      payload.system = body.system.slice(0, MAX_SYSTEM_CHARS);
    }
    if (typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 1) {
      payload.temperature = body.temperature;
    }
    if (wantsStream) payload.stream = true;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    // Streaming pass-through: forward Anthropic's SSE body verbatim to the
    // browser so the first token reaches the client without buffering the
    // entire response. Upstream errors arrive as JSON, not SSE — detect by
    // content-type and short-circuit so the client still sees a normal
    // error body.
    if (wantsStream && response.ok && response.body) {
      const upstreamType = response.headers.get('content-type') || '';
      if (upstreamType.includes('text/event-stream')) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        // Vercel-specific: tell the edge layer not to buffer.
        res.setHeader('X-Accel-Buffering', 'no');
        res.status(response.status);
        // flushHeaders fires the response headers immediately so the
        // browser knows to start reading; without it some proxies hold the
        // first chunk back.
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        const reader = response.body.getReader();
        try {
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) break;
            if (value) res.write(Buffer.from(value));
          }
        } catch (streamErr) {
          console.error('Claude stream relay error:', streamErr);
        } finally {
          try { res.end(); } catch { /* socket may already be closed */ }
        }
        return;
      }
    }

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    // ログには message のみ (payload にユーザーメモ全文が含まれるため本体は出さない)
    console.error('Claude API error:', error?.message || 'unknown');
    return res.status(500).json({ error: 'API request failed' });
  }
}
