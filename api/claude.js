import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const MAX_TOKENS_DEFAULT = 4096;
const MAX_TOKENS_HARD_CAP = 8192;

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

    const payload = { ...body, max_tokens: maxTokens };

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
    console.error('Claude API error:', error);
    return res.status(500).json({ error: 'API request failed' });
  }
}
